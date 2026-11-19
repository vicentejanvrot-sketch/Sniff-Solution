const origin='https://sniff-publishing.onrender.com';
export function desktopPublishing({env,fetcher=fetch}){
 const key=env.PUBLISHING_OWNER_KEY;
 const configured=typeof key==='string'&&key.length>=32;
 async function call(path,method,body){
  if(!configured)throw Object.assign(new Error('Configure PUBLISHING_OWNER_KEY in the local desktop server settings and restart.'),{status:409});
  let result;
  try{
   result=await fetcher(origin+path,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(90000)});
  }catch{throw Object.assign(new Error('Publishing cloud service unavailable.'),{status:503});}
  if(!result.ok){let message;if(path.startsWith('/api/engagement/')){try{message=(await result.json()).error;}catch{}}throw Object.assign(new Error(message|| (path.startsWith('/api/engagement/')?'Research/inbox unavailable. Update the cloud service and engagement schema.':path.startsWith('/api/insights/')?'Insights unavailable. Install the Phase 4 cloud update and schema, enable INSIGHTS_ENABLED, and verify Meta Insights permissions.':result.status===503?'Instagram authorization is not enabled on the cloud service.':'Publishing service rejected the request.')),{status:[409,429,503].includes(result.status)?result.status:400});}
  return result.json();
 }
 return {configured,
 async connect(brandId,expectedUsername){
  const result=await call('/auth/meta/start','POST',{brandId,expectedUsername});
  const url=new URL(result.loginUrl);
  if(url.origin!=='https://www.facebook.com'||url.pathname!=='/dialog/oauth')throw new Error('Invalid authorization URL.');
  return {loginUrl:url.href};
 },
 async accounts(){return call('/api/social/accounts','GET');},
 async disconnect(accountId,brandId){return call('/api/social/disconnect','POST',{accountId,brandId});},
 async insights(){return call('/api/insights/snapshots','GET');},
 async research(b){return call('/api/engagement/research','POST',b);},
 async inbox(accountId){return call('/api/engagement/inbox?accountId='+encodeURIComponent(accountId),'GET');},
 async syncInbox(accountId){return call('/api/engagement/sync','POST',{accountId});},
 async saveReply(b){return call('/api/engagement/reply','POST',b);},
 async sendReply(b){return call('/api/engagement/send','POST',b);},
 async syncInsights(accountId){return call('/api/insights/sync','POST',{accountId});},
 async jobs(){return call('/api/publishing/jobs','GET');},
 async health(){return call('/api/publishing/health','GET');},
 async history(id){return call('/api/publishing/history?id='+encodeURIComponent(id),'GET');},
 async retry(id){return call('/api/publishing/retry','POST',{id});},
 async enqueue(b){return call('/api/publishing/enqueue','POST',b);},
 async cancel(id){return call('/api/publishing/cancel','POST',{id});},
 async stage(id,mime,bytes){
  if(!configured)throw Object.assign(new Error('Configure the publishing owner key.'),{status:409});
  if(!Buffer.isBuffer(bytes)||bytes.length>100*1024*1024||!['image/jpeg','video/mp4'].includes(mime))throw Object.assign(new Error('Invalid approved media.'),{status:400});
  let response;try{response=await fetcher(origin+'/api/publishing/stage',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':mime,'X-Publication-Id':id},body:bytes,redirect:'error',signal:AbortSignal.timeout(150000)});}catch{throw Object.assign(new Error('Cloud staging outcome is uncertain. Check cloud publishing history before retrying.'),{status:503});}
  if(!response.ok)throw Object.assign(new Error('Cloud staging failed ('+response.status+').'),{status:response.status});
  return response.json();
 }
 };
}
