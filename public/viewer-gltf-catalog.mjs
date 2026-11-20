export const GLTF_SAMPLE_ASSETS_INDEX = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json';
const modelsRoot = new URL('./', GLTF_SAMPLE_ASSETS_INDEX);

export const originalGltfConverter = {
	id: 'original-gltf',
	label: 'Original glTF',
	name: 'Original glTF',
	title: 'Original glTF/GLB source asset',
};

export function normalizeModelKey(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function assetUrl(name, path) {
	return new URL([name, ...path.split('/')].map(encodeURIComponent).join('/'), modelsRoot).href;
}

export function mergeGltfSampleCards(entries, convertedCards) {
	const convertedByName = new Map();
	for (const card of convertedCards) {
		for (const name of [card.name, ...(card.catalogNames || [])]) {
			convertedByName.set(normalizeModelKey(name), card);
		}
	}
	const matched = new Set();
	const cards = [];
	for (const entry of entries) {
		if (!entry.name || !entry.variants) continue;
		const variant = ['glTF-Binary', 'glTF', 'glTF-Embedded', ...Object.keys(entry.variants)]
			.find(key => /\.(?:glb|gltf)$/i.test(entry.variants[key] || ''));
		if (!variant) continue;
		const original = assetUrl(entry.name, `${variant}/${entry.variants[variant]}`);
		const converted = convertedByName.get(normalizeModelKey(entry.name))
			|| convertedByName.get(normalizeModelKey(entry.label));
		if (converted) matched.add(converted);
		const order = [...(converted?.converterOrder || [])];
		if (!order.includes(originalGltfConverter.id)) order.push(originalGltfConverter.id);
		cards.push({
			...converted,
			name: converted?.name || entry.label || entry.name,
			catalogNames: [entry.name, entry.label],
			search: [converted?.search, entry.name, entry.label].filter(Boolean).join(' '),
			meta: converted?.meta || (entry.tags || []).join(' – '),
			thumbnail: converted?.thumbnail || (entry.screenshot ? assetUrl(entry.name, entry.screenshot) : undefined),
			url: converted?.url || original,
			conversions: {
				...converted?.conversions,
				[originalGltfConverter.id]: converted?.conversions?.[originalGltfConverter.id] || original,
			},
			converterOrder: order,
			converterMetadata: {...converted?.converterMetadata, [originalGltfConverter.id]: originalGltfConverter},
			tags: [...new Set([...(converted?.tags || []), ...(entry.tags || [])])],
		});
	}
	return [...cards, ...convertedCards.filter(card => !matched.has(card))];
}
