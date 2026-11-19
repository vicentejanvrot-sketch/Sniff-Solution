import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibleProduction,compatibleOutput} from '../public/planner-media.js';
const fields={prompt:'Reviewed scene',caption:'Reviewed caption',onScreenText:'Brand line'};
const plan={id:'plan',brandId:'brand'};
const entry=()=>({id:'day',version:5,format:'reel',duration:10,aspect:'9:16',...fields,localTime:'2026-12-01T14:00',history:[{version:3,...fields,localTime:'2026-11-30T12:00'}]});
const job=()=>({id:'job',type:'production',brandId:'brand',plannerPlanId:'plan',plannerEntryId:'day',plannerEntryVersion:3,production:{kind:'video',duration:10,aspect:'9:16',prompt:fields.prompt,caption:fields.caption,overlay:fields.onScreenText}});
const media={id:'media',jobId:'job',brandId:'brand',role:'rendered',mime:'video/mp4',status:'approved'};
test('posting time and planning-note edits preserve compatible approved media from earlier versions',()=>{
 const e=entry(),j=job();assert.equal(compatibleOutput(media,j,plan,e),true);
 e.localTime='2026-12-02T16:30';e.title='New working title';e.purpose='Updated internal notes';assert.equal(compatibleOutput(media,j,plan,e),true);
 j.production.kind='render';j.production.sourceSnapshot={mime:'video/mp4'};assert.equal(compatibleOutput(media,j,plan,e),true);
 e.history=[];assert.equal(compatibleOutput(media,j,plan,e),true,'Immutable production snapshot remains usable after edit history expires');
});
test('changed creative content, formats, ownership and unrendered originals are not silently reused',()=>{
 for(const changes of [{prompt:'New scene'},{caption:'Different caption'},{onScreenText:'New overlay'},{aspect:'1:1'},{duration:5},{format:'image'}])assert.equal(compatibleOutput(media,job(),plan,{...entry(),...changes}),false);
 for(const changes of [{brandId:'other'},{plannerPlanId:'other'},{plannerEntryId:'other'}])assert.equal(compatibleOutput(media,{...job(),...changes},plan,entry()),false);
 assert.equal(compatibleOutput({...media,role:'generated'},job(),plan,entry()),false);
 assert.equal(compatibleOutput({...media,brandId:'other'},job(),plan,entry()),false);
 const missing=job();delete missing.production;assert.equal(compatibleProduction(missing,plan,entry()),false);
});
