import {
	mx_perlin_noise_float, mx_perlin_noise_vec3,
	mx_worley_noise_float_2d as worley_noise_float_2d, mx_worley_noise_float_3d as worley_noise_float_3d,
	mx_worley_noise_vec2 as worley_noise_vec2, mx_worley_noise_vec3 as worley_noise_vec3,
	mx_worley_noise_vec3_style as worley_noise_vec3_style,
	mx_cell_noise_float as cell_noise_float, mx_cell_noise_vec3 as cell_noise_vec3,
	mx_unifiednoise2d as unifiednoise2d, mx_unifiednoise3d as unifiednoise3d,
	mx_fractal_noise_float_2d as fractal_noise_float_2d,
	mx_fractal_noise_float as fractal_noise_float, mx_fractal_noise_vec2 as fractal_noise_vec2, mx_fractal_noise_vec3 as fractal_noise_vec3, mx_fractal_noise_vec4 as fractal_noise_vec4
} from './MaterialXNoise.js';
import { mx_rotate2d, mx_rotate3d } from './MaterialXCore.js';
import { mx_hsvtorgb, mx_rgbtohsv } from './lib/mx_hsv.js';
import { mx_srgb_texture_to_lin_rec709 } from './lib/mx_transform_color.js';

import { Fn, float, bool, vec2, vec3, vec4, int, mat3, add, sub, mul, div, atan, mix, pow, smoothstep, step, floor, clamp, normalize, fract, abs, min, max, reflect, not as tslNot, xor as tslXor } from 'three/tsl';
import { uv } from 'three/tsl';
import { overloadingFn } from 'three/tsl';
import { bumpMap } from 'three/tsl';
import { frameId, time } from 'three/tsl';
import { cameraPosition } from 'three/tsl';
import { modelWorldMatrix, modelWorldMatrixInverse } from 'three/tsl';
import { normalWorld, normalWorldGeometry } from 'three/tsl';
import { positionWorld } from 'three/tsl';
import { tangentWorld } from 'three/tsl';
import { bitangentWorld } from 'three/tsl';

export const mx_aastep = ( threshold, value ) => {

	threshold = float( threshold );
	value = float( value );

	const afwidth = vec2( value.dFdx(), value.dFdy() ).length().mul( 0.70710678118654757 );

	return smoothstep( threshold.sub( afwidth ), threshold.add( afwidth ), value );

};

const _ramp = ( a, b, uv, p ) => mix( a, b, uv[ p ].clamp() );
export const mx_ramplr = ( valuel, valuer, texcoord = uv() ) => _ramp( valuel, valuer, texcoord, 'x' );
export const mx_ramptb = ( valuet, valueb, texcoord = uv() ) => _ramp( valuet, valueb, texcoord, 'y' );

// Bilinear ramp: interpolate between four corners (tl, tr, bl, br) using texcoord.x and texcoord.y
export const mx_ramp4 = (
	valuetl, valuetr, valuebl, valuebr, texcoord = uv()
) => {

	const u = texcoord.x.clamp();
	const v = texcoord.y.clamp();
	const top = mix( valuetl, valuetr, u );
	const bottom = mix( valuebl, valuebr, u );
	return mix( top, bottom, v );

};

const _split = ( a, b, center, uv, p ) => mix( a, b, mx_aastep( center, uv[ p ] ) );
export const mx_splitlr = ( valuel, valuer, center, texcoord = uv() ) => _split( valuel, valuer, center, texcoord, 'x' );
export const mx_splittb = ( valuet, valueb, center, texcoord = uv() ) => _split( valuet, valueb, center, texcoord, 'y' );

export const mx_transform_uv = ( uv_scale = 1, uv_offset = 0, uv_geo = uv() ) => uv_geo.mul( uv_scale ).add( uv_offset );

export const mx_safepower = ( in1, in2 = 1 ) => {

	in1 = float( in1 );

	return in1.abs().pow( in2 ).mul( in1.sign() );

};

export const mx_contrast = ( input, amount = 1, pivot = .5 ) => add( mul( sub( input, pivot ), amount ), pivot );

export const mx_combine2 = ( in1 = float( 0 ), in2 = float( 0 ) ) => vec2( in1, in2 );
export const mx_combine3 = ( in1 = float( 0 ), in2 = float( 0 ), in3 = float( 0 ) ) => vec3( in1, in2, in3 );
export const mx_combine4 = ( in1 = float( 0 ), in2 = float( 0 ), in3 = float( 0 ), in4 = float( 0 ) ) => vec4( in1, in2, in3, in4 );

export const mx_checkerboard = ( texcoord = uv(), uvtiling = vec2( 1, 1 ), color1 = float( 0 ), color2 = float( 0 ) ) => {

	const cell = floor( texcoord.mul( uvtiling ) );
	const mask = mx_modulo( cell.x.add( cell.y ), float( 2 ) ).lessThan( float( 1 ) );

	return mask.select( color1, color2 );

};

export const mx_grid = ( texcoord = uv(), uvtiling = vec2( 1, 1 ), thickness = float( 0.01 ), staggered = bool( false ) ) => {

	const tiled = texcoord.mul( uvtiling );
	const row = floor( tiled.y );
	const offset = staggered.select( mx_modulo( row, float( 2 ) ).mul( 0.5 ), float( 0 ) );
	const cell = fract( vec2( tiled.x.add( offset ), tiled.y ) );
	const edgeDistance = min( min( cell.x, cell.y ), min( cell.x.oneMinus(), cell.y.oneMinus() ) );
	const line = mx_aastep( thickness, edgeDistance ).oneMinus();

	return vec3( line );

};

