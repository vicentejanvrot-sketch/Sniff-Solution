import {fail,str} from './core.mjs';
// Model-specific production API references checked 2026-11-18. Only text-to-video
// adapters compatible with the app's reviewed 5/10 second briefs are exposed.
export const videoModels=[
 {id:'bytedance/seedance-2.0/text-to-video',name:'Seedance 2.0',resolution:'720p',audio:'Requested',adapter:'seedance'},
 {id:'bytedance/seedance-2.5/text-to-video',name:'Seedance 2.5',resolution:'720p',audio:'Requested',adapter:'seedance'},
 {id:'kling-video/v4.0/text-to-video',name:'Kling 4.0',resolution:'720p',audio:'Provider default',adapter:'kling4'},
 {id:'kling-video/v3.0/std/text-to-video',name:'Kling 3.0 Standard',resolution:'Provider default',audio:'Requested',adapter:'kling3'},
 {id:'kling-video/v3.0/pro/text-to-video',name:'Kling 3.0 Pro',resolution:'Provider default',audio:'Requested',adapter:'kling3'},
 {id:'kling-video/v2.6/pro/text-to-video',name:'Kling 2.6 Pro',resolution:'Provider default',audio:'Requested',adapter:'kling26'}
].map(m=>({...m,durations:[5,10],aspects:['1:1','9:16','16:9'],reference:'https://open.higgsfield.ai/models/'+m.id+'/api-reference'}));
export function videoModel(value){const model=videoModels.find(m=>m.id===value);if(!model)fail('Choose a supported Higgsfield video model.');return model;}
export function imageModel(value){const model=str(value||'',100);if(!model||! /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(model))fail('Choose an image model or configure one in Settings.',409);return model;}
// Public API models, not consumer-site subscription tiers. Choices match the documented endpoint schemas.
const imageRatios=['auto','1:1','3:2','2:3','16:9','9:16','4:3','3:4','21:9'];
export const higgsfieldImageModels=[
 {id:'marketing-studio/image/flare',name:'Marketing Studio · GPT Image 2.5 Flare',description:'Everyday campaign visuals and reference edits',resolutions:['1k','2k','4k'],defaultResolution:'2k',qualities:['low','medium','high','xhigh','max'],defaultQuality:'high',adapter:'marketing'},
 {id:'marketing-studio/image/sunburst',name:'Marketing Studio · GPT Image 2.5 Sunburst',description:'Detailed campaign imagery and precise edits',resolutions:['1k','2k','4k'],defaultResolution:'2k',qualities:['low','medium','high','xhigh','max'],defaultQuality:'high',adapter:'marketing'},
 {id:'higgsfield-ai/soul/v2/standard',name:'Higgsfield Soul 2',description:'Portraits, fashion and lifestyle visuals',resolutions:['720p','1080p'],defaultResolution:'1080p',aspects:imageRatios.filter(a=>a!=='auto'&&a!=='21:9'),counts:[1,4],adapter:'soul',edit:'higgsfield-ai/soul/v2/image-to-image'},
 {id:'kling-image/v4.0/text-to-image',name:'Kling Image 4.0',description:'Detailed scenes, product visuals and text-rich designs; up to 8K',resolutions:['2k','4k','8k'],defaultResolution:'2k',counts:[1,2,3,4],adapter:'kling',edit:'kling-image/v4.0/edit'},
 {id:'bytedance/seedream/v5.0/pro/text-to-image',name:'Seedream 5.0 Pro',description:'Product imagery, posters and illustrations',resolutions:['1k','1.5k','2k'],defaultResolution:'2k',adapter:'seedream',edit:'bytedance/seedream/v5.0/pro/edit'},
 {id:'xai/grok-imagine-image-2.0',name:'Grok Imagine 2.0',description:'Image generation and reference edits',resolutions:['1k','2k'],defaultResolution:'1k',qualities:['low','medium'],defaultQuality:'medium',aspects:[...imageRatios.filter(a=>a!=='21:9'),'1:2','2:1'],adapter:'grok'}
].map(m=>({aspects:imageRatios,counts:[1],qualities:[],...m,reference:'https://open.higgsfield.ai/models/'+m.id+'/api-reference'}));
export function higgsfieldImageModel(id){const model=higgsfieldImageModels.find(m=>m.id===id);if(!model)fail('Choose a supported Higgsfield image model.');return model;}
export function imageGenerationOptions(b,production,defaultModel){
 const provider=b.imageProvider||'openai';if(!['openai','higgsfield'].includes(provider))fail('Choose an image generation provider.');
 if(provider==='openai'){
  const model=imageModel(b.imageModel||defaultModel),quality=b.imageQuality||'auto';if(!['auto','low','medium','high'].includes(quality))fail('Choose a supported OpenAI image quality.');
  return {provider,model,imageQuality:quality};
 }
 const model=higgsfieldImageModel(b.imageModel),imageResolution=b.imageResolution||model.defaultResolution,imageAspect=b.imageAspect||(model.aspects.includes(production.aspect)?production.aspect:model.aspects[0]),imageQuality=b.imageQuality||model.defaultQuality||'';
 if(!model.resolutions.includes(imageResolution)||!model.aspects.includes(imageAspect)||(model.qualities.length?!model.qualities.includes(imageQuality):!!imageQuality)||!model.counts.includes(production.count))fail('Choose the selected model’s supported resolution, aspect ratio, quality and image count.');
 if(production.transparent)fail('Transparent background is only supported by the OpenAI image adapter.');
 if(production.sourceSnapshot&&(!['image/png','image/jpeg'].includes(production.sourceSnapshot.mime)||production.sourceSnapshot.size>30*1024*1024))fail('Higgsfield reference images must be PNG or JPEG, up to 30 MiB.');
 return {provider,model:model.id,imageResolution,imageAspect,imageQuality};
}
export function higgsfieldImagePayload(modelId,p,prompt,referenceUrl){
 const m=higgsfieldImageModel(modelId);let endpoint=referenceUrl&&m.edit?m.edit:m.id;
 const payload={prompt,resolution:p.imageResolution,aspect_ratio:p.imageAspect};
 if(m.qualities.length)payload.quality=p.imageQuality;
 if(m.adapter==='marketing')payload.enhance_prompt=false;
 if(m.adapter==='soul'){payload.batch_size=p.count;if(referenceUrl)payload.image_url=referenceUrl;}
 else if(referenceUrl)payload.image_urls=[referenceUrl];
 if(m.adapter==='kling'&&p.count>1){endpoint+='/series';payload.series_amount=p.count;}
 return {endpoint,payload};
}
export function videoPayload(modelId,p){
 const model=videoModel(modelId);if(!model.durations.includes(p.duration)||!model.aspects.includes(p.aspect))fail('This video model does not support the selected duration or format.');
 const base={prompt:p.prompt,duration:p.duration,aspect_ratio:p.aspect};
 if(model.adapter==='seedance')return {...base,resolution:'720p',generate_audio:true,...(model.id.includes('2.5')?{output_format:'mp4',draft:false}:{})};
 if(model.adapter==='kling4')return {...base,resolution:'720p'};
 return {...base,sound:'on',cfg_scale:0.5,...(model.adapter==='kling3'?{multi_shots:false}:{})};
}
export async function accountImageModels({env,fetcher=fetch}){
 if(!env.OPENAI_API_KEY)fail('Configure the OpenAI API key locally and restart to load account models.',409);
 let response;try{response=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{fail('Could not load OpenAI models. Your configured model is still available.',503);}
 if(!response.ok)fail('OpenAI model discovery failed ('+response.status+'). Check API access; no generation was started.',409);
 const result=await response.json();if(!Array.isArray(result.data))fail('OpenAI returned an invalid model catalog.',503);
 return [...new Set(result.data.map(m=>m.id).filter(m=>typeof m==='string'&&/^gpt-image-[a-zA-Z0-9._-]+$/.test(m)&&m.length<=100))].sort().slice(0,500);
}
