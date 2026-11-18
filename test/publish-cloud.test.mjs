import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createCloudPublisher} from '../lib/publish-cloud.mjs';
import {encryptToken} from '../lib/publishing-crypto.mjs';
const ws='developer',brand='brand1',accountId=randomUUID(),instagramId='17841431165786164',key=randomBytes(32).toString('base64');
const date=Date.parse('2026-11-18T12:00:00Z');
function setup(){
 let now=date;const jobs=[],events=[],assets=new Map(),graphCalls=[];
 const authRow={id:accountId,workspace_id:ws,brand_id:brand,status:'connected',instagram_user_id:instagramId,token_ciphertext:encryptToken('test-token',key,ws+':'+brand+':'+instagramId)};
 async function fake(url,opt={}){
  const u=new URL(url),pathname=u.pathname,method=opt.method||'GET';
  if(u.hostname==='graph.facebook.com'){
   assert.equal(opt.headers.Authorization,'Bearer test-token');graphCalls.push({path:pathname,method,body:opt.body});
   if(pathname.endsWith('/media_publish'))return Response.json({id:'202620262026'});
   if(pathname.endsWith('/media'))return Response.json({id:'100200300'});
   if(pathname.endsWith('/100200300'))return Response.json({status_code:'FINISHED'});
   throw Error('Unknown Meta call');
  }
  if(pathname.includes('/storage/v1/object/marketing-media/')){
   const storage=decodeURIComponent(pathname.split('/marketing-media/')[1]);
   if(method==='POST'){if(assets.has(storage))return Response.json({error:'Duplicate'},{status:409});assets.set(storage,Buffer.from(opt.body));return Response.json({Key:storage});}
  }
  if(pathname.includes('/storage/v1/object/info/marketing-media/')){
   const storage=decodeURIComponent(pathname.split('/marketing-media/')[1]);
   return assets.has(storage)?Response.json({name:storage}):Response.json({error:'missing'},{status:404});
  }
  if(pathname.includes('/storage/v1/object/sign/marketing-media/')){
   const storage=pathname.split('/marketing-media/')[1];
   return Response.json({signedURL:'/object/sign/marketing-media/'+storage+'?token=mock-signature'});
  }
  if(pathname.endsWith('/marketing_instagram_accounts')){
   return Response.json(u.searchParams.get('id')==='eq.'+accountId?[authRow]:[]);
  }
  if(pathname.endsWith('/marketing_publish_events')){
   events.push(JSON.parse(opt.body));return Response.json([events.at(-1)],{status:201});
  }
  if(pathname.endsWith('/marketing_publish_jobs')){
   if(method==='POST'){const item=JSON.parse(opt.body);if(jobs.some(j=>j.id===item.id))return Response.json({error:'unique conflict'},{status:409});jobs.push(item);return Response.json([item],{status:201});}
   if(method==='GET'){
    let result=[...jobs];for(const [k,v] of u.searchParams.entries())if(['id','workspace_id','status','scheduled_at'].includes(k)){
     if(v.startsWith('eq.'))result=result.filter(j=>String(j[k])===v.slice(3));
     if(v.startsWith('lte.'))result=result.filter(j=>String(j[k])<=v.slice(4));
     if(v.startsWith('in.'))result=result.filter(j=>v.slice(4).includes(j[k]));
    }
    return Response.json(result);
   }
   if(method==='PATCH'){
    const fields=JSON.parse(opt.body),job=jobs.find(j=>j.id===u.searchParams.get('id')?.slice(3)&&j.status===(u.searchParams.get('status')||'').replace('eq.','')&&(u.searchParams.has('attempts')?j.attempts===0:true));
    if(!job)return Response.json([]);
    Object.assign(job,fields);return Response.json([job]);
   }
  }
  throw Error('Unexpected request '+method+' '+u);
 }
 const publisher=createCloudPublisher({url:'https://test.supabase.co',key:'sb_secret_test',workspaceId:ws,encryptionKey:key,fetcher:fake,clock:()=>now,sleep:async()=>{}});
 const input=(id=randomUUID())=>({id,accountId,brandId:brand,assetId:randomUUID(),assetVersion:2,mime:'image/jpeg',caption:'Post #travel',scheduledAt:new Date(now+180000).toISOString(),timezone:'America/Edmonton'});
 return {publisher,input,jobs,events,assets,graphCalls,advance:ms=>now+=ms};
}
test('private staged media and atomic publishing claim result in one Instagram post',async()=>{
 const {publisher,input,jobs,graphCalls,advance}=setup();
 const p=input();
 await assert.rejects(publisher.enqueue(p),/staged before/);
 assert.equal((await publisher.stage(p.id,'image/jpeg',Buffer.from([0xff,0xd8,0xff,0xd9]))).storagePath,'developer/publishing/'+p.id);
 const scheduled=await publisher.enqueue(p);assert.equal(scheduled.status,'scheduled');
 await assert.rejects(publisher.enqueue(p),/storage request failed/);
 assert.equal(await publisher.pump(),0);advance(180000);assert.equal(await publisher.pump(),1);
 assert.equal(jobs[0].status,'published');assert.equal(jobs[0].instagram_media_id,'202620262026');
 assert.equal(await publisher.pump(),0);
 assert.equal(graphCalls.filter(c=>c.path.endsWith('/media_publish')).length,1);
});
test('cloud cancellation cannot interrupt a publication after it has claimed the job',async()=>{
 const {publisher,input,jobs,advance}=setup();const p=input();
 await publisher.stage(p.id,'image/jpeg',Buffer.from([255,216,255,217]));await publisher.enqueue(p);
 assert.equal((await publisher.cancel(p.id)).status,'cancelled');
 advance(180000);await publisher.pump();assert.equal(jobs[0].status,'cancelled');
 await assert.rejects(publisher.cancel(p.id),/already started/);
});
test('video publishes as a Reel only after processing status FINISHED',async()=>{
 const {publisher,input,advance,graphCalls,jobs}=setup();const p={...input(),mime:'video/mp4'};
 await publisher.stage(p.id,p.mime,Buffer.from('test-mp4'));await publisher.enqueue(p);
 advance(180000);await publisher.pump();
 assert.equal(jobs[0].status,'published');
 assert.ok(graphCalls.some(c=>c.body?.get('media_type')==='REELS'));
 assert.ok(graphCalls.some(c=>c.method==='GET'&&c.path.endsWith('/100200300')));
});