export const mx_crosshatch = ( texcoord = uv(), uvtiling = vec2( 1, 1 ), thickness = float( 0.01 ), staggered = bool( false ) ) => {

	const tiled = texcoord.mul( uvtiling );
	const row = floor( tiled.y );
	const offset = staggered.select( mx_modulo( row, float( 2 ) ).mul( 0.5 ), float( 0 ) );
	const cell = fract( vec2( tiled.x.add( offset ), tiled.y ) );
	const diagonalA = abs( cell.x.sub( cell.y ) );
	const diagonalB = abs( cell.x.add( cell.y ).sub( 1 ) );
	const line = mx_aastep( thickness, min( diagonalA, diagonalB ) ).oneMinus();

	return vec3( line );

};

export const mx_tiledcircles = ( texcoord = uv(), uvtiling = vec2( 1, 1 ), uvoffset = vec2( 0, 0 ), size = float( 0.25 ), staggered = bool( false ) ) => {

	const tiled = texcoord.add( uvoffset ).mul( uvtiling );
	const row = floor( tiled.y );
	const offset = staggered.select( mx_modulo( row, float( 2 ) ).mul( 0.5 ), float( 0 ) );
	const cell = fract( vec2( tiled.x.add( offset ), tiled.y ) ).sub( vec2( 0.5 ) );
	const circle = mx_aastep( size, cell.length() ).oneMinus();

	return vec3( circle );

};

export const mx_tiledhexagons = ( texcoord = uv(), uvtiling = vec2( 1, 1 ), uvoffset = vec2( 0, 0 ), size = float( 0.5 ), staggered = bool( false ) ) => {

	const tiled = texcoord.add( uvoffset ).mul( uvtiling );
	const row = floor( tiled.y );
	const offset = staggered.select( mx_modulo( row, float( 2 ) ).mul( 0.5 ), float( 0 ) );
	const cell = fract( vec2( tiled.x.add( offset ), tiled.y ) ).sub( vec2( 0.5 ) );
	const q = abs( cell );
	const hexDistance = max( q.x.mul( 0.8660254 ).add( q.y.mul( 0.5 ) ), q.y );
	const mask = mx_aastep( size.mul( 0.5 ), hexDistance ).oneMinus();

	return vec3( mask );

};

export const mx_tiledcloverleafs = ( texcoord = uv(), uvtiling = vec2( 1, 1 ), uvoffset = vec2( 0, 0 ), size = float( 0.5 ), staggered = bool( false ) ) => {

	const tiled = texcoord.add( uvoffset ).mul( uvtiling );
	const row = floor( tiled.y );
	const offset = staggered.select( mx_modulo( row, float( 2 ) ).mul( 0.5 ), float( 0 ) );
	const cell = fract( vec2( tiled.x.add( offset ), tiled.y ) );
	const radius = size.mul( 0.25 );
	const d1 = cell.sub( vec2( 0.35, 0.5 ) ).length();
	const d2 = cell.sub( vec2( 0.65, 0.5 ) ).length();
	const d3 = cell.sub( vec2( 0.5, 0.35 ) ).length();
	const d4 = cell.sub( vec2( 0.5, 0.65 ) ).length();
	const mask = mx_aastep( radius, min( min( d1, d2 ), min( d3, d4 ) ) ).oneMinus();

	return vec3( mask );

};

export const mx_screen = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => {

	const screened = float( 1 ).sub( float( 1 ).sub( fg ).mul( float( 1 ).sub( bg ) ) );
	return mix( bg, screened, mixAmount );

};

export const mx_plus = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => bg.add( fg.mul( mixAmount ) );
export const mx_minus = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => bg.sub( fg.mul( mixAmount ) );
export const mx_difference = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => mixAmount.mul( abs( bg.sub( fg ) ) ).add( float( 1 ).sub( mixAmount ).mul( bg ) );
export const mx_passthrough = ( input = float( 0 ) ) => input;
export const mx_not = ( input = bool( false ) ) => tslNot( input );
export const mx_xor = ( in1 = bool( false ), in2 = bool( false ) ) => tslXor( in1, in2 );
export const mx_blur = ( input = float( 0 )/*, size = float( 0 ), filtertype*/ ) => input;

export const mx_unpremult = ( input = vec4( 0, 0, 0, 1 ) ) => {

	input = vec4( input );
	const safeAlpha = input.a.equal( 0 ).select( float( 1 ), input.a );
	const rgb = input.a.equal( 0 ).select( input.rgb, input.rgb.div( safeAlpha ) );
	return vec4( rgb, input.a );

};

export const mx_premult = ( input = vec4( 0, 0, 0, 1 ) ) => {

	input = vec4( input );
	return vec4( input.rgb.mul( input.a ), input.a );

};

export const mx_acescg_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => {

	const rgb = vec3( input );
	const transform = mat3(
		vec3( 1.705050992658, - 0.621792120657, - 0.083258872001 ),
		vec3( - 0.130256417507, 1.140804736575, - 0.010548319068 ),
		vec3( - 0.024003356805, - 0.128968976065, 1.15297233287 )
	);

	return transform.mul( rgb );

};

