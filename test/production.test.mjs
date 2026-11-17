import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createApp} from '../server.mjs';
import {generateImages,generateVideo,productionInput,downloadAsset,renderAsset,rendererAvailable,formats} from '../lib/production.mjs';
import {visibleMedia} from '../public/production.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
const brand={id:'brand',name:'Travel One',palette:'#163D30',font:'Arial'};
const fakeRenderer=async(r,p)=>({...r,width:formats[p.aspect][0],height:formats[p.aspect][1]});
async function fixture(t,options={}){
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-production-'));
 const app=await createApp({dir,env:{OPENAI_API_KEY:'private-openai',HF_API_KEY_ID:'private-id',HF_API_KEY_SECRET:'private-secret',...options.env},mediaRenderer:fakeRenderer,pollDelay:1,...options});
 await app.store.update(s=>{s.brands.push(brand);s.settings.production={imageModel:'test-image-model',reserve:5};s.settings.monthlyBudget=50;});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.server.address().port;
 const request=async(route,method='GET',b)=>{const r=await fetch(base+route,{method,headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});return {status:r.status,body:await r.json()};};
 const done=async id=>{for(let i=0;i<300;i++){const s=app.store.read(),job=s.jobs.find(j=>j.id===id);if(!['queued','running'].includes(job.status))return {job,state:s};await new Promise(r=>setTimeout(r,10));}throw new Error('Job did not complete');};
 return {...app,dir,base,request,done};
}
test('image batches preserve originals, render exact formats, hold reservations and reject stale approval',async t=>{
 let calls=0;
 const {request,done}=await fixture(t,{fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/images/generations');const b=JSON.parse(opts.body);assert.equal(b.n,2);assert.equal(b.size,'1024x1536');assert.equal(opts.headers.Authorization,'Bearer private-openai');return Response.json({data:[{b64_json:png.toString('base64')},{b64_json:png.toString('base64')}],usage:{total_tokens:100}});}});
 const queued=await request('/api/production','POST',{kind:'image',brandId:'brand',title:'Batch',prompt:'Two coastal scenes',aspect:'4:5',count:2});assert.equal(queued.status,202);
 const {job,state}=await done(queued.body.id);assert.equal(job.status,'completed');assert.equal(calls,1);assert.equal(job.reservation,10);assert.equal(job.costEstimate,null);assert.equal(state.media.length,4);
 assert.equal(visibleMedia(state.media).length,2);assert.equal(visibleMedia(state.media,true).length,4);assert.equal(new Set(state.media.map(m=>m.name)).size,4);
 const final=state.media.find(m=>m.role==='rendered');assert.equal(final.width,1080);assert.equal(final.height,1350);assert.ok(final.sourceId);assert.equal(final.status,'needs-review');
 const save={version:1,status:'approved',caption:'Approved caption'};assert.equal((await request('/api/media/'+final.id,'PUT',save)).status,200);assert.equal((await request('/api/media/'+final.id,'PUT',save)).status,409);
 assert.equal((await request('/api/media/'+final.sourceId,'DELETE')).status,409);
 const publicState=(await request('/api/state')).body;assert.equal(publicState.usage.committed,10);assert.equal(publicState.media.find(m=>m.id===final.id).reviewHistory.length,1);assert.ok(!JSON.stringify(publicState).includes('private-openai'));assert.ok(!JSON.stringify(publicState).includes('private-secret'));
});
test('batch originals survive rendering failure and missing images produce incomplete status',async t=>{
 const f=await fixture(t,{fetcher:async()=>Response.json({data:[{b64_json:png.toString('base64')},{b64_json:png.toString('base64')}]}),mediaRenderer:async()=>{throw new Error('Render failed');}});
 const q=await f.request('/api/production','POST',{kind:'image',brandId:'brand',prompt:'Test',count:2});const {job,state}=await f.done(q.body.id);assert.equal(job.status,'failed');assert.equal(state.media.length,2);assert.ok(state.media.every(m=>m.role==='generated'));
 const g=await fixture(t,{fetcher:async()=>Response.json({data:[{b64_json:png.toString('base64')} ]})});const b=await g.request('/api/production','POST',{kind:'image',brandId:'brand',prompt:'Test',count:2});assert.equal((await g.done(b.body.id)).job.status,'incomplete');
});
test('one requested image makes one provider call and shows one final choice, with original recoverable',async t=>{
 let calls=0;const f=await fixture(t,{fetcher:async(_url,opts)=>{calls++;assert.equal(JSON.parse(opts.body).n,1);return Response.json({data:[{b64_json:png.toString('base64')}]});}});
 const q=await f.request('/api/production','POST',{kind:'image',brandId:'brand',prompt:'One scene',count:1});const {state}=await f.done(q.body.id);assert.equal(calls,1);assert.equal(state.media.length,2);assert.equal(visibleMedia(state.media).length,1);assert.equal(visibleMedia(state.media,true).length,2);assert.equal(visibleMedia(state.media)[0].role,'rendered');
 const original=state.media.find(m=>m.role==='generated');assert.deepEqual(visibleMedia([original]),[original],'Unrendered originals must remain visible for recovery');
});
test('references use multipart edits, transparent output and no arbitrary remote URLs',async()=>{
 let called=false;
 await generateImages({config:{model:'test'},production:{brandSnapshot:brand,prompt:'Remove background and vary the scene',aspect:'1:1',count:1,transparent:true,sourceSnapshot:{mime:'image/png'}}},{env:{OPENAI_API_KEY:'secret'},readMedia:async()=>png,fetcher:async(url,opts)=>{called=true;assert.equal(url,'https://api.openai.com/v1/images/edits');assert.ok(opts.body instanceof FormData);assert.equal(opts.body.get('background'),'transparent');assert.equal(opts.body.get('image[]').type,'image/png');assert.equal(opts.headers['Content-Type'],undefined);return Response.json({data:[{b64_json:png.toString('base64')}]});}});assert.ok(called);
 assert.throws(()=>productionInput({kind:'image',brandId:'brand',prompt:'Test',sourceId:'foreign'},{brands:[brand],media:[{id:'foreign',brandId:'other',mime:'image/png'}]}),/this brand/);
 assert.throws(()=>productionInput({kind:'render',brandId:'brand',sourceId:'logo',logoId:'logo',branding:true},{brands:[brand],media:[{id:'logo',brandId:'brand',mime:'image/png',status:'needs-review'}]}),/Approve/);
});
test('budget, module, provider and shape validation reject work before provider calls',async t=>{
 let calls=0;const f=await fixture(t,{fetcher:async()=>{calls++;throw new Error('must not call');}});
 await f.store.update(s=>s.settings.monthlyBudget=5);
 const base={kind:'image',brandId:'brand',prompt:'Test'};
 const blocked=await f.request('/api/production','POST',{...base,count:2});assert.equal(blocked.status,409);assert.match(blocked.body.error,/US\$10.00.*US\$5.00/);assert.match(blocked.body.error,/No generation was started/);
 for(const extra of [{count:0},{aspect:'wrong'},{branding:true,color:'red'},{kind:'video',aspect:'4:5'},{kind:'video',duration:300}])assert.equal((await f.request('/api/production','POST',{...base,...extra})).status,400);
 assert.equal(f.store.read().jobs.length,0);assert.equal(calls,0);
 const disabled=await fixture(t,{env:{ENABLED_MODULES:'sniff'}});assert.equal((await disabled.request('/api/production','POST',base)).status,403);
 const noKey=await fixture(t,{env:{}});assert.equal((await noKey.request('/api/production','POST',base)).status,409);
});
test('video recovery polls stored request without resubmitting a billed generation',async t=>{
 let submissions=0,polls=0,downloadFails=true;
 const f=await fixture(t,{assetDownloader:async()=>{if(downloadFails)throw new Error('Download unavailable');return Buffer.from('mock mp4');},fetcher:async(url,opts)=>{
  assert.equal(opts.headers.Authorization,'Key private-id:private-secret');
  if(opts.method==='POST'){submissions++;assert.equal(JSON.parse(opts.body).duration,5);return Response.json({request_id:'request-123'});}
  polls++;return Response.json({status:'completed',video:{url:'https://media.example.com/video.mp4'}});
 }});
 const q=await f.request('/api/production','POST',{kind:'video',brandId:'brand',prompt:'A moving train',aspect:'9:16'});const first=await f.done(q.body.id);assert.equal(first.job.status,'failed');assert.equal(first.job.providerRequestId,'request-123');
 downloadFails=false;assert.equal((await f.request('/api/production/'+q.body.id+'/recover','POST',{})).status,202);
 const recovered=await f.done(q.body.id);assert.equal(recovered.job.status,'completed');assert.equal(submissions,1);assert.equal(polls,2);assert.equal(recovered.state.media.length,2);
 assert.equal((await f.request('/api/production/'+q.body.id+'/recover','POST',{})).status,409);
});
test('local rendering has zero cost, protects inputs and survives restart with review history',async t=>{
 let unblock;const blocked=new Promise(r=>unblock=r);
 const f=await fixture(t,{mediaRenderer:async(r,p)=>{await blocked;return fakeRenderer(r,p);}});
 const media={id:'source',file:'source',brandId:'brand',mime:'image/png',name:'Source',version:1};
 await writeFile(path.join(f.dir,'uploads','source'),png);await f.store.update(s=>s.media.push(media));
 const q=await f.request('/api/production','POST',{kind:'render',brandId:'brand',sourceId:'source',branding:true,overlay:'100% safe: text',aspect:'16:9'});
 assert.equal(q.status,202);assert.equal((await f.request('/api/media/source','DELETE')).status,409);unblock();const {job,state}=await f.done(q.body.id);assert.equal(job.costEstimate,0);assert.equal(job.reservation,0);assert.equal(state.media.length,2);
 const rendered=state.media.find(m=>m.role==='rendered');await f.request('/api/media/'+rendered.id,'PUT',{version:1,status:'approved',caption:'Saved'});
 await f.close();const reopened=await createApp({dir:f.dir,env:{},mediaRenderer:fakeRenderer});assert.equal(reopened.store.read().media.find(m=>m.id===rendered.id).status,'approved');await reopened.close();
});
test('generated media download revalidates redirects and blocks private destinations',async()=>{
 await assert.rejects(downloadAsset('https://127.0.0.1/file'),/public websites/);
 await assert.rejects(downloadAsset('https://media.example.com/file',{lookup:async()=>[{address:'10.0.0.1',family:4}]}),/public address/);
 let submitted=false;
 await assert.rejects(generateVideo({providerRequestId:'existing',production:{}},{env:{HF_API_KEY:'test-complete-key'},fetcher:async(_u,o)=>{assert.equal(o.method,'GET');submitted=true;return Response.json({status:'nsfw'});},onPhase:async()=>{}}),/nsfw/);assert.ok(submitted);
});
test('real FFmpeg renders PNG transparency, brand logo/text and playable MP4',async t=>{
 const env={FFMPEG:process.env.FFMPEG||'ffmpeg'};
 if(!await rendererAvailable(env)){t.skip('Install FFmpeg or set FFMPEG to run real renderer verification.');return;}
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-render-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const ffmpeg=env.FFMPEG;
 const input=path.join(dir,'source.png');execFileSync(ffmpeg,['-loglevel','error','-f','lavfi','-i','color=c=red@0.5:s=160x100,format=rgba','-frames:v','1','-threads','1',input],{windowsHide:true});const bytes=await readFile(input);
 const p=productionInput({kind:'image',brandId:'brand',prompt:'test',aspect:'4:5',transparent:true},{brands:[brand],media:[]});
 const output=await renderAsset({bytes,mime:'image/png'},p,{env,dir,readMedia:async()=>bytes});assert.equal(output.bytes.readUInt32BE(16),1080);assert.equal(output.bytes.readUInt32BE(20),1350);
 const transparentFile=path.join(dir,'transparent.png');await writeFile(transparentFile,output.bytes);
 const pixels=execFileSync(ffmpeg,['-loglevel','error','-i',transparentFile,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,maxBuffer:8*1024*1024});assert.equal(pixels[3],0,'Padded corners must remain transparent');
 const branded=await renderAsset({bytes,mime:'image/png'},{...p,branding:true,overlay:'100% approved: a brand',logoSnapshot:{mime:'image/png'}},{env,dir,readMedia:async()=>bytes});assert.equal(branded.mime,'image/png');
 const video=path.join(dir,'source.mp4');execFileSync(ffmpeg,['-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x100:d=0.2','-f','lavfi','-i','sine=frequency=440:duration=0.2','-c:v','libx264','-c:a','aac','-pix_fmt','yuv420p','-shortest',video],{windowsHide:true});
 const mp4=await renderAsset({bytes:await readFile(video),mime:'video/mp4'},{...p,branding:true,aspect:'1:1',overlay:'Video test',logoSnapshot:{mime:'image/png'}},{env,dir,readMedia:async()=>bytes});assert.equal(mp4.mime,'video/mp4');assert.ok(mp4.bytes.includes(Buffer.from('ftyp')));assert.equal(mp4.width,1080);
 const finished=path.join(dir,'finished.mp4');await writeFile(finished,mp4.bytes);execFileSync(ffmpeg,['-loglevel','error','-i',finished,'-f','null','-'],{windowsHide:true});
});
test('private image thumbnails are bounded, reusable and removed with the asset',async t=>{
 const env={FFMPEG:process.env.FFMPEG||'ffmpeg'};if(!await rendererAvailable(env)){t.skip('FFmpeg is needed for thumbnail verification.');return;}
 const f=await fixture(t,{env});
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAIUlEQVR4nGP8y0AaYCFRPcOoBmIAC1GqkMCoBmIAyaEEAGgAATusqEGCAAAAAElFTkSuQmCC','base64');
 const upload=await fetch(f.base+'/api/media',{method:'POST',headers:{'X-Sniff-Client':'1','Content-Type':'image/png','X-File-Name':'thumbnail.png','X-Brand-Id':'brand'},body:bytes});assert.equal(upload.status,201);const m=await upload.json();
 const route='/api/media/'+m.id+'/thumbnail';assert.equal((await fetch(f.base+route)).status,403);
 const thumb=await fetch(f.base+route,{headers:{'X-Sniff-Client':'1'}});assert.equal(thumb.status,200);assert.equal(thumb.headers.get('content-type'),'image/png');const image=Buffer.from(await thumb.arrayBuffer());assert.ok(image.readUInt32BE(16)<=360);assert.ok(image.readUInt32BE(20)<=240);
 const cached=await fetch(f.base+route,{headers:{'X-Sniff-Client':'1'}});assert.deepEqual(Buffer.from(await cached.arrayBuffer()),image);
 assert.equal((await f.request('/api/media/'+m.id,'DELETE')).status,200);assert.equal((await f.request(route)).status,404);await assert.rejects(readFile(path.join(f.dir,'thumbnails',m.id+'.png')),/ENOENT/);
});
test('existing PNG, JPEG and WebP render through HTTP into every exact output format without AI calls',async t=>{
 const env={FFMPEG:process.env.FFMPEG||'ffmpeg'};if(!await rendererAvailable(env)){t.skip('FFmpeg is needed for existing-image verification.');return;}
 let calls=0;const f=await fixture(t,{env,mediaRenderer:renderAsset,fetcher:async()=>{calls++;throw new Error('Local renders must not call a provider');}});
 for(const [ext,mime] of [['png','image/png'],['jpg','image/jpeg'],['webp','image/webp']]){
  const source=path.join(f.dir,'test-source.'+ext);execFileSync(env.FFMPEG,['-loglevel','error','-f','lavfi','-i','testsrc=s=300x500','-frames:v','1','-threads','1',source],{windowsHide:true});
  const uploaded=await fetch(f.base+'/api/media',{method:'POST',headers:{'X-Sniff-Client':'1','Content-Type':mime,'X-File-Name':'Reference.'+ext,'X-Brand-Id':'brand'},body:await readFile(source)});assert.equal(uploaded.status,201);const media=await uploaded.json();
  for(const [aspect,[width,height]] of Object.entries(formats)){
   const q=await f.request('/api/production','POST',{kind:'render',brandId:'brand',sourceId:media.id,title:'Resize '+ext+' '+aspect,aspect,fit:'contain'});assert.equal(q.status,202);
   const {job,state}=await f.done(q.body.id);assert.equal(job.status,'completed',job.error);assert.equal(job.costEstimate,0);const result=state.media.find(m=>m.id===job.mediaIds[0]);assert.deepEqual([result.width,result.height],[width,height]);
   const download=await fetch(f.base+'/api/media/'+result.id,{headers:{'X-Sniff-Client':'1'}});assert.equal(download.status,200);const bytes=Buffer.from(await download.arrayBuffer());assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[width,height],ext+' '+aspect);
  }
 }
 assert.equal(calls,0);
});
test('installed font selection and refresh use catalog IDs without exposing local font paths',async t=>{
 const catalog=[{id:'local-font',name:'Local font',family:'Local font',style:'Regular',location:'User fonts',file:'private-font-directory/client.ttf',root:'private-font-directory'}];
 const f=await fixture(t,{fontCatalogProvider:async({refresh=false}={})=>refresh?[...catalog,{...catalog[0],id:'new-font',name:'New font'}]:catalog});
 const first=(await f.request('/api/state')).body;assert.equal(first.production.fonts.length,1);assert.ok(!JSON.stringify(first).includes('private-font-directory'));
 const invalid=await f.request('/api/production','POST',{kind:'image',brandId:'brand',prompt:'Test',branding:true,fontId:'system:../../secret'});assert.equal(invalid.status,409);assert.equal(f.store.read().jobs.length,0);
 await writeFile(path.join(f.dir,'uploads','font-source'),png);await f.store.update(s=>s.media.push({id:'font-source',file:'font-source',brandId:'brand',mime:'image/png',name:'Source'}));
 const q=await f.request('/api/production','POST',{kind:'render',brandId:'brand',sourceId:'font-source',branding:true,fontId:'system:local-font'});assert.equal(q.status,202);const {job,state}=await f.done(q.body.id);assert.equal(job.status,'completed');assert.equal(job.production.systemFontName,'Local font');assert.equal(state.media.find(m=>m.role==='rendered').renderingFont,'Local font');assert.ok(!JSON.stringify(state).includes('private-font-directory'));
 const refreshed=await f.request('/api/fonts/refresh','POST',{});assert.equal(refreshed.status,200);assert.equal(refreshed.body.length,2);assert.ok(!JSON.stringify(refreshed.body).includes('private-font-directory'));
});


test('complete Higgsfield key works for submit and poll and stays private',async t=>{
 let submissions=0;const f=await fixture(t,{env:{HF_API_KEY:'complete-private-key',HF_API_KEY_ID:'',HF_API_KEY_SECRET:''},assetDownloader:async()=>Buffer.from('mock mp4'),fetcher:async(_url,opts)=>{
  assert.equal(opts.headers.Authorization,'Key complete-private-key');if(opts.method==='POST'){submissions++;return Response.json({request_id:'single-key-request'});}return Response.json({status:'completed',video:{url:'https://media.example.com/test.mp4'}});
 }});
 assert.equal((await f.request('/api/state')).body.production.higgsfield,true);
 const q=await f.request('/api/production','POST',{kind:'video',brandId:'brand',prompt:'A coastal road',aspect:'16:9'});assert.equal(q.status,202);assert.equal((await f.done(q.body.id)).job.status,'completed');assert.equal(submissions,1);
 assert.ok(!JSON.stringify((await f.request('/api/state')).body).includes('complete-private-key'));assert.ok(!(await readFile(path.join(f.dir,'workspace.json'),'utf8')).includes('complete-private-key'));
});

test('logo-only render needs no font, ignores unused font choices and records no typography',async t=>{
 const env={FFMPEG:process.env.FFMPEG||'ffmpeg'};if(!await rendererAvailable(env)){t.skip('FFmpeg needed');return;}
 const f=await fixture(t,{env,mediaRenderer:renderAsset,fontCatalogProvider:async()=>[]});
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAIUlEQVR4nGP8y0AaYCFRPcOoBmIAC1GqkMCoBmIAyaEEAGgAATusqEGCAAAAAElFTkSuQmCC','base64');
 await f.store.update(s=>{s.brands[0].font='Unavailable custom font';s.media.push({id:'logo',file:'logo',brandId:'brand',mime:'image/png',name:'Approved logo',status:'approved',version:1});});await writeFile(path.join(f.dir,'uploads','logo'),bytes);
 const q=await f.request('/api/production','POST',{kind:'render',brandId:'brand',sourceId:'logo',logoId:'logo',branding:true,includeBrandText:false,fontId:'system:removed-font',aspect:'16:9'});assert.equal(q.status,202);
 const result=await f.done(q.body.id);assert.equal(result.job.status,'completed',result.job.error);const final=result.state.media.find(m=>m.role==='rendered');assert.equal(final.width,1920);assert.equal(final.height,1080);assert.equal(final.renderingFont,undefined);assert.equal(result.job.production.fontId,'');assert.equal(result.job.production.systemFontId,'');assert.equal(result.job.reconciledCost,0);
});
