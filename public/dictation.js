let active=null;
export function stopDictation(){if(active){const current=active;active=null;try{current.recognition.abort();}catch{}current.finish();}}
export function dictationControls(name,label){return '<div class="dictation-controls"><button type="button" data-dictate="'+name+'" aria-label="Dictate '+label+'" aria-pressed="false">🎙 Dictate</button><span data-dictation-status="'+name+'" class="hint" role="status" aria-live="polite"></span></div>';}
export function bindDictation(root){
 const Speech=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
 for(const button of root.querySelectorAll('[data-dictate]')){
  const field=root.querySelector('[name="'+button.dataset.dictate+'"]'),status=root.querySelector('[data-dictation-status="'+button.dataset.dictate+'"]');
  if(!Speech){button.disabled=true;status.textContent='Browser dictation unavailable. On Windows, focus this field and press Win+H to use voice typing.';continue;}
  button.onclick=()=>{
   if(active?.button===button){button.disabled=true;status.textContent='Finishing dictation…';try{active.recognition.stop();}catch{stopDictation();}return;}
   stopDictation();
   const recognition=new Speech(),seen=new Set();let message='Dictation stopped. Review the text before using it.';
   recognition.lang=navigator.language||'en-US';recognition.continuous=true;recognition.interimResults=true;
   const finish=()=>{button.disabled=false;button.textContent='🎙 Dictate';button.setAttribute('aria-pressed','false');status.textContent=message;};
   const session={recognition,button,finish};active=session;
   button.textContent='Stop dictation';button.setAttribute('aria-pressed','true');status.textContent='Starting microphone…';
   recognition.onstart=()=>{if(active===session)status.textContent='Listening… Speak, then select Stop dictation.';};
   recognition.onresult=event=>{
    if(active!==session||!field.isConnected)return;let interim='';
    for(let i=event.resultIndex;i<event.results.length;i++){
     const result=event.results[i],text=result[0]?.transcript?.trim()||'';
     if(result.isFinal&&!seen.has(i)){seen.add(i);const next=field.value+(field.value&&!/\s$/.test(field.value)?' ':'')+text;field.value=next.slice(0,field.maxLength>0?field.maxLength:30000);field.dispatchEvent(new Event('input',{bubbles:true}));if(field.value.length<next.length){message='Field length limit reached. Review the text.';recognition.stop();}}
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
