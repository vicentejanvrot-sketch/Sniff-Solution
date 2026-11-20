// Image Studio only: keep native form values and validation, present accessible rich dropdowns.
export function enhanceImageStudioControls(form){
 form.classList.add('modern-image-studio');
 const pickers=[];
 const descriptions={kind:{image:'Create from a brief or edit a reference with AI.',render:'Resize or brand a saved image locally without AI charges.'},aspect:{'1:1':'Balanced square graphics and feed posts.','4:5':'Portrait format for taller Instagram feed images.','9:16':'Full-screen phone format for Stories and Reel covers.','16:9':'Wide landscapes, banners and presentation graphics.'},fit:{contain:'Keep every detail; add padding if the ratios differ.',cover:'Fill the frame; crop the edges when needed.'},imageProvider:{higgsfield:'Choose from the supported Higgsfield image models.',openai:'Choose a GPT Image model from your OpenAI account.'}};
 for(const select of form.querySelectorAll('select')){
  const originalLabel=select.parentElement.tagName==='LABEL'?select.parentElement:null;
  const label=select.getAttribute('aria-label')||originalLabel?.textContent.trim()||select.name;
  if(!select.id)select.id='image-studio-select-'+select.name;
  if(originalLabel){
   const host=document.createElement('div');host.className='studio-select-field '+originalLabel.className;if(originalLabel.id)host.id=originalLabel.id;host.hidden=originalLabel.hidden;
   originalLabel.replaceWith(host);originalLabel.removeAttribute('id');originalLabel.removeAttribute('class');originalLabel.hidden=false;originalLabel.htmlFor=select.id;
   host.append(originalLabel,select);
  }
  const menu=document.createElement('details');menu.className='image-model-menu studio-select-menu';menu.dataset.for=select.name;
  menu.innerHTML='<summary><span class="studio-select-value"></span></summary><div class="image-model-list studio-select-list"><input class="studio-select-search" type="search" placeholder="Search options…" aria-label="Search options" hidden><div class="studio-select-options" role="group"></div></div>';
  select.after(menu);select.classList.add('studio-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const summary=menu.querySelector('summary'),value=menu.querySelector('.studio-select-value'),search=menu.querySelector('input'),list=menu.querySelector('.studio-select-options');
  const validation=document.createElement('p');validation.className='studio-select-validation';validation.id=select.id+'-validation';validation.setAttribute('role','alert');validation.hidden=true;menu.after(validation);summary.setAttribute('aria-describedby',validation.id);
  list.setAttribute('aria-label',label+' options');
  function close(){menu.open=false;search.value='';}
  function drawOptions(){
   const query=search.value.trim().toLocaleLowerCase();list.replaceChildren();let previousGroup=null;
   for(const option of select.options){
    const group=option.parentElement.tagName==='OPTGROUP'?option.parentElement:null;
    if(option.hidden||group?.hidden||query&&!((option.textContent+' '+(group?.label||'')).toLocaleLowerCase().includes(query)))continue;
    if(group&&group!==previousGroup){
     const title=document.createElement('p');title.className='studio-select-group';title.textContent=group.label;list.append(title);
    }
    previousGroup=group;
    const button=document.createElement('button');button.type='button';button.className='image-model-choice studio-select-choice';button.dataset.value=option.value;button.disabled=option.disabled||!!group?.disabled;button.setAttribute('aria-pressed',String(option.selected));
    const name=document.createElement('strong');name.textContent=option.textContent;button.append(name);const description=descriptions[select.name]?.[option.value];if(description){const detail=document.createElement('small');detail.textContent=description;button.append(detail);}list.append(button);
    button.addEventListener('click',()=>{if(select.disabled||button.disabled)return;select.value=option.value;close();summary.focus();select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();});
   }
   if(!list.querySelector('button')){const empty=document.createElement('p');empty.className='hint studio-select-empty';empty.textContent='No matching options.';list.append(empty);}
  }
  function sync(){
   const name=select.selectedOptions[0]?.textContent||'Choose an option';value.textContent=name;summary.setAttribute('aria-label','Choose '+label+': '+name);menu.hidden=select.hidden;menu.classList.toggle('studio-select-disabled',select.disabled);
   summary.setAttribute('aria-disabled',String(select.disabled));summary.tabIndex=select.disabled?-1:0;
   if(select.validity.valid||select.disabled){validation.hidden=true;summary.removeAttribute('aria-invalid');}
   if(select.disabled||select.hidden)close();search.hidden=select.options.length<9;if(menu.open)drawOptions();
  }
  summary.addEventListener('click',event=>{if(select.disabled){event.preventDefault();return;}if(!menu.open){search.value='';drawOptions();}});
  menu.addEventListener('toggle',()=>{if(menu.open){if(select.disabled){close();return;}if(!list.childElementCount)drawOptions();}else search.value='';});
  search.addEventListener('input',drawOptions);
  menu.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&menu.open){event.preventDefault();close();summary.focus();return;}
   if(event.target===search&&event.key==='Enter'){event.preventDefault();return;}
   if(!['ArrowDown','ArrowUp'].includes(event.key)||select.disabled||event.target===search)return;
   event.preventDefault();if(!menu.open){menu.open=true;drawOptions();}const buttons=[...list.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement),next=index<0?(event.key==='ArrowDown'?0:buttons.length-1):Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)));buttons[next]?.focus();
  });
  menu.addEventListener('focusout',event=>{if(menu.open&&event.relatedTarget&&!menu.contains(event.relatedTarget))close();});
  if(originalLabel)originalLabel.addEventListener('click',event=>{event.preventDefault();if(!select.disabled)summary.focus();});
  select.addEventListener('change',sync);select.addEventListener('input',sync);select.addEventListener('invalid',event=>{if(!menu.hidden&&!select.disabled){event.preventDefault();summary.setAttribute('aria-invalid','true');validation.textContent='Please choose '+label.toLowerCase()+'.';validation.hidden=false;summary.focus();}});
  const observer=new MutationObserver(sync);observer.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','selected','label','value','required']});
  pickers.push({menu,sync});sync();
 }
 const syncAll=()=>pickers.forEach(p=>p.sync());
 form.addEventListener('change',event=>{if(!event.target.matches('.studio-select-search'))queueMicrotask(syncAll);});
 form.addEventListener('toggle',event=>{if(event.target.matches('.image-model-menu[open]'))for(const menu of form.querySelectorAll('.image-model-menu[open]'))if(menu!==event.target)menu.open=false;},true);
 form.addEventListener('pointerdown',event=>{for(const {menu} of pickers)if(menu.open&&!menu.contains(event.target))menu.open=false;});
 return syncAll;
}
