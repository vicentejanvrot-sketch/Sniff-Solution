import {spawn} from 'node:child_process';
import {ffmpegPath} from './production.mjs';
export async function prepareInstagramMedia(media,bytes,{env=process.env,runner=spawn}={}){
 if(!media||!Buffer.isBuffer(bytes)||!bytes.length)throw Error('Missing approved publication media.');
 if(media.mime==='video/mp4')return {mime:'video/mp4',bytes};
 if(!['image/png','image/jpeg'].includes(media.mime))throw Error('Only approved PNG, JPEG and MP4 can be published.');
 // IG feed accepts JPEG. Preserve the whole photograph in a 1080 x 1350 frame.
 // This may add margins to tall or wide source images instead of cropping.
 const args=['-hide_banner','-loglevel','error','-nostdin','-f','image2pipe','-i','pipe:0','-vf','scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:white','-frames:v','1','-q:v','3','-f','image2pipe','-vcodec','mjpeg','pipe:1'];
 return new Promise((resolve,reject)=>{
  const child=runner(ffmpegPath(env),args,{stdio:['pipe','pipe','pipe']});
  const chunks=[];let total=0,settled=false;
  const fail=e=>{if(settled)return;settled=true;child.kill();reject(Error('Unable to prepare a compliant JPEG for Instagram. '+String(e.message||'')))};
  const timeout=setTimeout(()=>fail(Error('Media conversion timed out.')),60000);
  child.once('error',fail);
  child.stdout.on('data',part=>{total+=part.length;if(total>15*1024*1024)return fail(Error('Converted media exceeds 15 MB.'));chunks.push(part);});
  child.stdin.on('error',fail);
  child.stderr.on('data',()=>{});
  child.once('close',code=>{clearTimeout(timeout);if(settled)return;settled=true;if(code!==0)return reject(Error('Media conversion failed.'));resolve({mime:'image/jpeg',bytes:Buffer.concat(chunks)});});
  child.stdin.end(bytes);
 });
}
