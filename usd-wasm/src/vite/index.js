const packageRoot = decodeURIComponent(new URL('../..', import.meta.url).pathname);

/** @type {{ name: string, config(config: any): any | Promise<any>, configureServer(server: any): void }} */
const crossOriginIsolatedPlugin = {
    name: 'needle:usd-crossoriginisolated',
    config: async (config) => {
        const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '/';
        const allow = config.server?.fs?.allow ?? [cwd];
        let packageRootRealPath = packageRoot;
        try {
            const { realpathSync } = await import("node:fs");
            packageRootRealPath = realpathSync(packageRoot);
        } catch {
            // The plugin can be re-exported from the browser package entry; only
            // Vite's Node config phase needs realpath expansion.
        }
        return {
            server: {
                fs: {
                    allow: [...new Set([...allow, packageRoot, packageRootRealPath])],
                },
            },
        };
    },
    configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            next();
        });
    }
};


/**
 * Needle USD plugin for vite. 
 * This plugin sets the Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * @returns {Array<{ name: string, config(config: any): any | Promise<any>, configureServer(server: any): void }>} plugins
 */
export function needleUSD() {
    return [crossOriginIsolatedPlugin]
}
