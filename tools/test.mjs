#!/usr/bin/env node
// Opens the built site in a browser and uses it as a reader would: the ledger
// on the home page, the copy map, the way from page to page, old record links,
// copying a citation, the index of definitions, reading offline, installing,
// the tab bar on a phone, narrow screens and print. It also checks that no page
// fetches anything from another site and, when axe-core is installed, that
// every page meets WCAG 2.2 AA.
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
  // Wide screen. With reduced motion the bars are drawn at once and the page jumps without scrolling smoothly.
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
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
  // The bars share one scale: the highest fine fills its track, the others take their share of it.
  const fines = await page.$$eval('.pk', buttons => buttons.map(b => {
    const track = b.querySelector('.bar');
    if (!track) return null;
    return b.querySelector('.bar i').getBoundingClientRect().width / track.getBoundingClientRect().width;
  }));
  check(fines[0] > 0.99 && Math.abs(fines[1] - 0.1) < 0.01 && fines[2] === null && fines[3] > 0 && fines[3] < 0.02,
    `home: the fines are drawn on one scale (${fines.map(f => (f === null ? '-' : f.toFixed(3))).join(', ')})`);
  check(await page.$$eval('.pk', buttons => buttons.every(b => b.querySelector('.pk-pen')?.textContent.trim() && b.querySelector('.pk-prov')?.textContent.trim())),
    'home: each category states its penalty with the provision that sets it');

  await page.goto(`${base}/support/`, { waitUntil: 'networkidle' });
  check(await page.$eval('.side .cta', a => a.getAttribute('aria-current') === 'page'), 'support: the sidebar marks the page');
  check(await page.$eval('.ask .btn', a => a.href.startsWith('mailto:info@animalcrimebureau.org?subject=')), 'support: the button opens an email to Animal Crime Bureau');
  // Page by page, the home page leads to the Support page, which ends the way, and no page comes round twice.
  for (const [start, end] of [['/', '/support/'], ['/ar/', '/ar/support/']]) {
    const walked = [];
    let at = start;
    while (at && !walked.includes(at) && walked.length <= all.length) {
      walked.push(at);
      await page.goto(base + at, { waitUntil: 'networkidle' });
      at = await page.$eval('.next a', a => new URL(a.href).pathname).catch(() => null);
    }
    check(!at && walked[walked.length - 1] === end, `next: page by page, ${start} leads to ${end} (${walked.join(' > ')}${at ? ` > ${at}` : ''})`);
  }

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
  const shares = await page.$$eval('.cmap-list a', rows => rows.map(r => {
    const fill = r.querySelector('.bar i');
    return fill ? fill.getBoundingClientRect().width / r.querySelector('.bar').getBoundingClientRect().width : 0;
  }));
  const expected = [5 / 17, 16 / 22, 0, 1, 6 / 16, 13 / 21, 0, 0, 1, 0, 0];
  check(shares.length === 11 && shares.every((v, i) => Math.abs(v - expected[i]) < 0.01), 'article: the copy map draws the measurement in the notes');
  await page.click('.cmap-list a[href="#c5"]');
  check(await page.waitForFunction(() => location.hash === '#c5').then(() => true, () => false), 'article: a row of the copy map opens its definition');
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
  const support = await page.goto(`${base}/support/`).then(() => page.textContent('h1'), () => '');
  check(support === 'Support this work', 'offline: the Support page opens without a connection');
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
  // WCAG 2.4.11: moving through a page with the keyboard never leaves focus under the bars at the top and bottom.
  // Reduced motion makes the browser scroll at once, so where focus lands can be measured straight away.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/', '/law/29-2023/1/', '/ar/support/']) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    let hidden = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      hidden += await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el.closest('.top, .tabs, .skip')) return 0;
        const r = el.getBoundingClientRect();
        const top = document.querySelector('.top').getBoundingClientRect().bottom;
        const bottom = document.querySelector('.tabs').getBoundingClientRect().top;
        return r.bottom <= top || r.top >= bottom ? 1 : 0;
      });
    }
    check(!hidden, `phone: focus is never hidden under the bars on ${path}`);
  }

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
        const v = await a11y.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map(x => x.id));
        if (v.length) found.push(`${viewport.width}px ${path}: ${v.join(', ')}`);
      }
      await context.close();
    }
    check(!found.length, `accessibility: no WCAG 2.2 AA problems on ${all.length} pages, wide and narrow${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
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
