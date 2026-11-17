import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {Store} from '../lib/store.mjs';

async function fixture(t,options={}){
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-test-'));
 const app=await createApp({dir,env:options.env||{},fetcher:options.fetcher});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 async function request(route,method='GET',value,headers={}){
  const res=await fetch(base+route,{method,headers:{'X-Sniff-Client':'1',...(value!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:value===undefined?undefined:JSON.stringify(value)});
  return {status:res.status,body:await res.json()};
 }
 return {...app,base,request};
}
async function untilDone(request,id){
 for(let i=0;i<200;i++){const s=(await request('/api/state')).body;const j=s.jobs.find(j=>j.id===id);if(j&&!['queued','running'].includes(j.status))return {state:s,job:j};await new Promise(r=>setTimeout(r,10));}
 throw new Error('Job failed to finish');
}
test('trend research blocks non-search providers before billing and flags missing source evidence',async t=>{
 let calls=0,withSources=false;
 const {request}=await fixture(t,{env:{PERPLEXITY_API_KEY:'mock'},fetcher:async(url,options)=>{
  calls++;assert.deepEqual(JSON.parse(options.body).tools,[{type:'web_search'}]);
  return Response.json({status:'completed',output:[...(withSources?[{type:'search_results',results:[{url:'https://example.com/trend'}]}]:[]),{type:'message',content:[{type:'output_text',text:'Research draft for review.'}]}],usage:{input_tokens:10,output_tokens:10}});
 }});
 const brand=(await request('/api/brands','POST',{name:'Research QA'})).body;
 await request('/api/settings','PUT',{monthlyBudget:10,reservePerJob:1,providers:{perplexity:{model:'openai/example-model'}}});
 const payload={brandId:brand.id,skill:'ig-viral',brief:'Travel trends'};
 for(const provider of ['openai','anthropic']){
  const rejected=await request('/api/jobs','POST',{...payload,provider});
  assert.equal(rejected.status,409);assert.match(rejected.body.error,/requires Perplexity/);
 }
 assert.equal((await request('/api/state')).body.jobs.length,0);assert.equal(calls,0);
 const start=await request('/api/jobs','POST',{...payload,provider:'perplexity'});
 const missing=await untilDone(request,start.body.id);
 assert.equal(missing.job.status,'incomplete');assert.match(missing.job.error,/No web search sources/);
 assert.equal(missing.state.drafts[0].status,'needs-review');assert.equal(missing.state.usage.committed,1);
 withSources=true;
 const sourced=await request('/api/jobs','POST',{...payload,provider:'perplexity'});
 const done=await untilDone(request,sourced.body.id);
 assert.equal(done.job.status,'completed');assert.deepEqual(done.state.drafts[0].sources,['https://example.com/trend']);
 assert.equal(calls,2);
});
test('all thirteen workflows save usable drafts through the HTTP queue with brand context',async t=>{
 const {request}=await fixture(t,{env:{PERPLEXITY_API_KEY:'mock'},fetcher:async(url,options)=>{
  const prompt=JSON.parse(JSON.parse(options.body).input);
  assert.equal(prompt.brand.name,'Complete workflow QA');assert.equal(prompt.brand.forbiddenClaims,'guaranteed savings');
  return Response.json({status:'completed',output:[{type:'search_results',results:[{url:'https://example.com/evidence'}]},{type:'message',content:[{type:'output_text',text:'Review this draft: '+prompt.task}]}],usage:{input_tokens:5,output_tokens:5}});
 }});
 const brand=(await request('/api/brands','POST',{name:'Complete workflow QA',forbiddenClaims:'guaranteed savings'})).body;
 await request('/api/settings','PUT',{monthlyBudget:25,reservePerJob:1,providers:{perplexity:{model:'fast'}}});
 const initial=(await request('/api/state')).body;
 for(const skill of initial.skills){
  const start=await request('/api/jobs','POST',{brandId:brand.id,skill:skill.id,provider:'perplexity',brief:'Supplied source material and metrics for '+skill.name});
  assert.equal(start.status,202,skill.id);
  const {job}=await untilDone(request,start.body.id);assert.equal(job.status,'completed',skill.id);
 }
 const final=(await request('/api/state')).body;
 assert.equal(final.drafts.length,13);assert.equal(new Set(final.drafts.map(d=>d.skill)).size,13);
});
test('local developer HTTP boundaries and module checks',async t=>{
 const {request,base}=await fixture(t);
 const state=await request('/api/state');assert.equal(state.status,200);assert.equal(state.body.role,'developer-owner');assert.equal(state.body.appVersion,'0.2.2');
 assert.equal((await fetch(base+'/api/state')).status,403);
 assert.equal((await request('/api/state','GET',undefined,{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/sniff/prospects')).status,403);
 assert.equal((await request('/.env')).status,404);
 assert.equal((await request('/server.mjs')).status,404);
 const home=await fetch(base);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.match(await home.text(),/AI Marketing Studio/);
});
test('brand and draft lifecycle guards stale saves and retains version history',async t=>{
 const {request}=await fixture(t);
 const b=(await request('/api/brands','POST',{name:'Travel One',voice:'Plain and friendly'})).body;
 const d=(await request('/api/drafts','POST',{brandId:b.id,title:'First',text:'Save your next trip.'})).body;
 assert.equal((await request('/api/drafts/'+d.id,'PUT',{title:'Reviewed',text:'Explore your next trip.',status:'approved',version:1})).status,200);
 assert.equal((await request('/api/drafts/'+d.id,'PUT',{title:'Stale',text:'Old',status:'draft',version:1})).status,409);
 let state=(await request('/api/state')).body;assert.equal(state.drafts[0].versions[0].text,'Save your next trip.');assert.equal(state.drafts[0].status,'approved');
 assert.equal((await request('/api/brands/'+b.id,'DELETE')).status,409);
 assert.equal((await request('/api/drafts/'+d.id,'DELETE')).status,200);
 assert.equal((await request('/api/brands/'+b.id,'DELETE')).status,200);
});
test('queue saves outputs and holds unpriced reservations without fake success',async t=>{
 const {request}=await fixture(t,{env:{OPENAI_API_KEY:'do-not-expose'},fetcher:async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Save your next travel idea.'}]}],usage:{input_tokens:10,output_tokens:8}})});
 const b=(await request('/api/brands','POST',{name:'Travel One'})).body;
 await request('/api/settings','PUT',{monthlyBudget:1,reservePerJob:1,providers:{openai:{model:'test'}}});
 const first=await request('/api/jobs','POST',{brandId:b.id,title:'Test',skill:'ig-caption',brief:'Trip planner',provider:'openai'});
 assert.equal(first.status,202);
 const {state,job}=await untilDone(request,first.body.id);
 assert.equal(job.status,'completed');assert.equal(state.drafts.length,1);assert.equal(state.usage.committed,1);
 assert.ok(!JSON.stringify(state).includes('do-not-expose'));
 assert.equal((await request('/api/jobs','POST',{brandId:b.id,skill:'ig-reel',brief:'More',provider:'openai'})).status,409);
 await request('/api/jobs/'+job.id+'/reconcile','POST',{cost:0.1});
 assert.equal((await request('/api/state')).body.usage.committed,0.1);
});
test('partial output is saved but never marked completed',async t=>{
 const {request}=await fixture(t,{env:{OPENAI_API_KEY:'x'},fetcher:async()=>Response.json({status:'incomplete',output:[{content:[{type:'output_text',text:'Partial draft'}]}]})});
 const b=(await request('/api/brands','POST',{name:'Test'})).body;
 await request('/api/settings','PUT',{monthlyBudget:10,reservePerJob:1,providers:{openai:{model:'test'}}});
 const start=await request('/api/jobs','POST',{brandId:b.id,skill:'ig-caption',brief:'Test',provider:'openai'});
 const result=await untilDone(request,start.body.id);
 assert.equal(result.job.status,'incomplete');assert.equal(result.state.drafts[0].status,'needs-review');
});
test('failed provider call produces no draft or automatic retry',async t=>{
 let count=0;
 const {request}=await fixture(t,{env:{OPENAI_API_KEY:'x'},fetcher:async()=>{count++;return new Response('private remote body',{status:503});}});
 const b=(await request('/api/brands','POST',{name:'Test'})).body;
 await request('/api/settings','PUT',{monthlyBudget:10,reservePerJob:1,providers:{openai:{model:'test'}}});
 const start=await request('/api/jobs','POST',{brandId:b.id,skill:'ig-caption',brief:'Test',provider:'openai'});
 const result=await untilDone(request,start.body.id);
 assert.equal(result.job.status,'failed');assert.equal(result.state.drafts.length,0);assert.equal(count,1);
 assert.ok(!JSON.stringify(result.state).includes('private remote body'));
});
test('media round-trips and active documents are rejected',async t=>{
 const {request,base}=await fixture(t);
 const b=(await request('/api/brands','POST',{name:'Assets'})).body;
 const headers={'X-Sniff-Client':'1','X-Brand-Id':b.id,'X-File-Name':'notes.txt','Content-Type':'text/plain'};
 const upload=await fetch(base+'/api/media',{method:'POST',headers,body:'Reference notes'});
 assert.equal(upload.status,201);const m=await upload.json();
 const file=await fetch(base+'/api/media/'+m.id,{headers:{'X-Sniff-Client':'1'}});
 assert.equal(await file.text(),'Reference notes');assert.match(file.headers.get('content-disposition'),/attachment/);
 const bad=await fetch(base+'/api/media',{method:'POST',headers:{...headers,'Content-Type':'image/svg+xml'},body:'<svg/>'});assert.equal(bad.status,400);
 assert.equal((await request('/api/media/'+m.id,'DELETE')).status,200);
});
test('Python editorial tools run only allowlisted commands',async t=>{
 const {request}=await fixture(t);
 assert.equal((await request('/api/checks','POST',{command:'../../evil',text:'Hello'})).status,400);
 const check=await request('/api/checks','POST',{command:'caption',text:'Save this #travel'});
 assert.equal(check.status,200);assert.equal(check.body.characters,17);
});
test('local storage persists, rejects parallel writers and detects stale cloud revisions',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await new Store({dir}).init();
 await store.update(s=>{s.brands.push({id:'saved',name:'Persistent'});});
 await assert.rejects(new Store({dir}).init(),/EEXIST/);await store.close();
 const reopened=await new Store({dir}).init();assert.equal(reopened.read().brands[0].name,'Persistent');await reopened.close();
 const cloud=await new Store({dir,mode:'supabase',url:'https://example.supabase.co',key:'server-key',fetcher:async(url,opts)=>Response.json(opts.method==='GET'?[{revision:4,document:{version:1,brands:[],drafts:[],jobs:[],media:[],audit:[],settings:{}}}]:[])}).init();
 await assert.rejects(cloud.update(s=>{s.brands.push({name:'Conflict'});}),/another process/);
 assert.equal(cloud.read().brands.length,0);await cloud.close();
});
test('restart marks running jobs interrupted without replaying billed requests',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-restart-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=await new Store({dir}).init();
 await store.update(s=>s.jobs.push({id:'running',status:'running',reservation:1,createdAt:new Date().toISOString()}));await store.close();
 const app=await createApp({dir,env:{}});t.after(()=>app.close());
 assert.equal(app.store.read().jobs[0].status,'interrupted');
});

test('Supabase media uses private downloads and bucket-level prefix deletion',async t=>{
 const requests=[];let cloudDocument;let cloudRevision=0;
 const mock=async(url,options)=>{
  requests.push({url,...options});
  if(url.includes('/rest/v1/')){
   if(options.method==='GET')return Response.json(cloudDocument?[{document:cloudDocument,revision:cloudRevision}]:[]);
   const b=JSON.parse(options.body);cloudDocument=b.document;cloudRevision=b.revision;
   return Response.json([{document:cloudDocument,revision:cloudRevision}]);
  }
  if(options.method==='GET')return new Response('private reference');
  return Response.json({ok:true});
 };
 const {request,base}=await fixture(t,{env:{STORAGE_MODE:'supabase',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',WORKSPACE_ID:'developer'},fetcher:mock});
 const b=(await request('/api/brands','POST',{name:'Cloud test'})).body;
 const res=await fetch(base+'/api/media',{method:'POST',headers:{'X-Sniff-Client':'1','X-File-Name':'reference.txt','X-Brand-Id':b.id,'Content-Type':'text/plain'},body:'reference'});
 assert.equal(res.status,201);const m=await res.json();
 const download=await fetch(base+'/api/media/'+m.id,{headers:{'X-Sniff-Client':'1'}});assert.equal(await download.text(),'private reference');
 assert.equal((await request('/api/media/'+m.id,'DELETE')).status,200);
 const removal=requests.find(r=>r.method==='DELETE');
 assert.equal(removal.url,'https://example.supabase.co/storage/v1/object/marketing-media');
 assert.deepEqual(JSON.parse(removal.body),{prefixes:['developer/'+m.id]});
 assert.ok(!JSON.stringify((await request('/api/state')).body).includes('sb_secret_test'));
});

