import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';

async function fixture(t){
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-plan-live-'));
 const account={id:'00000000-0000-4000-8000-000000000001',brand_id:'brand',username:'testaccount',instagram_user_id:'123456789',status:'connected'};
 const staged=[],enqueued=[],remote=new Map();let failEnqueue=false,holdStage=null;
 const app=await createApp({dir,env:{PUBLISHING_OWNER_KEY:'x'.repeat(44)},fontCatalogProvider:async()=>[],fetcher:async(url,opts)=>{
  if(String(url).endsWith('/api/social/accounts'))return Response.json({accounts:[account]});
  if(String(url).endsWith('/api/publishing/stage')){staged.push(opts.headers['X-Publication-Id']);if(holdStage)await holdStage;return Response.json({ok:true});}
  if(String(url).endsWith('/api/publishing/enqueue')){const body=JSON.parse(opts.body);enqueued.push(body);remote.set(body.id,{id:body.id,status:'scheduled',last_error:null});if(failEnqueue)throw Error('Simulated uncertain network result');return Response.json({ok:true});}
  if(String(url).endsWith('/api/publishing/jobs'))return Response.json({jobs:[...remote.values()]});
  throw Error('Unexpected external call '+url);
 }});
 await app.store.update(s=>{s.brands=[{id:'brand',name:'Test',font:'Arial',palette:''}];});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const request=async(route,method='GET',b)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method,headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});return {status:r.status,body:await r.json()};};
 const times=Array.from({length:3},(_,i)=>new Date(Date.now()+(i+7)*86400000).toISOString().slice(0,10)+'T14:15');
 const plan=(await request('/api/plans','POST',{brandId:'brand',title:'Three posting days',goal:'A useful campaign',timezone:'America/Edmonton',days:times.map(localTime=>({localTime,format:'reel',duration:10}))})).body;
 await app.store.update(s=>{for(const e of s.contentPlans[0].entries){Object.assign(e,{status:'approved',title:'Test day',prompt:'Reviewed brief',caption:'Approved public caption '+e.id});s.jobs.push({id:'production-'+e.id,type:'production',status:'completed',createdAt:new Date().toISOString(),reservation:0,costEstimate:0,brandId:'brand',plannerPlanId:plan.id,plannerEntryId:e.id,plannerEntryVersion:e.version,production:{kind:'video',duration:e.duration,aspect:e.aspect,prompt:e.prompt,caption:e.caption,overlay:e.onScreenText},config:{model:'FFmpeg'}});s.media.push({id:'media-'+e.id,file:'media-'+e.id,brandId:'brand',mime:'video/mp4',status:'approved',version:1,role:'rendered',jobId:'production-'+e.id});}});
 for(const e of plan.entries)await writeFile(path.join(dir,'uploads','media-'+e.id),Buffer.from('synthetic MP4 bytes'));
 const route=e=>'/api/plans/'+plan.id+'/days/'+e.id+'/schedule';
 const payload=e=>({version:e.version,mediaId:'media-'+e.id,accountId:account.id});
 return {app,dir,account,plan,request,route,payload,staged,enqueued,remote,failEnqueue:()=>{failEnqueue=true;},holdStage:p=>{holdStage=p;}};
}
test('planner reuses existing local schedules and activates reviewed posts with their original date/time',async t=>{
 const f=await fixture(t),{request,plan}=f;
 for(const e of plan.entries.slice(0,2))assert.equal((await request(f.route(e),'POST',f.payload(e))).status,201);
 assert.equal(f.staged.length,0);
 for(const e of plan.entries){const before=f.app.store.read().schedules?.find(x=>x.plannerEntryId===e.id);const result=await request(f.route(e),'POST',{...f.payload(e),activate:true});assert.equal(result.status,before?200:201,JSON.stringify(result.body));assert.equal(result.body.activationState,'active');assert.equal(result.body.localTime,e.localTime);assert.equal(result.body.timezone,'America/Edmonton');if(before)assert.equal(result.body.id,before.id);}
 assert.equal(f.app.store.read().schedules.length,3);assert.equal(f.staged.length,3);assert.equal(f.enqueued.length,3);
 for(const posted of f.enqueued){const saved=f.app.store.read().schedules.find(x=>x.id===posted.id);assert.equal(posted.scheduledAt,saved.scheduledAt);assert.equal(posted.caption,saved.caption);assert.equal(posted.accountId,f.account.id);}
 const repeated=await request(f.route(plan.entries[0]),'POST',{...f.payload(plan.entries[0]),activate:true});assert.equal(repeated.status,200);assert.equal(f.staged.length,3);assert.equal(f.app.store.read().schedules.length,3);
});
test('a time-only edit schedules already-approved media without regenerating or changing media approval',async t=>{
 const f=await fixture(t),e=f.app.store.read().contentPlans[0].entries[0],localTime=e.localTime.slice(0,11)+'16:30';
 const saved=await f.request('/api/plans/'+f.plan.id+'/days/'+e.id,'PUT',{...e,localTime,status:'approved'});assert.equal(saved.status,200);assert.equal(saved.body.version,e.version+1);
 const activated=await f.request(f.route(e),'POST',{...f.payload(e),version:saved.body.version,activate:true});assert.equal(activated.status,201,JSON.stringify(activated.body));assert.equal(activated.body.localTime,localTime);assert.equal(activated.body.activationState,'active');
 const state=f.app.store.read();assert.equal(state.jobs.length,3,'No new media generation/render request');assert.equal(state.media.find(m=>m.id===activated.body.mediaId).status,'approved');assert.equal(state.jobs[0].plannerEntryVersion,e.version);assert.equal(f.enqueued.length,1);
});
test('uncertain activation is never blindly resubmitted; status refresh reconciles the same cloud job',async t=>{
 const f=await fixture(t),e=f.plan.entries[0];f.failEnqueue();
 const result=await f.request(f.route(e),'POST',{...f.payload(e),activate:true});assert.equal(result.status,503);assert.equal(f.app.store.read().schedules[0].activationState,'uncertain');
 assert.equal((await f.request(f.route(e),'POST',{...f.payload(e),activate:true})).status,409);assert.equal(f.staged.length,1);assert.equal(f.enqueued.length,1);
 assert.equal((await f.request('/api/schedules/sync','POST',{})).status,200);assert.equal(f.app.store.read().schedules[0].activationState,'active');
 assert.equal((await f.request(f.route(e),'POST',{...f.payload(e),activate:true})).status,200);assert.equal(f.staged.length,1);
});
test('local preparation failure preserves a retryable schedule without contacting cloud publishing',async t=>{
 const f=await fixture(t),e=f.plan.entries[0],b={...f.payload(e),activate:true};
 await unlink(path.join(f.dir,'uploads',b.mediaId));
 const failed=await f.request(f.route(e),'POST',b);assert.equal(failed.status,503);assert.equal(f.staged.length,0);assert.equal(f.enqueued.length,0);
 const saved=f.app.store.read().schedules[0];assert.equal(saved.activationState,undefined);assert.match(saved.lastError,/Local media preparation/);
 await writeFile(path.join(f.dir,'uploads',b.mediaId),Buffer.from('restored synthetic MP4'));
 const retried=await f.request(f.route(e),'POST',b);assert.equal(retried.status,200);assert.equal(retried.body.id,saved.id);assert.equal(retried.body.activationState,'active');assert.equal(f.app.store.read().schedules.length,1);assert.equal(f.enqueued.length,1);
});
test('approval, version, account and concurrent submission checks protect planner activation',async t=>{
 const f=await fixture(t),e=f.plan.entries[0],b={...f.payload(e),activate:true};
 assert.equal((await f.request(f.route(e),'POST',{...b,version:999})).status,409);
 assert.equal((await f.request(f.route(e),'POST',{...b,accountId:'other'})).status,409);
 await f.app.store.update(s=>{s.media.find(m=>m.id===b.mediaId).status='needs-review';});
 assert.equal((await f.request(f.route(e),'POST',b)).status,409);assert.equal(f.staged.length,0);assert.equal(f.app.store.read().schedules?.length||0,0);
 await f.app.store.update(s=>{s.media.find(m=>m.id===b.mediaId).status='approved';});
 let release;f.holdStage(new Promise(r=>{release=r;}));const first=f.request(f.route(e),'POST',b);
 for(let i=0;i<100&&!f.staged.length;i++)await new Promise(r=>setTimeout(r,10));
 const second=await f.request(f.route(e),'POST',b);assert.equal(second.status,409);release();assert.equal((await first).status,201);assert.equal(f.staged.length,1);assert.equal(f.enqueued.length,1);assert.equal(f.app.store.read().schedules.length,1);
});
