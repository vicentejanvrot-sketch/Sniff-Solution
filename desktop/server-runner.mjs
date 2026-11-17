import {createInterface} from 'node:readline';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server.mjs';

const home=process.env.SNIFF_DESKTOP_HOME;
if(!home||!path.isAbsolute(home))throw new Error('Start Sniff Solution using its desktop shortcut.');
const data=path.join(home,'data');
const ownerFile=path.join(home,'desktop-owner.json');
const urlFile=path.join(home,'desktop.url');
await mkdir(data,{recursive:true});
let previous;
try{previous=JSON.parse(await readFile(ownerFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(previous){
 if(!Number.isInteger(previous.pid)||previous.pid<1)throw new Error('Invalid desktop ownership record. See the desktop log before removing it.');
 let alive=true;
 try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
 if(alive)throw new Error('A previous Sniff server is still running. Quit Sniff from its tray icon before restarting.');
 // Only desktop-owned locks with a confirmed dead process are reclaimed.
 await unlink(path.join(data,'workspace.lock')).catch(e=>{if(e.code!=='ENOENT')throw e;});
 await unlink(ownerFile);
}
const app=await createApp({dir:data});
await writeFile(ownerFile,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{mode:0o600});
let stopping=false;
async function shutdown(){
 if(stopping)return;stopping=true;
 try{
  await app.close();
  await unlink(ownerFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await unlink(urlFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
  process.exit(0);
 }catch(e){console.error('Shutdown failed: '+e.message);process.exitCode=1;}
}
const input=createInterface({input:process.stdin});
input.on('line',line=>{if(line.trim()==='quit')shutdown();});
input.on('close',shutdown); // A closed/crashed launcher must not leave a hidden server.
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,shutdown);
await new Promise((resolve,reject)=>{
 app.server.once('error',reject);
 app.server.listen(0,'127.0.0.1',resolve);
});
const url='http://127.0.0.1:'+app.server.address().port+'/';
await writeFile(urlFile,url,{mode:0o600});
console.log('SNIFF_READY '+url);
app.pump().catch(e=>console.error('Queue persistence error: '+e.message));
