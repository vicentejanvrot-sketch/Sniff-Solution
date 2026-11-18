import {randomBytes,createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function metaLoginUrl({appId,configurationId,redirectUri,state}){
 if(!/^\d+$/.test(appId)||!/^\d+$/.test(configurationId)||!state)throw new Error('Missing Meta configuration.');
 const redirect=new URL(redirectUri);
 if(redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.hash||redirect.search)throw new Error('Invalid redirect URI.');
 const url=new URL('https://www.facebook.com/dialog/oauth');
 url.search=new URLSearchParams({client_id:appId,config_id:configurationId,display:'popup',override_default_response_type:'true',redirect_uri:redirect.href,response_type:'code',state,prompt:'login'}).toString();
 return url.href;
}
// In-memory reference implementation for testing only. Production state must be durable.
export class LoginStates {
 constructor({clock=Date.now,ttlMs=600000}={}){this.clock=clock;this.ttlMs=ttlMs;this.entries=new Map();}
 issue(context){
  if(!context?.workspaceId||!context?.brandId)throw new Error('Owner and brand context required.');
  const now=this.clock();
  for(const [key,row] of this.entries)if(row.expiresAt<=now)this.entries.delete(key);
  if(this.entries.size>=1000)throw new Error('Too many pending connections.');
  const state=randomBytes(32).toString('base64url');
  this.entries.set(digest(state),{context:structuredClone(context),expiresAt:now+this.ttlMs});return state;
 }
 consume(state){
  if(typeof state!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(state))return null;
  const key=digest(state),row=this.entries.get(key);this.entries.delete(key);
  return row&&row.expiresAt>this.clock()?row.context:null;
 }
}
