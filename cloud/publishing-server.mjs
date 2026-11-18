// Separate public cloud process; never imports or exposes the desktop server.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
export function createPublishingServer(){
 return http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method==='GET'&&req.url?.split('?')[0]==='/healthz'){
   res.writeHead(200);return res.end(JSON.stringify({ok:true,service:'sniff-publishing',publishingEnabled:false}));
  }
  if(req.method==='GET'&&req.url?.split('?')[0]==='/auth/meta/callback'){
   res.writeHead(503);return res.end(JSON.stringify({error:'Instagram authorization is not activated.'}));
  }
  res.writeHead(404);res.end(JSON.stringify({error:'Not found'}));
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createPublishingServer();
 server.listen(Number(process.env.PORT||10000),'0.0.0.0');
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
