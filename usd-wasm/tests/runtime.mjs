import { getUsdModule as loadModule } from '../src/bindings/index.js';

// Run the same feature assertions with either native runtime, in fresh processes.
export function getUsdModule(options) {
    return loadModule({ ...options, asyncRuntime: process.env.USD_TEST_RUNTIME || 'asyncify' });
}
