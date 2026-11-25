const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const sizes = [
  {name:'desktop',width:1440,height:900,isMobile:false,hasTouch:false},
  {name:'laptop',width:1280,height:800,isMobile:false,hasTouch:false},
  {name:'tablet',width:768,height:1024,isMobile:false,hasTouch:true},
  {name:'mobile',width:390,height:844,isMobile:true,hasTouch:true},
  {name:'small-phone',width:320,height:700,isMobile:true,hasTouch:true}
];
const out=path.join(process.cwd(),'audit-screenshots');
fs.mkdirSync(out,{recursive:true});
const failures=[];
async function checkOverflow(page, label){
  const r=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  assert(r.width<=r.viewport+3,label+' page overflow '+JSON.stringify(r));
}
async function shot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true,timeout:30000});}
async function test(browser,size){
 const cx=await browser.newContext({viewport:{width:size.width,height:size.height},isMobile:size.isMobile,hasTouch:size.hasTouch,deviceScaleFactor:1,locale:'en-US',reducedMotion:'reduce'});
 const page=await cx.newPage(),jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 try{
  // Prevent test traffic from reaching real Google Analytics.
  await page.route('**/gtag/js?**',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
  await page.goto(BASE+'/?utm_source=instagram&utm_medium=social&utm_campaign=closet_launch',{waitUntil:'domcontentloaded',timeout:40000});
  await page.locator('#shs-analytics-choice').waitFor({state:'visible',timeout:10000});
  assert.equal(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count(),0,'Google Analytics loaded before consent');
  assert.equal(await page.evaluate(()=>window.SHSAnalytics?.hasConsent()),false,'Analytics consent initially granted');
  await page.locator('#shs-analytics-accept').click();
  assert.equal(await page.evaluate(()=>window.SHSAnalytics?.hasConsent()),true,'Analytics consent not saved');
  assert.equal(await page.locator('script[src*="googletagmanager.com/gtag/js?id=G-TK32KZLXP6"]').count(),1,'Wrong GA4 tag or duplicated GA4 tag');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shs-analytics-choice-v1')),'yes');
  assert.equal(await page.locator('#shs-analytics-choice').count(),0,'Banner not dismissed');
  await page.locator('#services .service-card').first().waitFor({state:'attached',timeout:22000});
  await page.waitForFunction(()=>document.querySelectorAll('#services .service-card').length===7,null,{timeout:20000});
  await checkOverflow(page,size.name+' home');
  const labels=await page.locator('#services .service-card').allTextContents();
  for(const name of ['Home Offices','Custom Closets & Wardrobes','Built-ins & Vanities','Custom Pantries','Garage Cabinets & Storage','Laundry Rooms','Mudrooms & Entryways'])
    assert(labels.some(x=>x.includes(name)),size.name+' missing '+name);
  assert(await page.evaluate(()=>!!customElements.get('image-slot')),'ImageSlot component not registered');
  const headerRects=await page.evaluate(()=>{
    const h=document.querySelector('header'), brand=h.querySelector('a[href="/"]').getBoundingClientRect(), lang=h.querySelector('button[aria-label="Español"]').getBoundingClientRect();
    return {brandRight:brand.right,languageLeft:lang.left};
  });
  assert(headerRects.brandRight<=headerRects.languageLeft+1,size.name+' Home logo overlaps language controls: '+JSON.stringify(headerRects));
  const cardTitleOverlaps=await page.locator('#services .service-card').evaluateAll(els=>els.map(el=>{
    const row=el.children[1];const t=row.children[0].getBoundingClientRect(),n=row.children[1].getBoundingClientRect();
    return {name:row.children[0].innerText,collision:t.right>n.left+1 && t.bottom>n.top && n.bottom>t.top};
  }));
  assert(!cardTitleOverlaps.some(x=>x.collision),size.name+' service title-number collision: '+JSON.stringify(cardTitleOverlaps));
  const fullImageChecks=await page.locator('#services image-slot').evaluateAll(els=>els.filter(el=>/svc-(garage|laundry)/.test(el.id)).map(el=>{
    const outer=el.closest('.service-photo'),w=outer.getBoundingClientRect().width,h=outer.getBoundingClientRect().height;
    return {src:el.getAttribute('src'),fit:el.getAttribute('fit'),w,h,aspect:w/h};
  }));
  assert.equal(fullImageChecks.length,2,'Expected two uncropped landscape cards');
  for(const img of fullImageChecks){
    assert(img.src.endsWith('-full.webp'),'Old cropped source used: '+img.src);
    assert.equal(img.fit,'contain','Photo was cropped by ImageSlot');
    assert(Math.abs(img.aspect-1.5)<0.035,'Landscape frame missing: '+JSON.stringify(img));
  }
  if(size.name==='laptop'){
    const cards=await page.locator('#services .service-card').evaluateAll(els=>els.slice(0,2).map(e=>e.getBoundingClientRect()));
    assert(Math.abs(cards[0].top-cards[1].top)<6,'Laptop layout is not two columns');
    assert(cards[0].width>450,'Laptop card too narrow');
  }
  const sources=await page.locator('#services image-slot').evaluateAll(els=>els.map(x=>x.getAttribute('src')));
  assert.equal(sources.length,7);
  const bad=await page.evaluate(async srcs=>{
    let failed=[];await Promise.all(srcs.map(async src=>{const im=new Image();im.src=src;try{await im.decode();if(im.naturalWidth<100||im.naturalHeight<100)failed.push(src+' small')}catch(e){failed.push(src+' missing')}}));return failed;
  },sources);
  assert.deepEqual(bad,[],size.name+' photo load failed');
  if(size.width<=700){
    const slider=page.locator('#services .service-grid');
    const m=await slider.evaluate(e=>({sw:e.scrollWidth,cw:e.clientWidth,flow:getComputedStyle(e).gridAutoFlow}));
    assert(m.sw>m.cw*1.5,'mobile grid not scrollable: '+JSON.stringify(m));
    assert.equal(m.flow,'column');
    await slider.evaluate(e=>{e.scrollLeft=e.clientWidth;});
    await page.waitForTimeout(250);
    assert(await slider.evaluate(e=>e.scrollLeft)>20,'mobile swipe grid stuck');
    const menu=page.locator('header button[aria-expanded]').first();
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'),'true');
    await menu.click();
  }
  // A service card should take the customer to the consultation and preselect their project.
  await page.locator('#services .service-card').nth(4).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>location.hash),'#consult','Service card did not navigate to consultation');
  assert((await page.locator('#consult button[aria-pressed="true"]').allTextContents()).some(x=>x.includes('Garage cabinets')),size.name+' garage service not preselected');
  assert(await page.getByText('Ideas for your space',{exact:true}).count()>0,'Inspiration gallery title missing');
  await page.getByRole('button',{name:'Español'}).first().click();
  await page.waitForTimeout(350);
  console.log('HOME LANGUAGE STATE '+size.name,await page.evaluate(()=>({lang:document.documentElement.lang,stored:localStorage.getItem('shs-lang'),api:!!window.SHSi18n,apiLang:window.SHSi18n?.get?.(),viewport:innerWidth})));
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  assert((await page.locator('#services').innerText()).includes('Despensas a medida'),'Spanish pantry missing');
  assert(await page.getByText('Ideas para su espacio',{exact:true}).count()>0,'Inspiration title not translated');
  assert((await page.locator('#consult button[aria-pressed="true"]').allTextContents()).some(x=>x.includes('Gabinetes de garaje')),size.name+' selected service did not translate');
  await page.getByRole('button',{name:'English'}).first().click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert((await page.locator('#services').innerText()).includes('Custom Pantries'),'English return missing');
  // Home form: intercept network request, verify selected project is included in submission.
  let leadPayload=null;
  await page.route('**/ajax/Info@superiorhomesolutionstx.com',route=>{
    leadPayload=JSON.parse(route.request().postData());
    return route.fulfill({status:200,contentType:'application/json',body:'{"success":"true"}'});
  });
  await page.locator('#consult input').nth(0).fill('Website Test');
  await page.locator('#consult input').nth(1).fill('78745');
  await page.locator('#consult input').nth(2).fill('test@example.com');
  await page.locator('#consult button[type=submit]').click();
  await page.waitForTimeout(500);
  assert(leadPayload && leadPayload['Project types']==='Garage cabinets',size.name+' submission lost preselected service '+JSON.stringify(leadPayload));
  const homeLeads=await page.evaluate(()=>Array.from(window.dataLayer||[]).filter(a=>a[0]==='event'&&a[1]==='generate_lead').map(a=>Array.from(a)));
  assert.equal(homeLeads.length,1,'Consultation lead not recorded exactly once');
  assert.equal(homeLeads[0][2].form_type,'consultation','Wrong consultation form event');
  assert(!JSON.stringify(homeLeads).includes('test@example.com'),'Personal email sent to GA4');
  assert.equal(leadPayload['Lead source'],'instagram');
  assert.equal(leadPayload['Lead medium'],'social');
  assert.equal(leadPayload['Campaign'],'closet_launch');
  assert.equal(leadPayload['Landing page'],'/');
  assert.equal(leadPayload['Submitted page'],'/');
  assert(!JSON.stringify(leadPayload).includes('utm_source='),'Raw campaign URL leaked into inquiry');
  assert(await page.getByText('Your request is in. We’ll follow up using the contact details you provided within one business day.',{exact:true}).count()===1,'Correct consultation confirmation missing');

  const total=await page.evaluate(()=>document.body.scrollHeight);
  for(let y=0;y<total;y+=600){await page.evaluate(pos=>window.scrollTo(0,pos),y);await page.waitForTimeout(35);}
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(750);
  await shot(page,size.name+'-home');
  await page.goto(BASE+'/contact.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(500);
  await checkOverflow(page,size.name+' contact');
  const channelRects=await page.locator('.contact-channel').evaluateAll(els=>els.map(el=>({right:el.querySelector('.contact-channel-arrow').getBoundingClientRect().right,viewport:window.innerWidth})));
  assert(channelRects.every(x=>x.right<=x.viewport-2),size.name+' contact arrow clipped: '+JSON.stringify(channelRects));
  assert(await page.getByText('Send us a message',{exact:true}).count()>0,'Contact title missing');
  await page.getByRole('button',{name:'Español'}).first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.getByRole('button',{name:'English'}).first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  let contactPayload=null;
  await page.route('**/ajax/Info@superiorhomesolutionstx.com',r=>{
    contactPayload=JSON.parse(r.request().postData());
    return r.fulfill({status:200,contentType:'application/json',body:'{"success":"true"}'});
  });
  await page.locator('form input').nth(0).fill('Test Customer');
  await page.locator('form input').nth(1).fill('sample@example.com');
  await page.locator('form textarea').fill('Responsive QA form test');
  await page.locator('form button[type=submit]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('form').count(),0,'mocked Contact submit did not show confirmation');
  const contactLeads=await page.evaluate(()=>Array.from(window.dataLayer||[]).filter(a=>a[0]==='event'&&a[1]==='generate_lead').map(a=>Array.from(a)));
  assert.equal(contactLeads.length,1,'Contact lead not recorded exactly once');
  assert.equal(contactLeads[0][2].form_type,'contact','Wrong contact form event');
  assert(!JSON.stringify(contactLeads).includes('sample@example.com'),'Personal email sent to GA4');
  assert.equal(contactPayload['Lead source'],'instagram','Source not carried from home to contact');
  assert.equal(contactPayload['Lead medium'],'social');
  assert.equal(contactPayload['Campaign'],'closet_launch');
  assert.equal(contactPayload['Landing page'],'/');
  assert.equal(contactPayload['Submitted page'],'/contact.html');
  await shot(page,size.name+'-contact');
  await page.goto(BASE+'/privacy.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(250);
  await checkOverflow(page,size.name+' privacy');
  await page.locator('#es').click();
  assert(await page.locator('#copy-es').isVisible(),'Privacy ES not visible');
  assert((await page.locator('#copy-es').innerText()).includes('enlace promocional'),'Missing Spanish lead-source privacy notice');
  assert((await page.locator('#copy-es').innerText()).includes('Google Analytics 4'),'Missing Spanish GA4 privacy notice');
  await page.locator('#en').click();
  assert(await page.locator('#copy-en').isVisible(),'Privacy EN not visible');
  assert((await page.locator('#copy-en').innerText()).includes('tagged promotional link'),'Missing English lead-source privacy notice');
  assert((await page.locator('#copy-en').innerText()).includes('Google Analytics 4'),'Missing English GA4 privacy notice');
  assert.equal(await page.evaluate(()=>window.SHSAnalytics?.hasConsent()),true,'Consent lost across page navigation');
  assert(await page.locator('#shs-analytics-settings').isVisible(),'Analytics preferences cannot be reopened');
  await shot(page,size.name+'-privacy');
  assert.deepEqual(jsErrors,[],size.name+' browser JS errors');
 }finally{await cx.close();}
}
async function testDecline(browser) {
  const cx=await browser.newContext({viewport:{width:390,height:844}});
  const page=await cx.newPage();
  try {
    await page.route('**/gtag/js?**',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#shs-analytics-reject').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('shs-analytics-choice-v1')),'no');
    assert.equal(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count(),0);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#shs-analytics-choice').count(),0,'Consent rejection ignored on reload');
    assert.equal(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count(),0,'Google tag loaded after rejection');
    await page.locator('#shs-analytics-settings').click();
    await page.locator('#shs-analytics-accept').click();
    assert.equal(await page.evaluate(()=>window.SHSAnalytics.hasConsent()),true);
    await page.locator('#shs-analytics-settings').click();
    await page.locator('#shs-analytics-reject').click();
    await page.waitForTimeout(550);
    assert.equal(await page.evaluate(()=>localStorage.getItem('shs-analytics-choice-v1')),'no');
    assert.equal(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count(),0,'Tag not removed after revocation/reload');
  } finally { await cx.close(); }
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
   await testDecline(browser);console.log('PASS analytics opt-out and revocation');
   for(const size of sizes){
    try{await test(browser,size);console.log('PASS '+size.name)}
    catch(e){failures.push(size.name+': '+String(e.stack||e.message));console.error('FAIL '+size.name+': '+String(e.stack||e.message));}
   }
 }finally{await browser.close();}
 const safari=await webkit.launch({headless:true});
 try{
   const phone={name:'mobile-webkit',width:390,height:844,isMobile:true,hasTouch:true};
   try{await test(safari,phone);console.log('PASS '+phone.name)}
   catch(e){failures.push(phone.name+': '+String(e.stack||e.message));console.error('FAIL '+phone.name+': '+String(e.stack||e.message));}
 }finally{await safari.close();}
 if(failures.length)process.exitCode=1;else console.log('ALL DEVICE TESTS PASSED');
})();
