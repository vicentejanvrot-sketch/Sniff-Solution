import {mkdir,readFile,writeFile,rename,open} from 'node:fs/promises';
import path from 'node:path';
import {defaults,fail} from './core.mjs';
export class Store{
 constructor({dir='.data',mode='local',url='',key='',workspace='developer',fetcher=fetch}={}){
  this.dir=path.resolve(dir);this.mode=mode;this.url=url;this.key=key;this.workspace=workspace;this.fetcher=fetcher;this.tail=Promise.resolve();this.revision=0;
 }
 async init(){
  if(!['local','supabase'].includes(this.mode))fail('Unknown storage mode.');
  await mkdir(this.dir,{recursive:true,mode:0o700});
  // Exactly one process per data directory. A stale lock after a crash must be removed manually.
  this.lock=await open(path.join(this.dir,'workspace.lock'),'wx',0o600);
  try{
   if(this.mode==='supabase'){
    if(!this.key||!this.url.startsWith('https://'))fail('Supabase storage needs SUPABASE_URL and a server-side SUPABASE_SECRET_KEY.');
    const rows=await this.cloud('GET');
    if(rows.length){this.state=rows[0].document;this.revision=rows[0].revision;}
    else{this.state=defaults();await this.cloud('POST',{workspace_id:this.workspace,revision:0,document:this.state});}
   }else{
    try{this.state=JSON.parse(await readFile(path.join(this.dir,'workspace.json'),'utf8'));}
    catch(e){if(e.code!=='ENOENT')throw e;this.state=defaults();await this.persist(this.state);}
   }
   if(this.state.version!==1)throw new Error('Unsupported data version.');
  }catch(e){await this.close();throw e;}
  return this;
 }
 async cloud(method,body,revision){
  const filter='workspace_id=eq.'+encodeURIComponent(this.workspace)+(revision==null?'':'&revision=eq.'+revision);
  const res=await this.fetcher(this.url+'/rest/v1/marketing_workspaces?'+filter,{
   method,headers:{apikey:this.key,...(this.key.startsWith('eyJ')?{Authorization:'Bearer '+this.key}:{}),'Content-Type':'application/json',Prefer:'return=representation'},
   body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)
  });
  if(!res.ok)throw new Error('Supabase storage request failed ('+res.status+'). Check server credentials and schema.');
  return res.status===204?[]:res.json();
 }
 async persist(next){
  if(this.mode==='supabase'){
   const rows=await this.cloud('PATCH',{document:next,revision:this.revision+1,updated_at:new Date().toISOString()},this.revision);
   if(rows.length!==1)throw new Error('Workspace changed in another process. Restart to reload before saving.');
   this.revision++;
  }else{
   const temp=path.join(this.dir,'workspace.tmp');
   await writeFile(temp,JSON.stringify(next,null,2),{mode:0o600});
   await rename(temp,path.join(this.dir,'workspace.json'));
  }
 }
 read(){return structuredClone(this.state);}
 update(fn){
  const op=this.tail.then(async()=>{const next=this.read();const result=await fn(next);await this.persist(next);this.state=next;return result;});
  this.tail=op.catch(()=>{});return op;
 }
 async close(){await this.tail;if(this.lock){await this.lock.close();this.lock=null;const {unlink}=await import('node:fs/promises');await unlink(path.join(this.dir,'workspace.lock')).catch(()=>{});}}
}
