import {closeSync, createReadStream, createWriteStream, openSync, writeSync} from 'node:fs';
import {mkdtemp, rename, rm, stat} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {exportSimreadyGltf} from './simready.js';

/** Write GLB buffers to scratch storage while Three processes the scene. */
export async function exportSimreadyGltfToFile(options, destination) {
 const path = resolve(destination);
 const directory = await mkdtemp(join(dirname(path), '.usd-glb-'));
 const binaryPath = join(directory, 'buffers.bin');
 const outputPath = join(directory, 'result.glb');
 const pending = new Set();
 let fd;
 const write = (bytes, offset) => {
  let written = 0;
  while (written < bytes.byteLength) {
   options.signal?.throwIfAborted();
   const count = writeSync(fd, bytes, written, bytes.byteLength - written, offset + written);
   if (!count) throw new Error('Could not write the GLB buffer.');
   written += count;
  }
 };
 try {
  fd = openSync(binaryPath, 'wx');
  const binarySpool = {
   append(part, offset) {
    if (!(part instanceof Blob)) {
     write(ArrayBuffer.isView(part) ? part : new Uint8Array(part), offset);
     return;
    }
    const task = (async () => {
     let position = offset;
     for await (const bytes of part.stream()) {
      write(bytes, position);
      position += bytes.byteLength;
     }
    })();
    pending.add(task);
    const remove = () => pending.delete(task);
    task.then(remove, remove);
    return task;
   },
   async writeGlb(prefix, padding, expected) {
    closeSync(fd);
    fd = undefined;
    if ((await stat(binaryPath)).size !== expected) throw new Error('The GLB buffer spool has an unexpected size.');
    async function* parts() {
     yield* prefix;
     yield* createReadStream(binaryPath, {highWaterMark: 1024 * 1024});
     if (padding.length) yield padding;
    }
    await pipeline(parts(), createWriteStream(outputPath, {flags: 'wx'}), {signal: options.signal});
   },
  };
  await exportSimreadyGltf({...options, output: 'blob', binarySpool});
  options.signal?.throwIfAborted();
  await rename(outputPath, path);
 } finally {
  await Promise.allSettled(pending);
  if (fd !== undefined) closeSync(fd);
  await rm(directory, {recursive: true, force: true});
 }
}
