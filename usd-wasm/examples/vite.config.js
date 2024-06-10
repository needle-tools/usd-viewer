import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';


export default defineConfig({
    plugins: [
        viteStaticCopy({
            targets: [
                { src: '../src/bindings/*', dest: 'public' },
            ]
        }),
    ],
    // enable COEP etc
    server: {
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        }
    }
});