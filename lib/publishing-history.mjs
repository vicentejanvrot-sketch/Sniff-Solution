// Cloud publishing is authoritative for activated posts; never regress a terminal result.
const statuses=new Set(['scheduled','queued','publishing','published','failed','cancelled','needs_reconciliation']);
const terminal=new Set(['published','failed','cancelled','needs_reconciliation']);
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
export function verifiedInstagramPermalink(value){
 if(typeof value!=='string'||value.length>500)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||!['www.instagram.com','instagram.com'].includes(url.hostname)||!/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)||url.search||url.hash)return null;
  return url.href;
 }catch{return null;}
}
export function reconcilePublication(local,remote){
 if(!local||!remote||local.id!==remote.id||!statuses.has(remote.status))return {changed:false,statusTransition:null};
 // Records without a cloud activation must never become remotely controlled.
 if(!local.activationState)return {changed:false,statusTransition:null};
 // Published results are permanent; a stale cloud read must never hide the evidence.
 if(local.status==='published'&&remote.status!=='published')return {changed:false,statusTransition:null};
 if(terminal.has(local.status)&&!terminal.has(remote.status))return {changed:false,statusTransition:null};
 const before=local.cloudStatus||local.status;
 const fields={
  cloudStatus:remote.status,
  status:terminal.has(remote.status)?remote.status:local.status,
  activationState:'active',
  instagramMediaId:typeof remote.instagram_media_id==='string'&&/^\d{5,30}$/.test(remote.instagram_media_id)?remote.instagram_media_id:(local.instagramMediaId||null),
  publishedAt:iso(remote.published_at)||(local.publishedAt||null),
  permalink:verifiedInstagramPermalink(remote.permalink)||(local.permalink||null),
  lastError:remote.last_error===null?null:typeof remote.last_error==='string'?remote.last_error.slice(0,300):(local.lastError||null),
  containerId:typeof remote.container_id==='string'&&/^\d{5,30}$/.test(remote.container_id)?remote.container_id:(local.containerId||null)
 };
 // A positive Instagram ID and timestamp are necessary to treat an item as Published.
 if(fields.cloudStatus==='published'&&(!fields.instagramMediaId||!fields.publishedAt)){
  fields.cloudStatus='needs_reconciliation';fields.status='needs_reconciliation';fields.lastError='Cloud reported Published without a confirmed Instagram media ID and publish time.';
 }
 const transition=before!==fields.cloudStatus?{from:before,to:fields.cloudStatus}:null;
 const changed=Object.entries(fields).some(([key,value])=>local[key]!==value);
 if(changed)Object.assign(local,fields);
 return {changed,statusTransition:transition};
}
