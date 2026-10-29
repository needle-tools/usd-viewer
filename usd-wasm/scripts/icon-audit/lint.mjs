#!/usr/bin/env node
/**
 * Icon clearance lint.
 *
 * Renders every part of every icon on its own (each SVG element, and each
 * absolute `M` subpath of a path) at high resolution with the production stroke,
 * then measures ink-to-ink distance between every pair of parts with an exact
 * Euclidean distance transform. Distances are in viewBox units; on a 16-unit
 * grid shown at 16px, one unit is one CSS pixel.
 *
 *   tight    0 < gap < min-gap   separate marks visually merge at real size
 *   edge     ink closer than --edge to the viewBox boundary (clipping, crowding)
 *   overlap  parts share ink: intended for joins (mark them class "j" or
 *            data-join), a bug for separate marks (listed with --all)
 *
 * A tight pair bridged by a third part they both touch (node–line–handle) reads
 * as one stroke and is not reported.
 *
 * Usage: node lint.mjs --source=<icons> [--icon=a,b] [--group=g] [--min-gap=1.25]
 *        [--edge=0.5] [--all] [--json=out.json]
 * Exit 1 on any tight or edge finding.
 */
import { parseArgs, loadConfig, loadIcons, launchBrowser, rasterize, writeOutput } from './lib.mjs';

const SCALE = 16; // raster px per viewBox unit

const args = parseArgs();
const config = await loadConfig(args);
const icons = await loadIcons(config, args);
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');

const report = [];
for (const icon of icons) {
	const [, , width, height] = icon.viewBox.split(/[\s,]+/).map(Number);
	const units = Math.max(width, height);
	const size = Math.round(units * SCALE);
	const parts = await page.evaluate((markup) => {
		const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
		const out = [];
		Array.from(doc.documentElement.children).forEach((el, index) => {
			if (el.tagName === 'style' || el.tagName === 'defs' || el.tagName === 'title') return;
			const join = el.hasAttribute('data-join') || (el.getAttribute('class') || '').split(/\s+/).includes('j');
			if (el.tagName === 'path') {
				const subpaths = (el.getAttribute('d') || '').split(/(?=M)/).map((s) => s.trim()).filter(Boolean);
				subpaths.forEach((sub, si) => {
					const clone = el.cloneNode();
					clone.setAttribute('d', sub);
					out.push({ label: `${index}:path${subpaths.length > 1 ? `[${si}]` : ''} ${sub.slice(0, 28)}`, markup: clone.outerHTML, join });
				});
			} else {
				out.push({ label: `${index}:${el.tagName}`, markup: el.outerHTML, join });
			}
		});
		return out;
	}, icon.markup);
	const svgs = parts.map((part) =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${icon.viewBox}" fill="none" stroke="#000" color="#000" stroke-width="${config.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><style>${config.css}</style>${part.markup}</svg>`);
	const masks = await rasterize(page, svgs, size, { threshold: 96 });
	const fields = masks.map((mask) => distanceTransform(mask, size));

	const n = parts.length;
	const gaps = Array.from({ length: n }, () => new Array(n).fill(Infinity));
	for (let a = 0; a < n; a++) {
		for (let b = a + 1; b < n; b++) {
			let min = Infinity;
			const ma = masks[a];
			const fb = fields[b];
			for (let i = 0; i < ma.length; i++) if (ma[i] && fb[i] < min) min = fb[i];
			gaps[a][b] = gaps[b][a] = Math.sqrt(min) / SCALE;
		}
	}
	const tight = [];
	const overlap = [];
	for (let a = 0; a < n; a++) {
		for (let b = a + 1; b < n; b++) {
			const gap = gaps[a][b];
			const join = parts[a].join || parts[b].join;
			if (gap === 0) {
				if (!join) overlap.push(`${parts[a].label}  ×  ${parts[b].label}`);
			} else if (gap < config.minGap && !join) {
				const bridged = parts.some((_, c) => c !== a && c !== b && gaps[a][c] === 0 && gaps[b][c] === 0);
				if (!bridged) tight.push(`${gap.toFixed(2)}u  ${parts[a].label}  ↔  ${parts[b].label}`);
			}
		}
	}
	let minX = size, minY = size, maxX = -1, maxY = -1;
	for (const mask of masks) {
		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mask[y * size + x]) {
			if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
		}
	}
	const edge = [];
	if (maxX >= 0) {
		const margins = { left: minX / SCALE, top: minY / SCALE, right: units - (maxX + 1) / SCALE, bottom: units - (maxY + 1) / SCALE };
		for (const [side, value] of Object.entries(margins)) if (value < config.edge - 0.01) edge.push(`${side} ${value.toFixed(2)}u`);
	} else {
		edge.push('no ink');
	}
	report.push({ name: icon.name, tight, overlap, edge });
}
await browser.close();

let failures = 0;
for (const r of report) {
	const bad = r.tight.length + r.edge.length;
	failures += bad;
	if (!bad && !(args.all && r.overlap.length)) continue;
	console.log(`\n${r.name}`);
	for (const t of r.tight) console.log(`  tight    ${t}`);
	for (const e of r.edge) console.log(`  edge     ${e}`);
	if (args.all) for (const o of r.overlap) console.log(`  overlap  ${o}`);
}
const clean = report.filter((r) => !r.tight.length && !r.edge.length).length;
console.log(`\n${clean}/${report.length} icons clean (min gap ${config.minGap}u, edge ${config.edge}u)`);
if (args.json) await writeOutput(String(args.json), JSON.stringify(report, null, '\t'));
process.exit(failures ? 1 : 0);

/** Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function distanceTransform(mask, size) {
	const INF = 1e12;
	const f = new Float64Array(size * size);
	for (let i = 0; i < f.length; i++) f[i] = mask[i] ? 0 : INF;
	const v = new Int32Array(size);
	const z = new Float64Array(size + 1);
	const vals = new Float64Array(size);
	const pass = (offset, stride) => {
		for (let q = 0; q < size; q++) vals[q] = f[offset + q * stride];
		let k = 0;
		v[0] = 0; z[0] = -INF; z[1] = INF;
		for (let q = 1; q < size; q++) {
			let s = ((vals[q] + q * q) - (vals[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			while (s <= z[k]) { k--; s = ((vals[q] + q * q) - (vals[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
			k++; v[k] = q; z[k] = s; z[k + 1] = INF;
		}
		k = 0;
		for (let q = 0; q < size; q++) {
			while (z[k + 1] < q) k++;
			f[offset + q * stride] = (q - v[k]) * (q - v[k]) + vals[v[k]];
		}
	};
	for (let x = 0; x < size; x++) pass(x, size);
	for (let y = 0; y < size; y++) pass(y * size, 1);
	return f;
}
