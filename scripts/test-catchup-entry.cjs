/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/catchup-captures'); fs.mkdirSync(captures, { recursive: true });
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
 try{for(const width of [390,1280]) for(const scenario of ['invalid-import','category-retry','backfill']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let imports=0, previews=0, categories=0, saved=0;
  await page.addInitScript(()=>{sessionStorage.setItem('dev_current_user',JSON.stringify({uid:'import-fixture',email:'import-fixture@example.org'}));sessionStorage.setItem('qingying:workspace',JSON.stringify({name:'student',uid:'import-fixture'}));});
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(!p.startsWith('/api/'))return u.origin===origin?route.continue():route.abort();
   if(p==='/api/decision/imports/confirm')imports++;
   if(p==='/api/decision/imports/preview')previews++;
   if(p==='/api/decision/transactions' && req.method()==='POST'){saved++;return route.fulfill({json:{data:{...req.postDataJSON(),id:'synthetic-new'}}})}
   let data={};
   if(p==='/api/auth/me')data={role:'user'};
   if(p==='/api/health')data={status:'ok'};
   if(p==='/api/learning')data={entries:[],profile:{},topics:[],lessons:[],summary:{}};
   if(p==='/api/learning/profile')data={profile:{}};
   if(p==='/api/dashboard/goals')data={data:{goals:[]}};
   if(p==='/api/decision/transactions')data={data:{transactions:[],monthly_cashflow:{complete:false}}};
   if(p==='/api/decision/report')data={data:{has_data:false}};
   if(p==='/api/decision/imports')data={data:[]};
   if(p==='/api/decision/bill-categories' && ++categories===1 && scenario==='category-retry')return route.fulfill({status:503,json:{message:'模拟分类加载失败'}});
   if(p==='/api/decision/bill-categories')data={data:[{id:'custom-one',name:'合成餐费',accounting_type:'expense',active:true}]};
   if(p==='/api/decision/imports/preview')data={data:{source:'standard',sha256:'fixture-digest',counts:{import:1,review:0,duplicate:0},rows:[{row_id:2,date:'2026-11-21',transaction_type:'expense',amount:'18.50',category:'未分类',merchant:'合成食堂',decision:'import'}]}};
   return route.fulfill({json:data});
  });
  try{
   await page.goto(`${origin}/#/dashboard`);
   await page.getByText('更多记账方式',{exact:true}).click();
   if(scenario==='backfill'){
     await page.getByRole('button',{name:'补记账单',exact:true}).click();
     const dialog=page.getByRole('dialog',{name:'补记账单',exact:true});
     assert.equal(await dialog.getByLabel('消费内容（可选）',{exact:true}).isVisible(),false);
     await page.screenshot({path:path.join(captures,`${width}-backfill-start.png`)});
     await dialog.getByLabel('金额（元）',{exact:true}).fill('18.50');
     await dialog.getByText('补充详情（可选）',{exact:true}).click();
     await dialog.getByLabel('消费内容（可选）',{exact:true}).fill('合成教材');
     await dialog.getByLabel('备注（可选）',{exact:true}).fill('合成备注');
     await dialog.getByText('补充详情（可选）',{exact:true}).click();
     await dialog.press('Escape');
     await dialog.getByRole('button',{name:'继续填写',exact:true}).click();
     assert.equal(await dialog.getByLabel('金额（元）',{exact:true}).inputValue(),'18.50');
     await dialog.getByText('补充详情（可选）',{exact:true}).click();
     assert.equal(await dialog.getByLabel('消费内容（可选）',{exact:true}).inputValue(),'合成教材');
     await dialog.getByRole('button',{name:'Close',exact:true}).click();
     await dialog.getByRole('button',{name:'继续填写',exact:true}).click();
     await page.screenshot({path:path.join(captures,`${width}-backfill.png`)});
     await dialog.getByRole('button',{name:'保存补记账单',exact:true}).click();
     await dialog.getByRole('button',{name:'完成',exact:true}).click();
     await dialog.waitFor({state:'hidden'});assert.equal(saved,1);
   }else{
     await page.getByRole('button',{name:'导入支出账单',exact:true}).click();
     const dialog=page.getByRole('dialog',{name:'导入支出账单',exact:true});
     const input=dialog.locator('input[type=file]');
     await input.setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('synthetic')});
     await dialog.getByRole('button',{name:'预览账单',exact:true}).click();
     const check=dialog.getByLabel('选择第 2 行',{exact:true});await check.uncheck();
     if(scenario==='invalid-import'){
       for(const [name,size] of [['wrong.txt',10],['empty.csv',0],['large.csv',2*1024*1024+1]]){
         await input.setInputFiles({name,mimeType:'text/plain',buffer:Buffer.alloc(size)});
         await dialog.getByRole('alert').waitFor();
         assert.equal(await input.evaluate(e=>e.files[0].name),'synthetic.csv');
         assert.equal(await check.isChecked(),false);assert.equal(previews,1);
       }
     }else{
       await dialog.getByRole('button',{name:'重试分类列表',exact:true}).click();
       await dialog.getByRole('button',{name:'重试分类列表',exact:true}).waitFor({state:'hidden'});
       assert.equal(categories,2);assert.equal(await check.isChecked(),false);assert.equal(previews,1);
       await dialog.getByRole('combobox',{name:'第 2 行分类',exact:true}).click();
       const menu=page.getByRole('listbox',{name:'第 2 行分类选项',exact:true});
       await menu.locator('[data-value="custom:custom-one"]').click();
     }
     assert.equal(imports,0);
     await page.screenshot({path:path.join(captures,`${width}-${scenario}.png`)});
   }
   assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log(`PASS ${width} ${scenario}`);passed++;
  }finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(`${passed} browser widths passed`);
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
