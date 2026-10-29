/**
 * Shared loading and rendering for the icon-design scripts.
 *
 * Icon sources (--source):
 *   dir/            every *.svg file; name = file name without extension
 *   icons.json      { name: "<inner markup>" | { svg, label?, group? } }
 *   icons.(m)js/ts  module export (--export=ICONS, default ICONS then default)
 *                   with the same value shapes. Run .ts sources through `npx tsx`.
 *
 * An icon's svg may be inner markup or a whole <svg> element; a whole element's
 * viewBox overrides the grid for that icon.
 *
 * Style (--config=icon-design.config.json or flags):
 *   grid         viewBox units per side (default 16; one unit = 1px at 1x)
 *   strokeWidth  default 1.5
 *   css          class rules applied inside every icon (default convention below)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CLASS_CSS =
	'.f{fill:currentColor;stroke:none}.fs{fill:currentColor}.s{opacity:.7}.sf{fill:currentColor;stroke:none;opacity:.7}';

export function parseArgs(argv = process.argv.slice(2)) {
	return Object.fromEntries(argv.map((arg) => {
		const [key, ...value] = arg.replace(/^--/, '').split('=');
		return [key, value.join('=') || 'true'];
	}));
}

export async function loadConfig(args) {
	let fileConfig = {};
	const configPath = args.config ?? (await exists('icon-design.config.json') ? 'icon-design.config.json' : null);
	if (configPath) fileConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
	const config = {
		source: args.source ?? fileConfig.source,
		export: args.export ?? fileConfig.export,
		grid: Number(args.grid ?? fileConfig.grid ?? 16),
		strokeWidth: Number(args.stroke ?? fileConfig.strokeWidth ?? 1.5),
		css: fileConfig.css ?? DEFAULT_CLASS_CSS,
		theme: args.theme ?? fileConfig.theme,
		minGap: Number(args['min-gap'] ?? fileConfig.minGap ?? 1.25),
		edge: Number(args.edge ?? fileConfig.edge ?? 0.5),
	};
	if (!config.source) throw new Error('Pass --source=<svg dir | icons.json | module> or set "source" in icon-design.config.json');
	return config;
}

/** @returns {Promise<Array<{name: string, label: string, group: string, markup: string, viewBox: string}>>} */
export async function loadIcons(config, args = {}) {
	const source = path.resolve(config.source);
	const stat = await fs.stat(source);
	/** @type {Record<string, unknown>} */
	let raw = {};
	if (stat.isDirectory()) {
		for (const file of (await fs.readdir(source)).filter((f) => f.endsWith('.svg')).sort()) {
			raw[file.slice(0, -4)] = await fs.readFile(path.join(source, file), 'utf8');
		}
	} else if (source.endsWith('.json')) {
		raw = JSON.parse(await fs.readFile(source, 'utf8'));
	} else {
		const mod = await import(pathToFileURL(source).href);
		raw = mod[config.export ?? 'ICONS'] ?? mod.default;
		if (!raw) throw new Error(`${source} has no export "${config.export ?? 'ICONS'}" or default export`);
	}
	const only = args.icon ? new Set(String(args.icon).split(',')) : null;
	const groups = args.group ? new Set(String(args.group).split(',')) : null;
	const icons = [];
	for (const [name, value] of Object.entries(raw)) {
		const entry = typeof value === 'string' ? { svg: value } : /** @type {any} */ (value);
		if (!entry?.svg) continue;
		const { markup, viewBox } = unwrapSvg(String(entry.svg), config.grid);
		const icon = { name, label: entry.label ?? name, group: entry.group ?? '', markup, viewBox };
		if (only && !only.has(name)) continue;
		if (groups && !groups.has(icon.group)) continue;
		icons.push(icon);
	}
	return icons;
}

function unwrapSvg(svg, grid) {
	const match = svg.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
	if (!match) return { markup: svg, viewBox: `0 0 ${grid} ${grid}` };
	const viewBox = match[1].match(/viewBox="([^"]+)"/)?.[1] ?? `0 0 ${grid} ${grid}`;
	return { markup: match[2], viewBox };
}

/** Launch Chromium through the project's Playwright (resolved from cwd). */
export async function launchBrowser() {
	const require = createRequire(path.join(process.cwd(), 'noop.js'));
	let playwright;
	try {
		playwright = await import(pathToFileURL(require.resolve('playwright')).href);
	} catch {
		throw new Error('Playwright not found from the current directory. Run from a project that has it, or `npm i -D playwright && npx playwright install chromium`.');
	}
	const chromium = playwright.chromium ?? playwright.default?.chromium;
	return chromium.launch();
}

/**
 * Rasterize markup in the page into alpha masks. Returns Uint8Array per input
 * (1 = ink where alpha > threshold) or raw alpha when `alpha` is true.
 */
export async function rasterize(page, svgs, size, { alpha = false, threshold = 96 } = {}) {
	const result = await page.evaluate(async ({ svgs, size, alpha, threshold }) => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		const out = [];
		for (const svg of svgs) {
			const img = new Image();
			img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
			await img.decode();
			ctx.clearRect(0, 0, size, size);
			ctx.drawImage(img, 0, 0, size, size);
			const data = ctx.getImageData(0, 0, size, size).data;
			const values = new Array(size * size);
			for (let i = 0; i < values.length; i++) {
				values[i] = alpha ? data[i * 4 + 3] : (data[i * 4 + 3] > threshold ? 1 : 0);
			}
			out.push(values);
		}
		return out;
	}, { svgs, size, alpha, threshold });
	return result.map((values) => Uint8Array.from(values));
}

export async function writeOutput(file, data) {
	await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
	await fs.writeFile(file, data);
}

async function exists(file) {
	try { await fs.access(file); return true; } catch { return false; }
}
