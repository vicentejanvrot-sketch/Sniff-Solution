import {fail} from './core.mjs';
export function providerStatus(env){return Object.fromEntries(['openai','anthropic','perplexity'].map(p=>[p,Boolean(env[p.toUpperCase()+'_API_KEY'])]));}
export async function generate(provider,config,prompt,{env=process.env,fetcher=fetch}={}){
 const key=env[provider.toUpperCase()+'_API_KEY'];if(!key)fail('Configure the '+provider+' API key in the server .env file.',409);
 if(!config.model)fail('Choose an available model in Settings first.',409);
 let url,body,headers={'Content-Type':'application/json',Authorization:'Bearer '+key};
 if(provider==='anthropic'){
  url='https://api.anthropic.com/v1/messages';
  headers={'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'};
  body={model:config.model,max_tokens:2500,system:prompt.system,messages:[{role:'user',content:prompt.user}]};
 }else if(provider==='perplexity'){
  url='https://api.perplexity.ai/v1/sonar';
  body={model:config.model,max_tokens:2500,messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}]};
 }else{
  url='https://api.openai.com/v1/responses';
  body={model:config.model,instructions:prompt.system,input:prompt.user,max_output_tokens:2500,store:false};
 }
 const res=await fetcher(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});
 if(!res.ok)throw new Error(provider+' returned HTTP '+res.status+'. Check the API account, selected model and limits. No automatic retry was made.');
 const data=await res.json();
 // Preserve billing information even when a provider truncates or returns no text.
 const usage=data.usage||{};
 const tokens={input:Number(usage.input_tokens??usage.prompt_tokens??0),output:Number(usage.output_tokens??usage.completion_tokens??0)};
 let text=provider==='anthropic'?(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'):provider==='perplexity'?data.choices?.[0]?.message?.content:(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n');
 const incomplete=provider==='anthropic'?data.stop_reason==='max_tokens':provider==='perplexity'?data.choices?.[0]?.finish_reason==='length':data.status==='incomplete';
 const hasUsage=Boolean(data.usage);
 const costEstimate=hasUsage&&config.inputRate!=null&&config.outputRate!=null?(tokens.input*config.inputRate+tokens.output*config.outputRate)/1000000:null;
 const sources=(data.citations||[]).filter(s=>typeof s==='string'&&/^https?:\/\//.test(s));
 return {text:typeof text==='string'?text:'',tokens,costEstimate,sources,incomplete};
}
