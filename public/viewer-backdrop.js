import {
	ACESFilmicToneMapping, AgXToneMapping, Color, LinearToneMapping, Matrix3,
	NeutralToneMapping, NoToneMapping, ReinhardToneMapping, Vector3,
} from 'three';

const inverseMatrix = values => new Matrix3().fromArray(values).invert();
// Match the forward matrices in the SDK's Needle AgX and Three's ACES shaders.
const agxInset = inverseMatrix([
	0.842479062253094, 0.0423282422610123, 0.0423756549057051,
	0.0784335999999992, 0.878468636469772, 0.0784336,
	0.0792237451477643, 0.0791661274605434, 0.879142973793104,
]);
const agxOutset = inverseMatrix([
	1.19687900512017, -0.0528968517574562, -0.0529716355144438,
	-0.0980208811401368, 1.15190312990417, -0.0980434501171241,
	-0.0990297440797205, -0.0989611768448433, 1.15107367264116,
]);
const acesInput = inverseMatrix([
	0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777,
]);
const acesOutput = inverseMatrix([
	1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602,
]);
const luminance = new Vector3(0.2126, 0.7152, 0.0722);

function solveIncreasing(fn, target, low, high) {
	for (let i = 0; i < 22; i++) {
		const midpoint = (low + high) / 2;
		if (fn(midpoint) < target) low = midpoint;
		else high = midpoint;
	}
	return (low + high) / 2;
}

function undoNeedleAgx(rgb) {
	rgb.set(...rgb.toArray().map(value => value ** (1 / 2.2))).applyMatrix3(agxOutset);
	const undoLook = (value, luma) => (Math.max(0, (value + 0.15 * luma) / 1.15) ** (1 / 1.10)) / 1.05;
	const luma = solveIncreasing(value => value
		- undoLook(rgb.x, value) * luminance.x
		- undoLook(rgb.y, value) * luminance.y
		- undoLook(rgb.z, value) * luminance.z, 0, 0, 1);
	const contrast = x => ((((15.5 * x - 40.14) * x + 31.96) * x - 6.868) * x + 0.4298) * x * x
		+ 0.1191 * x - 0.00232;
	return rgb.set(...rgb.toArray().map(value => 2 ** (16.499999
		* solveIncreasing(contrast, undoLook(value, luma), 0, 1) - 12.47393))).applyMatrix3(agxInset);
}

function undoAces(rgb) {
	const fit = x => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.4329510) + 0.238081);
	rgb.applyMatrix3(acesOutput);
	return rgb.set(...rgb.toArray().map(value => solveIncreasing(fit, value, 0, 32))).applyMatrix3(acesInput).multiplyScalar(0.6);
}

function undoNeutral(rgb) {
	const peak = Math.max(rgb.x, rgb.y, rgb.z);
	if (peak >= 0.76) {
		const originalPeak = 0.76 - 0.24 + 0.24 ** 2 / (1 - peak);
		const desaturation = 1 - 1 / (1 + 0.15 * (originalPeak - peak));
		rgb.addScalar(-desaturation * peak).multiplyScalar(originalPeak / (peak * (1 - desaturation)));
	}
	const minimum = Math.min(rgb.x, rgb.y, rgb.z);
	const offset = minimum < 0.04 ? Math.sqrt(minimum / 6.25) - minimum : 0.04;
	return rgb.addScalar(offset);
}

// Invert the viewer's display transforms for an opaque, scene-linear backdrop.
// Leave enough headroom for operators that approach white asymptotically.
export function counterToneMapBackdrop(displayColor, toneMapping, exposure) {
	if (toneMapping === NoToneMapping || !Number.isFinite(exposure) || exposure <= 0) return displayColor;
	const rgb = new Vector3(displayColor.r, displayColor.g, displayColor.b);
	// This value rounds to white in 8-bit sRGB while keeping the inverse finite.
	const white = 0.997;
	if (toneMapping === AgXToneMapping) undoNeedleAgx(rgb);
	else if (toneMapping === ACESFilmicToneMapping) undoAces(rgb);
	else if (toneMapping === NeutralToneMapping) undoNeutral(rgb.clampScalar(0, white));
	else if (toneMapping === ReinhardToneMapping) {
		rgb.clampScalar(0, white);
		rgb.set(rgb.x / (1 - rgb.x), rgb.y / (1 - rgb.y), rgb.z / (1 - rgb.z));
	} else if (toneMapping !== LinearToneMapping) return displayColor;
	rgb.multiplyScalar(1 / exposure).clampScalar(0, 65504);
	return new Color().setRGB(rgb.x, rgb.y, rgb.z);
}
