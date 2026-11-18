import http from 'node:http';
import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {gunzipSync,inflateSync,brotliDecompressSync} from 'node:zlib';
import {normalizeWebsite,fail} from './core.mjs';

export function isPublicIPv4(address){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||
 (a===192&&(b===168||b===0||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export async function publicTarget(value,lookup=dnsLookup,signal){
 let url;try{url=new URL(value);}catch{fail('Invalid website address.');}
 const host=url.hostname.toLowerCase();
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port))||
 isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/\.(localhost|local|internal|home|lan|test|invalid)$/.test(host)||host==='localhost')fail('Only public websites on standard web ports can be analyzed.');
 let removeAbort=()=>{};
 const resolution=lookup(host,{all:true,family:4});
 const records=await (signal?Promise.race([resolution,new Promise((_,reject)=>{
  const stop=()=>reject(signal.reason||new Error('Website DNS lookup timed out.'));
  if(signal.aborted){stop();return;}
  signal.addEventListener('abort',stop,{once:true});removeAbort=()=>signal.removeEventListener('abort',stop);
 })]).finally(()=>removeAbort()):resolution);
 if(!records.length||records.some(r=>!isPublicIPv4(r.address)))fail('This website does not resolve exclusively to a public address.');
 return {url,address:records[0].address};
}
export async function readPublicResource(value,{kind='html',lookup=dnsLookup,signal=AbortSignal.timeout(30000),requestImpl}={}){
 let target=value;
 const max=kind==='css'?512000:1000000;
 for(let redirect=0;redirect<=4;redirect++){
  signal.throwIfAborted();
  const {url,address}=await publicTarget(target,lookup,signal);
  signal.throwIfAborted();
  const transport=requestImpl||(url.protocol==='https:'?https.request:http.request);
  const response=await new Promise((resolve,reject)=>{
   const req=transport(url,{
    method:'GET',agent:false,family:4,autoSelectFamily:false,signal,timeout:12000,
    // Pin the validated public address. A second DNS lookup must never bypass validation.
    lookup:(_host,opts,callback)=>opts.all?callback(null,[{address,family:4}]):callback(null,address,4),
    headers:{'User-Agent':'SniffSolution/0.1 BrandResearch','Accept':kind==='css'?'text/css':'text/html,application/xhtml+xml','Accept-Encoding':'gzip, deflate, br'}
   },res=>{
    if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
    if(res.statusCode!==200){res.resume();reject(new Error('Website returned HTTP '+res.statusCode+'. Try another public page on the site.'));return;}
    const type=String(res.headers['content-type']||'').toLowerCase();
    if(!(kind==='css'?type.includes('text/css'):type.includes('text/html')||type.includes('application/xhtml+xml'))){res.resume();reject(new Error('The website did not return a readable '+(kind==='css'?'stylesheet':'HTML page')+'.'));return;}
    let size=0;const chunks=[];
    res.on('data',chunk=>{size+=chunk.length;if(size>max){res.destroy(new Error('Website response exceeded the analysis limit.'));return;}chunks.push(chunk);});
    res.on('error',reject);
    res.on('end',()=>{
     try{
      let bytes=Buffer.concat(chunks);const encoding=res.headers['content-encoding'];
      const options={maxOutputLength:max};
      if(encoding==='gzip')bytes=gunzipSync(bytes,options);
      else if(encoding==='deflate')bytes=inflateSync(bytes,options);
      else if(encoding==='br')bytes=brotliDecompressSync(bytes,options);
      else if(encoding&&encoding!=='identity')throw new Error('Unsupported website compression.');
      if(bytes.length>max)throw new Error('Website response exceeded the analysis limit.');
      resolve({url:url.href,text:bytes.toString('utf8')});
     }catch(e){reject(e);}
    });
   });
   req.on('timeout',()=>req.destroy(new Error('Website took too long to respond.')));
   req.on('error',reject);req.end();
  });
  if(response.redirect){
   target=new URL(response.redirect,url).href;continue;
  }
  if(response.redirect===undefined&&response.url)return response;
  throw new Error('Website redirect has no destination.');
 }
 throw new Error('Website redirected too many times.');
}
export function attributes(tag){
 const result={};
 for(const m of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g))result[m[1].toLowerCase()]=m[2]??m[3]??m[4];
 return result;
}
export function decodeText(text){
 const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',hellip:'…',copy:'©',reg:'®'};
 return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(full,key)=>{
  if(key[0]==='#'){const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}
  return named[key.toLowerCase()]??full;
 });
}
export function pageText(html){
 return decodeText(html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,16000);
}
function hexColor(value){
 if(/^#[\da-f]{3}$/i.test(value))return '#'+[...value.slice(1)].map(x=>x+x).join('').toUpperCase();
 if(/^#[\da-f]{6}$/i.test(value))return value.toUpperCase();
 if(/^#[\da-f]{8}$/i.test(value)&&value.slice(-2).toUpperCase()==='FF')return value.slice(0,7).toUpperCase();
 if(/^#[\da-f]{4}$/i.test(value)&&value[4].toUpperCase()==='F')return '#'+[...value.slice(1,4)].map(x=>x+x).join('').toUpperCase();
 const m=value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
 if(m&&m.slice(1,4).every(v=>Number(v)<=255)&&(!m[4]||Number(m[4])===1))return '#'+m.slice(1,4).map(x=>Number(x).toString(16).padStart(2,'0')).join('').toUpperCase();
 return '';
}
export function extractStyles(html,sheets,homeUrl){
 const colors=new Map(),fonts=new Map();
 const record=(map,value,score,source,context)=>{
  const previous=map.get(value);
  if(previous){previous.count++;if(score>previous.score)Object.assign(previous,{score,source,context});}
  else map.set(value,{value,score,count:1,source,context:context.slice(0,180)});
 };
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
  const a=attributes(tag);if(a.name?.toLowerCase()==='theme-color'){
   const value=hexColor(a.content||'');if(value)record(colors,value,70,homeUrl,'HTML theme-color metadata');
  }
 }
 const inline=(html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi)||[]).join('\n')+'\n'+(html.match(/\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi)||[]).join('\n');
 for(const sheet of [{url:homeUrl,text:inline},...sheets]){
  const css=sheet.text.replace(/\/\*[\s\S]*?\*\//g,' ');
  for(const match of css.matchAll(/([-\w]+)\s*:\s*([^;{}<>]{1,250})/g)){
   const property=match[1].toLowerCase(),value=match[2];
   const weight=/brand|primary|accent/.test(property)?50:/secondary|theme|button/.test(property)?35:/color|background|border|fill/.test(property)?12:0;
   if(weight)for(const token of value.match(/#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b|rgba?\([^)]*\)/gi)||[]){
    const color=hexColor(token);if(!color)continue;
    const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);
    record(colors,color,weight-(Math.max(r,g,b)-Math.min(r,g,b)<12?10:0),sheet.url,property+': '+value.trim());
   }
   if(property==='font-family'||(/^--.*font/.test(property)&&!/size|weight|stretch|style/.test(property))){
    const first=value.split(',')[0].replace(/["']/g,'').trim();
    if(!/^[a-z][a-z\d -]{0,79}$/i.test(first)||/var\(|inherit|initial|unset|important|awesome|icon|glyph/i.test(first))continue;
    const score=/brand|heading|body/.test(property)?40:/serif|monospace|system-ui/i.test(first)?2:20;
    record(fonts,first,score,sheet.url,property+': '+value.trim());
   }
  }
 }
 // Also capture explicit SVG fills and strokes from the HTML (logos and icons often have no CSS file).
 for(const tag of html.match(/<(?:svg|path|rect|circle|polygon|polyline|ellipse|stop)\b[^>]*>/gi)||[]){
  const attr=attributes(tag);
  for(const key of ['fill','stroke','stop-color']){
   const color=hexColor(attr[key]||'');
   if(color)record(colors,color,key==='fill'?30:20,homeUrl,'Inline SVG '+key);
  }
 }
 const rank=(map,limit)=>[...map.values()].sort((a,b)=>(b.score+Math.min(b.count,10))-(a.score+Math.min(a.count,10))).slice(0,limit).map(({score,count,...rest})=>rest);
 return {colors:rank(colors,24),fonts:rank(fonts,6)};
}
export async function collectWebsite(input,{reader=readPublicResource,signal=AbortSignal.timeout(30000)}={}){
 const website=normalizeWebsite(input);
 if(!website)fail('Enter the brand website first.');
 const home=await reader(website,{kind:'html',signal});
 const urls=(tags,filter)=>[...new Set(tags.map(attributes).filter(filter).map(a=>{
  try{return new URL(a.href,home.url).href;}catch{return '';}
 }).filter(Boolean))];
 const styleUrls=urls(home.text.match(/<link\b[^>]*>/gi)||[],a=>(a.rel||'').toLowerCase().split(/\s+/).includes('stylesheet')&&a.href).slice(0,4);
 const pageUrls=urls(home.text.match(/<a\b[^>]*>/gi)||[],a=>Boolean(a.href)).filter(value=>{
  try{const u=new URL(value);return u.origin===new URL(home.url).origin&&u.pathname!==new URL(home.url).pathname&&/\/(about|features?|services?|products?)(?:[/-]|$)/i.test(u.pathname)&&!u.hash;}catch{return false;}
 }).slice(0,2);
 const reads=await Promise.allSettled([...styleUrls.map(u=>reader(u,{kind:'css',signal})),...pageUrls.map(u=>reader(u,{kind:'html',signal}))]);
 const sheets=[],pages=[{url:home.url,text:pageText(home.text)}],warnings=[];
 reads.forEach((result,i)=>{
  if(result.status==='rejected'){warnings.push(i<styleUrls.length?'A stylesheet could not be read.':'An additional website page could not be read.');return;}
  if(i<styleUrls.length)sheets.push(result.value);
  else pages.push({url:result.value.url,text:pageText(result.value.text)});
 });
 if(pages[0].text.length<80)warnings.push('The page contains little readable text; it may rely on JavaScript. Review the suggestions carefully.');
 const styling=extractStyles(home.text,sheets,home.url);
 if(!styling.colors.length)warnings.push('No colour candidates were detected in accessible HTML/CSS.');
 if(!styling.fonts.length)warnings.push('No font-family candidates were detected in accessible HTML/CSS.');
 return {website,finalUrl:home.url,capturedAt:new Date().toISOString(),pages,styling,warnings:[...new Set(warnings)],sources:[...pages.map(p=>({url:p.url,kind:'page'})),...sheets.map(s=>({url:s.url,kind:'stylesheet'}))]};
}

