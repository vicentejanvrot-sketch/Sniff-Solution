import {randomBytes,createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
export function createPublishingStateStore({url,key,fetcher=fetch}){
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!key)throw new Error('Invalid backend configuration.');
 async function request(path,body){
  const res=await fetcher(new URL('/rest/v1/'+path,base),{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error('Authorization database request failed.');
  return res.status===204||res.headers.get('content-length')==='0'?null:await res.text().then(s=>s?JSON.parse(s):null);
 }
 return {
  async issue({workspaceId,brandId,expectedUsername}){
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(workspaceId)||typeof brandId!=='string'||!brandId||brandId.length>200||! /^[a-zA-Z0-9._]{1,30}$/.test(expectedUsername))throw new Error('Invalid connection context.');
   const state=randomBytes(32).toString('base64url');
   await request('marketing_oauth_states',{state_hash:digest(state),workspace_id:workspaceId,brand_id:brandId,expected_username:expectedUsername.toLowerCase()});
   return state;
  },
  async consume(state){
   if(typeof state!=='string'||! /^[a-zA-Z0-9_-]{43}$/.test(state))return null;
   const rows=await request('rpc/marketing_consume_oauth_state',{p_hash:digest(state)});
   if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid authorization database response.');
   return rows[0]??null;
  }
 };
}