export const mx_lin_displayp3_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => {

	const rgb = vec3( input );
	const transform = mat3(
		vec3( 1.22493029, - 0.22492968, 0.00000006 ),
		vec3( - 0.04205868, 1.04205894, - 0.00000001 ),
		vec3( - 0.01964128, - 0.07864794, 1.09828925 )
	);

	return transform.mul( rgb );

};

export const mx_srgb_displayp3_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => mx_lin_displayp3_to_lin_rec709( mx_srgb_texture_to_lin_rec709( input ) );

export const mx_lin_adobergb_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => {

	const rgb = vec3( input );
	const transform = mat3(
		vec3( 1.39835574, - 0.398355744, 0.0 ),
		vec3( - 2.50233861e-16, 1.0, 0.0 ),
		vec3( 2.77555756e-17, - 0.0429289893, 1.04292899 )
	);

	return transform.mul( rgb );

};

export const mx_adobergb_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => mx_lin_adobergb_to_lin_rec709( max( input, vec3( 0 ) ).pow( 563 / 256 ) );

export const mx_g22_ap1_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => mx_acescg_to_lin_rec709( max( vec3( input ), vec3( 0 ) ).pow( 2.2 ) );
export const mx_g18_rec709_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => max( input, vec3( 0 ) ).pow( 1.8 );
export const mx_g22_rec709_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => max( input, vec3( 0 ) ).pow( 2.2 );

export const mx_rec709_display_to_lin_rec709 = ( input = vec3( 0, 0, 0 ) ) => max( input, vec3( 0 ) ).pow( 2.4 );
export const mx_fract = ( input = float( 0 ) ) => fract( input );
export const mx_dodge = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => {

	const denominator = float( 1 ).sub( fg );

	// per channel, see mx_overlay: 0 where the denominator is too small to divide by

	const usable = step( 1e-6, abs( denominator ) );
	const safeDenominator = mix( float( 1 ), denominator, usable );
	const dodged = bg.div( safeDenominator );
	const result = mixAmount.mul( dodged ).add( float( 1 ).sub( mixAmount ).mul( bg ) );

	return mix( bg.mul( 0 ), result, usable );

};

export const mx_burn = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => {

	// per channel, see mx_overlay

	const usable = step( 1e-6, abs( fg ) );
	const safeFg = mix( float( 1 ), fg, usable );
	const burned = float( 1 ).sub( float( 1 ).sub( bg ).div( safeFg ) );
	const result = mixAmount.mul( burned ).add( float( 1 ).sub( mixAmount ).mul( bg ) );

	return mix( bg.mul( 0 ), result, usable );

};

export const mx_matte = ( bg = vec4( 0, 0, 0, 0 ), fg = vec4( 0, 0, 0, 0 ), mixAmount = float( 1 ) ) => {

	bg = vec4( bg );
	fg = vec4( fg );

	const matted = vec4(
		fg.rgb.mul( fg.a ).add( bg.rgb.mul( float( 1 ).sub( fg.a ) ) ),
		fg.a.add( bg.a.mul( float( 1 ).sub( fg.a ) ) )
	);

	return matted.mul( mixAmount ).add( bg.mul( float( 1 ).sub( mixAmount ) ) );

};

export const mx_mask = ( bg = vec4( 0, 0, 0, 0 ), fg = vec4( 0, 0, 0, 0 ), mixAmount = float( 1 ) ) => {

	bg = vec4( bg );
	fg = vec4( fg );

	return bg.mul( fg.a ).mul( mixAmount ).add( bg.mul( float( 1 ).sub( mixAmount ) ) );

};

export const mx_in = ( bg = vec4( 0, 0, 0, 0 ), fg = vec4( 0, 0, 0, 0 ), mixAmount = float( 1 ) ) => {

	bg = vec4( bg );
	fg = vec4( fg );

	return fg.mul( bg.a ).mul( mixAmount ).add( bg.mul( float( 1 ).sub( mixAmount ) ) );

};

export const mx_out = ( bg = vec4( 0, 0, 0, 0 ), fg = vec4( 0, 0, 0, 0 ), mixAmount = float( 1 ) ) => {

	bg = vec4( bg );
	fg = vec4( fg );

	return fg.mul( float( 1 ).sub( bg.a ) ).mul( mixAmount ).add( bg.mul( float( 1 ).sub( mixAmount ) ) );

};

export const mx_disjointover = ( bg = vec4( 0, 0, 0, 0 ), fg = vec4( 0, 0, 0, 0 ), mixAmount = float( 1 ) ) => {

	bg = vec4( bg );
	fg = vec4( fg );

	const summedAlpha = fg.a.add( bg.a );
	const safeBgAlpha = bg.a.equal( 0 ).select( float( 1 ), bg.a );
	const overRgb = bg.a.equal( 0 ).select( vec3( 0 ), fg.rgb.add( bg.rgb.mul( float( 1 ).sub( fg.a ).div( safeBgAlpha ) ) ) );
	const rgb = summedAlpha.lessThanEqual( 1 ).select( fg.rgb.add( bg.rgb ), overRgb );
	const alpha = min( summedAlpha, float( 1 ) );
	const result = vec4( rgb, alpha );

	return result.mul( mixAmount ).add( bg.mul( float( 1 ).sub( mixAmount ) ) );

};

