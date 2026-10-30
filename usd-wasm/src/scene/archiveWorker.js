// A module worker keeps decompression, CRC calculation, compression and central
// directory assembly off the UI thread. Vendored import also works without an
// import map inside workers and from an installed/bundled SDK.
import {unzipSync, Zip, ZipDeflate} from '../vendor/fflate/fflate.js';

self.onmessage = ({data: bytes}) => {
  try {
    const entries = unzipSync(bytes), total = Object.values(entries).reduce((sum, value) => sum + value.length, 0);
    const chunks = []; let completed = 0, size = 0, last = 0;
    const report = () => {
      const now = performance.now();
      if (completed !== total && now - last < 50) return;
      last = now; self.postMessage({progress:{phase:'compressing',completed,total}});
    };
    const archive = new Zip((error, chunk, final) => {
      if (error) throw error;
      chunks.push(chunk); size += chunk.length;
      if (final) {
        const result = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        self.postMessage({bytes:result}, [result.buffer]);
      }
    });
    report();
    for (const [name, contents] of Object.entries(entries)) {
      const file = new ZipDeflate(name, {level:6}); archive.add(file);
      if (!contents.length) file.push(contents, true);
      for (let offset = 0; offset < contents.length; offset += 1024 * 1024) {
        const end = Math.min(offset + 1024 * 1024, contents.length);
        file.push(contents.subarray(offset, end), end === contents.length);
        completed += end - offset; report();
      }
    }
    archive.end();
  } catch (error) { self.postMessage({error: String(error?.message || error)}); }
};
