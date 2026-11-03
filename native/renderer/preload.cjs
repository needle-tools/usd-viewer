const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('needleNative',{
 onCommand:callback=>ipcRenderer.on('needle-command',(_event,command)=>callback(command)),
 onPresent:callback=>ipcRenderer.on('needle-present',(_event,frame)=>callback(frame)),
 ready:()=>ipcRenderer.send('needle-ready'),
 rendered:frame=>ipcRenderer.send('needle-rendered',frame),
 error:message=>ipcRenderer.send('needle-error',String(message)),
});