export const mx_over = ( bg = vec4( 0, 0, 0, 0 ), fg = vec4( 0, 0, 0, 0 ), mixAmount = float( 1 ) ) => {

	bg = vec4( bg );
	fg = vec4( fg );

	const over = fg.add( bg.mul( float( 1 ).sub( fg.a ) ) );
	return over.mul( mixAmount ).add( bg.mul( float( 1 ).sub( mixAmount ) ) );

};

export const mx_inside = ( input = float( 0 ), mask = float( 0 ) ) => input.mul( mask );
export const mx_outside = ( input = float( 0 ), mask = float( 0 ) ) => input.mul( float( 1 ).sub( mask ) );

export const mx_circle = ( texcoord = uv(), center = vec2( 0.5, 0.5 ), radius = float( 0.25 ) ) => {

	const distanceToCenter = vec2( texcoord ).sub( center ).length();
	return distanceToCenter.greaterThan( radius ).select( float( 0 ), float( 1 ) );

};

export const mx_line = ( texcoord = uv(), center = vec2( 0.5, 0.5 ), radius = float( 0.25 ), point1 = vec2( 0, 0 ), point2 = vec2( 1, 1 ) ) => {

	const pa = vec2( texcoord ).sub( center ).sub( point1 );
	const ba = point2.sub( point1 );
	const h = clamp( pa.dot( ba ).div( ba.dot( ba ) ), 0, 1 );
	const distanceToLine = pa.sub( ba.mul( h ) ).length();

	return distanceToLine.greaterThan( radius ).select( float( 0 ), float( 1 ) );

};

export const mx_cloverleaf = ( texcoord = uv(), center = vec2( 0.5, 0.5 ), radius = float( 0.25 ) ) => {

	const sampleDouble = vec2( texcoord ).mul( 2 );
	const centerDouble = center.mul( 2 );
	const sampleAdd = sampleDouble.add( radius );
	const sampleSubtract = sampleDouble.sub( radius );
	const circle1 = mx_circle( vec2( sampleAdd.x, sampleDouble.y ), centerDouble, radius );
	const circle2 = mx_circle( vec2( sampleSubtract.x, sampleDouble.y ), centerDouble, radius );
	const circle3 = mx_circle( vec2( sampleDouble.x, sampleSubtract.y ), centerDouble, radius );
	const circle4 = mx_circle( vec2( sampleDouble.x, sampleAdd.y ), centerDouble, radius );

	return max( max( circle1, circle2 ), max( circle3, circle4 ) );

};

export const mx_hexagon = ( texcoord = uv(), center = vec2( 0.5, 0.5 ), radius = float( 0.25 ) ) => {

	const q = abs( vec2( texcoord ).sub( center ) );
	const hexDistance = max( q.x.mul( 0.8660254 ).add( q.y.mul( 0.5 ) ), q.y );

	return hexDistance.greaterThan( radius.mul( 0.8660254 ) ).select( float( 0 ), float( 1 ) );

};

export const mx_open_pbr_anisotropy = ( roughness = float( 0 ), anisotropy = float( 0 ) ) => {

	const anisoInvert = float( 1 ).sub( anisotropy );
	const anisoInvertSq = anisoInvert.mul( anisoInvert );
	const fraction = float( 2 ).div( anisoInvertSq.add( 1 ) );
	const sqrtValue = fraction.sqrt();
	const roughnessSq = roughness.mul( roughness );
	const alphaX = roughnessSq.mul( sqrtValue );
	const alphaY = anisoInvert.mul( alphaX );

	return vec2( alphaX, alphaY );

};

export const mx_blackbody = ( temperature = float( 6500 ) ) => {

	const temperatureKelvin = clamp( float( temperature ), float( 800 ), float( 25000 ) );
	const t = float( 1000 ).div( temperatureKelvin );
	const t2 = t.mul( t );
	const t3 = t2.mul( t );
	const xcLow = t3.mul( - 0.2661239 ).sub( t2.mul( 0.2343580 ) ).add( t.mul( 0.8776956 ) ).add( 0.179910 );
	const xcHigh = t3.mul( - 3.0258469 ).add( t2.mul( 2.1070379 ) ).add( t.mul( 0.2226347 ) ).add( 0.240390 );
	const xc = temperatureKelvin.lessThan( 4000 ).select( xcLow, xcHigh );
	const xc2 = xc.mul( xc );
	const xc3 = xc2.mul( xc );
	const ycLow = xc3.mul( - 1.1063814 ).sub( xc2.mul( 1.34811020 ) ).add( xc.mul( 2.18555832 ) ).sub( 0.20219683 );
	const ycMid = xc3.mul( - 0.9549476 ).sub( xc2.mul( 1.37418593 ) ).add( xc.mul( 2.09137015 ) ).sub( 0.16748867 );
	const ycHigh = xc3.mul( 3.0817580 ).sub( xc2.mul( 5.87338670 ) ).add( xc.mul( 3.75112997 ) ).sub( 0.37001483 );
	const yc = temperatureKelvin.lessThan( 2222 ).select( ycLow, temperatureKelvin.lessThan( 4000 ).select( ycMid, ycHigh ) );
	const safeY = max( yc, float( 0.00001 ) );
	const xyz = vec3( xc.div( safeY ), float( 1 ), float( 1 ).sub( xc ).sub( yc ).div( safeY ) );
	const xyzToRgb = mat3(
		vec3( 3.2406, - 0.9689, 0.0557 ),
		vec3( - 1.5372, 1.8758, - 0.2040 ),
		vec3( - 0.4986, 0.0415, 1.0570 )
	);

	return max( xyzToRgb.mul( xyz ), vec3( 0 ) );

};

