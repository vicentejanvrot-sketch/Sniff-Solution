// Phase 3 domain rules. This module does not make live Meta requests.
import {randomUUID} from 'node:crypto';
const fail=(message)=>{throw Object.assign(new Error(message),{status:400});};
const formats=new Map([['image/jpeg','image'],['video/mp4','reel']]);
export function createSchedule({asset,account,scheduledAt,timeZone,caption,now=new Date()}){
 if(!asset||asset.status!=='approved')fail('Approve the media before scheduling.');
 if(!account||account.status!=='connected'||!account.id||account.brandId!==asset.brandId)fail('Choose a connected Instagram account for this brand.');
 if(!formats.has(asset.mime))fail('Select an approved JPEG or MP4. Other images require conversion before publication.');
 if(typeof scheduledAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(scheduledAt))fail('Choose a date and time with an explicit UTC offset.');
 const due=new Date(scheduledAt);
 if(!Number.isFinite(due.getTime())||due<=now)fail('Choose a future publishing date.');
 try{if(!timeZone)throw Error();new Intl.DateTimeFormat('en',{timeZone}).format(due);}catch{fail('Choose a valid IANA time zone.');}
 const text=caption??asset.caption??'';
 if(typeof text!=='string'||Array.from(text).length>2200)fail('Caption must contain no more than 2,200 characters.');
 return {id:randomUUID(),brandId:asset.brandId,accountId:account.id,assetId:asset.id,assetVersion:asset.version||1,format:formats.get(asset.mime),caption:text,scheduledAt:due.toISOString(),timeZone,status:'scheduled',attempts:0,createdAt:now.toISOString()};
}
export function assertApprovedVersion(job,asset){
 if(!asset||asset.id!==job.assetId||asset.brandId!==job.brandId||asset.status!=='approved'||(asset.version||1)!==job.assetVersion)fail('Media approval changed. Review and schedule again.');
}
export function cancelSchedule(job,now=new Date()){
 if(!['scheduled','queued'].includes(job.status))fail('Only scheduled or queued posts can be cancelled.');
 return {...job,status:'cancelled',cancelledAt:now.toISOString()};
}
