/** Keep authored graph names out of GLSL's reserved double-underscore namespace.
 * Rename declarations and MaterialX references together, before code generation. */
export function portableMaterialXNames(xml, target) {
	if (!xml.includes('__') || typeof DOMParser === 'undefined') return {xml, target};
	const document = new DOMParser().parseFromString(xml, 'application/xml');
	if (document.querySelector('parsererror')) return {xml, target};
	const elements = [...document.querySelectorAll('[name]')];
	const names = new Set(elements.map(element => element.getAttribute('name'))), mapping = new Map();
	for (const name of names) {
		if (!name.includes('__')) continue;
		let encoded = 'usdGraph' + [...new TextEncoder().encode(name)].map(byte => byte.toString(16).padStart(2, '0')).join('');
		while (names.has(encoded)) encoded += 'x';
		names.add(encoded); mapping.set(name, encoded);
	}
	if (!mapping.size) return {xml, target};
	const references = ['name', 'nodename', 'nodegraph', 'nodedef', 'interfacename', 'output', 'inherit', 'implementation'];
	for (const element of document.querySelectorAll('*')) for (const attribute of references) {
		if (!element.hasAttribute(attribute)) continue;
		const value = element.getAttribute(attribute);
		const renamed = value.split('/').map(part => mapping.get(part) || part).join('/');
		if (value !== renamed) element.setAttribute(attribute, renamed);
	}
	return {xml: new XMLSerializer().serializeToString(document), target: mapping.get(target) || target};
}
