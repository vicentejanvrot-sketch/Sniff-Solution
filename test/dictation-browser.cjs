const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
(async()=>{
 const {createApp}=await import('../server.mjs'),{createPlan}=await import('../lib/planner.mjs');
 const dir=await mkdtemp(path.join(tmpdir(),'sniff-dictation-'));
 const app=await createApp({dir,env:{},fontCatalogProvider:async()=>[]});
 await app.store.update(s=>{
  s.brands=[{id:'brand',name:'Dictation QA',voice:'Friendly',font:'Arial',palette:'',version:1}];
  s.drafts=[{id:'draft',brandId:'brand',title:'Saved draft',text:'Typed draft.',skill:'manual',status:'draft',version:1,versions:[],createdAt:new Date().toISOString()}];
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const plan=createPlan(s,{brandId:'brand',title:'Speech plan',goal:'Test writing fields',timezone:'UTC',days:[{localTime:date+'T12:00',format:'image'},{localTime:date+'T14:00',format:'reel'}]});
  for(const e of plan.entries)Object.assign(e,{title:'A trip',prompt:'Typed brief.',purpose:'A useful scene',caption:'Typed caption.',status:'needs-review'});
  s.contentPlans=[plan];
 });
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.SNIFF_TEST_BROWSER||undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.speechAborts=0;window.SpeechRecognition=class{constructor(){window.testRecognition=this;}start(){this.onstart?.();}stop(){this.onend?.();}abort(){window.speechAborts++;this.onend?.();}};});
  const base='http://127.0.0.1:'+app.server.address().port;await page.goto(base);
  const nav=name=>page.locator('nav').getByRole('button',{name,exact:true}).click();
  const speak=async(text,repeat=false)=>page.evaluate(({text,repeat})=>{const r=[{transcript:text}];r.isFinal=true;const event={resultIndex:0,results:[r]};window.testRecognition.onresult(event);if(repeat)window.testRecognition.onresult(event);},{text,repeat});
  await nav('Content Planner');await page.getByRole('button',{name:'+ New content plan'}).click();
  await page.getByLabel('Campaign goal and context',{exact:true}).fill('Christmas promotion.');
  await page.getByRole('button',{name:'Dictate Campaign goal and context',exact:true}).click();await speak('Describe our holiday offers.',true);
  assert.equal(await page.getByLabel('Campaign goal and context',{exact:true}).inputValue(),'Christmas promotion. Describe our holiday offers.');
  // Switching fields stops the previous recognizer and targets the correct repeated form.
  const days=page.locator('[data-entry-form]'),second=days.nth(1);
  await second.getByRole('button',{name:'Dictate Creative brief — sent to the media provider',exact:true}).click();await speak('Show a sunny destination.');
  assert.equal(await days.first().locator('[name=prompt]').inputValue(),'Typed brief.');assert.equal(await second.locator('[name=prompt]').inputValue(),'Typed brief. Show a sunny destination.');
  await second.getByRole('button',{name:'Dictate Instagram caption — posted with this media',exact:true}).click();await speak('Save your next trip idea.');
  assert.equal(await second.locator('[name=caption]').inputValue(),'Typed caption. Save your next trip idea.');
  await second.getByRole('button',{name:'Dictate Purpose and creative assumptions',exact:true}).click();await speak('x'.repeat(2000));assert.equal((await second.locator('[name=purpose]').inputValue()).length,1500);
  await second.getByRole('button',{name:'Dictate Instagram caption — posted with this media',exact:true}).click();
  await page.evaluate(()=>window.testRecognition.onerror({error:'not-allowed'}));assert.ok((await second.locator('[data-dictation-status=caption]').textContent()).includes('denied'));
  await second.getByRole('button',{name:'Dictate Creative brief — sent to the media provider',exact:true}).click();
  await page.evaluate(()=>{window.previousRecognition=window.testRecognition;window.oldField=document.querySelectorAll('[name=prompt]')[1];});
  const aborts=await page.evaluate(()=>window.speechAborts);await nav('Brand Studio');assert.ok(await page.evaluate(()=>window.speechAborts)>aborts);
  await page.evaluate(()=>{const r=[{transcript:'Late speech must be ignored'}];r.isFinal=true;window.previousRecognition.onresult({resultIndex:0,results:[r]});});assert.ok(!(await page.evaluate(()=>window.oldField.value)).includes('Late speech'));
  await page.getByRole('button',{name:'Edit brand',exact:true}).click();await page.getByRole('button',{name:'Dictate Tone of voice',exact:true}).click();await speak('Clear and friendly.');assert.equal(await page.getByLabel('Tone of voice',{exact:true}).inputValue(),'Friendly Clear and friendly.');
  const dialogAborts=await page.evaluate(()=>window.speechAborts);await page.getByRole('button',{name:'Close dialog',exact:true}).click();assert.ok(await page.evaluate(()=>window.speechAborts)>dialogAborts);
  await nav('Content Skills');await page.locator('[data-skill=ig-caption]').click();await page.getByRole('button',{name:'Dictate Brief and source material',exact:true}).click();await speak('A useful travel caption.');assert.equal(await page.getByLabel('Brief and source material',{exact:true}).inputValue(),'A useful travel caption.');
  await nav('Drafts & Review');await page.getByRole('button',{name:'Dictate Content',exact:true}).click();await speak('Spoken draft.');assert.equal(await page.locator('[name=text]').inputValue(),'Typed draft. Spoken draft.');assert.ok((await page.locator('#checks').textContent()).includes('characters'));
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Draft saved.');assert.equal(app.store.read().drafts[0].text,'Typed draft. Spoken draft.');
  await page.getByRole('button',{name:'Dictate Content',exact:true}).click();
  // Field protection is enforced even if a late recognition event arrives.
  await page.locator('[name=text]').evaluate(field=>field.readOnly=true);await page.waitForFunction(()=>document.querySelector('[data-dictate=text]').closest('.dictation-controls').hidden);
  await speak('Must not enter locked text.');assert.equal(await page.locator('[name=text]').inputValue(),'Typed draft. Spoken draft.');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
  assert.equal((await fetch(base+'/api/media',{method:'POST',headers:{'X-Sniff-Client':'1','X-Brand-Id':'brand','X-File-Name':'dictation.png','Content-Type':'image/png'},body:png})).status,201);
  await page.reload();await nav('Media Library');await page.getByRole('button',{name:'Preview',exact:true}).click();await page.getByRole('button',{name:'Dictate Caption / production notes',exact:true}).click();await speak('Spoken media notes.');assert.equal(await page.getByLabel('Caption / production notes',{exact:true}).inputValue(),'Spoken media notes.');await page.locator('#modal #close-modal').click();
  await nav('Publishing Calendar');await page.getByRole('button',{name:'+ Schedule post',exact:true}).click();await page.getByRole('button',{name:'Dictate Caption and hashtags',exact:true}).click();await speak('A calendar caption.');assert.equal(await page.getByLabel('Caption and hashtags',{exact:true}).inputValue(),'A calendar caption.');
  await nav('Image Studio');assert.equal(await page.getByRole('button',{name:'Dictate Creative brief',exact:true}).count(),1);
  await page.setViewportSize({width:390,height:844});await nav('Content Planner');await page.getByRole('button',{name:'+ New content plan'}).click();await page.screenshot({path:path.join(__dirname,'../build/dictation-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  const unsupported=await browser.newPage();await unsupported.addInitScript(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});await unsupported.goto(base);await unsupported.locator('nav').getByRole('button',{name:'Content Planner',exact:true}).click();await unsupported.getByRole('button',{name:'+ New content plan'}).click();assert.equal(await unsupported.getByRole('button',{name:'Dictate Campaign goal and context',exact:true}).isDisabled(),true);assert.ok((await unsupported.locator('[data-dictation-status=goal]').textContent()).includes('Win+H'));await unsupported.close();
  assert.deepEqual(errors,[]);console.log('Dictation browser passed: campaign goal, independent planner days, captions, brand modal, skill brief, draft input events, append/deduplication, limits, permission denial, navigation, dialog close, locked fields, Studio reuse, unsupported browser and mobile layout.');
 }finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
