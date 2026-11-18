// Durable, single-attempt publishing worker. Only service-side secrets are used.
import {decryptToken} from './publishing-crypto.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const exact=(value,max=200)=>typeof value==='string'&&value.length>0&&value.length<=max;
const allowed=new Set(['image/jpeg','video/mp4']);
export function createCloudPublisher({url,key,workspaceId,encryptionKey,apiVersion='v27.0',fetcher=fetch,clock=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!/^https:\/\//.test(url)||!key||!workspaceId||!encryptionKey||!/^v\d+\.\d+$/.test(apiVersion))throw Error('Missing publishing configuration.');
 const base=url.replace(/\/$/,'');
 const auth={apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})};
 const storagePath=id=>workspaceId+'/publishing/'+id;
 async function request(path,method='GET',body,headers={}){
  const response=await fetcher(base+path,{method,headers:{...auth,...headers},body,redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Cloud storage request failed ('+response.status+').');
  if(response.status===204)return null;
  const text=await response.text();return text?JSON.parse(text):null;
 }
 async function rows(table,params={},method='GET',data){
  const u=new URL(base+'/rest/v1/'+table);
  for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
  const found=await request(u.pathname+u.search,method,data?JSON.stringify(data):undefined,{'Content-Type':'application/json',Prefer:'return=representation'});
  if(!Array.isArray(found))throw Error('Invalid database response.');
  return found;
 }
 async function event(jobId,type,detail=''){
  await rows('marketing_publish_events',{},'POST',{job_id:jobId,event_type:type,detail:detail.slice(0,500)});
 }
 async function account(job){
  const matches=await rows('marketing_instagram_accounts',{id:'eq.'+job.account_id,workspace_id:'eq.'+workspaceId,brand_id:'eq.'+job.brand_id,status:'eq.connected',select:'instagram_user_id,token_ciphertext,token_expires_at'});
  if(matches.length!==1||!matches[0].token_ciphertext)throw Error('Instagram connection unavailable.');
  const a=matches[0];
  if(a.token_expires_at&&Date.parse(a.token_expires_at)<=clock()+300000)throw Error('Instagram credential expired. Reconnect first.');
  return {instagramId:a.instagram_user_id,token:decryptToken(a.token_ciphertext,encryptionKey,[workspaceId,job.brand_id,a.instagram_user_id].join(':'))};
 }
 async function graph(path,token,params,method='POST'){
  const baseURL='https://graph.facebook.com/'+apiVersion+'/'+path;
  const form=new URLSearchParams(params);
  const u=method==='GET'?baseURL+'?'+form.toString():baseURL;
  const res=await fetcher(u,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:form}:{}) ,redirect:'error',signal:AbortSignal.timeout(30000)});
  let data;try{data=await res.json();}catch{throw Error('Instagram returned an invalid response.');}
  if(!res.ok||data.error)throw Error('Instagram rejected the publishing request'+(data.error?.code?' (code '+Number(data.error.code)+')':'')+'.');
  return data;
 }
 async function patch(jobId,filter,fields){
  const result=await rows('marketing_publish_jobs',{workspace_id:'eq.'+workspaceId,id:'eq.'+jobId,...filter,select:'*'},'PATCH',{...fields,updated_at:new Date(clock()).toISOString()});
  return result.length===1?result[0]:null;
 }
 async function stage(jobId,mime,bytes){
  if(!uuid.test(jobId)||!allowed.has(mime)||!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>100*1024*1024)throw Error('Invalid staged media.');
  const storage=storagePath(jobId);
  // Upload only after explicit account owner's activation request. No public bucket ACLs.
  const parts=storage.split('/').map(encodeURIComponent).join('/');
  const response=await fetcher(base+'/storage/v1/object/marketing-media/'+parts,{method:'POST',headers:{...auth,'Content-Type':mime,'Cache-Control':'no-cache','x-upsert':'false'},body:bytes,redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Media staging failed ('+response.status+').');
  return {storagePath:storage};
 }
 async function enqueue(b){
  if(!b||!uuid.test(b.id)||!uuid.test(b.accountId)||!exact(b.brandId)||!exact(b.assetId)||!allowed.has(b.mime)||!exact(b.caption,2200)||!Number.isInteger(b.assetVersion)||b.assetVersion<1||!exact(b.timezone,100)||!Number.isFinite(Date.parse(b.scheduledAt))||!uuid.test(b.id))throw Error('Invalid publication request.');
  if(b.scheduledAt!==new Date(b.scheduledAt).toISOString()||Date.parse(b.scheduledAt)<clock()+120000||Date.parse(b.scheduledAt)>clock()+366*86400000)throw Error('Choose a publication at least two minutes in the future.');
  const a=await account({account_id:b.accountId,brand_id:b.brandId});
  if(!/^\d+$/.test(a.instagramId))throw Error('Invalid Instagram account.');
  const storage=storagePath(b.id);
  const prepared={id:b.id,workspace_id:workspaceId,brand_id:b.brandId,account_id:b.accountId,asset_id:b.assetId,asset_version:b.assetVersion,storage_path:storage,format:b.mime==='video/mp4'?'reel':'image',caption:b.caption,scheduled_at:b.scheduledAt,time_zone:b.timezone,status:'scheduled',attempts:0};
  // Verify the staged object exists, but never expose its private data to callers.
  const path=storage.split('/').map(encodeURIComponent).join('/');
  const existing=await fetcher(base+'/storage/v1/object/info/marketing-media/'+path,{method:'GET',headers:auth,signal:AbortSignal.timeout(15000)});
  if(!existing.ok)throw Error('Approved media must be staged before activation.');
  const inserted=await rows('marketing_publish_jobs',{select:'*'},'POST',prepared);
  if(inserted.length!==1)throw Error('Could not create scheduled publication.');
  await event(b.id,'scheduled','Scheduled through owner-approved desktop application.');
  return {id:b.id,status:'scheduled'};
 }
 async function cancel(jobId){
  if(!uuid.test(jobId))throw Error('Invalid publication id.');
  const item=await patch(jobId,{status:'in.(scheduled,queued)'},{status:'cancelled'});
  if(!item)throw Error('Publication has already started or has changed. Refresh its status.');
  await event(jobId,'cancelled');
  return {id:jobId,status:'cancelled'};
 }
 async function list(){
  const jobs=await rows('marketing_publish_jobs',{workspace_id:'eq.'+workspaceId,select:'id,brand_id,account_id,status,scheduled_at,published_at,instagram_media_id,last_error,container_id',order:'created_at.desc'});
  // Meta media IDs aren't Instagram post URLs. Resolve only a verified permalink.
  // Never fail the entire history when Graph is unavailable or a token expires.
  for(const job of jobs.filter(x=>x.status==='published'&&/^\d+$/.test(x.instagram_media_id||''))){
   try{
    const {token}=await account(job);
    const result=await graph(job.instagram_media_id,token,{fields:'permalink'},'GET');
    if(typeof result.permalink==='string'&&/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(result.permalink))job.permalink=result.permalink;
   }catch{ /* Preserve published proof even if permalink retrieval fails. */ }
  }
  return jobs;
 }
 async function signedUrl(storage){
  if(!storage.startsWith(workspaceId+'/publishing/'))throw Error('Unexpected media location.');
  const path=storage.split('/').map(encodeURIComponent).join('/');
  const data=await request('/storage/v1/object/sign/marketing-media/'+path,'POST',JSON.stringify({expiresIn:3600}),{'Content-Type':'application/json'});
  const signed=data?.signedURL||data?.signedUrl;
  if(typeof signed!=='string')throw Error('Media link generation failed.');
  const resolved=new URL(signed.startsWith('/object/')?'/storage/v1'+signed:signed,base+'/storage/v1/');
  if(resolved.origin!==new URL(base).origin||!resolved.pathname.includes('/object/sign/marketing-media/'))throw Error('Invalid signed media link.');
  return resolved.href;
 }
 async function runOne(job){
  const claimed=await patch(job.id,{status:'eq.scheduled',attempts:'eq.0'},{status:'publishing',attempts:1});
  if(!claimed)return false; // Concurrent worker lost the CAS claim.
  try{
   const {instagramId,token}=await account(claimed);
   const mediaURL=await signedUrl(claimed.storage_path);
   const params=claimed.format==='image'?{image_url:mediaURL,caption:claimed.caption}:{media_type:'REELS',video_url:mediaURL,caption:claimed.caption,share_to_feed:'true'};
   const container=await graph(instagramId+'/media',token,params);
   if(!/^\d+$/.test(container.id||''))throw Error('Meta did not return a container ID.');
   await patch(job.id,{status:'eq.publishing'},{container_id:container.id});
   if(claimed.format==='reel'){
    let ready=false;
    for(let i=0;i<15;i++){
     const state=await graph(container.id,token,{fields:'status_code'},'GET');
     if(state.status_code==='FINISHED'){ready=true;break;}
     if(state.status_code==='ERROR'||state.status_code==='EXPIRED')throw Error('Instagram could not process the video.');
     await sleep(4000);
    }
    if(!ready)throw Error('Video processing not finished. Verify before attempting another publication.');
   }
   // Once this request is sent, failures must never trigger automatic re-publishing.
   const posted=await graph(instagramId+'/media_publish',token,{creation_id:container.id});
   if(!/^\d+$/.test(posted.id||''))throw Error('Instagram returned no confirmed media ID. Verify manually.');
   await patch(job.id,{status:'eq.publishing'},{status:'published',instagram_media_id:posted.id,published_at:new Date(clock()).toISOString(),last_error:null});
   await event(job.id,'published','Instagram media ID '+posted.id);
  }catch(e){
   await patch(job.id,{status:'eq.publishing'},{status:'needs_reconciliation',last_error:String(e.message||'Uncertain outcome.').slice(0,300)}).catch(()=>{});
   await event(job.id,'needs_reconciliation','No automated retry; check Instagram for an existing post.').catch(()=>{});
  }
  return true;
 }
 let running=false;
 async function pump(){
  if(running)return 0;
  running=true;
  try{
   const due=await rows('marketing_publish_jobs',{workspace_id:'eq.'+workspaceId,status:'eq.scheduled',scheduled_at:'lte.'+new Date(clock()).toISOString(),order:'scheduled_at.asc',limit:'5',select:'*'});
   for(const job of due)await runOne(job);
   return due.length;
  }finally{running=false;}
 }
 return {stage,enqueue,cancel,list,pump,runOne,storagePath};
}
