import { defineConfig } from 'vite';
import { needleUSD } from '@needle-tools/usd/vite';
export default defineConfig({ plugins: needleUSD(), resolve: { dedupe: ['three'] }, build: { assetsInlineLimit: 0 },
  preview: { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } } });
