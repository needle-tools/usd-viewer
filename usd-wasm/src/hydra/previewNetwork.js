function strings(vector) {
	if (!vector) return [];
	try {return Array.from({length: vector.size()}, (_, index) => vector.get(index));}
	finally {vector.delete?.();}
}

export function layerRelativeAsset(value, layer) {
	if (!value || !layer || /^[a-z]+:\/\//i.test(value) || value.startsWith('/')) return value;
	if (/^[a-z]+:\/\//i.test(layer)) return new URL(value, layer).href;
	const bracket = layer.indexOf('['), prefix = bracket < 0 ? '' : layer.slice(0, bracket + 1);
	const path = bracket < 0 ? layer : layer.slice(bracket + 1, -1);
	const parts = (path.slice(0, path.lastIndexOf('/') + 1) + value).split('/'), result = [];
	for (const part of parts) {
		if (part === '..' && result.length && result.at(-1) !== '..') result.pop();
		else if (part !== '.') result.push(part);
	}
	return prefix + result.join('/') + (bracket < 0 ? '' : ']');
}

/** Read the authored universal network for interchange, independently of the
 * preferred rendering context. Follow NodeGraph and material input forwarding. */
export async function readPreviewNetwork(stage, materialPath, time) {
	const nodes = {}, relationships = [], reading = new Set();
	async function property(path, seen = new Set()) {
		if (seen.has(path)) throw new Error('Cyclic USD material connection: ' + path);
		seen.add(path);
		const dot = path.lastIndexOf('.'), prim = stage.GetPrimAtPath(path.slice(0, dot));
		let attribute;
		try {
			if (!prim.IsValid()) return null;
			attribute = prim.GetAttribute(path.slice(dot + 1));
			if (!attribute.IsValid()) return null;
			const connections = strings(attribute.GetConnections());
			if (connections.length) return property(connections[0], seen);
			if (prim.GetTypeName() === 'Shader' && path.slice(dot + 1).startsWith('outputs:')) return {node: prim.GetPath(), output: path.slice(dot + 9)};
			return {value: await attribute.Get(time)};
		} finally {attribute?.delete?.(); prim.delete?.();}
	}
	async function shader(path) {
		if (nodes[path]) return;
		if (reading.has(path)) throw new Error('Cyclic USD shader graph: ' + path);
		reading.add(path);
		const prim = stage.GetPrimAtPath(path), attributes = prim.GetAttributes(), parameters = {};
		try {
			for (let index = 0; index < attributes.size(); index++) {
				const attribute = attributes.get(index);
				try {
					const name = attribute.GetName();
					if (name === 'info:id') {parameters.identifier = await attribute.Get(time); continue;}
					if (!name.startsWith('inputs:')) continue;
					const input = name.slice(7), connections = strings(attribute.GetConnections());
					let value = await attribute.Get(time);
					if (connections.length) {
						const upstream = await property(connections[0]);
						if (upstream?.node) {
							await shader(upstream.node);
							relationships.push({inputId: upstream.node, inputName: upstream.output, outputId: path, outputName: input});
						} else if (upstream) value = upstream.value;
					}
					if (value !== undefined) parameters[input] = value;
					const colorSpace = attribute.GetMetadata?.('colorSpace');
					if (colorSpace) parameters['colorSpace:' + input] = colorSpace;
					if (attribute.GetTypeName() === 'asset' && typeof value === 'string') {
						const stack = await attribute.GetPropertyStack(time), layer = stack[0]?.layer;
						parameters[input + ':resolvedPath'] = layerRelativeAsset(value, layer?.realPath || layer?.identifier);
					}
				} finally {attribute.delete?.();}
			}
			nodes[path] = parameters;
		} finally {attributes.delete?.(); prim.delete?.(); reading.delete(path);}
	}
	const surface = await property(materialPath + '.outputs:surface');
	if (!surface?.node) return null;
	await shader(surface.node);
	if (nodes[surface.node]?.identifier !== 'UsdPreviewSurface') return null;
	return {nodes, relationships};
}
