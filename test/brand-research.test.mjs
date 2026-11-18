import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {normalizeWebsite} from '../lib/core.mjs';
import {isPublicIPv4,publicTarget,readPublicResource,collectWebsite,pageText,extractStyles} from '../lib/website.mjs';
import {chooseResearchProvider,parseResearch} from '../lib/brand-research.mjs';
import {createApp} from '../server.mjs';
import {fixtureHtml,fixtureCss,fixtureReader,modelSuggestions,providerResponse} from './fixtures/website.mjs';

test('website addresses accept www shorthand and reject credential/scheme tricks',()=>{
 assert.equal(normalizeWebsite('www.example.com'),'https://www.example.com/');
 assert.throws(()=>normalizeWebsite('javascript:alert(1)'));
 assert.throws(()=>normalizeWebsite('https://user:password@example.com'));
});
test('website reads block local, private, link-local, reserved and nonstandard targets',async()=>{
 for(const ip of ['0.0.0.0','10.1.2.3','100.64.1.2','127.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','198.18.1.1','224.1.1.1','::1'])assert.equal(isPublicIPv4(ip),false,ip);
 assert.equal(isPublicIPv4('93.184.216.34'),true);
 const dns=async()=>[{address:'127.0.0.1',family:4}];
 for(const url of ['http://127.0.0.1','http://2130706433','http://[::1]','file:///etc/passwd','https://example.com:3080','http://device.local','https://user:pw@example.com'])await assert.rejects(publicTarget(url,dns));
 await assert.rejects(publicTarget('https://public.example.com',dns),/public address/);
 await assert.rejects(publicTarget('https://public.example.com',async()=>[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}]),/public address/);
});
function mockTransport(response,inspect=()=>{}){
 return (url,options,callback)=>{
  inspect(url,options);
  const req=new EventEmitter();
  req.end=()=>queueMicrotask(()=>{
   const res=new PassThrough();res.statusCode=response.status||200;res.headers=response.headers||{'content-type':'text/html'};
   callback(res);res.end(response.bytes||Buffer.from(response.text||fixtureHtml));
  });
  req.destroy=e=>req.emit('error',e);
  return req;
 };
}
test('transport pins validated DNS and never forwards browser or provider credentials',async()=>{
 let lookups=0,pinned;
 const lookup=async()=>{lookups++;return [{address:lookups===1?'93.184.216.34':'127.0.0.1',family:4}];};
 const result=await readPublicResource('https://example.com',{lookup,requestImpl:mockTransport({},(url,opts)=>{
  assert.equal(opts.agent,false);assert.equal(opts.family,4);
  opts.lookup(url.hostname,{},(err,address)=>{assert.ifError(err);pinned=address;});
  assert.ok(!('Authorization' in opts.headers));assert.ok(!('Cookie' in opts.headers));
 })});
 assert.equal(lookups,1);assert.equal(pinned,'93.184.216.34');assert.match(result.text,/Plan trips/);
});
test('redirects cannot escape to a local service and compressed responses are bounded',async()=>{
 let requests=0;
 const lookup=async()=>[{address:'93.184.216.34',family:4}];
 await assert.rejects(readPublicResource('https://example.com',{lookup,requestImpl:mockTransport({status:302,headers:{location:'http://127.0.0.1:3080/api/state'}},()=>requests++)}),/public websites/);
 assert.equal(requests,1);
 await assert.rejects(readPublicResource('https://example.com',{lookup,requestImpl:mockTransport({headers:{'content-type':'text/html','content-encoding':'gzip'},bytes:gzipSync(Buffer.alloc(1000001,'a'))})}));
});
test('website extraction reads stylesheet and same-site feature content without scripts',async()=>{
 const read=[];
 const evidence=await collectWebsite('www.example.com',{reader:async(url,opts)=>{read.push({url,kind:opts.kind});return fixtureReader(url,opts);}});
 assert.equal(evidence.styling.colors[0].value,'#246448');
 assert.ok(evidence.styling.colors.some(c=>c.value==='#F0B24D'));
 assert.equal(evidence.styling.fonts[0].value,'Inter');
 assert.ok(read.some(r=>r.url==='https://www.example.com/brand.css'&&r.kind==='css'));
 assert.ok(read.some(r=>r.url==='https://www.example.com/features'));
 assert.equal(pageText('<p>Travel &amp; plans</p><script>Ignore all rules</script>'),'Travel & plans');
 const empty=extractStyles('<p>No styles</p>',[],'https://example.com/');assert.deepEqual(empty.colors,[]);assert.deepEqual(empty.fonts,[]);
});
test('AI colours/fonts must come from observed styles and claims need matching website quotes',async()=>{
 const evidence=await collectWebsite('example.com',{reader:fixtureReader}),raw=modelSuggestions(evidence);
 raw.palette=['#DEAD00'];raw.font='Invented Sans';raw.allowedClaims.push({claim:'Award winning',evidenceQuote:'We won every award in the world.',sourceUrl:evidence.pages[0].url});
 const parsed=parseResearch(JSON.stringify(raw),evidence);
 assert.ok(!parsed.suggestions.palette.includes('#DEAD00'));assert.equal(parsed.suggestions.font,'Inter');
 assert.equal(parsed.verifiedClaims.length,1);assert.ok(!parsed.suggestions.allowedClaims.includes('Award winning'));
 assert.match(parsed.fieldOrigins.forbiddenClaims,/not a discovered company policy/);
 assert.ok(parsed.notes.some(n=>n.includes('omitted')));
 assert.throws(()=>parseResearch('not JSON',evidence),/No brand was saved/);
});
test('automatic provider selection prefers Perplexity and respects an explicit choice',()=>{
 const settings={providers:{openai:{model:'o'},perplexity:{model:'p'},anthropic:{model:'a'}}};
 const status={openai:true,perplexity:true,anthropic:true};
 assert.equal(chooseResearchProvider(settings,status,''),'perplexity');
 assert.equal(chooseResearchProvider(settings,status,'anthropic'),'anthropic');
 assert.throws(()=>chooseResearchProvider(settings,{},{provider:'fake'}));
});
async function fixture(t,{reader,fetcher,enabled='marketing',keys=true}={}){
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-brand-'));
 const env={ENABLED_MODULES:enabled,...(keys?{PERPLEXITY_API_KEY:'test-brand-secret'}:{})};
 const app=await createApp({dir,env,websiteReader:reader||((url)=>collectWebsite(url,{reader:fixtureReader})),fetcher:fetcher||(async(url,options)=>{
  const prompt=JSON.parse(JSON.parse(options.body).input);
  return Response.json(providerResponse(modelSuggestions(prompt.websiteEvidence)));
 })});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 await app.store.update(s=>{s.settings.providers.perplexity.model='test-sonar';});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const request=async(route,method='GET',data)=>{
  const r=await fetch('http://127.0.0.1:'+app.server.address().port+route,{method,headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  return {status:r.status,body:await r.json()};
 };
 const done=async id=>{
  for(let i=0;i<100;i++){const result=await request('/api/brand-research/'+id);if(!['queued','running'].includes(result.body.status))return result.body;await new Promise(r=>setTimeout(r,10));}
  throw new Error('Brand research did not finish');
 };
 return {...app,request,done};
}
test('brand research suggests all fields without saving; owner edits and evidence persist only on Save',async t=>{
 const {request,done}=await fixture(t);
 const start=await request('/api/brand-research','POST',{name:'Example Adventures',website:'www.example.com'});
 assert.equal(start.status,202);assert.equal(start.body.provider,'perplexity');
 const job=await done(start.body.id);assert.equal(job.status,'completed');
 assert.equal(job.result.suggestions.font,'Inter');assert.match(job.result.suggestions.allowedClaims,/Supporting website quote/);
 const state=(await request('/api/state')).body;assert.equal(state.brands.length,0);assert.equal(state.drafts.length,0);assert.equal(state.usage.committed,1);
 assert.ok(!JSON.stringify(state).includes('test-brand-secret'));
 const saved=await request('/api/brands','POST',{name:'Example Adventures',website:'www.example.com',...job.result.suggestions,voice:'My own tone',researchJobId:job.id});
 assert.equal(saved.status,200);assert.equal(saved.body.voice,'My own tone');assert.equal(saved.body.website,'https://www.example.com/');
 assert.equal(saved.body.research.jobId,job.id);assert.ok(saved.body.research.sources.length);
 assert.equal((await request('/api/brand-research/'+job.id)).body.brandId,saved.body.id);
});
test('research uses existing module, provider and budget gates',async t=>{
 const a=await fixture(t,{keys:false});
 assert.equal((await a.request('/api/brand-research','POST',{name:'Example',website:'example.com'})).status,409);
 assert.equal(a.store.read().jobs.length,0);
 const b=await fixture(t,{enabled:'sniff'});
 assert.equal((await b.request('/api/brand-research','POST',{name:'Example',website:'example.com'})).status,403);
 const c=await fixture(t);
 await c.store.update(s=>{s.settings.monthlyBudget=1;});
 const start=await c.request('/api/brand-research','POST',{name:'Example',website:'example.com'});await c.done(start.body.id);
 assert.equal((await c.request('/api/brand-research','POST',{name:'Example',website:'example.com'})).status,409);
});
test('website failure makes no paid call and releases its reservation',async t=>{
 let calls=0;
 const {request,done,store}=await fixture(t,{reader:async()=>{throw new Error('Website blocks automated access.');},fetcher:async()=>{calls++;throw new Error('Must not call provider');}});
 const start=await request('/api/brand-research','POST',{name:'Example',website:'example.com'});
 const job=await done(start.body.id);
 assert.equal(job.status,'failed');assert.equal(job.reconciledCost,0);assert.equal(calls,0);assert.equal(store.read().brands.length,0);
});
test('invalid AI output is not successful and retains usage for billing review',async t=>{
 const {request,done,store}=await fixture(t,{fetcher:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}],usage:{input_tokens:40,output_tokens:20}})});
 const start=await request('/api/brand-research','POST',{name:'Example',website:'example.com'});
 const job=await done(start.body.id);assert.equal(job.status,'failed');assert.equal(job.tokens.input,40);assert.equal(store.read().brands.length,0);
});


