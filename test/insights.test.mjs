import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createInsights,metricValue} from '../lib/insights.mjs';
import {analyticsReport,analyticsCSV} from '../lib/analytics.mjs';
import {encryptToken} from '../lib/publishing-crypto.mjs';
test('Insights distinguish zero from missing metrics and reject non-numeric data',()=>{
 assert.equal(metricValue({data:[{name:'views',values:[{value:0}]}]},'views'),0);
 assert.equal(metricValue({data:[]},'views'),null);assert.equal(metricValue({data:[{name:'views',total_value:{value:12}}]},'views'),12);
 assert.equal(metricValue({data:[{name:'views',values:[{value:'15'}]}]},'views'),null);
});
function fixture(){
 const encryptionKey=randomBytes(32).toString('base64'),account={id:'00000000-0000-4000-8000-000000000001',brand_id:'brand',instagram_user_id:'123456789',username:'travel',token_ciphertext:encryptToken('private-token',encryptionKey,'developer:brand:123456789')};
 let state=null,clock=Date.parse('2026-11-18T20:00:00Z'),rateLimited=false,permissionDenied=false,graphCalls=0;
 const fetcher=async(target,opts)=>{const u=new URL(target);
  if(u.host==='graph.facebook.com'){
   graphCalls++;assert.equal(opts.headers.Authorization,'Bearer private-token');assert.equal(u.searchParams.get('access_token'),null);assert.equal(opts.method,undefined);
   if(rateLimited)return Response.json({error:{code:4}},{status:429});if(permissionDenied)return Response.json({error:{code:200}},{status:403});
   if(u.searchParams.has('fields'))return Response.json({followers_count:18});
   const name=u.searchParams.get('metric');if(name==='shares')return Response.json({data:[]});
   return Response.json({data:[{name,total_value:{value:10}}]});
  }
  assert.equal(u.host,'project.supabase.co');assert.equal(opts.headers.apikey,'server-key');assert.equal(u.searchParams.get('workspace_id')||JSON.parse(opts.body).workspace_id,'eq.developer'===u.searchParams.get('workspace_id')?'eq.developer':'developer');
  if(u.pathname.endsWith('/marketing_instagram_accounts'))return Response.json([account]);
  if(u.pathname.endsWith('/marketing_publish_jobs'))return Response.json([{id:'post',instagram_media_id:'987654321',published_at:'2026-11-17T20:00:00Z',caption:'Save this idea',format:'reel'}]);
  assert.ok(u.pathname.endsWith('/marketing_insights'));
  if(opts.method==='GET')return Response.json(state?[state]:[]);
  if(opts.method==='POST'){state??={...JSON.parse(opts.body),revision:0,document:{snapshots:[]}};return Response.json([state]);}
  if(u.searchParams.get('revision')!=='eq.'+state.revision)return Response.json([]);
  Object.assign(state,JSON.parse(opts.body));return Response.json([state]);
 };
 const client=createInsights({url:'https://project.supabase.co',key:'server-key',workspaceId:'developer',encryptionKey,fetcher,clock:()=>clock});
 return {client,state:()=>state,calls:()=>graphCalls,advance:()=>{clock+=7*3600000;},limit:()=>{rateLimited=true;},deny:()=>{permissionDenied=true;}};
}
test('Insights persists private snapshots, throttles refreshes and retains good data after rate limits',async()=>{
 const f=fixture();assert.equal((await f.client.sync()).processed,1);let state=f.state();assert.equal(state.document.snapshots.length,2);assert.equal(state.document.snapshots[0].day,'2026-11-17');assert.equal(state.document.snapshots[1].metrics.shares,null);assert.ok(!JSON.stringify(state.document).includes('private-token'));
 const calls=f.calls();assert.equal((await f.client.sync()).processed,0);assert.equal((await f.client.sync(state.account_id,{force:true})).processed,0);assert.equal(f.calls(),calls);
 f.advance();f.limit();await f.client.sync();assert.equal(f.calls(),calls+1);state=f.state();assert.equal(state.document.snapshots.length,2);assert.match(state.last_error,/rate limit/);
 const denied=fixture();denied.deny();await denied.client.sync();assert.match(denied.state().last_error,/instagram_manage_insights/);assert.equal(denied.calls(),1);
});
test('analytics uses latest post lifetime observations, scoped cohorts, incomplete engagement and safe CSV',()=>{
 const make=(date,views,brandId='a')=>({kind:'media',brandId,accountId:'account',mediaId:'media',publicationId:'post',publishedAt:'2026-11-10T10:00:00Z',capturedAt:date,format:'reel',caption:'=A1',metrics:{views,reach:10,likes:1,comments:0,saved:2,shares:null}});
 const s={analytics:{snapshots:[make('2026-11-11T10:00:00Z',10),make('2026-11-12T10:00:00Z',20),{...make('2026-11-12T10:00:00Z',100,'b'),accountId:'other'}]}};
 const report=analyticsReport(s,{brandId:'a',from:'2026-11-10',to:'2026-11-10'});assert.equal(report.posts.length,1);assert.equal(report.summary.views.total,20);assert.equal(report.summary.shares.total,null);assert.equal(report.posts[0].engagementRate,null);assert.match(report.learning,/Small sample/);assert.match(analyticsCSV(report),/"'=A1"/);
 assert.equal(analyticsReport(s,{brandId:'a',from:'2026-11-11'}).posts.length,0);
});

test('cloud Insights routes require the owner key and never activate publishing',async t=>{
 const {createPublishingServer}=await import('../cloud/publishing-server.mjs');
 const {once}=await import('node:events');let syncs=0;
 const ownerKey='x'.repeat(44),connection={ownerKey,publishingEnabled:false,insights:{list:async()=>[{document:{snapshots:[]}}],sync:async()=>{syncs++;return {processed:1};}}};
 const server=createPublishingServer({connection});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/insights/snapshots')).status,401);
 const headers={Authorization:'Bearer '+ownerKey,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/insights/snapshots',{headers})).status,200);
 assert.equal((await fetch(base+'/api/insights/sync',{method:'POST',headers,body:JSON.stringify({accountId:'bad'})})).status,400);
 assert.equal(syncs,0);
 assert.equal((await fetch(base+'/api/insights/sync',{method:'POST',headers,body:JSON.stringify({accountId:'00000000-0000-4000-8000-000000000001'})})).status,202);
 assert.equal(syncs,1);assert.equal(connection.publishingEnabled,false);
 connection.insights=null;assert.equal((await fetch(base+'/api/insights/snapshots',{headers})).status,409);
});
