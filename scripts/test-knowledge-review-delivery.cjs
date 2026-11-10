/* Isolated browser acceptance. API fixtures only; never writes real accounts or knowledge. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const build = path.resolve(process.env.YG_CAPTURE_BUILD || 'tmp/build-daily-v15');
const out = path.resolve(process.env.YG_CAPTURE_OUT || 'tmp/knowledge-review-v15');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  const file = path.resolve(build, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(build + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
const manifest = { mode: 'isolated mock APIs; not a live publication or user study', cases: [] };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.argv[3], args: ['--disable-background-networking'] });
    for (const width of [390, 1280]) {
      let fail = false, delay = false, reviewed = false;
      const errors = [], reads = [], writes = [];
      const records = Array.from({ length: 26 }, (_, i) => ({
        id: 'demo-' + i, document_id: 'd-' + i, title: i === 25 ? '演示：较早的待审核内容' : '演示：预算资料 ' + (i + 1),
        status: 'pending', current_id: null, region: 'CN', date: '2026-11-01', checked_at: '2026-11-10',
        content: '隔离演示资料：先核对必要开支，再安排消费与目标。', source_url: 'https://example.org/knowledge',
        screening: { decision: 'exclude', reasons: ['模拟排除建议，需要人工核对。'], generation_mode: 'rules' }
      }));
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', locale: 'zh-CN' });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (!url.pathname.startsWith('/api/')) return url.origin === `http://127.0.0.1:${server.address().port}` ? route.continue() : route.abort();
        let data = { data: {} };
        if (url.pathname === '/api/auth/me') data = { role: 'admin' };
        else if (url.pathname === '/api/health') data = { status: 'ok' };
        else if (url.pathname === '/api/admin/kb') data = { data: { articles: [] } };
        else if (url.pathname === '/api/admin/knowledge-updates') {
          reads.push(url.search);
          if (fail) { fail = false; return route.fulfill({ status: 503, json: { message: '模拟离线' } }); }
          if (delay) { delay = false; await new Promise(resolve => setTimeout(resolve, 500)); }
          const status = url.searchParams.get('status');
          const values = status === 'approved' || status === 'rejected' ? [] : records.slice(0, reviewed ? 25 : 26);
          const pages = Math.max(1, Math.ceil(values.length / 25));
          const current = Math.min(Number(url.searchParams.get('page') || 1), pages);
          data = { sources: [], versions: values.slice((current - 1) * 25, current * 25), version_counts: { pending: values.length },
            pagination: { page: current, page_size: 25, total: values.length, pages },
            capacity: { published_articles: 27, passages: 30, body_characters: 14657, limits: { articles: 1000, passages: 20000 }, index_current: true } };
        } else if (req.method() === 'POST') {
          writes.push({ path: url.pathname, body: req.postDataJSON() });
          reviewed = true;
          data = { saved: true };
        }
        return route.fulfill({ json: data });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/#/admin/login`);
      await page.getByLabel(/电子邮箱/).fill('isolated-admin@example.org');
      await page.getByLabel('密码', { exact: true }).fill('isolated-demo-only');
      await page.getByLabel('密码', { exact: true }).press('Enter');
      await page.waitForURL('**/#/admin');
      await page.goto(`http://127.0.0.1:${server.address().port}/#/admin/knowledge`);
      const region = page.getByRole('region', { name: '知识来源与更新审核' });
      await region.getByText('1–25 / 26 · 第 1 / 2 页', { exact: true }).waitFor();
      assert.equal(await region.getByRole('button', { name: '上一页', exact: true }).isDisabled(), true);
      delay = true;
      await region.getByRole('button', { name: '下一页', exact: true }).click();
      await region.getByText('正在读取审核队列…').waitFor();
      assert.equal(await region.getByText('目前没有待审核版本。').count(), 0);
      await region.getByText('26–26 / 26 · 第 2 / 2 页', { exact: true }).waitFor();
      assert.equal(await region.getByRole('navigation', { name: '审核队列分页' }).evaluate(el => el === document.activeElement), true);
      await region.getByRole('button', { name: /演示：较早的待审核内容/ }).click();
      const publish = region.getByRole('button', { name: '审核通过并发布', exact: true });
      assert.equal(await publish.isDisabled(), true);
      assert.equal(await page.locator('.admin-skip').evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)');
      await page.locator('.admin-skip').focus();
      assert.equal(await page.locator('.admin-skip').evaluate(el => getComputedStyle(el).clipPath), 'none');
      await region.getByRole('heading', { name: '演示：较早的待审核内容', exact: true }).focus();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await region.screenshot({ path: path.join(out, `review-${width}.png`), animations: 'disabled' });
      await region.getByRole('button', { name: '关闭详情', exact: true }).click();
      fail = true;
      await region.getByRole('button', { name: '刷新更新台账', exact: true }).click();
      await region.getByRole('alert').waitFor();
      assert.equal(await region.getByText('目前没有待审核版本。').count(), 0);
      await region.getByRole('button', { name: '重试读取', exact: true }).click();
      await region.getByText('26–26 / 26 · 第 2 / 2 页', { exact: true }).waitFor();
      await region.getByRole('button', { name: /演示：较早的待审核内容/ }).click();
      await region.getByRole('checkbox').check();
      assert.equal(await publish.isEnabled(), true);
      await publish.click();
      await region.getByText('1–25 / 25 · 第 1 / 1 页', { exact: true }).waitFor();
      assert.deepEqual(writes, [{ path: '/api/admin/knowledge-updates/versions/demo-25/review', body: { decision: 'approve', confirmed: true, expected_current: null } }]);
      await region.getByRole('combobox', { name: '版本状态' }).selectOption('approved');
      await region.getByText('此状态暂无版本。').waitFor();
      assert.equal(reads.at(-1), '?status=approved&page=1&page_size=25');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      manifest.cases.push({ width, passed: true, reads, writes, errors });
      await context.close();
    }
    console.log('PASS: mobile + desktop pagination, loading, retry, confirmation, page shrink, filter reset and overflow');
  } finally {
    fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