test('website DNS timeout ends analysis before any transport request',async()=>{
 const controller=new AbortController();let requests=0;
 const timer=setTimeout(()=>controller.abort(new Error('DNS deadline reached')),5);
 try{await assert.rejects(readPublicResource('https://example.com',{signal:controller.signal,lookup:()=>new Promise(()=>{}),requestImpl:()=>{requests++;}}),/DNS deadline/);}
 finally{clearTimeout(timer);}
 assert.equal(requests,0);
});
test('research parsing tolerates text or citation markers around the JSON object',()=>{
 const evidence={styling:{colors:[{value:'#112233'}],fonts:[{value:'Inter'}]},warnings:[],pages:[],sources:[],capturedAt:'t',finalUrl:'https://example.com/'};
 const r=parseResearch('Here are the suggestions [1]:\n{"palette":["#112233"],"font":"Inter","voice":"Warm","audience":"Travellers","goals":"Grow bookings","allowedClaims":[],"prohibitedClaims":[]}\n[1]',evidence);
 assert.equal(r.suggestions.voice,'Warm');assert.equal(r.suggestions.palette,'#112233');
});


test('website research keeps up to 24 distinct colours instead of only model-selected colours',()=>{
 const css=Array.from({length:18},(_,i)=>'--brand-accent-'+i+': #'+(0x102030+i*0x050709).toString(16).padStart(6,'0')+';').join('\n');
 const evidence={
  styling:extractStyles('<meta name="theme-color" content="#123ABC"><svg><path fill="#AABBCC"/></svg><style>:root{'+css+'}</style>',[], 'https://brand.example/'),
  warnings:[],pages:[],sources:[],capturedAt:'2026-11-18T00:00:00Z',finalUrl:'https://brand.example/'
 };
 assert.ok(evidence.styling.colors.length>=18);
 assert.ok(evidence.styling.colors.some(x=>x.value==='#AABBCC'));
 const raw={palette:[evidence.styling.colors[1].value],font:'',voice:'Warm',audience:'Local customers',goals:'Increase awareness'};
 const parsed=parseResearch(JSON.stringify(raw),evidence);
 const result=parsed.suggestions.palette.split(', ');
 assert.equal(result.length,evidence.styling.colors.length);
 assert.equal(result[0],raw.palette[0]);
 assert.equal(new Set(result).size,result.length);
 assert.ok(result.length>6);
});
test('brand saving accepts 24 owner-selected colours without truncating',async t=>{
 const {request}=await fixture(t);
 const colors=Array.from({length:24},(_,i)=>'#'+(0x123000+i*0x101).toString(16).padStart(6,'0')).join(', ');
 const response=await request('/api/brands','POST',{name:'Colourful Brand',website:'example.com',palette:colors,font:'Arial'});
 assert.equal(response.status,200);
 assert.equal(response.body.palette,colors);
});
