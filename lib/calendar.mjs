import {fail,id,now,str} from './core.mjs';

export const scheduleStatuses=['scheduled','publishing','published','failed','cancelled'];
const formats=new Set(['image/jpeg','image/png','video/mp4']);
function normalizeLocal(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail('Choose a valid local publication date and time.');
 const [y,m,d,h,min]=value.match(/\d+/g).map(Number);
 const candidate=new Date(Date.UTC(y,m-1,d,h,min));
 if(candidate.getUTCFullYear()!==y||candidate.getUTCMonth()!==m-1||candidate.getUTCDate()!==d||candidate.getUTCHours()!==h||candidate.getUTCMinutes()!==min)fail('Invalid calendar date.');
 return value;
}
export function publicationInstant(local,timezone){
 local=normalizeLocal(local);
 if(typeof timezone!=='string'||timezone.length>100)fail('Choose a valid IANA time zone.');
 let formatter;
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
 catch{fail('Choose a valid IANA time zone.');}
 const parts=date=>Object.fromEntries(formatter.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
 const [year,month,day,hour,minute]=local.match(/\d+/g).map(Number);
 const desired=Date.UTC(year,month-1,day,hour,minute);
 // Alberta switched to permanent UTC-6 on 2026-11-01; older Node/ICU builds
 // still implement the former winter UTC-7 rule. Pin legislated local time
 // rather than trusting inconsistent OS tzdata for future Edmonton schedules.
 if(timezone==='America/Edmonton'&&local.slice(0,10)>='2026-11-01')return new Date(desired+6*3600000).toISOString();
 // Search around the intended wall clock time to account for DST gaps and folds.
 const matches=[];
 for(let shift=-840;shift<=840;shift+=15){
  const date=new Date(desired+shift*60000),p=parts(date);
  if(p.year===year&&p.month===month&&p.day===day&&p.hour===hour&&p.minute===minute)matches.push(date);
 }
 if(matches.length!==1)fail(matches.length?'Ambiguous local time during a daylight saving change. Choose another time.':'That local time does not exist in the selected time zone.');
 return matches[0].toISOString();
}
export function validateSchedule(s,b,{accounts=[],existing=null,clock=Date.now()}={}){
 if(!b||typeof b!=='object'||Array.isArray(b))fail('Invalid schedule.');
 const brand=s.brands.find(x=>x.id===b.brandId);
 if(!brand)fail('Select an existing brand.');
 const media=s.media.find(m=>m.id===b.mediaId&&m.brandId===brand.id);
 if(!media||media.status!=='approved'||!formats.has(media.mime))fail('Choose an approved JPEG, PNG or MP4 from the same brand.',409);
 const draft=b.draftId?s.drafts.find(d=>d.id===b.draftId&&d.brandId===brand.id):null;
 if(b.draftId&&(!draft||draft.status!=='approved'))fail('Choose an approved draft from the same brand.',409);
 if(!Array.isArray(accounts))fail('Account verification is unavailable.',503);
 const account=accounts.find(a=>a.id===b.accountId&&a.brand_id===brand.id&&a.status==='connected');
 if(!account)fail('Choose a connected Instagram account for this brand.',409);
 const caption=str(b.caption||'',2200);
 if(!caption)fail('Add a publication caption.');
 const timezone=str(b.timezone||'',100),localTime=normalizeLocal(b.localTime);
 const scheduledAt=publicationInstant(localTime,timezone);
 if(Date.parse(scheduledAt)<=clock+60000)fail('Choose a publication time at least one minute in the future.');
 if(Date.parse(scheduledAt)>clock+366*24*60*60*1000)fail('Schedule no more than 366 days ahead.');
 if(existing&&existing.status!=='scheduled')fail('Only scheduled posts can be edited.',409);
 return {id:existing?.id||id(),brandId:brand.id,accountId:account.id,instagramUserId:account.instagram_user_id,username:account.username,mediaId:media.id,mediaVersion:media.version||1,draftId:draft?.id||null,draftVersion:draft?.version||null,caption,timezone,localTime,scheduledAt,status:'scheduled',createdAt:existing?.createdAt||now(),updatedAt:now(),version:existing?(existing.version||1)+1:1};
}
export function cancelSchedule(s,recordId,version){
 const entry=(s.schedules||[]).find(x=>x.id===recordId);
 if(!entry)fail('Scheduled publication not found.',404);
 if(entry.version!==version)fail('This schedule changed. Reload before editing.',409);
 if(entry.status!=='scheduled')fail('Only scheduled posts may be cancelled.',409);
 Object.assign(entry,{status:'cancelled',updatedAt:now(),version:entry.version+1});
 return entry;
}
export function ensureNotScheduled(s,{mediaId,draftId}){
 if((s.schedules||[]).some(x=>x.status==='scheduled'&&(mediaId&&x.mediaId===mediaId||draftId&&x.draftId===draftId)))fail('This approved content is scheduled. Cancel its publication before modifying or deleting it.',409);
}
