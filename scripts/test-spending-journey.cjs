/* Run against an isolated build and mocked APIs; never writes to a live account.
   node scripts/test-spending-journey.cjs <playwright-module> <browser-executable> */
const { chromium } = require(process.argv[2] || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_TEST_BUILD || 'tmp/build-spending-journey');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const cashflow = { complete: true, month: '2026-11', spent: 186.5, income: 1500, has_expense_records: true, has_income_records: true,
  category_breakdown: [{ category: '餐饮', gross_expense: 206.5, refunds: 20, net: 186.5 }, { category: '购物', gross_expense: 30, refunds: 30, net: 0 }] };
const podcast = { reason: '你选择了收支主题。', selection_tier: 'explore', program: { id: 'demo-audio', episode_title: '检验样例：安排生活费',
  publisher: '演示编辑部', name: '财商示例', episode_summary: '仅用于界面检验。', episode_url: 'https://example.org/episode', platform_links: [] } };

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.argv[3], args: ['--disable-gpu', '--disable-background-networking'] });
  let passed = 0;
  try {
    for (const width of [390, 1280]) {
      for (const scenario of ['empty', 'coach', 'review', 'recommendation', 'refund', 'retry']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const writes = [], errors = [];
        let failed = scenario === 'retry';
        let entries = [{ kind: 'review', week: '2026-10-12', next_action: '检验样例：先留返校车费' }];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (!url.pathname.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
          const endpoint = url.pathname;
          if (request.method() !== 'GET') writes.push({ endpoint, data: request.postDataJSON() });
          if (endpoint === '/api/learning/entries/review' && request.method() === 'POST') {
            entries = [{ ...request.postDataJSON(), kind: 'review', week: '2026-11-02' }, ...entries];
          }
          const flow = scenario === 'empty' ? { ...cashflow, spent: 0, has_expense_records: false, category_breakdown: [] } : cashflow;
          const data = {
            '/api/health': { status: 'ok' }, '/api/auth/me': { role: 'user' },
            '/api/decision/transactions': { data: { transactions: [], monthly_cashflow: flow, monthly_budget: { complete: true, spent: flow.spent } } },
            '/api/learning': { profile: {}, entries, lessons: [], summary: { completed_lessons: [] } },
            '/api/learning/adaptive': { next_item: null }, '/api/podcasts/today': podcast,
            '/api/learning/weekly-facts': { start: '2026-11-02', end: '2026-11-08', count: 0, total: 0, message: '检验样例' },
            '/api/learning/entries/review': { entry: entries[0] },
          }[endpoint] || { reply: '检验样例回复', data: {} };
          return route.fulfill({ status: failed && endpoint === '/api/decision/transactions' ? 503 : 200, json: data });
        });
        try {
          await page.goto(`${origin}/#/login`);
          await page.getByLabel(/电子邮箱/).fill('journey-demo@example.org');
          await page.getByLabel('密码', { exact: true }).fill('fixture-only');
          await page.getByLabel('密码', { exact: true }).press('Enter');
          const story = page.getByRole('region', { name: '钱花出去了，感受跟上了吗？' });
          await story.waitFor({ state: 'visible' });
          if (scenario === 'empty') {
            await story.getByText(/这不代表你没有花钱/).waitFor();
            await story.getByRole('link', { name: /记一笔或导入账单/ }).click();
            await page.waitForURL('**/#/dashboard');
            await page.getByText('更多记账方式', { exact: true }).click();
            await page.getByRole('button', { name: '导入支出账单' }).waitFor();
          } else if (scenario === 'retry') {
            await story.getByRole('button', { name: '重试消费汇总' }).waitFor();
            failed = false;
            await story.getByRole('button', { name: '重试消费汇总' }).click();
            await story.locator('.journey-amount').getByText('¥186.50', { exact: true }).waitFor();
          } else if (scenario === 'recommendation') {
            await story.getByRole('link', { name: /看看本次推荐/ }).click();
            assert.equal(await page.evaluate(() => document.activeElement.id), 'today-podcast');
            assert.equal(new URL(page.url()).hash, '#/');
            await page.getByRole('link', { name: /这期知识怎么用/ }).click();
            const input = page.getByPlaceholder('输入您的问题或描述您的财务状况...');
            await input.waitFor();
            assert.match(await input.inputValue(), /不要编造节目内容/);
          } else if (scenario === 'refund') {
            await story.getByLabel('这次想看哪一类？').selectOption('购物');
            await story.getByText(/不能据此认定本月没有消费/).waitFor();
            assert.equal(await story.getByText('展开成实实在在的钱').count(), 0);
          } else {
            if (scenario === 'coach') await page.screenshot({ path: `tmp/spending-journey-home-${width}.png` });
            await story.getByText('展开成实实在在的钱').click();
            await story.getByRole('region', { name: '餐饮累计净支出的钱币展示' }).waitFor();
            await story.getByLabel('比我预想的多').check();
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            if (scenario === 'coach') {
              await page.evaluate(() => window.scrollTo(0, Math.max(0, document.querySelector('.spending-journey').offsetTop - 90)));
              await page.screenshot({ path: `tmp/spending-journey-${width}.png` });
              await story.getByRole('link', { name: /带着这次观察问教练/ }).click();
              const input = page.getByPlaceholder('输入您的问题或描述您的财务状况...');
              await input.waitFor();
              assert.match(await input.inputValue(), /净支出 186.50 元/);
              assert.equal(await page.getByLabel(/允许教练引用资料/).isChecked(), false);
            } else {
              await story.getByRole('link', { name: /记下观察与下一步/ }).click();
              const input = page.getByLabel('这周哪笔消费值得回看？（没有消费也可以回看计划）');
              await input.waitFor();
              assert.equal(await input.inputValue(), '');
              await page.getByRole('button', { name: '将观察带入复盘' }).click();
              assert.match(await input.inputValue(), /186.50/);
              assert(!writes.some(write => write.endpoint.includes('/learning/entries')));
              await page.getByLabel('下周想保持或调整什么？').fill('下次回来看看餐饮安排是否适合我');
              await page.getByRole('button', { name: '保存本周复盘' }).click();
              await page.getByText('本周复盘已保存，下周可以回看这次行动。').waitFor();
              assert.equal(writes.filter(write => write.endpoint === '/api/learning/entries/review').length, 1);
              await page.goto(`${origin}/#/`);
              await page.getByText('下次回来看看餐饮安排是否适合我', { exact: true }).waitFor();
            }
          }
          if (scenario !== 'review') assert.equal(writes.length, 0, 'No unsolicited write or AI call');
          assert.deepEqual(errors, []);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          passed += 1;
          console.log(`PASS ${width}px ${scenario}`);
        } finally { await context.close(); }
      }
    }
    console.log(`${passed} browser scenarios passed; all APIs mocked.`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
