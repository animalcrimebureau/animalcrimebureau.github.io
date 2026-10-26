#!/usr/bin/env node
// Opens the built site in a browser and uses it as a reader would: the ledger
// on the home page, old record links, copying a citation, the index of
// definitions, reading offline, installing, the tab bar on a phone, narrow
// screens and print. It also checks that no page fetches anything from another
// site and, when axe-core is installed, that every page meets WCAG 2.1 AA.
// Needs Playwright and its Chromium. Run after building: node tools/test.mjs

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { ROOT, pages } from './build.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let axe = null;
try {
  axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  axe = null;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml', '.txt': 'text/plain',
};

// A plain file server, like GitHub Pages: folders serve their index.html, anything else missing gets 404.html.
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  try {
    if (!file.startsWith(ROOT)) throw new Error('outside the site');
    if ((await stat(file)).isDirectory()) {
      res.writeHead(301, { Location: `${path}/` });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(await readFile(join(ROOT, '404.html')));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://localhost:${server.address().port}`;
const all = pages().map(pg => pg.path);

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};
const errors = [];
const elsewhere = new Set();
const watch = page => {
  page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`); });
  page.on('request', r => { if (!r.url().startsWith(base)) elsewhere.add(r.url()); });
};
const open = p => p.$$eval('.pp', panels => panels.map(x => (x.hidden ? 0 : 1)).join(''));
const sideways = async (context, width) => {
  const page = await context.newPage();
  watch(page);
  const found = [];
  for (const path of all) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) found.push(path);
  }
  check(!found.length, `${width}px: no page scrolls sideways${found.length ? ` (${found.join(', ')})` : ''}`);
};

const browser = await chromium.launch();
try {
  // Wide screen.
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await wide.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  let page = await wide.newPage();
  watch(page);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check(await open(page) === '1000', 'home: the first category of animal is shown beside the list');
  await page.click('#pk-3');
  check(await open(page) === '0001', 'home: choosing another category shows its law in place');
  await page.click('#pk-3');
  check(await open(page) === '0001', 'home: choosing it again keeps it shown');
  await page.focus('#pk-3');
  await page.keyboard.press('ArrowDown');
  check(await open(page) === '1000', 'home: the arrow keys move through the list');
  await page.keyboard.press('End');
  check(await open(page) === '0001', 'home: End goes to the last category, Home to the first');
  await page.keyboard.press('Home');

  await page.goto(`${base}/register/#ACB-2026-001`, { waitUntil: 'networkidle' });
  check(page.url().endsWith('/register/ACB-2026-001/'), 'register: an old link to a record opens the record page');
  await page.goto(`${base}/ar/register/#ACB-2026-001`, { waitUntil: 'networkidle' });
  check(page.url().endsWith('/ar/register/ACB-2026-001/'), 'register: the same in Arabic');

  await page.goto(`${base}/register/ACB-2026-001/`, { waitUntil: 'networkidle' });
  await page.click('[data-copy]');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const shown = await page.$eval('#cite', el => el.textContent.replace(/\s+/g, ' ').trim());
  check(copied === shown, 'record: the citation button copies the citation');
  await page.emulateMedia({ media: 'print' });
  check(await page.$eval('.print-src', el => getComputedStyle(el).display !== 'none' && el.textContent.includes('/register/ACB-2026-001/')), 'print: a printed record carries its address');
  check(!(await page.isVisible('.side')) && !(await page.isVisible('.acts')), 'print: the navigation and buttons are left out');
  await page.emulateMedia({ media: 'screen' });

  await page.goto(`${base}/law/29-2023/1/`, { waitUntil: 'networkidle' });
  for (const id of ['c0', 'c3', 'c5', 'c8']) {
    await page.click(`.side-nav .terms a[href="#${id}"]`);
    const marked = await page.waitForFunction(want => document.querySelector('.side-nav .terms a.on')?.hash === want, `#${id}`, { timeout: 4000 }).then(() => true, () => false);
    check(marked, `article: the index marks the definition being read (${id})`);
  }

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  let saved = false;
  for (let tries = 0; tries < 30 && !saved; tries++) {
    saved = await page.evaluate(async n => {
      const keys = await caches.keys();
      return keys.length > 0 && (await (await caches.open(keys[0])).keys()).length >= n;
    }, all.length - 1);
    if (!saved) await page.waitForTimeout(500);
  }
  check(saved, 'app: every page is saved for reading offline');
  await page.reload({ waitUntil: 'networkidle' });
  const cdp = await wide.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check(!installabilityErrors.length, `app: the browser can install the site${installabilityErrors.length ? ` (${JSON.stringify(installabilityErrors)})` : ''}`);
  await wide.setOffline(true);
  await page.goto(`${base}/ar/publications/method-1/`);
  check((await page.textContent('h1')).includes('The Incorporation Audit'), 'offline: a saved page opens without a connection');
  await page.goto(`${base}/register/ACB-2026-999/`);
  check((await page.textContent('h1')) === 'No connection', 'offline: a page that was never saved says so');
  await wide.setOffline(false);
  await wide.close();

  // Phone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await phone.newPage();
  watch(page);
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check(await open(page) === '0000', 'phone: the list of animals starts closed');
  await page.tap('#pk-1');
  check(await open(page) === '0100', 'phone: tapping a category opens it');
  await page.tap('#pk-3');
  check(await open(page) === '0001', 'phone: tapping another closes the first');
  check(await page.$eval('#pk-3', b => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'phone: the opened category stays on screen');
  check(await page.$eval('.tabs', t => Math.abs(t.getBoundingClientRect().bottom - innerHeight) < 1), 'phone: the tab bar sits at the bottom of the screen');
  await sideways(phone, 390);
  await phone.close();

  // The narrowest screen the guidelines ask for (WCAG 1.4.10).
  const narrow = await browser.newContext({ viewport: { width: 320, height: 640 } });
  await sideways(narrow, 320);
  await narrow.close();

  // Accessibility. The checker is injected as a script, which the site's own policy would refuse.
  if (axe) {
    const found = [];
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, bypassCSP: true });
      const a11y = await context.newPage();
      for (const path of all) {
        await a11y.goto(base + path, { waitUntil: 'networkidle' });
        await a11y.addScriptTag({ content: axe });
        const v = await a11y.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map(x => x.id));
        if (v.length) found.push(`${viewport.width}px ${path}: ${v.join(', ')}`);
      }
      await context.close();
    }
    check(!found.length, `accessibility: no WCAG 2.1 AA problems on ${all.length} pages, wide and narrow${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
  } else if (process.env.CI) {
    check(false, 'accessibility: axe-core is not installed');
  } else {
    console.log('skip accessibility: install axe-core (npm install --no-save axe-core) to run it');
  }
} finally {
  await browser.close();
  server.close();
}

check(!elsewhere.size, `privacy: no page fetches anything from another site${elsewhere.size ? ` (${[...elsewhere].join(', ')})` : ''}`);
check(!errors.length, `no script errors or refused content${errors.length ? `:\n  ${errors.join('\n  ')}` : ''}`);
if (failures) {
  console.error(`\n${failures} check${failures > 1 ? 's' : ''} failed.`);
  process.exit(1);
}
