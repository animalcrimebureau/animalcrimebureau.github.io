#!/usr/bin/env node
// Draws the app icons, the link-preview image of every page and the cover of
// every publication's Substack post with the browser that ships with
// Playwright. Run after adding a page or changing a title, then build again:
// node tools/images.mjs && node tools/build.mjs

import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT, pages, strip, site } from './build.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const font = name => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'assets/fonts', name + '.woff2')).toString('base64')}) format("woff2")`;
const FACES = `
@font-face{font-family:"Public Sans";font-weight:100 900;src:${font('public-sans-latin')}}
@font-face{font-family:"IBM Plex Sans Arabic";font-weight:400;src:${font('plex-arabic-400-arabic')};unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}
@font-face{font-family:"IBM Plex Sans Arabic";font-weight:500;src:${font('plex-arabic-500-arabic')};unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}`;
const LOGO = readFileSync(join(ROOT, 'assets/img/acb-logo.svg'), 'utf8');

function icon(size, inset) {
  return `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;background:#fff}
  .i{position:absolute;inset:${inset}px}.i svg{width:100%;height:100%;display:block}</style></head><body><div class="i">${LOGO}</div></body></html>`;
}

// A link preview is 1200 by 630. A Substack cover is 3:2, the shape Substack's lists crop a post's image to,
// and keeps its text 200 pixels from the top and bottom, outside what its 16:9 link previews cut off.
const LINK = { width: 1200, height: 630, scale: 1, pad: [64, 80, 60], center: false };
const COVER = { width: 1800, height: 1200, scale: 1.5, pad: [200, 120, 200], center: true };

function card(c, lang, shape = LINK) {
  const rtl = lang === 'ar';
  const title = strip(c.title);
  const long = title.length > 70;
  const px = n => `${+(n * shape.scale).toFixed(2)}px`;
  return `<!doctype html><html lang="${lang}"${rtl ? ' dir="rtl"' : ''}><head><style>${FACES}
  *{box-sizing:border-box}html,body{margin:0;width:${shape.width}px;height:${shape.height}px;background:#fff;color:#111}
  body{font-family:"Public Sans","IBM Plex Sans Arabic",sans-serif;padding:${shape.pad.map(n => `${n}px`).join(' ')};display:flex;flex-direction:column}
  .brand{direction:ltr;display:flex;align-items:center;gap:${px(18)};font-size:${px(30)};font-weight:500;letter-spacing:-.005em;align-self:flex-start}
  .brand svg{width:${px(56)};height:auto;display:block}
  .body{margin-${shape.center ? 'block' : 'top'}:auto;padding-inline-start:${px(30)};border-inline-start:${px(3)} solid #111}
  .k{font-size:${px(27)};color:#5C5C5C;margin:0 0 ${px(14)};line-height:1.35}
  .t{font-size:${px(long ? 46 : 62)};font-weight:500;line-height:${rtl ? 1.45 : 1.14};letter-spacing:-.015em;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .s{font-size:${px(28)};color:#5C5C5C;line-height:${rtl ? 1.7 : 1.4};margin:${px(20)} 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .u{direction:ltr;margin-top:${px(46)};font-size:${px(22)};color:#767676;align-self:flex-start}
  .lt{direction:ltr;unicode-bidi:isolate}
  .head{display:flex;justify-content:space-between;align-items:flex-start}
  .bars{direction:ltr;display:flex;gap:9px;align-items:flex-end}
  .bars i{display:flex;align-items:flex-end;width:20px;height:150px;background:#E7E7E7}
  .bars b{display:block;width:100%;background:#9B2226}
  </style></head><body>
  <div class="head"><div class="brand">${LOGO}<span>${site.name}</span></div>${c.bars ? `<div class="bars">${(rtl ? [...c.bars].reverse() : c.bars).map(v => `<i><b style="height:${(v * 100).toFixed(1)}%"></b></i>`).join('')}</div>` : ''}</div>
  <div class="body">${c.kicker ? `<p class="k">${strip(c.kicker)}</p>` : ''}<p class="t"${c.latinTitle && rtl ? ' dir="ltr" style="text-align:right"' : ''}>${title}</p>${c.sub ? `<p class="s"${c.latinTitle && rtl ? ' dir="ltr" style="text-align:right"' : ''}>${strip(c.sub)}</p>` : ''}</div>
  <div class="u">animalcrimebureau.org</div>
  </body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [file, size, inset] of [['icon-192.png', 192, 22], ['icon-512.png', 512, 58], ['icon-maskable-512.png', 512, 118]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(icon(size, inset));
  await page.screenshot({ path: join(ROOT, 'assets/img', file) });
}

await page.setViewportSize({ width: 1200, height: 630 });
const done = new Set();
for (const pg of pages()) {
  if (!pg.card) continue;
  const out = `assets/share/${pg.lang}/${pg.card.key}.png`;
  if (done.has(out)) continue;
  done.add(out);
  mkdirSync(join(ROOT, 'assets/share', pg.lang), { recursive: true });
  await page.setContent(card(pg.card, pg.lang));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, out) });
}

// The cover of each publication's post on Substack, in English like the posts. It is uploaded in the
// post's settings, as its social preview image, and is not shown in the post itself.
await page.setViewportSize({ width: COVER.width, height: COVER.height });
mkdirSync(join(ROOT, 'assets/share/substack'), { recursive: true });
let covers = 0;
for (const pg of pages()) {
  if (pg.lang !== 'en' || !pg.card?.key.startsWith('publication-')) continue;
  await page.setContent(card(pg.card, 'en', COVER));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, `assets/share/substack/${pg.card.key.slice('publication-'.length)}.png`) });
  covers++;
}
await browser.close();
console.log(`Drew 3 icons, ${done.size} link previews and ${covers} Substack covers.`);
