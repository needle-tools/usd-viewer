/** Bounded joint controls for a live, transient USD mechanism pose. */
export function mountJointControls(container,mechanism,{onError=()=>{}}={}){
 const root=document.createElement('div');root.className='usd-joint-controls';const rows=[];
 for(const [path,record]of mechanism.joints){
  if(record.dof===null||record.data.mimic||record.lower>=record.upper)continue;
  const row=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input'),output=document.createElement('output');
  row.className='usd-joint-control';name.textContent=path.split('/').pop();name.title=path;output.setAttribute('aria-live','off');
  input.setAttribute('aria-label',`Joint ${path}`);input.type=Number.isFinite(record.lower)&&Number.isFinite(record.upper)?'range':'number';
  if(Number.isFinite(record.lower))input.min=String(record.lower);if(Number.isFinite(record.upper))input.max=String(record.upper);
  input.step=input.type==='range'?String((record.upper-record.lower)/1000):'any';
  input.oninput=()=>{onError(mechanism.setJointValue(path,Number(input.value))?'':'Pose would violate joint constraints.');update();};
  row.append(name,output,input);root.append(row);rows.push({path,record,input,output,last:null});
 }
 container.append(root);
 function update(){for(const row of rows){row.input.disabled=!mechanism.isPlaying();const value=mechanism.getJointValue(row.path);if(value===row.last)continue;row.last=value;row.input.value=String(value);
  const meters=value*mechanism.metersPerUnit;row.output.value=row.record.angular?`${value.toFixed(1)}°`:Math.abs(meters)<1?`${(meters*100).toFixed(1)} cm`:`${meters.toFixed(2)} m`;
 }}
 update();return{element:root,update,dispose(){root.remove();}};
}
