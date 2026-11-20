import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { needleUSD } from '@needle-tools/usd/vite';


export default defineConfig({
    plugins: [
        svelte(),
        needleUSD(),
    ],
    // enable COEP etc
    appType: 'mpa',
    resolve: {
        dedupe: ['three', '@needle-tools/engine', '@needle-tools/materialx'],
    },
    build: {
        rollupOptions: {
            input: {
                index: 'index.html',
                repl: 'repl.html',
            },
        },
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