export const mx_ramp_gradient = (
	x = float( 0 ),
	interval1 = float( 0 ),
	interval2 = float( 1 ),
	color1 = vec4( 0, 0, 0, 1 ),
	color2 = vec4( 1, 1, 1, 1 ),
	interpolation = int( 1 ),
	prevColor = vec4( 0, 0, 0, 1 ),
	intervalNum = int( 1 ),
	numIntervals = int( 2 )
) => {

	const linearClamped = clamp( x, interval1, interval2 );
	const linearMix = linearClamped.sub( interval1 ).div( interval2.sub( interval1 ) );
	const safeInterval2 = interval2.add( interval2.equal( interval1 ).select( float( 1e-6 ), float( 0 ) ) );
	const smoothMix = smoothstep( interval1, safeInterval2, x );
	const blend = int( interpolation ).equal( int( 0 ) ).select( linearMix, smoothMix );
	const mixed = mix( color1, color2, blend );
	const stepped = interval2.greaterThan( x ).select( color1, color2 );
	const intervalColor = int( interpolation ).equal( int( 2 ) ).select( stepped, mixed );
	const activeColor = x.greaterThan( interval1 ).select( intervalColor, prevColor );

	return int( intervalNum ).greaterThanEqual( int( numIntervals ) ).select( prevColor, activeColor );

};

