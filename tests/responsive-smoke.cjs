const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
const sizes = [
  {name:'desktop',width:1440,height:900,isMobile:false,hasTouch:false},
  {name:'tablet',width:768,height:1024,isMobile:false,hasTouch:true},
  {name:'mobile',width:390,height:844,isMobile:true,hasTouch:true}
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
 const cx=await browser.newContext({...size,deviceScaleFactor:1,locale:'en-US',reducedMotion:'reduce'});
 const page=await cx.newPage(),jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 try{
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:40000});
  await page.locator('#services .service-card').first().waitFor({state:'attached',timeout:22000});
  await page.waitForFunction(()=>document.querySelectorAll('#services .service-card').length===7,null,{timeout:20000});
  await checkOverflow(page,size.name+' home');
  const labels=await page.locator('#services .service-card').allTextContents();
  for(const name of ['Home Offices','Custom Closets & Wardrobes','Built-ins & Vanities','Custom Pantries','Garage Cabinets & Storage','Laundry Rooms','Mudrooms & Entryways'])
    assert(labels.some(x=>x.includes(name)),size.name+' missing '+name);
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
  await page.getByRole('button',{name:'Español'}).first().click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  assert((await page.locator('#services').innerText()).includes('Despensas a medida'),'Spanish pantry missing');
  await page.getByRole('button',{name:'English'}).first().click();
  await page.waitForTimeout(350);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert((await page.locator('#services').innerText()).includes('Custom Pantries'),'English return missing');
  await shot(page,size.name+'-home');
  await page.goto(BASE+'/contact.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(500);
  await checkOverflow(page,size.name+' contact');
  assert(await page.getByText('Send us a message',{exact:true}).count()>0,'Contact title missing');
  await page.getByRole('button',{name:'Español'}).first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.getByRole('button',{name:'English'}).first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.route('**/ajax/Info@superiorhomesolutionstx.com',r=>r.fulfill({status:200,contentType:'application/json',body:'{"success":"true"}'}));
  await page.locator('form input').nth(0).fill('Test Customer');
  await page.locator('form input').nth(1).fill('sample@example.com');
  await page.locator('form textarea').fill('Responsive QA form test');
  await page.locator('form button[type=submit]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('form').count(),0,'mocked Contact submit did not show confirmation');
  await shot(page,size.name+'-contact');
  await page.goto(BASE+'/privacy.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(250);
  await checkOverflow(page,size.name+' privacy');
  await page.locator('#es').click();
  assert(await page.locator('#copy-es').isVisible(),'Privacy ES not visible');
  await page.locator('#en').click();
  assert(await page.locator('#copy-en').isVisible(),'Privacy EN not visible');
  await shot(page,size.name+'-privacy');
  assert.deepEqual(jsErrors,[],size.name+' browser JS errors');
 }finally{await cx.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
   for(const size of sizes){
    try{await test(browser,size);console.log('PASS '+size.name)}
    catch(e){failures.push(size.name+': '+String(e.stack||e.message));console.error('FAIL '+size.name+': '+String(e.stack||e.message));}
   }
 }finally{await browser.close();}
 if(failures.length)process.exitCode=1;else console.log('ALL DEVICE TESTS PASSED');
})();
