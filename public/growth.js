export function mountGrowth(el,{mode,state,activeBrand,esc,heading,api,send,refresh:refreshApp,toast,startResearchPlan}){

 const view=Symbol('growth');el.growthView=view;const current=()=>el.isConnected&&el.growthView===view;

 let brandId=activeBrand||state.brands[0]?.id||'',accounts=[],accountId='',selected='',data={items:[],replies:[],sync:[]},busy=false,status='',accountsLoading=true;

 const q=s=>el.querySelector(s),refresh=async()=>Object.assign(state,await refreshApp()),brand=()=>state.brands.find(b=>b.id===brandId);

 const models=()=>['openai','anthropic'].filter(p=>state.providerStatus[p]&&state.settings.providers[p]?.model);

 const modelHTML=()=>'<label>Text model<select name="provider">'+models().map(p=>'<option value="'+p+'">'+esc(p)+' · '+esc(state.settings.providers[p].model)+'</option>').join('')+'</select></label><p class="hint">AI analysis or drafting is a separate paid text request, reserving US$'+Number(state.settings.reservePerJob).toFixed(2)+'. Review every result before use.</p>';

 const val=v=>Number.isFinite(v)?String(v):'Unavailable';

 async function run(fn){if(busy)return;busy=true;const controls=[...el.querySelectorAll('button,select,input,textarea')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);let success=false;try{await fn();success=true;}catch(e){status=e.message;toast(e.message,true);}finally{busy=false;if(current()){if(success)draw();else{controls.forEach(([b,disabled])=>b.disabled=disabled);q('#growth-status').textContent=status;}}}}

 function shell(title,description){el.innerHTML=heading(title,description)+'<div class="card actions"><label>Brand<select id="growth-brand">'+state.brands.map(b=>'<option value="'+b.id+'" '+(b.id===brandId?'selected':'')+'>'+esc(b.name)+'</option>').join('')+'</select></label><label>Instagram account<select id="growth-account"><option value="">Choose account</option>'+accounts.filter(a=>a.brand_id===brandId).map(a=>'<option value="'+a.id+'" '+(a.id===accountId?'selected':'')+'>@'+esc(a.username)+'</option>').join('')+'</select></label></div><p id="growth-status" role="status">'+esc(status)+'</p><div id="growth-body"></div>';

  q('#growth-brand').onchange=e=>{brandId=e.target.value;accountId='';selected='';data={items:[],replies:[],sync:[]};status='';chooseAccount();draw();};q('#growth-account').onchange=e=>{accountId=e.target.value;data={items:[],replies:[],sync:[]};status='';if(mode==='inbox')void run(loadInbox);else draw();};

 }

 function chooseAccount(){const options=accounts.filter(a=>a.brand_id===brandId);if(!options.some(a=>a.id===accountId))accountId=options.length===1?options[0].id:'';}

 function draw(){if(!current())return;chooseAccount();shell(mode==='inbox'?'Comments & messages':'Content Research',mode==='inbox'?'Review incoming conversations and prepare replies in your brand voice.':'Discover public industry content, compare competitors and turn evidence into original experiments.');if(accountsLoading){q('#growth-body').textContent='Loading connected accounts…';return;}if(!brand()){q('#growth-body').innerHTML='<p>Create a brand first.</p>';return;}if(mode==='inbox')drawInbox();else drawResearch();}

 function drawResearch(){

  const w=(state.researchWatchlists||[]).find(w=>w.brandId===brandId)||{competitors:[],hashtags:[],notes:''},results=(state.researchResults||[]).filter(r=>r.brandId===brandId);

  if(!results.some(r=>r.id===selected))selected=results[0]?.id||'';const r=results.find(r=>r.id===selected),analysis=state.drafts.find(d=>d.brandId===brandId&&d.growth?.kind==='research'&&d.growth.researchId===selected);

  q('#growth-body').innerHTML='<form id="research-targets" class="card stack"><h2>Research watchlist</h2><label>Competitor usernames (up to five, separated by commas)<input name="competitors" value="'+esc(w.competitors.join(', '))+'" placeholder="Choose relevant professional accounts"></label><label>Industry hashtags (up to three, separated by commas)<input name="hashtags" value="'+esc(w.hashtags.join(', '))+'" placeholder="travelplanning, holidaytravel"></label><label>Research focus and observed visual notes<textarea aria-label="Research focus and observed visual notes" name="notes" maxlength="3000">'+esc(w.notes)+'</textarea></label><p class="hint">Public professional accounts only. Hashtag discovery needs Meta Public Content Access and is limited to 30 unique hashtags per account over seven days, including other apps. Video media may be unavailable; analysis here uses captions, public metrics and your observations, not unseen video or audio.</p><div class="actions"><button type="submit">Save watchlist</button><button type="button" id="research-collect" '+(!accountId?'disabled':'')+'>Research now</button></div></form><div class="card stack"><div class="actions"><label>Saved research<select id="research-result"><option value="">No research selected</option>'+results.map(r=>'<option value="'+r.id+'" '+(r.id===selected?'selected':'')+'>'+esc(r.capturedAt)+' · '+r.posts.length+' posts</option>').join('')+'</select></label><button id="research-refresh">Refresh results</button></div>'+(r?'<p>'+esc(r.definition)+'</p>'+(r.warnings.length?'<details class="note"><summary>Collection warnings ('+r.warnings.length+')</summary>'+r.warnings.map(x=>'<p>'+esc(x)+'</p>').join('')+'</details>':'')+modelHTML()+'<div class="actions"><button id="research-analyze" '+(!r.posts.length||!models().length?'disabled':'')+'>Analyze patterns & draft experiments</button><button id="research-plan" '+(!r.posts.length?'disabled':'')+'>Use research in new plan</button></div>':'<p>Save a watchlist, select a connected account and choose Research now. This does not generate content or publish anything.</p>')+'</div>'+(analysis?'<form id="research-analysis" class="card stack"><h2>Analysis for review</h2><textarea aria-label="Analysis for review" name="text" rows="16" maxlength="30000">'+esc(analysis.text)+'</textarea><button>Save analysis edits</button><p class="hint">Hypotheses require testing. Review this analysis before carrying it into a plan.</p></form>':'')+(r?'<div class="card table-wrap"><h2>Public content sample</h2><label>Show format<select id="research-format"><option value="all">All formats</option><option value="video">Reels / video</option></select></label><table><thead><tr><th>Source / published</th><th>Caption / post</th><th>Format</th><th>Likes</th><th>Comments</th><th>Views</th><th>Relative interactions</th></tr></thead><tbody id="research-rows"></tbody></table></div>':'');

  q('#research-targets').oninput=()=>{q('#research-collect').disabled=true;};

  q('#research-targets').onsubmit=event=>{event.preventDefault();const b=Object.fromEntries(new FormData(event.target));void run(async()=>{const split=v=>v.split(',').map(x=>x.trim().replace(/^[@#]/,'')).filter(Boolean);await send('/api/research/settings','POST',{brandId,competitors:split(b.competitors),hashtags:split(b.hashtags),notes:b.notes});await refresh();status='Watchlist saved.';});};

  q('#research-collect').onclick=()=>void run(async()=>{const result=await send('/api/research/collect','POST',{brandId,accountId});selected=result.id;await refresh();status=result.posts.length+' public posts collected.'+(result.warnings.length?' '+result.warnings.length+' collection warning(s); review Collection warnings below.':' Ready for analysis.');});

  q('#research-result').onchange=e=>{selected=e.target.value;draw();};q('#research-refresh').onclick=()=>void run(async()=>{await refresh();status='Saved research and AI drafts refreshed.';});

  if(!r)return;

  q('#research-analyze').onclick=()=>void run(async()=>{await send('/api/research/analyze','POST',{brandId,researchId:r.id,provider:q('[name=provider]').value});await refresh();status='Analysis queued. Follow Activity, then Refresh results here. This is a paid text request.';});

  q('#research-plan').onclick=()=>startResearchPlan({research:r,analysis:analysis?.text||'',brandId});

  if(analysis)q('#research-analysis').onsubmit=e=>{e.preventDefault();void run(async()=>{await send('/api/drafts/'+analysis.id,'PUT',{title:analysis.title,text:e.target.elements.text.value,version:analysis.version,status:'needs-review'});await refresh();status='Analysis edits saved for review.';});};

  function rows(){q('#research-rows').innerHTML=r.posts.filter(p=>q('#research-format').value!=='video'||['video','reel'].includes(p.format)).map(p=>'<tr><td>'+esc(p.source)+'<br>'+esc(p.publishedAt||'Unavailable')+'</td><td>'+esc(p.caption)+(p.permalink?'<br><a target="_blank" rel="noopener noreferrer" href="'+esc(p.permalink)+'">View original post</a>':'')+'</td><td>'+esc(p.format)+'</td><td>'+val(p.likes)+'</td><td>'+val(p.comments)+'</td><td>'+val(p.views)+'</td><td>'+(Number.isFinite(p.relativeInteractions)?p.relativeInteractions.toFixed(2)+'× sample median':'Unavailable')+'</td></tr>').join('');}q('#research-format').onchange=rows;rows();

 }

 async function loadInbox(){if(!accountId){status='Choose a connected account.';return;}const result=await api('/api/inbox?accountId='+encodeURIComponent(accountId));if(current())data=result;}

 function drawInbox(){

  const handling=i=>state.inboxHandling?.[accountId+':'+i.id]?.status||'open';

  const inbound=data.items.filter(x=>x.direction==='inbound'),pending=inbound.filter(x=>handling(x)!=='done'&&!data.replies.some(r=>r.item_id===x.id&&r.status==='sent')).length;

  q('#growth-body').innerHTML='<div class="card stack"><div class="actions"><button id="inbox-sync" '+(!accountId?'disabled':'')+'>Collect recent comments & messages</button><button id="inbox-refresh" '+(!accountId?'disabled':'')+'>Refresh saved inbox</button><label>Show<select id="inbox-filter" aria-label="Show"><option value="pending">Needs attention ('+pending+')</option><option value="all">All conversations</option><option value="human">Human follow-up</option><option value="comment">Comments</option><option value="dm">Direct messages</option></select></label></div><p>Replies are drafts until you approve the saved text and choose Send approved reply. DM sending uses the standard 24-hour inbound-message window; exceptions are not automated. A sent or uncertain reply cannot be resent here.</p><p class="hint">Recent collection: up to 25 own posts / 50 comments each, 20 conversations / 20 messages each. Saved inbox shows the latest 500 items. Webhooks receive new events once configured in Meta; permission/setup errors appear below.</p>'+data.sync.map(s=>'<p>Last collection: '+esc(s.last_success_at||'Never')+(s.last_error?'<br><span class="warning-text">'+esc(s.last_error)+'</span>':'')+'</p>').join('')+modelHTML()+'</div><div id="inbox-items" class="stack"></div>';

  q('#inbox-sync').onclick=()=>void run(async()=>{const result=await send('/api/inbox/sync','POST',{accountId});await loadInbox();status='Collected '+result.comments+' comments and '+result.messages+' messages. '+result.warnings.join(' ');});q('#inbox-refresh').onclick=()=>void run(async()=>{await refresh();await loadInbox();status='Saved inbox refreshed.';});

  function drawItems(){

   const filter=q('#inbox-filter').value,items=inbound.filter(i=>filter==='all'||filter==='human'&&handling(i)==='human'||filter===i.kind||filter==='pending'&&handling(i)!=='done'&&!data.replies.some(r=>r.item_id===i.id&&r.status==='sent'));

   q('#inbox-items').innerHTML=items.length?items.map((i,index)=>{const reply=data.replies.find(r=>r.item_id===i.id),ai=state.drafts.find(d=>d.brandId===brandId&&d.growth?.kind==='reply'&&d.growth.accountId===accountId&&d.growth.itemId===i.id&&d.growth.sourceText===i.text),locked=reply&&reply.status!=='draft',history=data.items.filter(x=>x.kind===i.kind&&x.thread_id===i.thread_id).slice(0,20).reverse();

    return '<form class="card stack" data-inbox-index="'+index+'"><h2>'+esc(i.kind==='comment'?'Comment':'Direct message')+' · '+esc(i.username||i.peer_id)+'</h2><p>'+esc(i.received_at)+'</p><p style="white-space:pre-wrap">'+esc(i.text)+'</p><details><summary>Conversation context</summary>'+history.map(m=>'<p><strong>'+esc(m.direction)+' · '+esc(m.received_at)+'</strong><br>'+esc(m.text)+'</p>').join('')+'</details><label>Reply for review<textarea aria-label="Reply for review" name="reply" maxlength="1000" '+(locked?'readonly':'')+'>'+esc(reply?.text||ai?.text||'')+'</textarea></label><p>Handling: '+esc(handling(i))+' · Reply status: '+esc(reply?.status||'Not saved')+(reply?.approved?' · approved':'')+'</p><div class="actions"><button type="button" data-human>Mark for human follow-up</button><button type="button" data-handled>Mark handled</button><button type="button" data-reopen>Reopen</button><button type="button" data-draft '+(locked||!models().length?'disabled':'')+'>Draft suggested reply</button><button type="submit" '+(locked?'disabled':'')+'>Save draft</button><button type="submit" value="approve" '+(locked?'disabled':'')+'>Save & approve reply</button><button type="button" data-send '+(!reply?.approved||locked?'disabled':'')+'>Send approved reply</button></div><p class="hint">Review the recipient, facts and exact wording. Route complaints, refunds and sensitive requests to a person. Approval is invalidated by editing.</p></form>';

   }).join(''):'<div class="empty"><h3>No messages in this view</h3><p>Collect recent comments & messages or check Meta permissions and webhook setup.</p></div>';

   el.querySelectorAll('[data-inbox-index]').forEach(form=>{const item=items[Number(form.dataset.inboxIndex)],reply=data.replies.find(r=>r.item_id===item.id);form.elements.reply.oninput=()=>{form.querySelector('[data-send]').disabled=true;};form.onsubmit=e=>{e.preventDefault();const approved=e.submitter.value==='approve',content=form.elements.reply.value;void run(async()=>{await send('/api/inbox/reply','POST',{accountId,itemId:item.id,text:content,version:reply?.version||0,approved});await loadInbox();status=approved?'Exact reply saved and approved. Review recipient before Send.':'Draft saved.';});};for(const [selector,handlingStatus] of [['[data-human]','human'],['[data-handled]','done'],['[data-reopen]','open']])form.querySelector(selector).onclick=()=>void run(async()=>{await send('/api/inbox/handling','POST',{accountId,itemId:item.id,status:handlingStatus});await refresh();status='Handling updated: '+handlingStatus;});form.querySelector('[data-draft]').onclick=()=>void run(async()=>{await send('/api/inbox/draft','POST',{accountId,brandId,itemId:item.id,provider:q('[name=provider]').value});await refresh();status='AI reply queued. Follow Activity, then Refresh saved inbox. Nothing has been sent.';});form.querySelector('[data-send]').onclick=()=>{if(form.elements.reply.value!==reply?.text){toast('Save and approve the edited text first.',true);return;}if(!confirm('Send this exact reply to '+(item.username||item.peer_id)+'?\n\n'+reply.text))return;void run(async()=>{try{await send('/api/inbox/send','POST',{accountId,itemId:item.id,version:reply.version,confirm:true});status='Reply sent.';}finally{await loadInbox();}});};});

  }q('#inbox-filter').onchange=drawItems;drawItems();

 }

 draw();api('/api/social/accounts').then(async r=>{if(!current())return;accounts=(r.accounts||[]).filter(a=>a.status==='connected');chooseAccount();if(mode==='inbox'&&accountId){try{await loadInbox();}catch(e){status=e.message;}}accountsLoading=false;if(current())draw();}).catch(e=>{accountsLoading=false;status=e.message;if(current())draw();});

}
