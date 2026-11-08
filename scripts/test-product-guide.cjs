/* Run against an isolated build and mocked APIs; never writes to a live account.
   node scripts/test-product-guide.cjs <playwright-module> <browser-executable> [build-path] */
const { chromium } = require(process.argv[2] || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[4] || 'tmp/build-guide-v11');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({executablePath:process.argv[3],args:['--disable-gpu','--disable-background-networking']});
 try {
  for(const width of [390,1280]) for(const scenario of ['guest','new','existing','offline']) {
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',locale:'zh-CN'});
   const page=await context.newPage();page.setDefaultTimeout(12000);
   const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(!u.pathname.startsWith('/api/'))return u.origin===origin?route.continue():route.abort();
    if(req.method()!=='GET')writes.push(u.pathname);
    const cf={complete:true,spent:0,income:scenario==='existing'?200:0,has_expense_records:false,has_income_records:scenario==='existing',category_breakdown:[]};
    const data={
     '/api/health':{status:'healthy'},'/api/auth/me':{role:'user'},
     '/api/decision/transactions':{data:{transactions:[],monthly_cashflow:cf,monthly_budget:{complete:true,spent:0}}},
     '/api/learning':{entries:[],profile:{},lessons:[],summary:{completed_lessons:[]}},
     '/api/learning/adaptive':{next_item:null},'/api/podcasts/today':{program:null},
    }[u.pathname]||{data:{},entries:[]};
    return route.fulfill({status:scenario==='offline'&&u.pathname==='/api/decision/transactions'?503:200,json:data});
   });
   const login=async()=>{
    await page.getByLabel('电子邮箱').fill(`guide-${scenario}@example.org`);
    await page.getByLabel('密码',{exact:true}).fill('fixture-only');
    await page.getByLabel('密码',{exact:true}).press('Enter');
   };
   if(scenario==='guest') {
    await page.goto(origin+'/#/');await page.getByRole('link',{name:/30 秒，认识青盈/}).click();
    await page.getByRole('button',{name:/把数字变成钱/}).click();
    await page.getByRole('region',{name:'示例消费的钱币展示'}).waitFor();
    assert.equal(await page.locator('.guide-demo .expense-money-art').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`tmp/guide-v11-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:/接下来，钱怎么安排/}).click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'guide-title');
    await page.getByRole('button',{name:/明白了/}).click();
    await page.getByRole('link',{name:/登录，从记一笔开始/}).click();await login();
    await page.waitForURL('**/#/dashboard');
    await page.goto(origin+'/#/');await page.getByRole('link',{name:/使用引导/}).waitFor();
    assert.equal(new URL(page.url()).hash,'#/');
   } else {
    await page.goto(origin+'/#/login');await login();
    if(scenario==='new') {
     await page.waitForURL('**/#/guide');
     await page.getByRole('button',{name:/接下来，钱怎么安排/}).click();await page.reload();
     await page.getByRole('heading',{name:'先留出需要的钱，再考虑这一笔。'}).waitFor();
     await page.getByRole('button',{name:'跳过引导'}).click();
     await page.getByRole('link',{name:/使用引导/}).waitFor();await page.reload();
     await page.getByRole('link',{name:/使用引导/}).click();
     await page.getByRole('heading',{name:'花出去的钱，也可以看得见。'}).waitFor();
    } else {
     await page.getByRole('link',{name:/使用引导/}).waitFor();assert.equal(new URL(page.url()).hash,'#/');
    }
   }
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   console.log(`PASS ${width}px ${scenario}: no page errors or API writes`);await context.close();
  }
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
