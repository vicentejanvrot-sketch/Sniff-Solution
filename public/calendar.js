const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
const dateLabel=d=>d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
const clampDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Edmonton';
const dateAt=(base,days)=>new Date(base.getFullYear(),base.getMonth(),base.getDate()+days);
const daysOfMonth=d=>new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
const startWeek=d=>dateAt(d,-((d.getDay()+6)%7));
const statusLabel=s=>s.replaceAll('-',' ');
export function mountCalendar(el,{state,activeBrand,esc,heading,api,send,refresh,toast}){
 let mode='month',cursor=clampDay(new Date()),items=state.schedules||[],accounts=[],editing=null;
 const media=()=>state.media.filter(m=>m.status==='approved'&&['image/png','image/jpeg','video/mp4'].includes(m.mime));
 const drafts=()=>state.drafts.filter(d=>d.status==='approved');
 el.innerHTML=heading('Publishing Calendar','Schedule approved Instagram content. Live publishing is disabled.')+
 '<div class="calendar-bar card"><div class="actions"><button id="cal-prev" aria-label="Previous period">←</button><button id="cal-today">Today</button><button id="cal-next" aria-label="Next period">→</button></div><h2 id="cal-period"></h2><div class="actions"><select id="cal-view" aria-label="Calendar view"><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option></select><button class="primary" id="cal-create">+ Schedule post</button></div></div>'+
 '<div class="note">Only approved JPEG, PNG and MP4 assets may be scheduled. Posts stay in the calendar until publishing is explicitly enabled in a later release.</div><div id="cal-body" class="card"></div><div class="section-title"><h2>Publication queue</h2><span id="cal-count"></span></div><div id="cal-list" class="card"></div><div id="cal-form-area"></div>';
 const q=id=>el.querySelector(id),visible=()=>items.filter(x=>!activeBrand||x.brandId===activeBrand);
 function tile(entry){
  return '<button class="cal-event" data-id="'+esc(entry.id)+'" title="'+esc(entry.caption)+'"><strong>'+esc(entry.localTime.slice(11))+'</strong> · '+esc(entry.username||'Instagram')+'<small>'+esc(statusLabel(entry.status))+'</small></button>';
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
   return '<tr><td>'+esc(x.localTime.replace('T',' '))+'<small>'+esc(x.timezone)+'</small></td><td>'+esc(b?.name||'Deleted brand')+'<small>@'+esc(x.username)+'</small></td><td>'+esc(m?.name||'Missing media')+'</td><td>'+esc(statusLabel(x.status))+'</td><td><button data-id="'+esc(x.id)+'">'+(x.status==='scheduled'?'Edit':'View')+'</button></td></tr>';
  }).join('')+'</tbody></table></div>':'<p class="hint">No scheduled posts. Approve media in Media Library, then select Schedule post.</p>';
  el.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openForm(items.find(x=>x.id===b.dataset.id)));
  el.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{cursor=new Date(b.dataset.date+'T12:00:00');mode='day';q('#cal-view').value=mode;draw();});
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
  const canEdit=!record||record.status==='scheduled';
  const brands=state.brands.filter(b=>!activeBrand||b.id===activeBrand);
  const initialBrand=record?.brandId||activeBrand||brands[0]?.id||'';
  const nextHour=new Date(Date.now()+3600000);const t=record?.localTime||(dateKey(cursor===null?nextHour:cursor)+'T'+(dateKey(cursor)===dateKey(new Date())?pad(nextHour.getHours())+':'+pad(nextHour.getMinutes()):'12:00'));
  q('#cal-form-area').innerHTML='<section class="card cal-editor"><div class="section-title"><h2>'+ (record?'Publication details':'Schedule a publication')+'</h2><button id="cal-close">Close</button></div><form id="cal-form" class="stack"><div class="form-grid"><label>Brand<select name="brandId" required '+(record?'disabled':'')+'>'+optionList(brands,initialBrand,b=>b.name)+'</select></label><label>Instagram account<select name="accountId" required></select></label><label>Approved image or video<select name="mediaId" required></select></label><label>Approved draft (optional)<select name="draftId"></select></label><label>Local date and time<input type="datetime-local" name="localTime" value="'+esc(t)+'" required></label><label>Time zone<input name="timezone" value="'+esc(record?.timezone||timeZone())+'" required maxlength="100" placeholder="America/Edmonton"></label></div><label>Caption and hashtags<textarea name="caption" maxlength="2200" required>'+esc(record?.caption||'')+'</textarea></label><div id="cal-preview" class="cal-preview"></div><p class="hint">Calendar scheduling only. This version does not send posts to Instagram. Times that are ambiguous due to daylight saving changes are rejected.</p><div class="actions">'+(canEdit?'<button class="primary" type="submit">'+(record?'Save changes':'Schedule post')+'</button>':'')+(record?.status==='scheduled'?'<button class="danger" type="button" id="cal-cancel">Cancel publication</button>':'')+'</div></form></section>';
  const form=q('#cal-form');form.elements.brandId.value=initialBrand;
  form.elements.brandId.onchange=()=>{editing=null;updateForm();};
  updateForm();
  q('#cal-close').onclick=closeForm;
  if(!canEdit){form.querySelectorAll('input,select,textarea').forEach(x=>x.disabled=true);return;}
  if(record?.status==='scheduled')q('#cal-cancel').onclick=async()=>{
   if(!confirm('Cancel this scheduled publication? No content will be sent.'))return;
   try{await send('/api/schedules/'+record.id+'/cancel','POST',{version:record.version});await refresh();items=state.schedules||[];closeForm();draw();toast('Publication cancelled.');}
   catch(e){toast(e.message,true);}
  };
  form.onsubmit=async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;
   const data=Object.fromEntries(new FormData(form));if(record)data.brandId=record.brandId;
   if(record)data.version=record.version;
   try{await send(record?'/api/schedules/'+record.id:'/api/schedules',record?'PUT':'POST',data);await refresh();items=state.schedules||[];closeForm();draw();toast(record?'Schedule updated.':'Publication scheduled locally.');}
   catch(err){toast(err.message,true);button.disabled=false;}
  };
 }
 q('#cal-view').onchange=e=>{mode=e.target.value;draw();};
 q('#cal-prev').onclick=()=>{cursor=mode==='month'?new Date(cursor.getFullYear(),cursor.getMonth()-1,1):dateAt(cursor,mode==='week'?-7:-1);draw();};
 q('#cal-next').onclick=()=>{cursor=mode==='month'?new Date(cursor.getFullYear(),cursor.getMonth()+1,1):dateAt(cursor,mode==='week'?7:1);draw();};
 q('#cal-today').onclick=()=>{cursor=clampDay(new Date());draw();};
 q('#cal-create').onclick=()=>openForm();
 draw();
 api('/api/social/accounts').then(v=>{accounts=v.accounts||[];if(q('#cal-form'))updateForm();if(!accounts.length)toast('Connect an Instagram account in Social Accounts before scheduling.',true);}).catch(e=>toast(e.message,true));
}
