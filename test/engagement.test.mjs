import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {createEngagement,researchTargets,rankResearch,verifyMetaSignature,replyAllowed} from '../lib/engagement.mjs';
import {encryptToken} from '../lib/publishing-crypto.mjs';
import {createPublishingServer} from '../cloud/publishing-server.mjs';
import {once} from 'node:events';

const aid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
function fixture(){
 const key=randomBytes(32).toString('base64'),now=Date.parse('2026-11-19T02:00:00Z');let sends=0,uncertain=false,deny=false,hashtagDenied=false;
 const a={id:aid,workspace_id:'developer',brand_id:'brand',instagram_user_id:'123456',username:'brand',status:'connected',token_ciphertext:encryptToken('private',key,'developer:brand:123456')};
 const tables={marketing_instagram_accounts:[a],marketing_social_sync:[],marketing_inbox:[],marketing_inbox_replies:[]};
 const fetcher=async(target,opts)=>{const u=new URL(target);
  if(u.hostname==='graph.facebook.com'){
   assert.equal(opts.headers.Authorization,'Bearer private');assert.equal(u.searchParams.has('access_token'),false);
   if(opts.method==='POST'){sends++;if(uncertain)throw Error('Lost response');return Response.json({id:'sent-id'});}
   if(deny)return Response.json({error:{code:200,message:'Messaging access is disabled for credential private'}},{status:403});
   if(hashtagDenied&&u.pathname.endsWith('/ig_hashtag_search'))return Response.json({error:{code:10,message:"To use Instagram Public Content Access, your use of this endpoint must be reviewed and approved by Facebook."}},{status:403});
   if(u.searchParams.has('fields')&&u.searchParams.get('fields').startsWith('business_discovery'))return Response.json({business_discovery:{followers_count:100,media:{data:[{id:'p1',caption:'A hook',media_type:'VIDEO',media_product_type:'REELS',permalink:'https://www.instagram.com/reel/abc/',like_count:10,comments_count:2,view_count:0},{id:'p2',permalink:'javascript:alert(1)',caption:'<script>',media_type:'IMAGE'}]}}});
   if(u.pathname.endsWith('/ig_hashtag_search'))return Response.json({data:[{id:'987'}]});
   if(u.pathname.endsWith('/top_media'))return Response.json({data:[{id:'p3',caption:'Industry idea',media_type:'VIDEO',like_count:0,comments_count:0}]});
   if(u.pathname.endsWith('/media'))return Response.json({data:[{id:'post'}]});
   if(u.pathname.endsWith('/comments'))return Response.json({data:[{id:'c1',text:'How much?',timestamp:new Date(now-1000).toISOString(),from:{id:'789',username:'customer'}}]});
   if(u.pathname.endsWith('/conversations'))return Response.json({data:[{id:'thread'}]});
   if(u.pathname.endsWith('/messages'))return Response.json({data:[{id:'m1',message:'Can you help?',created_time:new Date(now-1000).toISOString(),from:{id:'789',username:'customer'},to:{data:[{id:'123456'}]}}]});
   throw Error('Unexpected Graph '+u);
  }
  assert.equal(u.hostname,'project.supabase.co');assert.equal(opts.headers.apikey,'server');
  const table=u.pathname.split('/').at(-1),rows=tables[table];assert.ok(rows,table);
  const match=row=>[...u.searchParams].filter(([k])=>!['select','order','limit','on_conflict'].includes(k)).every(([k,v])=>v==='eq.'+row[k]);
  let result=rows.filter(match);
  if(opts.method==='POST'){
   const b=JSON.parse(opts.body),primary=table==='marketing_social_sync'?['workspace_id','account_id','kind']:table==='marketing_inbox_replies'?['workspace_id','account_id','item_id']:['workspace_id','account_id','id'];
   const old=rows.find(r=>primary.every(k=>r[k]===b[k]));
   if(old&&opts.headers.Prefer.includes('ignore-duplicates'))result=[old];
   else if(old&&opts.headers.Prefer.includes('merge-duplicates')){Object.assign(old,b);result=[old];}
   else if(old)return Response.json({error:'conflict'},{status:409});
   else{const row={revision:0,created_at:new Date(now).toISOString(),...b};rows.push(row);result=[row];}
  }else if(opts.method==='PATCH'){const b=JSON.parse(opts.body);for(const r of result)Object.assign(r,b);}
  return Response.json(structuredClone(result));
 };
 const client=createEngagement({url:'https://project.supabase.co',key:'server',workspaceId:'developer',encryptionKey:key,fetcher,clock:()=>now});
 return {client,tables,sends:()=>sends,uncertain:()=>{uncertain=true;},deny:()=>{deny=true;},denyHashtags:()=>{hashtagDenied=true;},now};
}
test('research target validation and relative ranking preserve unknowns and sample limits',()=>{
 assert.deepEqual(researchTargets({competitors:['Foo','foo'],hashtags:['Travel']}),{competitors:['foo'],hashtags:['travel']});
 assert.throws(()=>researchTargets({competitors:['foo){access_token}']}));assert.throws(()=>researchTargets({hashtags:['a','b','c','d']}));
 const ranked=rankResearch([1,2,3,10].map((likes,i)=>({id:String(i),source:'@a',likes,comments:0})));
 assert.equal(ranked[0].likes,10);assert.equal(ranked[0].relativeInteractions,5);assert.equal(rankResearch([{id:'x',source:'@b',likes:null,comments:null}])[0].interactions,null);
});
test('research scopes accounts, sanitizes links, collects hashtags and throttles across requests',async()=>{
 const f=fixture();await assert.rejects(f.client.research(other,{competitors:['foo']}),/Connected account/);
 const r=await f.client.research(aid,{competitors:['foo'],hashtags:['travel']});assert.equal(r.posts.length,3);assert.equal(r.posts.find(p=>p.id==='p1').views,0);assert.equal(r.posts.find(p=>p.id==='p2').permalink,'');assert.equal(r.posts.find(p=>p.id==='p2').views,null);
 await assert.rejects(f.client.research(aid,{competitors:['foo']}),/Wait until/);
 const denied=fixture();denied.deny();const result=await denied.client.research(aid,{competitors:['foo']});assert.equal(result.posts.length,0);assert.match(result.warnings[0],/Meta access rejected/);assert.match(result.warnings[0],/Messaging access is disabled/);assert.match(result.warnings[0],/\[redacted\]/);assert.ok(!result.warnings[0].includes('credential private'));
});
test('inbox collection never sends, requires exact approval/version and prevents duplicate sends',async()=>{
 const f=fixture();const r=await f.client.syncInbox(aid);assert.equal(r.comments,1);assert.equal(r.messages,1);assert.equal(f.sends(),0);assert.equal((await f.client.list(aid)).items.length,2);
 await assert.rejects(f.client.list(other),/Connected account/);
 await f.client.saveReply(aid,'comment:c1',{text:'Please tell us the dates.',version:0,approved:false});await assert.rejects(f.client.sendReply(aid,'comment:c1',1),/approve/);
 await f.client.saveReply(aid,'comment:c1',{text:'Which dates are you considering?',version:1,approved:true});await assert.rejects(f.client.sendReply(aid,'comment:c1',1),/approve/);
 const results=await Promise.allSettled([f.client.sendReply(aid,'comment:c1',2),f.client.sendReply(aid,'comment:c1',2)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.sends(),1);
 await assert.rejects(f.client.saveReply(aid,'comment:c1',{text:'Changed',version:2,approved:true}),/already sent/);
});
test('blocked hashtag approval is grouped once while successful competitor evidence is retained',async()=>{
 const f=fixture();f.denyHashtags();const r=await f.client.research(aid,{competitors:['foo'],hashtags:['travel','holiday','packing']});assert.equal(r.posts.length,2);assert.equal(r.warnings.length,1);assert.match(r.warnings[0],/Hashtag discovery needs Meta approval/);assert.match(r.warnings[0],/Competitor results are still available/);assert.ok(r.warnings[0].length<250);
});
test('changed inbound text, closed DM windows and ambiguous outcomes block unsafe resends',async()=>{
 const f=fixture();await f.client.syncInbox(aid);await f.client.saveReply(aid,'dm:m1',{text:'How can we help?',version:0,approved:true});
 const dm=f.tables.marketing_inbox.find(x=>x.kind==='dm');dm.received_at=new Date(f.now-25*3600000).toISOString();await assert.rejects(f.client.sendReply(aid,'dm:m1',1),/window is closed/);assert.equal(f.sends(),0);
 dm.received_at=new Date(f.now-1000).toISOString();dm.text='Edited';await assert.rejects(f.client.sendReply(aid,'dm:m1',1),/approve/);dm.text='Can you help?';f.uncertain();await assert.rejects(f.client.sendReply(aid,'dm:m1',1),/not confirmed/);assert.equal(f.tables.marketing_inbox_replies[0].status,'uncertain');await assert.rejects(f.client.sendReply(aid,'dm:m1',1),/approve/);assert.equal(f.sends(),1);
 assert.equal(replyAllowed({...dm,received_at:'invalid'},f.now),false);
});
test('signed webhook validates raw bytes, ignores echoes and is idempotent',async()=>{
 const f=fixture(),payload={object:'instagram',entry:[{id:'123456',time:f.now/1000,messaging:[{sender:{id:'789'},recipient:{id:'123456'},timestamp:f.now,message:{mid:'event1',text:'Question'}},{sender:{id:'123456'},recipient:{id:'789'},timestamp:f.now,message:{mid:'echo',text:'sent',is_echo:true}}]}]},raw=Buffer.from(JSON.stringify(payload)),signature='sha256='+createHmac('sha256','secret').update(raw).digest('hex');
 assert.equal(verifyMetaSignature(raw,signature,'secret'),true);assert.equal(verifyMetaSignature(Buffer.from('edited'),signature,'secret'),false);assert.equal(verifyMetaSignature(raw,'sha256=bad','secret'),false);
 await f.client.webhook(payload);await f.client.webhook(payload);assert.equal(f.tables.marketing_inbox.length,1);assert.equal(f.sends(),0);
});
test('cloud engagement endpoints enforce owner, signature, bounded payload and exact send request',async t=>{
 const ownerKey='x'.repeat(44);let sent=0,events=0;const server=createPublishingServer({connection:{ownerKey,appSecret:'secret',webhookVerifyToken:'verify',engagement:{list:async()=>({items:[],replies:[],sync:[]}),sendReply:async()=>{sent++;return {status:'sent'};},webhook:async()=>{events++;}}}});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/engagement/inbox?accountId='+aid)).status,401);assert.equal(sent,0);
 const headers={Authorization:'Bearer '+ownerKey,'Content-Type':'application/json'};assert.equal((await fetch(base+'/api/engagement/inbox?accountId='+aid,{headers})).status,200);
 assert.equal((await fetch(base+'/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
 assert.equal(await (await fetch(base+'/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=123')).text(),'123');
 assert.equal((await fetch(base+'/webhooks/instagram',{method:'POST',body:'{}'})).status,401);assert.equal(events,0);
 const raw='{}',signature='sha256='+createHmac('sha256','secret').update(raw).digest('hex');assert.equal((await fetch(base+'/webhooks/instagram',{method:'POST',headers:{'X-Hub-Signature-256':signature},body:raw})).status,200);assert.equal(events,1);
 assert.equal((await fetch(base+'/api/engagement/send',{method:'POST',headers,body:'x'.repeat(24001)})).status,413);assert.equal(sent,0);
});
