// GLTFExporter exposes writer data to plugins, but has no Blob output hook.
// Its binary finalizer reads the whole BIN and then the whole GLB through
// FileReader. Large downloads can fail on the second contiguous allocation.
// Keep Three's scene/material/image serialization and replace only the GLB
// container finalization, using its existing pending-work rejection path.
// This adapter intentionally depends on the same writer plugin internals as
// the SimReady exporter; compatibility tests cover supported Three versions.

const UINT32_MAX = 0xffffffff;
const align4 = size => Math.ceil(size / 4) * 4;

/** Finalize a binary glTF as a Blob or write it through a binary spool.
 * Register this after other exporter plugins. */
export async function parseGltfBlob(exporter, input, options = {}) {
 const {signal, binarySpool, ...exportOptions} = options;
 const complete = {};
 let result;
 const plugin = writer => {
  let spooledLength = 0;
  if (binarySpool) writer.processBuffer = part => {
   assertActive(signal);
   (writer.json.buffers ||= [{byteLength: 0}]);
   const size = part instanceof Blob ? part.size : part.byteLength;
   if (spooledLength + size > UINT32_MAX) throw new RangeError('GLB export exceeds its 32-bit container size limit.');
   const pending = binarySpool.append(part, spooledLength);
   if (pending) writer.pending.push(pending);
   spooledLength += size;
   return 0;
  };
  // Keep encoded images as Blob parts. Reading every image into an
  // ArrayBuffer first duplicates the largest part of texture-heavy exports.
  writer.processBufferViewImage = async blob => {
   assertActive(signal);
   const paddedLength = align4(blob.size);
   const part = paddedLength === blob.size ? blob : new Blob([blob, new Uint8Array(paddedLength - blob.size)]);
   const bufferView = {buffer: writer.processBuffer(part), byteOffset: writer.byteOffset, byteLength: paddedLength};
   writer.byteOffset += paddedLength;
   return (writer.json.bufferViews ||= []).push(bufferView) - 1;
  };
  return {
  name: 'USD_GLTF_BLOB_OUTPUT',
  afterParse() {
   // Start on the next microtask so the barrier is in pending before we scan
   // it, and other afterParse hooks can register their own asynchronous work.
   const barrier = Promise.resolve().then(async () => {
    const seen = new Set([barrier]);
    for (;;) {
     assertActive(signal);
     const pending = writer.pending.filter(item => !seen.has(item));
     if (!pending.length) break;
     for (const item of pending) seen.add(item);
     await waitForPending(pending, signal);
    }
    assertActive(signal);
    if (binarySpool && writer.buffers.length) throw new Error('A glTF plugin bypassed the binary spool.');
    result = await assembleGlb(writer, binarySpool, spooledLength);
    assertActive(signal);
    // Rejecting pending work prevents Three from running its ArrayBuffer
    // finalizer. Only this invocation's private identity means success.
    throw complete;
   });
   writer.pending.push(barrier);
  },
  };
 };
 assertActive(signal);
 exporter.register(plugin);
 try {
  await exporter.parseAsync(input, {...exportOptions, binary: true});
  throw new Error('GLTFExporter did not run the Blob output plugin.');
 } catch (error) {
  if (error !== complete) throw error;
  assertActive(signal);
  return result;
 } finally {
  exporter.unregister(plugin);
 }
}

function assertActive(signal) {
 if (signal?.aborted) throw signal.reason ?? new DOMException('Export cancelled', 'AbortError');
}

function waitForPending(pending, signal) {
 if (!signal) return Promise.all(pending);
 return new Promise((resolve, reject) => {
  const abort = () => {
   signal.removeEventListener('abort', abort);
   reject(signal.reason ?? new DOMException('Export cancelled', 'AbortError'));
  };
  signal.addEventListener('abort', abort, {once: true});
  Promise.all(pending).then(value => {
   signal.removeEventListener('abort', abort); resolve(value);
  }, error => {
   signal.removeEventListener('abort', abort); reject(error);
  });
  if (signal.aborted) abort();
 });
}

function assembleGlb(writer, binarySpool, spooledLength) {
 let binaryLength = spooledLength;
 for (const part of writer.buffers) {
  const size = part instanceof Blob ? part.size : part.byteLength;
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('GLTFExporter produced an invalid binary buffer.');
  binaryLength += size;
  if (binaryLength > UINT32_MAX) throw new RangeError('GLB export exceeds its 32-bit container size limit.');
 }
 const json = writer.json;
 const used = Object.keys(writer.extensionsUsed), required = Object.keys(writer.extensionsRequired);
 if (used.length) json.extensionsUsed = used;
 if (required.length) json.extensionsRequired = required;
 if (json.buffers?.length) json.buffers[0].byteLength = binaryLength;
 const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
 const jsonLength = align4(jsonBytes.byteLength), paddedBinaryLength = align4(binaryLength);
 const totalLength = 12 + 8 + jsonLength + 8 + paddedBinaryLength;
 if (totalLength > UINT32_MAX) throw new RangeError('GLB export exceeds its 32-bit container size limit.');
 const header = new Uint8Array(20), view = new DataView(header.buffer);
 view.setUint32(0, 0x46546c67, true); // glTF
 view.setUint32(4, 2, true);
 view.setUint32(8, totalLength, true);
 view.setUint32(12, jsonLength, true);
 view.setUint32(16, 0x4e4f534a, true); // JSON
 const binaryHeader = new Uint8Array(8), binaryView = new DataView(binaryHeader.buffer);
 binaryView.setUint32(0, paddedBinaryLength, true);
 binaryView.setUint32(4, 0x004e4942, true); // BIN\0
 const prefix = [header, jsonBytes, new Uint8Array(jsonLength - jsonBytes.byteLength).fill(0x20), binaryHeader];
 const padding = new Uint8Array(paddedBinaryLength - binaryLength);
 if (binarySpool) return binarySpool.writeGlb(prefix, padding, binaryLength);
 return new Blob([...prefix, ...writer.buffers, padding], {type: 'model/gltf-binary'});
}
