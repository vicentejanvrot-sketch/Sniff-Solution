import test from 'node:test';
import assert from 'node:assert/strict';
import {videoModels,videoPayload,accountImageModels} from '../lib/media-models.mjs';
import {generateVideo} from '../lib/production.mjs';
test('video adapters use model-specific payloads and fixed production endpoints',async()=>{
 for(const model of videoModels){
  let posted=0;const p={prompt:'Reviewed scene.',duration:10,aspect:'9:16',brandSnapshot:{name:'Test'}};
  const body=videoPayload(model.id,p);assert.equal(body.prompt,p.prompt);assert.equal(body.duration,10);
  if(model.adapter.startsWith('kling')&&model.adapter!=='kling4'){assert.equal(body.sound,'on');assert.equal(body.generate_audio,undefined);assert.equal(body.resolution,undefined);}else assert.equal(body.resolution,'720p');
  const result=await generateVideo({config:{model:model.id},plannerEntryId:'day',production:p},{env:{HF_API_KEY:'private-key'},fetcher:async(url,opts)=>{if(opts.method==='POST'){posted++;assert.equal(url,'https://api.higgsfield.ai/'+model.id);assert.deepEqual(JSON.parse(opts.body),body);assert.equal(opts.headers.Authorization,'Key private-key');return Response.json({request_id:'request'});}return Response.json({status:'completed',video:{url:'https://media.example.com/result.mp4'}});},onRequest:async()=>{},onPhase:async()=>{},downloader:async()=>Buffer.from('mock video')});assert.equal(posted,1);assert.equal(result.mime,'video/mp4');
 }
 assert.throws(()=>videoPayload('https://untrusted.test',{}),/supported/);assert.throws(()=>videoPayload(videoModels[0].id,{duration:30,aspect:'4:5'}),/duration or format/);
});
test('image model discovery filters the private account catalog without generation or exposing keys',async()=>{
 let calls=0;const models=await accountImageModels({env:{OPENAI_API_KEY:'private'},fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models');assert.equal(opts.body,undefined);assert.equal(opts.headers.Authorization,'Bearer private');return Response.json({data:[{id:'gpt-image-1'},{id:'gpt-image-1-mini'},{id:'gpt-image-1'},{id:'gpt-text'},{id:'dall-e-3'},{id:'https://untrusted.test'}]});}});
 assert.deepEqual(models,['gpt-image-1','gpt-image-1-mini']);assert.equal(calls,1);assert.ok(!JSON.stringify(models).includes('private'));
 await assert.rejects(accountImageModels({env:{}}),/Configure/);
});
