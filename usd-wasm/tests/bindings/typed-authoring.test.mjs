import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getUsdModule} from '../runtime.mjs';

const identity = n => Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>Number(r===c)));
async function create() {
  const USD=await getUsdModule({print(){},printErr(){}});
  USD.FS_createPath('/','tmp',true,true);
  const stage=USD.CreateStage('/tmp/typed-authoring.usda');
  return {USD,stage,prim:stage.DefinePrim('/World','Xform')};
}

test('metadata edits round-trip dictionaries, schema lists and authored list operations through USD',async()=>{
  const {USD,stage,prim}=await create();
  try {
    const fallback=prim.GetMetadata('customData');
    assert.equal(await prim.SetMetadata('apiSchemas',['MaterialBindingAPI']),true);
    assert.deepEqual(prim.GetMetadata('apiSchemas'),['MaterialBindingAPI']);
    assert.equal(await prim.SetMetadata('customData',{enabled:true,tags:['one','two'],nested:{ratio:.5}}),true);
    assert.equal(await prim.SetMetadataByDictKey('customData','nested:count',7,'int'),true);
    assert.equal(await prim.SetMetadataByDictKey('customData','empty',[],'token[]'),true);
    assert.equal(await prim.SetMetadataByDictKey('customData','exact','18446744073709551615','uint64'),true);
    const data=prim.GetMetadata('customData');
    assert.deepEqual(data,{...fallback,enabled:true,tags:['one','two'],nested:{ratio:.5,count:7},empty:[],exact:'18446744073709551615'});
    data.nested.count=9;
    assert.equal(await prim.SetMetadata('customData',data),true);
    assert.equal(prim.GetMetadataByDictKey('customData','nested:count'),9);
    const layer=stage.GetRootLayer();let source;
    try {source=layer.ExportToString();} finally {layer.delete();}
    assert.match(source,/int count = 9/);assert.match(source,/token\[\] empty = \[\]/);assert.match(source,/uint64 exact = 18446744073709551615/);
    assert.equal(await prim.SetMetadata('apiSchemas',{prependedItems:['MaterialBindingAPI']}),true);
    const authored=prim.GetPrimStack()[0].metadataValues.apiSchemas;
    assert.equal(authored.isExplicit,false);assert.deepEqual(authored.prependedItems,['MaterialBindingAPI']);
    assert.equal(await prim.SetMetadata('apiSchemas',authored),true);
    assert.deepEqual(prim.GetPrimStack()[0].metadataValues.apiSchemas,authored);
    assert.equal(await prim.ClearMetadataByDictKey('customData','nested:count'),true);
    assert.equal(prim.GetMetadataByDictKey('customData','nested:count'),undefined);
    const path='/tmp/typed-authoring-reopened.usda';const exportLayer=stage.GetRootLayer();try{assert.equal(exportLayer.Export(path),true);}finally{exportLayer.delete();}
    const reopened=await USD.OpenStage(path);
    try {
      const other=reopened.GetPrimAtPath('/World');
      try {assert.deepEqual(other.GetMetadata('customData'),prim.GetMetadata('customData'));assert.deepEqual(other.GetMetadata('apiSchemas'),['MaterialBindingAPI']);}
      finally {other.delete();}
    }finally{USD.ReleaseStage(reopened);}
    assert.equal(await prim.ClearMetadata('customData'),true);assert.deepEqual(prim.GetMetadata('customData'),fallback);
    await assert.rejects(async()=>prim.SetMetadata('customData',{bad:[1,'two']}),/single element type/);
    await assert.rejects(async()=>prim.SetMetadata('customData',{bad:null}),/Cannot infer/);
    const cycle={};cycle.self=cycle;await assert.rejects(async()=>prim.SetMetadata('customData',cycle),/deeply nested|64 levels/);
    await assert.rejects(async()=>prim.SetMetadata('apiSchemas',{isExplicit:true,prependedItems:['MaterialBindingAPI']}),/cannot also contain/);
    await assert.rejects(async()=>prim.SetMetadata('apiSchemas',{prepend:['MaterialBindingAPI']}),/Unknown USD list operation/);
  }finally{prim.delete();USD.ReleaseStage(stage);}
});

