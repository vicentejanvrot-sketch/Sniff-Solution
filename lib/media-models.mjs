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
