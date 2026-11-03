const {app,BrowserWindow,ipcMain}=require('electron');
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const {publishSurface}=require(path.join(__dirname,'../.build/surface.node'));
const socketPath=process.argv[2],service=process.argv[3];
if(!socketPath||!service) throw new Error('Expected Unix command socket and Mach surface service');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('force-color-profile','scrgb-linear');
let window,client,ready=false,latestFrame=0,latestSample=0,queue=[],serial=0;
const frames=new Map();
const trace=(...args)=>{if(process.env.NEEDLE_HYDRA_TRACE==='1')console.error(...args);};
const send=value=>client?.write(JSON.stringify(value)+'\n');
const requestPresent=()=>window.webContents.send('needle-present',{serial:latestFrame,sample:latestSample});
const flush=()=>{if(ready)while(queue.length) window.webContents.send('needle-command',queue.shift());};
const server=net.createServer(connection=>{
 if(client){connection.destroy();return;}client=connection;let bytes=Buffer.alloc(0);
 connection.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(bytes.length>=8){
  const jsonSize=bytes.readUInt32LE(0),binarySize=bytes.readUInt32LE(4);
  if(jsonSize>64*1024*1024||binarySize>1024*1024*1024) throw new Error('Oversized native command');
  const size=8+jsonSize+binarySize;if(bytes.length<size)break;
  const command=JSON.parse(bytes.subarray(8,8+jsonSize));
  if(command.frame)trace("Needle command",command.frame.serial,command.commands?.length,binarySize);
  if(command.frame&&process.env.NEEDLE_HYDRA_CAPTURE)fs.appendFileSync(process.env.NEEDLE_HYDRA_CAPTURE+'-scene.jsonl',
    JSON.stringify({frame:command.frame,identities:command.commands?.filter(item=>item[0]==='native'&&item[2]==='identity')})+'\n');
  if(process.env.NEEDLE_HYDRA_TRACE_MATERIALS==='1')trace('Material updates',JSON.stringify(command.commands?.filter(item=>item[0]==='sprim')));
  const binary=bytes.subarray(8+jsonSize,size);bytes=bytes.subarray(size);
  if(command.release){
   for(const frame of command.release){frames.get(frame)?.release();frames.delete(frame);}
   if(command.completed?.serial!==latestFrame||command.completed?.sample<latestSample)requestPresent();
   continue;
  }
  if(command.frame){window.setContentSize(Math.max(4,command.frame.width)*4,command.frame.height*2+2);}
  command.binary=Uint8Array.from(binary);queue.push(command);flush();
 }});
 connection.on('close',()=>{trace('Native host socket closed');app.quit();});
});
ipcMain.on('needle-ready',()=>{trace('Needle renderer scene ready');ready=true;send({ready:true});flush();});
ipcMain.on('needle-rendered',(_event,frame)=>{
 if(frame.serial<latestFrame||frame.serial===latestFrame&&frame.sample<latestSample)return;
 latestFrame=frame.serial;latestSample=frame.sample;
 if(frame.sample===1||frame.converged)trace('Rendered',frame);
 // OSR may coalesce or drop a canvas submission while its leases are busy.
 // An invalidation alone can reuse an older compositor image. Ask the canvas
 // to republish its current GPU attachments after the final submission and
 // again whenever the host acknowledges an older scene/sample.
 if(frame.converged)requestPresent();
});
ipcMain.on('needle-error',(_event,error)=>{send({error});console.error(error);});
app.whenReady().then(()=>{
 app.dock?.hide();
 window=new BrowserWindow({show:false,width:128,height:64,useContentSize:true,webPreferences:{
  preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,
  backgroundThrottling:false,offscreen:{useSharedTexture:true,sharedTexturePixelFormat:'rgbaf16'},
 }});
 window.webContents.on('console-message',(_event,...args)=>trace('[renderer]',...args));
 window.webContents.on('render-process-gone',(_event,details)=>{send({error:JSON.stringify(details)});app.quit();});
 window.webContents.on('paint',event=>{
  // Blank/resize paints can precede the GPU canvas submission. Their bitmaps
  // are never used; only shared-texture paints can satisfy a Hydra frame.
  if(!event.texture)return;
  if(!latestFrame||frames.size>=3){event.texture.release();return;}
  const texture=event.texture;const info=texture.textureInfo;
  if(serial<3)trace('GPU paint',latestFrame,info.codedSize,info.colorSpace);
  if(info.pixelFormat!=='rgbaf16'||!info.handle.ioSurface){texture.release();send({error:'Expected shared HDR IOSurface'});app.quit();return;}
  const id=++serial;frames.set(id,texture);
  try{publishSurface(service,info.handle.ioSurface,id,info.codedSize.width,info.codedSize.height,latestFrame);send({surface:id,sceneFrame:latestFrame});}
  catch(error){frames.delete(id);texture.release();send({error:String(error)});}
 });
 window.webContents.on('did-fail-load',(_event,code,description)=>console.error('Load failed',code,description));
 window.webContents.on('did-finish-load',()=>trace('Needle renderer document loaded'));
 window.webContents.setFrameRate(60);
 window.loadFile(path.join(__dirname,'index.html'));
 server.listen(socketPath,()=>{fs.chmodSync(socketPath,0o600);trace('Needle GPU renderer ready',socketPath);});
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>trace('Native renderer quitting'));
app.on('will-quit',()=>{for(const texture of frames.values())texture.release();server.close();});
