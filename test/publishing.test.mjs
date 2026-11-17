import test from 'node:test';
import assert from 'node:assert/strict';
import {createSchedule,assertApprovedVersion,cancelSchedule} from '../lib/publishing.mjs';
const now=new Date('2026-11-17T12:00:00Z');
const asset={id:'asset1',brandId:'brand1',status:'approved',mime:'image/jpeg',version:2,caption:'Approved caption'};
const account={id:'account1',brandId:'brand1',status:'connected'};
const input={asset,account,scheduledAt:'2026-11-18T09:00:00-07:00',timeZone:'America/Edmonton',now};
test('approved JPEG schedule stores UTC and original time zone',()=>{
 const job=createSchedule(input);
 assert.equal(job.scheduledAt,'2026-11-18T16:00:00.000Z');
 assert.equal(job.timeZone,'America/Edmonton');
 assert.equal(job.assetVersion,2);assert.equal(job.status,'scheduled');
 assert.equal(job.caption,'Approved caption');assert.equal(job.format,'image');
});
test('refuses unapproved media and cross-brand accounts',()=>{
 assert.throws(()=>createSchedule({...input,asset:{...asset,status:'draft'}}),/Approve/);
 assert.throws(()=>createSchedule({...input,account:{...account,brandId:'other'}}),/connected/);
});
test('rejects past dates, ambiguous timestamps and unsupported media',()=>{
 assert.throws(()=>createSchedule({...input,scheduledAt:'2026-11-16T12:00:00Z'}),/future/);
 assert.throws(()=>createSchedule({...input,scheduledAt:'2026-11-18T09:00:00'}),/offset/);
 assert.throws(()=>createSchedule({...input,asset:{...asset,mime:'image/png'}}),/JPEG/);
});
test('rejects excessive captions and invalid time zones',()=>{
 assert.throws(()=>createSchedule({...input,caption:'a'.repeat(2201)}),/2,200/);
 assert.throws(()=>createSchedule({...input,timeZone:'Invalid/Zone'}),/time zone/);
});
test('approved MP4 is a reel',()=>{
 assert.equal(createSchedule({...input,asset:{...asset,mime:'video/mp4'}}).format,'reel');
});
test('changed approvals prevent publication',()=>{
 const job=createSchedule(input);
 assert.doesNotThrow(()=>assertApprovedVersion(job,asset));
 assert.throws(()=>assertApprovedVersion(job,{...asset,version:3}),/approval changed/);
 assert.throws(()=>assertApprovedVersion(job,{...asset,status:'draft'}),/approval changed/);
});
test('cancellation does not permit interrupting publication',()=>{
 const job=createSchedule(input);
 assert.equal(cancelSchedule(job,now).status,'cancelled');
 assert.throws(()=>cancelSchedule({...job,status:'publishing'},now),/cancelled/);
});
