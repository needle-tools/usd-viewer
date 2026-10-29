import { BackSide, LightingModel, MathUtils, NodeMaterial, Vector3 } from 'three/webgpu';
import {
	cameraFar, cameraNear, cameraPosition, cameraViewMatrix, cameraWorldMatrix,
	float, If, Loop, mix, modelWorldMatrixInverse, positionWorld,
	step, uniform, vec3, vec4, viewportDepthTexture, viewportOpaqueMipTexture, linearDepth, logarithmicDepthToViewZ, lightingContext,
} from 'three/tsl';

const coefficientFunctionIds = new WeakMap();

function getCoefficientFunctionId( callback ) {

	if ( callback === null ) return '';
	if ( ! coefficientFunctionIds.has( callback ) ) coefficientFunctionIds.set( callback, MathUtils.generateUUID() );
	return coefficientFunctionIds.get( callback );

}

function intersectBox( origin, direction, minimum, maximum ) {

	const safeDirection = vec3( ...[ 'x', 'y', 'z' ].map( ( axis ) => direction[ axis ].equal( 0 ).select( float( 1e-30 ), direction[ axis ] ) ) );
	const a = minimum.sub( origin ).div( safeDirection );
	const b = maximum.sub( origin ).div( safeDirection );
	const entry = a.min( b );
	const exit = a.max( b );
	return { near: entry.x.max( entry.y ).max( entry.z ), far: exit.x.min( exit.y ).min( exit.z ) };

}

class BoundedVolumeLightingModel extends LightingModel {

	start( builder ) {

		const { material, camera } = builder;
		const minimum = uniform( new Vector3() ).onObjectUpdate( ( { object } ) => {

			if ( object.geometry.boundingBox === null ) object.geometry.computeBoundingBox();
			return object.geometry.boundingBox.min;

		} );
		const maximum = uniform( new Vector3() ).onObjectUpdate( ( { object } ) => {

			if ( object.geometry.boundingBox === null ) object.geometry.computeBoundingBox();
			return object.geometry.boundingBox.max;

		} );
		const orthographic = camera.isOrthographicCamera === true;
		const direction = ( orthographic ? cameraWorldMatrix.mul( vec4( 0, 0, - 1, 0 ) ).xyz : positionWorld.sub( cameraPosition ) ).normalize().toVar();
		const viewScale = cameraViewMatrix.mul( vec4( direction, 0 ) ).z.negate().max( 1e-8 );
		const origin = ( orthographic ? positionWorld.sub( direction.mul( cameraViewMatrix.mul( vec4( positionWorld, 1 ) ).z.negate().div( viewScale ) ) ) : cameraPosition ).toVar();
		const localOrigin = modelWorldMatrixInverse.mul( vec4( origin, 1 ) ).xyz.toVar();
		const localDirection = modelWorldMatrixInverse.mul( vec4( direction, 0 ) ).xyz.toVar();
		const bounds = intersectBox( localOrigin, localDirection, minimum, maximum );
		let depth = ( material.opaqueDepthNode || viewportDepthTexture() ).toVar( 'opaqueDepth' );
		if ( builder.renderer.reversedDepthBuffer ) depth = depth.oneMinus();
		const viewDepth = builder.renderer.logarithmicDepthBuffer ? logarithmicDepthToViewZ( depth, cameraNear, cameraFar ).negate() : cameraNear.add( linearDepth( depth ).mul( cameraFar.sub( cameraNear ) ) );
		const opaqueDistance = depth.greaterThanEqual( 1 ).select( cameraFar, viewDepth ).div( viewScale );
		const near = bounds.near.max( cameraNear.div( viewScale ) ).toVar();
		const far = bounds.far.min( opaqueDistance ).toVar();
		const steps = uniform( 'int' ).onObjectUpdate( ( { material } ) => Math.max( 1, Math.floor( material.steps ) ) );
		const delta = far.sub( near ).max( 0 ).div( steps ).toVar();
		const transmittance = vec3( 1 ).toVar();
		this.radiance = vec3( 0 ).toVar();
		this.direction = direction;
		this.minimum = minimum;
		this.maximum = maximum;
		const previousContext = { ...builder.context };

		Loop( steps, ( { i } ) => {

			const distance = near.add( float( i ).add( 0.5 ).mul( delta ) );
			this.sampleWorld = origin.add( direction.mul( distance ) ).toVar();
			this.sampleLocal = localOrigin.add( localDirection.mul( distance ) ).toVar();
			const sample = { positionLocal: this.sampleLocal, positionWorld: this.sampleWorld };
			const extinction = ( material.extinctionNode ? material.extinctionNode( sample ) : vec3( 0 ) ).max( 0 ).toVar();
			const opticalDepth = extinction.mul( delta ).toVar();
			const segmentTransmittance = opticalDepth.negate().exp().toVar();
			const denominator = vec3( ...[ 'x', 'y', 'z' ].map( ( axis ) => extinction[ axis ].equal( 0 ).select( float( 1 ), extinction[ axis ] ) ) );
			// Expand around zero optical depth to avoid cancellation, regardless of world units.
			const smallDepth = opticalDepth.min( 1e-4 );
			const limit = smallDepth.mul( 0.5 ).oneMinus().add( smallDepth.mul( smallDepth ).div( 6 ) ).mul( delta );
			const weight = mix( segmentTransmittance.oneMinus().div( denominator ), limit, step( 1e-4, opticalDepth ).oneMinus() );
			this.source = ( material.emissionNode ? material.emissionNode( sample ) : vec3( 0 ) ).max( 0 ).toVar();
			builder.context.positionWorld = this.sampleWorld;
			builder.context.positionView = cameraViewMatrix.mul( vec4( this.sampleWorld, 1 ) ).xyz;
			builder.context.shadowPositionWorld = this.sampleWorld;
			super.start( builder );
			this.radiance.addAssign( transmittance.mul( this.source ).mul( weight ) );
			transmittance.mulAssign( segmentTransmittance );

		} );

		for ( const key of [ 'positionWorld', 'positionView', 'shadowPositionWorld' ] ) {

			if ( key in previousContext ) builder.context[ key ] = previousContext[ key ];
			else delete builder.context[ key ];

		}

		this.radiance.addAssign( transmittance.mul( ( material.opaqueColorNode || viewportOpaqueMipTexture() ).rgb ) );

	}