export const mx_ramp = (
	texcoord = uv(),
	type = int( 0 ),
	interpolation = int( 1 ),
	numIntervals = int( 2 ),
	interval1 = float( 0 ),
	color1 = vec4( 0, 0, 0, 1 ),
	interval2 = float( 1 ),
	color2 = vec4( 1, 1, 1, 1 ),
	interval3 = float( 1 ),
	color3 = vec4( 1, 1, 1, 1 ),
	interval4 = float( 1 ),
	color4 = vec4( 1, 1, 1, 1 ),
	interval5 = float( 1 ),
	color5 = vec4( 1, 1, 1, 1 ),
	interval6 = float( 1 ),
	color6 = vec4( 1, 1, 1, 1 ),
	interval7 = float( 1 ),
	color7 = vec4( 1, 1, 1, 1 ),
	interval8 = float( 1 ),
	color8 = vec4( 1, 1, 1, 1 ),
	interval9 = float( 1 ),
	color9 = vec4( 1, 1, 1, 1 ),
	interval10 = float( 1 ),
	color10 = vec4( 1, 1, 1, 1 )
) => {

	const centered = vec2( texcoord ).sub( 0.5 );
	const radial = mx_atan2( centered.x, centered.y ).div( 6.28319 ).add( 0.5 );
	const circular = centered.mul( 1.414 ).length();
	const boxAbs = centered.abs();
	const boxScaled = boxAbs.mul( 2 );
	const box = boxAbs.x.greaterThan( boxAbs.y ).select( boxScaled.x, boxScaled.y );
	const rampPosition = int( type ).equal( int( 1 ) ).select(
		radial,
		int( type ).equal( int( 2 ) ).select(
			circular,
			int( type ).equal( int( 3 ) ).select( box, vec2( texcoord ).x )
		)
	);

	let result = mx_ramp_gradient( rampPosition, interval1, interval2, color1, color2, interpolation, color1, int( 1 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval2, interval3, color2, color3, interpolation, result, int( 2 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval3, interval4, color3, color4, interpolation, result, int( 3 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval4, interval5, color4, color5, interpolation, result, int( 4 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval5, interval6, color5, color6, interpolation, result, int( 5 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval6, interval7, color6, color7, interpolation, result, int( 6 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval7, interval8, color7, color8, interpolation, result, int( 7 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval8, interval9, color8, color9, interpolation, result, int( 8 ), numIntervals );
	result = mx_ramp_gradient( rampPosition, interval9, interval10, color9, color10, interpolation, result, int( 9 ), numIntervals );

	return result;

};

export const mx_range = ( input, inlow = float( 0 ), inhigh = float( 1 ), gamma = float( 1 ), outlow = float( 0 ), outhigh = float( 1 ), doclamp = bool( false ) ) => {

	const t = input.sub( inlow ).div( inhigh.sub( inlow ) );
	const gammaCorrected = max( t, float( 0 ) ).pow( gamma );
	const mapped = outlow.add( outhigh.sub( outlow ).mul( gammaCorrected ) );
	return doclamp.select( clamp( mapped, outlow, outhigh ), mapped );

};

export const mx_trianglewave = ( input = float( 0 ) ) => abs( fract( input ).mul( 2 ).sub( 1 ) ).oneMinus();

export const mx_randomcolor = ( input = float( 0 ), hueLow = float( 0 ), hueHigh = float( 1 ), saturationLow = float( 0.825 ), saturationHigh = float( 1 ), brightnessLow = float( 1 ), brightnessHigh = float( 1 ), seed = int( 0 ) ) => {

	const hue = mx_randomfloat( input, hueLow, hueHigh, seed );
	const saturation = mx_randomfloat( input.add( 17.17 ), saturationLow, saturationHigh, seed.add( int( 11 ) ) );
	const brightness = mx_randomfloat( input.add( 37.37 ), brightnessLow, brightnessHigh, seed.add( int( 23 ) ) );

	return mx_hsvtorgb( vec3( hue, saturation, brightness ) );

};

export const mx_colorcorrect = ( input, hue = float( 0 ), saturationAmount = float( 1 ), gamma = float( 1 ), lift = float( 0 ), gainAmount = float( 1 ), contrastAmount = float( 1 ), contrastPivot = float( 0.5 ), exposure = float( 0 ) ) => {

	const hsv = mx_rgbtohsv( input.rgb || input );
	let corrected = mx_hsvtorgb( vec3( hsv.x.add( hue ), hsv.y.mul( saturationAmount ), hsv.z ) );
	corrected = max( corrected, vec3( 0 ) ).pow( gamma );
	corrected = corrected.add( lift.mul( vec3( 1 ).sub( corrected ) ) );
	corrected = corrected.mul( gainAmount );
	corrected = mx_contrast( corrected, contrastAmount, contrastPivot );
	corrected = corrected.mul( float( 2 ).pow( exposure ) );

	return input.a ? vec4( corrected, input.a ) : corrected;

};

export const mx_gooch_shade = (
	warmColor = vec3( 1, 0.45, 0.05 ),
	coolColor = vec3( 0.02, 0.08, 0.9 ),
	specularIntensity = float( 0.5 ),
	shininessValue = float( 64 ),
	lightDirection = vec3( 0, 0, 1 ),
	normal = normalWorldGeometry,
	viewDirection = cameraPosition.sub( positionWorld )
) => {

	const n = normalize( normal );
	const l = normalize( lightDirection ).negate();
	const v = normalize( viewDirection );
	const shade = n.dot( l ).mul( 0.5 ).add( 0.5 ).clamp();
	const diffuse = mix( coolColor, warmColor, shade );
	const reflected = reflect( l.negate(), n );
	const specular = max( reflected.dot( v ), float( 0 ) ).pow( shininessValue ).mul( specularIntensity );

	return diffuse.add( specular );

};

export const mx_smoothstep = ( input, low = float( 0 ), high = float( 1 ), edgesEqual = false ) => {

	if ( edgesEqual ) {

		// the degenerate low == high case is a hard edge, and step() keeps it per channel

		return step( low, input );

	}

	return smoothstep( low, high, input );

};

export const mx_divide_by_zero = ( numerator = float( 0 ) ) => {

	const maxFloat = float( 3.0e38 );

	return numerator.equal( float( 0 ) ).select(
		float( 0 ),
		numerator.lessThan( float( 0 ) ).select( maxFloat.negate(), maxFloat )
	);

};

export const mx_overlay = ( bg = float( 0 ), fg = float( 0 ), mixAmount = float( 1 ) ) => {

	const lower = bg.mul( fg ).mul( 2 );
	const upper = float( 1 ).sub( bg.oneMinus().mul( fg.oneMinus() ).mul( 2 ) );

	// step() keeps the choice per channel. select() takes a single boolean, so a color3 would
	// have every channel decided by the comparison of the first one.

	const overlay = mix( lower, upper, step( 0.5, bg ) );

	return mix( bg, overlay, mixAmount );

};

export const mx_hsvadjust = ( input, amount = vec3( 0, 1, 1 ) ) => {

	const hsv = mx_rgbtohsv( input.rgb || input );
	const adjusted = mx_hsvtorgb( vec3( hsv.x.add( amount.x ), hsv.y.mul( amount.y ), hsv.z.mul( amount.z ) ) );

	return input.a ? vec4( adjusted, input.a ) : adjusted;

};

export const mx_transform_vector = ( input = vec3( 0, 0, 0 ), fromSpace = '', toSpace = '' ) => {

	input = vec3( input );

	if ( fromSpace === toSpace || fromSpace === '' || toSpace === '' ) return input;
	if ( ( fromSpace === 'model' || fromSpace === 'object' ) && toSpace === 'world' ) return modelWorldMatrix.mul( vec4( input, 0 ) ).xyz;
	if ( fromSpace === 'world' && ( toSpace === 'model' || toSpace === 'object' ) ) return modelWorldMatrixInverse.mul( vec4( input, 0 ) ).xyz;
	if ( fromSpace === 'world' && toSpace === 'tangent' ) return vec3( input.dot( tangentWorld ), input.dot( bitangentWorld ), input.dot( normalWorld ) );
	if ( fromSpace === 'tangent' && toSpace === 'world' ) return tangentWorld.mul( input.x ).add( bitangentWorld.mul( input.y ) ).add( normalWorld.mul( input.z ) );

	return input;

};

export const mx_transform_point = ( input = vec3( 0, 0, 0 ), fromSpace = '', toSpace = '' ) => {

	input = vec3( input );

	if ( fromSpace === toSpace || fromSpace === '' || toSpace === '' ) return input;
	if ( ( fromSpace === 'model' || fromSpace === 'object' ) && toSpace === 'world' ) return modelWorldMatrix.mul( vec4( input, 1 ) ).xyz;
	if ( fromSpace === 'world' && ( toSpace === 'model' || toSpace === 'object' ) ) return modelWorldMatrixInverse.mul( vec4( input, 1 ) ).xyz;

	return input;

};

export const mx_facingratio = (
	viewDirection = cameraPosition.sub( positionWorld ),
	normal = normalWorldGeometry,
	faceForward = bool( true ),
	invert = null
) => {

	const dotValue = normalize( viewDirection ).dot( normalize( normal ) );
	const facing = faceForward.select( dotValue.abs(), dotValue );

	return invert ? invert.select( mx_invert( facing ), facing ) : facing;

};

export const mx_noise_float = ( texcoord = uv(), amplitude = 1, pivot = 0 ) => mx_perlin_noise_float( texcoord.convert( 'vec2|vec3' ) ).mul( amplitude ).add( pivot );
//export const mx_noise_vec2 = ( texcoord = uv(), amplitude = 1, pivot = 0 ) => mx_perlin_noise_vec3( texcoord.convert( 'vec2|vec3' ) ).mul( amplitude ).add( pivot );
export const mx_noise_vec3 = ( texcoord = uv(), amplitude = 1, pivot = 0 ) => mx_perlin_noise_vec3( texcoord.convert( 'vec2|vec3' ) ).mul( amplitude ).add( pivot );
const mx_perlin_noise_vec4_0 = /*@__PURE__*/ Fn( ( [ p ] ) => vec4( mx_perlin_noise_vec3( p ), mx_perlin_noise_float( p.add( vec2( 19, 73 ) ) ) ), { p: 'vec2', return: 'vec4' } );
const mx_perlin_noise_vec4_1 = /*@__PURE__*/ Fn( ( [ p ] ) => vec4( mx_perlin_noise_vec3( p ), mx_perlin_noise_float( p.add( vec3( 19, 73, 29 ) ) ) ), { p: 'vec3', return: 'vec4' } );
const mx_perlin_noise_vec4 = /*@__PURE__*/ overloadingFn( [ mx_perlin_noise_vec4_0, mx_perlin_noise_vec4_1 ] );

export const mx_noise_vec4 = ( texcoord = uv(), amplitude = 1, pivot = 0 ) => mx_perlin_noise_vec4( texcoord.convert( 'vec2|vec3' ) ).mul( amplitude ).add( pivot );

export const mx_cell_noise_vec3 = ( texcoord = uv() ) => cell_noise_vec3( texcoord.convert( 'vec2|vec3' ) );
export const mx_worley_noise_float_2d = ( texcoord = uv(), jitter = 1, style = 0 ) => worley_noise_float_2d( texcoord, jitter, style );
export const mx_worley_noise_float_3d = ( texcoord = uv(), jitter = 1, style = 0 ) => worley_noise_float_3d( texcoord, jitter, style );
export const mx_unifiednoise2d = ( noiseType, texcoord = uv(), freq = vec2( 1, 1 ), offset = vec2( 0, 0 ), jitter = 1, outmin = 0, outmax = 1, clampoutput = false, octaves = 1, lacunarity = 2, diminish = .5, style = 0 ) => unifiednoise2d( noiseType, texcoord, freq, offset, jitter, outmin, outmax, clampoutput, octaves, lacunarity, diminish, style );
export const mx_unifiednoise3d = ( noiseType, texcoord = uv(), freq = vec3( 1, 1, 1 ), offset = vec3( 0, 0, 0 ), jitter = 1, outmin = 0, outmax = 1, clampoutput = false, octaves = 1, lacunarity = 2, diminish = .5, style = 0 ) => unifiednoise3d( noiseType, texcoord, freq, offset, jitter, outmin, outmax, clampoutput, octaves, lacunarity, diminish, style );

export const mx_worley_noise_float = ( texcoord = uv(), jitter = 1, style = 0 ) => mx_worley_noise_float_3d( texcoord.convert( 'vec2|vec3' ), jitter, style );
export const mx_worley_noise_vec2 = ( texcoord = uv(), jitter = 1 ) => worley_noise_vec2( texcoord.convert( 'vec2|vec3' ), jitter, int( 1 ) );
export const mx_worley_noise_vec3 = ( texcoord = uv(), jitter = 1, metric = 1 ) => worley_noise_vec3( texcoord.convert( 'vec2|vec3' ), jitter, int( metric ) );
export const mx_worley_noise_vec3_style = ( texcoord = uv(), jitter = 1, style = 0, metric = 0 ) => worley_noise_vec3_style( texcoord.convert( 'vec2|vec3' ), jitter, int( style ), int( metric ) );

export const mx_cell_noise_float = ( texcoord = uv() ) => cell_noise_float( texcoord.convert( 'vec2|vec3' ) );

export const mx_fractal_noise_float_2d = ( texcoord = uv(), octaves = 3, lacunarity = 2, diminish = .5, amplitude = 1 ) => fractal_noise_float_2d( texcoord, int( octaves ), lacunarity, diminish ).mul( amplitude );
export const mx_fractal_noise_float = ( position = uv(), octaves = 3, lacunarity = 2, diminish = .5, amplitude = 1 ) => fractal_noise_float( position, int( octaves ), lacunarity, diminish ).mul( amplitude );
export const mx_fractal_noise_vec2 = ( position = uv(), octaves = 3, lacunarity = 2, diminish = .5, amplitude = 1 ) => fractal_noise_vec2( position, int( octaves ), lacunarity, diminish ).mul( amplitude );
export const mx_fractal_noise_vec3 = ( position = uv(), octaves = 3, lacunarity = 2, diminish = .5, amplitude = 1 ) => fractal_noise_vec3( position, int( octaves ), lacunarity, diminish ).mul( amplitude );
export const mx_fractal_noise_vec4 = ( position = uv(), octaves = 3, lacunarity = 2, diminish = .5, amplitude = 1 ) => fractal_noise_vec4( position, int( octaves ), lacunarity, diminish ).mul( amplitude );

export { mx_hsvtorgb, mx_rgbtohsv, mx_srgb_texture_to_lin_rec709 };

export const mx_randomfloat = ( input = float( 0 ), minval = float( 0 ), maxval = float( 1 ), seed = int( 0 ) ) => {

	const n = float( input ).add( float( seed ).mul( 12.9898 ) );
	const random = fract( n.sin().mul( 43758.5453 ) );
	return mix( minval, maxval, random );

};

// Math ops
export const mx_add = ( in1, in2 = float( 0 ) ) => add( in1, in2 );
export const mx_subtract = ( in1, in2 = float( 0 ) ) => sub( in1, in2 );
export const mx_multiply = ( in1, in2 = float( 1 ) ) => mul( in1, in2 );
export const mx_divide = ( in1, in2 = float( 1 ) ) => div( in1, in2 );
export const mx_modulo = ( in1, in2 = float( 1 ) ) => sub( in1, mul( in2, floor( div( in1, in2 ) ) ) );
export const mx_power = ( in1, in2 = float( 1 ) ) => pow( in1, in2 );
export const mx_atan2 = ( in1 = float( 0 ), in2 = float( 1 ) ) => atan( in1, in2 );
export const mx_timer = () => time;
export const mx_frame = () => frameId;
export const mx_invert = ( in1, amount = float( 1 ) ) => sub( amount, in1 );
export const mx_clamp = ( input, low = float( 0 ), high = float( 1 ) ) => clamp( input, low, high );

export const mx_ifgreater = ( value1, value2 = float( 0 ), in1, in2 ) => {

	const condition = value1.greaterThan( value2 );
	return in1 === undefined && in2 === undefined ? condition : condition.select( in1, in2 );

};

export const mx_ifgreatereq = ( value1, value2 = float( 0 ), in1, in2 ) => {

	const condition = value1.greaterThanEqual( value2 );
	return in1 === undefined && in2 === undefined ? condition : condition.select( in1, in2 );

};

export const mx_ifequal = ( value1, value2 = float( 0 ), in1, in2 ) => {

	const condition = value1.equal( value2 );
	return in1 === undefined && in2 === undefined ? condition : condition.select( in1, in2 );

};

export const mx_ifequal_compare_inputs = ( value1, value2 = float( 0 ), in1, in2 ) => value1.equal( value2 ).select( in1, in2 );

// Enhanced separate node to support multi-output referencing (outx, outy, outz, outw)
export const mx_separate = ( in1, channelOrOut = null ) => {

	if ( typeof channelOrOut === 'string' ) {

		const map = { x: 0, r: 0, y: 1, g: 1, z: 2, b: 2, w: 3, a: 3 };
		const c = channelOrOut.replace( /^out/, '' ).toLowerCase();
		if ( map[ c ] !== undefined ) return in1.element( map[ c ] );

	}

	if ( typeof channelOrOut === 'number' ) {

		return in1.element( channelOrOut );

	}

	if ( typeof channelOrOut === 'string' && channelOrOut.length === 1 ) {

		const map = { x: 0, r: 0, y: 1, g: 1, z: 2, b: 2, w: 3, a: 3 };
		if ( map[ channelOrOut ] !== undefined ) return in1.element( map[ channelOrOut ] );

	}

	return in1;

};

export const mx_place2d = (
	texcoord, pivot = vec2( 0.5, 0.5 ), scale = vec2( 1, 1 ), rotate = float( 0 ), offset = vec2( 0, 0 ), operationorder = int( 0 )
) => {

	const centered = vec2( texcoord ).sub( pivot );
	const srt = mx_rotate2d( centered.div( scale ), rotate ).sub( offset ).add( pivot );
	const trs = mx_rotate2d( centered.sub( offset ), rotate ).div( scale ).add( pivot );
	return int( operationorder ).equal( int( 1 ) ).select( trs, srt );

};

export const mx_UsdTransform2d = ( input = uv(), rotation = float( 0 ), scale = vec2( 1, 1 ), translation = vec2( 0, 0 ) ) => mx_rotate2d( vec2( input ).mul( scale ), float( rotation ).negate() ).add( translation );

export { mx_rotate2d, mx_rotate3d };

export const mx_heighttonormal = ( input, scale/*, texcoord*/ ) => {

	input = vec3( input );
	scale = float( scale );

	return bumpMap( input, scale );

};

export const mx_transformmatrix = ( input, matrix ) => {

	const type = input.getNodeType?.();

	if ( type === 'vec2' ) return matrix.mul( vec3( input, 1 ) ).xy;
	if ( type === 'vec3' && matrix.getNodeType?.() === 'mat4' ) return matrix.mul( vec4( input, 1 ) ).xyz;

	return matrix.mul( input );

};

export const mx_latlongimage = ( defaultValue = vec3( 0, 0, 0 )/*, viewdir, rotation*/ ) => defaultValue;
