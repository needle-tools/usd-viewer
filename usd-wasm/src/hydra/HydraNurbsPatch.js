import { DoubleSide, FrontSide } from 'three';
import { HydraStroke } from './HydraStroke.js';
import { buildNurbsPatchGeometry } from './nurbsPatchGeometry.js';

export class HydraNurbsPatch extends HydraStroke {
    constructor(id, delegate) { super('nurbsPatch', id, delegate); }
    _buildGeometry(data) { return buildNurbsPatchGeometry(data); }
    _prepareMaterial(source) {
        const material = super._prepareMaterial(source);
        material.side = this._data?.doubleSided ? DoubleSide : FrontSide;
        return material;
    }
    setStrokeData(data) {
        super.setStrokeData(data);
        this._mesh.material.side = data.doubleSided ? DoubleSide : FrontSide;
        this._mesh.material.needsUpdate = true;
    }
}
