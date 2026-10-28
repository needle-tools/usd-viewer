#!/usr/bin/env python3
"""Author curve, NURBS and subdivision examples from local source cages.

Run with native OpenUSD Python. The two source files are retained for reproducibility;
USD stages embed the authored control meshes and need no external runtime files.
"""
import json, math, struct
from pathlib import Path
from pxr import Gf, Sdf, Usd, UsdGeom

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/fixtures/coverage/curved-surfaces'
SRC=OUT/'source'

def read_subd():
 b=(SRC/'scene.subd').read_bytes(); assert b[:4]==b'SUBD'
 n=struct.unpack_from('<I',b,8)[0]; doc=json.loads(b[12:12+n])['doc']; data=memoryview(b)[12+n:]
 def array(a):
  fmt={'Float32Array':'f','Int32Array':'i','Uint8Array':'B'}[a['$ta']]
  return list(struct.unpack_from('<'+str(a['n'])+fmt,data,a['o']))
 return doc,array
DOC,ARRAY=read_subd()
PALETTE=[(.72,.25,.16),(.20,.48,.52),(.75,.52,.18),(.32,.27,.62),(.37,.55,.28),(.65,.32,.42)]

def color(prim, c): UsdGeom.Gprim(prim).CreateDisplayColorPrimvar().Set([c])
def mesh(stage,path,points,counts,indices,scheme='catmullClark',creases=None,corners=None,holes=None):
 m=UsdGeom.Mesh.Define(stage,path);m.CreatePointsAttr(points);m.CreateFaceVertexCountsAttr(counts);m.CreateFaceVertexIndicesAttr(indices);m.CreateSubdivisionSchemeAttr(scheme);m.CreateDoubleSidedAttr(True)
 m.CreateInterpolateBoundaryAttr('edgeAndCorner');m.CreateExtentAttr(UsdGeom.PointBased.ComputeExtent(points))
 if creases:
  m.CreateCreaseIndicesAttr([v for a,b,s in creases for v in (a,b)]);m.CreateCreaseLengthsAttr([2]*len(creases));m.CreateCreaseSharpnessesAttr([s for a,b,s in creases])
 if corners:
  m.CreateCornerIndicesAttr([i for i,s in corners]);m.CreateCornerSharpnessesAttr([s for i,s in corners])
 if holes:m.CreateHoleIndicesAttr(holes)
 return m

def base(name):
 p=OUT/(name+'.usda'); s=Usd.Stage.CreateNew(str(p)) if not p.exists() else Usd.Stage.Open(str(p));s.GetRootLayer().Clear();w=UsdGeom.Xform.Define(s,'/World');s.SetDefaultPrim(w.GetPrim());UsdGeom.SetStageUpAxis(s,'Y');UsdGeom.SetStageMetersPerUnit(s,1);return s,p

def create_car(s):
 points=[]; counts=[];indices=[];creases=[];uvs=[];uv_indices=[]
 for line in (SRC/'catmark_car.obj').read_text().splitlines():
  t=line.split()
  if not t:continue
  if t[0]=='v': x,y,z=map(float,t[1:4]);points.append((x,z,-y))
  elif t[0]=='vt':uvs.append(tuple(map(float,t[1:3])))
  elif t[0]=='f':
   f=[int(v.split('/')[0])-1 for v in t[1:]]; counts.append(len(f));indices.extend(f);uv_indices.extend(int(v.split('/')[1])-1 for v in t[1:])
  elif t[:2]==['t','crease']:creases.append((int(t[3]),int(t[4]),float(t[5])))
 m=mesh(s,'/World/Car',points,counts,indices,creases=creases);color(m.GetPrim(),(.55,.035,.045))
 uv=UsdGeom.PrimvarsAPI(m).CreatePrimvar('st',Sdf.ValueTypeNames.TexCoord2fArray,UsdGeom.Tokens.faceVarying);uv.Set(uvs);uv.SetIndices(uv_indices)
 for n,x,z in [('FL',-.055,2.89),('FR',1.295,2.89),('RL',-.055,.61),('RR',1.295,.61)]:
  for part,r,w,c in [('Tire',.26,.19,(.025,.03,.035)),('Hub',.15,.20,(.52,.57,.62))]:
   o=UsdGeom.Cylinder.Define(s,'/World/'+part+n);o.CreateAxisAttr('X');o.CreateRadiusAttr(r);o.CreateHeightAttr(w);UsdGeom.Xformable(o).AddTranslateOp().Set((x,.06,z));color(o.GetPrim(),c)
 return {'vertices':len(points),'faces':len(counts),'creases':len(creases),'faceVaryingUvIndices':len(uv_indices)}

