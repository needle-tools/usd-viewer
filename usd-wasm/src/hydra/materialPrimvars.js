import { Float32BufferAttribute } from 'three';

// Direct PreviewSurface primvar inputs use geometry attributes so a shared USD
// material can read different values on every mesh (and on every vertex).
const inputs = {
    diffuseColor: { size: 3, property: 'color', chunk: 'color_fragment', target: 'diffuseColor.rgb' },
    emissiveColor: { size: 3, property: 'emissive', chunk: 'emissivemap_fragment', target: 'totalEmissiveRadiance' },
    roughness: { size: 1, property: 'roughness', chunk: 'roughnessmap_fragment', target: 'roughnessFactor' },
    metallic: { size: 1, property: 'metalness', chunk: 'metalnessmap_fragment', target: 'metalnessFactor' },
    opacity: { size: 1, property: 'opacity', chunk: 'color_fragment', target: 'diffuseColor.a' },
};

export function configurePreviewPrimvars(material, surface) {
    const bindings = [];
    for (const [input, config] of Object.entries(inputs)) {
        const reader = surface[input]?.nodeIn;
        if (reader?.identifier !== `UsdPrimvarReader_float${config.size === 1 ? '' : config.size}` ||
            typeof reader.varname !== 'string' || !reader.varname) continue;
        const fallback = config.size === 1 ? [reader.fallback ?? 0] : (reader.fallback ?? [0, 0, 0]);
        bindings.push({ input, name: reader.varname, fallback: Array.from(fallback),
            attribute: `usdPrimvar_${material.id}_${input}` });
        if (config.size === 3) material[config.property].setRGB(1, 1, 1);
        else material[config.property] = 1;
        if (input === 'opacity') material.transparent = true;
        // Keep the public vertex-color contract for an explicit displayColor reader.
        // The shader assigns the sampled result, so this does not multiply its tint.
        if (input === 'diffuseColor' && reader.varname === 'displayColor') material.vertexColors = true;
    }
    if (!bindings.length) return;
    material.userData.usdPreviewPrimvars = bindings;
    installPreviewPrimvarShader(material);
}

// Material.copy/clone does not copy onBeforeCompile. Reinstall on side variants.
export function installPreviewPrimvarShader(material) {
    const bindings = material.userData.usdPreviewPrimvars;
    if (!bindings?.length) return;
    material.customProgramCacheKey = () => JSON.stringify(bindings);
    material.onBeforeCompile = shader => {
        let vertexDeclarations = '', fragmentDeclarations = '', assignments = '';
        for (const binding of bindings) {
            const config = inputs[binding.input];
            const type = config.size === 1 ? 'float' : `vec${config.size}`;
            const varying = `${binding.attribute}_value`;
            vertexDeclarations += `attribute ${type} ${binding.attribute};\nvarying ${type} ${varying};\n`;
            fragmentDeclarations += `varying ${type} ${varying};\n`;
            assignments += `${varying} = ${binding.attribute};\n`;
            const chunk = `#include <${config.chunk}>`;
            shader.fragmentShader = shader.fragmentShader.replace(chunk, `${chunk}\n${config.target} = ${varying};`);
        }
        shader.vertexShader = vertexDeclarations + shader.vertexShader.replace('#include <begin_vertex>',
            `#include <begin_vertex>\n${assignments}`);
        shader.fragmentShader = fragmentDeclarations + shader.fragmentShader;
    };
}

function primvarAttribute(mesh, name, size, fallback) {
    const count = mesh.geometry.getAttribute('position')?.count;
    if (!count) return null;
    const source = mesh.geometry.getAttribute(`primvars:${name}`);
    const constant = mesh.userData.usdPrimvars?.[name];
    const validSource = source?.itemSize === size && source.count === count;
    const validConstant = constant?.length === size;
    if (!validSource && !validConstant && !fallback) return null;
    const values = new Float32Array(count * size);
    const getters = ['getX', 'getY', 'getZ', 'getW'];
    for (let vertex = 0; vertex < count; vertex++) {
        for (let component = 0; component < size; component++) {
            const value = validSource ? source[getters[component]](vertex)
                : validConstant ? constant[component] : fallback[component];
            values[vertex * size + component] = Number.isFinite(value) ? value : 0;
        }
    }
    return new Float32BufferAttribute(values, size);
}

export function preparePreviewPrimvars(material, mesh) {
    for (const binding of material?.userData?.usdPreviewPrimvars || []) {
        const attribute = primvarAttribute(mesh, binding.name, inputs[binding.input].size, binding.fallback);
        if (attribute) mesh.geometry.setAttribute(binding.attribute, attribute);
    }
}

export function configureMaterialXPrimvars(material) {
    // Some MaterialX GLSL targets flatten their vertex output block without
    // renaming custom geomprops. Keep input attributes and interpolated outputs
    // distinct; otherwise even an unused custom property fails GLSL compilation.
    const declarations = material.vertexShader?.matchAll(/(?:^|\n)\s*in\s+(float|vec[234])\s+(i_geomprop_(\w+))\s*;/g) || [];
    for (const [, type, name, geomprop] of declarations) {
        const output = new RegExp(`\\bout\\s+${type}\\s+${name}\\s*;`);
        const assignment = new RegExp(`\\b${name}\\s*=\\s*${name}\\s*;`, 'g');
        if (!output.test(material.vertexShader) || !assignment.test(material.vertexShader)) continue;
        const varying = `usdGeompropVarying_${geomprop}`;
        material.vertexShader = material.vertexShader.replace(output, `out ${type} ${varying};`)
            .replace(assignment, `${varying} = ${name};`);
        material.fragmentShader = material.fragmentShader.replace(new RegExp(`\\b${name}\\b`, 'g'), varying);
        material.needsUpdate = true;
    }
}

export function prepareMaterialXPrimvars(material, mesh) {
    if (!material?.isMaterialXMaterial && material?.constructor?.name !== 'MaterialXMaterial') return;
    // These names come from MaterialX's generated vertex inputs. Built-in inputs
    // are handled by MaterialXMaterial; custom geomprops need Hydra data aliases.
    const declarations = material.vertexShader?.matchAll(/(?:^|\n)\s*in\s+(float|vec[234])\s+(i_geomprop_(\w+))\s*;/g) || [];
    const names = new Set([
        ...Object.keys(mesh.userData.usdPrimvars || {}),
        ...Object.keys(mesh.geometry.attributes).filter(name => name.startsWith('primvars:')).map(name => name.slice(9)),
    ]);
    for (const [, type, shaderName, geomprop] of declarations) {
        const name = [...names].find(name => name.replace(/[^a-zA-Z0-9_]/g, '_') === geomprop);
        const attribute = name === undefined ? null : primvarAttribute(mesh, name, type === 'float' ? 1 : Number(type.slice(3)));
        if (attribute) mesh.geometry.setAttribute(shaderName, attribute);
        else mesh.geometry.deleteAttribute(shaderName);
    }
}
