import { float, vec2, vec3, mix, max } from 'three/tsl';
import { MaterialXLogCodes } from './MaterialXLog.js';

const mappedInputs = new Set( [ 'baseColor', 'metallic', 'roughness', 'anisotropic', 'specular', 'specularTint', 'sheen', 'sheenTint', 'clearcoat', 'clearcoatGloss', 'specTrans', 'ior' ] );

function applyDisneyPrincipled( material, inputs, log, nodeName, authored ) {

	const color = inputs.baseColor;
	const specularWeight = inputs.specular.mul( 0.08 );
	material.colorNode = color;
	material.metalnessNode = inputs.metallic;
	material.iorNode = inputs.ior;
	material.specularF0Node = mix( vec3( 1 ), color, inputs.specularTint ).mul( specularWeight );
	material.specularF90Node = mix( vec3( specularWeight ), vec3( 1 ), inputs.metallic );

	material.roughnessNode = inputs.roughness;
	if ( authored.anisotropic ) {

		// Convert MaterialX's two GGX axis widths to three.js roughness and anisotropy.
		const aspect = inputs.anisotropic.clamp().mul( - 0.9 ).add( 1 ).sqrt();
		const alpha = inputs.roughness.pow( 2 );
		const alphaB = alpha.mul( aspect ).clamp();
		const alphaT = alpha.div( aspect ).clamp();
		material.roughnessNode = alphaB.sqrt();
		material.anisotropyNode = vec2( max( alphaT.sub( alphaB ), 0 ).div( max( alphaB.oneMinus(), 1e-6 ) ).sqrt(), 0 );


	}

	material.sheenNode = mix( vec3( 1 ), color, inputs.sheenTint ).mul( inputs.sheen );
	material.sheenRoughnessNode = float( 0.3 ).pow( 1.5 );
	material.clearcoatNode = inputs.clearcoat.mul( 0.04 );
	material.clearcoatF0Node = vec3( 1 );
	material.clearcoatRoughnessNode = inputs.clearcoatGloss.oneMinus();

	if ( authored.specTrans ) {

		material.transmissionNode = inputs.specTrans;
		material.thicknessNode = float( 0 );

	}

	for ( const name of Object.keys( authored ) ) {

		if ( ! mappedInputs.has( name ) ) {

			log.add( MaterialXLogCodes.IGNORED_SURFACE_INPUT, `disney_principled input "${ name }" is currently ignored in MaterialX translation.`, nodeName );

		}

	}

}

export { applyDisneyPrincipled };
