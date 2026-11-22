/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/import-preview-captures'); fs.mkdirSync(captures, { recursive: true });
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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let imports=0, previews=0;
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
   if(p==='/api/decision/imports/preview' && ++previews===2)return route.fulfill({status:503,json:{message:'模拟重新预览失败'}});
   if(p==='/api/decision/imports/confirm')return route.fulfill({json:{data:{created:true,count:1}}});
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
   const trigger=page.getByRole('combobox',{name:'第 2 行分类',exact:true});
   await trigger.click();
   await page.getByRole('listbox',{name:'第 2 行分类选项',exact:true}).getByRole('option',{name:'学习',exact:true}).click();
   const guard=page.getByRole('dialog',{name:'尚有未保存修改',exact:true});
   await dialog.getByRole('button',{name:'预览账单',exact:true}).click();
   await guard.getByRole('button',{name:'继续编辑',exact:true}).click();
   assert.equal(previews,1);assert.equal(await trigger.getAttribute('value'),'expense:学习');
   await dialog.getByLabel('账单来源',{exact:true}).selectOption('standard');
   await guard.getByRole('button',{name:'继续编辑',exact:true}).click();
   assert.equal(await dialog.getByLabel('账单来源',{exact:true}).inputValue(),'wechat');
   const upload=dialog.locator('input[type=file]');
   await upload.setInputFiles({name:'next.csv',mimeType:'text/csv',buffer:Buffer.from('new synthetic')});
   await guard.getByRole('button',{name:'继续编辑',exact:true}).click();
   assert.equal(await upload.evaluate(el=>el.files[0].name),'fixture.csv','cancelling must restore native FileList');
   await dialog.getByRole('button',{name:'预览账单',exact:true}).click();
   await guard.getByRole('button',{name:'放弃修改并继续',exact:true}).click();
   await page.getByText('模拟重新预览失败',{exact:true}).waitFor();
   assert.equal(await trigger.getAttribute('value'),'expense:学习');
   await upload.setInputFiles({name:'next.csv',mimeType:'text/csv',buffer:Buffer.from('new synthetic')});
   await guard.getByRole('button',{name:'放弃修改并继续',exact:true}).click();
   await trigger.waitFor({state:'hidden'});
   assert.equal(await upload.evaluate(el=>el.files[0].name),'next.csv');
   await dialog.getByRole('button',{name:'预览账单',exact:true}).click();
   await dialog.getByRole('button',{name:'清空选择',exact:true}).click();
   assert.equal(await dialog.getByLabel('选择第 2 行',{exact:true}).isChecked(),false);
   await dialog.getByRole('button',{name:'完成',exact:true}).click();
   await guard.waitFor();
   await page.screenshot({path:path.join(captures,`${width}-selection-protected.png`)});
   await guard.getByRole('button',{name:'继续编辑',exact:true}).click();
   await dialog.getByRole('button',{name:'全选可导入',exact:true}).click();
   assert.equal(await dialog.getByLabel('选择第 2 行',{exact:true}).isChecked(),true);
   assert.equal(imports,0);
   await dialog.getByRole('button',{name:'确认导入 1 行',exact:true}).click();
   await page.getByText('账本已更新；这份文件当前共保存 1 笔。待核对记录不参与收支统计。',{exact:true}).waitFor();
   assert.equal(imports,1);assert.deepEqual(errors,[]);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   console.log(`PASS ${width}: preview/source/file cancellation, failed preview recovery, selection guard, bulk select, explicit import`);passed++;
  }finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(`${passed} browser widths passed`);
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
