
/** @type {import('vite').Plugin} */
const viteServerConfig = {
    name: 'needle:vite-usd-crossoriginisolated',
    configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            next();
        });
    }
};


/**
 * @returns {Array<import('vite').Plugin>} plugins
 */
export function viteUSD() {
    return [viteServerConfig]
}