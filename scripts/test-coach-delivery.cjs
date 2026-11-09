/* Isolated UI acceptance; no live account or external AI is accessed. */
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const {
  chromium
} = require(process.argv[2] || 'playwright');
const root = path.resolve('tmp/build-daily-v13');
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + (new URL(req.url, 'http://local').pathname === '/' ? '/index.html' : new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p)) return res.writeHead(404).end();
  res.setHeader('Content-Type', {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml'
  }[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    executablePath: process.argv[3],
    args: ['--disable-background-networking']
  });
  let passed = 0;
  try {
    for (const width of [390, 1280]) for (const mode of ['model', 'rule', 'guided', 'legacy']) {
      const context = await browser.newContext({
        viewport: {
          width,
          height: 960
        },
        locale: 'zh-CN',
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      let calls = 0;
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        sessionStorage.setItem('dev_current_user', JSON.stringify({
          uid: 'fixture',
          email: 'coach-fixture@example.org'
        }));
        sessionStorage.setItem('qingying:workspace', JSON.stringify({
          name: 'student',
          uid: 'fixture'
        }));
      });
      await page.route('**/*', route => {
        const req = route.request(),
          u = new URL(req.url());
        if (!u.pathname.startsWith('/api/')) return u.origin === origin ? route.continue() : route.abort();
        if (u.pathname === '/api/coach/chat') {
          calls++;
          return route.fulfill({
            json: {
              status: 'success',
              reply: '隔离预算回答',
              evidence: {
                facts: [],
                sources: [],
                used_sources: []
              },
              validation: {},
              ...(mode === 'legacy' ? {} : {
                runtime: {
                  generation_mode: mode,
                  protocol_version: 'fixture-v1'
                }
              })
            }
          });
        }
        return route.fulfill({
          json: u.pathname === '/api/auth/me' ? {
            role: 'user'
          } : {
            data: {}
          }
        });
      });
      await page.goto(`${origin}/#/coach`);
      const input = page.getByRole('textbox', {
        name: '向教练提问'
      });
      await input.fill('如何安排预算');
      await input.dispatchEvent('compositionstart', {
        data: 'yu'
      });
      await input.press('Enter');
      assert.equal(calls, 0);
      assert.equal(await input.inputValue(), '如何安排预算');
      await input.dispatchEvent('compositionend', {
        data: '预算'
      });
      const blocked = await input.evaluate(el => !el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 229,
        bubbles: true,
        cancelable: true
      })));
      assert(blocked);
      await input.press('Enter');
      await page.getByText('隔离预算回答', {
        exact: true
      }).waitFor();
      assert.equal(calls, 1);
      await page.getByText('查看本次依据', {
        exact: true
      }).click();
      const label = {
        model: 'AI 生成并经检查',
        rule: '程序事实或资料整理',
        guided: '确认关键信息后再继续'
      }[mode];
      if (label) await page.getByText(new RegExp('本次回答方式：' + label)).waitFor();else assert.equal(await page.getByText(/本次回答方式：/).count(), 0);
      await input.fill('第二个问题');
      await page.getByRole('button', {
        name: '发送消息',
        exact: true
      }).click();
      await page.waitForFunction(() => document.querySelectorAll('.coach-evidence').length === 2);
      assert.equal(calls, 2);
      assert.deepEqual(errors, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (mode === 'model' || mode === 'rule') await page.screenshot({
        path: `tmp/coach-v13-${width}-${mode}.png`,
        fullPage: true
      });
      console.log(`PASS ${width}px ${mode}: composition, Enter, button, runtime`);
      passed++;
      await context.close();
    }
    console.log(`${passed} isolated browser scenarios passed; no live account or AI request.`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
