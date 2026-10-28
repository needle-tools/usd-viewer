import { Fn, float, vec3 } from 'three/tsl';
import { MaterialXLogCodes } from './MaterialXLog.js';

function resolveClosure( node, active, log ) {

	while ( node && ( node.element === 'input' || node.element === 'output' ) ) {

		if ( active.has( node ) ) {

			log.add( MaterialXLogCodes.INVALID_VALUE, 'Cycle in MaterialX volume closure.', node.name );
			return null;

		}

		active.add( node );
		const reference = node.getReferencedNode();
		if ( ! reference && node.hasReference ) log.add( MaterialXLogCodes.MISSING_REFERENCE, 'Missing volume closure reference.', node.name );
		node = reference;

	}

	return node;

}

function compileClosure( input, type, log, active = new Set() ) {

	const node = resolveClosure( input, active, log );
	const empty = { coefficient: vec3( 0 ), scattering: [] };
	if ( ! node ) return empty;
	if ( active.has( node ) ) {

		log.add( MaterialXLogCodes.INVALID_VALUE, 'Cycle in MaterialX volume closure.', node.name );
		return empty;

	}

	const path = new Set( active ).add( node );
	const value = ( name, fallback ) => node.getNodeByName( name ) || fallback;
	const closure = ( name ) => compileClosure( node.getChildByName( name ), type, log, new Set( path ) );
	if ( type === 'VDF' && ( node.element === 'absorption_vdf' || node.element === 'anisotropic_vdf' ) ) {

		const absorption = vec3( value( 'absorption', vec3( 0 ) ) ).max( 0 );
		const scattering = node.element === 'anisotropic_vdf' ? vec3( value( 'scattering', vec3( 0 ) ) ).max( 0 ) : vec3( 0 );
		return {
			coefficient: absorption.add( scattering ),
			scattering: node.element === 'anisotropic_vdf' ? [ { coefficient: scattering, anisotropy: value( 'anisotropy', float( 0 ) ).clamp( - 0.999, 0.999 ) } ] : [],
		};

	}

	if ( type === 'EDF' && node.element === 'uniform_edf' ) return { coefficient: vec3( value( 'color', vec3( 1 ) ) ), scattering: [] };
	if ( node.element === 'add' || node.element === 'mix' || node.element === 'multiply' ) {

		const a = closure( node.element === 'mix' ? 'bg' : 'in1' );
		if ( node.element === 'multiply' ) {

			const weight = value( 'in2', float( 1 ) );
			return { coefficient: a.coefficient.mul( weight ), scattering: a.scattering.map( ( term ) => ( { ...term, coefficient: term.coefficient.mul( weight ) } ) ) };

		}

		const b = closure( node.element === 'mix' ? 'fg' : 'in2' );
		const weight = node.element === 'mix' ? value( 'mix', float( 0 ) ).clamp( 0, 1 ) : float( 1 );
		const aWeight = node.element === 'mix' ? weight.oneMinus() : float( 1 );
		return {
			coefficient: a.coefficient.mul( aWeight ).add( b.coefficient.mul( weight ) ),
			scattering: [ ...a.scattering.map( ( term ) => ( { ...term, coefficient: term.coefficient.mul( aWeight ) } ) ), ...b.scattering.map( ( term ) => ( { ...term, coefficient: term.coefficient.mul( weight ) } ) ) ],
		};

	}

	log.add( MaterialXLogCodes.UNSUPPORTED_NODE, `Unsupported MaterialX ${type} node "${node.element}".`, node.name );
	return empty;

}

function configureVolumeMaterial( material, nodeX ) {

	const vdf = compileClosure( nodeX.getChildByName( 'vdf' ), 'VDF', nodeX.materialX.log );
	const edf = compileClosure( nodeX.getChildByName( 'edf' ), 'EDF', nodeX.materialX.log );
	// Each call evaluates the graph at a different camera or light-ray position.
	const sample = ( node, inputs ) => node.context( { materialXPositionLocal: inputs.positionLocal, materialXPositionWorld: inputs.positionWorld } ).isolate();
	// Inline callbacks keep captured uniforms and textures in the caller's shader scope.
	material.extinctionNode = Fn( ( inputs ) => sample( vdf.coefficient, inputs ) );
	material.emissionNode = Fn( ( inputs ) => sample( edf.coefficient, inputs ) );
	if ( vdf.scattering.length > 0 ) {

		material.scatteringNode = Fn( ( inputs ) => {

			const cosine = inputs.lightDirection.negate().dot( inputs.viewDirection );
			let scattering = vec3( 0 );
			for ( const term of vdf.scattering ) {

				const g = sample( term.anisotropy, inputs );
				const phase = g.mul( g ).oneMinus().div( float( 4 * Math.PI ).mul( float( 1 ).add( g.mul( g ) ).sub( g.mul( cosine ).mul( 2 ) ).pow( 1.5 ) ) );
				scattering = scattering.add( sample( term.coefficient, inputs ).mul( phase ) );

			}

			return scattering;

		} );

	}

}

export { configureVolumeMaterial };
