import type {Object3D} from 'three';
import type {NeedleThreeHydraHandle} from './create.three.js';
import type {PhysicsBody,PhysicsJoint,PhysicsRotation,UsdPhysicsSimulation,UsdPhysicsSnapshot} from './physics.js';
export interface UsdMechanism extends UsdPhysicsSimulation {
 readonly mode:'interaction';
 readonly metersPerUnit:number;
 readonly roots:string[];
 readonly adaptations:ReadonlyArray<{path:string;source:string;target:string;reason:string}>;
 readonly bodies:ReadonlyMap<string,{readonly data:Readonly<PhysicsBody>;readonly body:{translation():{x:number;y:number;z:number};rotation():{x:number;y:number;z:number;w:number};isDynamic():boolean}}>;
 readonly joints:ReadonlyMap<string,{readonly data:Readonly<PhysicsJoint>;readonly parent:string;readonly child:string;readonly angular:boolean;readonly lower:number;readonly upper:number}>;
 /** USD units: stage units for sliders, degrees for hinges. */
 getJointValue(path:string):number|null;
 setJointValue(path:string,value:number):boolean;
 getJointRotation(path:string):PhysicsRotation|null;
 setJointRotation(path:string,value:PhysicsRotation):boolean;
 jointForBody(path:string):{data:PhysicsJoint}|null;
}
export function createUsdMechanism(options:{handle:NeedleThreeHydraHandle;root?:Object3D;snapshot?:UsdPhysicsSnapshot;loadKinematics?:()=>Promise<unknown>;framePolicy?:'strict'|'preserve-rest';dragMode?:'joint'|'point'}):Promise<UsdMechanism>;
/** Display-only joint axes and travel limits, excluded from bounds and tracing. */
export function createJointHelpers(mechanism:UsdMechanism,options?:{visible?:(path:string,bodyPath:string)=>boolean;selected?:(path:string,bodyPath:string)=>boolean}):{objects:Object3D[];update():void;dispose():void};
export function mountJointControls(container:HTMLElement,mechanism:UsdMechanism,options?:{onError?:(message:string)=>void}):{element:HTMLElement;update():void;dispose():void};
