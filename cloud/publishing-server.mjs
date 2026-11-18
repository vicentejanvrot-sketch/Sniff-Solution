// Separate public cloud process; never imports or exposes the desktop server.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createSocialRepository} from '../lib/social-repository.mjs';
import {metaLoginUrl} from '../lib/meta-login.mjs';
import {createPublishingStateStore} from '../lib/publishing-state-store.mjs';
import {createMetaClient,createAccountWriter,completeMetaConnection} from '../lib/meta-connection.mjs';
const digest=s=>createHash('sha256').update(s).digest();
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(digest(a),digest(b));
export function connectionConfig(env){
 if(env.META_AUTH_ENABLED!=='true')return null;
 const {META_APP_ID:appId,META_CONFIGURATION_ID:configurationId,META_REDIRECT_URI:redirectUri,META_APP_SECRET:appSecret,META_GRAPH_API_VERSION:apiVersion,SUPABASE_URL:url,SUPABASE_SECRET_KEY:key,PUBLISHING_TOKEN_ENCRYPTION_KEY:encryptionKey,PUBLISHING_OWNER_KEY:ownerKey}=env;
 if(!ownerKey||ownerKey.length<32||! /^[A-Za-z0-9+/]{43}=$/.test(encryptionKey||''))throw new Error('Authorization secrets are incomplete.');
 if(!/^\d+$/.test(appId)||!/^\d+$/.test(configurationId)||redirectUri!=='https://sniff-publishing.onrender.com/auth/meta/callback')throw new Error('Invalid Meta configuration.');
 return {appId,configurationId,redirectUri,encryptionKey,ownerKey,workspaceId:env.WORKSPACE_ID||'developer',
 states:createPublishingStateStore({url,key}),meta:createMetaClient({appId,appSecret,redirectUri,apiVersion}),saveAccount:createAccountWriter({url,key}),accounts:createSocialRepository({url,key})};
}
export function createPublishingServer({connection=null}={}){
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  const url=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&url.pathname==='/healthz')return send(200,{ok:true,service:'sniff-publishing',publishingEnabled:false});
  if(url.pathname==='/api/social/accounts'||url.pathname==='/api/social/disconnect'){
   if(!connection)return send(503,{error:'Instagram authorization is not activated.'});
   if(!equal(req.headers.authorization,'Bearer '+connection.ownerKey))return send(401,{error:'Unauthorized'});
   try{
    if(req.method==='GET'&&url.pathname==='/api/social/accounts')return send(200,{accounts:await connection.accounts.list(connection.workspaceId)});
    if(req.method==='POST'&&url.pathname==='/api/social/disconnect'){
     if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required'});
     let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>8192)return send(413,{error:'Request too large'});chunks.push(chunk);}
     const {accountId,brandId}=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     await connection.accounts.disconnect(connection.workspaceId,brandId,accountId);
     return send(200,{ok:true});
    }
    return send(405,{error:'Method not allowed'});
   }catch{return send(400,{error:'Social account operation failed.'});}
  }
  if(req.method==='POST'&&url.pathname==='/auth/meta/start'){
   if(!connection)return send(503,{error:'Instagram authorization is not activated.'});
   if(!equal(req.headers.authorization,'Bearer '+connection.ownerKey))return send(401,{error:'Unauthorized'});
   try{
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required'});
    let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>8192){return send(413,{error:'Request too large'});}chunks.push(chunk);}
    const {brandId,expectedUsername}=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const state=await connection.states.issue({workspaceId:connection.workspaceId,brandId,expectedUsername});
    return send(200,{loginUrl:metaLoginUrl({...connection,state})});
   }catch{return send(400,{error:'Could not start Instagram authorization.'});}
  }
  if(req.method==='GET'&&url.pathname==='/auth/meta/callback'){
   if(!connection)return send(503,{error:'Instagram authorization is not activated.'});
   const state=url.searchParams.get('state'),code=url.searchParams.get('code');
   if(url.searchParams.has('error')||!code||url.searchParams.getAll('code').length!==1||url.searchParams.getAll('state').length!==1){return send(400,{error:'Authorization cancelled or invalid.'});}
   try{
    const result=await completeMetaConnection({state,code,states:connection.states,meta:connection.meta,saveAccount:connection.saveAccount,encryptionKey:connection.encryptionKey});
    return send(200,{...result,message:'Instagram connected. Return to Sniff Solution.'});
   }catch{return send(400,{error:'Instagram connection failed. Start a new connection in Sniff Solution.'});}
  }
  return send(404,{error:'Not found'});
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createPublishingServer({connection:connectionConfig(process.env)});
 server.listen(Number(process.env.PORT||10000),'0.0.0.0');
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
