#!/usr/bin/env node
// Checks the built site: every internal link and anchor resolves, every page
// has one h1, a title, a description and its link preview, the structured data
// parses, and every file the service worker saves exists. Run: node tools/check.mjs

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, pages } from './build.mjs';

const problems = [];
const fail = (where, what) => problems.push(`${where}: ${what}`);

function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const file = join(ROOT, clean);
  if (clean.endsWith('/')) return existsSync(join(file, 'index.html')) ? join(file, 'index.html') : null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  return existsSync(join(file, 'index.html')) ? join(file, 'index.html') : null;
}

const ids = new Map();
const idsOf = file => {
  if (!ids.has(file)) ids.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1])));
  return ids.get(file);
};

for (const pg of pages()) {
  const out = pg.file || `${pg.path.replace(/^\//, '')}index.html`;
  const file = join(ROOT, out);
  if (!existsSync(file)) { fail(out, 'not built'); continue; }
  const html = readFileSync(file, 'utf8');

  if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail(out, 'needs exactly one h1');
  if (!/<title>[^<]+<\/title>/.test(html)) fail(out, 'no title');
  if (!/<meta name="description" content="[^"]{20,}">/.test(html)) fail(out, 'no description');
  if (!pg.noindex && !html.includes('rel="canonical"')) fail(out, 'no canonical link');
  if (pg.card && !/property="og:image" content="https:\/\/animalcrimebureau\.org\/assets\/share\//.test(html)) fail(out, 'no link preview image');
  if (!new RegExp(`<html lang="${pg.lang}"`).test(html)) fail(out, 'wrong lang');
  const seen = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(m[1])) fail(out, `duplicate id ${m[1]}`);
    seen.add(m[1]);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    try { JSON.parse(m[1]); } catch { fail(out, 'structured data does not parse'); }
  }
  for (const m of html.matchAll(/\s(?:href|src)="(\/[^"]*|#[^"]*)"/g)) {
    const target = m[1];
    if (target.startsWith('//')) continue;
    if (target.startsWith('#')) {
      if (target.length > 1 && !seen.has(target.slice(1))) fail(out, `missing anchor ${target}`);
      continue;
    }
    if (target.startsWith('/law-xray/')) continue;
    const dest = fileFor(target);
    if (!dest) { fail(out, `broken link ${target}`); continue; }
    const hash = target.split('#')[1];
    if (hash && dest.endsWith('.html') && !idsOf(dest).has(hash)) fail(out, `missing anchor ${target}`);
  }
  for (const m of html.matchAll(/content="https:\/\/animalcrimebureau\.org(\/assets\/[^"]+)"/g)) {
    if (!fileFor(m[1])) fail(out, `missing file ${m[1]}`);
  }
}

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
for (const list of ['PAGES', 'ASSETS']) {
  const m = sw.match(new RegExp(`const ${list} = (\\[.*?\\]);`));
  for (const p of JSON.parse(m[1])) if (!fileFor(p)) fail('sw.js', `saves a missing file ${p}`);
}
for (const m of ['manifest.webmanifest', 'ar/manifest.webmanifest']) {
  const man = JSON.parse(readFileSync(join(ROOT, m), 'utf8'));
  for (const i of man.icons) if (!fileFor(i.src)) fail(m, `missing icon ${i.src}`);
  for (const s of man.shortcuts) if (!fileFor(s.url)) fail(m, `shortcut to a missing page ${s.url}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}.`);
  process.exit(1);
}
console.log('All pages, links, previews and app files check out.');
