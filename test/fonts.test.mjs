import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fontNames,scanFonts,publicFonts,copyInstalledFont,matchBrandFont,installedFonts} from '../lib/fonts.mjs';
import {productionInput,rendererAvailable,renderAsset} from '../lib/production.mjs';
import {execFileSync} from 'node:child_process';

function fontFixture(){
 const values=[[1,'Client Sans'],[2,'Regular'],[4,'Client Sans Regular'],[16,'Client Sans'],[17,'Regular']],strings=values.map(([,text])=>Buffer.from(text,'utf16le').swap16()),header=6+values.length*12,table=Buffer.alloc(header+strings.reduce((n,b)=>n+b.length,0));table.writeUInt16BE(values.length,2);table.writeUInt16BE(header,4);let offset=0;
 values.forEach(([id],i)=>{const r=6+i*12;[3,1,0x409,id,strings[i].length,offset].forEach((v,n)=>table.writeUInt16BE(v,r+n*2));strings[i].copy(table,header+offset);offset+=strings[i].length;});
 const bytes=Buffer.alloc(28+table.length);bytes.writeUInt32BE(0x10000);bytes.writeUInt16BE(1,4);bytes.write('name',12);bytes.writeUInt32BE(28,20);bytes.writeUInt32BE(table.length,24);table.copy(bytes,28);return bytes;
}
test('installed font names support OpenType tables, collections and malformed inputs',()=>{
 const expected={name:'Client Sans Regular',family:'Client Sans',style:'Regular'},font=fontFixture();assert.deepEqual(fontNames(font),expected);
 const collection=Buffer.alloc(20+font.length);collection.write('ttcf');collection.writeUInt32BE(0x10000,4);collection.writeUInt32BE(1,8);collection.writeUInt32BE(20,12);font.copy(collection,20);collection.writeUInt32BE(48,40);assert.deepEqual(fontNames(collection),expected);
 for(const invalid of [Buffer.alloc(0),Buffer.from('invalid font'),font.subarray(0,40)])assert.equal(fontNames(invalid),null);
});
test('font discovery returns stable IDs and names, hides paths and rejects unknown selections',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'sniff fonts '));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(path.join(root,'Fonts'));
 await writeFile(path.join(root,'Fonts','client.ttf'),fontFixture());await writeFile(path.join(root,'Fonts','invalid.otf'),'not a font');await writeFile(path.join(root,'outside.ttf'),fontFixture());
 const fonts=await scanFonts([path.join(root,'Fonts')]);assert.equal(fonts.length,1);assert.equal(fonts[0].name,'Client Sans Regular');assert.equal((await scanFonts([path.join(root,'Fonts')]))[0].id,fonts[0].id);assert.equal(matchBrandFont(fonts,'Client Sans'),fonts[0]);
 const exposed=JSON.stringify(publicFonts(fonts));assert.ok(!exposed.includes(root));assert.ok(!exposed.includes('client.ttf'));
 const state={brands:[{id:'brand',name:'Test',font:'Client Sans',palette:''}],media:[]};const input=productionInput({kind:'image',brandId:'brand',prompt:'Test',branding:true,fontId:'system:'+fonts[0].id},state,fonts);assert.equal(input.systemFontName,'Client Sans Regular');assert.ok(!JSON.stringify(input).includes(root));
 assert.throws(()=>productionInput({kind:'image',brandId:'brand',prompt:'Test',fontId:'system:../../outside.ttf'},state,fonts),/unavailable/);
 const copied=path.join(root,'copy');await copyInstalledFont(fonts[0],copied);assert.deepEqual(await readFile(copied),fontFixture());
 await assert.rejects(copyInstalledFont({...fonts[0],file:path.join(root,'outside.ttf')},copied),/location changed/);
 await rm(fonts[0].file);await assert.rejects(copyInstalledFont(fonts[0],copied),/removed/);
});
test('a real installed Windows font outside the old whitelist renders without an uploaded font',async t=>{
 if(process.platform!=='win32'){t.skip('Windows installed-font integration runs on the Windows build.');return;}
 const fonts=await installedFonts(),font=fonts.find(f=>!['Arial','Georgia','Times New Roman','Segoe UI','Verdana','Tahoma'].includes(f.name)&&/Regular|Bold/i.test(f.style));assert.ok(font,'Windows should expose installed font variants');
 const env={FFMPEG:process.env.FFMPEG||'ffmpeg'};if(!await rendererAvailable(env)){t.skip('FFmpeg required. Packaged Windows verification runs this test with bundled FFmpeg.');return;}
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-font-render-'));t.after(()=>rm(dir,{recursive:true,force:true}));const source=path.join(dir,'source.png');execFileSync(env.FFMPEG,['-loglevel','error','-f','lavfi','-i','color=c=blue:s=80x80','-frames:v','1','-threads','1',source],{windowsHide:true});
 const input=productionInput({kind:'image',brandId:'brand',prompt:'Test',branding:true,fontId:'system:'+font.id,overlay:'Installed font test'},{brands:[{id:'brand',name:'Test',font:'Custom brand font',palette:'#123456'}],media:[]},fonts);
 const result=await renderAsset({bytes:await readFile(source),mime:'image/png'},input,{env,dir,fontCatalog:fonts,readMedia:async()=>{throw new Error('No font upload should be read');}});assert.deepEqual([result.bytes.readUInt32BE(16),result.bytes.readUInt32BE(20)],[1080,1080]);
 const legacy={...input,systemFontId:'',brandSnapshot:{...input.brandSnapshot,font:font.name}};const recovered=await renderAsset({bytes:await readFile(source),mime:'image/png'},legacy,{env,dir,fontCatalog:fonts});assert.equal(recovered.mime,'image/png','Existing queued jobs should also resolve installed brand fonts');
});
