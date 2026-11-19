import {createInsights} from '../lib/insights.mjs';
import {createEngagement,verifyMetaSignature} from '../lib/engagement.mjs';
// Separate public cloud process; never imports or exposes the desktop server.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createSocialRepository} from '../lib/social-repository.mjs';
import {createCloudPublisher} from '../lib/publish-cloud.mjs';
import {metaLoginUrl} from '../lib/meta-login.mjs';
import {createPublishingStateStore} from '../lib/publishing-state-store.mjs';
import {createMetaClient,createAccountWriter,completeMetaConnection} from '../lib/meta-connection.mjs';
const digest=s=>createHash('sha256').update(s).digest();
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(digest(a),digest(b));
export function verifiedCronWake(headers,key,now=Date.now()){
 const ts=headers['x-sniff-timestamp'];
 const signature=headers['x-sniff-signature'];
 if(typeof key!=='string'||key.length<32||typeof ts!=='string'||!/^[0-9]{10,13}$/.test(ts)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;
 const epoch=Number(ts)*1000;
 if(!Number.isSafeInteger(epoch)||Math.abs(now-epoch)>120000)return false;
 const expected=createHmac('sha256',key).update(ts+'.{}').digest('hex');
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex'));
}
export function connectionConfig(env){
 if(env.META_AUTH_ENABLED!=='true')return null;
 const {META_APP_ID:appId,META_CONFIGURATION_ID:configurationId,META_REDIRECT_URI:redirectUri,META_APP_SECRET:appSecret,META_GRAPH_API_VERSION:apiVersion,SUPABASE_URL:url,SUPABASE_SECRET_KEY:key,PUBLISHING_TOKEN_ENCRYPTION_KEY:encryptionKey,PUBLISHING_OWNER_KEY:ownerKey}=env;
 if(!ownerKey||ownerKey.length<32||! /^[A-Za-z0-9+/]{43}=$/.test(encryptionKey||''))throw new Error('Authorization secrets are incomplete.');
 if(!/^\d+$/.test(appId)||!/^\d+$/.test(configurationId)||redirectUri!=='https://sniff-publishing.onrender.com/auth/meta/callback')throw new Error('Invalid Meta configuration.');
 return {appId,configurationId,redirectUri,encryptionKey,ownerKey,appSecret,webhookVerifyToken:createHmac('sha256',appSecret).update('sniff-instagram-webhook:'+(env.WORKSPACE_ID||'developer')).digest('hex'),workspaceId:env.WORKSPACE_ID||'developer',
 engagement:env.ENGAGEMENT_ENABLED==='true'?createEngagement({url,key,workspaceId:env.WORKSPACE_ID||'developer',encryptionKey,apiVersion}):null,
 states:createPublishingStateStore({url,key}),meta:createMetaClient({appId,appSecret,redirectUri,apiVersion}),saveAccount:createAccountWriter({url,key}),accounts:createSocialRepository({url,key}),insights:env.INSIGHTS_ENABLED==='true'?createInsights({url,key,workspaceId:env.WORKSPACE_ID||'developer',encryptionKey,apiVersion}):null,publishingEnabled:env.PUBLISHING_ENABLED==='true',publisher:createCloudPublisher({url,key,workspaceId:env.WORKSPACE_ID||'developer',encryptionKey,apiVersion})};
}
export function createPublishingServer({connection=null}={}){
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  const url=new URL(req.url||'/','http://localhost');
  if(req.method==='GET'&&url.pathname==='/healthz')return send(200,{ok:true,service:'sniff-publishing',publishingEnabled:connection?.publishingEnabled===true});
  if(url.pathname==='/webhooks/instagram'){
   if(!connection?.engagement)return send(503,{error:'Engagement is disabled.'});
   if(req.method==='GET'){
    if(url.searchParams.get('hub.mode')!=='subscribe'||!equal(url.searchParams.get('hub.verify_token'),connection.webhookVerifyToken)||!/^\d{1,100}$/.test(url.searchParams.get('hub.challenge')||''))return send(403,{error:'Verification rejected.'});
    res.writeHead(200,{'Content-Type':'text/plain'});return res.end(url.searchParams.get('hub.challenge'));
   }
   if(req.method!=='POST')return send(405,{error:'Method not allowed'});
   let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>1000000)return send(413,{error:'Request too large'});chunks.push(c);}const raw=Buffer.concat(chunks);
   if(!verifyMetaSignature(raw,req.headers['x-hub-signature-256'],connection.appSecret))return send(401,{error:'Signature rejected.'});
   try{await connection.engagement.webhook(JSON.parse(raw.toString('utf8')));return send(200,{ok:true});}catch{return send(503,{error:'Event not stored. Retry delivery.'});}
  }
  if(url.pathname.startsWith('/api/engagement/')){
   if(!connection)return send(503,{error:'Cloud service unavailable.'});
   if(!equal(req.headers.authorization,'Bearer '+connection.ownerKey))return send(401,{error:'Unauthorized'});
   if(!connection.engagement)return send(409,{error:'Enable ENGAGEMENT_ENABLED on the existing cloud service after applying db/engagement.sql.'});
   try{
    if(url.pathname==='/api/engagement/setup'&&req.method==='GET')return send(200,{callback:'https://sniff-publishing.onrender.com/webhooks/instagram',verifyToken:connection.webhookVerifyToken,fields:['comments','messages']});
    if(url.pathname==='/api/engagement/inbox'&&req.method==='GET')return send(200,await connection.engagement.list(url.searchParams.get('accountId')));
    if(req.method!=='POST')return send(405,{error:'Method not allowed'});
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required'});
    let n=0;const chunks=[];for await(const c of req){n+=c.length;if(n>24000)return send(413,{error:'Request too large'});chunks.push(c);}const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(url.pathname==='/api/engagement/research')return send(200,await connection.engagement.research(b.accountId,b));
    if(url.pathname==='/api/engagement/sync')return send(200,await connection.engagement.syncInbox(b.accountId));
    if(url.pathname==='/api/engagement/reply')return send(200,await connection.engagement.saveReply(b.accountId,b.itemId,b));
    if(url.pathname==='/api/engagement/send')return send(200,await connection.engagement.sendReply(b.accountId,b.itemId,b.version));
    return send(404,{error:'Not found'});
   }catch(e){return send(e.status||400,{error:e.status?e.message:'Engagement request failed. Check setup and reload before retrying.'});}
  }
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
  if(url.pathname.startsWith('/api/insights/')){
   if(!connection)return send(503,{error:'Cloud service unavailable.'});
   if(!equal(req.headers.authorization,'Bearer '+connection.ownerKey))return send(401,{error:'Unauthorized'});
   if(!connection.insights)return send(409,{error:'Enable Insights on the cloud service after installing the Phase 4 schema.'});
   try{
    if(url.pathname==='/api/insights/snapshots'&&req.method==='GET')return send(200,{accounts:await connection.insights.list()});
    if(url.pathname==='/api/insights/sync'&&req.method==='POST'){
     let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>4096)return send(413,{error:'Request too large'});chunks.push(chunk);}
     const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof b.accountId!=='string'||! /^[a-f0-9-]{36}$/i.test(b.accountId))return send(400,{error:'Choose an account.'});
     void connection.insights.sync(b.accountId,{force:true}).catch(()=>{});return send(202,{queued:true,message:'Synchronization requested. Refresh results shortly. Requests are limited to once per five minutes per account.'});
    }
    return send(405,{error:'Method not allowed'});
   }catch{return send(503,{error:'Insights unavailable. Check the Phase 4 schema and backend configuration.'});}
  }
  if(url.pathname.startsWith('/api/publishing/')){
   if(!connection||!connection.publisher)return send(503,{error:'Publishing service unavailable.'});
   const action=url.pathname.slice('/api/publishing/'.length);
   const cronWake=action==='wake'&&req.method==='POST'&&verifiedCronWake(req.headers,connection.ownerKey);
   if(!cronWake&&!equal(req.headers.authorization,'Bearer '+connection.ownerKey))return send(401,{error:'Unauthorized'});
   if(action==='jobs'&&req.method==='GET'){
    try{return send(200,{jobs:await connection.publisher.list()});}
    catch{return send(503,{error:'Could not load publication jobs.'});}
   }
   if(action==='health'&&req.method==='GET'){
    try{return send(200,{...await connection.publisher.health(),publishingEnabled:connection.publishingEnabled===true});}
    catch{return send(503,{error:'Could not load publishing health.'});}
   }
   if(action==='history'&&req.method==='GET'){
    try{return send(200,{events:await connection.publisher.history(url.searchParams.get('id'))});}
    catch{return send(400,{error:'Publication history unavailable.'});}
   }
   if(action==='wake'&&req.method==='POST'){
    if(!connection.publishingEnabled)return send(409,{error:'Cloud publishing is disabled.'});
    try{
     const processed=await connection.publisher.pump();
     if(connection.insights)void connection.insights.sync().catch(()=>{});
     connection.lastWakeAt=new Date().toISOString();
     return send(200,{ok:true,processed,checkedAt:connection.lastWakeAt});
    }catch(e){return send(503,{error:'Publishing check failed. Review cloud health and logs.'});}
   }
   if(!connection.publishingEnabled)return send(409,{error:'Live publishing is disabled. Set PUBLISHING_ENABLED=true on Render only after acceptance tests.'});
   try{
    if(action==='stage'&&req.method==='POST'){
     const mediaType=req.headers['content-type']||'',jobId=req.headers['x-publication-id'];
     if(!['image/jpeg','video/mp4'].includes(mediaType)||!/^[a-f0-9-]{36}$/i.test(jobId||''))return send(400,{error:'Invalid publication media.'});
     const chunks=[];let total=0;
     for await(const part of req){
      total+=part.length;
      if(total>100*1024*1024)return send(413,{error:'File exceeds upload limit.'});
      chunks.push(part);
     }
     return send(200,await connection.publisher.stage(jobId,mediaType,Buffer.concat(chunks)));
    }
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'JSON required.'});
    let total=0;const parts=[];
    for await(const part of req){total+=part.length;if(total>10000)return send(413,{error:'Request too large.'});parts.push(part);}
    const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(action==='enqueue'&&req.method==='POST')return send(201,await connection.publisher.enqueue(data));
    if(action==='cancel'&&req.method==='POST')return send(200,await connection.publisher.cancel(data.id));
    if(action==='retry'&&req.method==='POST')return send(200,await connection.publisher.retry(data.id));
    return send(404,{error:'Unknown publication action.'});
   }catch{return send(409,{error:'Publication operation could not be completed. Check the connected account, cloud storage and publication status before retrying.'});}
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
export function startPublishingWorker(connection,{schedule=setInterval,logger=console}={}){
 if(!connection?.publishingEnabled&&!connection?.insights)return null;
 const pump=()=>Promise.resolve().then(async()=>{if(connection.publishingEnabled)await connection.publisher.pump();if(connection.insights)await connection.insights.sync();}).catch(e=>logger.error('Publishing worker check failed:',e.message));
 void pump();
 const interval=schedule(pump,30000);
 interval?.unref?.();
 return interval;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const connection=connectionConfig(process.env);
 const server=createPublishingServer({connection});
 server.listen(Number(process.env.PORT||10000),'0.0.0.0');
 startPublishingWorker(connection);
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
