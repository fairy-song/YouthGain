/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/payment-followthrough-captures'); fs.mkdirSync(captures, { recursive: true });
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
    for(const width of [390,1280]) for(const mode of ['success','status-retry','record-retry','keep-pending','draft','missing']) {
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai',locale:'zh-CN',reducedMotion:'reduce'});
      const page=await context.newPage();page.setDefaultTimeout(10000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        sessionStorage.setItem('dev_current_user',JSON.stringify({uid:'payment-fixture',email:'payment-fixture@example.org'}));
        sessionStorage.setItem('qingying:workspace',JSON.stringify({name:'student',uid:'payment-fixture'}));
      });
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      let entries=[{id:'old',kind:'upcoming',title:'合成考试费',amount:800,due_date:'2020-01-01',handled:false}],records=[],recordCalls=0,stateCalls=0;
      await page.route('**/*',route=>{
        const req=route.request(),url=new URL(req.url()),p=url.pathname;
        if(!p.startsWith('/api/'))return url.origin===origin?route.continue():route.abort();
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
        if(mode==='missing') {
          await page.goto(`${origin}/#/dashboard?tab=upcoming&item=not-owned`);
          await page.getByText('未在当前账户找到这项安排，请核对下面的列表。',{exact:true}).waitFor();
          assert.equal(recordCalls,0);assert.equal(stateCalls,0);
        } else {
          if(mode==='draft') {
            await page.goto(`${origin}/#/dashboard`);
            await page.getByLabel('支出金额（元）',{exact:true}).fill('38');
            await page.getByRole('link',{name:'未来开支',exact:true}).click();
          } else {
            const link=page.getByRole('link',{name:/核对待支付事项/});
            assert((await link.getAttribute('href')).includes('item=old'));await link.click();
          }
          const row=page.getByRole('article',{name:'合成考试费',exact:true});await row.waitFor();
          if(mode!=='draft')assert(await row.evaluate(e=>e===document.activeElement),'selected item did not receive focus');
          await page.screenshot({path:path.join(captures,`${width}-${mode}-selected.png`),fullPage:true});
          await row.screenshot({path:path.join(captures,`${width}-${mode}-item.png`)});
          await row.getByRole('button',{name:'去记这笔支出',exact:true}).click();
          if(mode==='draft') {
            await page.getByText(/表单里已有未保存的账单/).waitFor();
            assert.equal(await page.getByLabel('支出金额（元）',{exact:true}).inputValue(),'38');
            await page.getByRole('button',{name:'保留当前草稿',exact:true}).click();
            assert.equal(recordCalls,0);assert.equal(stateCalls,0);
          } else {
            const amount=page.getByLabel('支出金额（元）',{exact:true});assert.equal(await amount.inputValue(),'800');
            if(mode==='keep-pending')await amount.fill('50');
            await page.getByRole('button',{name:'记一笔',exact:true}).click();
            if(mode==='record-retry'){
              await page.getByText('模拟保存失败',{exact:true}).waitFor();
              assert.equal(stateCalls,0);assert.equal(records.length,0);
              await page.getByRole('button',{name:'记一笔',exact:true}).click();
            }
            await page.getByRole('button',{name:'确认已全部支付',exact:true}).waitFor();
            assert.equal(records.length,1);assert.equal(stateCalls,0);
            await page.screenshot({path:path.join(captures,`${width}-${mode}-saved.png`),fullPage:true});
            await page.locator('.alert-info').filter({hasText:'账目已保存 · 合成考试费'}).screenshot({path:path.join(captures,`${width}-${mode}-confirmation.png`)});
            if(mode==='keep-pending'){
              await page.getByRole('button',{name:'保留待支付',exact:true}).click();
              assert.equal(entries[0].handled,false);assert.equal(stateCalls,0);
            } else {
              await page.getByRole('button',{name:'确认已全部支付',exact:true}).click();
              if(mode==='status-retry'){
                await page.getByText(/事项状态更新失败/).waitFor();
                assert.equal(records.length,1);
                await page.getByRole('button',{name:'确认已全部支付',exact:true}).click();
              }
              await page.getByText('已结束「合成考试费」的预留。',{exact:true}).waitFor();
              assert.equal(entries[0].handled,true);
              await page.goto(`${origin}/#/dashboard?tab=upcoming&item=old`);
              const processed=page.getByRole('article',{name:'合成考试费',exact:true});await processed.waitFor();
              assert.equal(await processed.getByRole('button',{name:'去记这笔支出',exact:true}).count(),0);
              await processed.getByText('已处理但还没记账？',{exact:true}).click();
              await processed.getByRole('button',{name:'去记这笔支出',exact:true}).waitFor();
            }
            assert.equal(recordCalls,mode==='record-retry'?2:1);
            assert.equal(records.length,1);
          }
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
        assert(!(await page.locator('body').innerText()).includes('NaN'),'invalid amount rendered');
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width} ${mode}: saved=${records.length}, state requests=${stateCalls}`);passed++;
      } finally {await context.close();}
    }
    console.log(`${passed} isolated payment cases passed. Screenshots: ${captures}`);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
