import {readdir,readFile,realpath,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fail} from './core.mjs';

// Read names from the font itself, not a filename guess. Collections expose their first face.
export function fontNames(bytes){
 try{
  let offset=0;if(bytes.toString('ascii',0,4)==='ttcf'){if(bytes.readUInt32BE(8)<1)return null;offset=bytes.readUInt32BE(12);}
  const signature=bytes.toString('ascii',offset,offset+4);
  if(bytes.readUInt32BE(offset)!==0x10000&&!['OTTO','true'].includes(signature))return null;
  const count=bytes.readUInt16BE(offset+4);if(count>256)return null;
  for(let i=0;i<count;i++){
   const at=offset+12+i*16;if(bytes.toString('ascii',at,at+4)!=='name')continue;
   const start=bytes.readUInt32BE(at+8),length=bytes.readUInt32BE(at+12);if(start+length>bytes.length)return null;
   const records=bytes.readUInt16BE(start+2),storage=start+bytes.readUInt16BE(start+4),names=new Map();if(records>4096)return null;
   for(let n=0;n<records;n++){
    const r=start+6+n*12;if(r+12>start+length)break;
    const platform=bytes.readUInt16BE(r),language=bytes.readUInt16BE(r+4),id=bytes.readUInt16BE(r+6),size=bytes.readUInt16BE(r+8),pos=storage+bytes.readUInt16BE(r+10);
    if(![1,2,4,16,17].includes(id)||size>2048||pos+size>start+length)continue;
    let value;if(platform===0||platform===3){const b=Buffer.from(bytes.subarray(pos,pos+size));if(b.length%2)continue;b.swap16();value=b.toString('utf16le');}else if(platform===1)value=bytes.toString('latin1',pos,pos+size);else continue;
    value=value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,200);if(!value)continue;
    const rank=(platform===3?10:platform===0?5:0)+(language===0x409?20:0);if(!names.has(id)||names.get(id).rank<rank)names.set(id,{value,rank});
   }
   const get=id=>names.get(id)?.value||'',family=get(16)||get(1),style=get(17)||get(2)||'Regular',name=get(4)||(family+' '+style).trim();return family&&name?{name,family,style}:null;
  }
 }catch{}return null;
}
export function windowsFontRoots(env=process.env){return [env.LOCALAPPDATA?path.join(env.LOCALAPPDATA,'Microsoft','Windows','Fonts'):null,path.join(env.WINDIR||'C:\\Windows','Fonts')].filter(Boolean);}
export async function scanFonts(roots){
 const result=[],seen=new Set();
 for(let index=0;index<roots.length;index++){
  let root,entries;try{root=await realpath(roots[index]);entries=await readdir(root,{withFileTypes:true});}catch{continue;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name)).slice(0,3000)){
   if(!entry.isFile()||!/[.](ttf|otf|ttc)$/i.test(entry.name))continue;
   try{
    const file=await realpath(path.join(root,entry.name)),relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative)||seen.has(file))continue;
    const info=await stat(file);if(info.size>32*1024*1024)continue;const names=fontNames(await readFile(file));if(!names)continue;
    seen.add(file);result.push({id:createHash('sha256').update(file).digest('hex').slice(0,32),...names,file,root,location:roots.length>1&&index===0?'User fonts':'Windows fonts'});
   }catch{}
  }
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name)||a.location.localeCompare(b.location));
}
let cached;
export function installedFonts({refresh=false}={}){if(refresh||!cached)cached=process.platform==='win32'?scanFonts(windowsFontRoots()):Promise.resolve([]);return cached;}
export const publicFonts=fonts=>fonts.map(({id,name,family,style,location})=>({id,name,family,style,location}));
export function matchBrandFont(fonts,value){const name=String(value||'').split(',')[0].replace(/["']/g,'').trim().toLowerCase();return fonts.find(f=>f.name.toLowerCase()===name)||fonts.find(f=>f.family.toLowerCase()===name&&/^(regular|normal|book|roman)$/i.test(f.style))||fonts.find(f=>f.family.toLowerCase()===name);}
export async function copyInstalledFont(font,destination){
 if(!font)fail('The selected installed font is unavailable. Refresh installed fonts and select it again.',409);
 let file;try{file=await realpath(font.file);}catch{fail('This installed font was removed. Refresh installed fonts and choose another.',409);}
 const relative=path.relative(font.root,file);if(relative.startsWith('..')||path.isAbsolute(relative)||file!==font.file)fail('Installed font location changed. Refresh installed fonts.',409);
 await copyFile(file,destination);
}
