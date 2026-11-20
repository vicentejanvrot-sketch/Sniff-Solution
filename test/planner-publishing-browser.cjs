const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdtemp,rm,writeFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
(async()=>{
 const {createApp}=await import('../server.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-planner-publish-ui-'));
 const account={id:'00000000-0000-4000-8000-000000000001',brand_id:'brand',username:'testaccount',instagram_user_id:'123456789',status:'connected'};
 const remote=new Map(),staged=[],enqueued=[];
 const app=await createApp({dir,env:{PUBLISHING_OWNER_KEY:'x'.repeat(44),FFMPEG:process.env.FFMPEG||'ffmpeg'},fontCatalogProvider:async()=>[],fetcher:async(url,opts)=>{
  if(String(url).endsWith('/api/social/accounts'))return Response.json({accounts:[account]});
  if(String(url).endsWith('/api/publishing/stage')){staged.push(opts.headers['X-Publication-Id']);return Response.json({ok:true});}
  if(String(url).endsWith('/api/publishing/enqueue')){const b=JSON.parse(opts.body);enqueued.push(b);remote.set(b.id,{id:b.id,status:'scheduled',last_error:null});if(enqueued.length===2)throw Error('Uncertain network acknowledgement');return Response.json({ok:true});}
  if(String(url).endsWith('/api/publishing/jobs'))return Response.json({jobs:[...remote.values()]});
  throw Error('Unexpected network request '+url);
 }});
 await app.store.update(s=>{s.brands=[{id:'brand',name:'Test brand',font:'Arial',palette:''}];});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 const send=async(route,b)=>{const res=await fetch(base+route,{method:'POST',headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:JSON.stringify(b)});assert.ok(res.ok,await res.clone().text());return res.json();};
 const plan=await send('/api/plans',{brandId:'brand',title:'Three approved posts',goal:'A useful campaign',timezone:'America/Edmonton',days:Array.from({length:3},(_,i)=>({localTime:new Date(Date.now()+(i+7)*86400000).toISOString().slice(0,10)+'T14:15',format:i===2?'image':'reel',duration:10}))});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEElEQVR4nGP8ywACLGCSAQANEQED1LYyQAAAAABJRU5ErkJggg==','base64');
 await app.store.update(s=>{for(const e of s.contentPlans[0].entries){Object.assign(e,{status:'approved',title:'Approved idea',prompt:'Reviewed scene',caption:'Public caption '+e.id});s.jobs.push({id:'job-'+e.id,type:'production',status:'completed',createdAt:new Date().toISOString(),reservation:0,costEstimate:0,brandId:'brand',plannerEntryId:e.id,plannerPlanId:plan.id,plannerEntryVersion:e.version,production:{kind:e.format==='image'?'image':'video',duration:e.duration,aspect:e.aspect,prompt:e.prompt,caption:e.caption,overlay:e.onScreenText},config:{model:'FFmpeg'}});s.media.push({id:'media-'+e.id,file:'media-'+e.id,brandId:'brand',name:e.format==='image'?'Finished image':'Finished Reel',mime:e.format==='image'?'image/png':'video/mp4',role:'rendered',status:'approved',version:1,jobId:'job-'+e.id});}});
 for(const [index,e] of plan.entries.entries()){await writeFile(path.join(dir,'uploads','media-'+e.id),e.format==='image'?png:Buffer.from('synthetic MP4'));if(index<2)await send('/api/plans/'+plan.id+'/days/'+e.id+'/schedule',{version:e.version,mediaId:'media-'+e.id,accountId:account.id});}
 const changed=app.store.read().contentPlans[0].entries[2];const changedTime=changed.localTime.slice(0,11)+'16:30';
 const edit=await fetch(base+'/api/plans/'+plan.id+'/days/'+changed.id,{method:'PUT',headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:JSON.stringify({...changed,localTime:changedTime,status:'approved'})});assert.equal(edit.status,200);Object.assign(plan.entries[2],await edit.json());
 const originalIds=app.store.read().schedules.map(x=>x.id).sort();assert.equal(enqueued.length,0);
 const browser=await chromium.launch({headless:true,executablePath:process.env.SNIFF_TEST_BROWSER||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});await page.goto(base);
  await page.locator('nav').getByRole('button',{name:'Content Planner',exact:true}).click();
  await page.getByRole('button',{name:'Schedule & activate ready posts (3)',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#plan-publish-status')?.textContent.includes('2 post(s) activated'));
  assert.equal(await page.getByRole('heading',{name:'Content Planner',exact:true}).count(),1);assert.equal(staged.length,3);assert.equal(enqueued.length,3);assert.equal(app.store.read().schedules.length,3);assert.ok(originalIds.every(id=>app.store.read().schedules.some(x=>x.id===id)));
  assert.equal(app.store.read().schedules.filter(x=>x.activationState==='uncertain').length,1);assert.equal(await page.getByRole('button',{name:'Schedule & activate ready posts (0)',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('[data-plan-day][open]').count(),0);assert.equal(await page.getByText('Approved',{exact:true}).count(),3);await page.locator('[data-plan-day]').filter({hasText:'activation needs checking'}).locator('summary').first().click();
  await page.getByRole('button',{name:'Check activation status',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#plan-publish-status').textContent==='Publishing status refreshed.');
  assert.equal(app.store.read().schedules.filter(x=>x.activationState==='active').length,3);assert.equal(enqueued.length,3);assert.equal(await page.locator('[data-schedule]').filter({hasText:'Activated'}).count(),3);
  for(const posted of enqueued){const row=app.store.read().schedules.find(x=>x.id===posted.id);assert.equal(posted.scheduledAt,row.scheduledAt);assert.equal(row.localTime,plan.entries.find(e=>e.id===row.plannerEntryId).localTime);assert.equal(posted.caption,row.caption);}
  await page.reload();await page.locator('nav').getByRole('button',{name:'Content Planner',exact:true}).click();assert.equal(await page.locator('[data-schedule]').filter({hasText:'Activated'}).count(),3);assert.equal(enqueued.length,3);
  await page.screenshot({path:path.join(__dirname,'../build/planner-live-scheduling.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  console.log('Planner publishing browser passed: activate two Reels and one image directly, reuse all saved schedules/times, handle partial uncertainty, reconcile without resubmission, prevent duplicates and preserve mobile layout.');
 }finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
