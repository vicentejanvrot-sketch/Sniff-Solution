import {stopDictation} from './dictation.js';
import {compatibleProduction,compatibleOutput} from './planner-media.js';
export function mountPlanner(el,{state,activeBrand,esc,heading,send,api,refresh:refreshApp,navigate,toast,startPlanProduction,preview,researchSelection}){
 const refresh=async()=>Object.assign(state,await refreshApp());
 const view=Symbol('planner');el.plannerView=view;
 let planId='',accounts=[],publishingBusy=false,publishMessage='';
 const expandedDays=new Set();
 const localZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const zones=[...new Set(['UTC','America/Edmonton',localZone,...Intl.supportedValuesOf('timeZone')])].sort((a,b)=>a.localeCompare(b));
 const plans=()=>(state.contentPlans||[]).filter(p=>!activeBrand||p.brandId===activeBrand);
 const q=s=>el.querySelector(s);
 const busy=e=>state.jobs.some(j=>j.plannerEntryId===e.id&&['queued','running'].includes(j.status));
 const schedule=e=>(state.schedules||[]).find(x=>x.plannerEntryId===e.id&&x.status!=='cancelled');
 const ownerPlan=e=>(state.contentPlans||[]).find(p=>p.entries.some(x=>x.id===e.id));
 const outputs=e=>state.media.filter(m=>compatibleOutput(m,state.jobs.find(j=>j.id===m.jobId),ownerPlan(e),e));
 const unfinished=e=>state.jobs.find(j=>compatibleProduction(j,ownerPlan(e),e)&&['failed','interrupted','incomplete'].includes(j.status)&&(j.mediaIds||[]).some(mid=>state.media.some(m=>m.id===mid&&m.role==='generated'&&!state.media.some(f=>f.role==='rendered'&&f.sourceId===mid))));
 const models=()=>['openai','anthropic'].filter(p=>state.providerStatus[p]&&state.settings.providers[p]?.model);
 function progress(e){const x=schedule(e);if(x){if(x.activationState==='uncertain')return 'activation needs checking';if(x.activationState==='staging')return 'activating / check status';if(x.activationState==='active'&&(x.cloudStatus||x.status)==='scheduled')return 'scheduled for automatic publishing';if(!x.activationState&&x.status==='scheduled')return 'saved locally · not activated';return x.cloudStatus||x.status;}if(busy(e))return 'request in progress';const media=outputs(e);return media.some(m=>m.status==='approved')?'ready to schedule':media.length?'media needs review':e.status;}
 const unsaved=(e,form)=>['title','purpose','prompt','onScreenText','caption','localTime'].some(k=>form.elements[k].value.trim()!==String(e[k]||'').trim());
 function eligible(e,form){const x=schedule(e);return e.status==='approved'&&!busy(e)&&!unsaved(e,form)&&(x?x.status==='scheduled'&&!x.activationState:!!form.elements.mediaId.value&&!!form.elements.accountId.value);}
 function choices(form,e){const x=schedule(e);for(const name of ['mediaId','accountId']){const select=form.elements[name];if(x){select.value=x[name];select.disabled=true;}else if(!select.value&&select.options.length===2)select.selectedIndex=1;}}
 function updateBatch(){const button=q('#plan-publish-ready'),plan=plans().find(p=>p.id===planId);if(!button||!plan)return;const count=[...el.querySelectorAll('[data-entry-form]')].filter(form=>eligible(plan.entries.find(e=>e.id===form.dataset.entryForm),form)).length;button.disabled=publishingBusy||!count;button.textContent=publishingBusy?'Activating posts…':'Schedule & activate ready posts ('+count+')';}

 function draw(){
  el.querySelectorAll('[data-plan-day]').forEach(d=>d.open?expandedDays.add(d.dataset.planDay):expandedDays.delete(d.dataset.planDay));
  const list=plans();if(!list.some(p=>p.id===planId))planId=list[0]?.id||'';
  const plan=list.find(p=>p.id===planId);
  el.innerHTML=heading('Content Planner','Choose your posting days. Review each creative brief and public caption before creating media.','<button id="new-plan" class="primary">+ New content plan</button>')+
   '<div class="note">Preparing text uses your selected text model, reserving US$'+Number(state.settings.reservePerJob).toFixed(2)+' per day. Media generation is a separate paid action. Schedule & activate uses each saved posting time and authorizes automatic Instagram publishing after media approval. Reels currently use one 5 or 10 second clip.</div><div id="plan-new"></div>'+
   (list.length?'<div class="card actions planner-toolbar"><label>Saved plan<select id="plan-select">'+list.map(p=>'<option value="'+p.id+'" '+(p.id===planId?'selected':'')+'>'+esc(p.title)+'</option>').join('')+'</select></label><button id="plan-refresh">Refresh results</button><button id="plan-export">Export plan</button><button id="plan-publish-ready" class="primary">Schedule & activate ready posts</button></div><p id="plan-publish-status" role="status">'+esc(publishMessage)+'</p>':'<div class="empty"><h3>Plan your first posting days</h3><p>Create a plan with up to seven dates, then prepare all days or write them yourself.</p></div>')+
   (plan?'<div class="card"><h2>'+esc(plan.title)+'</h2><p>'+esc(plan.goal)+'</p><p>'+esc(plan.timezone)+'</p><div class="actions planner-model-actions"><label>Text model<select id="plan-provider">'+(models().map(p=>'<option value="'+p+'">'+esc(p==='anthropic'?'Claude':'OpenAI')+' · '+esc(state.settings.providers[p].model)+'</option>').join('')||'<option value="">Configure a text model in Settings</option>')+'</select></label><button id="plan-prepare-all">Prepare unfinished days</button></div><p class="hint">Each day includes its own public caption. Prepared output always needs review. Editing or regenerating a day invalidates its approval; prior versions are retained.</p></div><div class="stack planner-days-list">'+plan.entries.map(dayCardHTML).join('')+'</div>':'');
  q('#new-plan').onclick=newPlan;
  if(!plan)return;
  q('#plan-select').onchange=e=>{planId=e.target.value;draw();};
  q('#plan-refresh').onclick=async()=>{await syncStatus();};
  q('#plan-publish-ready').onclick=()=>publishReady(plan);
  q('#plan-export').onclick=()=>{const blob=new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='content-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  q('#plan-prepare-all').onclick=()=>prepare(plan,plan.entries.filter(e=>!busy(e)&&!schedule(e)&&!e.prompt).map(e=>e.id));
  el.querySelectorAll('[data-entry-form]').forEach(form=>{
   const entry=plan.entries.find(e=>e.id===form.dataset.entryForm),locked=!!schedule(entry)||busy(entry);
   form.onsubmit=async event=>{event.preventDefault();const submit=event.submitter;submit.disabled=true;try{const b=Object.fromEntries(new FormData(form));b.version=entry.version;b.status=event.submitter.value;await send('/api/plans/'+plan.id+'/days/'+entry.id,'PUT',b);await refresh();draw();toast(b.status==='approved'?'Day approved. You can now open production.':'Day saved for review.');}catch(e){toast(e.message,true);}finally{submit.disabled=false;}};
   form.querySelector('[data-prepare]').onclick=()=>prepare(plan,[entry.id],!!entry.prompt);
   form.querySelector('[data-produce]').onclick=()=>startPlanProduction(plan,entry);
   form.querySelector('[data-media]').onclick=()=>navigate('media');
   const finish=form.querySelector('[data-finish-planner]');if(finish)finish.onclick=async()=>{finish.disabled=true;try{await send('/api/production/'+finish.dataset.finishPlanner+'/render-saved','POST',{});await refresh();if(stillHere())draw();toast('Finishing the saved original locally. Review and approve the final output when ready. No new AI generation.');}catch(e){toast(e.message,true);finish.disabled=false;}};
   choices(form,entry);
   form.querySelector('[data-schedule]').onclick=()=>scheduleDay(plan,entry,form);
   form.addEventListener('input',updateBatch);form.elements.mediaId.onchange=updateBatch;form.elements.accountId.onchange=updateBatch;
   form.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>preview(state.media.find(m=>m.id===b.dataset.preview)));
   if(locked)form.querySelectorAll('textarea,input,button[data-prepare],button[type=submit],button[data-produce]').forEach(x=>x.disabled=true);
   const saved=schedule(entry);form.querySelector('[data-schedule]').disabled=publishingBusy||busy(entry)||entry.status!=='approved'||!!(saved&&(saved.activationState==='active'||saved.status!=='scheduled'));
  });
  updateBatch();
 }
 function entryHTML(e){const media=outputs(e),locked=!!schedule(e)||busy(e);return '<form class="stack planner-day-body" data-entry-form="'+e.id+'"><label>Posting date and time<input type="datetime-local" name="localTime" required value="'+esc(e.localTime)+'"></label>'+['title','purpose','prompt','onScreenText','caption'].map(key=>'<label>'+({title:'Topic / title',purpose:'Purpose and creative assumptions',prompt:'Creative brief — sent to the media provider',onScreenText:'On-screen text — separate rendering overlay',caption:'Instagram caption — posted with this media'})[key]+(key==='title'||key==='onScreenText'?'<input':'<textarea')+' name="'+key+'" maxlength="'+({title:150,purpose:1500,prompt:8000,onScreenText:90,caption:2200})[key]+'" '+(['title','prompt','caption'].includes(key)?'required':'')+'>'+(key==='title'||key==='onScreenText'?'':esc(e[key]))+(key==='title'||key==='onScreenText'?'':'</textarea>')+'</label>').join('').replace(/<input name="(title|onScreenText)"([^>]+)>/g,(_,key,rest)=>'<input name="'+key+'"'+rest+' value="'+esc(e[key])+'">')+
  '<div class="actions"><button type="submit" value="needs-review">Save for review</button><button type="submit" value="approved">Save & approve day</button><button type="button" data-prepare>'+ (e.prompt?'Regenerate this day':'Prepare this day')+'</button><button type="button" data-produce '+(e.status!=='approved'?'disabled':'')+'>Open '+(e.format==='reel'?'Video':'Image')+' Studio</button><button type="button" data-media>Review media</button></div>'+
  (locked?'<p class="hint">'+(schedule(e)?'The saved publication is linked to this day. Activate or check its status here; Publishing Calendar remains available for changes and history.':'An active request protects this day from edits. Refresh results when it finishes.')+'</p>':'')+
  (schedule(e)?'<p class="note">Saved publication: '+esc(schedule(e).localTime.replace('T',' '))+' · '+esc(schedule(e).timezone)+' · @'+esc(schedule(e).username||'Instagram')+'. Its existing schedule is reused.</p>':'')+
  (media.length?'<div class="actions">'+media.map(m=>'<button type="button" data-preview="'+m.id+'">Preview · '+esc(m.status)+'</button>').join('')+'</div>':unfinished(e)?'<div class="note"><p>The original is saved, but its final rendering is unfinished. Finish it locally, then review and approve the new output.</p><button type="button" data-finish-planner="'+unfinished(e).id+'" '+(busy(e)?'disabled':'')+'>Finish saved output</button></div>':'<p class="hint">No compatible finished output yet. Generate media from this day, or review an existing result. Changing only the posting time preserves compatible outputs.</p>')+
  '<div class="actions"><label>Approved output<select name="mediaId"><option value="">Choose finished approved media</option>'+media.filter(m=>m.status==='approved').map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')+'</select></label><label>Instagram account<select name="accountId"><option value="">Choose account</option>'+accounts.filter(a=>a.brand_id===(state.contentPlans||[]).find(p=>p.entries.some(x=>x.id===e.id))?.brandId&&a.status==='connected').map(a=>'<option value="'+a.id+'">@'+esc(a.username)+'</option>').join('')+'</select></label><button type="button" data-schedule '+(e.status!=='approved'?'disabled':'')+'>'+(['staging','uncertain'].includes(schedule(e)?.activationState)?'Check activation status':schedule(e)?.activationState==='active'?'Activated':'Schedule & activate')+'</button></div><p class="hint">'+(e.history||[]).length+' previous versions retained. Scheduling uses the saved approved caption and this day’s posting time. Schedule & activate sends this post for automatic cloud publishing at its saved time. No calendar visit or repeated date entry is needed.</p><details><summary>Previous versions</summary>'+((e.history||[]).map(v=>'<div class="note"><strong>Version '+v.version+' · '+esc(v.updatedAt)+'</strong><p>'+esc(v.prompt)+'</p><p>Caption: '+esc(v.caption)+'</p></div>').join('')||'<p>No previous versions yet.</p>')+'</details><p data-day-status role="status"></p></form>';}
 function dayCardHTML(e){
  const approved=e.status==='approved',label=approved?'Approved':'Pending approval';
  return '<details class="card planner-day" data-plan-day="'+esc(e.id)+'" '+(expandedDays.has(e.id)?'open':'')+'><summary><span class="planner-day-date">'+esc(e.localTime.replace('T',' '))+' · '+(e.format==='reel'?'Reel · '+e.duration+' seconds':'Image')+(e.title?' <small>'+esc(e.title)+'</small>':'')+'</span><span class="planner-day-badges"><span class="pill '+(approved?'approved':'pending-approval')+'">'+label+'</span><span class="pill">'+esc(progress(e))+'</span></span></summary>'+entryHTML(e)+'</details>';
 }
 async function prepare(plan,entryIds,regenerate=false){
  if(!entryIds.length)return toast('No unfinished days to prepare. Use Regenerate on an individual day.');
  if(regenerate&&!confirm('Replace this day’s saved text with a new proposal? The previous version is retained. This makes another billed text request.'))return;
  const provider=q('#plan-provider').value;if(!provider)return toast('Configure an OpenAI or Claude text model and key in Settings.',true);
  if(!regenerate&&!confirm('Prepare '+entryIds.length+' day(s), reserving US$'+(entryIds.length*state.settings.reservePerJob).toFixed(2)+'? This generates text only.'))return;
  try{await send('/api/plans/'+plan.id+'/prepare','POST',{entryIds,provider});await refresh();draw();toast('Text preparation queued. Refresh results or follow Activity.');}catch(e){toast(e.message,true);}
 }
 async function syncStatus(){
  try{if((state.schedules||[]).some(x=>x.activationState))await send('/api/schedules/sync','POST',{});publishMessage='Publishing status refreshed.';}catch(e){publishMessage=e.message;toast(e.message,true);}await refresh();draw();
 }
 function freezePublishing(){stopDictation();el.querySelectorAll('input,textarea,select,button').forEach(x=>x.disabled=true);}
 const stillHere=()=>el.plannerView===view&&!!q('#plan-select');
 async function publishOne(plan,e,form){
  if(unsaved(e,form))throw Error('Save and approve this day’s edits before scheduling. The saved time and caption are used.');
  const existing=schedule(e);return send('/api/plans/'+plan.id+'/days/'+e.id+'/schedule','POST',{version:e.version,mediaId:existing?.mediaId||form.elements.mediaId.value,accountId:existing?.accountId||form.elements.accountId.value,activate:true});
 }
 async function scheduleDay(plan,e,form){
  if(publishingBusy)return;
  if(['staging','uncertain'].includes(schedule(e)?.activationState))return syncStatus();
  publishingBusy=true;freezePublishing();updateBatch();
  try{await publishOne(plan,e,form);publishMessage='Activated for automatic publishing at the saved time. You do not need to repeat this in Publishing Calendar.';toast(publishMessage);}catch(err){publishMessage=err.message;toast(err.message,true);}finally{publishingBusy=false;await refresh();if(stillHere())draw();}
 }
 async function publishReady(plan){
  if(publishingBusy)return;
  const entries=[...el.querySelectorAll('[data-entry-form]')].map(form=>({form,entry:plan.entries.find(e=>e.id===form.dataset.entryForm)})).filter(({entry,form})=>eligible(entry,form));
  if(!entries.length)return;
  publishingBusy=true;freezePublishing();updateBatch();let activated=0;const errors=[];
  try{for(const {entry,form} of entries){try{await publishOne(plan,entry,form);activated++;}catch(e){errors.push(entry.localTime+': '+e.message);}}publishMessage=activated+' post(s) activated for automatic publishing.'+(errors.length?' '+errors.join(' '):' All saved dates and times were reused.');toast(publishMessage,!!errors.length);}finally{publishingBusy=false;await refresh();if(stillHere())draw();}
 }

 function newPlan(){
  const area=q('#plan-new');area.innerHTML='<form id="plan-create" class="card stack"><h2>New content plan</h2><label>Brand<select name="brandId" required><option value="">Choose brand</option>'+state.brands.map(b=>'<option value="'+b.id+'" '+(b.id===activeBrand?'selected':'')+'>'+esc(b.name)+'</option>').join('')+'</select></label><label>Plan title<input name="title" required maxlength="150"></label><label>Campaign goal and context<textarea name="goal" required maxlength="5000"></textarea></label><div id="plan-days" class="stack"></div><p class="hint">The selected time zone applies to every posting day in this plan.</p><div class="actions"><button type="button" id="plan-add-day">+ Add posting day</button><button class="primary" type="submit">Save posting days</button><button type="button" id="plan-close">Close</button></div><p role="status" id="plan-create-error"></p></form>';
  const form=q('#plan-create'),days=q('#plan-days');
  if(researchSelection){form.elements.title.value='Research-informed content plan';form.elements.goal.value=('Test an original idea for this brand using the selected research. Research focus: '+(researchSelection.research.notes||'Review the sampled public posts and choose an experiment.')).slice(0,5000);const notice=document.createElement('p');notice.className='note';notice.textContent='Selected research and saved analysis will be attached as evidence. Choose your goal and posting dates; every generated day still needs review.';form.prepend(notice);}
  const zoneLabel=document.createElement('label');zoneLabel.innerHTML='Posting time zone<select name="timezone" aria-label="Posting time zone" required>'+zones.map(z=>'<option value="'+esc(z)+'" '+(z===localZone?'selected':'')+'>'+esc(z.replaceAll('_',' '))+'</option>').join('')+'</select>';
  function alignZone(){days.firstElementChild?.append(zoneLabel);days.querySelectorAll('button').forEach(b=>b.disabled=days.children.length===1);}
  function addDay(){if(days.children.length>=7)return;const row=document.createElement('div');row.className='planner-day-row';row.innerHTML='<label>Posting date and time<input type="datetime-local" name="dayTime" required></label><label>Format<select name="dayFormat"><option value="reel">Reel</option><option value="image">Image</option></select></label><label>Clip duration<select name="dayDuration"><option value="10">10 seconds</option><option value="5">5 seconds</option></select></label><button type="button">Remove day</button>';row.querySelector('button').onclick=()=>{row.remove();alignZone();};days.append(row);alignZone();}
  addDay();q('#plan-add-day').onclick=addDay;q('#plan-close').onclick=()=>area.replaceChildren();
  form.onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const b=Object.fromEntries(new FormData(form));if(researchSelection){b.researchId=researchSelection.research.id;b.researchAnalysis=researchSelection.analysis.slice(0,10000);}b.days=[...days.children].map(row=>({localTime:row.querySelector('[name=dayTime]').value,format:row.querySelector('[name=dayFormat]').value,duration:Number(row.querySelector('[name=dayDuration]').value)}));const plan=await send('/api/plans','POST',b);planId=plan.id;await refresh();researchSelection=null;draw();toast('Posting days saved. Prepare their briefs or enter your own.');}catch(e){q('#plan-create-error').textContent=e.message;}finally{button.disabled=false;}};
 }
 draw();if(researchSelection)newPlan();api('/api/social/accounts').then(result=>{if(!el.isConnected||el.plannerView!==view)return;accounts=result.accounts||[];el.querySelectorAll('[name=accountId]').forEach(select=>{const form=select.closest('form'),entry=(state.contentPlans||[]).find(p=>p.entries.some(e=>e.id===form.dataset.entryForm));select.innerHTML='<option value="">Choose account</option>'+accounts.filter(a=>a.brand_id===entry?.brandId&&a.status==='connected').map(a=>'<option value="'+a.id+'">@'+esc(a.username)+'</option>').join('');const e=(state.contentPlans||[]).flatMap(p=>p.entries).find(e=>e.id===form.dataset.entryForm);if(e)choices(form,e);});updateBatch();}).catch(()=>{});
}
