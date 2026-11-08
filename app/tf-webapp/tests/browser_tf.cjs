const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
 const base=process.env.TF_TEST_URL;if(!base)throw Error('TF_TEST_URL required');
 try{
 await page.goto(base);await page.locator('#form:not([hidden])').waitFor();
 for(const id of ['#evaluateVariables','#previewButton'])assert.equal(await page.locator(id).evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(26, 115, 232)');
 assert.equal(await page.locator('#correct .assertion').count(),1);assert.equal(await page.locator('#wrong .assertion').count(),1);
 assert(await page.locator('#correct .assertion-actions button:first-child').isDisabled());assert(await page.locator('#wrong .assertion-actions button:first-child').isDisabled());
 await page.locator('#name').fill('Synthetic TF');await page.locator('#variables').fill('A:42;');
 await page.locator('#correct .assertion-actions button:last-child').first().click();await page.locator('#correct textarea').nth(1).fill('\\(1+1=2\\)');
 await page.locator('#correct input[type=checkbox]').nth(1).uncheck();assert.equal(await page.locator('#correct textarea').nth(1).getAttribute('aria-label'),'正しい主張 2 shared');
 // Keep ja/en active; deselect other translations without deleting their text.
 for(const code of ['fr','it','de','pt','zh','ko','ru','sv'])await page.locator('#languages label').filter({hasText:new RegExp('^'+code+'$')}).locator('input').uncheck();
 await page.locator('#translationRequest').click();let source=JSON.parse(await page.locator('#translationJSON').inputValue());
 assert(source.messages['correct:0']);assert(!source.messages['correct:1']);assert(source.messages.msgT&&source.messages.msgF);
 source.translations={en:Object.fromEntries(Object.entries(source.messages).map(([k,v])=>[k,{true:v.true,false:''}]))};
 source.translations.en.msgT.true='Correct, synthetic.';await page.locator('#translationJSON').fill(JSON.stringify(source));await page.locator('#translationApply').click();
 await page.locator('#textLanguage').selectOption('en');assert.equal(await page.locator('#feedbackTrue').inputValue(),'Correct, synthetic.');assert.equal(await page.locator('#correct textarea').nth(1).inputValue(),'\\(1+1=2\\)');
 // Export CSV via real UI, reimport into an independent editor page.
 await page.locator('#uiLanguage').selectOption('en');
 const csvMenu=page.locator('#menus details').filter({has:page.locator('summary', {hasText:'CSV'})});await csvMenu.locator('summary').click();
 let waiting=page.waitForEvent('download');await csvMenu.getByRole('button',{name:'Save',exact:true}).click();let dl=await waiting;const csv=await fs.readFile(await dl.path());assert(csv.toString().includes('%_noidea,false'));
 const second=await browser.newPage();await second.addInitScript(()=>{window.showSaveFilePicker=undefined;});second.on('pageerror',e=>errors.push(String(e)));await second.goto(base+'/?lang=en');await second.locator('#form:not([hidden])').waitFor();await second.locator('#sourceFile').setInputFiles({name:'Synthetic.csv',mimeType:'text/csv',buffer:csv});await second.waitForFunction(()=>document.getElementById('name').value==='Synthetic TF');
 assert.equal(await second.locator('#correct textarea').count(),2);assert.equal(await second.locator('#variables').inputValue(),'A:42;');
 const xmlMenu=second.locator('#menus details').filter({has:second.locator('summary',{hasText:'XML'})});await xmlMenu.locator('summary').click();waiting=second.waitForEvent('download');await xmlMenu.getByRole('button',{name:'Save',exact:true}).click();dl=await waiting;const xml=(await fs.readFile(await dl.path())).toString();assert(xml.includes('AssertC2:castext('));assert(xml.includes('rand([AssertC1, AssertC2])'));assert(xml.includes('A:42;'));assert(xml.includes('Correct, synthetic.'));
 // Mock only the external STACK response: verify actual preview UI transport and isolation.
 await second.route('**/api/stack/preview',route=>route.fulfill({json:{questionrender:'<p>TF synthetic</p><select name="mcqpreview_ans1"><option value="1">True</option><option value="2">False</option></select>',practiceToken:'synthetic-token'}}));
 await second.route('**/api/stack/grade',async route=>{const body=route.request().postDataJSON();assert.equal(body.token,'synthetic-token');assert.equal(body.answers.ans1,'2');await route.fulfill({json:{isgradable:true,score:0,specificfeedback:'Synthetic feedback \\( {\\color{red}{\\underline{1}}} \\)' }});});
 const mathFailures=[];second.on('response',r=>{if(r.url().includes('/vendor/')&&r.status()>=400)mathFailures.push(r.url());});await second.locator('#previewButton').click();await second.locator('[data-grade]:not([disabled])').waitFor();await second.frameLocator('iframe').locator('select').selectOption('2');await second.locator('[data-grade]').click();await second.frameLocator('iframe').getByText('Synthetic feedback').waitFor();assert.equal(await second.frameLocator('iframe').locator('mjx-container svg').count(),1);assert.equal(await second.frameLocator('iframe').locator('[data-mml-node="merror"]').count(),0);assert.deepEqual(mathFailures,[]);await second.locator('[data-close]').click();
 await second.setViewportSize({width:390,height:844});assert(await second.locator('#correct .assertion-actions button:last-child').first().isVisible());
 await second.locator('#correct .assertion-actions button:first-child').nth(1).click();assert.equal(await second.locator('#correct textarea').count(),1);assert(await second.locator('#correct .assertion-actions button:first-child').isDisabled());
 await second.screenshot({path:process.env.TF_SCREENSHOT||'/tmp/tf-authoring.png',fullPage:true});
 await second.close({runBeforeUnload:false});assert.deepEqual(errors,[]);
 console.log('PASS TF browser: pool minimum/add/remove, shared-language exclusion, manual translation, ja/en, real CSV/XML save/reload, user variables, mocked preview/grade transport, narrow layout; no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
