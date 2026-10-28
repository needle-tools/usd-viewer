import {
	RepeatWrapping,
	ClampToEdgeWrapping,
	MirroredRepeatWrapping,
} from 'three/webgpu';

import {
	Fn,
	positionLocal,
	positionWorld,
	bool,
	element,
	float,
	vec3,
} from 'three/tsl';

// Volume coefficients are evaluated at ray samples rather than mesh vertices.
const materialXPositionLocal = Fn( ( _inputs, builder ) => builder.context.materialXPositionLocal || positionLocal )();
const materialXPositionWorld = Fn( ( _inputs, builder ) => builder.context.materialXPositionWorld || positionWorld )();

const BOOLEAN_OPERATOR_OPS = new Set( [ '&&', '||', '^^', '!', '==', '!=', '<', '>', '<=', '>=' ] );
const TEXTURE_ADDRESS_MODE_WRAPPING = {
	constant: ClampToEdgeWrapping,
	clamp: ClampToEdgeWrapping,
	periodic: RepeatWrapping,
	mirror: MirroredRepeatWrapping,
};

function normalizeSpaceName( value, fallback = 'world' ) {

	if ( typeof value !== 'string' ) return fallback;
	const normalized = value.trim().toLowerCase();
	if ( normalized === '' ) return fallback;
	if ( normalized === 'world' ) return 'world';
	if ( normalized === 'object' || normalized === 'model' ) return 'object';
	return fallback;

}

function isBooleanNode( node ) {

	return node && ( node.nodeType === 'bool' || ( node.isOperatorNode && BOOLEAN_OPERATOR_OPS.has( node.op ) ) );

}

function toBooleanNode( node ) {

	if ( ! node ) return bool( false );
	if ( typeof node === 'boolean' ) return bool( node );
	if ( typeof node === 'number' ) return bool( node !== 0 );
	if ( isBooleanNode( node ) ) return node;
	return node.notEqual( float( 0 ) );

}

function getComponentCountForType( type ) {

	if ( type === 'vector2' ) return 2;
	if ( type === 'vector3' || type === 'color3' ) return 3;
	return 4;

}

function toVec3Channels( input ) {

	return vec3( element( input, 0 ), element( input, 1 ), element( input, 2 ) );

}

// Normalizes a raw `*addressmode` attribute value, defaulting to `'periodic'`
// when unset and returning `null` when the value isn't a recognized mode.
function resolveTextureAddressMode( value ) {

	if ( typeof value !== 'string' || value === '' ) return 'periodic';

	const mode = value.trim().toLowerCase();
	return mode in TEXTURE_ADDRESS_MODE_WRAPPING ? mode : null;

}

export {
	materialXPositionLocal,
	materialXPositionWorld,
	getComponentCountForType,
	isBooleanNode,
	normalizeSpaceName,
	resolveTextureAddressMode,
	TEXTURE_ADDRESS_MODE_WRAPPING,
	toBooleanNode,
	toVec3Channels,
};
