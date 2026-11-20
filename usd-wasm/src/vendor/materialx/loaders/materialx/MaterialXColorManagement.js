import { Fn, dot, max, pow, vec3, vec4, mx_srgb_texture_to_lin_rec709 } from 'three/tsl';

// MaterialX color spaces decoded to lin_rec709, the working color space of three.js.
// Transfer functions and matrices follow MaterialX's libraries/cmlib; the *_scene names
// follow the aliases in MaterialXGenShader/DefaultColorManagementSystem.cpp.

const ALIASES = {
	gamma18: 'g18_rec709',
	gamma22: 'g22_rec709',
	gamma24: 'rec709_display',
	lin_ap1: 'acescg',
	lin_ap1_scene: 'acescg',
	lin_rec709_scene: 'lin_rec709',
	lin_p3d65_scene: 'lin_displayp3',
	lin_adobergb_scene: 'lin_adobergb',
	srgb_rec709_scene: 'srgb_texture',
	g22_rec709_scene: 'g22_rec709',
	g18_rec709_scene: 'g18_rec709',
	g24_rec709_scene: 'rec709_display',
	g22_ap1_scene: 'g22_ap1',
	srgb_p3d65_scene: 'srgb_displayp3',
	g22_adobergb_scene: 'adobergb',
	none: 'data',
};

// cmlib matrix33 values as MaterialX lists them; each group of three is a column.
const MATRICES = {
	ap1: [ 1.705050992658, - 0.130256417507, - 0.024003356805, - 0.621792120657, 1.140804736575, - 0.128968976065, - 0.083258872001, - 0.010548319068, 1.15297233287 ],
	ap0: [ 2.521686186744, - 0.276479914230, - 0.015378064966, - 1.134130988240, 1.372719087668, - 0.152975335867, - 0.387555198504, - 0.096239173438, 1.16835340083 ],
	p3: [ 1.224940176281, - 0.04205695470969, - 0.01963755459033, - 0.2249401762806, 1.042056954710, - 0.07863604555063, 0, 0, 1.098273600141 ],
	rec2020: [ 1.660491002108, - 0.124550474522, - 0.018150763355, - 0.587641138788, 1.132899897126, - 0.100578898008, - 0.072849863320, - 0.008349422604, 1.11872966136 ],
	adobergb: [ 1.39835574, 0, 0, - 0.398355744, 1, - 0.0429289893, 0, 0, 1.04292899 ],
	ciexyzd65: [ 3.240969941905, - 0.969243636281, 0.055630079697, - 1.53738317757, 1.875967501508, - 0.203976958889, - 0.498610760293, 0.041555057407, 1.056971514243 ],
};

const COLOR_SPACES = {
	lin_rec709: null,
	data: null,
	srgb_texture: { transfer: 'srgb' },
	g18_rec709: { gamma: 1.8 },
	g22_rec709: { gamma: 2.2 },
	rec709_display: { gamma: 2.4 },
	acescg: { matrix: 'ap1' },
	g22_ap1: { gamma: 2.2, matrix: 'ap1' },
	srgb_ap1_scene: { transfer: 'srgb', matrix: 'ap1' },
	lin_ap0_scene: { matrix: 'ap0' },
	srgb_displayp3: { transfer: 'srgb', matrix: 'p3' },
	lin_displayp3: { matrix: 'p3' },
	lin_rec2020_scene: { matrix: 'rec2020' },
	lin_adobergb: { matrix: 'adobergb' },
	adobergb: { gamma: 563 / 256, matrix: 'adobergb' },
	lin_ciexyzd65_scene: { matrix: 'ciexyzd65' },
};

/**
 * Whether three.js MaterialXLoader knows the color space name.
 *
 * @param {string} name
 * @return {boolean}
 */
export function isKnownColorSpace( name ) {

	return ( ALIASES[ name ] || name ) in COLOR_SPACES;

}

/**
 * Returns a function that converts a color3 or color4 node from the given color space to
 * lin_rec709, or null when no conversion is needed or the name is unknown.
 *
 * @param {?string} name - A MaterialX color space name.
 * @return {?function(Node): Node}
 */
export function getColorSpaceTransform( name ) {

	if ( ! name ) return null;
	const space = COLOR_SPACES[ ALIASES[ name ] || name ];
	if ( ! space ) return null;

	const columns = space.matrix ? MATRICES[ space.matrix ] : null;
	const rows = columns ? [ 0, 1, 2 ].map( ( row ) => vec3( columns[ row ], columns[ row + 3 ], columns[ row + 6 ] ) ) : null;

	const decode = ( rgb ) => {

		let color = vec3( rgb );
		if ( space.transfer === 'srgb' ) color = mx_srgb_texture_to_lin_rec709( color );
		else if ( space.gamma ) color = pow( max( color, vec3( 0 ) ), vec3( space.gamma ) );
		if ( rows ) color = vec3( dot( rows[ 0 ], color ), dot( rows[ 1 ], color ), dot( rows[ 2 ], color ) );
		return color;

	};

	return ( node ) => Fn( ( builder ) => {

		const type = node.getNodeType( builder );
		return builder.getTypeLength( type ) === 4 ? vec4( decode( node.rgb ), node.a ) : decode( node );

	} )();

}
