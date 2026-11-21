/* Real browser interactions with isolated API fixtures; no live financial data. */
const { chromium } = require(process.argv[2] || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.YG_CAPTURE_BUILD || 'build-verification');
const captures = path.resolve('tmp/import-edit-captures');
fs.mkdirSync(captures, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.argv[3], args: ['--disable-background-networking'] });
  let passed = 0;
  try {
    for (const width of [390, 1280]) {
      for (const scenario of (process.env.YG_SCENARIO ? [process.env.YG_SCENARIO] : ['multirow', 'leave-draft', 'undo-batch', 'refresh-retry', 'preview-confirm'])) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        page.setDefaultTimeout(6000);
        const errors = [], writes = [];
        let failEdit = true, failUndo = true, failLedger = false;
        const rows = [2, 3].map(row_id => ({ row_id, date: '2026-11-21', transaction_type: 'expense', amount: '18.50', category: '餐饮', decision: 'import' }));
        const batch = () => ({ sha256: 'fixture-one', source: 'standard', status: 'committed', count: 2, rows, can_revert_edit: writes.some(w => w.method === 'PUT') });
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => {
          sessionStorage.setItem('dev_current_user', JSON.stringify({ uid: 'fixture', email: 'fixture@example.org' }));
          sessionStorage.setItem('qingying:workspace', JSON.stringify({ name: 'student', uid: 'fixture' }));
        });
        await page.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url()), endpoint = url.pathname;
          if (!endpoint.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
          if (req.method() !== 'GET') writes.push({ endpoint, method: req.method(), data: req.postData() ? (req.headers()['content-type']?.includes('application/json') ? req.postDataJSON() : req.postData()) : null });
          if (endpoint === '/api/decision/imports/preview') return route.fulfill({ json: { data: { source: 'standard', sha256: 'preview-fixture', rows, counts: { import: 2, review: 0, duplicate: 0 }, by_type: { expense: 2 } } } });
          if (endpoint === '/api/decision/imports/confirm') return route.fulfill({ json: { data: { created: true, count: 2 } } });
          if (endpoint === '/api/decision/transactions' && failLedger) return route.fulfill({ status: 503, json: { message: '模拟账本刷新失败' } });
          const rowMatch = endpoint.match(/^\/api\/decision\/imports\/fixture-one\/rows\/(\d+)$/);
          if (rowMatch && req.method() === 'PUT') {
            if (failEdit) { failEdit = false; return route.fulfill({ status: 503, json: { message: '模拟保存失败，请重试' } }); }
            Object.assign(rows.find(r => r.row_id === Number(rowMatch[1])), req.postDataJSON());
            return route.fulfill({ json: { data: batch() } });
          }
          if (endpoint === '/api/decision/imports/fixture-one' && req.method() === 'DELETE') {
            if (failUndo) { failUndo = false; return route.fulfill({ status: 503, json: { message: '模拟撤销失败，请重试' } }); }
            return route.fulfill({ json: { data: {} } });
          }
          const data = {
            '/api/auth/me': { role: 'user' }, '/api/health': { status: 'ok' },
            '/api/learning': { entries: [], profile: {}, topics: [], lessons: [], summary: { completed_lessons: [] } },
            '/api/learning/profile': { profile: {} }, '/api/dashboard/goals': { data: { goals: [] } },
            '/api/decision/report': { data: { has_data: false } },
            '/api/decision/transactions': { data: { transactions: [], monthly_cashflow: { complete: false } } },
            '/api/decision/bill-categories': { data: [] },
            '/api/decision/imports': { data: [{ sha256: 'fixture-one', status: 'committed', source: 'standard', count: 2 }] },
            '/api/decision/imports/fixture-one': { data: batch() },
          }[endpoint] || {};
          return route.fulfill({ json: data });
        });
        try {
          await page.goto(`${origin}/#/dashboard`);
          await page.getByText('更多记账方式', { exact: true }).click();
          await page.getByRole('button', { name: '导入支出账单', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: '导入支出账单', exact: true });
          if (scenario === 'preview-confirm') {
            await dialog.getByLabel('账单来源', { exact: true }).selectOption('standard');
            await dialog.locator('input[type=file]').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from('isolated fixture, no personal records') });
            await dialog.getByRole('button', { name: '预览账单', exact: true }).click();
            const category = page.getByRole('combobox', { name: '第 2 行分类', exact: true });
            await category.click();
            await page.getByRole('listbox', { name: '第 2 行分类选项', exact: true }).getByRole('option', { name: '学习', exact: true }).click();
            await dialog.getByRole('button', { name: '完成', exact: true }).click();
            const guard = page.getByRole('dialog', { name: '尚有未保存修改', exact: true });
            await guard.getByRole('button', { name: '继续编辑', exact: true }).click();
            assert.equal(await category.getAttribute('value'), 'expense:学习');
            await dialog.getByRole('button', { name: '确认导入 2 行', exact: true }).click();
            await page.getByText('账本已更新；这份文件当前共保存 2 笔。待核对记录不参与收支统计。', { exact: true }).waitFor();
            const confirms = writes.filter(w => w.endpoint.endsWith('/imports/confirm'));
            assert.equal(confirms.length, 1);
            assert(confirms[0].data.includes('"2":"学习"'), 'edited category missing from confirmed multipart form');
          } else {
            await dialog.getByRole('button', { name: '查看并修改', exact: true }).click();
            const first = page.getByLabel('修改第 2 行类别', { exact: true });
            const second = page.getByLabel('修改第 3 行类别', { exact: true });
            if (width === 390) assert((await first.boundingBox()).width >= 250, 'mobile category control is squeezed');
            await first.selectOption('学习');
            await second.selectOption('交通');
            const firstRow = first.locator('xpath=ancestor::tr');
            const secondRow = second.locator('xpath=ancestor::tr');
            if (scenario === 'multirow') {
              await firstRow.getByRole('button', { name: '保存', exact: true }).click();
              await page.getByText('模拟保存失败，请重试', { exact: true }).waitFor();
              assert.equal(await first.inputValue(), '学习'); assert.equal(await second.inputValue(), '交通');
              await firstRow.getByRole('button', { name: '保存', exact: true }).click();
              await page.getByText('已保存这笔修改。', { exact: true }).waitFor();
              assert.equal(await second.inputValue(), '交通', 'saving one row erased another unsaved draft');
              assert(await secondRow.getByRole('button', { name: '保存', exact: true }).isEnabled());
              await page.screenshot({ path: path.join(captures, `${width}-remaining-draft.png`), fullPage: false });
              assert(await firstRow.getByRole('button', { name: '保存', exact: true }).isDisabled());
              await secondRow.getByRole('button', { name: '保存', exact: true }).click();
              await page.waitForFunction(() => document.querySelector('[aria-label="修改第 3 行类别"]')?.value === '交通' && [...document.querySelectorAll('tr')].filter(r => r.querySelector('select')).every(r => [...r.querySelectorAll('button')].find(b => b.textContent === '保存')?.disabled));
              assert.deepEqual(writes.map(w => w.data), [{ category: '学习' }, { category: '学习' }, { category: '交通' }]);
            } else if (scenario === 'refresh-retry') {
              failEdit = false; failLedger = true;
              await firstRow.getByRole('button', { name: '保存', exact: true }).click();
              const refresh = page.getByRole('button', { name: '只刷新账本', exact: true });
              await refresh.waitFor();
              assert.equal(await second.inputValue(), '交通');
              await page.screenshot({ path: path.join(captures, `${width}-refresh-failure.png`), fullPage: false });
              failLedger = false;
              await refresh.click();
              await refresh.waitFor({ state: 'hidden' });
              assert.equal(writes.length, 1, 'refresh retry must not repeat the saved mutation');
            } else if (scenario === 'leave-draft') {
              await dialog.getByRole('button', { name: '查看并修改', exact: true }).click();
              const confirm = page.getByRole('dialog', { name: '尚有未保存修改', exact: true });
              await confirm.waitFor();
              await confirm.getByRole('button', { name: '继续编辑', exact: true }).click();
              assert.equal(await first.inputValue(), '学习'); assert.equal(await second.inputValue(), '交通');
              await dialog.getByRole('button', { name: '完成', exact: true }).click();
              await confirm.waitFor();
              await confirm.getByRole('button', { name: '继续编辑', exact: true }).click();
              assert.equal(await second.inputValue(), '交通');
              await dialog.getByRole('button', { name: '完成', exact: true }).click();
              await confirm.getByRole('button', { name: '放弃修改并继续', exact: true }).click();
              await dialog.waitFor({ state: 'hidden' });
              assert.equal(writes.length, 0);
            } else {
              await dialog.getByRole('button', { name: '撤销整批', exact: true }).click();
              const confirm = page.getByRole('dialog', { name: '撤销整批账单', exact: true });
              await confirm.waitFor(); assert.equal(writes.length, 0);
              assert(await page.locator('.bill-import-confirm-backdrop').evaluate(el => Number(getComputedStyle(el).zIndex) > 1055), 'confirmation backdrop must cover parent dialog');
              await page.screenshot({ path: path.join(captures, `${width}-undo-confirmation.png`), fullPage: false });
              await confirm.getByRole('button', { name: '取消', exact: true }).click();
              assert.equal(await second.inputValue(), '交通');
              await dialog.getByRole('button', { name: '撤销整批', exact: true }).click();
              await confirm.getByRole('button', { name: '确认撤销整批', exact: true }).click();
              await page.getByText('模拟撤销失败，请重试', { exact: true }).waitFor();
              assert.equal(await first.inputValue(), '学习'); assert.equal(await second.inputValue(), '交通');
              await confirm.getByRole('button', { name: '确认撤销整批', exact: true }).click();
              await page.getByText('已撤销这批账单。', { exact: true }).waitFor();
              await confirm.waitFor({ state: 'hidden' });
              assert.equal(writes.filter(w => w.method === 'DELETE').length, 2);
            }
          }
          assert.deepEqual(errors, []);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          await page.screenshot({ path: path.join(captures, `${width}-${scenario}.png`), fullPage: false });
          console.log(`PASS ${width}px ${scenario}`); passed++;
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  console.log(`${passed} browser scenarios passed; APIs mocked.`);
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
