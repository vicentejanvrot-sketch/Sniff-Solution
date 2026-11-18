export function mountSocial(el,{state,activeBrand,esc,heading,brandOptions,api,send,toast}){
 el.innerHTML=heading('Social Accounts','Connect Instagram professional accounts to your brands. Publishing is not enabled yet.')+
 '<div class="card"><h2>Connect Instagram</h2><form id="social-connect"><div class="form-grid"><label>Brand<select name="brandId" required>'+brandOptions()+'</select></label><label>Instagram username<input name="expectedUsername" placeholder="travelonepro" maxlength="30" pattern="[A-Za-z0-9._]+" required></label></div><p class="hint">Use the exact username without @. Authorization opens in a separate browser tab.</p><button class="primary" type="submit">Connect Instagram</button></form><div id="social-link"></div></div>'+
 '<div class="section-title"><h2>Connected accounts</h2><button id="social-refresh">Refresh connections</button></div><div id="social-accounts" class="card" aria-live="polite">Loading accounts…</div>';
 const panel=el.querySelector('#social-accounts'),form=el.querySelector('#social-connect'),linkPanel=el.querySelector('#social-link');
 async function refresh(){
  try{
   const data=await api('/api/social/accounts');
   if(!data.configured){panel.textContent='Set PUBLISHING_OWNER_KEY in your local server environment and restart Sniff Solution.';return;}
   const accounts=data.accounts.filter(a=>!activeBrand||a.brand_id===activeBrand);
   panel.innerHTML=accounts.length?accounts.map((a,i)=>'<div class="section-title"><div><h3>@'+esc(a.username)+'</h3><p>'+esc(state.brands.find(b=>b.id===a.brand_id)?.name||'Brand')+' · '+esc(a.status)+'</p></div><button data-account="'+i+'">'+(a.status==='connected'?'Disconnect':'Reconnect')+'</button></div>').join(''):'<p>No Instagram accounts connected for this selection.</p>';
   panel.querySelectorAll('[data-account]').forEach(btn=>btn.onclick=async()=>{
    const a=accounts[Number(btn.dataset.account)];
    if(a.status!=='connected'){form.elements.brandId.value=a.brand_id;form.elements.expectedUsername.value=a.username;form.elements.expectedUsername.focus();return;}
    if(!confirm('Disconnect this account from Sniff Solution? This removes the saved credential locally and does not revoke Meta permissions.'))return;
    btn.disabled=true;
    try{await send('/api/social/disconnect','POST',{accountId:a.id,brandId:a.brand_id});await refresh();toast('Account disconnected.');}catch(e){toast(e.message,true);}finally{btn.disabled=false;}
   });
  }catch(e){panel.textContent=e.message;}
 }
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;linkPanel.replaceChildren();
  try{
   const data=await send('/api/social/connect','POST',Object.fromEntries(new FormData(form)));
   const a=document.createElement('a');a.href=data.loginUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Continue authorization on Meta';
   const note=document.createElement('p');note.textContent='After completing authorization, return here and click Refresh connections.';
   linkPanel.append(a,note);
  }catch(e){toast(e.message,true);}finally{btn.disabled=false;}
 };
 el.querySelector('#social-refresh').onclick=refresh;refresh();
}
