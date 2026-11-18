// Conservative state policy: only provably pre-publication failures are retryable.
// Meta timeouts after creating/starting a container require manual review.
export function classifyPublishingFailure(error,{metaRequestStarted=false,publishRequestStarted=false}={}){
 const message=String(error?.message||error||'Unknown publishing error').slice(0,300);
 if(publishRequestStarted)return {status:'needs_reconciliation',category:'uncertain_publish',retryable:false,message};
 if(metaRequestStarted)return {status:'needs_reconciliation',category:'meta_processing',retryable:false,message};
 if(/credential expired|reconnect/i.test(message))return {status:'failed',category:'credential_expired',retryable:true,message};
 if(/connection unavailable|account.*unavailable/i.test(message))return {status:'failed',category:'account_unavailable',retryable:true,message};
 if(/staged media|media link generation|cloud storage|storage request|media staging/i.test(message))return {status:'failed',category:'media_unavailable',retryable:true,message};
 return {status:'failed',category:'preflight',retryable:true,message};
}
export function assessPublishingHealth(jobs,{now=Date.now(),staleAfterMs=5*60_000}={}){
 const summary={scheduled:0,publishing:0,published:0,failed:0,cancelled:0,needs_reconciliation:0,overdue:0,stalled:0};
 const warnings=[];
 for(const job of jobs||[]){
  if(Object.hasOwn(summary,job.status))summary[job.status]++;
  if(job.status==='scheduled'&&Date.parse(job.scheduled_at)<now-staleAfterMs){
   summary.overdue++;warnings.push({id:job.id,kind:'overdue',message:'Scheduled publication is overdue; check cloud worker before rescheduling.'});
  }
  if(job.status==='publishing'&&Date.parse(job.updated_at)<now-10*60_000){
   summary.stalled++;warnings.push({id:job.id,kind:'stalled',message:'Publishing has not advanced; do not retry until Instagram is checked.'});
  }
 }
 return {summary,warnings,checkedAt:new Date(now).toISOString()};
}