def create_study(s,selected):
 objects=[o for o in DOC['objects'] if o['id'] in selected];assert objects
 for n,o in enumerate(objects):
  cage=o['cage'];pos=ARRAY(cage['positions']);points=[tuple(pos[i:i+3]) for i in range(0,len(pos),3)]
  counts=ARRAY(cage['faceVertCounts']); indices=ARRAY(cage['faceVertIndices']); edges=ARRAY(cage['creaseEdges']); sharp=ARRAY(cage['creaseSharpness']);ci=ARRAY(cage['cornerVerts']);cs=ARRAY(cage['cornerSharpness']);holes=[i for i,v in enumerate(ARRAY(cage['holes'])) if v]
  m=mesh(s,'/World/'+o['id'].replace('-','_'),points,counts,indices,{'catmark':'catmullClark','loop':'loop','bilinear':'bilinear'}[o['subd']['scheme']],[(edges[2*i],edges[2*i+1],v) for i,v in enumerate(sharp)],list(zip(ci,cs)),holes)
  m.CreateInterpolateBoundaryAttr({'none':'none','edge-only':'edgeOnly','edge-and-corner':'edgeAndCorner'}[o['subd']['boundary']]); color(m.GetPrim(),PALETTE[n%len(PALETTE)])
  matrix=o['matrix'];offset=(matrix[12],matrix[13],matrix[14]) if len(objects)>1 else (0,0,0)
  UsdGeom.Xformable(m).AddTranslateOp().Set(offset)
 return {'objects':len(objects),'faceCounts':sum(ARRAY(o['cage']['faceVertCounts']).__len__() for o in objects),'source':'subdivision-study/scene.subd'}

def patch(s,kind):
 m=UsdGeom.NurbsPatch.Define(s,'/World/Surface');m.CreateDoubleSidedAttr(True)
 u,v=7,6; m.CreateUVertexCountAttr(u);m.CreateVVertexCountAttr(v);m.CreateUOrderAttr(4);m.CreateVOrderAttr(4)
 m.CreateUKnotsAttr([0,0,0,0,1,2,3,4,4,4,4]);m.CreateVKnotsAttr([0,0,0,0,1,2,3,3,3,3]);m.CreateURangeAttr((0,4));m.CreateVRangeAttr((0,3))
 pts=[];weights=[]
 for j in range(v):
  for i in range(u):
   x=(i-3)*.6;z=(j-2.5)*.6
   if kind=='saddle':y=.32*x*z
   elif kind=='wave':y=.65*math.sin(i*1.05)*math.cos(j*.8)
   elif kind=='dome':y=1.25*math.exp(-.38*(x*x+z*z))
   elif kind=='ripple':y=.38*math.cos(math.sqrt(x*x+z*z)*3)
   elif kind=='fold':y=.65*abs(x)-.25*math.cos(z*2)
   else:y=.35*math.sin(i*1.1+j*.7)
   pts.append((x,y,z));weights.append((.35 if (i+j)%2==0 else 2.2) if kind=='weighted' else 1)
 m.CreatePointsAttr(pts);m.CreateExtentAttr(UsdGeom.PointBased.ComputeExtent(pts))
 if kind=='weighted':m.CreatePointWeightsAttr(weights)
 color(m.GetPrim(),PALETTE[['saddle','wave','dome','ripple','fold','weighted'].index(kind)])
 return {'uVertexCount':u,'vVertexCount':v,'uOrder':4,'vOrder':4,'rationalWeights':kind=='weighted','multipleSpans':True}

