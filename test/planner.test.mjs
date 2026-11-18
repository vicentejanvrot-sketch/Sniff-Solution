import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {createPlan,saveEntry,parsePlanOutput,plannerProduction} from '../lib/planner.mjs';
const fields={title:'A calmer trip',purpose:'Help travellers prepare. Creative scene, not a product claim.',prompt:'A suitcase beside a sunlit window. Slow camera push.',onScreenText:'Plan your next trip',caption:'Where will you go next? Save this idea. #travel'};
const day=()=>new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T14:00';
const input=()=>({brandId:'brand',title:'Next week',goal:'Introduce the travel brand',timezone:'America/Edmonton',days:[{localTime:day(),format:'image'}]});
test('planner validates dates, review versions, ownership and immutable publication history',()=>{
 const s={brands:[{id:'brand',name:'Travel'}],jobs:[],schedules:[],audit:[]};const plan=createPlan(s,input());s.contentPlans=[plan];const e=plan.entries[0];
 assert.equal(e.status,'planned');assert.throws(()=>createPlan(s,{...input(),days:[{localTime:'2026-02-30T14:00'}]}));
 assert.throws(()=>createPlan(s,{...input(),days:[...input().days,...input().days]}),/distinct/);
 assert.throws(()=>saveEntry(s,plan.id,e.id,{...fields,version:2,status:'approved'}),/changed/);
 saveEntry(s,plan.id,e.id,{...fields,version:1,status:'approved'});assert.equal(e.version,2);assert.equal(e.history.length,1);
 const production={...fields,kind:'image',brandId:'brand',aspect:'4:5',plannerPlanId:plan.id,plannerEntryId:e.id,plannerEntryVersion:2};
 assert.equal(plannerProduction(s,production).plannerEntryId,e.id);
 assert.throws(()=>plannerProduction(s,{...production,brandId:'other'}),/approve/);
 assert.throws(()=>plannerProduction(s,{...production,caption:'Changed public text'}),/settings changed/);
 s.schedules.push({plannerEntryId:e.id,status:'published'});assert.throws(()=>saveEntry(s,plan.id,e.id,{...fields,version:2,status:'approved'}),/publication record/);
 assert.throws(()=>parsePlanOutput('partial JSON'),/complete content/);assert.throws(()=>parsePlanOutput(JSON.stringify({...fields,caption:'x'.repeat(2201)})),/too long/);
});
test('planner HTTP prepares one day, preserves reservations, produces approved content and schedules without live publishing',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-planner-'));let paidText=0,paidMedia=0,malformed=false;
 const account={id:'00000000-0000-4000-8000-000000000001',brand_id:'brand',instagram_user_id:'123456789',username:'travel',status:'connected'};
 const app=await createApp({dir,env:{OPENAI_API_KEY:'private-key',PUBLISHING_OWNER_KEY:'x'.repeat(44)},fontCatalogProvider:async()=>[],mediaRenderer:async r=>r,fetcher:async(url,opts)=>{
  if(String(url).endsWith('/api/social/accounts'))return Response.json({accounts:[account]});
  if(String(url).endsWith('/responses')){paidText++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:malformed?'broken output':JSON.stringify(fields)}]}],usage:{input_tokens:10,output_tokens:50}});}
  if(String(url).endsWith('/images/generations')){paidMedia++;assert.ok(JSON.parse(opts.body).prompt.includes(fields.prompt));return Response.json({data:[{b64_json:Buffer.from('mock png').toString('base64')}]});}
  throw Error('Unexpected cloud call '+url);
 }});
 await app.store.update(s=>{s.brands=[{id:'brand',name:'Travel',font:'Arial',palette:''}];s.settings.providers.openai.model='mock';s.settings.production={imageModel:'mock-image',reserve:2};});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const request=async(route,method='GET',b)=>{const res=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method,headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});return {status:res.status,body:await res.json()};};
 const done=async id=>{for(let i=0;i<300;i++){const job=app.store.read().jobs.find(j=>j.id===id);if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out');};
 const created=await request('/api/plans','POST',input());assert.equal(created.status,201);assert.equal(paidText,0);const p=created.body,e=p.entries[0],route='/api/plans/'+p.id+'/days/'+e.id;
 const queued=await request('/api/plans/'+p.id+'/prepare','POST',{provider:'openai',entryIds:[e.id]});assert.equal(queued.status,202);
 assert.equal((await done(queued.body.jobs[0].id)).status,'completed');assert.equal(paidText,1);assert.equal(paidMedia,0);
 let current=app.store.read().contentPlans[0].entries[0];assert.equal(current.caption,fields.caption);assert.equal(current.status,'needs-review');
 const production={brandId:'brand',kind:'image',aspect:'4:5',prompt:fields.prompt,caption:fields.caption,plannerPlanId:p.id,plannerEntryId:e.id,plannerEntryVersion:current.version};
 assert.equal((await request('/api/production','POST',production)).status,409);
 const approved=await request(route,'PUT',{...fields,version:current.version,status:'approved'});assert.equal(approved.status,200);production.plannerEntryVersion=approved.body.version;
 const mediaJob=await request('/api/production','POST',production);assert.equal(mediaJob.status,202,JSON.stringify(mediaJob.body));assert.equal((await done(mediaJob.body.id)).status,'completed');assert.equal(paidMedia,1);
 const m=app.store.read().media.find(m=>m.role==='rendered');assert.equal(m.caption,fields.caption);
 assert.equal((await request(route+'/schedule','POST',{version:approved.body.version,mediaId:m.id,accountId:account.id})).status,409);
 assert.equal((await request('/api/media/'+m.id,'PUT',{version:m.version,status:'approved',caption:fields.caption})).status,200);
 const scheduled=await request(route+'/schedule','POST',{version:approved.body.version,mediaId:m.id,accountId:account.id});assert.equal(scheduled.status,201,JSON.stringify(scheduled.body));assert.equal(scheduled.body.caption,fields.caption);assert.equal(scheduled.body.localTime,day());assert.equal(scheduled.body.activationState,undefined);
 assert.equal((await request(route+'/schedule','POST',{version:approved.body.version,mediaId:m.id,accountId:account.id})).status,409);
 assert.equal((await request(route,'PUT',{...fields,version:approved.body.version,status:'approved'})).status,409);
 const p2=(await request('/api/plans','POST',input())).body;malformed=true;
 const failed=await request('/api/plans/'+p2.id+'/prepare','POST',{provider:'openai',entryIds:[p2.entries[0].id]});assert.equal((await done(failed.body.jobs[0].id)).status,'failed');
 current=app.store.read().contentPlans.find(x=>x.id===p2.id).entries[0];assert.equal(current.status,'planned');assert.equal(current.prompt,'');assert.equal(paidText,2);
 assert.equal(app.store.read().jobs.find(j=>j.id===failed.body.jobs[0].id).reservation,1);
 const publicState=(await request('/api/state')).body;assert.ok(!JSON.stringify(publicState).includes('private-key'));
});