	direct( { lightNode, lightDirection, lightColor }, builder ) {

		const { material } = builder;
		if ( material.scatteringNode === null ) return;
		const direction = cameraWorldMatrix.mul( vec4( lightDirection, 0 ) ).xyz.normalize().toVar();
		const scattering = material.scatteringNode( {
			positionLocal: this.sampleLocal, positionWorld: this.sampleWorld,
			lightDirection: direction, viewDirection: this.direction.negate(),
		} ).max(0).toVar();
		If( scattering.x.max( scattering.y ).max( scattering.z ).greaterThan( 0 ), () => {
			const localDirection = modelWorldMatrixInverse.mul( vec4( direction, 0 ) ).xyz;
			let distance = intersectBox( this.sampleLocal, localDirection, this.minimum, this.maximum ).far.max( 0 );
			if ( lightNode.light.isPointLight || lightNode.light.isSpotLight ) distance = distance.min( lightNode.getLightVector( builder ).length() );
			const steps = uniform( 'int' ).onObjectUpdate( ( { material } ) => Math.max( 1, Math.floor( material.shadowSteps ) ) );
			const delta = distance.div( steps ).toVar();
			const opticalDepth = vec3( 0 ).toVar();
			if ( material.extinctionNode ) {

				Loop( steps, ( { i } ) => {

					const offset = float( i ).add( 0.5 ).mul( delta );
					opticalDepth.addAssign( material.extinctionNode( {
						positionLocal: this.sampleLocal.add( localDirection.mul( offset ) ),
						positionWorld: this.sampleWorld.add( direction.mul( offset ) ),
					} ).max( 0 ).mul( delta ) );

				} );

			}

			this.source.addAssign( scattering.max( 0 ).mul( lightColor ).mul( opticalDepth.negate().exp() ) );
		} );

	}

	finish( builder ) {

		builder.context.outgoingLight.assign( this.radiance );

	}

}

/**
 * Single-scattering medium bounded by a box mesh. Coefficients use inverse world units.
 * Composites against opaque scene color and depth. Overlapping media, environment
 * scattering and area lights are not supported.
 * Requires a single-sample depth buffer: disable renderer antialiasing and use
 * a higher pixel ratio for smoother edges.
 *
 * @augments NodeMaterial
 * @three_import import BoundedVolumeNodeMaterial from 'three/addons/materials/BoundedVolumeNodeMaterial.js';
 */
class BoundedVolumeNodeMaterial extends NodeMaterial {

	static get type() {

		return 'BoundedVolumeNodeMaterial';

	}

	constructor( parameters ) {

		super();
		this.isBoundedVolumeNodeMaterial = true;
		/** Number of camera-ray integration steps. @type {number} */
		this.steps = 64;
		/** Number of light-ray integration steps. @type {number} */
		this.shadowSteps = 16;
		/** Optional opaque depth supplied by a multi-pass compositor. @type {?Node<float>} */
		this.opaqueDepthNode = null;
		this.opaqueColorNode = null;
		/** @type {?(Function|FunctionNode<vec3>)} Extinction coefficient at a local/world position. */
		this.extinctionNode = null;
		/** @type {?(Function|FunctionNode<vec3>)} Emission coefficient at a local/world position. */
		this.emissionNode = null;
		/** @type {?(Function|FunctionNode<vec3>)} Scattering coefficient times phase, with directions pointing from the sample to the light and camera. */
		this.scatteringNode = null;
		this.lights = true;
		this.transparent = true;
		this.side = BackSide;
		this.depthTest = false;
		this.depthWrite = false;
		// Opaque scene color already includes scene fog.
		this.fog = false;
		this.setValues( parameters );

	}

	setupLightingModel() {

		return new BoundedVolumeLightingModel();

	}

	setupLighting( builder ) {

		// Absorption and emission still integrate when the scene has no lights.
		return lightingContext( this.lightsNode || builder.lightsNode, this.setupLightingModel( builder ) );

	}

	customProgramCacheKey() {

		return super.customProgramCacheKey() + ':' + ( this.opaqueDepthNode?.id ?? '' ) + ':' + ( this.opaqueColorNode?.id ?? '' ) + [ this.extinctionNode, this.emissionNode, this.scatteringNode ].map( getCoefficientFunctionId ).join( ',' );

	}

	copy( source ) {

		super.copy( source );
		this.steps = source.steps;
		this.shadowSteps = source.shadowSteps;
		this.opaqueDepthNode = source.opaqueDepthNode;
		this.opaqueColorNode = source.opaqueColorNode;
		this.extinctionNode = source.extinctionNode;
		this.emissionNode = source.emissionNode;
		this.scatteringNode = source.scatteringNode;
		return this;

	}

}

export default BoundedVolumeNodeMaterial;
