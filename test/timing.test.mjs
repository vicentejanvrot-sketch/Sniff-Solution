import test from 'node:test';
import assert from 'node:assert/strict';
import {elapsedLabel} from '../public/timing.js';
test('elapsed time stays fixed for finished jobs and handles live, old and recovered records',()=>{
 const createdAt='2026-11-17T20:00:00Z',finishedAt='2026-11-17T20:02:05Z',current=Date.parse('2026-11-17T21:03:07Z');
 assert.equal(elapsedLabel({createdAt,finishedAt,status:'completed'},current),'Total elapsed: 2m 5s');
 assert.equal(elapsedLabel({createdAt,finishedAt,status:'failed'},current+3600000),'Total elapsed: 2m 5s');
 assert.equal(elapsedLabel({createdAt,finishedAt,status:'running'},current),'Elapsed: 1h 3m 7s');
 assert.equal(elapsedLabel({createdAt,status:'queued'},Date.parse(createdAt)+14000),'Elapsed: 14s');
 for(const job of [{createdAt,status:'completed'},{createdAt:'invalid',finishedAt,status:'failed'},{createdAt:finishedAt,finishedAt:createdAt,status:'completed'}])assert.equal(elapsedLabel(job,current),'Elapsed time unavailable');
});
