/** Collect custom implementations, including dependencies nested inside them. */
export async function materialXDefinitionsFor(registry, nodeDefNames, shaderPaths = []) {
    if (registry.disposed || !nodeDefNames.length || typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return '';
    const documents = [];
    const paths = new Set();
    // Resolver-loaded HTTP/package layers are not part of the upload inventory.
    // Read their authored source assets from this material's composed shaders.
    const stage = shaderPaths.length ? registry.config.driver()?.GetStage?.() : undefined;
    for (const path of shaderPaths) {
        let prim, attribute;
        try {
            prim = stage?.GetPrimAtPath(path);
            attribute = prim?.GetAttribute('info:mtlx:sourceAsset');
            const value = await attribute?.GetValueString?.();
            const asset = /^@([^@]+)@/.exec(value || '')?.[1];
            if (asset) paths.add(asset);
        } finally {
            attribute?.delete?.();prim?.delete?.();
        }
    }
    // Only the current material's source documents take part in its lookup.
    // Preserve upload-sidecar support for authored id-only custom shaders.
    if (!paths.size) for (const path of Array.isArray(registry.allPaths) ? registry.allPaths : []) paths.add(path);
    for (const path of paths) {
        if (registry.getResourceExtension(path) !== 'mtlx') continue;
        let xml = registry.materialXDefinitionCache.get(path);
        if (xml === undefined) {
            xml = await registry.readResourceText(path).catch(() => '');
            if (registry.disposed) return '';
            registry.materialXDefinitionCache.set(path, xml || '');
        }
        if (!xml) continue;
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) continue;
        documents.push(doc);
    }
    return collectMaterialXDefinitions(documents, nodeDefNames);
}

export function collectMaterialXDefinitions(documents, nodeDefNames) {
    const definitions = new Map();
    const categories = new Map();
    const implementations = new Map();
    for (const document of documents) {
        const elements = [...document.documentElement.children];
        for (const element of elements) {
            if (element.localName !== 'nodedef' || !element.hasAttribute('name')) continue;
            const name = element.getAttribute('name');
            if (!definitions.has(name)) definitions.set(name, element);
            const category = element.getAttribute('node');
            const names = categories.get(category) || new Set();
            names.add(name);categories.set(category, names);
        }
        for (const element of elements) {
            if (!['nodegraph', 'implementation'].includes(element.localName) || !element.hasAttribute('nodedef')) continue;
            const name = element.getAttribute('nodedef');
            const entries = implementations.get(name) || [];
            entries.push(element);
            if (element.localName === 'implementation' && element.hasAttribute('nodegraph')) {
                const graph = elements.find(e => e.localName === 'nodegraph' && e.getAttribute('name') === element.getAttribute('nodegraph'));
                if (graph) entries.push(graph);
            }
            implementations.set(name, entries);
        }
    }
    const queue = [...nodeDefNames];
    const visited = new Set();
    const selected = new Set();
    while (queue.length) {
        const name = queue.shift();
        if (visited.has(name)) continue;
        visited.add(name);
        const definition = definitions.get(name);
        if (!definition) continue;
        for (const element of [definition, ...(implementations.get(name) || [])]) {
            selected.add(element);
            const inheritance = element.getAttribute('inherit');
            if (inheritance) queue.push(inheritance);
            for (const child of element.querySelectorAll('*')) {
                const explicit = child.getAttribute('nodedef');
                if (explicit) queue.push(explicit);
                // Category references can select defaults or explicit versions.
                // Retain that family's definitions so MaterialX makes the choice.
                for (const dependency of categories.get(child.localName) || []) queue.push(dependency);
            }
        }
    }
    const serializer = new XMLSerializer();
    return [...selected].map(element => serializer.serializeToString(element)).join('\n');
}
