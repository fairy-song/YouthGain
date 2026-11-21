/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/upcoming-edit-captures'); fs.mkdirSync(captures, { recursive: true });
const server = http.createServer((req,res) => {
  const name = new URL(req.url, 'http://local').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.argv[3],args:['--disable-background-networking']});
  let passed=0;
  try {
    for(const width of [390,1280]) for(const mode of ['edit-save','edit-cancel','edit-retry']) {
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',locale:'zh-CN',reducedMotion:'reduce'});
      const page=await context.newPage();page.setDefaultTimeout(10000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        sessionStorage.setItem('dev_current_user',JSON.stringify({uid:'payment-fixture',email:'payment-fixture@example.org'}));
        sessionStorage.setItem('qingying:workspace',JSON.stringify({name:'student',uid:'payment-fixture'}));
      });
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      let entries=[{id:'old',kind:'upcoming',title:'合成考试费',amount:800,due_date:'2020-01-01',handled:false,updated_at:'v1'}],records=[],recordCalls=0,stateCalls=0,editCalls=0;
      await page.route('**/*',route=>{
        const req=route.request(),url=new URL(req.url()),p=url.pathname;
        if(!p.startsWith('/api/'))return url.origin===origin?route.continue():route.abort();
        if(p==='/api/learning/upcoming/old/details'&&req.method()==='PUT'){
          editCalls++;
          if(mode==='edit-retry'&&editCalls===1){entries=entries.map(e=>({...e,amount:700,updated_at:'v2'}));return route.fulfill({status:409,json:{message:'这项安排已更新，请重新读取'}});}
          const data=req.postDataJSON();assert.equal(data.expected_updated_at,entries[0].updated_at);
          entries=entries.map(e=>({...e,title:data.title,amount:Number(data.amount),due_date:data.due_date,updated_at:'v3'}));
          return route.fulfill({json:{entry:entries[0]}});
        }
        if(p==='/api/decision/transactions'&&req.method()==='POST'){
          recordCalls++;
          if(mode==='record-retry'&&recordCalls===1)return route.fulfill({status:503,json:{message:'模拟保存失败'}});
          const row={...req.postDataJSON(),id:'fixture-record'};records.push(row);return route.fulfill({status:201,json:{data:row}});
        }
        if(p==='/api/learning/upcoming/old'&&req.method()==='PUT'){
          stateCalls++;
          if(mode==='status-retry'&&stateCalls===1)return route.fulfill({status:503,json:{message:'模拟状态更新失败'}});
          entries=entries.map(e=>({...e,handled:req.postDataJSON().handled}));return route.fulfill({json:{entry:entries[0]}});
        }
        const spent=records.reduce((s,e)=>s+e.amount,0);
        const funds={complete:true,available_complete:true,available_remaining_month:1000-spent,carryover_month:1000,savings_net_transfer_month:0,savings_locked_total:0,month:today.slice(0,7),as_of:new Date().toISOString(),timezone:'Asia/Shanghai'};
        const flow={complete:true,month:today.slice(0,7),spent,gross_expense:spent,refunds:0,income:0,remaining:-spent,
          income_breakdown:{red_packet:0,external_transfer:0,other_income:0},daily_spending:[{date:today,spent}],has_expense_records:records.length>0,has_income_records:false,
          category_breakdown:spent?[{category:'其他',gross_expense:spent,refunds:0,net:spent}]:[]};
        const data={
          '/api/health':{status:'ok'},'/api/auth/me':{role:'user'},
          '/api/decision/transactions':{data:{transactions:records,monthly_budget:{complete:true,spent},monthly_cashflow:flow,funds}},
          '/api/decision/funds':{data:funds},'/api/decision/report':{data:{has_data:false}},'/api/dashboard/goals':{data:{goals:[]}},
          '/api/learning':{profile:{},entries,topics:[],lessons:[],summary:{}},'/api/learning/profile':{profile:{}},
          '/api/learning/questionnaires':{latest:null},'/api/decision/goal-plan':{result:null},
        }[p]||{data:{}};
        return route.fulfill({json:data});
      });
      try {
        await page.goto(`${origin}/#/`);
        await page.getByRole('heading',{name:'先核对一笔过期事项',exact:true}).waitFor();
        await page.getByRole('link',{name:/核对待支付事项/}).click();
        const row=page.getByRole('article',{name:'合成考试费',exact:true});await row.waitFor();
        await row.getByRole('button',{name:'调整安排',exact:true}).click();
        const amount=page.getByLabel('待支付金额（元）',{exact:true});await amount.fill('500');
        await page.screenshot({path:path.join(captures,`${width}-${mode}.png`),fullPage:true});
        if(mode==='edit-cancel'){
          await page.getByRole('button',{name:'取消调整',exact:true}).click();assert.equal(editCalls,0);assert.equal(entries[0].amount,800);
        }else{
          await page.getByRole('button',{name:'保存调整',exact:true}).click();
          if(mode==='edit-retry'){
            await page.getByRole('button',{name:'读取最新安排',exact:true}).waitFor();assert.equal(await amount.inputValue(),'500');
            await page.getByRole('button',{name:'读取最新安排',exact:true}).click();
            await page.waitForFunction(()=>document.querySelector('form[aria-label="调整待支付事项"] input[type="number"]').value==='700');
            await amount.fill('500');await page.getByRole('button',{name:'保存调整',exact:true}).click();
          }
          await page.getByText('安排已调整，资金规划将使用新的待支付金额和日期。',{exact:true}).waitFor();
          assert.equal(entries[0].amount,500);assert.equal(entries[0].id,'old');
        }
        assert.equal(recordCalls,0);assert.equal(stateCalls,0);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
        assert(!(await page.locator('body').innerText()).includes('NaN'),'invalid amount rendered');
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width} ${mode}: saved=${records.length}, state requests=${stateCalls}`);passed++;
      } finally {await context.close();}
    }
    console.log(`${passed} isolated payment cases passed. Screenshots: ${captures}`);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
