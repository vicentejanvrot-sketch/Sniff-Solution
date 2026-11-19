// Shared by the browser and desktop API. Scheduling edits do not change pixels.
// Earlier production versions remain usable only with evidence of unchanged copy.
export function compatibleProduction(job,plan,entry){
 if(!job||job.type!=='production'||job.brandId!==plan.brandId||job.plannerEntryId!==entry.id||job.plannerPlanId&&job.plannerPlanId!==plan.id)return false;
 if(job.plannerEntryVersion===entry.version)return true;
 const p=job.production;if(!p)return false;
 if(p.aspect!==entry.aspect||entry.format==='reel'&&p.duration!==entry.duration)return false;
 const kind=p.kind==='render'?(p.sourceSnapshot?.mime==='video/mp4'?'video':'image'):p.kind;
 if(kind!==(entry.format==='reel'?'video':'image'))return false;
 const prior=(entry.history||[]).find(h=>h.version===job.plannerEntryVersion);
 if(prior)return ['prompt','caption','onScreenText'].every(k=>(prior[k]||'')===(entry[k]||''));
 // Retained job snapshots also allow recovery once older edit history expires.
 return p.prompt===entry.prompt&&p.caption===entry.caption&&(p.overlay||'')===(entry.onScreenText||'');
}
export function compatibleOutput(media,job,plan,entry){
 return !!media&&media.brandId===plan.brandId&&media.role==='rendered'&&(entry.format==='reel'?media.mime==='video/mp4':['image/png','image/jpeg'].includes(media.mime))&&compatibleProduction(job,plan,entry);
}
