import {mountPlanner} from './planner.js';
import {mountAnalytics} from './analytics.js';
import {mountGrowth} from './growth.js';
import {mountSocial} from './social.js';
import {mountCalendar} from './calendar.js';
import {elapsedLabel} from './timing.js';
import {dailyCostsHTML,bindDailyCosts} from './reconciliation.js';
import {mountStudio,visibleMedia} from './production.js';
import {stopDictation,observeDictation} from './dictation.js';
import {clearThumbnails,thumbnailHTML,loadThumbnails} from './thumbnails.js';
const app=document.querySelector('#app'),modal=document.querySelector('#modal');
let plannerProductionSelection=null;
let plannerResearchSelection=null;
let state,page='dashboard',activeBrand=localStorage.getItem('sniff-brand')||'',activeSkill='',activeDraft='',toastTimer;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v==null?'Unpriced':'US$'+Number(v).toFixed(4);
const date=v=>new Date(v).toLocaleString();
const selectedBrand=()=>state.brands.find(b=>b.id===activeBrand);
const filtered=items=>items.filter(x=>!activeBrand||x.brandId===activeBrand||(x.type==='brand-research'&&!x.brandId));
const pill=status=>'<span class="pill '+esc(status)+'">'+esc(status.replaceAll('-',' '))+'</span>';
function toast(message,error=false){const el=document.querySelector('#toast');clearTimeout(toastTimer);el.textContent=message;el.className=error?'error':'';el.style.display='block';toastTimer=setTimeout(()=>el.style.display='none',6500);}
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'X-Sniff-Client':'1',...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});
 if(!response.ok){let msg;try{msg=(await response.json()).error;}catch{}throw new Error(msg||'Request failed.');}
 return response.headers.get('content-type')?.includes('application/json')?response.json():response.blob();
}
const send=(url,method,data)=>api(url,{method,body:JSON.stringify(data)});
async function refresh(){state=await api('/api/state');if(activeBrand&&!state.brands.some(b=>b.id===activeBrand))activeBrand='';if(!activeBrand&&state.brands.length===1)activeBrand=state.brands[0].id;return state;}
function navigate(next){page=next;activeSkill='';render();}
function heading(title,description,action=''){return '<div class="heading"><div><div class="eyebrow">AI Marketing Studio</div><h1>'+esc(title)+'</h1><p>'+esc(description)+'</p></div>'+action+'</div>';}
function empty(title,text,button=''){return '<div class="empty"><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+button+'</div>';}
function brandOptions(){return '<option value="">Choose a brand</option>'+state.brands.map(b=>'<option value="'+b.id+'" '+(b.id===activeBrand?'selected':'')+'>'+esc(b.name)+'</option>').join('');}
function render(){
 const nav=[['dashboard','Workspace'],['brands','Brand Studio'],['planner','Content Planner'],['analytics','Performance'],['research','Content Research'],['inbox','Comments & messages'],['skills','Content Skills'],['images','Image Studio'],['video','Video Studio'],['drafts','Drafts & Review'],['media','Media Library'],['social','Social Accounts'],['calendar','Publishing Calendar'],['jobs','Activity'],['settings','Settings & Costs']];
 app.innerHTML='<div class="layout"><aside><div class="logo"><span class="mark">S</span><div><strong>Sniff Solution</strong><small>YOUR GROWTH WORKSPACE</small></div></div><nav aria-label="Main navigation">'+nav.map(([id,label])=>'<button data-page="'+id+'" class="'+(page===id?'active':'')+'" '+(page===id?'aria-current="page"':'')+'>'+label+(id==='jobs'?'<span id="job-count">'+state.jobs.filter(j=>['queued','running'].includes(j.status)).length+'</span>':'')+'</button>').join('')+'</nav><div class="side-note">Phase 4 · v'+esc(state.appVersion||'restart required')+(state.sourceCommit?' · build '+esc(state.sourceCommit.slice(0,7)):'')+'<br>One owner. Your brands. Your ideas.<br><br>Storage: '+esc(state.storageMode)+'<br>Plan, publish and learn.</div></aside><div><header><strong>Your next good idea starts here.</strong><div class="controls"><label class="sr-only" for="brand-switch">Active brand</label><select id="brand-switch"><option value="">All brands</option>'+state.brands.map(b=>'<option value="'+b.id+'" '+(b.id===activeBrand?'selected':'')+'>'+esc(b.name)+'</option>').join('')+'</select><span class="pill" id="app-version" title="'+esc(state.build||'')+'">v'+esc(state.appVersion||'restart required')+'</span><span class="pill">Developer owner</span><span class="avatar" aria-label="Vicente Miranda">VM</span></div></header><main id="main"></main></div></div>';
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
 document.querySelector('#brand-switch').onchange=e=>{activeBrand=e.target.value;localStorage.setItem('sniff-brand',activeBrand);activeDraft='';renderPage();};
 renderPage();
}
function renderPage(){
 stopDictation();
 clearThumbnails();
 const main=document.querySelector('#main');
 if(page==='dashboard')dashboard(main);
 if(page==='brands')brands(main);
 if(page==='skills')activeSkill?skillEditor(main):skillList(main);
 if(page==='drafts')drafts(main);
 if(page==='media')media(main);
 if(page==='jobs')jobs(main);
 if(page==='settings')settings(main);
 if(page==='planner'){mountPlanner(main,{state,activeBrand,esc,heading,api,send,refresh,navigate,toast,preview:previewMedia,researchSelection:plannerResearchSelection,startPlanProduction:(plan,entry)=>{plannerProductionSelection={plan,entry};activeBrand=plan.brandId;navigate(entry.format==='reel'?'video':'images');}});plannerResearchSelection=null;}
 if(['research','inbox'].includes(page))mountGrowth(main,{mode:page,state,activeBrand,esc,heading,api,send,refresh,toast,startResearchPlan:selection=>{plannerResearchSelection=selection;activeBrand=selection.brandId;navigate('planner');}});
 if(page==='analytics')mountAnalytics(main,{state,activeBrand,esc,heading,api,send,refresh,toast});
 if(page==='calendar')mountCalendar(main,{state,activeBrand,esc,heading,api,send,refresh,toast});
 if(page==='social')mountSocial(main,{state,activeBrand,esc,heading,brandOptions,api,send,toast});
 if(['images','video'].includes(page))mountStudio(main,{state,kind:page==='video'?'video':'image',activeBrand,esc,heading,brandOptions,send,api,refresh,navigate,toast,money,preview:previewMedia,plannerSelection:plannerProductionSelection});plannerProductionSelection=null;
 if(!state.appVersion){const notice=document.createElement('div');notice.className='note warning';notice.textContent='Updated files detected, but the old server is still running. Quit Sniff Solution from its tray icon, then run START_SNIFF.cmd from the updated app folder.';main.prepend(notice);}
}
function dashboard(el){
 const drafts=filtered(state.drafts),jobs=filtered(state.jobs);
 el.innerHTML=heading('A little focus. A lot of possibility.','Bring your brand, ideas and content together.')+
 '<div class="hero"><div><div class="eyebrow">YOUR MARKETING, CONNECTED</div><h2>Turn a good idea into content that sounds like you.</h2><p>Build your brand profile, choose a content skill and shape your next draft. You stay in control of every word.</p><div class="actions"><button class="primary" id="start-content">Create content ↗</button><button id="start-brand">Manage brands</button></div></div><div class="hero-art" aria-hidden="true">✦</div></div>'+
 '<div class="grid stats">'+[['Brand profiles',state.brands.length],['Saved drafts',drafts.length],['Approved content',drafts.filter(d=>d.status==='approved').length],['Active jobs',jobs.filter(j=>['queued','running'].includes(j.status)).length]].map(([label,value])=>'<div class="card"><small>'+label+'</small><div class="number">'+value+'</div></div>').join('')+'</div>'+
 '<div class="section-title"><h2>Your modules</h2><small>Built to grow with your business</small></div><div class="grid"><div class="card"><div class="top"><span class="card-icon">✦</span>'+pill(state.modules.marketing?'available':'locked')+'</div><h3>AI Marketing Studio</h3><p>Plan, draft and review content using your brand and 13 focused workflows.</p><button id="open-studio" '+(!state.modules.marketing?'disabled':'')+'>Open studio ↗</button></div><div class="card"><div class="top"><span class="card-icon">⌕</span>'+pill('locked')+'</div><h3>Sniff</h3><p>Prospect research and sales intelligence. A separate product; not connected in this release.</p><small>Optional module</small></div><div class="card"><div class="top"><span class="card-icon">⇄</span>'+pill('locked')+'</div><h3>Sniff Integration</h3><p>Connect prospect insights with marketing campaigns when this module becomes available.</p><small>Planned commercial add-on</small></div></div>'+
 '<div class="section-title"><h2>Recent activity</h2><button id="all-activity">View activity</button></div>'+recentActivity(jobs)+
 '<div class="section-title"><h2>Recent content</h2><button id="all-drafts">View drafts</button></div>'+
 (drafts.length?'<div class="grid">'+drafts.slice(0,3).map(d=>'<div class="card">'+pill(d.status)+'<h3>'+esc(d.title)+'</h3><p>'+esc(d.text.slice(0,140))+'…</p><button data-draft="'+d.id+'">Review draft</button></div>').join('')+'</div>':empty('Make room for your first idea','Start with a brand profile, then choose a content skill.'));
 document.querySelector('#start-content').onclick=()=>navigate('skills');document.querySelector('#start-brand').onclick=()=>navigate('brands');document.querySelector('#open-studio').onclick=()=>navigate('skills');document.querySelector('#all-drafts').onclick=()=>navigate('drafts');document.querySelector('#all-activity').onclick=()=>navigate('jobs');
 bindDraftLinks();
}
const activityLabels={'brand.saved':'Brand saved','brand.deleted':'Brand deleted','brand.research_queued':'Website analysis queued','brand.suggestions_ready':'Brand suggestions ready','job.queued':'Content request queued','video_brief.queued':'Video brief preparation queued','content.generated':'Draft generated','job.cost_reconciled':'Cost reconciled','cost.day_reconciled':'Daily cost total recorded','cost.day_undone':'Daily cost total undone','draft.created':'Manual draft created','draft.saved':'Draft saved','draft.approved':'Draft approved','draft.deleted':'Draft deleted','media.uploaded':'Media uploaded','media.deleted':'Media deleted','settings.saved':'Settings saved'};
function activityTarget(a){
 const brand=state.brands.find(b=>b.id===a.target),draft=state.drafts.find(d=>d.id===a.target),job=state.jobs.find(j=>j.id===a.target),media=state.media.find(m=>m.id===a.target);
 return brand?.name||draft?.title||job?.title||media?.name||'';
}
function recentActivity(jobs){
 const attention=jobs.filter(j=>['failed','interrupted','incomplete'].includes(j.status)&&j.reconciledCost==null&&!(state.reconciliations||[]).some(r=>!r.voidedAt&&r.jobIds.includes(j.id))).length;
 const active=jobs.filter(j=>['queued','running'].includes(j.status));
 const events=(state.audit||[]).slice(0,6);
 return '<div class="card recent-activity">'+
  (active.length?'<p><strong>In progress:</strong> '+active.map(j=>esc(j.title)+' '+pill(j.status)+(j.phase?' <small>'+esc(j.phase)+'</small>':'')).join(' · ')+'</p>':'')+
  (attention?'<p class="warning-text">'+attention+' request'+(attention===1?' needs':'s need')+' attention in Activity (failed, interrupted or incomplete). They are never retried automatically.</p>':'')+
  (events.length?'<ul class="activity-list">'+events.map(a=>{const target=activityTarget(a);return '<li><span>'+esc(activityLabels[a.action]||a.action)+(target?': <strong>'+esc(target)+'</strong>':'')+'</span><small>'+esc(date(a.at))+'</small></li>';}).join('')+'</ul>':'<p class="hint">No activity yet. Saving a brand, a draft or starting a request appears here.</p>')+
 '</div>';
}
function bindDraftLinks(){document.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>{activeDraft=b.dataset.draft;page='drafts';render();});}
function brands(el){
 el.innerHTML=heading('Your brand, in every word.','Define the voice, audience and rules your content should follow.','<button class="primary" id="add-brand">+ Add brand</button>')+
 (state.brands.length?'<div class="grid">'+state.brands.map(b=>'<div class="card"><div class="top"><span class="card-icon">'+esc(b.name.slice(0,1))+'</span><small>v'+b.version+'</small></div><h3>'+esc(b.name)+'</h3><p>'+esc(b.audience||'Add your audience to give the AI useful direction.')+'</p><small>'+esc(b.voice||'Voice not set')+'</small><p class="code-label">'+esc(b.palette||'No palette set')+' · '+esc(b.font)+'</p><div class="actions"><button data-edit-brand="'+b.id+'">Edit brand</button><button data-use-brand="'+b.id+'">Create content</button></div></div>').join('')+'</div>':empty('Start with your brand','Tell the studio who you serve, how you sound and what you can claim.'));
 document.querySelector('#add-brand').onclick=()=>brandDialog();
 document.querySelectorAll('[data-edit-brand]').forEach(b=>b.onclick=()=>brandDialog(state.brands.find(x=>x.id===b.dataset.editBrand)));
 document.querySelectorAll('[data-use-brand]').forEach(b=>b.onclick=()=>{activeBrand=b.dataset.useBrand;localStorage.setItem('sniff-brand',activeBrand);navigate('skills');});
}
// Brand dialog previews. No remote fonts are loaded (loopback-only app, strict CSP), so a font preview
// is only exact when that font is installed on this computer; otherwise we say a fallback is shown.
const COMMON_FONTS=['Arial','Helvetica','Verdana','Tahoma','Trebuchet MS','Georgia','Times New Roman','Segoe UI','Roboto','Open Sans'];
const FONT_SAMPLE='Your next adventure starts with one well-planned step. 0123456789';
const GENERIC_FONTS=new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-sans-serif','ui-serif','ui-monospace','ui-rounded']);
const HEX_SWATCH=/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const fontInstalledCache=new Map();let fontCanvas;
function fontFamilies(value){return String(value||'').split(',').map(f=>f.trim().replace(/^["']+|["']+$/g,'').trim()).filter(Boolean).slice(0,8);}
function cssFontStack(value){return fontFamilies(value).map(n=>GENERIC_FONTS.has(n.toLowerCase())?n.toLowerCase():'"'+n.replace(/["\\]/g,'')+'"').concat('sans-serif').join(', ');}
const FONT_REFERENCES=['Arial','Times New Roman','Segoe UI','Verdana','Tahoma','Georgia','Trebuchet MS','Calibri','Inter','Liberation Sans','DejaVu Sans','Roboto','Open Sans','Helvetica'];
function fontWidths(stack){
 const ctx=(fontCanvas||=document.createElement('canvas')).getContext('2d');
 return ['mmmmmmmmmmlli1WQ@#&wy','Hamburgefonstiv 0123456789'].map(text=>{ctx.font='72px '+stack;return ctx.measureText(text).width;}).join('|');
}
function fontProbe(name){
 const key=name.toLowerCase();if(fontInstalledCache.has(key))return fontInstalledCache.get(key);
 let result={installed:GENERIC_FONTS.has(key),signature:''};
 if(!result.installed){try{
  const quoted='"'+name.replace(/["\\]/g,'')+'"';
  result.installed=['monospace','serif','sans-serif'].some(base=>fontWidths(quoted+', '+base)!==fontWidths(base));
  result.signature=fontWidths(quoted+', monospace');
 }catch{result.installed=false;}}
 fontInstalledCache.set(key,result);return result;
}
// Operating systems can quietly substitute a missing family (Windows maps Helvetica to Arial, Linux may map
// Segoe UI to its default font). If a name renders exactly like an earlier reference font, treat it as a stand-in.
function fontStandIn(name){
 const probe=fontProbe(name);if(!probe.installed||!probe.signature)return '';
 const at=FONT_REFERENCES.findIndex(n=>n.toLowerCase()===name.toLowerCase());
 return FONT_REFERENCES.slice(0,at<0?FONT_REFERENCES.length:at).find(ref=>{const r=fontProbe(ref);return r.installed&&r.signature===probe.signature&&!fontStandInSelf(ref);})||'';
}
function fontStandInSelf(ref){const at=FONT_REFERENCES.indexOf(ref),sig=fontProbe(ref).signature;return FONT_REFERENCES.slice(0,at).some(other=>{const o=fontProbe(other);return o.installed&&o.signature===sig;});}
function fontInstalled(name){return fontProbe(name).installed&&!fontStandIn(name);}
function fontStatus(value){
 const names=fontFamilies(value);if(!names.length)return 'No font entered. The preview uses a default sans-serif font.';
 const first=names[0];
 if(GENERIC_FONTS.has(first.toLowerCase()))return '“'+first+'” is a generic family, so this computer picks the actual font.';
 const standIn=fontStandIn(first);
 if(standIn)return '“'+first+'” renders exactly like “'+standIn+'” here, so it may be a substitute rather than the real font. The real '+first+' may look different.';
 if(fontInstalled(first))return '“'+first+'” is installed on this computer, so this preview uses it.';
 const used=names.slice(1).find(n=>!GENERIC_FONTS.has(n.toLowerCase())&&fontInstalled(n));
 return '“'+first+'” is not installed on this computer, so this preview uses '+(used?'“'+used+'” from your list':'a fallback font')+'. The real font may look different.';
}
function paintSwatches(root){root.querySelectorAll('[data-hex]').forEach(el=>{if(HEX_SWATCH.test(el.dataset.hex))el.style.backgroundColor=el.dataset.hex;});}
function renderSwatches(el,value,{removable=false,onRemove}={}){
 const tokens=String(value||'').split(/[\s,]+/).filter(Boolean).slice(0,24);
 el.innerHTML=tokens.length?tokens.map((t,i)=>/^#[0-9a-f]{6}$/i.test(t)?'<span class="swatch-chip"><span class="swatch" data-hex="'+esc(t)+'" aria-hidden="true"></span>'+esc(t.toUpperCase())+(removable?'<button type="button" class="swatch-remove" data-remove-color="'+i+'" aria-label="Remove colour '+esc(t.toUpperCase())+'" title="Remove '+esc(t.toUpperCase())+'">×</button>':'')+'</span>':'<span class="swatch-chip invalid" title="Not a #RRGGBB colour"><span class="swatch" aria-hidden="true"></span>'+esc(t)+' · not #RRGGBB</span>').join(''):'<span class="hint">No colours yet.</span>';
 paintSwatches(el);
 if(removable&&onRemove)el.querySelectorAll('[data-remove-color]').forEach(button=>button.onclick=()=>onRemove(Number(button.dataset.removeColor)));
}
function renderFontSample(el,value,label){
 el.innerHTML='<small>'+esc(label)+': <strong>'+esc(value.trim()||'(empty)')+'</strong></small><p class="font-sample">'+esc(FONT_SAMPLE)+'</p><small class="hint">'+esc(fontStatus(value))+'</small>';
 el.querySelector('.font-sample').style.fontFamily=cssFontStack(value);
}
function fontOptions(suggested){
 const label=n=>esc(n)+(fontInstalled(n)?'':fontStandIn(n)?' · not installed here, preview shows '+esc(fontStandIn(n)):' · not installed here, preview uses a fallback');
 const common=COMMON_FONTS.filter(n=>!suggested||n.toLowerCase()!==suggested.toLowerCase());
 return '<option value="">Typed or custom font</option>'+(suggested?'<optgroup label="Suggested from website"><option value="'+esc(suggested)+'">'+label(suggested)+' · suggested</option></optgroup>':'')+'<optgroup label="Common fonts">'+common.map(n=>'<option value="'+esc(n)+'">'+label(n)+'</option>').join('')+'</optgroup>';
}
let brandDialogSequence=0;
function brandDialog(brand={},completedResearch=null){
 const session=++brandDialogSequence;
 let closed=false,analysisRunning=false,researchJobId=brand.research?.jobId||'',lastResult=null;
 const fields=[['name','Brand name',true],['website','Website'],['palette','Brand colours · #RRGGBB, comma separated'],['font','Font'],['voice','Tone of voice'],['audience','Audience'],['goals','Marketing goals'],['allowedClaims','Allowed claims and supporting facts'],['forbiddenClaims','Prohibited claims · one phrase per line']];
 const providerOptions='<option value="">Automatic · prefer Perplexity</option>'+['perplexity','openai','anthropic'].map(p=>'<option value="'+p+'">'+({perplexity:'Perplexity',openai:'OpenAI',anthropic:'Claude'}[p])+(state.providerStatus[p]?'':' · key needed')+'</option>').join('');
 const action='<div class="full brand-research-action"><div><strong>Start with the name and website</strong><p class="hint">Read public website pages and styles, then prepare editable brand suggestions. Nothing is saved until you choose Save brand.</p></div><div class="actions"><label>Research provider<select id="brand-research-provider" aria-label="Research provider">'+providerOptions+'</select></label><button id="suggest-brand" type="button">✦ Suggest from website</button></div><p id="brand-research-status" class="hint" role="status" aria-live="polite"></p><p id="brand-research-close-note" class="hint" hidden>You can close this dialog while the analysis runs. Closing does not cancel a request already sent to the AI provider; when it finishes, open Activity and choose Review suggestions. Nothing is saved to the brand until you choose Save brand.</p></div>';
 modal.innerHTML='<div class="dialog-header"><h2>'+esc(brand.id?'Edit brand':'Create a brand')+' <span class="version-badge" id="dialog-version" title="'+esc(state.build||'')+'">v'+esc(state.appVersion||'restart required')+'</span></h2><button id="close-modal" aria-label="Close dialog">×</button></div><form id="brand-form"><div class="form-grid">'+fields.map(([key,label,required],i)=>'<div class="'+(i>3?'full':'')+'"><label for="brand-'+key+'">'+label+'</label>'+(i>3?'<textarea id="brand-'+key+'" name="'+key+'">'+esc(brand[key]||'')+'</textarea>':'<input id="brand-'+key+'" name="'+key+'" value="'+esc(brand[key]||(key==='font'?'Arial':''))+'" '+(required?'required':'')+' maxlength="'+(key==='website'?500:key==='name'?120:key==='palette'?600:key==='font'?100:200)+'">')+(key==='palette'?'<div class="swatch-row" data-palette-preview aria-label="Colour preview"></div>':'')+(key==='font'?'<div class="font-picker"><select id="brand-font-choice" aria-label="Choose a common font"></select><div id="brand-font-preview" class="font-preview" aria-live="polite"></div></div>':'')+'<div data-field-suggestion="'+key+'"></div></div>'+(i===1?action:'')).join('')+'</div><section id="brand-research-evidence" class="note" hidden></section><p class="hint">Colours and fonts are candidates observed in accessible HTML/CSS, not verified brand guidelines. Tone, audience, goals and prohibited phrases are recommendations. Review factual claims and all suggestions before saving.</p><div class="actions"><button class="primary" type="submit">Save brand</button>'+(brand.id?'<button class="danger" type="button" id="delete-brand">Delete brand</button>':'')+'</div></form>';
 const form=modal.querySelector('#brand-form'),button=modal.querySelector('#suggest-brand'),status=modal.querySelector('#brand-research-status'),evidence=modal.querySelector('#brand-research-evidence');
 const isCurrent=()=>!closed&&modal.open&&session===brandDialogSequence;
 const fontChoice=modal.querySelector('#brand-font-choice');let suggestedFont='';
 function updatePalettePreview(){renderSwatches(modal.querySelector('[data-palette-preview]'),form.elements.palette.value,{removable:true,onRemove:index=>{const colors=form.elements.palette.value.split(/[\s,]+/).filter(Boolean);colors.splice(index,1);form.elements.palette.value=colors.join(', ');updatePalettePreview();}});}
 function updateFontPreview(){
  const value=form.elements.font.value;renderFontSample(modal.querySelector('#brand-font-preview'),value,'Font field preview');
  const match=[...fontChoice.options].find(o=>o.value&&o.value.toLowerCase()===value.trim().toLowerCase());fontChoice.value=match?match.value:'';
 }
 function updatePreviews(){updatePalettePreview();updateFontPreview();}
 fontChoice.innerHTML=fontOptions('');
 fontChoice.onchange=()=>{if(!fontChoice.value)return;form.elements.font.value=fontChoice.value;form.elements.font.dispatchEvent(new Event('input',{bubbles:true}));};
 form.elements.palette.addEventListener('input',updatePalettePreview);form.elements.font.addEventListener('input',updateFontPreview);
 updatePreviews();
 function applyResult(job,baseline={}){
  if(!isCurrent())return;
  lastResult=job.result;researchJobId=job.id;
  const identityUnchanged=form.elements.name.value.trim()===job.brandInput.name&&normalizeInput(form.elements.website.value)===normalizeInput(job.website);
  let applied=0;
  for(const key of ['palette','font','voice','audience','goals','allowedClaims','forbiddenClaims']){
   const value=lastResult.suggestions[key];if(!value)continue;
   const input=form.elements[key],holder=form.querySelector('[data-field-suggestion="'+key+'"]');
   const unchanged=input.value===(baseline[key]??input.value);
   const emptyAtStart=!baseline[key]||(key==='font'&&!brand.id&&baseline[key]==='Arial');
   const autoApply=identityUnchanged&&unchanged&&emptyAtStart;
   if(autoApply){input.value=value;applied++;}
   const preview=key==='palette'?'<div class="swatch-row" data-suggestion-swatches></div>':key==='font'?'<div class="font-preview" data-suggestion-font></div>':'<pre>'+esc(value)+'</pre>';
   holder.innerHTML='<div class="brand-field-suggestion"><small>'+esc(lastResult.fieldOrigins[key])+'</small><details'+(key==='palette'||key==='font'?' open':'')+'><summary>View suggestion</summary>'+preview+'</details><button type="button">Use this suggestion</button></div>';
   if(key==='palette')renderSwatches(holder.querySelector('[data-suggestion-swatches]'),value);
   if(key==='font'){suggestedFont=fontFamilies(value)[0]||'';fontChoice.innerHTML=fontOptions(suggestedFont);renderFontSample(holder.querySelector('[data-suggestion-font]'),value,'Suggested font');}
   holder.querySelector('button').onclick=()=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));toast('Suggestion applied. You can edit it before saving.');};
  }
  updatePreviews();
  const sources=lastResult.sources.filter(s=>/^https?:\/\//.test(s.url));
  evidence.hidden=false;
  evidence.innerHTML='<strong>Suggestions ready · review before saving</strong><p>'+applied+' empty/default fields filled. Existing text and edits made during analysis are kept. '+(!identityUnchanged?'The name or website has changed since this analysis; suggestions were not filled automatically. ':'')+'</p><button id="apply-all-brand-suggestions" type="button">Use all suggestions</button><details><summary>Website evidence and detected styling</summary><p>Read '+esc(date(lastResult.capturedAt))+' · <a target="_blank" rel="noopener noreferrer" href="'+esc(lastResult.finalUrl)+'">'+esc(lastResult.finalUrl)+'</a></p><ul>'+lastResult.styling.colors.map(x=>'<li><span class="swatch" data-hex="'+esc(x.value)+'" aria-hidden="true"></span><strong>'+esc(x.value)+'</strong> — '+esc(x.context)+' · '+esc(x.source)+'</li>').join('')+lastResult.styling.fonts.map(x=>'<li><strong>'+esc(x.value)+'</strong> — '+esc(x.context)+' · '+esc(x.source)+'</li>').join('')+'</ul><p class="hint">CSS can include unused styles and fallback fonts. These candidates have not been measured from a rendered page.</p>'+sources.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.kind)+': '+esc(s.url)+'</a></p>').join('')+'</details>'+(lastResult.notes.length?'<details><summary>Assumptions and limitations</summary><ul>'+lastResult.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul></details>':'');
  paintSwatches(evidence);
  evidence.querySelector('#apply-all-brand-suggestions').onclick=()=>{
   const entries=Object.entries(lastResult.suggestions).filter(([key,value])=>value&&form.elements[key]);
   if(entries.some(([key,value])=>form.elements[key].value&&form.elements[key].value!==value)&&!confirm('Replace the existing field values with these suggestions? You can still edit everything before saving.'))return;
   entries.forEach(([key,value])=>{form.elements[key].value=value;});updatePreviews();
   status.textContent='Suggestions applied. Review or edit the fields, then choose Save brand.';
  };
  status.textContent='Suggestions are ready. Review or edit the fields, then choose Save brand.';
 }
 function normalizeInput(value){try{const u=new URL(/^[a-z][a-z\d+.-]*:/i.test(value.trim())?value.trim():'https://'+value.trim());u.hash='';return u.href;}catch{return value.trim();}}
 button.onclick=async()=>{
  const name=form.elements.name.value.trim(),website=form.elements.website.value.trim();
  if(!name||!website){toast('Enter the brand name and website first.',true);return;}
  const baseline=Object.fromEntries(fields.map(([key])=>[key,form.elements[key].value]));
  button.disabled=true;form.querySelector('[type=submit]').disabled=true;status.textContent='Queuing website analysis…';analysisRunning=true;modal.querySelector('#brand-research-close-note').hidden=false;
  try{
   const start=await send('/api/brand-research','POST',{name,website,provider:modal.querySelector('#brand-research-provider').value,brandId:brand.id});
   if(!isCurrent())return;
   form.elements.website.value=start.website;
   while(isCurrent()){
    const job=await api('/api/brand-research/'+start.id);
    if(!isCurrent())return;
    status.textContent=(job.phase||job.status)+' · '+Math.floor((Date.now()-new Date(job.createdAt))/1000)+'s';
    if(job.status==='completed'){applyResult(job,baseline);await refresh();return;}
    if(['failed','interrupted','incomplete'].includes(job.status))throw new Error(job.error||'Website analysis needs attention.');
    await new Promise(resolve=>setTimeout(resolve,1200));
   }
  }catch(err){if(isCurrent()){status.textContent=err.message;toast(err.message,true);}}
  finally{analysisRunning=false;if(isCurrent()){button.disabled=false;form.querySelector('[type=submit]').disabled=false;modal.querySelector('#brand-research-close-note').hidden=true;}}
 };
 modal.onclose=()=>{if(analysisRunning&&!closed)toast('Website analysis is still running. Closing did not cancel the provider request. Open Activity to review the suggestions when it finishes.');closed=true;};
 modal.showModal();modal.querySelector('#close-modal').onclick=()=>modal.close();
 form.onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
   const result=await send('/api/brands','POST',{...Object.fromEntries(new FormData(form)),id:brand.id,version:brand.version,researchJobId:researchJobId||undefined});
   activeBrand=result.id;localStorage.setItem('sniff-brand',activeBrand);await refresh();modal.close();render();toast('Brand saved.');
  }catch(err){toast(err.message,true);}finally{b.disabled=false;}
 };
 if(brand.id)modal.querySelector('#delete-brand').onclick=async()=>{if(!confirm('Delete this brand? This cannot be undone. Brands with content or job history must be kept.'))return;try{await api('/api/brands/'+brand.id,{method:'DELETE'});await refresh();modal.close();render();toast('Brand deleted.');}catch(e){toast(e.message,true);}};
 if(completedResearch)applyResult(completedResearch,Object.fromEntries(fields.map(([key])=>[key,form.elements[key].value])));
}
function skillList(el){
 el.innerHTML=heading('A skill for every next step.','Focused workflows for the content you need to make.')+'<div class="note">Phase 1 creates written plans and drafts. Messages are not sent and posts are not published.</div><div class="grid">'+state.skills.map((s,i)=>'<div class="card skill-card"><div class="top"><span class="card-icon">'+String(i+1).padStart(2,'0')+'</span><span class="code-label">/'+s.id+'</span></div><h3>'+esc(s.name)+'</h3><p>'+esc(s.description)+'</p><div class="actions"><button data-skill="'+s.id+'">Start workflow ↗</button></div></div>').join('')+'</div>';
 document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{activeSkill=b.dataset.skill;renderPage();});
}
function skillEditor(el){
 const skill=state.skills.find(s=>s.id===activeSkill);
 el.innerHTML='<button id="back-skills" class="back">← All skills</button>'+heading(skill.name,skill.description)+
 (skill.requiresWeb?'<div class="note">Trend research searches the web through Perplexity. Configure its API key and a model or effort preset in Settings &amp; Costs. Source links must be returned; otherwise the draft is marked needs review. OpenAI and Claude remain available for the other workflows.</div>':'')+'<div class="form-grid"><form id="generate-form" class="card stack"><h2>Your creative brief</h2><label>Brand<select name="brandId" aria-label="Brand" required>'+brandOptions()+'</select></label><label>Working title<input name="title" maxlength="150" placeholder="e.g. A week of smarter travel" required></label><label>Brief and source material<textarea name="brief" required maxlength="20000" placeholder="What are you creating? Add the goal, audience, facts, source text, comments or metrics the task needs."></textarea></label><label>AI provider<select name="provider" aria-label="AI provider">'+(skill.requiresWeb?['perplexity']:['openai','anthropic','perplexity']).map(p=>'<option value="'+p+'">'+({openai:'OpenAI',anthropic:'Claude',perplexity:'Perplexity'}[p])+(state.providerStatus[p]?'':' · key needed')+'</option>').join('')+'</select></label><p class="hint">One request reserves '+money(state.settings.reservePerJob)+' against your monthly budget. This is a planning control, not a guaranteed provider billing cap.</p><button class="primary" type="submit">Generate draft</button></form><div class="card"><div class="eyebrow">WHAT YOU’LL GET</div><h2>'+esc(skill.name)+'</h2><p>'+esc(skill.instruction)+'</p><div class="note">Your saved brand profile is included with the brief. The output is saved as a draft for you to review.</div><h3>Prefer to start yourself?</h3><p>Create a manual draft without an API key.</p><button id="manual-draft">Write a draft</button><details><summary>Editorial checks</summary><p>Drafts include character, word, hashtag, CTA and prohibited-phrase checks. These are transparent heuristics, not predictions of engagement or AI-authorship judgments.</p></details></div></div>';
 document.querySelector('#back-skills').onclick=()=>{activeSkill='';renderPage();};document.querySelector('#manual-draft').onclick=newDraft;
 document.querySelector('#generate-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const payload=Object.fromEntries(new FormData(e.target));await send('/api/jobs','POST',{...payload,skill:activeSkill});await refresh();navigate('jobs');toast('Job queued. Your draft will appear when it finishes.');}catch(err){toast(err.message,true);}finally{btn.disabled=false;}};
}
async function newDraft(){
 if(!activeBrand){toast('Select a brand at the top first.',true);return;}
 try{const d=await send('/api/drafts','POST',{brandId:activeBrand,title:'Untitled draft',text:''});await refresh();activeDraft=d.id;page='drafts';render();}catch(e){toast(e.message,true);}
}
function drafts(el){
 const items=filtered(state.drafts);
 if(!items.some(d=>d.id===activeDraft))activeDraft=items[0]?.id||'';
 const d=items.find(d=>d.id===activeDraft);
 el.innerHTML=heading('Good content gets a second look.','Edit, check and approve your content before using it.','<button id="new-draft" class="primary">+ New draft</button>')+
 (d?'<div class="split"><div class="list">'+items.map(x=>'<button data-draft="'+x.id+'" class="'+(x.id===d.id?'selected':'')+'">'+esc(x.title)+'<small>'+esc(x.skill)+' · '+esc(x.status)+'</small></button>').join('')+'</div><div class="card"><form id="draft-form" class="stack"><div class="top">'+pill(d.status)+'<small> Version '+d.version+'</small></div><label>Title<input name="title" value="'+esc(d.title)+'" maxlength="150" required></label><label>Content<textarea class="content-editor" name="text" maxlength="30000" required>'+esc(d.text)+'</textarea></label><label>Review status<select name="status" aria-label="Review status">'+['draft','needs-review','approved'].map(s=>'<option value="'+s+'" '+(d.status===s?'selected':'')+'>'+s.replaceAll('-',' ')+'</option>').join('')+'</select></label><div class="actions"><button class="primary" type="submit">Save draft</button><button type="button" id="copy-draft">Copy text</button><button type="button" id="export-draft">Download .md</button><button type="button" id="python-checks">Editorial tools</button><button class="danger" type="button" id="delete-draft">Delete</button></div></form><div id="checks">'+checksHTML(d.checks)+'</div>'+
 (d.status==='needs-review'?'<div class="note warning">This draft needs review. Check the originating request in Activity for missing sources, output limits or other issues before approving.</div>':'')+(d.sources?.length?'<details><summary>Sources returned by the provider</summary>'+d.sources.map(url=>'<p><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(url)+'</a></p>').join('')+'</details>':'')+
 '<details><summary>Version history ('+(d.versions?.length||0)+')</summary>'+(d.versions||[]).map(v=>'<div class="version"><small>Version '+v.version+' · '+esc(date(v.at))+'</small><pre>'+esc(v.text)+'</pre></div>').join('')+'</details><p class="hint">Approval records your editorial decision. It does not schedule or publish the content.</p></div></div>':empty('Your first draft belongs here','Choose a content skill or create a manual draft.'));
 document.querySelector('#new-draft').onclick=newDraft;bindDraftLinks();
 if(!d)return;
 const form=document.querySelector('#draft-form');
 form.onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await send('/api/drafts/'+d.id,'PUT',{...Object.fromEntries(new FormData(form)),version:d.version});await refresh();renderPage();toast('Draft saved.');}catch(err){toast(err.message,true);}finally{btn.disabled=false;}};
 form.elements.text.oninput=e=>{document.querySelector('#checks').textContent=e.target.value.length+' characters · Save to update editorial checks.';};
 document.querySelector('#copy-draft').onclick=async()=>{try{await navigator.clipboard.writeText(form.elements.text.value);toast('Text copied.');}catch{toast('Select the text and copy it with Ctrl+C.',true);}};
 document.querySelector('#python-checks').onclick=()=>{
  modal.innerHTML='<div class="dialog-header"><h2>Editorial tools</h2><button id="close-modal">Close</button></div><p class="hint">New baseline Python utilities. The original Instagram skill package has not been supplied. These checks are heuristics and do not predict engagement or identify AI authorship.</p><label>Check<select id="check-command" aria-label="Check"><option value="hook">Hook checklist</option><option value="beats">Spoken timing / beats</option><option value="caption">Caption counts</option><option value="humanizer">Phrase simplifier</option><option value="detection">Generic wording flags</option><option value="swipe">Slide copy density</option></select></label><p><button id="run-check" class="primary">Run on current draft</button></p><pre id="check-result" aria-live="polite"></pre>';
  modal.showModal();document.querySelector('#close-modal').onclick=()=>modal.close();
  document.querySelector('#run-check').onclick=async e=>{e.target.disabled=true;try{const result=await send('/api/checks','POST',{command:document.querySelector('#check-command').value,text:form.elements.text.value});document.querySelector('#check-result').textContent=JSON.stringify(result,null,2);}catch(err){document.querySelector('#check-result').textContent=err.message;}finally{e.target.disabled=false;}};
 };
 document.querySelector('#export-draft').onclick=()=>download(new Blob([form.elements.text.value],{type:'text/markdown'}),'draft-'+d.id+'.md');
 document.querySelector('#delete-draft').onclick=async()=>{if(!confirm('Permanently delete this draft and its saved versions?'))return;try{await api('/api/drafts/'+d.id,{method:'DELETE'});await refresh();renderPage();toast('Draft deleted.');}catch(e){toast(e.message,true);}};
}
function checksHTML(checks){return checks?'<div class="note"><strong>Editorial checks</strong><p>'+checks.characters+' characters · '+checks.words+' words · '+checks.hashtags+' hashtags</p>'+(checks.warnings.length?'<ul>'+checks.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'<p>No issues flagged by these checks. Human review is still needed.</p>')+'</div>':'';}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function media(el){
 const items=filtered(state.media);
 el.innerHTML=heading('A home for your brand assets.','Keep reference images, logos, documents, video and audio with the right brand.')+
 '<form id="upload-form" class="card"><div class="form-grid"><label>Brand<select name="brandId" aria-label="Brand" required>'+brandOptions()+'</select></label><label>Tags<input name="tags" placeholder="logo, reference, campaign" maxlength="500"></label><label>File · up to 100 MB<input class="file-input" type="file" name="file" required accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.mp4,.mp3,.wav,.ttf,.otf"></label><div class="actions"><button class="primary" type="submit">Upload asset</button></div></div><p class="hint">Assets are stored for reference and reuse. AI text workflows currently use the brief you supply; they do not automatically read uploaded files.</p></form><div class="section-title"><h2>Brand assets · <span id="media-visible-count"></span></h2><input id="media-search" class="search" aria-label="Search media" placeholder="Search names or tags"></div><label class="check-label"><input type="checkbox" id="show-media-originals"> Show saved originals</label><p class="hint">Final outputs are shown by default. Each original is a recovery copy from the same AI generation; it is not an additional generation.</p><div id="media-grid" class="grid"></div>';
 function draw(query=''){const list=visibleMedia(items,document.querySelector('#show-media-originals').checked).filter(m=>(m.name+' '+m.tags).toLowerCase().includes(query.toLowerCase()));document.querySelector('#media-visible-count').textContent=list.length;document.querySelector('#media-grid').innerHTML=list.length?list.map(m=>'<div class="card">'+thumbnailHTML(m,esc)+'<h3>'+esc(m.name)+'</h3><p>'+esc((m.role==='generated'?'Saved original · ':m.role==='rendered'?'Final output · ':'')+(m.status||'needs-review')+' · '+(m.tags||'No tags'))+'</p><small>'+(m.width&&m.height?m.width+' × '+m.height+' pixels · ':'')+(m.size/1024/1024).toFixed(2)+' MB · '+esc(m.mime)+'</small><div class="actions"><button data-preview="'+m.id+'">Preview</button><button data-download="'+m.id+'">Download</button><button data-delete-media="'+m.id+'" class="danger">Delete</button></div></div>').join(''):empty('No matching assets','Upload your first brand asset or change the search.');
 loadThumbnails(document.querySelector('#media-grid'),api);
 document.querySelectorAll('[data-download]').forEach(b=>b.onclick=async()=>{try{const m=items.find(x=>x.id===b.dataset.download);download(await api('/api/media/'+m.id),m.name);}catch(e){toast(e.message,true);}});
 document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewMedia(items.find(x=>x.id===b.dataset.preview)));
 document.querySelectorAll('[data-delete-media]').forEach(b=>b.onclick=async()=>{if(!confirm('Permanently delete this asset?'))return;try{await api('/api/media/'+b.dataset.deleteMedia,{method:'DELETE'});await refresh();renderPage();toast('Asset deleted.');}catch(e){toast(e.message,true);}});
 }
 draw();document.querySelector('#media-search').oninput=e=>draw(e.target.value);document.querySelector('#show-media-originals').onchange=()=>draw(document.querySelector('#media-search').value);
 document.querySelector('#upload-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter,form=e.target,file=form.elements.file.files[0];if(file.size>100*1024*1024){toast('The maximum file size is 100 MB.',true);return;}btn.disabled=true;btn.textContent='Uploading…';try{await api('/api/media',{method:'POST',headers:{'Content-Type':/\.ttf$/i.test(file.name)?'font/ttf':/\.otf$/i.test(file.name)?'font/otf':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-Brand-Id':form.elements.brandId.value,'X-Tags':form.elements.tags.value},body:file});await refresh();renderPage();toast('Asset uploaded.');}catch(err){toast(err.message,true);}finally{btn.disabled=false;btn.textContent='Upload asset';}};
}
function jobs(el){
 const items=filtered(state.jobs).slice().reverse(),covered=new Set((state.reconciliations||[]).filter(r=>!r.voidedAt).flatMap(r=>r.jobIds));
 el.innerHTML=heading('Keep the work moving.','Track requests, inspect errors and open completed drafts.')+
 (items.length?'<div class="table-wrap"><table><thead><tr><th>Content</th><th>Provider</th><th>Status</th><th>Cost</th><th>Action</th></tr></thead><tbody>'+items.map(j=>'<tr><td><strong>'+esc(j.title)+'</strong><small>'+esc(date(j.createdAt))+'</small><small>'+esc(j.skill)+'</small></td><td>'+esc(j.provider)+'<small>'+esc(j.config.model)+'</small></td><td>'+pill(j.status)+(j.error?'<small>'+esc(j.error)+'</small>':'')+(j.phase?'<small>'+esc(j.phase)+'</small>':'')+'<small class="job-elapsed">'+elapsedLabel(j)+'</small>'+'</td><td>'+(covered.has(j.id)?'Included in daily total':money(j.reconciledCost??j.costEstimate))+'<small>Original reservation: '+money(j.reservation)+'</small>'+(j.tokens?'<small>'+j.tokens.input+' input / '+j.tokens.output+' output tokens</small>':'')+'</td><td>'+(j.type==='plan-day'?'<button data-open-plan="'+j.id+'">Open content plan</button>':'')+(j.type==='plan-day'&&j.resultText?'<button data-plan-response="'+j.id+'">View text response</button>':'')+(j.type==='brand-research'&&j.result?'<button data-brand-research="'+j.id+'">Review suggestions</button>':'')+(j.type==='production'&&j.mediaIds?.length?'<button data-open-assets="'+j.id+'">Review assets</button>':'')+(j.type==='production'&&['failed','interrupted','incomplete'].includes(j.status)&&(j.mediaIds?.length||j.production?.sourceId)?'<button data-finish-saved="'+j.id+'">Finish saved output</button>':'')+(j.type==='production'&&j.providerRequestId&&!j.mediaIds?.length&&!['queued','running','completed'].includes(j.status)?'<button data-recover="'+j.id+'">Recover result</button>':'')+(j.providerRequestId?'<small>Provider request: '+esc(j.providerRequestId)+'</small>':'')+(j.draftId&&state.drafts.some(d=>d.id===j.draftId)?'<button data-draft="'+j.draftId+'">Open draft</button>':'')+(!covered.has(j.id)&&!['running','queued'].includes(j.status)?'<button data-reconcile="'+j.id+'">Reconcile cost</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':empty('Nothing in the queue yet','Start a content skill to create your first request.'))+
 dailyCostsHTML(state,esc,money)+'<div class="note">Elapsed time runs from submission to the recorded finish, including queue wait, final rendering and any gaps before recovery. Jobs run one at a time while this application server is open. Interrupted provider calls are never automatically retried. Check the provider’s usage before running again.</div>';
 document.querySelectorAll('[data-finish-saved]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await send('/api/production/'+b.dataset.finishSaved+'/render-saved','POST',{});await refresh();renderPage();toast('Finishing the saved original locally. No new AI request or provider charge.');}catch(e){toast(e.message,true);b.disabled=false;}});
 document.querySelectorAll('[data-open-plan]').forEach(b=>b.onclick=()=>navigate('planner'));
 document.querySelectorAll('[data-plan-response]').forEach(b=>b.onclick=()=>{const job=state.jobs.find(j=>j.id===b.dataset.planResponse);modal.innerHTML='<div class="dialog-head"><h2>Saved proposal response</h2><button id="close-plan-response" aria-label="Close">×</button></div><p class="hint">Raw text returned by the provider. Invalid or partial responses are not applied to a posting day.</p><pre>'+esc(job.resultText)+'</pre>';modal.querySelector('#close-plan-response').onclick=()=>modal.close();modal.showModal();});
 document.querySelectorAll('[data-open-assets]').forEach(b=>b.onclick=()=>{const job=state.jobs.find(j=>j.id===b.dataset.openAssets),assets=(job?.mediaIds||[]).map(id=>state.media.find(m=>m.id===id)).filter(Boolean),finals=assets.filter(m=>m.role==='rendered'),outputs=finals.length?finals:assets;if(outputs.length)previewMedia(outputs[0],outputs);else toast('No saved assets remain for this request.',true);});document.querySelectorAll('[data-recover]').forEach(b=>b.onclick=async()=>{try{await send('/api/production/'+b.dataset.recover+'/recover','POST',{});await refresh();renderPage();toast('Polling the existing request; no new generation submitted.');}catch(e){toast(e.message,true);}});
 bindDailyCosts({state,modal,esc,send,refresh,renderPage,toast});
 bindDraftLinks();document.querySelectorAll('[data-brand-research]').forEach(b=>b.onclick=()=>{const job=state.jobs.find(j=>j.id===b.dataset.brandResearch);brandDialog(state.brands.find(x=>x.id===job.brandId)||job.brandInput,job);});document.querySelectorAll('[data-reconcile]').forEach(b=>b.onclick=async()=>{const value=prompt('Confirmed cost from the provider’s billing records, in USD:');if(value===null||value.trim()==='')return;try{await send('/api/jobs/'+b.dataset.reconcile+'/reconcile','POST',{cost:Number(value)});await refresh();renderPage();toast('Cost reconciled.');}catch(e){toast(e.message,true);}});
}
function productionSettingsHTML(){const c=state.production.settings;return '<div class="card"><h2>Image &amp; video production</h2><div class="form-grid"><label>OpenAI image model<input name="imageModel" value="'+esc(c.imageModel)+'" maxlength="100" placeholder="Enter a GPT Image model available to your account"></label><label>Default Higgsfield video model<select name="videoModel">'+(state.production.videoModels||[]).map(m=>'<option value="'+esc(m.id)+'" '+(m.id===c.videoModel?'selected':'')+'>'+esc(m.name)+'</option>').join('')+'</select></label><label>Reserve per image / video · USD<input name="mediaReserve" type="number" min="0.01" step="0.01" value="'+c.reserve+'" required></label></div><p class="hint">Choose the generation model in Image Studio or Video Studio before each request. Videos use supported Higgsfield text-to-video adapters. Add HF_API_KEY (the complete copied key) in the tray menu API settings, then restart. Older ID/secret pairs still work. Image models and permissions must be available to your account. Media fees remain unpriced until reconciled; batches reserve this amount for every image. FFmpeg: '+(state.production.renderer?'ready':'unavailable')+'.</p></div>';}
async function previewMedia(m,outputs=[]){
 try{
  if(modal.open)modal.close();
  const blob=await api('/api/media/'+m.id),url=URL.createObjectURL(blob);
  const related=state.media.filter(x=>x.sourceId===m.id||x.id===m.sourceId);
  modal.innerHTML='<div class="dialog-header"><h2>'+esc(m.name)+'</h2><button id="close-modal">Close</button></div>'+(m.mime.startsWith('image/')?'<img class="media-preview" alt="'+esc(m.name)+'" src="'+url+'">':m.mime.startsWith('video/')?'<video class="media-preview" controls src="'+url+'"></video>':m.mime.startsWith('audio/')?'<audio controls src="'+url+'"></audio>':m.mime==='text/plain'?'<pre>'+esc(await blob.text())+'</pre>':'<p>Download this document or font to inspect it locally.</p>')+
   '<p id="asset-dimensions" class="asset-dimensions">'+(m.width&&m.height?m.width+' × '+m.height+' pixels':'Loading image dimensions…')+'</p>'+(outputs.length>1?'<label class="job-output-select">Output from this request<select id="job-output" aria-label="Output from this request">'+outputs.map((o,i)=>'<option value="'+o.id+'" '+(o.id===m.id?'selected':'')+'>Output '+(i+1)+' of '+outputs.length+' · '+esc(o.name)+'</option>').join('')+'</select></label>':'')+'<p class="hint">'+esc(m.role||'uploaded')+' · '+esc(m.role==='rendered'?(m.aspect||'final output'):'original dimensions')+' · Version '+(m.version||1)+(m.branding?' · Brand overlays applied':'')+(m.renderingFont?' · Font: '+esc(m.renderingFont):'')+'</p><form id="asset-review" class="stack"><label>Caption / production notes<textarea aria-label="Caption / production notes" name="caption" maxlength="30000">'+esc(m.caption||'')+'</textarea></label><label>Review status<select name="status" aria-label="Review status">'+['draft','needs-review','approved'].map(s=>'<option value="'+s+'" '+((m.status||'needs-review')===s?'selected':'')+'>'+s.replaceAll('-',' ')+'</option>').join('')+'</select></label><div class="actions"><button class="primary" type="submit">Save review</button><button type="button" id="download-asset">Download asset</button></div></form>'+
   (related.length?'<details><summary>Source and derived versions</summary>'+related.map(x=>'<p>'+esc(x.name)+' · '+esc(x.status||'needs-review')+'</p>').join('')+'</details>':'')+
   '<details><summary>Review history ('+(m.reviewHistory?.length||0)+')</summary>'+(m.reviewHistory||[]).map(h=>'<p>'+esc(date(h.at))+' · v'+h.version+' · '+esc(h.status)+'</p><pre>'+esc(h.caption)+'</pre>').join('')+'</details><p class="hint">Approval records your decision; it does not publish. To change pixels or framing, render or edit the source in a studio. Each result is a separate asset linked to its source.</p>';
  modal.showModal();modal.onclose=()=>URL.revokeObjectURL(url);modal.querySelector('#close-modal').onclick=()=>modal.close();modal.querySelector('#download-asset').onclick=()=>download(blob,m.name);
  const picture=modal.querySelector('img.media-preview'),video=modal.querySelector('video.media-preview');const showDimensions=(w,h)=>{modal.querySelector('#asset-dimensions').textContent=w+' × '+h+' pixels';};if(picture){picture.onload=()=>showDimensions(picture.naturalWidth,picture.naturalHeight);if(picture.complete&&picture.naturalWidth)showDimensions(picture.naturalWidth,picture.naturalHeight);}else if(video)video.onloadedmetadata=()=>showDimensions(video.videoWidth,video.videoHeight);else modal.querySelector('#asset-dimensions').textContent=m.mime;
  if(outputs.length>1)modal.querySelector('#job-output').onchange=e=>previewMedia(outputs.find(o=>o.id===e.target.value),outputs);
  modal.querySelector('#asset-review').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await send('/api/media/'+m.id,'PUT',{...Object.fromEntries(new FormData(e.target)),version:m.version||1});modal.close();await refresh();renderPage();toast('Asset review saved.');}catch(err){toast(err.message,true);e.submitter.disabled=false;}};
 }catch(e){toast(e.message,true);}
}
function settings(el){
 const settings=state.settings;
 el.innerHTML=heading('Your workspace. Your controls.','Connect providers, choose models and keep an eye on usage.')+
 '<div class="grid stats"><div class="card"><small>Estimated token cost · this month</small><div class="number">'+money(state.usage.estimated)+'</div></div><div class="card"><small>Committed + reserved</small><div class="number">'+money(state.usage.committed)+'</div></div><div class="card"><small>Monthly planning budget</small><div class="number">'+money(settings.monthlyBudget)+'</div></div><div class="card"><small>Requests needing price review</small><div class="number">'+state.usage.unpriced+'</div></div></div>'+
 '<form id="settings-form" class="stack"><div class="card"><h2>Budget controls</h2><div class="form-grid"><label>Monthly budget · USD<input name="monthlyBudget" type="number" max="100000" min="0.01" step="0.01" value="'+settings.monthlyBudget+'" required></label><label>Reserve per request · USD<input name="reservePerJob" type="number" min="0.01" step="0.01" value="'+settings.reservePerJob+'" required></label></div><p class="hint">The maximum monthly planning budget is US$100,000. Reservations prevent new jobs after that budget is committed. They cannot guarantee a hard limit on the provider’s bill. Set billing limits with each provider too. Missing prices and failed requests retain reservations until reconciled in Activity.</p></div>'+
 ['openai','anthropic','perplexity'].map(p=>{const c=settings.providers[p];return '<div class="card"><div class="provider-line"><h2>'+({openai:'OpenAI',anthropic:'Claude',perplexity:'Perplexity'}[p])+'</h2>'+pill(state.providerStatus[p]?'configured':'key needed')+'</div><div class="form-grid"><label class="full">Model ID<input name="'+p+'-model" value="'+esc(c.model)+'" placeholder="Enter a model available to your API account" maxlength="100"></label><label>Input USD / 1M tokens<input name="'+p+'-inputRate" type="number" min="0" step="0.0001" value="'+(c.inputRate??'')+'" placeholder="Leave blank if unknown"></label><label>Output USD / 1M tokens<input name="'+p+'-outputRate" type="number" min="0" step="0.0001" value="'+(c.outputRate??'')+'" placeholder="Leave blank if unknown"></label></div>'+(p==='perplexity'?'<p class="hint">Perplexity now runs through its Agent API. Enter an effort preset (fast, low, medium, high or xhigh) or a provider/model ID from Perplexity’s model list. Former Sonar IDs still work: sonar and sonar-pro use fast, sonar-reasoning-pro uses low, sonar-deep-research uses high.</p>':'')+'<p class="hint">The API key is configured in the server’s .env file as '+p.toUpperCase()+'_API_KEY. It is never returned to this screen. Restart the app after changing server keys. Token prices are your configured estimates; search/tool fees and other provider charges may be additional.</p></div>';}).join('')+
 productionSettingsHTML()+'<div class="actions"><button class="primary" type="submit">Save settings</button><button id="backup" type="button">Download workspace backup</button></div></form>'+
 '<div class="note">Current storage: <strong>'+esc(state.storageMode)+'</strong>. Use STORAGE_MODE=supabase and a server-side Supabase secret to enable cloud records and private media storage. Backups contain text and metadata; download media separately.</div>'+
 '<details><summary>Recent audit history</summary>'+state.audit.slice(0,25).map(a=>'<p class="hint">'+esc(date(a.at))+' · '+esc(a.action)+' · '+esc(a.actor)+'</p>').join('')+'</details>';
 document.querySelector('#settings-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;const data=Object.fromEntries(new FormData(e.target));const providers=Object.fromEntries(['openai','anthropic','perplexity'].map(p=>[p,{model:data[p+'-model'],inputRate:data[p+'-inputRate'],outputRate:data[p+'-outputRate']}]));
 try{await send('/api/settings','PUT',{monthlyBudget:data.monthlyBudget,reservePerJob:data.reservePerJob,providers,production:{imageModel:data.imageModel,videoModel:data.videoModel,reserve:data.mediaReserve}});await refresh();renderPage();toast('Settings saved.');}catch(err){toast(err.message,true);}finally{btn.disabled=false;}};
 document.querySelector('#backup').onclick=()=>{const {brands,drafts,jobs,media,audit,settings,version,reconciliations=[],schedules=[],contentPlans=[],analytics={},researchWatchlists=[],researchResults=[],inboxHandling={}}=state;download(new Blob([JSON.stringify({version,brands,drafts,jobs,media,audit,settings,reconciliations,schedules,contentPlans,analytics,researchWatchlists,researchResults,inboxHandling},null,2)],{type:'application/json'}),'sniff-workspace-backup.json');};
}
async function init(){
 try{await refresh();render();}catch(e){app.innerHTML='<div class="card connection-error"><h1>Workspace unavailable</h1><p>'+esc(e.message)+'</p><button id="retry">Try again</button></div>';document.querySelector('#retry').onclick=init;}
}
observeDictation(document.body);
await init();
setInterval(async()=>{if(!state||document.hidden)return;try{const before=new Map(state.jobs.map(j=>[j.id,j.status]));await refresh();for(const j of state.jobs)if(before.has(j.id)&&before.get(j.id)!==j.status&&['completed','failed','interrupted','incomplete'].includes(j.status))toast(j.status==='completed'?(j.type==='brand-research'?'Brand suggestions ready: ':j.type==='production'?'Media ready: ':j.type==='plan-day'?'Plan day ready: ':'Draft ready: ')+j.title:'Request needs attention: '+j.title,j.status!=='completed');const badge=document.querySelector('#job-count');if(badge)badge.textContent=state.jobs.filter(j=>['queued','running'].includes(j.status)).length;if(['dashboard','jobs'].includes(page)&&!modal.open)renderPage();}catch{}},2500);

