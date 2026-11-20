export async function applyAssetProfile(handle, asset, setVariant) {
	for (const selection of asset.variantSelections ?? []) {
		await setVariant(handle, selection.path, selection.set, selection.value);
	}
	if (asset.variantSelections?.length) {
		await handle.ready();
		await handle.materialsReady();
	}
}

export function checkProfileApproximations(snapshot, asset) {
	if (!asset.expectedApproximations) return;
	const actual = {};
	for (const shape of snapshot.shapes) if (shape.type === 'mesh') {
		const mode = shape.approximation || 'none';
		actual[mode] = (actual[mode] ?? 0) + 1;
	}
	const sorted = value => JSON.stringify(Object.entries(value).sort());
	if (sorted(actual) !== sorted(asset.expectedApproximations)) {
		throw new Error('Selected profile collision approximations differ from the native inventory: ' + sorted(actual));
	}
}
