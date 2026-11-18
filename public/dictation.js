let active=null;
const bound=new WeakMap(),controls=new WeakMap(),targets=new WeakMap();
const writable=field=>field?.isConnected&&!field.readOnly&&!field.matches(':disabled')&&!field.closest('dialog:not([open])')&&!field.closest('[hidden]');
export function stopDictation(){if(active){const current=active;active=null;try{current.recognition.abort();}catch{}current.finish();}}
export function dictationControls(name,label){return '<div class="dictation-controls"><button type="button" data-dictate="'+name+'" aria-label="Dictate '+label+'" aria-pressed="false">🎙 Dictate</button><span data-dictation-status="'+name+'" class="hint" role="status" aria-live="polite"></span></div>';}
export function bindDictation(root){
 const Speech=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
 for(const button of root.querySelectorAll('[data-dictate]')){
  if(bound.has(button))continue;
  const scope=button.closest('form')||root;
  const field=targets.get(button)||[...scope.querySelectorAll('textarea,input')].find(f=>f.name===button.dataset.dictate),status=button.parentElement.querySelector('[data-dictation-status]');
  if(!field||!status)continue;
  bound.set(button,field);controls.set(field,button.parentElement);
  if(!Speech){button.disabled=true;status.textContent='Browser dictation unavailable. On Windows, focus this field and press Win+H to use voice typing.';continue;}
  button.onclick=()=>{
   if(!writable(field))return;
   if(active?.button===button){button.disabled=true;status.textContent='Finishing dictation…';try{active.recognition.stop();}catch{stopDictation();}return;}
   stopDictation();
   const recognition=new Speech(),seen=new Set();let message='Dictation stopped. Review the text before using it.';
   recognition.lang=navigator.language||'en-US';recognition.continuous=true;recognition.interimResults=true;
   const finish=()=>{button.disabled=false;button.textContent='🎙 Dictate';button.setAttribute('aria-pressed','false');status.textContent=message;};
   const session={recognition,button,finish};active=session;
   button.textContent='Stop dictation';button.setAttribute('aria-pressed','true');status.textContent='Starting microphone…';
   recognition.onstart=()=>{if(active===session)status.textContent='Listening… Speak, then select Stop dictation.';};
   recognition.onresult=event=>{
    if(active!==session)return;if(!writable(field)){stopDictation();return;}let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){
     const result=event.results[i],text=result[0]?.transcript?.trim()||'';
     if(result.isFinal&&!seen.has(i)){seen.add(i);const next=field.value+(field.value&&!/\s$/.test(field.value)?' ':'')+text;field.value=next.slice(0,field.maxLength>0?field.maxLength:30000);field.dispatchEvent(new Event('input',{bubbles:true}));if(field.value.length<next.length){message='Field length limit reached. Review the text.';try{recognition.stop();}catch{stopDictation();}return;}}
     else if(!result.isFinal)interim+=text+' ';
    }
    status.textContent=interim?'Listening: '+interim:'Listening… Text added. You can keep speaking or stop.';
   };
   recognition.onerror=event=>{if(active!==session)return;message=({'not-allowed':'Microphone access was denied. Allow microphone access in your browser, or use Win+H voice typing.','service-not-allowed':'The browser speech service is unavailable. Use Win+H voice typing.','audio-capture':'No microphone is available. Check your microphone connection.','no-speech':'No speech detected. Select Dictate to try again.','network':'The browser speech service could not connect. Check your connection or use Win+H voice typing.','aborted':'Dictation stopped.'})[event.error]||'Dictation is unavailable. You can type or use Win+H voice typing.';stopDictation();};
   recognition.onend=()=>{if(active===session){active=null;finish();}};
   try{recognition.start();}catch{message='Could not start dictation. You can type or use Win+H voice typing.';stopDictation();}
  };
 }
}

// Enhance dynamically mounted writing forms, including repeated planner days.
// Existing Studio controls are reused; read-only and disabled fields stay protected.
export function observeDictation(root){
 function scan(){
  bindDictation(root);
  for(const field of root.querySelectorAll('textarea')){
   let row=controls.get(field);
   if(!row&&!field.readOnly&&!field.matches(':disabled')){
    row=document.createElement('div');row.className='dictation-controls';
    const button=document.createElement('button'),status=document.createElement('span');
    const label=field.labels?.[0]?.cloneNode(true);label?.querySelectorAll('textarea,input,select,button').forEach(n=>n.remove());
    const name=field.name||field.id||'writing',description=field.getAttribute('aria-label')||label?.textContent.trim()||'text';
    button.type='button';button.dataset.dictate=name;button.textContent='🎙 Dictate';button.setAttribute('aria-label','Dictate '+description);button.setAttribute('aria-pressed','false');
    status.dataset.dictationStatus=name;status.className='hint';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const hint=document.createElement('small');hint.className='hint';hint.textContent='Speak to add text. Uses your browser’s speech service and may process audio online.';
    row.append(button,status,hint);(field.closest('label')||field).after(row);
    // Bind directly so identical names in separate day forms remain independent.
    controls.set(field,row);
    targets.set(button,field);
    bindDictation(field.form||root);
   }
   if(row){const hidden=!writable(field);if(row.hidden!==hidden)row.hidden=hidden;}
  }
  if(active&&(!writable(bound.get(active.button))||!active.button.isConnected||active.button.closest('[hidden]')||root.querySelector('dialog[open]')&&!active.button.closest('dialog[open]')))stopDictation();
 }
 const observer=new MutationObserver(scan);
 observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['readonly','disabled','open','hidden']});
 const stop=()=>stopDictation();root.addEventListener('submit',stop,true);root.addEventListener('close',stop,true);
 scan();return ()=>{observer.disconnect();root.removeEventListener('submit',stop,true);root.removeEventListener('close',stop,true);stopDictation();};
}
