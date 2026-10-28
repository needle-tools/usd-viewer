import path from 'node:path';
import { mergeConfig } from 'vite';
import shared from '../three-matrix/vite.config.js';

const directory = new URL('.', import.meta.url).pathname;
export default mergeConfig(shared, {
    cacheDir: path.join(directory, '../../node_modules/.vite-strokes'),
    resolve: { dedupe: ['three', '@needle-tools/materialx'] },
    optimizeDeps: { entries: [path.join(directory, 'strokes.html')], include: ['three', '@needle-tools/materialx'] },
    server: { hmr: false },
});
