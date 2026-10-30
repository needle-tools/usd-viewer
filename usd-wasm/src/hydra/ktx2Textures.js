import { REVISION, DataTexture, Source, RGBAFormat } from 'three';

/** Own lazy Basis workers. Pixel-remapped maps use a separate RGBA transcoder;
 * ordinary color maps retain GPU compression and the container's color space. */
export class Ktx2Textures {
  constructor(renderer, transcoderPath) {
    this.renderer = renderer; this.transcoderPath = transcoderPath;
    this.loaders = new Set(); this.promises = new Map(); this.pending = new Set(); this.disposed = false;
  }
  async loader(readable) {
    if (this.disposed) throw new Error('USD texture registry is disposed.');
    if (!this.promises.has(readable)) this.promises.set(readable, (async () => {
      if (!this.transcoderPath && Number.parseInt(REVISION) < 185) {
        throw new Error('KTX2 on this Three.js version requires ktx2TranscoderPath pointing to its self-hosted basis/ decoder files.');
      }
      const {KTX2Loader} = await import('three/addons/loaders/KTX2Loader.js');
      const loader = new KTX2Loader().setWorkerLimit(2);
      try {
        if (this.transcoderPath) loader.setTranscoderPath(this.transcoderPath);
        if (readable) {
          // Request RGBA32 for CPU channel/normal remapping without depending
          // on the current GPU's preferred compressed format.
          loader.detectSupport({extensions: {has: () => false}, capabilities: {isWebGL2: false}});
        } else {
          if (!this.renderer) throw new Error('KTX2 texture loading requires the host renderer.');
          if (this.renderer.isWebGPURenderer) await this.renderer.init();
          loader.detectSupport(this.renderer);
        }
        if (this.disposed) throw new Error('USD texture registry is disposed.');
        this.loaders.add(loader); return loader;
      } catch (error) { loader.dispose(); throw error; }
    })());
    return this.promises.get(readable);
  }
  async load(url, readable = false) {
    const loader = await this.loader(readable);
    if (this.disposed) throw new Error('USD texture registry is disposed.');
    const pending = loader.loadAsync(url); this.pending.add(pending);
    try {
      const texture = await pending;
      if (readable && texture.isCompressedTexture && texture.format === RGBAFormat) {
        const first = texture.mipmaps[0];
        const decoded = new DataTexture().copy(texture);
        decoded.source = new Source({data:first.data, width:first.width, height:first.height});
        decoded.mipmaps = texture.mipmaps;
        decoded.needsUpdate = true; texture.dispose(); return decoded;
      }
      return texture;
    }
    finally { this.pending.delete(pending); if (this.disposed) this.release(); }
  }
  release() {
    // Terminating a Basis worker mid-task strands its promise. Let owned tasks
    // settle before terminating workers; the registry releases late textures.
    if (this.pending.size) return;
    for (const loader of this.loaders) loader.dispose();
    this.loaders.clear();
  }
  dispose() { this.disposed = true; this.release(); }
}
