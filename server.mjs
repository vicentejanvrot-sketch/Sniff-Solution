import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from './lib/store.mjs';
import {skills,providers,id,now,fail,str,normalizeWebsite,validateBrand,validateSettings,audit,promptFor,quality,ledger} from './lib/core.mjs';
import {providerStatus,generate} from './lib/providers.mjs';
import {collectWebsite} from './lib/website.mjs';
import {chooseResearchProvider,researchInput,researchPrompt,parseResearch} from './lib/brand-research.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const MAX_MEDIA=100*1024*1024;
const mediaTypes=new Set(['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','video/mp4','audio/mpeg','audio/wav']);
async function body(req,max=200000){
 let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>max)fail('File or request exceeds the size limit.',413);chunks.push(c);}return Buffer.concat(chunks);
}
async function jsonBody(req){try{return JSON.parse((await body(req)).toString('utf8'));}catch(e){if(e.status)throw e;fail('Invalid JSON.');}}
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
export async function createApp({env=process.env,dir=env.DATA_DIR||'.data',fetcher=fetch,websiteReader=collectWebsite}={}){
 const appVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
 let sourceCommit='';try{const info=JSON.parse((await readFile(path.join(root,'build-info.json'),'utf8')).replace(/^\uFEFF/,''));if(/^[0-9a-f]{40}$/.test(info.source_commit||''))sourceCommit=info.source_commit;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 const store=await new Store({dir,mode:env.STORAGE_MODE||'local',url:env.SUPABASE_URL||'',key:env.SUPABASE_SECRET_KEY||'',workspace:env.WORKSPACE_ID||'developer',fetcher}).init();
 const enabled=new Set((env.ENABLED_MODULES||'marketing').split(',').map(x=>x.trim()));
 const ready=providerStatus(env);
 const uploads=path.join(store.dir,'uploads');await mkdir(uploads,{recursive:true,mode:0o700});
 let working=false,closing=false;
 await store.update(s=>{for(const j of s.jobs)if(j.status==='running'){j.status='interrupted';j.error='Server stopped during this request. Check provider billing before explicitly running again.';j.finishedAt=now();}});
 async function mediaRequest(method,file){
  const isDelete=method==='DELETE';
  const prefix=(env.WORKSPACE_ID||'developer')+'/'+file;
  const target=env.SUPABASE_URL+'/storage/v1/object/marketing-media'+(isDelete?'':'/'+prefix.split('/').map(encodeURIComponent).join('/'));
  const res=await fetcher(target,{
   method,headers:{apikey:env.SUPABASE_SECRET_KEY,...(env.SUPABASE_SECRET_KEY.startsWith('eyJ')?{Authorization:'Bearer '+env.SUPABASE_SECRET_KEY}:{}),...(isDelete?{'Content-Type':'application/json'}:{})},
   body:isDelete?JSON.stringify({prefixes:[prefix]}):undefined,signal:AbortSignal.timeout(120000)
  });
  if(!res.ok)throw new Error('Media storage request failed ('+res.status+').');
  return res;
 }
 async function putMedia(file,bytes,mime){
  if(store.mode==='local')return writeFile(path.join(uploads,file),bytes,{mode:0o600});
  const res=await fetcher(env.SUPABASE_URL+'/storage/v1/object/marketing-media/'+encodeURIComponent(env.WORKSPACE_ID||'developer')+'/'+file,{
   method:'POST',headers:{apikey:env.SUPABASE_SECRET_KEY,...(env.SUPABASE_SECRET_KEY.startsWith('eyJ')?{Authorization:'Bearer '+env.SUPABASE_SECRET_KEY}:{}),'Content-Type':mime},
   body:bytes,signal:AbortSignal.timeout(120000)
  });if(!res.ok)throw new Error('Media upload failed ('+res.status+').');
 }
 async function removeMedia(file){if(store.mode==='local')await unlink(path.join(uploads,file));else await mediaRequest('DELETE',file);}
 async function pump(){
  if(working||closing)return;working=true;
  try{
   while(!closing){
    let work;
    await store.update(s=>{const j=s.jobs.find(j=>j.status==='queued');if(j){j.status='running';j.startedAt=now();work=structuredClone(j);}});
    if(!work)break;
    try{
     if(work.type==='brand-research'){
      await store.update(s=>{s.jobs.find(j=>j.id===work.id).phase='Reading public website and styles';});
      const evidence=await websiteReader(work.website);
      await store.update(s=>{const j=s.jobs.find(j=>j.id===work.id);j.phase='Preparing AI brand suggestions';j.providerStartedAt=now();});
      const generated=await generate(work.provider,work.config,researchPrompt(work.brandInput.name,evidence),{env,fetcher});
      await store.update(s=>{const j=s.jobs.find(j=>j.id===work.id);j.tokens=generated.tokens;j.costEstimate=generated.costEstimate;});
      if(generated.incomplete)throw new Error('The AI reached its output limit. No suggestions were applied and no brand was saved.');
      const result=parseResearch(generated.text,evidence);
      await store.update(s=>{const j=s.jobs.find(j=>j.id===work.id);j.status='completed';j.phase='Suggestions ready for review';j.finishedAt=now();j.result=result;audit(s,'brand.suggestions_ready',j.id);});
      continue;
     }
     const result=await generate(work.provider,work.config,work.prompt,{env,fetcher});
     await store.update(s=>{
      const j=s.jobs.find(x=>x.id===work.id);j.finishedAt=now();j.tokens=result.tokens;j.costEstimate=result.costEstimate;
      if(!result.text.trim()) {j.status='failed';j.error='Provider returned no text. Check usage before retrying.';return;}
      const draft={id:id(),brandId:j.brandId,title:j.title,skill:j.skill,text:result.text,status:'draft',createdAt:now(),updatedAt:now(),version:1,versions:[],sources:result.sources,checks:quality(result.text,j.brandSnapshot)};
      if(result.incomplete){draft.status='needs-review';j.status='incomplete';j.error='Provider reached its output limit. Partial draft saved for review.';}else j.status='completed';
      j.draftId=draft.id;s.drafts.unshift(draft);audit(s,'content.generated',draft.id);
     });
    }catch(e){await store.update(s=>{const j=s.jobs.find(x=>x.id===work.id);j.status='failed';j.finishedAt=now();j.error=e.name==='TimeoutError'?'Request timed out. Check provider billing before retrying.':e.message;if(j.type==='brand-research'&&!j.providerStartedAt)j.reconciledCost=0;});}
   }
  }finally{working=false;}
 }
 function publicState(){const s=store.read();return {...s,skills,modules:{marketing:enabled.has('marketing'),sniff:false,integration:false},storageMode:store.mode,providerStatus:ready,usage:ledger(s),role:'developer-owner',appVersion,sourceCommit,build:'Phase 1 · v'+appVersion+(sourceCommit?' · '+sourceCommit.slice(0,7):' · source checkout')+' · developer workspace'};}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{
   const port=server.address()?.port;
   const expected='127.0.0.1:'+port;
   if(req.headers.host!==expected&&req.headers.host!=='localhost:'+port)fail('This developer app only accepts local connections.',403);
   const origin='http://'+req.headers.host;
   if(req.headers.origin&&req.headers.origin!==origin)fail('Cross-origin requests are blocked.',403);
   if(req.headers['sec-fetch-site']==='cross-site')fail('Cross-site requests are blocked.',403);
   const u=new URL(req.url,origin),p=u.pathname;
   if(p.startsWith('/api/')){
    if(req.headers['x-sniff-client']!=='1')fail('Missing client request header.',403);
    if(p==='/api/state'&&req.method==='GET')return json(res,publicState());
    if(p.startsWith('/api/sniff')||p.startsWith('/api/integration'))fail('This module is not enabled in Phase 1.',403);
    if(!enabled.has('marketing'))fail('AI Marketing Studio is not enabled.',403);
    if(p==='/api/brand-research'&&req.method==='POST'){
     const body=await jsonBody(req),input=researchInput(body),website=normalizeWebsite(body.website||'');
     if(!website)fail('Enter the brand website first.');
     const job=await store.update(s=>{
      const provider=chooseResearchProvider(s.settings,ready,input.provider);
      if(input.brandId&&!s.brands.some(b=>b.id===input.brandId))fail('Brand not found.',404);
      if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length>=10)fail('The queue is full. Wait for a job to finish.',409);
      if(ledger(s).committed+s.settings.reservePerJob>s.settings.monthlyBudget)fail('The monthly budget has no room for another reservation. Review costs in Settings.',409);
      const j={id:id(),type:'brand-research',skill:'brand-research',brandId:input.brandId,brandInput:{name:input.name,website},website,title:'Brand suggestions: '+input.name,provider,config:structuredClone(s.settings.providers[provider]),status:'queued',phase:'Waiting to read website',reservation:s.settings.reservePerJob,costEstimate:null,createdAt:now()};
      s.jobs.push(j);audit(s,'brand.research_queued',j.id);return j;
     });
     json(res,{id:job.id,status:job.status,provider:job.provider,website:job.website},202);
     setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
    if(/^\/api\/brand-research\/[^/]+$/.test(p)&&req.method==='GET'){
     const j=store.read().jobs.find(j=>j.id===p.split('/')[3]&&j.type==='brand-research');
     if(!j)fail('Website analysis not found.',404);
     return json(res,j);
    }
    if(p==='/api/brands'&&req.method==='POST'){
     const b=await jsonBody(req),v=validateBrand(b);
     const result=await store.update(s=>{
      let existing=b.id?s.brands.find(x=>x.id===b.id):null;
      if(b.id&&!existing)fail('Brand not found.',404);
      if(existing){if(b.version!==existing.version)fail('This brand changed. Reload before saving.',409);Object.assign(existing,v,{version:existing.version+1,updatedAt:now()});}
      else{existing={id:id(),...v,version:1,createdAt:now(),updatedAt:now()};s.brands.push(existing);}
      if(b.researchJobId){
       const job=s.jobs.find(j=>j.id===b.researchJobId&&j.type==='brand-research'&&j.status==='completed');
       if(!job?.result)fail('The selected brand suggestions are unavailable. Analyze the website again.',409);
       existing.research={jobId:job.id,observedName:job.brandInput.name,observedWebsite:job.website,...structuredClone(job.result)};job.brandId=existing.id;
      }
      audit(s,'brand.saved',existing.id);return existing;
     });return json(res,result);
    }
    if(/^\/api\/brands\/[^/]+$/.test(p)&&req.method==='DELETE'){
     const brandId=p.split('/').pop();
     await store.update(s=>{
      if(!s.brands.some(b=>b.id===brandId))fail('Brand not found.',404);
      if(s.drafts.some(d=>d.brandId===brandId)||s.media.some(m=>m.brandId===brandId)||s.jobs.some(j=>j.brandId===brandId))fail('This brand has content, media or job history. Keep it to preserve those records.',409);
      s.brands=s.brands.filter(b=>b.id!==brandId);audit(s,'brand.deleted',brandId);
     });return json(res,{ok:true});
    }
    if(p==='/api/settings'&&req.method==='PUT'){
     const settings=validateSettings(await jsonBody(req));
     await store.update(s=>{s.settings=settings;audit(s,'settings.saved','workspace');});
     return json(res,{ok:true});
    }
    if(p==='/api/checks'&&req.method==='POST'){
     const b=await jsonBody(req),text=str(b.text,30000);
     if(!['hook','beats','caption','humanizer','detection','swipe'].includes(b.command))fail('Unknown editorial check.');
     const result=await new Promise((resolve,reject)=>{
      const child=spawn(env.PYTHON||'python3',[path.join(root,'tools','editorial_checks.py'),b.command],{stdio:['pipe','pipe','ignore'],shell:false});
      let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Editorial check timed out.'));},5000);
      child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000){child.kill();reject(new Error('Editorial output limit reached.'));}});
      child.on('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('Install Python 3 or set PYTHON in the server .env file to enable these checks.'),{status:409}));});
      child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Editorial check failed.'));try{resolve(JSON.parse(output));}catch(e){reject(e);}});
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({text}));
     });
     return json(res,result);
    }
    if(p==='/api/jobs'&&req.method==='POST'){
     const b=await jsonBody(req),skill=skills.find(x=>x.id===b.skill);
     if(!skill||!providers.includes(b.provider))fail('Select a skill and provider.');
     if(!ready[b.provider])fail('Configure this provider’s API key in the server .env file.',409);
     const brief=str(b.brief,20000);if(!brief)fail('Add a brief or source content.');
     const job=await store.update(s=>{
      const brand=s.brands.find(x=>x.id===b.brandId);if(!brand)fail('Select a brand first.');
      const config=s.settings.providers[b.provider];if(!config.model)fail('Set a model in Settings.',409);
      if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length>=10)fail('The queue is full. Wait for a job to finish.',409);
      if(ledger(s).committed+s.settings.reservePerJob>s.settings.monthlyBudget)fail('The monthly budget has no room for another reservation. Review costs in Settings.',409);
      const j={id:id(),brandId:brand.id,brandSnapshot:brand,title:str(b.title||skill.name,150),skill:skill.id,provider:b.provider,config:structuredClone(config),prompt:promptFor(skill,brand,brief),brief,status:'queued',reservation:s.settings.reservePerJob,costEstimate:null,createdAt:now()};
      s.jobs.push(j);audit(s,'job.queued',j.id);return j;
     });json(res,{id:job.id,status:'queued'},202);setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
    if(/^\/api\/jobs\/[^/]+\/reconcile$/.test(p)&&req.method==='POST'){
     const b=await jsonBody(req);const cost=Number(b.cost);
     if(!Number.isFinite(cost)||cost<0||cost>100000)fail('Enter the confirmed cost in USD.');
     await store.update(s=>{const j=s.jobs.find(j=>j.id===p.split('/')[3]);if(!j)fail('Job not found.',404);if(['queued','running'].includes(j.status))fail('Wait until the job ends.',409);j.reconciledCost=cost;audit(s,'job.cost_reconciled',j.id);});
     return json(res,{ok:true});
    }
    if(p==='/api/drafts'&&req.method==='POST'){
     const b=await jsonBody(req);
     const result=await store.update(s=>{
      const brand=s.brands.find(x=>x.id===b.brandId);if(!brand)fail('Choose a brand.');
      const d={id:id(),brandId:brand.id,title:str(b.title||'Untitled draft',150),text:str(b.text||'',30000),skill:'manual',status:'draft',version:1,versions:[],createdAt:now(),updatedAt:now(),sources:[]};
      d.checks=quality(d.text,brand);s.drafts.unshift(d);audit(s,'draft.created',d.id);return d;
     });return json(res,result,201);
    }
    if(/^\/api\/drafts\/[^/]+$/.test(p)&&req.method==='PUT'){
     const b=await jsonBody(req);
     const result=await store.update(s=>{
      const d=s.drafts.find(d=>d.id===p.split('/')[3]);if(!d)fail('Draft not found.',404);
      if(b.version!==d.version)fail('This draft changed. Reload before saving.',409);
      if(!['draft','needs-review','approved'].includes(b.status))fail('Invalid review status.');
      const text=str(b.text,30000),title=str(b.title,150);if(!title||!text)fail('Title and content are required.');
      d.versions.unshift({text:d.text,title:d.title,status:d.status,version:d.version,at:d.updatedAt});d.versions=d.versions.slice(0,25);
      Object.assign(d,{text,title,status:b.status,version:d.version+1,updatedAt:now(),checks:quality(text,s.brands.find(x=>x.id===d.brandId))});
      audit(s,b.status==='approved'?'draft.approved':'draft.saved',d.id);return d;
     });return json(res,result);
    }
    if(/^\/api\/drafts\/[^/]+$/.test(p)&&req.method==='DELETE'){
     await store.update(s=>{const draftId=p.split('/')[3];if(!s.drafts.some(d=>d.id===draftId))fail('Draft not found.',404);s.drafts=s.drafts.filter(d=>d.id!==draftId);audit(s,'draft.deleted',draftId);});
     return json(res,{ok:true});
    }
    if(p==='/api/media'&&req.method==='POST'){
     const mime=(req.headers['content-type']||'').split(';')[0];if(!mediaTypes.has(mime))fail('Unsupported file format. Use PNG, JPEG, WebP, GIF, PDF, TXT, MP4, MP3 or WAV.');
     let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail('Invalid filename.');}name=str(name,250);if(!name)fail('Filename required.');
     const brandId=req.headers['x-brand-id'];if(!store.read().brands.some(b=>b.id===brandId))fail('Select a brand.');
     const bytes=await body(req,MAX_MEDIA);if(!bytes.length)fail('File is empty.');
     const media={id:id(),brandId,name,mime,size:bytes.length,tags:str(req.headers['x-tags']||'',500),createdAt:now()};
     media.file=media.id;
     await putMedia(media.file,bytes,mime);
     try{await store.update(s=>{s.media.unshift(media);audit(s,'media.uploaded',media.id);});}
     catch(e){await removeMedia(media.file).catch(()=>{});throw e;}
     return json(res,media,201);
    }
    if(/^\/api\/media\/[^/]+$/.test(p)){
     const m=store.read().media.find(m=>m.id===p.split('/')[3]);if(!m)fail('Media not found.',404);
     if(req.method==='GET'){
      const bytes=store.mode==='local'?await readFile(path.join(uploads,m.file)):Buffer.from(await(await mediaRequest('GET',m.file)).arrayBuffer());
      res.writeHead(200,{'Content-Type':m.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(m.name)});res.end(bytes);return;
     }
     if(req.method==='DELETE'){
      // Remove the stored file first; failed metadata write remains visible and recoverable.
      await removeMedia(m.file);
      await store.update(s=>{s.media=s.media.filter(x=>x.id!==m.id);audit(s,'media.deleted',m.id);});
      return json(res,{ok:true});
     }
    }
    fail('Endpoint not found.',404);
   }
   if(!['GET','HEAD'].includes(req.method))fail('Method not allowed.',405);
   const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
   const entry=staticFiles[p];if(!entry)fail('Not found.',404);
   const data=await readFile(path.join(root,'public',entry[0]));res.writeHead(200,{'Content-Type':entry[1]});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json(res,{error:e.status?e.message:'Operation failed. Check server configuration and storage availability.'},e.status||500);else res.end();}
 });
 server.on('close',()=>{closing=true;});
 const close=async()=>{closing=true;await new Promise(resolve=>server.listening?server.close(resolve):resolve());while(working)await new Promise(r=>setTimeout(r,25));await store.close();};
 return {server,store,close,pump};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();
 const port=Number(process.env.PORT||3080);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be between 1024 and 65535.');
 app.server.listen(port,'127.0.0.1',()=>{console.log('Sniff Solution: http://127.0.0.1:'+port);app.pump().catch(e=>console.error(e.message));});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}

