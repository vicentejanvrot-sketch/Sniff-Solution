let cleanup=()=>{};
export function clearThumbnails(){cleanup();cleanup=()=>{};}
export function thumbnailHTML(m,esc){return m.mime.startsWith('image/')?'<div class="asset-thumbnail"><img data-thumbnail="'+esc(m.id)+'" alt="'+esc(m.name)+'" hidden><span class="hint">Loading image…</span></div>':'<div class="media-symbol" aria-hidden="true">'+(m.mime.startsWith('video/')?'▷':'▤')+'</div>';}
export function loadThumbnails(root,api){
 clearThumbnails();const controller=new AbortController(),urls=[],queue=[];let active=0,disposed=false;
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);queue.push(entry.target.querySelector('[data-thumbnail]'));}pump();},{rootMargin:'150px'});
 async function load(img){
  const status=img.nextElementSibling;
  try{const blob=await api('/api/media/'+encodeURIComponent(img.dataset.thumbnail)+'/thumbnail',{signal:controller.signal});if(disposed||!img.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);img.onload=()=>{if(!disposed){img.hidden=false;status.hidden=true;}};img.onerror=()=>{status.textContent='Thumbnail unavailable. Use Preview.';};img.src=url;}
  catch{if(!disposed&&img.isConnected)status.textContent='Thumbnail unavailable. Use Preview.';}
 }
 function pump(){while(!disposed&&active<2&&queue.length){active++;load(queue.shift()).finally(()=>{active--;pump();});}}
 root.querySelectorAll('[data-thumbnail]').forEach(img=>observer.observe(img.parentElement));
 cleanup=()=>{disposed=true;observer.disconnect();controller.abort();for(const url of urls)URL.revokeObjectURL(url);};
}
