import { Plugin } from "vite";


/**
 * Enable USD WASM support for vite based applications.
 * @example sveltekit
 * ```ts
 * import { needleUSD } from '@needle-tools/usd';
 * export default defineConfig(async ({ command }) => {
 *     return {
 *        plugins: [
 *           ...needleUSD(),
 *           sveltekit(),
 *       ],
 *    }
 * });
 * ```
 */
export declare function needleUSD(): Array<Plugin>;