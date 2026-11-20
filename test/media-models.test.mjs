import test from 'node:test';
import assert from 'node:assert/strict';
import {videoModels,videoPayload,accountImageModels,higgsfieldImageModels,imageGenerationOptions,higgsfieldImagePayload} from '../lib/media-models.mjs';
import {generateVideo,generateHiggsfieldImages} from '../lib/production.mjs';
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
test('Higgsfield image choices are validated and use documented generation and edit payloads',async()=>{
 const png=Buffer.from('89504e470d0a1a0a','hex');
 for(const m of higgsfieldImageModels){
  const selection=imageGenerationOptions({imageProvider:'higgsfield',imageModel:m.id},{aspect:'1:1',count:1},'');
  const p={...selection,count:1,prompt:'A scene',brandSnapshot:{name:'Test'},sourceSnapshot:{mime:'image/png'}};
  const {endpoint,payload}=higgsfieldImagePayload(m.id,p,'A scene','https://media.example.com/ref.png');
  assert.equal(endpoint,m.edit||m.id);assert.equal(payload.resolution,m.defaultResolution);assert.equal(payload.aspect_ratio,'1:1');assert.equal(payload.quality,m.defaultQuality);
  if(m.adapter==='soul')assert.equal(payload.image_url,'https://media.example.com/ref.png');else assert.deepEqual(payload.image_urls,['https://media.example.com/ref.png']);
  let submitted=0,requests=0,uploaded=0;
  const generated=await generateHiggsfieldImages({config:{model:m.id},production:p},{env:{HF_API_KEY:'test'},readMedia:async()=>png,fetcher:async(url,opts)=>{assert.equal(opts.headers.Authorization,'Key test');if(url.endsWith('/generate-upload-url'))return Response.json({upload_url:'https://storage.example.com/ref',public_url:'https://media.example.com/ref.png'});if(opts.method==='POST'){submitted++;assert.equal(url,'https://api.higgsfield.ai/'+endpoint);assert.equal(JSON.parse(opts.body).resolution,m.defaultResolution);return Response.json({request_id:'req'});}return Response.json({status:'completed',images:[{url:'https://media.example.com/result.png'}]});},uploader:async(_signed,bytes,mime)=>{uploaded++;assert.deepEqual(bytes,png);assert.equal(mime,'image/png');return 'https://media.example.com/ref.png';},onRequest:async id=>{assert.equal(id,'req');requests++;},onPhase:async()=>{},downloader:async()=>png});
  assert.equal(generated.images[0].mime,'image/png');assert.equal(submitted,1);assert.equal(requests,1);assert.equal(uploaded,1);
  assert.throws(()=>imageGenerationOptions({imageProvider:'higgsfield',imageModel:m.id,imageResolution:'unsupported'},{aspect:'1:1',count:1}),/supported resolution/);
 }
 const kling=higgsfieldImageModels.find(m=>m.adapter==='kling');assert.equal(higgsfieldImagePayload(kling.id,{count:4,imageResolution:'4k',imageAspect:'16:9'},'scene').payload.series_amount,4);
 assert.throws(()=>imageGenerationOptions({imageProvider:'higgsfield',imageModel:'invented'},{count:1}),/supported Higgsfield/);
});
