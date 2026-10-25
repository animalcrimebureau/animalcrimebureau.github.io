#!/usr/bin/env node
// Opens the built site in a browser and uses it as a reader would: the ledger
// on the home page, old record links, copying a citation, the index of
// definitions, reading offline, and the tab bar on a phone. Needs Playwright
// and its Chromium. Run after building: node tools/test.mjs

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { ROOT, pages } from './build.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

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

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};
const errors = [];
const watch = page => {
  page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`); });
};
const open = p => p.$$eval('.pp', panels => panels.map(x => (x.hidden ? 0 : 1)).join(''));

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

  await page.goto(`${base}/register/#ACB-2026-001`, { waitUntil: 'networkidle' });
  check(page.url().endsWith('/register/ACB-2026-001/'), 'register: an old link to a record opens the record page');
  await page.goto(`${base}/ar/register/#ACB-2026-001`, { waitUntil: 'networkidle' });
  check(page.url().endsWith('/ar/register/ACB-2026-001/'), 'register: the same in Arabic');

  await page.goto(`${base}/register/ACB-2026-001/`, { waitUntil: 'networkidle' });
  await page.click('[data-copy]');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const shown = await page.$eval('#cite', el => el.textContent.replace(/\s+/g, ' ').trim());
  check(copied === shown, 'record: the citation button copies the citation');

  await page.goto(`${base}/law/29-2023/1/`, { waitUntil: 'networkidle' });
  for (const id of ['c0', 'c3', 'c5', 'c8']) {
    await page.click(`.side-nav .terms a[href="#${id}"]`);
    await page.waitForTimeout(900);
    const marked = await page.$$eval('.side-nav .terms a.on', l => l.map(a => a.hash).join());
    check(marked === `#${id}`, `article: the index marks the definition being read (${id})`);
  }

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
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
  const sideways = [];
  for (const pg of pages()) {
    await page.goto(base + pg.path, { waitUntil: 'networkidle' });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) sideways.push(pg.path);
  }
  check(!sideways.length, `phone: no page scrolls sideways${sideways.length ? ` (${sideways.join(', ')})` : ''}`);
  await phone.close();
} finally {
  await browser.close();
  server.close();
}

check(errors.length === 0, `no script errors${errors.length ? `:\n  ${errors.join('\n  ')}` : ''}`);
if (failures) {
  console.error(`\n${failures} check${failures > 1 ? 's' : ''} failed.`);
  process.exit(1);
}
