import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {encryptToken,decryptToken} from '../lib/publishing-crypto.mjs';
import {createPublishingServer} from '../cloud/publishing-server.mjs';
test('authenticated encryption round trips and uses a unique nonce',()=>{
 const key=randomBytes(32).toString('base64');
 const value=encryptToken('mock-token',key,'workspace:account');
 assert.equal(decryptToken(value,key,'workspace:account'),'mock-token');
 assert.notEqual(value,encryptToken('mock-token',key,'workspace:account'));
 assert.throws(()=>decryptToken(value,key,'other-account'));
 assert.throws(()=>decryptToken(value,randomBytes(32).toString('base64'),'workspace:account'));
 assert.throws(()=>encryptToken('mock-token','invalid','workspace:account'));
});
test('cloud server exposes health only; callback disabled and desktop inaccessible',async t=>{
 const server=createPublishingServer();server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const health=await fetch(base+'/healthz');assert.equal(health.status,200);
 assert.equal((await health.json()).publishingEnabled,false);
 assert.equal((await fetch(base+'/auth/meta/callback?code=fake')).status,503);
 assert.equal((await fetch(base+'/api/settings')).status,404);
});

import {metaLoginUrl,LoginStates} from '../lib/meta-login.mjs';
test('Unified Login follows Meta supplied parameters',()=>{
 const url=new URL(metaLoginUrl({appId:'1436334624843806',configurationId:'1828125495054410',redirectUri:'https://sniff-publishing.onrender.com/auth/meta/callback',state:'test-state'}));
 assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.pathname,'/dialog/oauth');
 assert.equal(url.searchParams.get('config_id'),'1828125495054410');
 assert.equal(url.searchParams.get('response_type'),'code');
 assert.equal(url.searchParams.get('override_default_response_type'),'true');
 assert.equal(url.searchParams.get('state'),'test-state');
});
test('authorization state is brand-bound, expiring and single-use',()=>{
 let now=1000;const states=new LoginStates({clock:()=>now,ttlMs:100});
 const context={workspaceId:'developer',brandId:'test'};
 const state=states.issue(context);
 assert.deepEqual(states.consume(state),context);assert.equal(states.consume(state),null);
 const expired=states.issue(context);now+=101;assert.equal(states.consume(expired),null);
 assert.equal(states.consume('invalid'),null);
});

test('protected authorization flow saves encrypted token and rejects replay',async t=>{
 const key=randomBytes(32).toString('base64'),ownerKey=randomBytes(32).toString('base64');
 const memory=new LoginStates(),saved=[];
 const states={issue:async c=>memory.issue({workspaceId:c.workspaceId,brandId:c.brandId,workspace_id:c.workspaceId,brand_id:c.brandId,expected_username:c.expectedUsername}),consume:async s=>memory.consume(s)};
 const connection={appId:'1436334624843806',configurationId:'1828125495054410',redirectUri:'https://sniff-publishing.onrender.com/auth/meta/callback',workspaceId:'developer',ownerKey,encryptionKey:key,states,meta:{exchange:async()=>({token:'mock-private-token'}),accounts:async()=>[{id:'123',username:'travelonepro'}]},saveAccount:async a=>saved.push(a)};
 const server=createPublishingServer({connection});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const start=(auth,expectedUsername='travelonepro')=>fetch(base+'/auth/meta/start',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify({brandId:'travel',expectedUsername})});
 assert.equal((await start()).status,401);
 const initiated=await start(ownerKey);assert.equal(initiated.status,200);
 const state=new URL((await initiated.json()).loginUrl).searchParams.get('state');
 const callback=base+'/auth/meta/callback?code=mock&state='+state;
 const response=await fetch(callback);assert.equal(response.status,200);assert.equal((await response.json()).username,'travelonepro');
 assert.equal(saved.length,1);assert.notEqual(saved[0].token_ciphertext,'mock-private-token');
 assert.equal(decryptToken(saved[0].token_ciphertext,key,'developer:travel:123'),'mock-private-token');
 assert.equal((await fetch(callback)).status,400);assert.equal(saved.length,1);
 const wrong=await start(ownerKey,'anotherbrand');
 const wrongState=new URL((await wrong.json()).loginUrl).searchParams.get('state');
 assert.equal((await fetch(base+'/auth/meta/callback?code=mock&state='+wrongState)).status,400);assert.equal(saved.length,1);
});

import {desktopPublishing} from '../lib/desktop-publishing.mjs';
import {createSocialRepository} from '../lib/social-repository.mjs';
test('desktop bridge keeps owner credential server-side and validates login origin',async()=>{
 const key='a'.repeat(44);
 const bridge=desktopPublishing({env:{PUBLISHING_OWNER_KEY:key},fetcher:async(url,options)=>{
  assert.equal(url,'https://sniff-publishing.onrender.com/auth/meta/start');
  assert.equal(options.headers.Authorization,'Bearer '+key);
  assert.deepEqual(JSON.parse(options.body),{brandId:'travel',expectedUsername:'travelonepro'});
  return Response.json({loginUrl:'https://www.facebook.com/dialog/oauth?state=mock'});
 }});
 assert.deepEqual(await bridge.connect('travel','travelonepro'),{loginUrl:'https://www.facebook.com/dialog/oauth?state=mock'});
 const invalid=desktopPublishing({env:{PUBLISHING_OWNER_KEY:key},fetcher:async()=>Response.json({loginUrl:'https://example.com/dialog/oauth'})});
 await assert.rejects(invalid.connect('travel','travelonepro'),/Invalid authorization URL/);
});
test('social repository lists only metadata and scopes disconnect to workspace and brand',async()=>{
 const calls=[];
 const repository=createSocialRepository({url:'https://example.supabase.co',key:'mock-secret',fetcher:async(url,opts)=>{calls.push({url,opts});return Response.json([{id:'123'}]);}});
 await repository.list('developer');
 assert.equal(calls[0].url.searchParams.get('workspace_id'),'eq.developer');
 assert.ok(!calls[0].url.searchParams.get('select').includes('token_ciphertext'));
 await repository.disconnect('developer','travel','12345678-1234-1234-1234-123456789012');
 assert.equal(calls[1].url.searchParams.get('brand_id'),'eq.travel');
 assert.equal(JSON.parse(calls[1].opts.body).token_ciphertext,null);
});

test('cloud worker boot uses the initialized connection and schedules 30-second polling only when enabled',async()=>{
 const {startPublishingWorker}=await import('../cloud/publishing-server.mjs');
 let calls=0;let scheduled=null;let unref=false;
 const connection={publishingEnabled:true,publisher:{pump:async()=>{calls++;return 0;}}};
 const timer=startPublishingWorker(connection,{schedule:(fn,ms)=>{scheduled={fn,ms};return {unref(){unref=true;}};}});
 assert.ok(timer);assert.equal(scheduled.ms,30000);assert.equal(unref,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);
 await scheduled.fn();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,2);
 assert.equal(startPublishingWorker({...connection,publishingEnabled:false},{schedule:()=>{throw Error('disabled worker must not schedule');}}),null);
 assert.equal(startPublishingWorker(null,{schedule:()=>{throw Error('missing connection must not schedule');}}),null);
});
