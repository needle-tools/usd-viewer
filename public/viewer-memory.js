// Desktop viewers use the runtime's 4 GB imported-memory ceiling. Mobile
// devices retain the runtime's separate memory policy.
export function createViewerMemory({userAgent=globalThis.navigator?.userAgent||'',isolated=globalThis.crossOriginIsolated===true,Memory=globalThis.WebAssembly?.Memory}={}) {
  if(!isolated||typeof Memory!=='function'||/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent))return;
  try{return new Memory({initial:256,maximum:65536,shared:true});}catch{return;}
}
