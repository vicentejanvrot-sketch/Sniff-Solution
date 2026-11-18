import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePublication,verifiedInstagramPermalink} from '../lib/publishing-history.mjs';
const id='318e2be3-d4be-4ac1-a605-353cd908110d';
const cloud={id,status:'published',instagram_media_id:'18132835684824143',published_at:'2026-11-18T14:45:33.871Z',container_id:'18109601693038860',last_error:null,permalink:'https://www.instagram.com/p/ABC123_/'};
const local=()=>({id,status:'scheduled',cloudStatus:'scheduled',activationState:'active',version:1,brandId:'travel',mediaId:'photo',scheduledAt:'2026-11-18T14:45:00.000Z'});
test('published cloud record reconciles into durable local history without changing content',()=>{
 const entry=local();const result=reconcilePublication(entry,cloud);
 assert.deepEqual(result.statusTransition,{from:'scheduled',to:'published'});
 assert.equal(entry.status,'published');
 assert.equal(entry.instagramMediaId,cloud.instagram_media_id);
 assert.equal(entry.containerId,cloud.container_id);
 assert.equal(entry.publishedAt,'2026-11-18T14:45:33.871Z');
 assert.equal(entry.permalink,cloud.permalink);
 assert.equal(entry.version,1);
 assert.equal(entry.brandId,'travel');
 assert.equal(entry.lastError,null);
 assert.equal(reconcilePublication(entry,cloud).changed,false);
});
test('older cloud statuses do not overwrite confirmed publishing proof',()=>{
 const entry=local();reconcilePublication(entry,cloud);
 const stale={...cloud,status:'scheduled',instagram_media_id:null,published_at:null,permalink:null};
 assert.equal(reconcilePublication(entry,stale).changed,false);
 assert.equal(entry.status,'published');
 assert.equal(entry.instagramMediaId,cloud.instagram_media_id);
});
test('only activated local schedules may be reconciled; unknown status is ignored',()=>{
 const unactivated={...local(),activationState:null};
 assert.equal(reconcilePublication(unactivated,cloud).changed,false);
 assert.equal(unactivated.status,'scheduled');
 const entry=local();assert.equal(reconcilePublication(entry,{...cloud,status:'hacked'}).changed,false);
});
test('published requires confirmed media id and timestamp',()=>{
 const entry=local();
 reconcilePublication(entry,{...cloud,instagram_media_id:null,published_at:null});
 assert.equal(entry.status,'needs_reconciliation');
 assert.equal(entry.instagramMediaId,null);
 assert.match(entry.lastError,/without a confirmed/);
});
test('publication error, cancellation and progress are preserved',()=>{
 for(const status of ['publishing','failed','cancelled','needs_reconciliation']){
  const entry=local();const updated=reconcilePublication(entry,{...cloud,status,instagram_media_id:null,published_at:null,permalink:null,last_error:'graph unavailable'});
  assert.equal(updated.changed,true);
  assert.equal(entry.cloudStatus,status);
  if(status==='publishing')assert.equal(entry.status,'scheduled');
  else assert.equal(entry.status,status);
  assert.equal(entry.lastError,'graph unavailable');
 }
});
test('only genuine Instagram post links are accepted',()=>{
 assert.equal(verifiedInstagramPermalink(cloud.permalink),cloud.permalink);
 for(const invalid of ['https://evil.com/p/ABC','http://instagram.com/p/ABC','https://instagram.com.evil.com/p/ABC','https://www.instagram.com/redirect?next=https://evil.com','https://www.instagram.com/p/ABC?next=evil','javascript:alert(1)','https://instagram.com/p/'])assert.equal(verifiedInstagramPermalink(invalid),null);
});
