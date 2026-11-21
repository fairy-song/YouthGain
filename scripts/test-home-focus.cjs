/* All APIs are isolated fixtures; no live account, model or financial data is used. */
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/home-focus-captures'); fs.mkdirSync(captures, { recursive: true });
const server = http.createServer((req,res) => {
  const name = new URL(req.url, 'http://local').pathname;
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.argv[3], args: ['--disable-background-networking'] });
  let passed = 0;
  try {
    for (const width of [390,1280]) for (const mode of ['first','overdue','funds','continue','spending','retry']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', reducedMotion:'reduce' });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        sessionStorage.setItem('dev_current_user', JSON.stringify({ uid:'home-fixture', email:'home-fixture@example.org', displayName:'小青' }));
        sessionStorage.setItem('qingying:workspace', JSON.stringify({ name:'student', uid:'home-fixture' }));
      });
      const now = new Date();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai', year:'numeric',month:'2-digit',day:'2-digit' }).format(now);
      let entries = mode === 'overdue' ? [{ id:'old',kind:'upcoming',title:'合成考试费',amount:800,due_date:'2020-01-01',handled:false }]
        : mode === 'continue' ? [{id:'review',kind:'review',next_action:'周日核对交通费',week:'2026-11-16'}] : [];
      let fail = mode === 'retry', studyCalls = 0, podcastCalls = 0;
      const flow = { complete:true,month:today.slice(0,7),spent:mode === 'first' ? 0 : 20,income:mode === 'first' ? 0 : 1000,remaining:mode === 'first' ? 0 : 980,
        has_expense_records:mode !== 'first',has_income_records:mode !== 'first',
        category_breakdown:mode === 'first' ? [] : [{category:'餐饮',gross_expense:20,refunds:0,net:20}] };
      const funds = { complete:true,available_complete:mode !== 'funds',available_remaining_month:1000,
        carryover_month:1000,savings_locked_total:0,savings_net_transfer_month:0,month:today.slice(0,7),timezone:'Asia/Shanghai',as_of:now.toISOString() };
      await page.route('**/*', route => {
        const req=route.request(), url=new URL(req.url()), endpoint=url.pathname;
        if (!endpoint.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
        if (endpoint === '/api/learning' && fail) { fail=false;return route.fulfill({status:503,json:{message:'隔离读取失败'}}); }
        if (endpoint === '/api/learning/adaptive') studyCalls++;
        if (endpoint === '/api/podcasts/today') podcastCalls++;
        if (endpoint === '/api/learning/upcoming/old' && req.method() === 'PUT') { entries=entries.map(e=>({...e,handled:true}));return route.fulfill({json:{entry:entries[0]}}); }
        const data = {
          '/api/health':{status:'ok'},'/api/auth/me':{role:'user'},
          '/api/decision/transactions':{ data:{transactions:[],monthly_cashflow:flow,monthly_budget:{complete:true,spent:flow.spent},funds} },
          '/api/decision/funds':{data:funds},'/api/dashboard/goals':{data:{goals:[]}},'/api/decision/report':{data:{has_data:false}},
          '/api/decision/goal-plan':{result:null},'/api/learning':{profile:{},entries,topics:[],lessons:[],summary:{}},
          '/api/learning/profile':{profile:{}},'/api/learning/questionnaires':{latest:null},
          '/api/learning/adaptive':{next_item:{id:'one',question:'合成练习问题'},reason:'隔离示例'},
          '/api/podcasts/today':{program:null,message:'隔离内容'},
        }[endpoint] || {data:{}};
        return route.fulfill({json:data});
      });
      try {
        await page.goto(`${origin}/#/`);
        const title = ({ first:'先记一笔你关心的花费',overdue:'先核对一笔过期事项',funds:'先核对手里的钱',continue:'继续你上次的安排',spending:'看清一笔累计花费',retry:'先核对待支付事项' })[mode];
        await page.getByRole('heading',{name:title,exact:true}).waitFor();
        assert.equal(await page.locator('.today-priority').count(),1);
        assert.equal(studyCalls,0);assert.equal(podcastCalls,0);
        assert.equal(await page.locator('.today-optional').evaluate(e=>e.open),false);
        const cta=page.locator('.today-priority').locator('a,button');
        const box=await cta.boundingBox();assert(box && box.y + box.height < 900,'primary action below first screen');
        await page.screenshot({path:path.join(captures,`${width}-${mode}-initial.png`),fullPage:true});
        if(mode === 'retry') {await cta.click();await page.getByRole('heading',{name:'看清一笔累计花费',exact:true}).waitFor();}
        if(mode === 'spending') {
          await cta.click();assert.equal(await page.locator('.today-disclosure').first().evaluate(e=>e.open),true);
          await page.getByRole('link',{name:/看看本次推荐/}).click();
          await page.waitForFunction(()=>document.querySelector('.today-optional').open);
        } else {
          const summary=page.locator('.today-optional > summary');await summary.focus();await summary.press('Enter');
        }
        await page.getByRole('heading',{name:'合成练习问题',exact:true}).waitFor();
        assert.equal(studyCalls,1);assert.equal(podcastCalls,1);
        if(mode === 'overdue') {
          await page.getByRole('link',{name:/核对待支付事项/}).click();
          await page.getByText('2020-01-01 · 合成考试费 · ¥800', {exact:false}).waitFor();
          await page.getByRole('button',{name:'标记已处理',exact:true}).click();
          await page.getByRole('button',{name:'恢复提醒',exact:true}).waitFor();
          await page.goto(`${origin}/#/`);
          await page.getByRole('heading',{name:'看清一笔累计花费',exact:true}).waitFor();
          assert.equal(await page.getByText(/过期待核对/).count(),0);
        }
        await page.screenshot({path:path.join(captures,`${width}-${mode}.png`),fullPage:true});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'horizontal overflow');
        assert.deepEqual(errors,[]);
        console.log(`PASS ${width} ${mode}`);passed++;
      } finally {await context.close();}
    }
    console.log(`${passed} isolated browser cases passed. Screenshots: ${captures}`);
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
