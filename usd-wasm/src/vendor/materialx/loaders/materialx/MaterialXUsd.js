import { Fn, attribute, float, int, mix, normalMap, positionLocal, normalLocal, vec2, vec3, vec4 } from 'three/tsl';
import { MaterialXLogCodes } from './MaterialXLog.js';

const mappedInputs = new Set( [ 'diffuseColor', 'emissiveColor', 'useSpecularWorkflow', 'specularColor', 'metallic', 'roughness', 'clearcoat', 'clearcoatRoughness', 'opacity', 'opacityMode', 'opacityThreshold', 'ior', 'normal', 'displacement', 'occlusion' ] );

function applyUsdPreviewSurface( material, inputs, log, nodeName, authored ) {

	const specularWorkflow = int( inputs.useSpecularWorkflow ).equal( 1 );
	const presence = int( inputs.opacityMode ).equal( 1 );
	const opacity = inputs.opacity.clamp();
	const cutoff = inputs.opacityThreshold.greaterThan( 0 );

	material.colorNode = inputs.diffuseColor;
	material.emissiveNode = inputs.emissiveColor;
	material.roughnessNode = inputs.roughness;
	material.metalnessNode = specularWorkflow.select( float( 0 ), inputs.metallic );
	material.iorNode = inputs.ior;
	const dielectricF0 = inputs.ior.sub( 1 ).div( inputs.ior.add( 1 ) ).pow( 2 );
	material.specularF0Node = specularWorkflow.select( inputs.specularColor, vec3( dielectricF0 ) );
	material.specularF90Node = specularWorkflow.select( vec3( 1 ), mix( vec3( 1 ), inputs.diffuseColor, inputs.metallic ) );
	material.clearcoatNode = inputs.clearcoat;
	material.clearcoatF0Node = vec3( dielectricF0 );
	material.clearcoatRoughnessNode = inputs.clearcoatRoughness;
	material.aoNode = inputs.occlusion;

	if ( authored.normal ) {

		material.normalNode = normalMap( vec3( inputs.normal ).mul( 0.5 ).add( 0.5 ) );
		material.clearcoatNormalNode = material.normalNode;

	}

	if ( authored.displacement ) material.positionNode = positionLocal.add( normalLocal.mul( inputs.displacement ) );

	if ( authored.opacity || authored.opacityThreshold ) {

		material.opacityNode = cutoff.select( opacity.greaterThanEqual( inputs.opacityThreshold ).select( 1, 0 ), presence.select( opacity, float( 1 ) ) );
		material.alphaTestNode = float( 0 );
		material.transmissionNode = cutoff.or( presence ).select( float( 0 ), opacity.oneMinus() );
		material.thicknessNode = float( 0 );
		material.transmissionColorNode = vec3( 1 );
		material.transmissionRoughnessNode = float( 0 );
		material.transparent = true;
		material.depthWrite = false;

	}

	for ( const name of Object.keys( authored ) ) {

		if ( ! mappedInputs.has( name ) ) log.add( MaterialXLogCodes.IGNORED_SURFACE_INPUT, `UsdPreviewSurface input "${ name }" is currently ignored in MaterialX translation.`, nodeName );

	}

}

function compileUsdUVTexture( nodeX, out, context ) {

	const fallback = nodeX.getNodeByName( 'fallback' );
	const file = nodeX.getChildByName( 'file' );
	const source = file && file.getValue() !== '' ? file.getTexture() : null;
	// USD st coordinates start at the bottom; the loader stores image rows top-first.
	let value = source ? source.materialXLoadedNode.select( source.sample( context.mxFromBottomLeftUvSpace( nodeX.getNodeByName( 'st' ) ).flipY() ), fallback ) : fallback;
	const modes = nodeX.getTextureAddressModes();
	const coordinates = nodeX.getNodeByName( 'st' );
	const outsideU = coordinates.x.lessThan( 0 ).or( coordinates.x.greaterThan( 1 ) );
	const outsideV = coordinates.y.lessThan( 0 ).or( coordinates.y.greaterThan( 1 ) );
	const outside = ( modes.u === 'constant' ? outsideU : float( 0 ).equal( 1 ) ).or( modes.v === 'constant' ? outsideV : float( 0 ).equal( 1 ) );
	value = outside.select( fallback, value );
	const colorTransform = file ? file.getColorSpaceNode() : null;
	if ( colorTransform ) value = vec4( colorTransform( value.rgb ), value.a );
	value = value.mul( nodeX.getNodeByName( 'scale' ) ).add( nodeX.getNodeByName( 'bias' ) );
	return out === 'r' ? value.r : out === 'g' ? value.g : out === 'b' ? value.b : out === 'a' ? value.a : out === 'rgba' ? value : value.rgb;

}

function compileUsdPrimvarReader( nodeX ) {

	const name = nodeX.getNodeByName( 'varname' );
	const fallback = nodeX.getNodeByName( 'fallback' );
	const type = { float: 'float', integer: 'int', vector2: 'vec2', vector3: 'vec3', vector4: 'vec4', color3: 'vec3', color4: 'vec4' }[ nodeX.type ];
	if ( ! type || typeof name !== 'string' || name === '' ) return fallback;
	return Fn( ( _inputs, builder ) => {

		const geometryName = name === 'st' && ! builder.hasGeometryAttribute( 'st' ) ? 'uv' : name;
		return builder.hasGeometryAttribute( geometryName ) ? attribute( geometryName, type ) : fallback;

	} )();

}

function compileUsdTransform2d( nodeX ) {

	const input = nodeX.getNodeByName( 'in' ).mul( nodeX.getNodeByName( 'scale' ) );
	const angle = nodeX.getNodeByName( 'rotation' ).mul( Math.PI / 180 );
	return vec2( angle.cos().mul( input.x ).sub( angle.sin().mul( input.y ) ), angle.sin().mul( input.x ).add( angle.cos().mul( input.y ) ) ).add( nodeX.getNodeByName( 'translation' ) );

}

export { applyUsdPreviewSurface, compileUsdUVTexture, compileUsdPrimvarReader, compileUsdTransform2d };
