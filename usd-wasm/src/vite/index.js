
/** @type {import('vite').Plugin} */
const crossOriginIsolatedPlugin = {
    name: 'needle:vite-usd-crossoriginisolated',
    configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
            // res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            // const url = req.url;
            // if (url?.includes("emHdBindings")) {
            //     console.log(url);
            // }
            // else console.log("!! " + url)
            next();
        });
    }
};


/**
 * @returns {Array<import('vite').Plugin>} plugins
 */
export function needleUSD() {
    return [crossOriginIsolatedPlugin]
}