import {Box3,Matrix4,Vector3} from 'three';

// Measure rendered vertices in the target frame. Transforming a local AABB
// overestimates rotated shapes and changes when material primitives split.
export function geometryStats(root,conversion=new Matrix4()) {
	root.updateMatrixWorld(true);
	const bounds=new Box3(),inverse=root.matrixWorld.clone().invert(),transform=new Matrix4(),instance=new Matrix4(),point=new Vector3();
	let primitives=0,triangles=0;
	root.traverseVisible(object=>{
		if(!object.isMesh||object.userData.usdHelperFor)return;
		const geometry=object.geometry,positions=geometry.attributes.position;
		const count=geometry.index?.count??positions?.count??0;
		const groups=Array.isArray(object.material)&&geometry.groups.length?geometry.groups:[{start:0,count}];
		const used=new Uint8Array(positions?.count||0),vertices=[];let meshTriangles=0;
		for(const group of groups){
			const start=Math.max(geometry.drawRange.start,group.start),end=Math.min(count,group.start+group.count,geometry.drawRange.start+geometry.drawRange.count);
			meshTriangles+=Math.max(0,end-start)/3;
			for(let i=start;i<end;i++){
				const index=geometry.index?geometry.index.getX(i):i;
				if(!Number.isInteger(index)||index<0||index>=used.length)throw new Error(`Invalid rendered vertex index in ${object.userData.usdPath||object.name||object.uuid}.`);
				if(!used[index]){used[index]=1;vertices.push(index);}
			}
		}
		for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
			transform.copy(conversion).multiply(inverse).multiply(object.matrixWorld);
			if(object.isInstancedMesh){object.getMatrixAt(i,instance);transform.multiply(instance);}
			for(const index of vertices){
				point.fromBufferAttribute(positions,index).applyMatrix4(transform);
				if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))throw new Error(`Nonfinite rendered position in ${object.userData.usdPath||object.name||object.uuid}.`);
				bounds.expandByPoint(point);
			}
			primitives++;triangles+=meshTriangles;
		}
	});
	return{primitives,triangles,bounds:bounds.isEmpty()?null:[bounds.min.toArray(),bounds.max.toArray()]};
}
