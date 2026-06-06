import path from "node:path";
import { defineConfig } from "vite";
import { getDefaultCacheRoot } from "@needle-tools/three-test-matrix";
import { rawFsServePlugin } from "@needle-tools/three-test-matrix/vite";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const sharedCacheRoot = getDefaultCacheRoot({ cwd: repoRoot });

export default defineConfig({
    appType: "mpa",
    plugins: [
        rawFsServePlugin({
            cacheRoots: [
                path.join(repoRoot, ".cache"),
                sharedCacheRoot,
            ],
            headers: {
                "Cross-Origin-Embedder-Policy": "require-corp",
                "Cross-Origin-Opener-Policy": "same-origin",
            },
        }),
    ],
    server: {
        headers: {
            "Cross-Origin-Embedder-Policy": "require-corp",
            "Cross-Origin-Opener-Policy": "same-origin",
        },
        fs: {
            allow: [
                repoRoot,
                sharedCacheRoot,
                path.parse(repoRoot).root,
            ],
        },
    },
});
