/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/category-save-captures'); fs.mkdirSync(captures, { recursive: true });
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
 try{for(const width of [390,1280]) for(const scenario of ['late','rename']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let imports=0, categories=0, writes=0, releaseOld; const oldGate=new Promise(resolve=>{releaseOld=resolve}); let option={id:'custom-one',name:'合成餐费',accounting_type:'expense',active:true};
  await page.addInitScript(()=>{sessionStorage.setItem('dev_current_user',JSON.stringify({uid:'import-fixture',email:'import-fixture@example.org'}));sessionStorage.setItem('qingying:workspace',JSON.stringify({name:'student',uid:'import-fixture'}));});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(!p.startsWith('/api/'))return u.origin===origin?route.continue():route.abort();
   if(p==='/api/decision/imports/confirm')imports++;
   if(p==='/api/decision/bill-categories' && req.method()==='POST'){option={...option,name:req.postDataJSON().name};return route.fulfill({json:{data:option}})}
   if(p==='/api/decision/bill-categories/custom-one' && req.method()==='PUT'){
     writes++;if(writes===1)return route.fulfill({status:503,json:{message:'模拟名称保存失败'}});
     const change=req.postDataJSON();option={...option,...change,...(change.name?{name:change.name.trim()}:{})};return route.fulfill({json:{data:option}});
   }
   let data={};
   if(p==='/api/auth/me')data={role:'user'};
   if(p==='/api/health')data={status:'ok'};
   if(p==='/api/learning')data={entries:[],profile:{},topics:[],lessons:[],summary:{}};
   if(p==='/api/learning/profile')data={profile:{}};
   if(p==='/api/dashboard/goals')data={data:{goals:[]}};
   if(p==='/api/decision/transactions')data={data:{transactions:[],monthly_cashflow:{complete:false}}};
   if(p==='/api/decision/report')data={data:{has_data:false}};
   if(p==='/api/decision/imports')data={data:[]};
   if(p==='/api/decision/bill-categories'){categories++;if(categories===1 && scenario==='late'){await oldGate;return route.fulfill({json:{data:[]}})}data={data:[option]};}
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
   if(scenario==='late'){
     await dialog.getByRole('button',{name:'自定义分类',exact:true}).click();
     const create=page.getByRole('dialog',{name:'新增自定义分类',exact:true});
     await create.getByLabel('分类名称',{exact:true}).fill('合成教材');
     await create.getByRole('button',{name:'保存分类',exact:true}).click();
     await page.getByText('已新增“合成教材”，可逐行选择或应用到已选记录。',{exact:true}).waitFor();
     const oldResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/decision/bill-categories');
     releaseOld();await oldResponse;
     await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     await page.getByRole('combobox',{name:'第 2 行分类',exact:true}).click();
     await page.getByRole('listbox',{name:'第 2 行分类选项',exact:true}).locator('[data-value="custom:custom-one"]').click();
     assert.equal(await page.getByRole('combobox',{name:'第 2 行分类',exact:true}).getAttribute('value'),'custom:custom-one');
   }else{
     await dialog.getByText('管理我的自定义分类（1）',{exact:true}).click();
     const input=dialog.getByLabel('重命名分类 合成餐费',{exact:true});
     await input.fill('  合成学习  ');await input.press('Enter');
     await dialog.getByText('模拟名称保存失败',{exact:true}).waitFor();
     assert.equal(await input.inputValue(),'  合成学习  ');
     await input.press('Enter');
     const canonical=dialog.getByLabel('重命名分类 合成学习',{exact:true});await canonical.waitFor();
     assert.equal(await canonical.inputValue(),'合成学习');
     assert(await dialog.getByRole('button',{name:'保存名称',exact:true}).isDisabled());
     await dialog.getByText('名称已保存',{exact:true}).waitFor();
     assert.equal(await dialog.getByText('模拟名称保存失败',{exact:true}).count(),0);
     await page.screenshot({path:path.join(captures,`${width}-rename-saved.png`)});
     await canonical.fill('未提交名称');
     await dialog.getByRole('button',{name:'停用',exact:true}).click();
     await dialog.getByRole('button',{name:'启用',exact:true}).waitFor();
     assert.equal(await canonical.inputValue(),'未提交名称');assert.equal(writes,3);
   }
   assert.equal(imports,0);assert.deepEqual(errors,[]);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(captures,`${width}-${scenario}.png`)});
   console.log(`PASS ${width} ${scenario}: mutation wins; canonical rename, Enter, retry and unsaved draft`);passed++;
  }finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(`${passed} browser widths passed`);
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
