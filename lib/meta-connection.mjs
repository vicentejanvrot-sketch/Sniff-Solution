import {encryptToken} from './publishing-crypto.mjs';
export function createMetaClient({appId,appSecret,redirectUri,apiVersion,fetcher=fetch}){
 if(!/^\d+$/.test(appId)||!appSecret||!/^v\d+\.\d+$/.test(apiVersion)||new URL(redirectUri).protocol!=='https:')throw new Error('Meta configuration incomplete.');
 const base='https://graph.facebook.com/'+apiVersion+'/';
 async function request(path,params,token){
  const url=new URL(path,base);url.search=new URLSearchParams(params);
  const res=await fetcher(url,{headers:token?{Authorization:'Bearer '+token}:{},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error('Meta request rejected.');
  const data=await res.json();if(data.error)throw new Error('Meta request rejected.');return data;
 }
 return {
  async exchange(code){
   if(typeof code!=='string'||!code||code.length>8192)throw new Error('Invalid authorization code.');
   const data=await request('oauth/access_token',{client_id:appId,client_secret:appSecret,redirect_uri:redirectUri,code});
   if(typeof data.access_token!=='string'||!data.access_token)throw new Error('Missing access token.');
   return {token:data.access_token};
  },
  async accounts(token){
   const result=await request('me/assigned_instagram_accounts',{fields:'id,username',limit:'100'},token);
   if(!Array.isArray(result.data)||result.paging?.next)throw new Error('Account discovery incomplete.');
   return result.data.filter(a=>typeof a.id==='string'&&/^\d+$/.test(a.id)&&typeof a.username==='string');
  }
 };
}
export async function completeMetaConnection({state,code,states,meta,saveAccount,encryptionKey}){
 const context=await states.consume(state);
 if(!context)throw new Error('Authorization expired or invalid.');
 const {token}=await meta.exchange(code);
 const accounts=await meta.accounts(token);
 const matches=accounts.filter(a=>a.username.toLowerCase()===context.expected_username.toLowerCase());
 if(matches.length!==1)throw new Error('Expected Instagram account could not be uniquely verified.');
 const account=matches[0];
 const binding=[context.workspace_id,context.brand_id,account.id].join(':');
 await saveAccount({workspace_id:context.workspace_id,brand_id:context.brand_id,instagram_user_id:account.id,username:account.username,status:'connected',token_ciphertext:encryptToken(token,encryptionKey,binding),token_expires_at:null,updated_at:new Date().toISOString()});
 return {username:account.username,status:'connected'};
}
export function createAccountWriter({url,key,fetcher=fetch}){
 const endpoint=new URL('/rest/v1/marketing_instagram_accounts',url);
 if(endpoint.protocol!=='https:'||!key)throw new Error('Backend configuration incomplete.');
 endpoint.searchParams.set('on_conflict','workspace_id,brand_id,instagram_user_id');
 return async row=>{
  const res=await fetcher(endpoint,{method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error('Account persistence failed.');
 };
}
