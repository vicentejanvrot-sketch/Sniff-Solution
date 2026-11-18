import {videoModels,videoModel,imageModel,accountImageModels} from './lib/media-models.mjs';
import {analyticsReport,analyticsCSV} from './lib/analytics.mjs';
import {createPlan,findEntry,ensureEntryEditable,saveEntry,plannerPrompt,parsePlanOutput,plannerProduction} from './lib/planner.mjs';
import {desktopPublishing} from './lib/desktop-publishing.mjs';
import {prepareInstagramMedia} from './lib/publish-media.mjs';
import {reconcilePublication} from './lib/publishing-history.mjs';
import {validateSchedule,cancelSchedule,ensureNotScheduled} from './lib/calendar.mjs';
import {videoBriefPrompt} from './lib/video-brief.mjs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from './lib/store.mjs';
import {skills,providers,id,now,fail,str,normalizeWebsite,validateBrand,validateSettings,audit,promptFor,quality,ledger,reconcileDay} from './lib/core.mjs';
import {providerStatus,generate} from './lib/providers.mjs';
import {collectWebsite} from './lib/website.mjs';
import {chooseResearchProvider,researchInput,researchPrompt,parseResearch} from './lib/brand-research.mjs';
import {productionSettings,productionInput,rendererAvailable,generateImages,generateVideo,renderAsset,thumbnailAsset,higgsfieldCredential} from './lib/production.mjs';
import {installedFonts,publicFonts} from './lib/fonts.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const MAX_MEDIA=100*1024*1024;
const mediaTypes=new Set(['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','video/mp4','audio/mpeg','audio/wav']);
async function body(req,max=200000){
 let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>max)fail('File or request exceeds the size limit.',413);chunks.push(c);}return Buffer.concat(chunks);
}
async function jsonBody(req){try{return JSON.parse((await body(req)).toString('utf8'));}catch(e){if(e.status)throw e;fail('Invalid JSON.');}}
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
export async function createApp({env=process.env,dir=env.DATA_DIR||'.data',fetcher=fetch,websiteReader=collectWebsite,assetDownloader,mediaRenderer=renderAsset,pollDelay,fontCatalogProvider=installedFonts}={}){
 const appVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
 let sourceCommit='';try{const info=JSON.parse((await readFile(path.join(root,'build-info.json'),'utf8')).replace(/^\uFEFF/,''));if(/^[0-9a-f]{40}$/.test(info.source_commit||''))sourceCommit=info.source_commit;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
 const store=await new Store({dir,mode:env.STORAGE_MODE||'local',url:env.SUPABASE_URL||'',key:env.SUPABASE_SECRET_KEY||'',workspace:env.WORKSPACE_ID||'developer',fetcher}).init();
 const enabled=new Set((env.ENABLED_MODULES||'marketing').split(',').map(x=>x.trim()));
 const ready=providerStatus(env);
 const publishing=desktopPublishing({env,fetcher});
 const uploads=path.join(store.dir,'uploads');await mkdir(uploads,{recursive:true,mode:0o700});
 const thumbnailDir=path.join(store.dir,'thumbnails');await mkdir(thumbnailDir,{recursive:true,mode:0o700});
 const thumbnailJobs=new Map();let thumbnailTail=Promise.resolve();
 const renderReady=await rendererAvailable(env);
 let fontCatalog=await fontCatalogProvider();
 let imageCatalog=null;
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
 async function readMedia(m){return store.mode==='local'?readFile(path.join(uploads,m.file)):Buffer.from(await(await mediaRequest('GET',m.file)).arrayBuffer());}
 async function saveProductionMedia(work,result,{sourceId='',role='generated',imageIndex=1}={}){
  const p=work.production,ext=result.mime==='video/mp4'?'mp4':'png';
  const media={id:id(),brandId:work.brandId,name:work.title+'-'+role+'.'+ext,mime:result.mime,size:result.bytes.length,tags:'production, '+role,createdAt:now(),status:'needs-review',version:1,reviewHistory:[],jobId:work.id,sourceId,draftId:p.draftId,caption:p.caption,role,aspect:role==='rendered'?p.aspect:null,requestedAspect:p.aspect,width:result.width||null,height:result.height||null,branding:role==='rendered'&&p.branding,brandSnapshot:p.brandSnapshot};media.file=media.id;
  media.imageIndex=imageIndex;if(p.count>1)media.name=work.title+'-image-'+imageIndex+'-of-'+p.count+'-'+role+'.'+ext;
  if(role==='rendered'&&p.branding&&p.includeBrandText!==false)media.renderingFont=p.systemFontName||p.fontSnapshot?.name||p.brandSnapshot.font;
  await putMedia(media.file,result.bytes,result.mime);
  try{await store.update(s=>{s.media.unshift(media);const j=s.jobs.find(j=>j.id===work.id);(j.mediaIds||=[]).push(media.id);audit(s,'production.asset_saved',media.id);});}
  catch(e){await removeMedia(media.file).catch(()=>{});throw e;}return media;
 }
 async function pump(){
  if(working||closing)return;working=true;
  try{
   while(!closing){
    let work;
    await store.update(s=>{const j=s.jobs.find(j=>j.status==='queued');if(j){j.status='running';j.startedAt=now();work=structuredClone(j);}});
    if(!work)break;
    try{
     if(work.type==='production'){
      const p=work.production;
      const phase=async text=>store.update(s=>{s.jobs.find(j=>j.id===work.id).phase=text;});
      let results,incomplete=false;
      if(p.kind==='image'){
       await phase('Generating images with OpenAI');
       const generated=await generateImages(work,{env,fetcher,readMedia});results=generated.images;incomplete=generated.incomplete;
       await store.update(s=>{s.jobs.find(j=>j.id===work.id).providerUsage=generated.usage;});
      }else if(p.kind==='video'){
       results=[await generateVideo(work,{env,fetcher,downloader:assetDownloader,pollDelay,onPhase:phase,onRequest:requestId=>store.update(s=>{s.jobs.find(j=>j.id===work.id).providerRequestId=requestId;})})];
      }else results=[{bytes:await readMedia(p.sourceSnapshot),mime:p.sourceSnapshot.mime}];
      // Persist every paid batch output before attempting any rendering.
      const sources=[];for(let i=0;i<results.length;i++)sources.push(p.kind==='render'?p.sourceSnapshot:await saveProductionMedia(work,results[i],{sourceId:p.sourceId,imageIndex:i+1}));
      for(let index=0;index<results.length;index++){
       const result=results[index],source=sources[index];
       await phase('Preparing final dimensions and brand overlays');
       const rendered=await mediaRenderer(result,p,{env,dir:store.dir,readMedia,fontCatalog});
       await saveProductionMedia(work,rendered,{sourceId:source.id,role:'rendered',imageIndex:index+1});
      }
      await store.update(s=>{const j=s.jobs.find(j=>j.id===work.id);j.status=incomplete?'incomplete':'completed';j.phase='Assets ready for review';j.finishedAt=now();if(incomplete)j.error='Provider returned fewer images than requested. Review the saved assets and provider billing.';if(p.kind==='render'){j.costEstimate=0;j.reconciledCost=0;}audit(s,'production.completed',j.id);});continue;
     }
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
     if(work.type==='plan-day'){
      const result=await generate(work.provider,work.config,work.prompt,{env,fetcher});
      await store.update(s=>{const j=s.jobs.find(x=>x.id===work.id);j.tokens=result.tokens;j.costEstimate=result.costEstimate;j.resultText=result.text;});
      if(result.incomplete)throw new Error('The proposal was truncated. No day was changed. Review Activity and billing before generating again.');
      const fields=parsePlanOutput(result.text);
      await store.update(s=>{const j=s.jobs.find(x=>x.id===work.id),{entry}=findEntry(s,j.plannerPlanId,j.plannerEntryId);
       if(entry.version!==j.plannerEntryVersion)fail('The plan day changed. Generated output retained in Activity.',409);
       entry.history.unshift({...entry,history:undefined});entry.history=entry.history.slice(0,25);
       Object.assign(entry,fields,{status:'needs-review',version:entry.version+1,updatedAt:now()});
       j.status='completed';j.finishedAt=now();audit(s,'plan.day_prepared',entry.id);
      });continue;
     }
     const result=await generate(work.provider,work.config,work.prompt,{env,fetcher});
     await store.update(s=>{
      const j=s.jobs.find(x=>x.id===work.id);j.finishedAt=now();j.tokens=result.tokens;j.costEstimate=result.costEstimate;
      if(!result.text.trim()) {j.status='failed';j.error='Provider returned no text. Check usage before retrying.';return;}
      const draft={id:id(),brandId:j.brandId,title:j.title,skill:j.skill,text:result.text,status:'draft',createdAt:now(),updatedAt:now(),version:1,versions:[],sources:result.sources,checks:quality(result.text,j.brandSnapshot)};
      if(j.videoBrief){draft.videoBrief=structuredClone(j.videoBrief);if(result.text.length>16000){j.status='failed';j.error='Prepared brief is too long. No video was generated.';return;}}
      const missingSources=skills.find(s=>s.id===j.skill)?.requiresWeb&&!result.sources.length;
      if(result.incomplete||missingSources){draft.status='needs-review';j.status='incomplete';j.error=result.incomplete?'Provider reached its output limit. Partial draft saved for review.':'No web search sources were returned. Draft saved for review; do not treat it as verified current research.';}else j.status='completed';
      j.draftId=draft.id;s.drafts.unshift(draft);audit(s,'content.generated',draft.id);
     });
    }catch(e){await store.update(s=>{const j=s.jobs.find(x=>x.id===work.id);j.status='failed';j.finishedAt=now();j.error=e.name==='TimeoutError'?'Request timed out. Check provider billing before retrying.':e.message;if(j.type==='brand-research'&&!j.providerStartedAt)j.reconciledCost=0;});}
   }
  }finally{working=false;}
 }
 async function activateSchedule(scheduleId,{idempotent=false}={}){
  const snapshot=await store.update(s=>{
   const item=(s.schedules||[]).find(v=>v.id===scheduleId);
   if(!item)fail('Scheduled publication not found.',404);
   if(idempotent&&item.activationState==='active')return {alreadyActive:true,schedule:structuredClone(item)};
   if(item.status!=='scheduled'||item.activationState)fail('This publication is already active, cancelled, or needs reconciliation. Refresh publishing status before another action.',409);
   if(Date.parse(item.scheduledAt)<Date.now()+120000)fail('Choose a publication at least two minutes in the future.',409);
   const media=s.media.find(m=>m.id===item.mediaId&&m.brandId===item.brandId);
   if(!media||media.status!=='approved'||media.version!==item.mediaVersion)fail('Media approval changed. Review it before activating.',409);
   const draft=item.draftId?s.drafts.find(d=>d.id===item.draftId&&d.brandId===item.brandId&&d.status==='approved'&&d.version===item.draftVersion):null;
   if(item.draftId&&!draft)fail('Draft approval changed. Review it before activating.',409);
   item.activationState='staging';item.updatedAt=now();delete item.lastError;audit(s,'schedule.activation_started',item.id);
   return {schedule:structuredClone(item),media:structuredClone(media)};
  });
  if(snapshot.alreadyActive)return snapshot.schedule;
  let cloudStarted=false;
  try{
   const prepared=await prepareInstagramMedia(snapshot.media,await readMedia(snapshot.media),{env});
   cloudStarted=true;
   await publishing.stage(snapshot.schedule.id,prepared.mime,prepared.bytes);
   const job=snapshot.schedule;
   await publishing.enqueue({id:job.id,brandId:job.brandId,accountId:job.accountId,assetId:job.mediaId,assetVersion:job.mediaVersion,mime:prepared.mime,caption:job.caption,scheduledAt:job.scheduledAt,timezone:job.timezone});
   return await store.update(s=>{const item=s.schedules.find(v=>v.id===scheduleId);item.activationState='active';item.cloudStatus='scheduled';item.updatedAt=now();audit(s,'schedule.cloud_activated',item.id);return item;});
  }catch(e){
   await store.update(s=>{const item=s.schedules.find(v=>v.id===scheduleId);if(item){if(cloudStarted)item.activationState='uncertain';else delete item.activationState;item.lastError=cloudStarted?'Cloud activation was not confirmed. Refresh publishing status before taking another action.':'Local media preparation failed. The saved schedule has not been sent for publishing. Check the saved asset and local renderer.';item.updatedAt=now();audit(s,cloudStarted?'schedule.activation_uncertain':'schedule.preparation_failed',item.id);}}).catch(()=>{});
   throw Object.assign(new Error(cloudStarted?'Cloud activation could not be verified. Refresh publishing status; do not activate the same post again blindly.':'The media could not be prepared locally. Your schedule is saved but is not active. Check the saved media and renderer, then try Schedule & activate again.'),{status:503});
  }
 }
 function publicState(){const s=store.read();return {...s,skills,production:{videoModels,fonts:publicFonts(fontCatalog),renderer:renderReady,openai:!!env.OPENAI_API_KEY,higgsfield:!!higgsfieldCredential(env),settings:productionSettings(s.settings.production)},modules:{marketing:enabled.has('marketing'),sniff:false,integration:false},storageMode:store.mode,providerStatus:ready,usage:ledger(s),role:'developer-owner',appVersion,sourceCommit,build:'Phase 4 · v'+appVersion+(sourceCommit?' · '+sourceCommit.slice(0,7):' · source checkout')+' · developer workspace'};}
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
    if(p==='/api/analytics'&&req.method==='GET'){
     const filters=Object.fromEntries(['brandId','accountId','from','to'].map(key=>[key,u.searchParams.get(key)||'']));
     for(const k of ['from','to'])if(filters[k]&&!/^\d{4}-\d{2}-\d{2}$/.test(filters[k]))fail('Use valid UTC date filters.');
     if(filters.from&&filters.to&&filters.from>filters.to)fail('The start date must precede the end date.');
     const report=analyticsReport(store.read(),filters);
     if(u.searchParams.get('export')==='csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="sniff-performance.csv"'});return res.end(analyticsCSV(report));}
     return json(res,{...report,sync:store.read().analytics?.accounts||[],pulledAt:store.read().analytics?.pulledAt||null});
    }
    if(p==='/api/analytics/pull'&&req.method==='POST'){
     const result=await publishing.insights();
     await store.update(s=>{const allowed=new Set(s.brands.map(b=>b.id)),accounts=(result.accounts||[]).filter(a=>allowed.has(a.brand_id));
      const snapshots=accounts.flatMap(a=>(a.document?.snapshots||[]).filter(x=>x.accountId===a.account_id&&x.brandId===a.brand_id));
      s.analytics={snapshots,accounts:accounts.map(a=>({accountId:a.account_id,brandId:a.brand_id,lastAttemptAt:a.last_attempt_at,lastSuccessAt:a.last_success_at,nextSyncAt:a.next_sync_at,error:a.last_error,warnings:a.document?.warnings||[]})),pulledAt:now()};
     });return json(res,{ok:true});
    }
    if(p==='/api/analytics/sync'&&req.method==='POST'){
     const b=await jsonBody(req),accounts=(await publishing.accounts()).accounts;
     if(!accounts.some(a=>a.id===b.accountId&&a.status==='connected'&&store.read().brands.some(b=>b.id===a.brand_id)))fail('Choose a connected account of an existing brand.',409);
     return json(res,await publishing.syncInsights(b.accountId),202);
    }
    if(p==='/api/social/accounts'&&req.method==='GET'){
     if(!publishing.configured)return json(res,{configured:false,accounts:[]});
     const result=await publishing.accounts();return json(res,{configured:true,accounts:result.accounts.filter(a=>store.read().brands.some(b=>b.id===a.brand_id))});
    }
    if(p==='/api/social/connect'&&req.method==='POST'){
     const b=await jsonBody(req);if(!store.read().brands.some(x=>x.id===b.brandId))fail('Choose an existing brand.',404);
     if(typeof b.expectedUsername!=='string'||! /^[a-zA-Z0-9._]{1,30}$/.test(b.expectedUsername))fail('Enter an Instagram username without @.');
     return json(res,await publishing.connect(b.brandId,b.expectedUsername));
    }
    if(p==='/api/social/disconnect'&&req.method==='POST'){
     const b=await jsonBody(req);if(!store.read().brands.some(x=>x.id===b.brandId))fail('Brand not found.',404);
     return json(res,await publishing.disconnect(b.accountId,b.brandId));
    }
    if(p==='/api/schedules/health'&&req.method==='GET')return json(res,await publishing.health());
    if(/^\/api\/schedules\/[^/]+\/history$/.test(p)&&req.method==='GET'){
     const id=p.split('/')[3];
     if(!(store.read().schedules||[]).some(x=>x.id===id))fail('Unknown publication.',404);
     return json(res,await publishing.history(id));
    }
    if(/^\/api\/schedules\/[^/]+\/retry$/.test(p)&&req.method==='POST'){
     const id=p.split('/')[3],item=(store.read().schedules||[]).find(x=>x.id===id);
     if(!item||item.status!=='failed'||item.cloudStatus!=='failed'||!item.activationState||item.instagramMediaId||item.containerId)fail('This publication is not confirmed safe to retry. Refresh status first.',409);
     const result=await publishing.retry(id);
     await store.update(s=>{const row=s.schedules.find(x=>x.id===id);row.status='scheduled';row.cloudStatus='scheduled';row.lastError=null;row.updatedAt=now();audit(s,'schedule.manual_retry',id);});
     return json(res,result);
    }
    if(p==='/api/schedules/sync'&&req.method==='POST'){
     const response=await publishing.jobs();
     const cloud=new Map((response.jobs||[]).map(j=>[j.id,j]));
     const updated=await store.update(s=>{
      for(const item of s.schedules||[]){
       const remote=cloud.get(item.id);
       if(!remote)continue;
       const {changed,statusTransition}=reconcilePublication(item,remote);
       if(changed){item.updatedAt=now();if(statusTransition)audit(s,'schedule.cloud_status_'+statusTransition.to,item.id);}
      }
      return s.schedules||[];
     });
     return json(res,updated);
    }
    if(/^\/api\/schedules\/[^/]+\/activate$/.test(p)&&req.method==='POST')return json(res,await activateSchedule(p.split('/')[3]));
    if(p==='/api/schedules'&&req.method==='GET')return json(res,store.read().schedules||[]);
    if(p==='/api/schedules'&&req.method==='POST'){
     const b=await jsonBody(req);
     const accounts=(await publishing.accounts()).accounts;
     const result=await store.update(s=>{
      const item=validateSchedule(s,b,{accounts});
      (s.schedules??=[]).unshift(item);audit(s,'schedule.created',item.id);return item;
     });
     return json(res,result,201);
    }
    if(/^\/api\/schedules\/[^/]+$/.test(p)&&req.method==='PUT'){
     const b=await jsonBody(req),scheduleId=p.split('/')[3];
     const accounts=(await publishing.accounts()).accounts;
     const result=await store.update(s=>{
      const current=(s.schedules||[]).find(x=>x.id===scheduleId);
      if(!current)fail('Schedule not found.',404);
      if(current.activationState)fail('Cloud-activated posts cannot be edited. Cancel in the cloud first and create a replacement.',409);
      if(b.version!==current.version)fail('Schedule changed. Reload before editing.',409);
      if(b.brandId!==current.brandId)fail('Cannot transfer a publication to another brand.',409);
      const updated=validateSchedule(s,b,{accounts,existing:current});
      Object.assign(current,updated);audit(s,'schedule.updated',current.id);return current;
     });
     return json(res,result);
    }
    if(/^\/api\/schedules\/[^/]+\/cancel$/.test(p)&&req.method==='POST'){
     const b=await jsonBody(req),scheduleId=p.split('/')[3];
     const snapshot=(store.read().schedules||[]).find(x=>x.id===scheduleId);
     if(!snapshot)fail('Scheduled publication not found.',404);
     if(snapshot.version!==b.version)fail('Schedule changed. Reload first.',409);
     if(snapshot.activationState){await publishing.cancel(scheduleId);}
     const result=await store.update(s=>{const entry=cancelSchedule(s,scheduleId,b.version);if(snapshot.activationState){entry.cloudStatus='cancelled';entry.activationState='active';}audit(s,'schedule.cancelled',entry.id);return entry;});
     return json(res,result);
    }
    if(p==='/api/fonts/refresh'&&req.method==='POST'){fontCatalog=await fontCatalogProvider({refresh:true});return json(res,publicFonts(fontCatalog));}
    if(p==='/api/plans'&&req.method==='POST'){
     const b=await jsonBody(req);const plan=await store.update(s=>{const plan=createPlan(s,b);(s.contentPlans??=[]).unshift(plan);audit(s,'plan.created',plan.id);return plan;});return json(res,plan,201);
    }
    if(/^\/api\/plans\/[^/]+\/days\/[^/]+$/.test(p)&&req.method==='PUT'){
     const b=await jsonBody(req);return json(res,await store.update(s=>saveEntry(s,p.split('/')[3],p.split('/')[5],b)));
    }
    if(/^\/api\/plans\/[^/]+\/prepare$/.test(p)&&req.method==='POST'){
     const b=await jsonBody(req),planId=p.split('/')[3];
     if(!['openai','anthropic'].includes(b.provider)||!ready[b.provider])fail('Configure an OpenAI or Claude text model and key in Settings.',409);
     const jobs=await store.update(s=>{
      const plan=(s.contentPlans||[]).find(x=>x.id===planId);if(!plan)fail('Content plan not found.',404);
      if(!Array.isArray(b.entryIds)||!b.entryIds.length||b.entryIds.length>7||new Set(b.entryIds).size!==b.entryIds.length)fail('Select one to seven distinct days.');
      const entries=b.entryIds.map(eid=>findEntry(s,plan.id,eid).entry);for(const e of entries)ensureEntryEditable(s,e);
      if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length+entries.length>10)fail('Queue is full. Prepare fewer days or wait for active requests.',409);
      if(ledger(s).committed+entries.length*s.settings.reservePerJob>s.settings.monthlyBudget)fail('The remaining planning budget cannot reserve all selected days.',409);
      const config=s.settings.providers[b.provider];if(!config?.model)fail('Choose a text model in Settings.',409);
      const brand=s.brands.find(x=>x.id===plan.brandId);if(!brand)fail('Brand not found.',404);
      const evidence=analyticsReport(s,{brandId:plan.brandId}).posts.slice(0,10).map(x=>({caption:x.caption,format:x.format,publishedAt:x.publishedAt,capturedAt:x.capturedAt,metrics:x.metrics,plannedLocalTime:(s.schedules||[]).find(p=>p.id===x.publicationId)?.localTime||null,interpretation:'Lifetime observations; account for age and small samples. Association does not establish cause.'}));
      return entries.map(entry=>{const j={id:id(),type:'plan-day',skill:'content-planner',brandId:plan.brandId,title:plan.title+' · '+entry.localTime.slice(0,10),plannerPlanId:plan.id,plannerEntryId:entry.id,plannerEntryVersion:entry.version,provider:b.provider,config:structuredClone(config),prompt:plannerPrompt(plan,entry,brand,evidence),status:'queued',reservation:s.settings.reservePerJob,costEstimate:null,createdAt:now()};s.jobs.push(j);audit(s,'plan.day_queued',entry.id);return {id:j.id};});
     });json(res,{jobs},202);setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
    if(/^\/api\/plans\/[^/]+\/days\/[^/]+\/schedule$/.test(p)&&req.method==='POST'){
     const b=await jsonBody(req),accounts=(await publishing.accounts()).accounts;
     const result=await store.update(s=>{
      const {plan,entry}=findEntry(s,p.split('/')[3],p.split('/')[5]);
      if(entry.status!=='approved'||b.version!==entry.version)fail('Approve the current day before scheduling.',409);
      const existing=(s.schedules||[]).find(x=>x.plannerEntryId===entry.id&&x.status!=='cancelled');
      if(existing){
       if(b.activate!==true)fail('This day already has a publication record.',409);
       if(existing.plannerPlanId!==plan.id||existing.plannerEntryVersion!==entry.version)fail('This publication belongs to an earlier plan version. Review its saved publication details.',409);
       if(b.mediaId&&b.mediaId!==existing.mediaId||b.accountId&&b.accountId!==existing.accountId)fail('A schedule already exists with different media or account. Use the existing publication rather than creating a duplicate.',409);
       if(!accounts.some(a=>a.id===existing.accountId&&a.brand_id===plan.brandId&&a.status==='connected'))fail('Reconnect this brand’s Instagram account before activation.',409);
       return {item:existing,created:false};
      }
      ensureEntryEditable(s,entry);
      const m=s.media.find(m=>m.id===b.mediaId),j=s.jobs.find(j=>j.id===m?.jobId);
      if(!j||j.plannerEntryId!==entry.id||j.plannerEntryVersion!==entry.version||m.role!=='rendered')fail('Choose finished media generated from this approved day.',409);
      const record=validateSchedule(s,{brandId:plan.brandId,accountId:b.accountId,mediaId:m.id,caption:entry.caption,timezone:plan.timezone,localTime:entry.localTime},{accounts});
      if(b.activate===true&&Date.parse(record.scheduledAt)<Date.now()+120000)fail('Choose a publication at least two minutes in the future.',409);
      Object.assign(record,{plannerPlanId:plan.id,plannerEntryId:entry.id,plannerEntryVersion:entry.version});(s.schedules??=[]).unshift(record);audit(s,'schedule.created',record.id);return {item:record,created:true};
     });
     const item=b.activate===true?await activateSchedule(result.item.id,{idempotent:true}):result.item;
     return json(res,item,result.created?201:200);
    }
    if(p==='/api/media-models'&&req.method==='GET'){
     if(!imageCatalog||imageCatalog.expires<Date.now())imageCatalog={ids:await accountImageModels({env,fetcher}),expires:Date.now()+300000};
     return json(res,{provider:'openai',models:imageCatalog.ids,checkedAt:new Date(imageCatalog.expires-300000).toISOString(),note:'Account catalog, filtered to GPT Image models compatible with this adapter. Model listing does not guarantee generation permissions.'});
    }
    if(/^\/api\/production\/[^/]+\/render-saved$/.test(p)&&req.method==='POST'){
     const jobId=p.split('/')[3];
     const job=await store.update(s=>{
      const original=s.jobs.find(j=>j.id===jobId&&j.type==='production');
      if(!original||!['failed','interrupted','incomplete'].includes(original.status))fail('Choose a finished request with saved media that needs rendering.',409);
      if(s.jobs.some(j=>j.renderOfJobId===jobId&&['queued','running'].includes(j.status)))fail('A saved-output render is already in progress.',409);
      const candidates=original.production.kind==='render'?[s.media.find(m=>m.id===original.production.sourceId)]:s.media.filter(m=>(original.mediaIds||[]).includes(m.id)&&m.role==='generated'&&m.brandId===original.brandId);
      const source=candidates.filter(Boolean).find(m=>!s.media.some(final=>final.sourceId===m.id&&final.role==='rendered'&&(final.jobId===jobId||s.jobs.some(j=>j.id===final.jobId&&j.renderOfJobId===jobId))));
      if(!source)fail('No unfinished saved original remains. Review the existing assets.',409);
      if(!renderReady&&mediaRenderer===renderAsset)fail('The local renderer is unavailable.',409);
      if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length>=10)fail('Queue is full. Wait for an active request.',409);
      const production={...structuredClone(original.production),kind:'render',count:1,sourceId:source.id,sourceSnapshot:structuredClone(source)};
      const j={id:id(),type:'production',skill:'render-studio',brandId:original.brandId,title:original.title,renderOfJobId:jobId,plannerPlanId:original.plannerPlanId,plannerEntryId:original.plannerEntryId,plannerEntryVersion:original.plannerEntryVersion,production,provider:'local',config:{model:'FFmpeg'},status:'queued',phase:'Finishing saved output locally; no AI generation',reservation:0,costEstimate:0,reconciledCost:0,createdAt:now(),mediaIds:[]};
      s.jobs.push(j);audit(s,'production.render_saved',j.id);return j;
     });json(res,{id:job.id,status:'queued'},202);setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
    if(p==='/api/production'&&req.method==='POST'){
     const b=await jsonBody(req);
     const job=await store.update(s=>{
      const plannerLink=plannerProduction(s,b),production=productionInput(b,s,fontCatalog),config=productionSettings(s.settings.production);
      if(production.kind==='image')config.imageModel=imageModel(b.imageModel||config.imageModel);
      if(production.kind==='video')config.videoModel=videoModel(b.videoModel||config.videoModel).id;
      if(!renderReady&&mediaRenderer===renderAsset)fail('FFmpeg is not configured. Use the complete Windows app or configure FFMPEG locally.',409);
      if(production.kind==='image'&&(!env.OPENAI_API_KEY||!config.imageModel))fail('Configure OPENAI_API_KEY locally and an image model in Settings.',409);
      if(production.kind==='video'&&!higgsfieldCredential(env))fail('Add HF_API_KEY (the complete copied Higgsfield API key) to your local API settings, then restart.',409);
      if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length>=10)fail('The queue is full. Wait for a job to finish.',409);
      const reservation=production.kind==='render'?0:config.reserve*production.count;
      const available=Math.max(0,s.settings.monthlyBudget-ledger(s).committed);
      if(reservation>available)fail('This request needs a US$'+reservation.toFixed(2)+' planning reservation; US$'+available.toFixed(2)+' remains this month. Reduce the batch size, adjust the media reservation in Settings & Costs, or reconcile previous requests in Activity. No generation was started.',409);
      const j={id:id(),type:'production',...plannerLink,skill:production.kind+'-studio',brandId:production.brandSnapshot.id,title:production.title,production,provider:production.kind==='render'?'local':production.kind==='image'?'openai':'higgsfield',config:{model:production.kind==='render'?'FFmpeg':production.kind==='image'?config.imageModel:config.videoModel},status:'queued',phase:'Waiting for media worker',reservation,costEstimate:null,createdAt:now(),mediaIds:[]};s.jobs.push(j);audit(s,'production.queued',j.id);return j;
     });json(res,{id:job.id,status:job.status},202);setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
    if(/^\/api\/production\/[^/]+\/recover$/.test(p)&&req.method==='POST'){
     await store.update(s=>{const j=s.jobs.find(j=>j.id===p.split('/')[3]&&j.type==='production');if(!j?.providerRequestId||j.production.kind!=='video')fail('There is no recoverable video request.',409);if(['queued','running','completed'].includes(j.status)||j.mediaIds?.length)fail('Request is active or already has saved media. Render the saved source from the studio.',409);if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length>=10)fail('Queue is full.',409);j.status='queued';j.phase='Recovering existing Higgsfield request';delete j.error;delete j.finishedAt;audit(s,'production.recover',j.id);});
     json(res,{ok:true},202);setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
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
      if((s.contentPlans||[]).some(p=>p.brandId===brandId)||s.drafts.some(d=>d.brandId===brandId)||s.media.some(m=>m.brandId===brandId)||s.jobs.some(j=>j.brandId===brandId)||(s.schedules||[]).some(x=>x.brandId===brandId))fail('This brand has content, media or job history. Keep it to preserve those records.',409);
      s.brands=s.brands.filter(b=>b.id!==brandId);audit(s,'brand.deleted',brandId);
     });return json(res,{ok:true});
    }
    if(p==='/api/settings'&&req.method==='PUT'){
     const b=await jsonBody(req),settings=validateSettings(b);settings.production=productionSettings(b.production||store.read().settings.production);
     await store.update(s=>{s.settings=settings;audit(s,'settings.saved','workspace');});
     return json(res,{ok:true});
    }
    if(p==='/api/checks'&&req.method==='POST'){
     const b=await jsonBody(req),text=str(b.text,30000);
     if(!['hook','beats','caption','humanizer','detection','swipe'].includes(b.command))fail('Unknown editorial check.');
     const result=await new Promise((resolve,reject)=>{
      const child=spawn(env.PYTHON||(process.platform==='win32'?'python':'python3'),[path.join(root,'tools','editorial_checks.py'),b.command],{stdio:['pipe','pipe','ignore'],shell:false,windowsHide:true});
      let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Editorial check timed out.'));},5000);
      child.stdout.on('data',chunk=>{output+=chunk;if(output.length>200000){child.kill();reject(new Error('Editorial output limit reached.'));}});
      child.on('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('Install Python 3 or set PYTHON in the server .env file to enable these checks.'),{status:409}));});
      child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Editorial check failed.'));try{resolve(JSON.parse(output));}catch(e){reject(e);}});
      child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({text}));
     });
     return json(res,result);
    }
    if(p==='/api/video-brief'&&req.method==='POST'){
     const b=await jsonBody(req),brief=str(b.brief||'',16000),duration=Number(b.duration),aspect=b.aspect;
     if(!brief)fail('Describe what you want the video to accomplish.');
     if(![5,10].includes(duration)||!['1:1','9:16','16:9'].includes(aspect))fail('Choose a supported video duration and format.');
     if(!['openai','anthropic'].includes(b.provider)||!ready[b.provider])fail('Configure an OpenAI or Claude text model and API key for video brief preparation.',409);
     const job=await store.update(s=>{
      const brand=s.brands.find(x=>x.id===b.brandId);if(!brand)fail('Choose a brand.');
      const config=s.settings.providers[b.provider];if(!config?.model)fail('Choose a text model for this provider in Settings.',409);
      if(s.jobs.filter(j=>['queued','running'].includes(j.status)).length>=10)fail('The queue is full. Wait for a job to finish.',409);
      if(ledger(s).committed+s.settings.reservePerJob>s.settings.monthlyBudget)fail('The budget has no room for the brief preparation reservation.',409);
      const j={id:id(),type:'video-brief',skill:'video-brief',brandId:brand.id,brandSnapshot:structuredClone(brand),title:str(b.title||'Video brief',150),provider:b.provider,config:structuredClone(config),brief,videoBrief:{originalPrompt:brief,duration,aspect},prompt:videoBriefPrompt(brand,brief,duration,aspect),status:'queued',reservation:s.settings.reservePerJob,costEstimate:null,createdAt:now()};s.jobs.push(j);audit(s,'video_brief.queued',j.id);return j;
     });json(res,{id:job.id,status:'queued'},202);setImmediate(()=>pump().catch(e=>console.error('Queue persistence failure:',e.message)));return;
    }
    if(p==='/api/jobs'&&req.method==='POST'){
     const b=await jsonBody(req),skill=skills.find(x=>x.id===b.skill);
     if(!skill||!providers.includes(b.provider))fail('Select a skill and provider.');
     if(skill.requiresWeb&&b.provider!=='perplexity')fail('Trend research requires Perplexity with web search. Choose Perplexity and configure its API key and model in Settings.',409);
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
    if(p==='/api/reconciliations'&&req.method==='POST'){
     const b=await jsonBody(req);const result=await store.update(s=>reconcileDay(s,b));return json(res,result,201);
    }
    if(/^\/api\/reconciliations\/[^/]+\/void$/.test(p)&&req.method==='POST'){
     await store.update(s=>{const r=(s.reconciliations||[]).find(r=>r.id===p.split('/')[3]);if(!r)fail('Daily total not found.',404);if(r.voidedAt)fail('This total was already undone.',409);r.voidedAt=now();audit(s,'cost.day_undone',r.id);});return json(res,{ok:true});
    }
    if(/^\/api\/jobs\/[^/]+\/reconcile$/.test(p)&&req.method==='POST'){
     const b=await jsonBody(req);const cost=Number(b.cost);
     if(!Number.isFinite(cost)||cost<0||cost>100000)fail('Enter the confirmed cost in USD.');
     await store.update(s=>{const j=s.jobs.find(j=>j.id===p.split('/')[3]);if(!j)fail('Job not found.',404);if(['queued','running'].includes(j.status))fail('Wait until the job ends.',409);if((s.reconciliations||[]).some(r=>!r.voidedAt&&r.jobIds.includes(j.id)))fail('This request is included in a daily total. Undo that total before entering an individual cost.',409);j.reconciledCost=cost;audit(s,'job.cost_reconciled',j.id);});
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
      ensureNotScheduled(s,{draftId:d.id});
      if(b.version!==d.version)fail('This draft changed. Reload before saving.',409);
      if(!['draft','needs-review','approved'].includes(b.status))fail('Invalid review status.');
      const text=str(b.text,30000),title=str(b.title,150);if(!title||!text)fail('Title and content are required.');
      d.versions.unshift({text:d.text,title:d.title,status:d.status,version:d.version,at:d.updatedAt});d.versions=d.versions.slice(0,25);
      Object.assign(d,{text,title,status:b.status,version:d.version+1,updatedAt:now(),checks:quality(text,s.brands.find(x=>x.id===d.brandId))});
      audit(s,b.status==='approved'?'draft.approved':'draft.saved',d.id);return d;
     });return json(res,result);
    }
    if(/^\/api\/drafts\/[^/]+$/.test(p)&&req.method==='DELETE'){
     await store.update(s=>{const draftId=p.split('/')[3];if(!s.drafts.some(d=>d.id===draftId))fail('Draft not found.',404);ensureNotScheduled(s,{draftId});s.drafts=s.drafts.filter(d=>d.id!==draftId);audit(s,'draft.deleted',draftId);});
     return json(res,{ok:true});
    }
    if(p==='/api/media'&&req.method==='POST'){
     const mime=(req.headers['content-type']||'').split(';')[0];if(!mediaTypes.has(mime)&&!['font/ttf','font/otf'].includes(mime))fail('Unsupported file format. Use images, MP4, audio, PDF, TXT or TTF/OTF fonts.');
     let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail('Invalid filename.');}name=str(name,250);if(!name)fail('Filename required.');
     const brandId=req.headers['x-brand-id'];if(!store.read().brands.some(b=>b.id===brandId))fail('Select a brand.');
     const bytes=await body(req,MAX_MEDIA);if(!bytes.length)fail('File is empty.');
     const media={id:id(),brandId,name,mime,size:bytes.length,tags:str(req.headers['x-tags']||'',500),createdAt:now()};
     media.file=media.id;media.status='needs-review';media.version=1;media.reviewHistory=[];
     await putMedia(media.file,bytes,mime);
     try{await store.update(s=>{s.media.unshift(media);audit(s,'media.uploaded',media.id);});}
     catch(e){await removeMedia(media.file).catch(()=>{});throw e;}
     return json(res,media,201);
    }
    if(/^\/api\/media\/[^/]+\/thumbnail$/.test(p)&&req.method==='GET'){
     const m=store.read().media.find(m=>m.id===p.split('/')[3]);if(!m)fail('Media not found.',404);
     if(!['image/png','image/jpeg','image/webp','image/gif','video/mp4'].includes(m.mime))fail('Thumbnails are available for images and MP4 videos.');
     const file=path.join(thumbnailDir,m.id+'.png');let bytes;
     try{bytes=await readFile(file);}catch(e){
      if(e.code!=='ENOENT')throw e;
      if(!thumbnailJobs.has(m.id)){
       const job=thumbnailTail.then(async()=>{if(!store.read().media.some(x=>x.id===m.id))fail('Media not found.',404);const png=await thumbnailAsset(await readMedia(m),m.mime,{env,dir:store.dir});await writeFile(file,png,{mode:0o600});return png;});
       thumbnailJobs.set(m.id,job);thumbnailTail=job.catch(()=>{});job.finally(()=>thumbnailJobs.delete(m.id)).catch(()=>{});
      }
      bytes=await thumbnailJobs.get(m.id);
     }
     res.writeHead(200,{'Content-Type':'image/png','Content-Disposition':'inline'});res.end(bytes);return;
    }
    if(/^\/api\/media\/[^/]+$/.test(p)){
     const m=store.read().media.find(m=>m.id===p.split('/')[3]);if(!m)fail('Media not found.',404);
     if(req.method==='PUT'){
      const b=await jsonBody(req);if(!['draft','needs-review','approved'].includes(b.status))fail('Choose a review status.');
      const result=await store.update(s=>{const asset=s.media.find(x=>x.id===m.id);ensureNotScheduled(s,{mediaId:m.id});if((asset.version||1)!==b.version)fail('This asset changed. Reload before saving.',409);const history=asset.reviewHistory||=[];history.unshift({version:asset.version||1,status:asset.status||'needs-review',caption:asset.caption||'',at:now()});asset.reviewHistory=history.slice(0,25);asset.status=b.status;asset.caption=str(b.caption||'',30000);asset.version=(asset.version||1)+1;asset.updatedAt=now();audit(s,'media.'+b.status,asset.id);return asset;});return json(res,result);
     }
     if(req.method==='GET'){
      const bytes=store.mode==='local'?await readFile(path.join(uploads,m.file)):Buffer.from(await(await mediaRequest('GET',m.file)).arrayBuffer());
      res.writeHead(200,{'Content-Type':m.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(m.name)});res.end(bytes);return;
     }
     if(req.method==='DELETE'){
      const snapshot=store.read();ensureNotScheduled(snapshot,{mediaId:m.id});if(snapshot.jobs.some(j=>['queued','running'].includes(j.status)&&j.production&&[j.production.sourceId,j.production.logoId,j.production.fontId].includes(m.id)))fail('This asset is being used by an active media job.',409);
      if(snapshot.media.some(x=>x.sourceId===m.id))fail('This asset has derived versions. Delete those versions first to preserve their source history.',409);
      // Remove the stored file first; failed metadata write remains visible and recoverable.
      await removeMedia(m.file);
      await thumbnailJobs.get(m.id)?.catch(()=>{});await unlink(path.join(thumbnailDir,m.id+'.png')).catch(e=>{if(e.code!=='ENOENT')throw e;});
      await store.update(s=>{s.media=s.media.filter(x=>x.id!==m.id);audit(s,'media.deleted',m.id);});
      return json(res,{ok:true});
     }
    }
    fail('Endpoint not found.',404);
   }
   if(!['GET','HEAD'].includes(req.method))fail('Method not allowed.',405);
   const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
   staticFiles['/calendar.js']=['calendar.js','text/javascript; charset=utf-8'];
   staticFiles['/social.js']=['social.js','text/javascript; charset=utf-8'];
   staticFiles['/production.js']=['production.js','text/javascript; charset=utf-8'];
   staticFiles['/dictation.js']=['dictation.js','text/javascript; charset=utf-8'];
   staticFiles['/thumbnails.js']=['thumbnails.js','text/javascript; charset=utf-8'];
   staticFiles['/timing.js']=['timing.js','text/javascript; charset=utf-8'];
   staticFiles['/planner.js']=['planner.js','text/javascript; charset=utf-8'];
   staticFiles['/analytics.js']=['analytics.js','text/javascript; charset=utf-8'];
   staticFiles['/video-brief.js']=['video-brief.js','text/javascript; charset=utf-8'];
   staticFiles['/reconciliation.js']=['reconciliation.js','text/javascript; charset=utf-8'];
   const entry=staticFiles[p];if(!entry)fail('Not found.',404);
   const data=await readFile(path.join(root,'public',entry[0]));res.writeHead(200,{'Content-Type':entry[1]});res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(!res.headersSent)json(res,{error:e.status?e.message:'Operation failed. Check server configuration and storage availability.'},e.status||500);else res.end();}
 });
 server.on('close',()=>{closing=true;});
 const close=async()=>{closing=true;await new Promise(resolve=>server.listening?server.close(resolve):resolve());while(working)await new Promise(r=>setTimeout(r,25));await thumbnailTail;await store.close();};
 return {server,store,close,pump};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp();
 const port=Number(process.env.PORT||3080);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be between 1024 and 65535.');
 app.server.listen(port,'127.0.0.1',()=>{console.log('Sniff Solution: http://127.0.0.1:'+port);app.pump().catch(e=>console.error(e.message));});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}

