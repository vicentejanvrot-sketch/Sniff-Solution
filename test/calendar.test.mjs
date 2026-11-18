import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationInstant,validateSchedule,cancelSchedule,ensureNotScheduled} from '../lib/calendar.mjs';
const uuid='00000000-0000-4000-8000-000000000001';
const clock=Date.parse('2026-11-18T12:00:00Z');
function fixtures(){
 const s={brands:[{id:'travel',name:'Travel One'},{id:'other',name:'Other'}],drafts:[{id:'draft-1',brandId:'travel',status:'approved',text:'Visit #travel',version:2}],media:[{id:'media-1',brandId:'travel',mime:'image/jpeg',status:'approved',version:3},{id:'video-1',brandId:'travel',mime:'video/mp4',status:'approved',version:1}],schedules:[]};
 const accounts=[{id:uuid,brand_id:'travel',username:'travelonepro',instagram_user_id:'17841431165786164',status:'connected'}];
 const input={brandId:'travel',mediaId:'media-1',draftId:'draft-1',accountId:uuid,caption:'Explore together #travel',localTime:'2026-11-20T10:30',timezone:'America/Edmonton'};
 return {s,accounts,input};
}
test('local publication time converts to UTC with correct Edmonton offsets',()=>{
 assert.equal(publicationInstant('2026-11-20T10:30','America/Edmonton'),'2026-11-20T17:30:00.000Z');
 assert.equal(publicationInstant('2026-07-20T10:30','America/Edmonton'),'2026-07-20T16:30:00.000Z');
 assert.equal(publicationInstant('2026-11-20T10:30','UTC'),'2026-11-20T10:30:00.000Z');
});
test('invalid dates and DST transitions are rejected, not silently shifted',()=>{
 assert.throws(()=>publicationInstant('2026-02-30T10:30','UTC'),/Invalid calendar date/);
 assert.throws(()=>publicationInstant('2026-03-08T02:30','America/Edmonton'),/does not exist/);
 assert.throws(()=>publicationInstant('2026-11-01T01:30','America/Edmonton'),/Ambiguous local time/);
 assert.throws(()=>publicationInstant('2026-11-20T12:00','NotAZone'),/valid IANA/);
});
test('scheduling verifies approved content, brand and connected account',()=>{
 const {s,accounts,input}=fixtures();
 const created=validateSchedule(s,input,{accounts,clock});
 assert.equal(created.status,'scheduled');assert.equal(created.mediaVersion,3);assert.equal(created.draftVersion,2);
 assert.equal(created.username,'travelonepro');assert.equal(created.scheduledAt,'2026-11-20T17:30:00.000Z');
 for(const item of [{mediaId:'wrong'},{brandId:'other'},{accountId:'missing'},{caption:''},{draftId:'missing'}]){
  assert.throws(()=>validateSchedule(s,{...input,...item},{accounts,clock}));
 }
 assert.throws(()=>validateSchedule(s,input,{accounts:[],clock}),/connected Instagram/);
 s.media[0].status='needs-review';assert.throws(()=>validateSchedule(s,input,{accounts,clock}),/approved JPEG/);
 s.media[0].status='approved';s.drafts[0].status='needs-review';assert.throws(()=>validateSchedule(s,input,{accounts,clock}),/approved draft/);
 s.drafts[0].status='approved';
 assert.throws(()=>validateSchedule(s,{...input,localTime:'2026-11-18T06:00'},{accounts,clock}),/at least one minute/);
});
test('scheduled content protected until cancelled and record version prevents stale updates',()=>{
 const {s,accounts,input}=fixtures();const created=validateSchedule(s,input,{accounts,clock});s.schedules.push(created);
 assert.throws(()=>ensureNotScheduled(s,{mediaId:'media-1'}),/scheduled/);
 assert.throws(()=>ensureNotScheduled(s,{draftId:'draft-1'}),/scheduled/);
 assert.throws(()=>cancelSchedule(s,created.id,100),/changed/);
 const cancelled=cancelSchedule(s,created.id,created.version);assert.equal(cancelled.status,'cancelled');
 assert.throws(()=>cancelSchedule(s,created.id,cancelled.version),/Only scheduled/);
 assert.doesNotThrow(()=>ensureNotScheduled(s,{mediaId:'media-1'}));
 assert.throws(()=>validateSchedule(s,input,{accounts,existing:cancelled,clock}),/Only scheduled/);
});
