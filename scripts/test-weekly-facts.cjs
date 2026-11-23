/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/weekly-facts-captures'); fs.mkdirSync(captures, { recursive: true });
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
 try{for(const width of [390,1280]) for(const scenario of ['refund','partial','retry']){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let imports=0, failFacts=scenario==='retry';
  await page.addInitScript(()=>{sessionStorage.setItem('dev_current_user',JSON.stringify({uid:'import-fixture',email:'import-fixture@example.org'}));sessionStorage.setItem('qingying:workspace',JSON.stringify({name:'student',uid:'import-fixture'}));});
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(!p.startsWith('/api/'))return u.origin===origin?route.continue():route.abort();
   if(p==='/api/decision/imports/confirm')imports++;
   let data={};
   if(p==='/api/auth/me')data={role:'user'};
   if(p==='/api/health')data={status:'ok'};
   if(p==='/api/learning')data={review_week:'2026-11-23',entries:[],profile:{monthly_income:2000},topics:[],lessons:[],summary:{completed_lessons:[]}};
   if(p==='/api/learning/weekly-facts'){if(failFacts){failFacts=false;return route.fulfill({status:503,json:{message:'模拟读取失败'}})}data={start:'2026-11-23',end:'2026-11-29',count:2,gross_expense:20,refunds:30,total:-10,skipped:scenario==='partial'?1:0,limited:scenario==='partial',message:'仅汇总已记录消费，不代表全部支出'};}
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
   await page.goto(`${origin}/#/learning?tab=review`);
   const observation=page.getByLabel('这周哪笔消费值得回看？（没有消费也可以回看计划）',{exact:true});
   await observation.fill('合成复盘草稿');
   if(scenario==='retry'){
     await page.getByRole('button',{name:'重试账目',exact:true}).click();
     assert.equal(await observation.inputValue(),'合成复盘草稿');
   }
   const facts=page.getByRole('region',{name:'本周记录汇总',exact:true});await facts.waitFor();
   assert((await facts.innerText()).includes('¥20.00'));
   assert((await facts.innerText()).includes('¥30.00'));
   assert((await facts.innerText()).includes('¥-10.00'));
   if(scenario==='partial'){
     await facts.getByText('有 1 条记录格式异常，未计入汇总。',{exact:true}).waitFor();
     assert((await facts.innerText()).includes('仅最近2000笔'));
   }
   await page.getByLabel('下周想保持或调整什么？',{exact:true}).fill('合成行动');
   await page.getByRole('button',{name:'保存本周复盘',exact:true}).click();
   await page.getByText('本周复盘已保存，下周可以回看这次行动。',{exact:true}).waitFor();
   assert.equal(imports,0);assert.deepEqual(errors,[]);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(captures,`${width}-${scenario}.png`)});
   console.log(`PASS ${width} ${scenario}: distinct totals, partial disclosure, retry preserves draft, review saves`);passed++;
  }finally{await context.close();}
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log(`${passed} browser widths passed`);
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
