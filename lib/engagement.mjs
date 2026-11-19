import {createHmac,timingSafeEqual} from 'node:crypto';
import {decryptToken} from './publishing-crypto.mjs';

const reject=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max=8000)=>typeof v==='string'?v.slice(0,max):'';
const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export function researchTargets(value){
 const split=(v,re,max)=>{if(!Array.isArray(v)||v.length>max)reject('Choose up to '+max+' research targets.');return [...new Set(v.map(x=>{if(typeof x!=='string'||!re.test(x))reject('Use usernames or hashtags without spaces, @ or #.');return x.toLowerCase();}))];};
 return {competitors:split(value.competitors||[],/^[a-zA-Z0-9._]{1,30}$/,5),hashtags:split(value.hashtags||[],/^[\p{L}\p{N}_]{1,80}$/u,3)};
}
export function rankResearch(posts){
 const unique=[...new Map(posts.map(p=>[p.id,p])).values()];
 return unique.map(p=>{const peers=unique.filter(x=>x.source===p.source&&x.id!==p.id&&numeric(x.likes)!==null&&numeric(x.comments)!==null),totals=peers.map(x=>x.likes+x.comments).sort((a,b)=>a-b),baseline=totals.length>=3?totals[Math.floor(totals.length/2)]:null,interactions=numeric(p.likes)!==null&&numeric(p.comments)!==null?p.likes+p.comments:null;
  return {...p,interactions,baseline,relativeInteractions:baseline>0&&interactions!==null?interactions/baseline:null};
 }).sort((a,b)=>(b.relativeInteractions??-1)-(a.relativeInteractions??-1)||(b.interactions??-1)-(a.interactions??-1));
}
export function verifyMetaSignature(raw,signature,secret){
 if(!secret||typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 return timingSafeEqual(Buffer.from(signature.slice(7),'hex'),createHmac('sha256',secret).update(raw).digest());
}
export function replyAllowed(item,clock=Date.now()){
 if(item.kind==='comment')return true;
 const age=clock-Date.parse(item.received_at);return item.kind==='dm'&&item.direction==='inbound'&&Number.isFinite(age)&&age>=0&&age<24*3600000;
}
export function createEngagement({url,key,workspaceId,encryptionKey,apiVersion='v27.0',fetcher=fetch,clock=Date.now}){
 if(!/^https:\/\//.test(url)||!key||!workspaceId||!encryptionKey||!/^v\d+\.\d+$/.test(apiVersion))throw Error('Invalid engagement configuration.');
 const headers={apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'};
 async function rows(table,params={},method='GET',data,prefer='return=representation'){
  const u=new URL('/rest/v1/'+table,url);u.search=new URLSearchParams(params);
  const r=await fetcher(u,{method,headers:{...headers,Prefer:prefer},body:data===undefined?undefined:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)reject('Inbox storage unavailable. Check the engagement schema and backend configuration.',503);return r.status===204?[]:r.json();
 }
 async function account(accountId){
  if(!uuid(accountId))reject('Choose a connected account.');
  const [a]=await rows('marketing_instagram_accounts',{workspace_id:'eq.'+workspaceId,id:'eq.'+accountId,status:'eq.connected',select:'id,brand_id,instagram_user_id,username,token_ciphertext,token_expires_at'});
  if(!a||!/^\d+$/.test(a.instagram_user_id)||!a.token_ciphertext)reject('Connected account not found.',404);
  if(a.token_expires_at&&Date.parse(a.token_expires_at)<=clock()+300000)reject('Reconnect the expired Instagram account.',409);
  return a;
 }
 const token=a=>decryptToken(a.token_ciphertext,encryptionKey,[workspaceId,a.brand_id,a.instagram_user_id].join(':'));
 async function graph(a,path,params={},method='GET',data){
  const u=new URL('https://graph.facebook.com/'+apiVersion+'/'+path);u.search=new URLSearchParams(params);
  let r;try{r=await fetcher(u,{method,headers:{Authorization:'Bearer '+token(a),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{reject(method==='POST'?'Send outcome is uncertain. Check Instagram before any further action.':'Instagram is temporarily unavailable.',503);}
  let result;try{result=await r.json();}catch{reject('Instagram returned an unreadable response.',503);}
  if(!r.ok||result.error){const code=Number(result.error?.code);
   // Meta's permission explanation identifies account settings vs App Review.
   // Keep it bounded and scrub the credential even if a provider echoes input.
   const detail=text(result.error?.error_user_msg||result.error?.message,800).replaceAll(token(a),'[redacted]');
   reject(code===190?'Reconnect the Instagram account.':[10,200].includes(code)?'Meta access rejected'+(detail?' (code '+code+'): '+detail:'. Check research, comments or messaging permissions and reconnect.'):r.status===429||[4,17,32,613].includes(code)?'Instagram rate limit reached. Try later.':'Instagram rejected this operation'+(detail?' (code '+code+'): '+detail:'. Check supported fields, account access and Meta configuration.'),r.status>=500?503:409);}
  return result;
 }
 const scope=a=>({workspace_id:'eq.'+workspaceId,account_id:'eq.'+a.id});
 async function claim(a,kind,minutes){
  await rows('marketing_social_sync',{on_conflict:'workspace_id,account_id,kind'},'POST',{workspace_id:workspaceId,account_id:a.id,brand_id:a.brand_id,kind},'resolution=ignore-duplicates,return=representation');
  const [s]=await rows('marketing_social_sync',{...scope(a),kind:'eq.'+kind});
  if(s?.next_sync_at&&Date.parse(s.next_sync_at)>clock())reject('Wait until '+s.next_sync_at+' before another '+kind+' refresh.',429);
  const claimed=await rows('marketing_social_sync',{...scope(a),kind:'eq.'+kind,revision:'eq.'+s.revision},'PATCH',{revision:s.revision+1,last_attempt_at:new Date(clock()).toISOString(),next_sync_at:new Date(clock()+minutes*60000).toISOString(),last_error:null});
  if(claimed.length!==1)reject('Another refresh is already running.',409);return s.revision+1;
 }
 async function research(accountId,input){
  const targets=researchTargets(input);if(!targets.competitors.length&&!targets.hashtags.length)reject('Add a competitor or hashtag first.');
  const a=await account(accountId);await claim(a,'research',5);
  const posts=[],warnings=[],capturedAt=new Date(clock()).toISOString();
  const add=(media,source,followers=null)=>{for(const p of (media.data||[]).slice(0,25)){if(typeof p.id!=='string')continue;let permalink='';try{const u=new URL(p.permalink);if(u.protocol==='https:'&&['instagram.com','www.instagram.com'].includes(u.hostname))permalink=u.href;}catch{}
   posts.push({id:p.id,source,followers,capturedAt,caption:text(p.caption,2200),format:p.media_product_type==='REELS'?'reel':p.media_type==='VIDEO'?'video':'image',publishedAt:text(p.timestamp,60),permalink,likes:numeric(p.like_count),comments:numeric(p.comments_count),views:numeric(p.view_count),visualEvidence:'Caption and public metadata only; video has not been watched.'});
  }if(media.paging?.next)warnings.push(source+': showing the first 25 available posts.');};
  for(const username of targets.competitors){try{
   const d=await graph(a,a.instagram_user_id,{fields:'business_discovery.username('+username+'){username,followers_count,media.limit(25){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,view_count}}'});
   if(!d.business_discovery?.media)throw Error('No public professional-account media returned.');add(d.business_discovery.media,'@'+username,numeric(d.business_discovery.followers_count));
  }catch(e){warnings.push('@'+username+': '+e.message);}}
  for(const hashtag of targets.hashtags){try{
   const h=await graph(a,'ig_hashtag_search',{user_id:a.instagram_user_id,q:hashtag}),hid=h.data?.[0]?.id||h.id;if(!/^\d+$/.test(hid||''))throw Error('Hashtag unavailable.');
   const d=await graph(a,hid+'/top_media',{user_id:a.instagram_user_id,fields:'id,caption,media_type,permalink,like_count,comments_count,timestamp',limit:'25'});add(d,'#'+hashtag);
  }catch(e){warnings.push('#'+hashtag+': '+e.message+' Hashtag search requires Instagram Public Content Access; Meta limits accounts to 30 unique hashtags per rolling seven days.');}}
  return {accountId,brandId:a.brand_id,capturedAt,targets,posts:rankResearch(posts),warnings,definition:'Public sample, not an industry-wide ranking. Relative interactions compare likes + comments with the median of at least three other sampled posts from the same source; age, ads and audience differ. Missing values remain unavailable. No private retention, saves, reach or conversion data.'};
 }
 async function put(a,item){
  const row={...item,workspace_id:workspaceId,account_id:a.id,brand_id:a.brand_id};
  await rows('marketing_inbox',{on_conflict:'workspace_id,account_id,id'},'POST',row,'resolution=merge-duplicates,return=representation');
 }
 function messageItem(a,m,conversationId){
  const sender=m.from?.id,recipient=m.to?.data?.find(x=>x.id!==a.instagram_user_id)?.id;
  if(typeof m.id!=='string'||!sender)return null;
  return {id:'dm:'+m.id,kind:'dm',source_id:m.id,thread_id:conversationId,peer_id:sender===a.instagram_user_id?recipient:sender,username:text(m.from?.username,100),text:text(m.message),direction:sender===a.instagram_user_id?'outbound':'inbound',received_at:new Date(m.created_time).toISOString()};
 }
 async function syncInbox(accountId){
  const a=await account(accountId),rev=await claim(a,'inbox',5),warnings=[];let comments=0,messages=0;
  try{
   try{const media=await graph(a,a.instagram_user_id+'/media',{fields:'id,permalink',limit:'25'});
    for(const p of (media.data||[]).slice(0,25)){const d=await graph(a,p.id+'/comments',{fields:'id,text,timestamp,from,parent_id',limit:'50'});
     for(const c of d.data||[]){if(c.from?.id===a.instagram_user_id)continue;await put(a,{id:'comment:'+c.id,kind:'comment',source_id:c.id,thread_id:p.id,peer_id:c.from?.id||'',username:text(c.from?.username,100),text:text(c.text),direction:'inbound',received_at:new Date(c.timestamp).toISOString()});comments++;}
     if(d.paging?.next)warnings.push('Some comments exceed the 50-per-post refresh sample.');
    }if(media.paging?.next)warnings.push('Comments cover the latest 25 own posts. Webhooks capture new events after setup.');
   }catch(e){warnings.push('Comments: '+e.message);}
   try{const conversations=await graph(a,a.instagram_user_id+'/conversations',{platform:'instagram',fields:'id',limit:'20'});
    for(const c of (conversations.data||[]).slice(0,20)){const d=await graph(a,c.id+'/messages',{fields:'id,created_time,from,to,message',limit:'20'});for(const m of d.data||[]){const item=messageItem(a,m,c.id);if(item){await put(a,item);messages++;}}if(d.paging?.next)warnings.push('Showing the latest 20 messages per conversation.');}
    if(conversations.paging?.next)warnings.push('Showing the latest 20 conversations.');
   }catch(e){warnings.push('Messages: '+e.message);}
   await rows('marketing_social_sync',{...scope(a),kind:'eq.inbox',revision:'eq.'+rev},'PATCH',{last_success_at:new Date(clock()).toISOString(),last_error:warnings.join(' ')});
   return {comments,messages,warnings:[...new Set(warnings)]};
  }catch(e){await rows('marketing_social_sync',{...scope(a),kind:'eq.inbox',revision:'eq.'+rev},'PATCH',{last_error:e.message});throw e;}
 }
 async function list(accountId){const a=await account(accountId);const [items,replies,sync]=await Promise.all([rows('marketing_inbox',{...scope(a),order:'received_at.desc',limit:'500'}),rows('marketing_inbox_replies',{...scope(a),order:'created_at.desc',limit:'500'}),rows('marketing_social_sync',{...scope(a),kind:'eq.inbox'})]);return {items,replies,sync,limit:500};}
 async function saveReply(accountId,itemId,input){
  const a=await account(accountId);if(typeof itemId!=='string'||itemId.length>250)reject('Choose a message.');
  const [item]=await rows('marketing_inbox',{...scope(a),id:'eq.'+itemId});if(!item||item.direction!=='inbound')reject('Choose an inbound comment or message.',404);
  const reply=text(input.text,1001).trim();if(!reply||reply.length>1000)reject('Replies must contain 1–1,000 characters.');
  if(!Number.isInteger(input.version)||input.version<0||typeof input.approved!=='boolean')reject('Reload the current reply.');
  const filter={...scope(a),item_id:'eq.'+itemId},[existing]=await rows('marketing_inbox_replies',filter);
  if(existing&&existing.status!=='draft')reject('This reply is already sent or needs reconciliation.',409);
  if((existing?.version||0)!==input.version)reject('Reply changed. Reload before saving.',409);
  const row={workspace_id:workspaceId,account_id:a.id,brand_id:a.brand_id,item_id:itemId,text:reply,approved:input.approved,version:input.version+1,status:'draft',updated_at:new Date(clock()).toISOString(),source_text:item.text};
  const result=existing?await rows('marketing_inbox_replies',{...filter,version:'eq.'+input.version,status:'eq.draft'},'PATCH',row):await rows('marketing_inbox_replies',{},'POST',row);
  if(result.length!==1)reject('Reply changed. Reload before saving.',409);return result[0];
 }
 async function sendReply(accountId,itemId,version){
  const a=await account(accountId),filter={...scope(a),item_id:'eq.'+itemId},[item]=await rows('marketing_inbox',{...scope(a),id:'eq.'+itemId});
  const [reply]=await rows('marketing_inbox_replies',filter);
  if(!item||!reply||reply.version!==version||!reply.approved||reply.status!=='draft'||reply.source_text!==item.text)reject('Review and approve the current reply before sending.',409);
  if(!replyAllowed(item,clock()))reject('The standard 24-hour DM reply window is closed. Reply directly in Instagram when permitted.',409);
  const claimed=await rows('marketing_inbox_replies',{...filter,version:'eq.'+version,status:'eq.draft',approved:'eq.true'},'PATCH',{status:'sending',updated_at:new Date(clock()).toISOString()});
  if(claimed.length!==1)reject('This reply was already submitted. Refresh its status.',409);
  try{
   const result=item.kind==='comment'?await graph(a,item.source_id+'/replies',{},'POST',{message:reply.text}):await graph(a,a.instagram_user_id+'/messages',{},'POST',{recipient:{id:item.peer_id},message:{text:reply.text}});
   const sentId=result.id||result.message_id;if(typeof sentId!=='string'||!sentId)throw Error('Missing acknowledgement.');
   const [sent]=await rows('marketing_inbox_replies',{...filter,status:'eq.sending'},'PATCH',{status:'sent',sent_id:sentId,sent_at:new Date(clock()).toISOString(),updated_at:new Date(clock()).toISOString()});return sent;
  }catch{await rows('marketing_inbox_replies',{...filter,status:'eq.sending'},'PATCH',{status:'uncertain',updated_at:new Date(clock()).toISOString()}).catch(()=>{});reject('Send was not confirmed. Check Instagram manually; this reply will not be sent again automatically.',409);}
 }
 async function webhook(payload){
  if(payload.object!=='instagram'||!Array.isArray(payload.entry))return;
  for(const e of payload.entry.slice(0,100)){
   const accounts=await rows('marketing_instagram_accounts',{workspace_id:'eq.'+workspaceId,instagram_user_id:'eq.'+e.id,status:'eq.connected',select:'id,brand_id,instagram_user_id'});
   for(const a of accounts){
    for(const c of (e.changes||[]).slice(0,100)){const v=c.value;if(c.field!=='comments'||!v?.id||v.from?.id===a.instagram_user_id)continue;await put(a,{id:'comment:'+v.id,kind:'comment',source_id:v.id,thread_id:text(v.media?.id,100),peer_id:text(v.from?.id,100),username:text(v.from?.username,100),text:text(v.text),direction:'inbound',received_at:new Date(Number(e.time)*1000).toISOString()});}
    for(const m of (e.messaging||[]).slice(0,100)){if(!m.message?.mid||m.message.is_echo||m.sender?.id===a.instagram_user_id||m.recipient?.id!==a.instagram_user_id)continue;
     await put(a,{id:'dm:'+m.message.mid,kind:'dm',source_id:m.message.mid,thread_id:text(m.sender?.id,200),peer_id:text(m.sender?.id,100),username:'',text:text(m.message.text)||'[Attachment or unsupported message]',direction:'inbound',received_at:new Date(Number(m.timestamp)).toISOString()});
    }
   }
  }
 }
 return {research,list,syncInbox,saveReply,sendReply,webhook};
}
