
/** @type {import('vite').Plugin} */
const crossOriginIsolatedPlugin = {
    name: 'needle:usd-crossoriginisolated',
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
 * @returns {Array<import('vite').Plugin>} plugins
 */
export function needleUSD() {
    return [crossOriginIsolatedPlugin]
}