def curve(s,kind):
 m=UsdGeom.NurbsCurves.Define(s,'/World/Curves'); pts=[]; weights=[]; counts=[];orders=[];knots=[];ranges=[]
 # Three separately authored strands make each case legible at gallery scale.
 for strand in range(3):
  n=7;counts.append(n);orders.append(4);knots += [0,0,0,0,1,2,3,4,4,4,4];ranges.append((0,4))
  for i in range(n):
   t=i/(n-1);x=(t-.5)*4;shift=(strand-1)*.38
   if kind=='helix':p=(1.15*math.cos(t*math.tau*1.5+shift), (t-.5)*3, 1.15*math.sin(t*math.tau*1.5+shift))
   elif kind=='arches':p=(x,1.35*math.sin(t*math.pi)+shift, strand*.32)
   elif kind=='ribbons':p=(x,math.sin(t*math.tau*1.2+shift),shift)
   elif kind=='swoosh':p=(x,1.1*math.sin(t*math.pi*1.6+shift),math.cos(t*math.pi)*.7+shift)
   elif kind=='spiral':p=((.3+1.3*t)*math.cos(t*math.tau*1.4+shift),(.3+1.3*t)*math.sin(t*math.tau*1.4+shift),shift)
   else:p=(x,1.3*math.sin(t*math.pi)+shift,strand*.28)
   pts.append(p);weights.append((.35 if i%2 else 2) if kind=='weighted' else 1)
 m.CreateCurveVertexCountsAttr(counts);m.CreateOrderAttr(orders);m.CreateKnotsAttr(knots);m.CreateRangesAttr(ranges);m.CreatePointsAttr(pts);m.CreateWidthsAttr([.09]);m.SetWidthsInterpolation('constant');m.CreateExtentAttr(UsdGeom.PointBased.ComputeExtent(pts))
 if kind=='weighted':m.CreatePointWeightsAttr(weights)
 color(m.GetPrim(),PALETTE[['helix','arches','ribbons','swoosh','spiral','weighted'].index(kind)])
 return {'curveCount':len(counts),'controlPoints':len(pts),'order':4,'multipleSpans':True,'rationalWeights':kind=='weighted'}

CASES=[('subdivision-car','Subdivision car','Subdivision','car'),('subdivision-playground','Subdivision playground','Subdivision','playground'),('scheme-comparison','Subdivision schemes','Subdivision','schemes'),('crease-ladder','Crease sharpness ladder','Subdivision','creases'),('boundary-specimens','Boundary interpolation','Subdivision','boundary'),('valence-specimens','Extraordinary vertices','Subdivision','valence'),('hole-lantern','Subdivision hole lantern','Subdivision','holes')]
CASES += [(f'nurbs-patch-{k}',label,'NURBS Surfaces',k) for k,label in [('saddle','Saddle surface'),('wave','Wave canopy'),('dome','Domed surface'),('ripple','Ripple surface'),('fold','Folded surface'),('weighted','Rational surface')]]
CASES += [(f'nurbs-curve-{k}',label,'NURBS Curves',k) for k,label in [('helix','Helical strands'),('arches','Arched strands'),('ribbons','Ribbon splines'),('swoosh','Spatial splines'),('spiral','Spiral strands'),('weighted','Rational strands')]]

