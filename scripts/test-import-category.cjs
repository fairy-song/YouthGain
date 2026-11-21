/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/import-category-captures'); fs.mkdirSync(captures, { recursive: true });
const server = http.createServer((req,res) => {
  const name = new URL(req.url, 'http://local').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({executablePath:process.argv[3],args:['--disable-background-networking']});let passed=0;
 try{for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let imports=0;
  await page.addInitScript(()=>{sessionStorage.setItem('dev_current_user',JSON.stringify({uid:'import-fixture',email:'import-fixture@example.org'}));sessionStorage.setItem('qingying:workspace',JSON.stringify({name:'student',uid:'import-fixture'}));});
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(!p.startsWith('/api/'))return u.origin===origin?route.continue():route.abort();
   if(p==='/api/decision/imports/confirm')imports++;
   let data={};
   if(p==='/api/auth/me')data={role:'user'};
   if(p==='/api/health')data={status:'ok'};
   if(p==='/api/learning')data={entries:[],profile:{},topics:[],lessons:[],summary:{}};
   if(p==='/api/learning/profile')data={profile:{}};
   if(p==='/api/dashboard/goals')data={data:{goals:[]}};
   if(p==='/api/decision/transactions')data={data:{transactions:[],monthly_cashflow:{complete:false}}};
   if(p==='/api/decision/report')data={data:{has_data:false}};
   if(p==='/api/decision/imports')data={data:[]};
   if(p==='/api/decision/bill-categories')data={data:[{id:'custom-one',name:'合成餐费',accounting_type:'expense',active:true}]};
   if(p==='/api/decision/imports/preview')data={data:{source:'standard',sha256:'fixture-digest',counts:{import:1,review:0,duplicate:0},rows:[{row_id:2,date:'2026-11-21',transaction_type:'expense',amount:'18.50',category:'未分类',merchant:'合成食堂',decision:'import'}]}};
   return route.fulfill({json:data});
  });
  try{
   await page.goto(`${origin}/#/dashboard`);
   await page.getByText('更多记账方式',{exact:true}).click();
   await page.getByRole('button',{name:'导入支出账单',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'导入支出账单',exact:true});await dialog.waitFor();
   await dialog.locator('input[type=file]').setInputFiles({name:'fixture.csv',mimeType:'text/csv',buffer:Buffer.from('synthetic')});
   await dialog.getByRole('button',{name:'预览账单',exact:true}).click();
   const trigger=page.getByRole('combobox',{name:'第 2 行分类',exact:true});await trigger.click();
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
   const menu=page.getByRole('listbox',{name:'第 2 行分类选项',exact:true});
   assert.equal(await menu.count(),1,'category menu disappeared after focus was moved');
   assert(await menu.isVisible(),'category menu not visible');
   assert(await menu.evaluate(e=>e.closest('[role=dialog]')!==null),'menu escaped parent dialog');
   await menu.getByRole('option',{name:'餐饮',exact:true}).click();
   assert.equal(await trigger.getAttribute('value'),'expense:餐饮');
   await trigger.focus();await trigger.press('ArrowDown');await menu.waitFor();await menu.press('Escape');
   assert.equal(await trigger.getAttribute('aria-expanded'),'false');
   await trigger.click();await menu.waitFor();await menu.getByRole('option',{name:'学习',exact:true}).click();
   assert.equal(await trigger.getAttribute('value'),'expense:学习');
   await trigger.click();await menu.waitFor();
   await menu.locator('[data-value="custom:custom-one"]').click();
   assert.equal(await trigger.getAttribute('value'),'custom:custom-one');
   await trigger.click();await menu.waitFor();
   await menu.getByRole('button',{name:'删除分类 合成餐费',exact:true}).click();
   const confirm=page.getByRole('dialog',{name:'删除自定义分类',exact:true});await confirm.waitFor();
   await confirm.getByRole('button',{name:'取消',exact:true}).click();
   await confirm.waitFor({state:'hidden'});await menu.waitFor();
   assert.equal(await trigger.getAttribute('value'),'custom:custom-one');
   await menu.getByRole('option',{name:'餐饮',exact:true}).click();
   assert.equal(imports,0);assert.deepEqual(errors,[]);
   await trigger.click();await menu.waitFor();await page.screenshot({path:path.join(captures,`${width}-category-open.png`),fullPage:true});
   console.log(`PASS ${width}: click, select, keyboard, escape, reopen; no import submitted`);passed++;
  }finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(`${passed} browser widths passed`);
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
