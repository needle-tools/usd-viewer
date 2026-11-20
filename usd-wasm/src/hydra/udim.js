import {CanvasTexture, Matrix3} from 'three';

const token = /<UDIM>|%3cUDIM%3e/i;
export const isUdimPath = path => token.test(path);
export const udimPath = (pattern, tile) => pattern.replace(token, String(tile));

export function matchUdimTiles(pattern, paths) {
 const filename = String(pattern).replace(/\\/g,'/').split('/').pop();
 const [prefix,suffix] = filename.split(token);
 const tiles = new Map();
 for (const path of paths) {
  const name = String(path).replace(/\\/g,'/').split('/').pop();
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
  const middle = name.slice(prefix.length,name.length-suffix.length), tile = Number(middle);
  if (/^\d{4}$/.test(middle) && tile >= 1001 && tile <= 1100) {
   const expected=udimPath(pattern,tile).replace(/\\/g,'/'),known=String(path).replace(/\\/g,'/');
   if(expected===known||expected.endsWith('/'+known.replace(/^\/+/,''))||known.endsWith('/'+expected.replace(/^\/+/ ,'')))tiles.set(tile,{tile,path});
  }
 }
 return [...tiles.values()].sort((a,b)=>a.tile-b.tile);
}

export function udimLayout(tiles) {
 if (!tiles.length) throw new Error('UDIM texture has no available tiles.');
 const positions = tiles.map(({tile})=>({u:(tile-1001)%10,v:Math.floor((tile-1001)/10)}));
 const minU=Math.min(...positions.map(p=>p.u)),minV=Math.min(...positions.map(p=>p.v));
 const columns=Math.max(...positions.map(p=>p.u))-minU+1,rows=Math.max(...positions.map(p=>p.v))-minV+1;
 return {minU,minV,columns,rows,matrix:new Matrix3().set(1/columns,0,-minU/columns,0,1/rows,-minV/rows,0,0,1)};
}

export function udimAtlas(tiles, {maxTextureSize=Infinity}={}) {
 const layout=udimLayout(tiles),sourceWidth=Math.max(...tiles.map(t=>t.texture.image.width)),sourceHeight=Math.max(...tiles.map(t=>t.texture.image.height));
 const scale=Math.min(1,maxTextureSize/Math.max(sourceWidth*layout.columns,sourceHeight*layout.rows));
 const width=Math.max(1,Math.floor(sourceWidth*scale)),height=Math.max(1,Math.floor(sourceHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=width*layout.columns;canvas.height=height*layout.rows;
 const context=canvas.getContext('2d');if(!context)throw new Error('Cannot allocate a UDIM atlas.');
 for (const {tile,texture} of tiles) {
  const u=(tile-1001)%10,v=Math.floor((tile-1001)/10);
  context.drawImage(texture.image,(u-layout.minU)*width,(layout.minV+layout.rows-1-v)*height,width,height);
 }
 const texture=new CanvasTexture(canvas);
 const sourceTileSize=[0,1].map(axis=>Math.max(...tiles.map(t=>t.texture.userData.usdSourceSize?.[axis]||t.texture.image[axis?'height':'width'])));
 texture.userData={...tiles[0].texture.userData,usdUdim:{minU:layout.minU,minV:layout.minV,columns:layout.columns,rows:layout.rows,tiles:tiles.map(t=>t.tile),sourceTileSize}};
 return texture;
}
