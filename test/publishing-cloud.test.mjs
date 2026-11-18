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
