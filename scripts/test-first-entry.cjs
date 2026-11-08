/* Isolated UI acceptance: all APIs are mocked; no real account is changed.
   node scripts/test-first-entry.cjs <playwright-module> <browser-executable> */
const { chromium } = require(process.argv[2] || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve('tmp/build-v12');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const money = value => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.argv[3], args: ['--disable-gpu', '--disable-background-networking'] });
  let passed = 0;
  try {
    for (const width of [390, 1280]) {
      for (const scenario of ['empty', 'first-expense', 'details', 'save-retry', 'income', 'positive', 'zero', 'negative', 'refund-savings', 'carryover-retry']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const writes = [], errors = [];
        let failSave = scenario === 'save-retry', failCarryover = scenario === 'carryover-retry';
        let transactions = [];
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        let confirmed = ['positive', 'zero', 'negative', 'refund-savings'].includes(scenario);
        let amount = ({ positive: 987.5, zero: 0, negative: -12.5, 'refund-savings': 750 })[scenario] ?? -12.5;
        const funds = () => ({ complete: true, available_complete: confirmed, month: today.slice(0, 7),
          available_remaining_month: amount, carryover_month: confirmed ? 1000 : null,
          savings_locked_total: scenario === 'refund-savings' ? 200 : 0,
          savings_net_transfer_month: scenario === 'refund-savings' ? 200 : 0 });
        const cashflow = () => ({ complete: true, month: today.slice(0, 7), spent: scenario === 'refund-savings' ? 80 : transactions.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + t.amount, 0),
          income: scenario === 'refund-savings' ? 30 : transactions.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + t.amount, 0),
          has_expense_records: transactions.some(t => t.transaction_type === 'expense'), has_income_records: transactions.some(t => t.transaction_type === 'income'),
          category_breakdown: [], daily_spending: [] });
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
          if (!endpoint.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
          if (request.method() !== 'GET') writes.push({ endpoint, data: request.postDataJSON() });
          if (endpoint === '/api/decision/transactions' && request.method() === 'POST') {
            if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { message: '模拟网络中断，请重试' } }); }
            const entry = { ...request.postDataJSON(), id: `fixture-${transactions.length + 1}` };
            transactions.unshift(entry);
            return route.fulfill({ json: { data: entry } });
          }
          if (endpoint === '/api/decision/funds/carryover' && request.method() === 'POST') {
            if (failCarryover) { failCarryover = false; return route.fulfill({ status: 503, json: { message: '模拟结转保存失败' } }); }
            confirmed = true; amount = request.postDataJSON().amount;
          }
          const data = {
            '/api/health': { status: 'ok' }, '/api/auth/me': { role: 'user' },
            '/api/decision/transactions': { data: { transactions, funds: funds(), monthly_cashflow: cashflow(), monthly_budget: { complete: true, spent: cashflow().spent } } },
            '/api/decision/funds': { data: funds() }, '/api/dashboard/goals': { data: { goals: [] } },
            '/api/decision/report': { data: { has_data: false } },
            '/api/learning/profile': { profile: {} }, '/api/learning': { profile: {}, topics: [], entries: [], lessons: [], summary: {} },
            '/api/learning/questionnaires': { latest: null }, '/api/learning/adaptive': { next_item: null },
            '/api/podcasts/today': { program: null, message: '模拟内容' },
          }[endpoint] || { data: {} };
          return route.fulfill({ json: data });
        });
        try {
          await page.goto(`${origin}/#/login`);
          await page.getByLabel(/电子邮箱/).fill('first-entry-fixture@example.org');
          await page.getByLabel('密码', { exact: true }).fill('fixture-only');
          await page.getByLabel('密码', { exact: true }).press('Enter');
          await page.getByRole('heading', { name: /看懂花费，安排生活/ }).waitFor();
          await page.goto(`${origin}/#/dashboard`);
          await page.getByRole('heading', { name: '记一笔收支' }).waitFor();
          const summary = page.getByRole('region', { name: '本月收支摘要' });
          if (confirmed) {
            await summary.locator('.ledger-metric').filter({ hasText: '本月可用剩余' }).getByText(money(amount), { exact: true }).waitFor();
            await page.goto(`${origin}/#/profile`);
            await page.getByText(money(amount), { exact: true }).first().waitFor();
            await page.goto(`${origin}/#/`);
            await page.locator('.today-money-story .ledger-metric').getByText(money(amount), { exact: true }).waitFor();
          } else {
            await summary.getByText('资金资料待核对', { exact: true }).waitFor();
            assert.equal(await summary.getByText('¥-12.50', { exact: true }).count(), 0);
            assert.equal(await page.getByPlaceholder('商户（可选）').isVisible(), false);
            assert.equal(await page.getByRole('button', { name: '补记账单', exact: true }).isVisible(), false);
            if (scenario === 'carryover-retry') {
              await page.goto(`${origin}/#/`);
              await page.getByRole('link', { name: '核对资金 →' }).click();
              const input = page.getByLabel('确认本月期初日常结转（已排除锁定资金）');
              await input.waitFor();
              assert(await input.evaluate(el => document.activeElement === el));
              await input.fill('500');
              await page.getByRole('button', { name: '保存结转' }).click();
              await page.getByText('模拟结转保存失败').waitFor();
              assert.equal(await input.inputValue(), '500');
              await page.getByRole('button', { name: '保存结转' }).click();
              await summary.getByText('¥500.00', { exact: true }).waitFor();
            } else if (scenario !== 'empty') {
              if (scenario === 'income') await page.getByLabel('收支类型').selectOption('income');
              if (scenario === 'details') {
                await page.getByText('补充详情（可选）', { exact: true }).click();
                await page.getByPlaceholder('商户（可选）').fill('检验食堂');
                await page.getByLabel('消费内容（可选）').fill('检验午餐');
                await page.getByText('补充详情（可选）', { exact: true }).click();
              }
              await page.getByLabel(scenario === 'income' ? '收入金额（元）' : '支出金额（元）', { exact: true }).fill('12.50');
              await page.getByRole('button', { name: '记一笔', exact: true }).click();
              if (scenario === 'save-retry') {
                await page.getByText('模拟网络中断，请重试').waitFor();
                assert.equal(await page.getByLabel('支出金额（元）', { exact: true }).inputValue(), '12.50');
                await page.getByRole('button', { name: '记一笔', exact: true }).click();
              }
              await page.getByText(scenario === 'income' ? '收入已保存。' : '支出已保存，可以继续记下一笔。', { exact: true }).waitFor();
              assert.equal(transactions.length, 1);
              if (scenario === 'details') {
                assert.equal(transactions[0].merchant, '检验食堂');
                assert.equal(transactions[0].items, '检验午餐');
              }
              assert.equal(writes.filter(w => w.endpoint.includes('opportunity-cost')).length, 0);
              if (scenario === 'first-expense') {
                await page.screenshot({ path: `tmp/first-entry-saved-${width}.png` });
                await page.getByText('想进一步了解这笔钱对生活安排的影响？', { exact: true }).click();
                await page.getByRole('link', { name: '补充试算资料 →' }).click();
                const heading = page.getByRole('heading', { name: '财务资料设置' });
                await heading.waitFor();
                assert(await heading.evaluate(el => document.activeElement === el));
                await page.getByRole('button', { name: '保存资料', exact: true }).waitFor();
                await page.getByRole('link', { name: '返回账本 →' }).click();
                await page.getByRole('heading', { name: '记一笔收支' }).waitFor();
                assert.equal(transactions.length, 1);
              }
            } else {
              await page.locator('#record-expense').scrollIntoViewIfNeeded();
              await page.screenshot({ path: `tmp/first-entry-${width}.png` });
              await page.locator('#record-expense').screenshot({ path: `tmp/first-entry-form-${width}.png` });
              await page.getByText('更多记账方式', { exact: true }).click();
              await page.getByRole('button', { name: '导入支出账单', exact: true }).waitFor();
              await page.getByRole('button', { name: '补记账单', exact: true }).click();
              await page.getByRole('dialog').waitFor();
            }
          }
          assert.deepEqual(errors, []);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          assert.equal(writes.filter(w => w.endpoint.includes('/learning/profile')).length, 0, 'No automatic profile change');
          passed += 1;
          console.log(`PASS ${width}px ${scenario}`);
        } finally { await context.close(); }
      }
    }
    console.log(`${passed} browser scenarios passed; all APIs mocked.`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
