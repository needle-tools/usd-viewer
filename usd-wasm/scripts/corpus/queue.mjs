// Keep large imports from competing for peak memory while allowing smaller
// assets to occupy the remaining browser workers.
export function createAssetQueue(assets) {
	const pending = [...assets], waiters = [];
	let largeActive = false;
	const isLarge = asset => (asset.sizes?.composedWithTexturesBytes || 0) >= 500 * 1024 ** 2 || (asset.geometry?.triangles || 0) >= 2_000_000;
	return async function take() {
		while (pending.length) {
			const index = pending.findIndex(asset => !largeActive || !isLarge(asset));
			if (index < 0) {await new Promise(resolve => waiters.push(resolve)); continue;}
			const [asset] = pending.splice(index, 1), large = isLarge(asset);
			if (large) largeActive = true;
			let released = false;
			return {asset, release() {
				if (released) return;
				released = true;
				if (large) largeActive = false;
				for (const wake of waiters.splice(0)) wake();
			}};
		}
		return null;
	};
}
