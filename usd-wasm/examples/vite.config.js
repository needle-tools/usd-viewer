import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';


export default defineConfig({
    plugins: [
        svelte(),
    ],
    // enable COEP etc
    appType: 'mpa',
    resolve: {
        dedupe: ['three'],
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
