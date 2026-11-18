import {decryptToken} from './publishing-crypto.mjs';
const count=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export function metricValue(data,name){
 const row=Array.isArray(data?.data)?data.data.find(x=>x.name===name):null;
 return count(row?.total_value?.value??row?.values?.[0]?.value);
}
export const mediaMetrics=['views','reach','likes','comments','saved','shares'];
export function createInsights({url,key,workspaceId,encryptionKey,apiVersion='v27.0',fetcher=fetch,clock=Date.now}){
 if(!/^https:\/\//.test(url)||!key||!workspaceId||!encryptionKey||!/^v\d+\.\d+$/.test(apiVersion))throw Error('Invalid Insights configuration.');
 const headers={apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'};
 let running=false;
 async function rows(table,params={},method='GET',data,prefer='return=representation'){
  const target=new URL('/rest/v1/'+table,url);target.search=new URLSearchParams(params);
  const res=await fetcher(target,{method,headers:{...headers,Prefer:prefer},body:data===undefined?undefined:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('Insights storage unavailable. Check the Phase 4 schema and backend credentials.');
  return res.status===204?[]:res.json();
 }
 async function graph(path,token,params){
  const target=new URL('https://graph.facebook.com/'+apiVersion+'/'+path);target.search=new URLSearchParams(params);
  let res;try{res=await fetcher(target,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(Error('Instagram Insights service unavailable. Will retry on the next synchronization.'),{fatal:true});}
  let data;try{data=await res.json();}catch{throw Object.assign(Error('Instagram returned an invalid Insights response.'),{fatal:true});}
  if(!res.ok||data.error){
   const code=Number(data.error?.code),fatal=res.status===429||res.status>=500||[4,17,32,613,190,10,200].includes(code);
   const message=code===190?'Instagram authorization expired. Reconnect the account.':[10,200].includes(code)?'Insights access was rejected. Add instagram_manage_insights to the existing Meta login configuration and reconnect the account.':res.status===429||[4,17,32,613].includes(code)?'Instagram rate limit reached. Synchronization will retry later.':'Metric unavailable for this content or API version.';
   throw Object.assign(Error(message),{fatal});
  }return data;
 }
 async function collect(account){
  if(!/^\d+$/.test(account.instagram_user_id)||!account.token_ciphertext)throw Error('Instagram account connection unavailable.');
  if(account.token_expires_at&&Date.parse(account.token_expires_at)<=clock()+300000)throw Error('Instagram authorization expired. Reconnect the account.');
  const token=decryptToken(account.token_ciphertext,encryptionKey,[workspaceId,account.brand_id,account.instagram_user_id].join(':'));
  const capturedAt=new Date(clock()).toISOString(),end=Math.floor(Date.parse(capturedAt.slice(0,10))/1000),start=end-86400,day=new Date(start*1000).toISOString().slice(0,10);
  const snapshots=[],warnings=[];
  async function metrics(objectId,names,params={}){const values={};for(const name of names){try{values[name]=metricValue(await graph(objectId+'/insights',token,{metric:name,...params}),name);}catch(e){if(e.fatal)throw e;values[name]=null;warnings.push(name+': unavailable');}}return values;}
  const accountMetrics=await metrics(account.instagram_user_id,['views','reach','total_interactions'],{period:'day',metric_type:'total_value',since:String(start),until:String(end)});
  let followers=null;try{followers=count((await graph(account.instagram_user_id,token,{fields:'followers_count'})).followers_count);}catch(e){if(e.fatal)throw e;warnings.push('Follower count unavailable');}
  snapshots.push({kind:'account',accountId:account.id,brandId:account.brand_id,username:account.username,capturedAt,day,period:'UTC day',metrics:accountMetrics,followers});
  const jobs=await rows('marketing_publish_jobs',{workspace_id:'eq.'+workspaceId,account_id:'eq.'+account.id,status:'eq.published',published_at:'gte.'+new Date(clock()-90*86400000).toISOString(),order:'published_at.desc',limit:'20',select:'id,instagram_media_id,published_at,format,caption'});
  for(const job of jobs){
   if(!/^\d+$/.test(job.instagram_media_id||''))continue;
   const metricsForPost=await metrics(job.instagram_media_id,mediaMetrics);
   snapshots.push({kind:'media',accountId:account.id,brandId:account.brand_id,username:account.username,mediaId:job.instagram_media_id,publicationId:job.id,format:job.format,publishedAt:job.published_at,caption:job.caption,capturedAt,day:capturedAt.slice(0,10),period:'lifetime',metrics:metricsForPost});
  }
  return {snapshots,warnings:[...new Set(warnings)]};
 }
 async function list(){return rows('marketing_insights',{workspace_id:'eq.'+workspaceId,select:'account_id,brand_id,document,last_attempt_at,last_success_at,next_sync_at,last_error',order:'account_id.asc'});}
 async function sync(accountId,{force=false}={}){
  if(running)return {busy:true};running=true;
  try{
   const accounts=await rows('marketing_instagram_accounts',{workspace_id:'eq.'+workspaceId,status:'eq.connected',...(accountId?{id:'eq.'+accountId}:{}),select:'id,brand_id,instagram_user_id,username,token_ciphertext,token_expires_at',order:'id.asc',limit:'100'});
   if(accountId&&accounts.length!==1)throw Error('Connected account not found.');
   let processed=0;
   for(const a of accounts){
    const filter={workspace_id:'eq.'+workspaceId,account_id:'eq.'+a.id};
    let existing=(await rows('marketing_insights',filter))[0];
    if(!existing){await rows('marketing_insights',{on_conflict:'workspace_id,account_id'},'POST',{workspace_id:workspaceId,account_id:a.id,brand_id:a.brand_id},'resolution=ignore-duplicates,return=representation');existing=(await rows('marketing_insights',filter))[0];}
    if(!existing)throw Error('Insights initialization failed.');
    const current=clock();if(current<Date.parse(force?new Date(Date.parse(existing.last_attempt_at||0)+300000).toISOString():existing.next_sync_at||0))continue;
    // Compare-and-swap claim protects shared deployments and concurrent manual refreshes.
    const revision=existing.revision+1,claimed=await rows('marketing_insights',{...filter,revision:'eq.'+existing.revision},'PATCH',{revision,last_attempt_at:new Date(current).toISOString(),next_sync_at:new Date(current+6*3600000).toISOString()});
    if(claimed.length!==1)continue;
    try{
     const result=await collect(a),old=existing.document?.snapshots||[],keys=new Set(result.snapshots.map(s=>[s.kind,s.mediaId||'',s.day].join(':')));
     const snapshots=[...old.filter(s=>!keys.has([s.kind,s.mediaId||'',s.day].join(':'))),...result.snapshots].filter(s=>Date.parse(s.capturedAt)>current-366*86400000).slice(-8000);
     await rows('marketing_insights',{...filter,revision:'eq.'+revision},'PATCH',{document:{snapshots,warnings:result.warnings},last_success_at:new Date(clock()).toISOString(),last_error:null});
    }catch(e){await rows('marketing_insights',{...filter,revision:'eq.'+revision},'PATCH',{last_error:e.message});}
    processed++;
    if(!accountId)break; // One account per worker tick; publishing always runs first.
   }
   return {processed};
  }finally{running=false;}
 }
 return {list,sync};
}
