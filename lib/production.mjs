import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {fail,str} from './core.mjs';
import {publicTarget} from './website.mjs';
import {matchBrandFont,copyInstalledFont} from './fonts.mjs';
import {videoModel as findVideoModel,videoPayload,higgsfieldImagePayload} from './media-models.mjs';

export const MAX_ASSET=100*1024*1024;
export const formats={'1:1':[1080,1080],'4:5':[1080,1350],'9:16':[1080,1920],'16:9':[1920,1080]};
export const imageMimes=['image/png','image/jpeg','image/webp'];
export function higgsfieldCredential(env){return env.HF_API_KEY?.trim()||(env.HF_API_KEY_ID&&env.HF_API_KEY_SECRET?env.HF_API_KEY_ID.trim()+':'+env.HF_API_KEY_SECRET.trim():'');}
export function productionSettings(value={}){
 const imageModel=str(value.imageModel||'',100),videoModel=str(value.videoModel||'bytedance/seedance-2.0/text-to-video',150);
 findVideoModel(videoModel);
 const reserve=Number(value.reserve??5);if(!Number.isFinite(reserve)||reserve<=0||reserve>100000)fail('Set a positive media reservation in USD.');
 return {imageModel,videoModel,reserve};
}
export function productionInput(b,state,fontCatalog=[]){
 const kind=b.kind;if(!['image','video','render'].includes(kind))fail('Choose image, video or render.');
 const brand=state.brands.find(x=>x.id===b.brandId);if(!brand)fail('Choose a brand.');
 const aspect=b.aspect||'1:1';if(!formats[aspect])fail('Choose a supported output format.');
 const title=str(b.title||'Untitled creative',150),prompt=str(b.prompt||'',16000),caption=str(b.caption||'',30000);
 const includeBrandText=b.includeBrandText!==false;
 const sourceId=str(b.sourceId||'',100),logoId=str(b.logoId||'',100),choice=includeBrandText?str(b.fontId||'',100):'',fontId=choice.startsWith('system:')?'':choice,draftId=str(b.draftId||'',100);
 let systemFont=choice.startsWith('system:')?fontCatalog.find(f=>f.id===choice.slice(7)):null;
 if(choice.startsWith('system:')&&!systemFont)fail('The selected installed font is unavailable. Refresh installed fonts and choose it again.',409);
 if(b.branding===true&&includeBrandText&&!fontId&&!systemFont)systemFont=matchBrandFont(fontCatalog,brand.font);
 const asset=(assetId,types)=>{if(!assetId)return null;const m=state.media.find(x=>x.id===assetId&&x.brandId===brand.id);if(!m||!types.includes(m.mime))fail('Select an available asset of this brand in the correct format.');return m;};
 const source=asset(sourceId,kind==='render'?[...imageMimes,'video/mp4']:imageMimes);
 const logo=asset(logoId,imageMimes),font=asset(fontId,['font/ttf','font/otf']);
 if([logo,font].some(m=>m&&m.status!=='approved'))fail('Approve the selected logo and font in Media Library before using them as brand overlays.');
 if(b.branding===true&&includeBrandText&&!fontId&&!systemFont&&process.platform==='win32')fail('Choose an installed font or an approved uploaded font for the brand text.',409);
 if(kind==='image'&&source?.size>=50*1024*1024)fail('OpenAI reference images must be smaller than 50 MiB.');
 if(draftId&&!state.drafts.some(d=>d.id===draftId&&d.brandId===brand.id))fail('Select a draft belonging to this brand.');
 if(kind==='render'&&!source)fail('Choose an image or MP4 to render.');
 if(kind==='video'&&source)fail('This video adapter generates from text. Describe the scene in the brief.');
 if(kind!=='render'&&!prompt)fail('Add a creative brief.');
 const count=kind==='image'?Number(b.count??1):1;if(!Number.isInteger(count)||count<1||count>4)fail('Choose between one and four images.');
 const duration=Number(b.duration??5);if(kind==='video'&&![5,10].includes(duration))fail('Choose a 5 or 10 second clip.');
 if(kind==='video'&&aspect==='4:5')fail('Generate video in 1:1, 9:16 or 16:9, then render to 4:5.');
 const originalPrompt=kind==='video'?str(b.originalPrompt||prompt,16000):'',videoBriefDraftId=kind==='video'?str(b.videoBriefDraftId||'',100):'';
 if(videoBriefDraftId){const draft=state.drafts.find(d=>d.id===videoBriefDraftId&&d.brandId===brand.id&&d.skill==='video-brief');if(!draft?.videoBrief||draft.status==='needs-review'||draft.videoBrief.originalPrompt!==originalPrompt||draft.videoBrief.duration!==duration||draft.videoBrief.aspect!==aspect)fail('Prepare a new video brief after changing the goal, brand, duration or format.',409);}
 const transparent=b.transparent===true,branding=b.branding===true;
 const overlay=includeBrandText?str(b.overlay||'',90):'';if(/[\r\n]/.test(overlay))fail('Use a single line of overlay text (up to 90 characters).');
 const color=str(b.color||brand.palette.split(/[\s,]+/).find(Boolean)||'#163D30',7);
 if(!/^#[0-9a-f]{6}$/i.test(color))fail('Use a #RRGGBB brand colour.');
 if(!['contain','cover'].includes(b.fit||'contain'))fail('Choose fit or crop.');
 return {kind,title,prompt,originalPrompt,videoBriefDraftId,caption,aspect,count,duration,transparent,branding,includeBrandText,overlay,color,fit:b.fit||'contain',sourceId,logoId,fontId,systemFontId:systemFont?.id||'',systemFontName:systemFont?.name||'',draftId,brandSnapshot:structuredClone(brand),sourceSnapshot:source,logoSnapshot:logo,fontSnapshot:font};
}
export function ffmpegPath(env){const bundled=path.resolve('runtime','ffmpeg','ffmpeg.exe');return env.FFMPEG||(existsSync(bundled)?bundled:'ffmpeg');}
export async function rendererAvailable(env){
 try{await run(ffmpegPath(env),['-version'],{timeout:10000});return true;}catch{return false;}
}
async function run(command,args,{cwd,timeout=180000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,windowsHide:true,shell:false,stdio:['ignore','ignore','pipe']});let stderr='';
  const timer=setTimeout(()=>{child.kill();reject(new Error('Media rendering timed out. The source asset is preserved.'));},timeout);
  child.stderr.on('data',c=>{stderr=(stderr+c).slice(-6000);});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('FFmpeg is unavailable. Use the complete Windows app or configure FFMPEG locally.'));});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Media could not be rendered. Check that the input is a valid image or MP4 and the font is valid.'));});
 });
}
// No provider credentials, cookies or unvalidated redirect targets reach media hosts.
export async function downloadAsset(value,{lookup,requestImpl}={}){
 let target=value;const signal=AbortSignal.timeout(120000);
 for(let i=0;i<5;i++){
  const {url,address}=await publicTarget(target,lookup,signal);if(url.protocol!=='https:')throw new Error('Generated media must use HTTPS.');
  const result=await new Promise((resolve,reject)=>{
   const req=(requestImpl||https.request)(url,{agent:false,signal,timeout:30000,family:4,lookup:(_h,opts,cb)=>opts.all?cb(null,[{address,family:4}]):cb(null,address,4),headers:{Accept:'image/*,video/mp4','Accept-Encoding':'identity'}},res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
    if(res.statusCode!==200){res.resume();reject(new Error('Generated media download failed. Use Recover result in Activity; do not regenerate a billed request.'));return;}
    if(Number(res.headers['content-length'])>MAX_ASSET){res.resume();reject(new Error('Generated media exceeds 100 MiB.'));return;}
    let n=0;const chunks=[];res.on('data',c=>{n+=c.length;if(n>MAX_ASSET){res.destroy(new Error('Generated media exceeds 100 MiB.'));return;}chunks.push(c);});res.on('error',reject);res.on('end',()=>resolve({bytes:Buffer.concat(chunks)}));
   });req.on('timeout',()=>req.destroy(new Error('Media download timed out.')));req.on('error',reject);req.end();
  });
  if(result.bytes?.length)return result.bytes;
  if(!result.redirect)throw new Error('No generated media returned.');target=new URL(result.redirect,url).href;
 }
 throw new Error('Too many media redirects.');
}
async function providerJSON(url,options,fetcher){
 const res=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(180000)});
 if(!res.ok)throw new Error('Media provider returned HTTP '+res.status+'. Check account access, model and provider billing before retrying.');
 // Providers may return image payloads; cap before decoding, not after allocation.
 let n=0;const chunks=[];for await(const c of res.body){n+=c.length;if(n>MAX_ASSET*1.4){await res.body.cancel?.().catch(()=>{});throw new Error('Provider response exceeds the media limit.');}chunks.push(c);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function imagePrompt(p){const brand=p.brandSnapshot;return p.prompt+'\nBrand direction (reference data): '+JSON.stringify({name:brand.name,voice:brand.voice,audience:brand.audience,allowedClaims:brand.allowedClaims,forbiddenClaims:brand.forbiddenClaims})+'\n'+(p.transparent?'Remove the background. Return a transparent background.':'')+'\n'+(p.branding?'Do not invent a logo or watermark; approved branding is applied after generation.':'');}
export async function generateImages(job,{env,fetcher,readMedia}){
 const p=job.production,prompt=imagePrompt(p);
 const [w,h]=formats[p.aspect];
 const params={model:job.config.model,prompt,n:p.count,size:w===h?'1024x1024':w>h?'1536x1024':'1024x1536',quality:p.imageQuality||'auto',output_format:'png',background:p.transparent?'transparent':'auto'};
 let body,headers={Authorization:'Bearer '+env.OPENAI_API_KEY},endpoint='generations';
 if(p.sourceSnapshot){
  endpoint='edits';const source=await readMedia(p.sourceSnapshot);if(source.length>=50*1024*1024)throw new Error('Reference images must be smaller than 50 MiB.');
  body=new FormData();for(const [k,v] of Object.entries(params))body.set(k,String(v));body.append('image[]',new Blob([source],{type:p.sourceSnapshot.mime}),'reference.'+p.sourceSnapshot.mime.split('/')[1]);
 }else{headers['Content-Type']='application/json';body=JSON.stringify(params);}
 const result=await providerJSON('https://api.openai.com/v1/images/'+endpoint,{method:'POST',headers,body},fetcher);
 if(!Array.isArray(result.data)||!result.data.length)throw new Error('Image provider returned no images. Check provider billing.');
 const images=result.data.slice(0,p.count).map(d=>{if(typeof d.b64_json!=='string'||d.b64_json.length>MAX_ASSET*1.4)throw new Error('No supported image data returned.');const bytes=Buffer.from(d.b64_json,'base64');if(!bytes.length||bytes.length>MAX_ASSET)throw new Error('Invalid or oversized generated image.');return {bytes,mime:'image/png'};});
 return {images,usage:result.usage||null,incomplete:images.length!==p.count};
}
// Signed storage URLs are issued by the authenticated provider. Never forward the API key or follow redirects.
export async function uploadImageReference(signed,bytes,mime,{lookup,requestImpl}={}){
 const signal=AbortSignal.timeout(120000),{url,address}=await publicTarget(signed.upload_url,lookup,signal);
 if(url.protocol!=='https:')throw new Error('Reference upload must use HTTPS.');
 const headers={'Content-Type':mime,'Content-Length':bytes.length};
 for(const [key,value] of Object.entries(signed.upload_headers||{})){
  if(!/^[a-z0-9-]+$/i.test(key)||/^(authorization|cookie|host|connection|transfer-encoding|content-length)$/i.test(key)||typeof value!=='string')throw new Error('Unexpected signed reference upload headers.');
  headers[key]=value;
 }
 await new Promise((resolve,reject)=>{const req=(requestImpl||https.request)(url,{method:'PUT',agent:false,signal,family:4,lookup:(_h,opts,cb)=>opts.all?cb(null,[{address,family:4}]):cb(null,address,4),headers},res=>{res.resume();res.statusCode>=200&&res.statusCode<300?resolve():reject(new Error('Higgsfield reference upload failed. No generation was submitted.'));});req.on('error',reject);req.end(bytes);});
 let publicUrl;try{publicUrl=new URL(signed.public_url);}catch{throw new Error('Higgsfield did not return a reference URL.');}if(publicUrl.protocol!=='https:'||publicUrl.username||publicUrl.password)throw new Error('Invalid reference URL.');return publicUrl.href;
}
function resultImage(bytes){const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'image/webp':null;if(!mime||bytes.length>MAX_ASSET)throw new Error('Higgsfield returned an unsupported or oversized image. Request ID retained for recovery.');return {bytes,mime};}
export async function generateHiggsfieldImages(job,{env,fetcher,readMedia,onRequest,onPhase,downloader=downloadAsset,uploader=uploadImageReference,pollDelay=3000}){
 const credential=higgsfieldCredential(env);if(!credential)fail('Add HF_API_KEY to your local API settings, then restart.',409);
 const headers={Authorization:'Key '+credential,'Content-Type':'application/json'},p=job.production;let requestId=job.providerRequestId;
 if(!requestId){
  let referenceUrl;if(p.sourceSnapshot){const source=await readMedia(p.sourceSnapshot);if(source.length>30*1024*1024)throw new Error('Reference images must be up to 30 MiB.');await onPhase('Uploading selected reference to Higgsfield');const signed=await providerJSON('https://api.higgsfield.ai/files/generate-upload-url',{method:'POST',headers,body:JSON.stringify({content_type:p.sourceSnapshot.mime})},fetcher);referenceUrl=await uploader(signed,source,p.sourceSnapshot.mime);}
  const {endpoint,payload}=higgsfieldImagePayload(job.config.model,p,imagePrompt(p),referenceUrl);
  const result=await providerJSON('https://api.higgsfield.ai/'+endpoint,{method:'POST',headers,body:JSON.stringify(payload)},fetcher);
  requestId=result.request_id;if(typeof requestId!=='string'||!/^[\w-]{1,200}$/.test(requestId))throw new Error('Provider returned no valid request ID. Check provider history before generating again.');await onRequest(requestId);
 }
 for(let n=0;n<400;n++){
  const result=await providerJSON('https://api.higgsfield.ai/requests/'+encodeURIComponent(requestId)+'/status',{method:'GET',headers},fetcher);await onPhase('Higgsfield: '+String(result.status||'waiting').slice(0,40));
  if(['failed','nsfw','canceled','cancelled'].includes(result.status))throw new Error('Higgsfield request '+result.status+'. Check provider billing; it will not be retried automatically.');
  if(result.status==='completed'){const urls=Array.isArray(result.images)?result.images.slice(0,p.count).map(x=>x?.url):[];if(!urls.length||urls.some(x=>typeof x!=='string'))throw new Error('No supported image URLs returned. Request ID retained for recovery.');const images=[];for(const url of urls)images.push(resultImage(await downloader(url)));return {images,usage:null,incomplete:images.length!==p.count};}
  await delay(pollDelay);
 }
 throw new Error('Images are still processing after 20 minutes. Use Recover result in Activity to poll the existing request without generating again.');
}
export async function generateVideo(job,{env,fetcher,onRequest,onPhase,downloader=downloadAsset,pollDelay=3000}){
 const credential=higgsfieldCredential(env);if(!credential)fail('Add HF_API_KEY to your local API settings, then restart.',409);
 const headers={Authorization:'Key '+credential,'Content-Type':'application/json'};
 let requestId=job.providerRequestId;
 if(!requestId){
  const p=job.production;
  const payload=videoPayload(job.config.model,{...p,prompt:p.prompt+(p.videoBriefDraftId||job.plannerEntryId?'':'\nBrand direction: '+JSON.stringify({name:p.brandSnapshot.name,voice:p.brandSnapshot.voice,audience:p.brandSnapshot.audience}))});
  const result=await providerJSON('https://api.higgsfield.ai/'+job.config.model,{method:'POST',headers,body:JSON.stringify(payload)},fetcher);
  requestId=result.request_id;if(typeof requestId!=='string'||!/^[\w-]{1,200}$/.test(requestId))throw new Error('Provider returned no valid request ID. Check provider history before generating again.');
  await onRequest(requestId);
 }
 for(let n=0;n<400;n++){
  const result=await providerJSON('https://api.higgsfield.ai/requests/'+encodeURIComponent(requestId)+'/status',{method:'GET',headers},fetcher);
  await onPhase('Higgsfield: '+String(result.status||'waiting').slice(0,40));
  if(['failed','nsfw','canceled','cancelled'].includes(result.status))throw new Error('Higgsfield request '+result.status+'. Check provider billing; it will not be retried automatically.');
  if(result.status==='completed'){
   const url=result.video?.url||result.videos?.[0]?.url;
   if(typeof url!=='string')throw new Error('Higgsfield completed without a supported video URL. Request ID retained for recovery.');
   return {bytes:await downloader(url),mime:'video/mp4'};
  }
  await delay(pollDelay);
 }
 throw new Error('Video is still processing after 20 minutes. Use Recover result in Activity to poll the existing request without generating again.');
}
export async function renderAsset({bytes,mime},p,{env,dir,readMedia,fontCatalog=[]}){
 const temp=await mkdtemp(path.join(dir,'render-'));
 try{
  const video=mime==='video/mp4',input='input.'+(video?'mp4':'png'),out='output.'+(video?'mp4':'png');
  await writeFile(path.join(temp,input),bytes,{mode:0o600});
  const [w,h]=formats[p.aspect],padColor=p.transparent?'0x00000000':'0x'+p.color.slice(1);
  const args=['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-f',video?'mov':'image2pipe','-i',input];
  let filter='[0:v]'+(video?'':'format=rgba,')+'scale='+w+':'+h+':force_original_aspect_ratio='+(p.fit==='cover'?'increase':'decrease')+':force_divisible_by=2,'+(p.fit==='cover'?'crop='+w+':'+h:'pad='+w+':'+h+':(ow-iw)/2:(oh-ih)/2:color='+padColor)+',setsar=1[base]';
  let label='base';
  if(p.branding){
   filter+=';[base]drawbox=x=0:y=ih-150:w=iw:h=150:color=0x'+p.color.slice(1)+':t=fill[band]';label='band';
   if(p.logoSnapshot){
    await writeFile(path.join(temp,'logo.png'),await readMedia(p.logoSnapshot),{mode:0o600});args.push('-protocol_whitelist','file,pipe','-f','image2pipe','-i','logo.png');
    filter+=';[1:v]scale=160:100:force_original_aspect_ratio=decrease[logo];[band][logo]overlay=x=30:y=H-h-25:format=auto[marked]';label='marked';
   }
   if(p.includeBrandText!==false){
   const text=p.overlay||p.brandSnapshot.name;
   await writeFile(path.join(temp,'label.txt'),text,{mode:0o600});
   let fontOption='';
   const installed=p.systemFontId?fontCatalog.find(f=>f.id===p.systemFontId):!p.fontSnapshot?matchBrandFont(fontCatalog,p.brandSnapshot.font):null;
   if(p.systemFontId||installed){await copyInstalledFont(installed,path.join(temp,'brand-font'));fontOption='fontfile=brand-font:';}
   else if(p.fontSnapshot){await writeFile(path.join(temp,'brand-font'),await readMedia(p.fontSnapshot),{mode:0o600});fontOption='fontfile=brand-font:';}
   else if(process.platform==='win32'){
    const fonts={Arial:'arial.ttf',Georgia:'georgia.ttf','Times New Roman':'times.ttf','Segoe UI':'segoeui.ttf',Verdana:'verdana.ttf',Tahoma:'tahoma.ttf'};
    const name=p.brandSnapshot.font.split(',')[0].replace(/["']/g,'').trim();
    const fontFile=fonts[name];if(!fontFile)throw new Error('Upload and select the approved TTF/OTF font for this brand before rendering.');
    const fontPath=path.join(process.env.WINDIR||'C:\\Windows','Fonts',fontFile);await access(fontPath);await copyFile(fontPath,path.join(temp,'brand-font'));fontOption='fontfile=brand-font:';
   }else{fontOption='font=DejaVuSans:';}
   // textfile + expansion=none prevents filter injection and percent expansion.
   const fontSize=Math.min(36,Math.floor((w-(p.logoSnapshot?250:100))/(Math.max(text.length,1)*0.65)));
   filter+=';['+label+']drawtext='+fontOption+'ft_load_flags=no_bitmap:textfile=label.txt:expansion=none:fontcolor=white:fontsize='+fontSize+':x='+(p.logoSnapshot?220:40)+':y=h-95[branded]';label='branded';
   }
  }
  args.push('-filter_complex',filter,'-map','['+label+']');
  if(video)args.push('-map','0:a?','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart');else args.push('-frames:v','1','-c:v','png','-threads','1');
  args.push(out);await run(ffmpegPath(env),args,{cwd:temp});
  const rendered=await readFile(path.join(temp,out));if(rendered.length>MAX_ASSET)throw new Error('Rendered asset exceeds 100 MiB.');
  return {bytes:rendered,mime:video?'video/mp4':'image/png',width:w,height:h};
 }finally{await rm(temp,{recursive:true,force:true});}
}
export async function thumbnailAsset(bytes,mime,{env,dir}){
 const temp=await mkdtemp(path.join(dir,'thumbnail-'));
 try{
  await writeFile(path.join(temp,'input'),bytes,{mode:0o600});
  await run(ffmpegPath(env),['-hide_banner','-loglevel','error','-nostdin','-y','-protocol_whitelist','file,pipe','-f',mime==='video/mp4'?'mov':mime==='image/gif'?'gif':'image2pipe','-i','input','-map','0:v:0','-an','-vf','scale=360:240:force_original_aspect_ratio=decrease','-frames:v','1','-c:v','png','-threads','1','thumbnail.png'],{cwd:temp,timeout:20000});
  return await readFile(path.join(temp,'thumbnail.png'));
 }finally{await rm(temp,{recursive:true,force:true});}
}