def main():
 OUT.mkdir(parents=True,exist_ok=True);entries=[];report=[]
 groups={'playground':[o['id'] for o in DOC['objects'] if o['id'] not in ('studio','tray')], 'schemes':['scheme-catmark','scheme-loop','scheme-bilinear'], 'creases':[f'crease-{i}' for i in range(5)],'boundary':['boundary-none','boundary-edge-only','boundary-edge-and-corner'],'valence':['valence-3','valence-5','valence-6'],'holes':['holes']}
 for name,label,group,kind in CASES:
  s,p=base(name)
  if kind=='car': assertion=create_car(s);features=['Catmull-Clark','OpenSubdiv car control cage','314 edge creases']
  elif kind in groups: assertion=create_study(s,groups[kind]);features=['subdivision','control cages','creases and topology']
  elif group=='NURBS Surfaces': assertion=patch(s,kind);features=['NURBS patch','cubic multispan','rational weights' if kind=='weighted' else kind]
  else: assertion=curve(s,kind);features=['NURBS curves','cubic multispan','rational weights' if kind=='weighted' else kind]
  s.GetRootLayer().Save();p.write_text(p.read_text().rstrip()+'\n');check=Usd.Stage.Open(str(p));assert check and not check.GetCompositionErrors();assert len(list(check.Traverse()))>1
  if kind=='car':
   car=UsdGeom.Mesh.Get(check,'/World/Car');assert car and len(car.GetPointsAttr().Get())==assertion['vertices'];assert len(car.GetFaceVertexCountsAttr().Get())==assertion['faces']>500;assert len(car.GetCreaseLengthsAttr().Get())==assertion['creases']==314;uv=UsdGeom.PrimvarsAPI(car).GetPrimvar('st');assert uv.GetInterpolation()=='faceVarying' and len(uv.GetIndices())==assertion['faceVaryingUvIndices']==len(car.GetFaceVertexIndicesAttr().Get())
  elif kind in groups:
   for object_id in groups[kind]:
    original=next(o for o in DOC['objects'] if o['id']==object_id); authored=UsdGeom.Mesh.Get(check,'/World/'+object_id.replace('-','_'));assert authored
    cage=original['cage'];assert [v for p in authored.GetPointsAttr().Get() for v in p]==ARRAY(cage['positions']);assert list(authored.GetFaceVertexCountsAttr().Get())==ARRAY(cage['faceVertCounts']);assert list(authored.GetFaceVertexIndicesAttr().Get())==ARRAY(cage['faceVertIndices'])
    assert list(authored.GetCreaseIndicesAttr().Get() or [])==ARRAY(cage['creaseEdges']);assert list(authored.GetCreaseSharpnessesAttr().Get() or [])==ARRAY(cage['creaseSharpness']);assert list(authored.GetCornerIndicesAttr().Get() or [])==ARRAY(cage['cornerVerts']);assert list(authored.GetCornerSharpnessesAttr().Get() or [])==ARRAY(cage['cornerSharpness']);assert list(authored.GetHoleIndicesAttr().Get() or [])==[i for i,v in enumerate(ARRAY(cage['holes'])) if v]
  elif group=='NURBS Surfaces':
   authored=UsdGeom.NurbsPatch.Get(check,'/World/Surface');assert authored and authored.GetUVertexCountAttr().Get()==7 and authored.GetVVertexCountAttr().Get()==6
   assert len(authored.GetPointsAttr().Get())==42 and len(authored.GetUKnotsAttr().Get())==11 and len(authored.GetVKnotsAttr().Get())==10
   if kind=='weighted':assert len(authored.GetPointWeightsAttr().Get())==42 and min(authored.GetPointWeightsAttr().Get())<1
  else:
   authored=UsdGeom.NurbsCurves.Get(check,'/World/Curves');assert authored and list(authored.GetCurveVertexCountsAttr().Get())==[7,7,7]
   assert list(authored.GetOrderAttr().Get())==[4,4,4] and len(authored.GetKnotsAttr().Get())==33 and len(authored.GetPointsAttr().Get())==21
   if kind=='weighted':assert len(authored.GetPointWeightsAttr().Get())==21 and min(authored.GetPointWeightsAttr().Get())<1
  root='coverage/curved-surfaces/'+name+'.usda';entry={'id':'curved-'+name,'label':label,'group':group,'root':root,'files':[root],'features':features,'complexity':'high','thumbnailComplexity':'high','expected':{'native':'USD geometry and authored topology are valid; Storm support for NURBS may vary.','needle':'Exercises the authored curve, patch or subdivision geometry; feature support depends on the renderer.'},'assertions':assertion}
  entries.append(entry);report.append({'id':entry['id'],'opens':True,'compositionErrors':[],**assertion})
 (OUT/'manifest.json').write_text(json.dumps(entries,indent=2)+'\n');(OUT/'native-validation.json').write_text(json.dumps({'openusdVersion':list(Usd.GetVersion()),'results':report},indent=2)+'\n');print('Validated',len(entries),'fixtures')
if __name__=='__main__':main()