test('attributes and transform operations expose editable typed values, including exact 64-bit integers',async()=>{
  const {USD,stage,prim}=await create();
  try {
    const cases=[['uchar',255],['uint',4294967295],['int64','-9223372036854775808'],['uint64','18446744073709551615'],
      ['int64[]',['-9223372036854775808',7]],['uint64[]',[0,'18446744073709551615']],['uint[]',[1,4294967295]],['uchar[]',[0,255]],
      ['asset[]',['textures/a.exr','../b.ktx2']],['half',.5],['half[]',[.5,2]],['half2',[.5,1]],['half4[]',[[1,2,3,4]]],
      ['matrix2d',identity(2)],['matrix3d[]',[identity(3)]],['timecode',42],['timecode[]',[0,24]]];
    for (const [index,[type,value]] of cases.entries()) {
      const attr=prim.CreateAttribute('test'+index,type,true);
      try{assert.equal(attr.Set(value,NaN),true,type);assert.deepEqual(await attr.Get(NaN),value,type);assert.equal(attr.Set(await attr.Get(NaN),NaN),true,type+' read/write');}
      finally{attr.delete();}
    }
    const exact=prim.CreateAttribute('exact','uint64',true);
    try {assert.equal(exact.Set(18446744073709551615n,NaN),true);assert.equal(await exact.Get(NaN),'18446744073709551615');
      for(const value of [-1,'18446744073709551616',2**53,1.5])assert.throws(()=>exact.Set(value,NaN),/integer/i);
    } finally{exact.delete();}
    const integers=prim.CreateAttribute('integers','int[]',true);
    try {assert.equal(integers.Set(new Int32Array([1,2]),NaN),true);assert.deepEqual(await integers.Get(NaN),[1,2]);assert.throws(()=>integers.Set([1,2.5],NaN),/integer/i);}finally{integers.delete();}
    const xform=USD.UsdGeomXform.Get(stage,'/World'),op=xform.AddTranslateOp();
    try {assert.equal(op.Set([1,2,3],NaN),true);assert.deepEqual(await op.GetValue(NaN),[1,2,3]);assert.equal(await op.Get(NaN),'(1, 2, 3)');}finally{op.delete();xform.delete();}
    const layer=stage.GetRootLayer();try{assert.equal(layer.Export('/tmp/typed-values-reopened.usda'),true);}finally{layer.delete();}const reopened=await USD.OpenStage('/tmp/typed-values-reopened.usda');
    try {const other=reopened.GetPrimAtPath('/World');try {for(const [index,[type,value]] of cases.entries()){const attr=other.GetAttribute('test'+index);try{assert.deepEqual(await attr.Get(NaN),value,type+' reopened');}finally{attr.delete();}}}finally{other.delete();}}finally{USD.ReleaseStage(reopened);}
  }finally{prim.delete();USD.ReleaseStage(stage);}
});

test('attribute and relationship metadata use the same typed dictionary read/write path',async()=>{
  const {USD,stage,prim}=await create();
  try {
    for (const property of [prim.CreateAttribute('note','string',true),prim.CreateRelationship('target',true)]) {
      try {
        assert.equal(property.SetMetadata('customData',{enabled:false}),true);
        assert.equal(property.SetMetadataByDictKey('customData','ids',[1,2],'int[]'),true);
        assert.deepEqual(property.GetMetadata('customData'),{enabled:false,ids:[1,2]});
        const stack=await property.GetPropertyStack(0);assert.deepEqual(stack[0].metadataValues.customData,{enabled:false,ids:[1,2]});
        assert.equal(property.ClearMetadata('customData'),true);
      }finally{property.delete();}
    }
  }finally{prim.delete();USD.ReleaseStage(stage);}
});

test('layer handles retain their own references without invalidating the stage or sibling handles',async()=>{
  const {USD,stage,prim}=await create();
  const first=stage.GetRootLayer(),retained=stage.GetRootLayer();
  try {
    first.delete();assert.equal(await prim.SetMetadata('documentation','still alive'),true);
    assert.match(retained.ExportToString(),/still alive/);
    const another=stage.GetRootLayer();try{assert.match(another.ExportToString(),/still alive/);}finally{another.delete();}
    prim.delete();USD.ReleaseStage(stage);
    assert.match(retained.ExportToString(),/still alive/);
  }finally{retained.delete();}
});
