import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { svelte } from '@sveltejs/vite-plugin-svelte';


export default defineConfig({
    plugins: [
        svelte(),
        // viteStaticCopy({
        //     targets: [
        //         { src: '../src/bindings/*', dest: 'public' },
        //     ]
        // }),
    ],
    // enable COEP etc
    appType: 'mpa',
    resolve: {
        dedupe: ['three'],
    },
    server: {
        fs: {
            allow: ['..'],
        },
        headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
        }
    },
});
