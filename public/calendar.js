const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const dateLabel=d=>d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
const clampDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Edmonton';
const zoneChoices=()=>Array.from(new Set(['America/Edmonton','UTC',...(Intl.supportedValuesOf?.('timeZone')||['America/Vancouver','America/Denver','America/Chicago','America/New_York','America/Toronto','Europe/London','Asia/Tokyo'])])).sort((a,b)=>a==='America/Edmonton'?-1:b==='America/Edmonton'?1:a.localeCompare(b));
const defaultLocalClock=zone=>{if(zone==='America/Edmonton')return new Date(Date.now()-21600000).toISOString().slice(0,16);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;};
const currentZoneClock=zone=>{if(zone==='America/Edmonton')return new Date(Date.now()-21600000).toISOString().slice(11,16)+' (UTC−06:00, Alberta Time)';try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());}catch{return 'Unavailable';}};
const zoneOptions=selected=>zoneChoices().map(z=>'<option value="'+z+'" '+(selected===z?'selected':'')+'>'+z.replaceAll('_',' ')+(z==='America/Edmonton'?' — Alberta Time (UTC−06:00 permanent)':'')+'</option>').join('');
const dateAt=(base,days)=>new Date(base.getFullYear(),base.getMonth(),base.getDate()+days);
const daysOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
const startWeek=d=>dateAt(d,-((d.getDay()+6)%7));
export function calendarStatus(entry){
 const status=entry?.cloudStatus||entry?.status||'scheduled';
 if(status==='published')return {name:'Published',icon:'✓',style:'published',description:'Successfully published to Instagram'};
 if(status==='failed')return {name:'Failed',icon:'✕',style:'failed',description:'Instagram publication failed'};
 if(status==='needs_reconciliation'||status==='uncertain'||entry?.activationState==='uncertain')return {name:'Needs review',icon:'!',style:'warning',description:'Publication result uncertain; check Instagram before retrying'};
 if(status==='publishing'||status==='queued')return {name:'Publishing',icon:'↻',style:'publishing',description:'Cloud publishing in progress'};
 if(status==='cancelled')return {name:'Cancelled',icon:'−',style:'cancelled',description:'Publication cancelled'};
 return {name:'Scheduled',icon:'◷',style:'scheduled',description:entry?.activationState==='active'?'Activated for Instagram publishing':'Scheduled locally; activate for live publishing'};
}
const publishedTime=entry=>entry.publishedAt?new Date(entry.publishedAt).toISOString().replace('T',' ').replace(/Z$/,' UTC'):null;
const verifiedLink=value=>{
 if(typeof value!=='string')return null;
 try{const url=new URL(value);return url.protocol==='https:'&&['www.instagram.com','instagram.com'].includes(url.hostname)&&/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)&&!url.search&&!url.hash?url.href:null;}catch{return null;}
};
const statusBadge=entry=>{const state=calendarStatus(entry);return '<span class="cal-status cal-status--'+state.style+'" title="'+state.description+'" aria-label="'+state.description+'"><span class="cal-status-icon" aria-hidden="true">'+state.icon+'</span>'+state.name+'</span>';};
export function mountCalendar(el,{state,activeBrand,esc,heading,api,send,refresh,toast}){
 let mode='month',cursor=clampDay(new Date()),items=state.schedules||[],accounts=[],editing=null;
 const media=()=>state.media.filter(m=>m.status==='approved'&&['image/png','image/jpeg','video/mp4'].includes(m.mime));
 const drafts=()=>state.drafts.filter(d=>d.status==='approved');
 el.innerHTML=heading('Publishing Calendar','Review schedules and optionally activate individual posts for live Instagram publishing.')+
 '<div class="calendar-bar card"><div class="actions"><button id="cal-prev" aria-label="Previous period">←</button><button id="cal-today">Today</button><button id="cal-next" aria-label="Next period">→</button></div><h2 id="cal-period"></h2><div class="actions"><select id="cal-view" aria-label="Calendar view"><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option></select><button class="primary" id="cal-create">+ Schedule post</button></div></div>'+
 '<div class="note">Scheduling remains local until you explicitly activate an approved future post for cloud publishing. Activation makes that post eligible for public Instagram publishing when due. The cloud worker must also be enabled in Render.</div><div id="cal-body" class="card"></div><div class="section-title"><h2>Publication queue</h2><span id="cal-count"></span></div><div id="cal-list" class="card"></div><div class="actions"><button id="cal-sync">Refresh cloud publishing status</button></div><div class="section-title"><h2>Publishing health</h2><button id="cal-health-refresh" type="button">Check health</button></div><div id="cal-health" class="card"><p class="hint">Checking cloud publishing health…</p></div><div class="section-title"><h2>Publishing history</h2><span id="cal-history-count"></span></div><div id="cal-history" class="card"></div><div id="cal-form-area"></div>';
 const q=id=>el.querySelector(id),visible=()=>items.filter(x=>!activeBrand||x.brandId===activeBrand);
 function tile(entry){
  return '<button class="cal-event" data-id="'+esc(entry.id)+'" title="'+esc(entry.caption)+'"><strong>'+esc(entry.localTime.slice(11))+'</strong> · '+esc(entry.username||'Instagram')+'<small>'+statusBadge(entry)+'</small></button>';
 }
 function dayCell(d,compact=false){
  const key=dateKey(d),events=visible().filter(x=>x.localTime.startsWith(key));
  return '<div class="cal-cell '+(key===dateKey(new Date())?'cal-today':'')+'"><button class="cal-date" data-date="'+key+'">'+d.getDate()+'</button>'+events.map(tile).join('')+(compact&&events.length===0?'<small class="hint">No posts</small>':'')+'</div>';
 }
 function draw(){
  const current=visible();
  let label='',body='';
  if(mode==='month'){
   label=dateLabel(cursor);
   const first=new Date(cursor.getFullYear(),cursor.getMonth(),1),offset=(first.getDay()+6)%7,count=daysOfMonth(cursor),total=Math.ceil((offset+count)/7)*7;
   body='<div class="cal-grid">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<strong class="cal-weekday">'+x+'</strong>').join('');
   for(let i=0;i<total;i++){const d=dateAt(first,i-offset);body+='<div class="'+(d.getMonth()!==cursor.getMonth()?'cal-outside':'')+'">'+dayCell(d)+'</div>';}
   body+='</div>';
  }else if(mode==='week'){
   const start=startWeek(cursor),end=dateAt(start,6);
   label=start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+end.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
   body='<div class="cal-grid cal-seven">'+Array.from({length:7},(_,i)=>{const d=dateAt(start,i);return '<div><strong class="cal-weekday">'+d.toLocaleDateString(undefined,{weekday:'short'})+'</strong>'+dayCell(d,true)+'</div>';}).join('')+'</div>';
  }else{
   label=cursor.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
   body='<div class="cal-day">'+dayCell(cursor,true)+'</div>';
  }
  q('#cal-period').textContent=label;q('#cal-body').innerHTML=body;
  const sorted=[...current].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));
  q('#cal-count').textContent=sorted.length+' posts';
  q('#cal-list').innerHTML=sorted.length?'<div class="table-wrap"><table><thead><tr><th>Scheduled for</th><th>Brand / account</th><th>Asset</th><th>Status</th><th>Action</th></tr></thead><tbody>'+sorted.map(x=>{
   const b=state.brands.find(v=>v.id===x.brandId),m=state.media.find(v=>v.id===x.mediaId);
   return '<tr><td>'+esc(x.localTime.replace('T',' '))+'<small>'+esc(x.timezone)+'</small></td><td>'+esc(b?.name||'Deleted brand')+'<small>@'+esc(x.username)+'</small></td><td>'+esc(m?.name||'Missing media')+'</td><td>'+statusBadge(x)+'</td><td><button data-id="'+esc(x.id)+'">'+(x.status==='scheduled'&&!x.activationState?'Edit':'View')+'</button></td></tr>';
  }).join('')+'</tbody></table></div>':'<p class="hint">No scheduled posts. Approve media in Media Library, then select Schedule post.</p>';
  const completed=[...current].filter(x=>['published','failed','cancelled','needs_reconciliation'].includes(x.cloudStatus||x.status)).sort((a,b)=>String(b.publishedAt||b.updatedAt||'').localeCompare(String(a.publishedAt||a.updatedAt||'')));
  q('#cal-history-count').textContent=completed.length+' records';
  q('#cal-history').innerHTML=completed.length?'<div class="table-wrap"><table><thead><tr><th>Status</th><th>Account</th><th>Scheduled for</th><th>Published at (UTC)</th><th>Instagram media ID</th><th>Post link</th><th>Details</th></tr></thead><tbody>'+completed.map(x=>'<tr><td>'+statusBadge(x)+'</td><td>@'+esc(x.username||'Instagram')+'</td><td>'+esc(x.localTime.replace('T',' '))+'<small>'+esc(x.timezone)+'</small></td><td>'+esc(publishedTime(x)||'—')+'</td><td>'+esc(x.instagramMediaId||'—')+'</td><td>'+(verifiedLink(x.permalink)?'<a href="'+esc(verifiedLink(x.permalink))+'" target="_blank" rel="noopener noreferrer">View Instagram post</a>':'—')+'</td><td><button data-id="'+esc(x.id)+'">View</button></td></tr>').join('')+'</tbody></table></div>':'<p class="hint">No completed publications yet. When a live post is confirmed, its result will appear here after Refresh cloud publishing status.</p>';
  el.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openForm(items.find(x=>x.id===b.dataset.id)));
  el.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{cursor=new Date(b.dataset.date+'T12:00:00');mode='day';q('#cal-view').value=mode;draw();});
 }
 async function loadHealth(){
  const target=q('#cal-health');if(!target)return;
  try{
   const data=await api('/api/schedules/health');
   const counts=data.summary||{};
   const labels=[['published','Published'],['scheduled','Scheduled'],['failed','Failed'],['needs_reconciliation','Needs review'],['overdue','Overdue'],['stalled','Stalled']];
   target.innerHTML='<div class="actions">'+labels.map(([key,label])=>'<span class="cal-health-metric"><strong>'+Number(counts[key]||0)+'</strong> '+label+'</span>').join('')+'</div>'
    +(data.warnings?.length?'<div class="note">'+data.warnings.map(w=>'<p><strong>'+esc(w.kind)+':</strong> '+esc(w.message)+'</p>').join('')+'</div>':'<p class="hint">No overdue or stalled cloud publications detected.</p>')
    +'<small class="hint">Checked '+esc(data.checkedAt||'')+' UTC. Updates on demand; a sleeping free instance may delay scheduled publishing.</small>';
  }catch{target.innerHTML='<p class="hint">Publishing health unavailable. Verify the cloud service and refresh again; do not duplicate a pending post.</p>';}
 }
 function optionList(list,selected,display){
  return '<option value="">Select…</option>'+list.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(display(x))+'</option>').join('');
 }
 function updateForm(){
  const area=q('#cal-form-area'),form=area.querySelector('form');
  if(!form)return;
  const brandId=form.elements.brandId.value;
  const assets=media().filter(x=>x.brandId===brandId),approvedDrafts=drafts().filter(x=>x.brandId===brandId);
  const validAccounts=accounts.filter(a=>a.brand_id===brandId&&a.status==='connected');
  form.elements.accountId.innerHTML=optionList(validAccounts,editing?.accountId,a=>'@'+a.username);
  form.elements.mediaId.innerHTML=optionList(assets,editing?.mediaId,a=>a.name);
  form.elements.draftId.innerHTML='<option value="">No draft — use media caption</option>'+approvedDrafts.map(d=>'<option value="'+esc(d.id)+'" '+(editing?.draftId===d.id?'selected':'')+'>'+esc(d.title)+'</option>').join('');
  form.elements.draftId.onchange=()=>{const d=approvedDrafts.find(x=>x.id===form.elements.draftId.value);if(d)form.elements.caption.value=d.text.slice(0,2200);};
  form.elements.mediaId.onchange=()=>{const m=assets.find(x=>x.id===form.elements.mediaId.value);if(m){form.elements.caption.value=(m.caption||'').slice(0,2200);previewAsset(m);}};
  const selected=assets.find(x=>x.id===form.elements.mediaId.value);if(selected)previewAsset(selected);
  else area.querySelector('#cal-preview').textContent='Select approved media to preview it.';
 }
 let previewUrl;
 async function previewAsset(m){
  const target=q('#cal-preview');if(!target)return;
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  target.textContent='Loading preview…';
  try{const blob=await api('/api/media/'+m.id);if(!target.isConnected)return;previewUrl=URL.createObjectURL(blob);
   target.innerHTML=m.mime.startsWith('image/')?'<img alt="'+esc(m.name)+'" class="cal-preview-image">':'<video controls class="cal-preview-image"></video>';
   target.firstChild.src=previewUrl;
  }catch{target.textContent='Preview unavailable. The original remains available in Media Library.';}
 }
 function closeForm(){editing=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;q('#cal-form-area').replaceChildren();}
 function openForm(record=null){
  editing=record;
  const canEdit=!record||(record.status==='scheduled'&&!record.activationState);
  const brands=state.brands.filter(b=>!activeBrand||b.id===activeBrand);
  const initialBrand=record?.brandId||activeBrand||brands[0]?.id||'';
  const selectedZone=record?.timezone||timeZone();const nextHour=defaultLocalClock(selectedZone);const t=record?.localTime||(dateKey(cursor)===dateKey(new Date())?nextHour:dateKey(cursor)+'T12:00');
  q('#cal-form-area').innerHTML='<section class="card cal-editor"><div class="section-title"><h2>'+ (record?'Publication details':'Schedule a publication')+'</h2><button id="cal-close">Close</button></div><form id="cal-form" class="stack"><div class="form-grid"><label>Brand<select name="brandId" required '+(record?'disabled':'')+'>'+optionList(brands,initialBrand,b=>b.name)+'</select></label><label>Instagram account<select name="accountId" required></select></label><label>Approved image or video<select name="mediaId" required></select></label><label>Approved draft (optional)<select name="draftId"></select></label><label>Local date and time<input type="datetime-local" name="localTime" value="'+esc(t)+'" required></label><label>Time zone<select name="timezone" required>'+zoneOptions(record?.timezone||timeZone())+'</select><small id="cal-zone-clock" class="hint"></small></label></div><label>Caption and hashtags<textarea name="caption" maxlength="2200" required>'+esc(record?.caption||'')+'</textarea></label><div id="cal-preview" class="cal-preview"></div><p class="hint">Live activation converts PNG/JPEG to a 4:5 JPEG with margins when necessary. Once publishing begins, cancellation may no longer be possible. Only activate content you intend to make public.</p><div class="actions">'+(record?.status==='scheduled'&&!record.activationState?'<button class="primary" type="button" id="cal-activate">Activate live publishing</button>':'')+(canEdit?'<button class="primary" type="submit">'+(record?'Save changes':'Schedule post')+'</button>':'')+(record?.status==='scheduled'?'<button class="danger" type="button" id="cal-cancel">Cancel publication</button>':'')+'</div></form></section>';
  if(record){
   const details=document.createElement('div');details.className='card';details.id='cal-publication-proof';
   details.innerHTML='<h3>Publishing result</h3><p>'+statusBadge(record)+'</p>'
   +'<p><strong>Scheduled:</strong> '+esc(record.localTime.replace('T',' '))+' ('+esc(record.timezone)+')</p>'
   +'<p><strong>Published:</strong> '+esc(publishedTime(record)||'Not yet confirmed')+'</p>'
   +'<p><strong>Instagram media ID:</strong> '+esc(record.instagramMediaId||'Not assigned')+'</p>'
   +(verifiedLink(record.permalink)?'<p><a href="'+esc(verifiedLink(record.permalink))+'" target="_blank" rel="noopener noreferrer">View the published post on Instagram</a></p>':'')
   +(record.lastError?'<p class="hint"><strong>Review note:</strong> '+esc(record.lastError)+'</p>':'')
   +'<div class="actions"><button type="button" id="cal-show-audit">View audit history</button>'+(record.status==='failed'&&record.cloudStatus==='failed'&&!record.instagramMediaId&&!record.containerId?'<button type="button" id="cal-retry">Retry failed preflight</button>':'')+'</div><div id="cal-audit"></div>';
   q('#cal-form-area').querySelector('#cal-form').prepend(details);
   q('#cal-show-audit').onclick=async()=>{
    const target=q('#cal-audit');target.textContent='Loading audit history…';
    try{const result=await api('/api/schedules/'+record.id+'/history');target.innerHTML='<h4>Publication events</h4>'+(result.events||[]).map(e=>'<p><strong>'+esc(e.event_type)+'</strong> '+esc(e.created_at||'')+' — '+esc(e.detail||'')+'</p>').join('')||'<p>No audit events yet.</p>';}catch{target.textContent='Unable to load audit history.';}
   };
   const retry=q('#cal-retry');
   if(retry)retry.onclick=async()=>{
    if(!confirm('Retry this confirmed pre-publication failure? Sniff will publish the approved post as soon as the cloud worker runs. Do not proceed if it may already be on Instagram.'))return;
    retry.disabled=true;try{await send('/api/schedules/'+record.id+'/retry','POST',{});await refresh();items=await api('/api/schedules');closeForm();draw();loadHealth();toast('Preflight failure queued for manual retry.');}catch(e){retry.disabled=false;toast(e.message,true);}
   };
  }
  const form=q('#cal-form');form.elements.brandId.value=initialBrand;
  const updateZoneClock=()=>{const output=q('#cal-zone-clock');if(output)output.textContent='Current local time: '+currentZoneClock(form.elements.timezone.value);};
  form.elements.timezone.onchange=updateZoneClock;updateZoneClock();
  form.elements.brandId.onchange=()=>{editing=null;updateForm();};
  updateForm();
  q('#cal-close').onclick=closeForm;
  if(!canEdit){form.querySelectorAll('input,select,textarea').forEach(x=>x.disabled=true);}
  if(record?.status==='scheduled'&&!record.activationState)q('#cal-activate').onclick=async()=>{
   if(!confirm('Activate this approved post for live Instagram publishing at the scheduled time? This is a PUBLIC action and cannot be undone after publishing begins.'))return;
   const button=q('#cal-activate');button.disabled=true;
   try{await send('/api/schedules/'+record.id+'/activate','POST',{});await refresh();items=await api('/api/schedules');closeForm();draw();toast('Cloud publication activated.');}catch(err){toast(err.message,true);button.disabled=false;}
  };
  if(record?.status==='scheduled')q('#cal-cancel').onclick=async()=>{
   if(!confirm('Cancel this scheduled publication? If cloud publishing has already started, cancellation will not be possible.'))return;
   try{await send('/api/schedules/'+record.id+'/cancel','POST',{version:record.version});await refresh();items=await api('/api/schedules');closeForm();draw();toast('Publication cancelled.');}
   catch(e){toast(e.message,true);}
  };
  if(!canEdit)return;
  form.onsubmit=async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   const data=Object.fromEntries(new FormData(form));if(record)data.brandId=record.brandId;
   if(record)data.version=record.version;
   try{await send(record?'/api/schedules/'+record.id:'/api/schedules',record?'PUT':'POST',data);await refresh();items=await api('/api/schedules');closeForm();draw();toast(record?'Schedule updated.':'Publication scheduled locally.');}
   catch(err){toast(err.message,true);button.disabled=false;}
  };
 }
 q('#cal-view').onchange=e=>{mode=e.target.value;draw();};
 q('#cal-prev').onclick=()=>{cursor=mode==='month'?new Date(cursor.getFullYear(),cursor.getMonth()-1,1):dateAt(cursor,mode==='week'?-7:-1);draw();};
 q('#cal-next').onclick=()=>{cursor=mode==='month'?new Date(cursor.getFullYear(),cursor.getMonth()+1,1):dateAt(cursor,mode==='week'?7:1);draw();};
 q('#cal-today').onclick=()=>{cursor=clampDay(new Date());draw();};
 q('#cal-create').onclick=()=>openForm();
 q('#cal-health-refresh').onclick=loadHealth;
 q('#cal-sync').onclick=async()=>{const button=q('#cal-sync');button.disabled=true;try{items=await send('/api/schedules/sync','POST',{});await refresh();draw();loadHealth();toast('Cloud publishing status refreshed.');}catch(err){toast(err.message,true);}finally{button.disabled=false;}};
 draw();loadHealth();
 api('/api/social/accounts').then(v=>{accounts=v.accounts||[];if(q('#cal-form'))updateForm();if(!accounts.length)toast('Connect an Instagram account in Social Accounts before scheduling.',true);}).catch(e=>toast(e.message,true));
}
