export function videoBriefHTML(state,esc,money){
 const providers=['openai','anthropic'].filter(p=>state.providerStatus[p]&&state.settings.providers[p]?.model);
 return '<div class="full stack" id="video-brief-controls"><label>Brief preparation model<select name="briefProvider" aria-label="Brief preparation model">'+(providers.length?providers.map(p=>'<option value="'+p+'">'+esc(p==='anthropic'?'Claude':'OpenAI')+' · '+esc(state.settings.providers[p].model)+'</option>').join(''):'<option value="">Configure an OpenAI or Claude text model in Settings</option>')+'</select></label><p class="hint">First Sniff interprets your goal and prepares scenes, timing and camera directions. Review or edit that brief before starting video generation. Preparation is a separate text request reserving '+money(state.settings.reservePerJob)+'. Higgsfield generation has its own reservation. Preparation cannot guarantee acceptance by the provider’s content filter.</p><p id="video-brief-status" role="status"></p><div id="prepared-video-field" hidden><label>Prepared video brief — review before generation<textarea name="preparedPrompt" aria-label="Prepared video brief" maxlength="16000"></textarea></label><p class="hint">Your original description above is preserved. Start production sends this reviewed brief to Higgsfield.</p><button type="button" id="prepare-video-again">Prepare again</button></div></div>';
}
export function bindVideoBrief(form,{state,api,send,money,onChange}){
 const controls=form.querySelector('#video-brief-controls'),status=form.querySelector('#video-brief-status'),field=form.querySelector('#prepared-video-field');
 let plan=null,busy=false;
 const fingerprint=()=>JSON.stringify([form.elements.brandId.value,form.elements.prompt.value.trim(),Number(form.elements.duration.value),form.elements.aspect.value]);
 const hasPlan=()=>!!plan&&plan.fingerprint===fingerprint();
 function sync(){const render=form.elements.kind.value==='render';controls.hidden=render;field.hidden=!hasPlan();form.querySelector('[type=submit]').textContent=render||hasPlan()?'Start production':busy?'Preparing video brief…':'Prepare video brief';}
 for(const name of ['prompt','brandId','duration','aspect'])form.elements[name].addEventListener(name==='prompt'?'input':'change',()=>{if(plan&&!hasPlan())status.textContent='Your goal or video settings changed. Prepare a new brief before generating.';sync();onChange();});
 form.querySelector('#prepare-video-again').onclick=()=>{plan=null;sync();onChange();status.textContent='Select Prepare video brief to create a new version. This makes another text request.';};
 return {
  hasPlan,isBusy:()=>busy,sync,
  values:()=>({prompt:form.elements.preparedPrompt.value.trim(),originalPrompt:form.elements.prompt.value.trim(),videoBriefDraftId:plan?.draftId||''}),
  restore(draft){if(!draft.videoBrief)return false;form.elements.prompt.value=draft.videoBrief.originalPrompt;form.elements.duration.value=String(draft.videoBrief.duration);form.elements.aspect.value=draft.videoBrief.aspect;form.elements.preparedPrompt.value=draft.text;plan=draft.status==='needs-review'?null:{draftId:draft.id,fingerprint:fingerprint()};status.textContent=plan?'Saved prepared brief loaded. Review it before generating.':'This saved brief is incomplete. Prepare a new version.';sync();onChange();return true;},
  async prepareIfNeeded(){
   if(hasPlan())return false;if(busy)return true;
   if(!form.elements.briefProvider.value)throw new Error('Configure an OpenAI or Claude text model and API key in Settings to prepare your video brief.');
   const initial=fingerprint();busy=true;sync();onChange();
   try{
    const queued=await send('/api/video-brief','POST',{brandId:form.elements.brandId.value,title:((form.elements.title.value||'Video')+' · brief').slice(0,150),brief:form.elements.prompt.value,duration:form.elements.duration.value,aspect:form.elements.aspect.value,provider:form.elements.briefProvider.value});
    status.textContent='Preparing your video brief. You may leave this page; the result will be saved in Drafts & Review and Activity.';
    while(form.isConnected){
     const latest=await api('/api/state'),job=latest.jobs.find(j=>j.id===queued.id);Object.assign(state,{usage:latest.usage,jobs:latest.jobs,drafts:latest.drafts});
     if(!job)throw new Error('Brief request unavailable. Check Activity.');
     if(!['queued','running'].includes(job.status)){
      if(job.status!=='completed')throw new Error((job.error||'Brief preparation did not complete.')+' No video was generated. Check Activity.');
      const draft=latest.drafts.find(d=>d.id===job.draftId);if(!draft)throw new Error('Prepared brief unavailable. Check Drafts & Review.');
      if(initial!==fingerprint()){status.textContent='Your description or settings changed while preparation ran. The previous brief is saved in Drafts & Review. Prepare a new version for your changes.';return true;}
      form.elements.preparedPrompt.value=draft.text;plan={draftId:draft.id,fingerprint:initial};status.textContent='Brief ready. Review the scenes and timing, edit anything needed, then select Start production. Preparation estimate: '+money(job.costEstimate)+'. Review actual charges in Activity.';return true;
     }
     await new Promise(resolve=>setTimeout(resolve,1500));
    }
    return true;
   }catch(err){status.textContent='Brief preparation needs attention. Your original description is preserved. Check Activity before preparing again.';throw err;}finally{busy=false;sync();onChange();}
  }
 };
}
