export function createSocialRepository({url,key,fetcher=fetch}){
 const endpoint=new URL('/rest/v1/marketing_instagram_accounts',url);
 if(endpoint.protocol!=='https:'||!key)throw new Error('Invalid backend configuration.');
 const headers={apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'};
 const fields='id,brand_id,instagram_user_id,username,status,token_expires_at,updated_at';
 async function request(params,method='GET',body){
  const target=new URL(endpoint);target.search=new URLSearchParams(params);
  const res=await fetcher(target,{method,headers:{...headers,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error('Social account storage request failed.');
  const rows=await res.json();if(!Array.isArray(rows))throw new Error('Invalid account response.');return rows;
 }
 return {
  list(workspaceId){return request({workspace_id:'eq.'+workspaceId,select:fields,order:'username.asc'});},
  async disconnect(workspaceId,brandId,accountId){
   if(typeof brandId!=='string'||!brandId||! /^[0-9a-f-]{36}$/i.test(accountId))throw new Error('Invalid account.');
   const rows=await request({workspace_id:'eq.'+workspaceId,brand_id:'eq.'+brandId,id:'eq.'+accountId,select:'id'},'PATCH',{status:'disconnected',token_ciphertext:null,token_expires_at:null,updated_at:new Date().toISOString()});
   if(rows.length!==1)throw new Error('Account not found.');
  }
 };
}
