import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,skills,validateBrand,validateSettings,quality,promptFor,ledger,now} from '../lib/core.mjs';
import {generate,perplexityTarget} from '../lib/providers.mjs';

test('all thirteen distinct workflows preserve brand and factual constraints',()=>{
 assert.equal(skills.length,13);assert.equal(new Set(skills.map(s=>s.id)).size,13);
 const p=promptFor(skills[0],{name:'Travel One',forbiddenClaims:'guaranteed savings'},'Explain travel planning.');
 assert.match(p.system,/Do not invent/);assert.match(p.user,/guaranteed savings/);assert.match(p.user,/timed|time codes/);
});
test('brand validates URLs, palette and required name',()=>{
 assert.throws(()=>validateBrand({name:''}));
 assert.throws(()=>validateBrand({name:'Test',website:'javascript:alert(1)'}));
 assert.throws(()=>validateBrand({name:'Test',palette:'red'}));
 assert.equal(validateBrand({name:'Test',website:'https://example.com',palette:'#123456, #abcdef'}).font,'Arial');
});
test('settings reject non-finite and negative budgets or prices',()=>{
 assert.throws(()=>validateSettings({monthlyBudget:Infinity,reservePerJob:1}));
 assert.throws(()=>validateSettings({monthlyBudget:1,reservePerJob:2}));
 assert.throws(()=>validateSettings({monthlyBudget:10,reservePerJob:1,providers:{openai:{inputRate:-1}}}));
 assert.equal(validateSettings({monthlyBudget:10,reservePerJob:1}).providers.openai.inputRate,null);
});
test('editorial checks flag forbidden claims without claiming authorship',()=>{
 const result=quality('Guaranteed returns. #one #two #three #four #five #six',{forbiddenClaims:'guaranteed returns'});
 assert.equal(result.hashtags,6);assert.ok(result.warnings.some(w=>w.includes('prohibited')));
 assert.match(result.label,/not a performance prediction/);
});
test('budget keeps uncertain spend reserved and accepts explicit reconciliation',()=>{
 const s=defaults();s.jobs=[
  {createdAt:now(),status:'completed',reservation:1,costEstimate:null},
  {createdAt:now(),status:'interrupted',reservation:2,costEstimate:null},
  {createdAt:now(),status:'completed',reservation:1,costEstimate:0.1}
 ];
 assert.equal(ledger(s).committed,3.1);s.jobs[0].reconciledCost=0.5;
 assert.equal(ledger(s).committed,2.6);
});
test('provider adapters handle responses, usage and citations with no key exposure',async t=>{
 for(const provider of ['openai','anthropic','perplexity']){
  await t.test(provider,async()=>{
   let request;
   const data=provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:'Draft'}]}],usage:{input_tokens:100,output_tokens:20}}:
    provider==='anthropic'?{content:[{type:'text',text:'Draft'}],stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:20}}:
    {status:'completed',output:[{type:'search_results',results:[{id:1,url:'https://example.com'},{id:2,url:'javascript:bad'}]},{type:'message',role:'assistant',content:[{type:'output_text',text:'Draft',annotations:[]}]}],usage:{input_tokens:100,output_tokens:20,cost:{currency:'USD',total_cost:9}}};
   const result=await generate(provider,{model:'test-model',inputRate:1,outputRate:2},{system:'rules',user:'brief'},{
    env:{[provider.toUpperCase()+'_API_KEY']:'test-secret'},fetcher:async(url,options)=>{request={url,options};return Response.json(data);}
   });
   assert.equal(result.text,'Draft');assert.equal(result.costEstimate,0.00014);assert.equal(result.incomplete,false);
   assert.ok(!JSON.stringify(result).includes('test-secret'));assert.ok(request.url.startsWith('https://'));
   if(provider==='perplexity'){
    assert.deepEqual(result.sources,['https://example.com']);
    assert.equal(request.url,'https://api.perplexity.ai/v1/agent');
    const sent=JSON.parse(request.options.body);
    assert.deepEqual({model:sent.model,instructions:sent.instructions,input:sent.input,max_output_tokens:sent.max_output_tokens},{model:'test-model',instructions:'rules',input:'brief',max_output_tokens:2500});
    assert.equal(request.options.headers.Authorization,'Bearer test-secret');
   }
  });
 }
});
test('truncated provider response is explicitly incomplete and unpriced stays null',async()=>{
 const r=await generate('openai',{model:'test',inputRate:null,outputRate:null},{system:'s',user:'u'},{
  env:{OPENAI_API_KEY:'test'},fetcher:async()=>Response.json({status:'incomplete',output:[{content:[{type:'output_text',text:'Partial'}]}],usage:{input_tokens:5,output_tokens:10}})
 });
 assert.equal(r.incomplete,true);assert.equal(r.costEstimate,null);
});
test('provider errors are not retried and never echo remote response bodies',async()=>{
 let calls=0;
 await assert.rejects(generate('openai',{model:'test'},{system:'s',user:'u'},{env:{OPENAI_API_KEY:'secret'},fetcher:async()=>{calls++;return new Response('secret response',{status:429});}}),/HTTP 429/);
 assert.equal(calls,1);
});
test('Perplexity settings map former Sonar models and effort presets to the Agent API',()=>{
 assert.deepEqual(perplexityTarget('sonar'),{effort:'fast'});
 assert.deepEqual(perplexityTarget('sonar-pro'),{effort:'fast'});
 assert.deepEqual(perplexityTarget('sonar-reasoning-pro'),{effort:'low'});
 assert.deepEqual(perplexityTarget('sonar-deep-research'),{effort:'high'});
 assert.deepEqual(perplexityTarget('Medium'),{effort:'medium'});
 assert.deepEqual(perplexityTarget('fast@latest'),{effort:'fast@latest'});
 assert.deepEqual(perplexityTarget('openai/some-model'),{model:'openai/some-model'});
});
test('Perplexity Agent API incomplete status is reported as incomplete',async()=>{
 const r=await generate('perplexity',{model:'sonar',inputRate:null,outputRate:null},{system:'s',user:'u'},{
  env:{PERPLEXITY_API_KEY:'k'},fetcher:async(url,options)=>{assert.equal(JSON.parse(options.body).effort,'fast');assert.equal(JSON.parse(options.body).model,undefined);return Response.json({status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'Part'}]}],usage:{input_tokens:5,output_tokens:10}});}
 });
 assert.equal(r.incomplete,true);assert.equal(r.text,'Part');assert.equal(r.costEstimate,null);
});
test('Perplexity explicitly enables web search for direct models and effort presets',async()=>{
 for(const model of ['openai/example-model','fast','sonar-pro']){
  await generate('perplexity',{model},{system:'rules',user:'research'},{env:{PERPLEXITY_API_KEY:'mock'},fetcher:async(url,options)=>{
   assert.deepEqual(JSON.parse(options.body).tools,[{type:'web_search'}]);
   return Response.json({status:'completed',output:[]});
  }});
 }
 assert.deepEqual(skills.filter(s=>s.requiresWeb).map(s=>s.id),['ig-viral']);
 assert.match(promptFor(skills.find(s=>s.requiresWeb),{},'Travel').user,/never invent sources/);
});
