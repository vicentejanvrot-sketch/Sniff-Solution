const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
(async()=>{
 const {createApp}=await import('../server.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-phase4-ui-'));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEElEQVR4nGP8ywACLGCSAQANEQED1LYyQAAAAABJRU5ErkJggg==','base64');
 const fields={title:'Travel light',purpose:'A packing idea for travellers. Creative assumption: a weekend trip.',prompt:'0–5 seconds: a suitcase on a sunlit table. 5–10 seconds: slow camera push toward a neatly packed bag.',onScreenText:'',caption:'Pack a little lighter. Save this for your next trip. #travel'};
 let textCalls=0,imageCalls=0,syncCalls=0,videoCalls=0,failRenderOnce=false;
 const account={id:'00000000-0000-4000-8000-000000000001',brand_id:'brand',instagram_user_id:'123456789',username:'travelqa',status:'connected'};
 const app=await createApp({dir,env:{OPENAI_API_KEY:'mock',HF_API_KEY:'mock-video',PUBLISHING_OWNER_KEY:'x'.repeat(44),FFMPEG:process.env.FFMPEG||'ffmpeg'},fontCatalogProvider:async()=>[],assetDownloader:async()=>Buffer.from('mock MP4'),pollDelay:1,mediaRenderer:async r=>{if(failRenderOnce){failRenderOnce=false;throw Error('Simulated font rendering failure');}return r;},fetcher:async(url,opts)=>{
  if(String(url).endsWith('/api/publishing/stage')||String(url).endsWith('/api/publishing/enqueue'))return Response.json({ok:true});
  if(String(url).endsWith('/api/social/accounts'))return Response.json({accounts:[account]});
  if(String(url).endsWith('/v1/models'))return Response.json({data:[{id:'gpt-image-alternative'}]});
  if(String(url).includes('api.higgsfield.ai')){if(opts.method==='POST'){videoCalls++;assert.ok(String(url).endsWith('kling-video/v3.0/pro/text-to-video'));assert.equal(JSON.parse(opts.body).sound,'on');return Response.json({request_id:'model-selection-video'});}return Response.json({status:'completed',video:{url:'https://media.example.com/video.mp4'}});}
  if(String(url).endsWith('/responses')){textCalls++;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fields)}]}]});}
  if(String(url).endsWith('/images/generations')){imageCalls++;assert.equal(JSON.parse(opts.body).model,'gpt-image-alternative');return Response.json({data:[{b64_json:png.toString('base64')}]});}
  if(String(url).endsWith('/api/insights/sync')){syncCalls++;return Response.json({queued:true});}
  if(String(url).endsWith('/api/insights/snapshots'))return Response.json({accounts:[{account_id:account.id,brand_id:'brand',document:{snapshots:[{kind:'media',accountId:account.id,brandId:'brand',mediaId:'987654321',publicationId:'post',caption:fields.caption,format:'reel',publishedAt:new Date().toISOString(),capturedAt:new Date().toISOString(),metrics:{views:42,reach:20,likes:3,comments:0,saved:2,shares:null}}],warnings:[]}}]});
  throw Error('Unexpected paid/network request '+url);
 }});
 await app.store.update(s=>{s.brands=[{id:'brand',name:'Travel QA',font:'Arial',palette:''}];s.settings.providers.openai.model='test';s.settings.production={imageModel:'test-image',reserve:2};});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.SNIFF_TEST_BROWSER||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});page.on('dialog',d=>d.accept());
  const base='http://127.0.0.1:'+app.server.address().port;
  await page.goto(base);await page.locator('nav').getByRole('button',{name:'Content Planner',exact:true}).click();
  await page.getByRole('button',{name:'+ New content plan'}).click();
  await page.getByLabel('Plan title',{exact:true}).fill('One week of travel');await page.getByLabel('Campaign goal and context',{exact:true}).fill('Help travellers pack and plan.');
  const future=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await page.getByLabel('Posting date and time',{exact:true}).fill(future+'T14:00');await page.locator('[name=dayFormat]').selectOption('image');
  await page.getByRole('button',{name:'+ Add posting day'}).click();await page.getByLabel('Posting date and time',{exact:true}).nth(1).fill(future+'T16:00');
  await page.getByRole('button',{name:'Save posting days',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#plan-create-error')?.textContent||document.querySelector('#plan-select'));assert.equal(await page.locator('#plan-create-error').count()?await page.locator('#plan-create-error').textContent():'','');await page.getByRole('heading',{name:'One week of travel'}).waitFor();
  assert.equal(textCalls,0);assert.equal(imageCalls,0);await page.getByRole('button',{name:'Prepare unfinished days'}).click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('queued'));
  for(let i=0;i<100&&app.store.read().jobs.some(j=>['queued','running'].includes(j.status));i++)await new Promise(r=>setTimeout(r,50));
  await page.getByRole('button',{name:'Refresh results',exact:true}).click();await page.locator('[name=caption]').first().waitFor();
  assert.equal(await page.locator('[name=caption]').first().inputValue(),fields.caption);assert.equal(textCalls,2);
  await page.getByRole('button',{name:'Save & approve day',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('[data-produce]').disabled===false);
  await page.getByRole('button',{name:'Open Image Studio',exact:true}).click();await page.locator('#production-form').waitFor();
  assert.equal(await page.locator('[name=prompt]').inputValue(),fields.prompt);assert.equal(await page.locator('[name=caption]').inputValue(),fields.caption);
  assert.equal(await page.locator('[name=prompt]').getAttribute('readonly'),'');
  await page.getByRole('button',{name:'Load models from OpenAI',exact:true}).click();await page.locator('[name=imageModel] option[value="gpt-image-alternative"]').waitFor({state:'attached'});await page.getByLabel('Generation model',{exact:true}).selectOption('gpt-image-alternative');failRenderOnce=true;
  await page.getByRole('button',{name:'Start production',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Production queued'));
  for(let i=0;i<100&&app.store.read().jobs.some(j=>['queued','running'].includes(j.status));i++)await new Promise(r=>setTimeout(r,50));
  await page.getByRole('button',{name:'Finish saved output',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Finishing the saved original'));
  for(let i=0;i<100&&app.store.read().jobs.some(j=>['queued','running'].includes(j.status));i++)await new Promise(r=>setTimeout(r,50));
  const media=app.store.read().media.find(m=>m.role==='rendered');assert.ok(media);assert.equal(imageCalls,1);assert.equal(textCalls,2);
  const approval=await fetch(base+'/api/media/'+media.id,{method:'PUT',headers:{'X-Sniff-Client':'1','Content-Type':'application/json'},body:JSON.stringify({version:media.version,status:'approved',caption:fields.caption})});assert.equal(approval.status,200);
  await page.reload();await page.locator('nav').getByRole('button',{name:'Content Planner',exact:true}).click();
  const first=page.locator('[data-entry-form]').first();await first.locator('[name=accountId] option[value="'+account.id+'"]').waitFor({state:'attached'});
  await first.locator('[name=accountId]').selectOption(account.id);await first.locator('[name=mediaId]').selectOption(media.id);await first.getByRole('button',{name:'Schedule & activate',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#plan-publish-status').textContent.includes('Activated for automatic publishing')||document.querySelector('#toast').className==='error');assert.ok((await page.locator('#plan-publish-status').textContent()).includes('Activated for automatic publishing'),await page.locator('#toast').textContent());assert.equal(await page.getByRole('heading',{name:'Content Planner',exact:true}).count(),1);
  const schedule=app.store.read().schedules[0];assert.equal(schedule.caption,fields.caption);assert.equal(schedule.activationState,'active');
  await page.locator('nav').getByRole('button',{name:'Content Planner',exact:true}).click();
  await page.getByRole('button',{name:'Save & approve day',exact:true}).nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('[data-produce]')[1].disabled===false);
  await page.getByRole('button',{name:'Open Video Studio',exact:true}).click();
  assert.equal(await page.locator('[name=preparedPrompt]').inputValue(),fields.prompt);assert.equal(await page.getByRole('button',{name:'Start production',exact:true}).count(),1);assert.equal(textCalls,2);
  assert.equal(await page.locator('[name=videoModel] option').count(),6);await page.getByLabel('Generation model',{exact:true}).selectOption('kling-video/v3.0/pro/text-to-video');await page.getByRole('button',{name:'Start production',exact:true}).click();
  for(let i=0;i<100&&(videoCalls===0||app.store.read().jobs.some(j=>['queued','running'].includes(j.status)));i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(videoCalls,1);assert.equal(textCalls,2);assert.equal(app.store.read().jobs.find(j=>j.provider==='higgsfield').config.model,'kling-video/v3.0/pro/text-to-video');
  await page.locator('nav').getByRole('button',{name:'Performance',exact:true}).click();await page.getByRole('button',{name:'Refresh saved results',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#insights-results').textContent.includes('42'));
  assert.ok((await page.locator('#insights-results').textContent()).includes('Unavailable'));await page.getByRole('button',{name:'Request Instagram refresh'}).click();await page.waitForFunction(()=>document.querySelector('#insights-status').textContent.includes('Refresh requested'));assert.equal(syncCalls,1);
  await page.screenshot({path:path.join(__dirname,'../build/phase4-performance.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'../build/phase4-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'Mobile page should fit the viewport');
  assert.deepEqual(errors,[]);console.log('Phase 4 browser passed: multi-day planner, text review, exact studio handoff, paid media separation, approved local scheduling, Reel prefill, analytics, mobile layout.');
 }finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
