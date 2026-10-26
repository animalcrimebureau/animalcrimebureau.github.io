#!/usr/bin/env node
// Builds the website from src/ into the repository root: every page in English
// and Arabic, the sitemap, the web app manifests, the service worker and the
// Case Register as data. Run from anywhere: node tools/build.mjs
//
// Content lives in src/data/*.json and src/fragments/*.html. The generated
// files are committed, because GitHub Pages serves the repository as it is.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const data = name => JSON.parse(read(`src/data/${name}.json`));

export const site = data('site');
const provisions = data('provisions');
const ledger = data('ledger');
const records = data('register');
const publications = data('publications');
const laws = data('laws');

const ORIGIN = site.origin;
const LANGS = ['en', 'ar'];
const other = lang => (lang === 'en' ? 'ar' : 'en');

// ---------------------------------------------------------------- text helpers

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const strip = html => String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => values[k]);
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const num = (n, lang) => (lang === 'ar' ? String(n).replace(/\d/g, d => AR_DIGITS[d]) : String(n));
// Latin text inside an Arabic page keeps its own direction.
const latin = (html, lang) => (lang === 'ar' ? `<bdi lang="en">${html}</bdi>` : html);
// 2026-11 reads November 2026, 2026-11-03 reads 3 November 2026, in either language.
const formatDate = (iso, lang) => {
  const [y, m, day] = iso.split('-');
  const text = `${day ? `${Number(day)} ` : ''}${site[lang].months[Number(m) - 1]} ${y}`;
  return num(text, lang);
};
// In Arabic text the organization's English name keeps its own direction.
const brandIn = (text, lang) => (lang === 'ar' ? text.replace(/Animal Crime Bureau( \(ACB\))?/, m => `<bdi lang="en">${m}</bdi>`) : text);
// Arabic counts its nouns: 3 to 10 take the plural, other numbers the singular (103 كلمات, 111 كلمة).
const arWords = n => (n === 1 ? 'كلمة' : n === 2 ? 'كلمتان' : n % 100 >= 3 && n % 100 <= 10 ? 'كلمات' : 'كلمة');
const ref = (r, lang, cls = 'ref') => (lang === 'ar' ? `<bdi class="${cls}" lang="en">${r}</bdi>` : `<span class="${cls}">${r}</span>`);
const brandName = lang => (lang === 'ar' ? `<span lang="en">${site.name}</span>` : `<span>${site.name}</span>`);
const fragment = (name, lang) => read(`src/fragments/${name}.${lang}.html`).trim();
const comma = lang => (lang === 'ar' ? '، ' : ', ');
// A middle dot reads as the Arabic zero next to Arabic digits, so Arabic text takes a comma.
const dot = lang => (lang === 'ar' ? '، ' : ' · ');

// ---------------------------------------------------------------------- paths

const pre = lang => (lang === 'ar' ? '/ar' : '');
const slugOf = id => id.replace(/\//g, '-');
export const P = {
  home: l => `${pre(l)}/`,
  law: l => `${pre(l)}/law/`,
  article: (l, law, a) => `${pre(l)}/law/${law.id}/${a.n}/`,
  register: l => `${pre(l)}/register/`,
  record: (l, r) => `${pre(l)}/register/${slugOf(r.id)}/`,
  publications: l => `${pre(l)}/publications/`,
  publication: (l, p) => `${pre(l)}/publications/${p.slug}/`,
  about: l => `${pre(l)}/about/`,
};
const SECTIONS = ['home', 'law', 'register', 'publications', 'about'];
P.support = l => `${pre(l)}/support/`;
const DATA_CSV = '/data/acb-case-register.csv';
const DATA_JSON = '/data/acb-case-register.json';

const recordById = Object.fromEntries(records.map(r => [r.id, r]));
// The scale of the ledger's bars: the highest amount in pounds any of its penalties names.
const topFine = Math.max(...ledger.map(it => it.fine || 0));
const pubBySlug = Object.fromEntries(publications.map(p => [p.slug, p]));
const articleByKey = {};
for (const law of laws) for (const a of law.articles) articleByKey[`${law.id}/${a.n}`] = { law, a };

// ---------------------------------------------------------------------- icons

const ICON = {
  home: '<path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9v11h11V9"/>',
  law: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  register: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  publications: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12h5M10 16h5"/>',
  about: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.75v.01"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.4 5.3 3.4 8.5s-1 6-3.4 8.5c-2.4-2.5-3.4-5.3-3.4-8.5s1-6 3.4-8.5z"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11"/><path d="M15.5 5.5V4.5h-11v11h1"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v8h14v-8"/>',
  ext: '<path d="M8 16 16 8M9.5 8H16v6.5"/>',
  install: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
};
const svg = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;

// ------------------------------------------------------------ shared pieces

function back(href, label) {
  return `<a class="back" href="${href}">${svg('back')}${label}</a>`;
}

function actions(id, lang) {
  const L = site[lang];
  return `<div class="acts"><button class="act" type="button" data-copy="${id}" data-done="${L.copied}" hidden>${svg('copy')}<span aria-live="polite">${L.copyCitation}</span></button><button class="act" type="button" data-share hidden>${svg('share')}<span>${L.share}</span></button></div>`;
}

function citeBlock(heading, citation, lang) {
  return `<section class="cite-sec" aria-labelledby="cite-h"><h2 class="sec" id="cite-h">${heading}</h2><p class="cite" id="cite">${citation}</p>${actions('cite', lang)}</section>`;
}

// Corrections and new information, dated, on the record or publication they amend.
function amendments(list, heading, lang) {
  if (!list || !list.length) return { note: '', block: '' };
  const L = site[lang];
  const last = list[list.length - 1].date;
  return {
    note: `<p class="amended"><a href="#corr-h">${fill(L.amended, { date: formatDate(last, lang) })}</a></p>`,
    block: `<section class="corr" aria-labelledby="corr-h"><h2 class="sec" id="corr-h">${heading}</h2><ol class="corr-list">${list.map(c => `<li><time datetime="${c.date}">${formatDate(c.date, lang)}</time><p>${c[lang]}</p></li>`).join('')}</ol></section>`,
  };
}

function evidenceBars(grade) {
  return `<span class="bars" aria-hidden="true">${[1, 2, 3, 4].map(g => `<i${g === grade ? ' class="on"' : ''}></i>`).join('')}</span>`;
}

function recordItem(r, lang) {
  const L = site[lang];
  const line = fill(L.evidenceLine, { n: num(r.grade, lang), label: L.gradesLower[r.grade - 1] });
  return `<li><a href="${P.record(lang, r)}">${ref(r.id, lang, 'rec-no ref')}<span class="rec-sum">${r[lang].summary}</span><span class="rec-ev">${evidenceBars(r.grade)}${line}</span></a></li>`;
}

function seriesLine(p, lang) {
  const t = p[lang];
  return lang === 'ar'
    ? `${t.series}، ${ref(p.ref, lang)}، ${t.date}، ${site.ar.inEnglish}`
    : `${t.series}, ${ref(p.ref, lang)}, ${t.date}`;
}

function pubExtra(p, lang) {
  const L = site[lang];
  if (p.tool) {
    return lang === 'ar'
      ? `<p class="pub-extra">${L.companion}: <a href="${p.tool.url}" lang="en">${p.tool.name}</a></p>`
      : `<p class="pub-extra"><a href="${p.tool.url}">${L.companion}: ${p.tool.name}</a></p>`;
  }
  if (p.version) return `<p class="pub-extra">${fill(L.version, { v: latin(p.version, lang) })}</p>`;
  return '';
}

function pubItem(p, lang, h = 'h3') {
  return `<li class="pub"><p class="series">${seriesLine(p, lang)}</p><${h} class="pub-title"><a href="${P.publication(lang, p)}">${latin(p.title, lang)}</a></${h}><p class="pub-sub">${latin(p.subtitle, lang)}</p>${pubExtra(p, lang)}</li>`;
}

// The defined terms of an annotated article, read from its fragment, and whether
// Animal Crime Bureau's measurement found text from the UAE law in each.
function terms(html, lang) {
  const out = [];
  for (const m of html.matchAll(/<div class="cl[^"]*" id="(c\d+)">(.*?)<\/div>/gs)) {
    const label = (lang === 'en' && m[2].match(/<p class="en"><b>(.*?):<\/b>/)) || m[2].match(/<p class="ar"[^>]*><b>(.*?):<\/b>/);
    out.push({ id: m[1], label: label[1], shared: m[2].includes('class="sh"') });
  }
  return out;
}

const lawSum = (a, lang) => fragment(a.fragment, lang).match(/<p class="law-sum">(.*?)<\/p>/s)[1];

// ------------------------------------------------------------- page bodies

function homeBody(lang) {
  const L = site[lang];
  const F = L.ledgerFields;
  const items = ledger.map((it, i) => {
    const t = it[lang];
    const prov = provisions[it.provision];
    const recs = records.filter(r => r.provision === it.provision);
    const reg = recs.length
      ? `<ul class="pp-recs">${recs.map(r => `<li><a href="${P.record(lang, r)}">${ref(r.id, lang)}</a> ${r[lang].summary}</li>`).join('')}</ul>`
      : L.noRecords;
    let onSite = '';
    if (it.annotated) {
      const { law, a } = articleByKey[it.annotated];
      onSite = `<dt>${F.site}</dt><dd><a href="${P.article(lang, law, a)}">${fill(L.annotatedLink, { article: a[lang].article })}</a></dd>`;
    }
    const provText = prov[lang] + (lang === 'en' ? `<span class="ar-line" lang="ar" dir="rtl">${prov.ar}</span>` : '');
    // The bar draws the highest amount in pounds the penalty names; beside it, the penalty as the law writes it and its provision.
    const bar = it.fine ? `<span class="bar" aria-hidden="true"><i style="--v:${(it.fine / topFine).toFixed(4)}"></i></span>` : '';
    return `<h3 class="pk-h"><button class="pk" type="button" id="pk-${i}" aria-controls="pp-${i}" aria-expanded="true"><span class="pk-txt"><span class="pk-t" id="pk-${i}-t">${t.category}</span>${bar}<span class="pk-pen">${t.penalty}</span><span class="pk-prov">${prov[lang]}</span></span>${svg('chev', 'chev')}</button></h3>
<div class="pp" id="pp-${i}" role="region" aria-labelledby="pk-${i}-t"><p class="pp-k">${F.act}</p><p class="pp-act">${t.act}</p><dl class="pp-f"><dt>${F.provision}</dt><dd>${provText}</dd><dt>${F.register}</dt><dd>${reg}</dd>${onSite}</dl></div>`;
  }).join('\n');
  return `<div class="wrap wrap-home">
<h1 class="thesis">${L.thesis}</h1>
<section aria-labelledby="ledger-h"><h2 id="ledger-h" class="ledger-h">${L.ledgerHeading}</h2><p class="ledger-sub">${L.ledgerSub} <span class="ledger-cap">${L.fineCaption}</span></p>
<div class="picker" data-picker style="--n:${ledger.length}">
${items}
</div>
<p class="ledger-note">${L.ledgerNote}</p></section>
<div class="latest">
<section aria-labelledby="latest-pub-h"><h2 id="latest-pub-h" class="latest-label">${L.latestPublication}</h2><ul class="pubs">${pubItem(publications[0], lang)}</ul></section>
<section aria-labelledby="latest-rec-h"><h2 id="latest-rec-h" class="latest-label">${L.latestRecord}</h2><ul class="records">${recordItem(records[0], lang)}</ul></section>
</div>
</div>`;
}

function lawIndexBody(lang) {
  const L = site[lang];
  const countries = [...new Set(laws.map(l => l.country))];
  const groups = countries.map(c => {
    const list = laws.filter(l => l.country === c);
    const cards = list.map(law => {
      const t = law[lang];
      const arts = law.articles.map(a => `<li><a class="art-link" href="${P.article(lang, law, a)}"><span class="art-link-n">${a[lang].article}</span><span class="art-link-h">${a[lang].heading}</span>${svg('next', 'art-link-go')}</a><p class="art-link-sum">${lawSum(a, lang)}</p></li>`).join('');
      const tool = law.tool
        ? (lang === 'ar'
          ? `<p class="pub-extra">${L.companion}: <a href="${law.tool.url}" lang="en">${law.tool.name}</a></p>`
          : `<p class="pub-extra"><a href="${law.tool.url}">${L.companion}: ${law.tool.name}</a></p>`)
        : '';
      return `<li class="law-card"><h3 class="law-title">${t.title}</h3>${lang === 'en' ? `<p class="law-ar" lang="ar" dir="rtl">${law.title_ar}</p>` : ''}<p class="gaz">${t.gazette}</p><h4 class="arts-h">${L.lawArticles}</h4><ul class="arts">${arts}</ul>${tool}</li>`;
    }).join('');
    return `<section aria-labelledby="c-${c}"><h2 class="sec" id="c-${c}">${list[0][lang].country}</h2><ul class="laws">${cards}</ul></section>`;
  }).join('');
  return `<div class="wrap"><h1 class="page-h">${L.lawHeading}</h1><p class="prose">${L.lawIntro}</p>${groups}</div>`;
}

function articleBody(law, a, lang) {
  const L = site[lang];
  const t = law[lang];
  let html = fragment(a.fragment, lang);
  const list = terms(html, lang);
  html = html.replace('<!--toc-->', copyMap(a, list, lang)).replace('<!--actions:cite-->', actions('cite', lang));
  return `<header class="wrap law-head">
  ${back(P.law(lang), L.lawHeading)}
  <p class="law-no">${t.country}</p>
  <p class="law-title">${t.title}</p>
  ${lang === 'en' ? `<p class="law-ar" lang="ar" dir="rtl">${law.title_ar}</p>` : ''}
  <p class="gaz">${t.gazette}</p>
  <h1 class="art">${a[lang].article}</h1><p class="art-sub">${a[lang].heading}</p>
</header>
<div class="wrap">
  ${html}
</div>`;
}

// Animal Crime Bureau's measurement of an article, one bar per definition: the share
// of its words that appear word for word in the law it is compared with.
const share = m => (m === 'whole' ? 1 : Array.isArray(m) ? m[0] / m[1] : 0);

function copyMap(a, list, lang) {
  if (!list.length) return '';
  const L = site[lang];
  if (!a.measure) {
    const key = list.some(x => x.shared) ? `<p class="cmap-s cmap-key">${L.tocShared}</p>` : '';
    return `<nav class="cmap" aria-labelledby="cmap-h"><p class="cmap-t" id="cmap-h">${L.toc}</p><ol class="cmap-list cmap-terms">${list.map(x => `<li><a href="#${x.id}"><span class="cmap-term${x.shared ? ' sh-t' : ''}">${x.label}</span></a></li>`).join('')}</ol>${key}</nav>`;
  }
  const rows = list.map(x => {
    const m = a.measure[x.id];
    const v = share(m);
    let label = L.cmapNone;
    if (m === 'whole') label = L.cmapWhole;
    else if (Array.isArray(m)) {
      const [shared, total] = m;
      label = shared === total
        ? fill(L.cmapAll, { t: num(total, lang) })
        : fill(L.cmapOf, { s: num(shared, lang), t: num(total, lang), w: arWords(shared) });
    }
    return `<li><a href="#${x.id}"><span class="cmap-term">${x.label}</span><span class="bar bar-m" aria-hidden="true">${v ? `<i style="--v:${v.toFixed(4)}"></i>` : ''}</span><span class="cmap-val">${label}</span></a></li>`;
  }).join('');
  return `<figure class="cmap" aria-labelledby="cmap-h"><figcaption><span class="cmap-t" id="cmap-h">${L.cmapHeading}</span><span class="cmap-s">${L.cmapNote}</span></figcaption><ol class="cmap-list">${rows}</ol></figure>`;
}

function supportBody(lang) {
  const L = site[lang];
  const work = [
    [P.law(lang), L.nav.law, L.lawIntro],
    [P.register(lang), L.nav.register, brandIn(L.registerDescription, lang)],
    [P.publications(lang), L.nav.publications, L.publicationsIntro],
  ].map(([href, title, text]) => `<li><a class="work-link" href="${href}"><span class="work-t">${title}</span><span class="work-s">${text}</span>${svg('next', 'go')}</a></li>`).join('');
  const email = `<a href="mailto:${site.email}"${lang === 'ar' ? ' lang="en"' : ''}>${site.email}</a>`;
  const mailto = `mailto:${site.email}?subject=${encodeURIComponent(strip(L.supportSubject))}`;
  return `<div class="wrap"><h1 class="page-h">${L.supportHeading}</h1>
<p class="prose lead">${L.thesis}</p>
<p class="prose">${brandIn(L.aboutDescription, lang)}</p>
<section class="ask" aria-labelledby="ask-h"><h2 class="sec" id="ask-h">${L.supportContactHeading}</h2><p class="prose">${fill(L.supportContact, { email })}</p><p><a class="btn" href="${mailto}">${L.supportWrite.replace(site.name, latin(site.name, lang))}</a></p></section>
<h2 class="sec">${L.supportWork}</h2><ul class="works">${work}</ul>
<h2 class="sec">${L.supportStandards}</h2>${fragment('standards', lang)}
<h2 class="sec">${L.followHeading}</h2><p class="prose">${L.follow}: <a href="${site.subscribeUrl}" hreflang="en">${L.subscribe}</a></p>
</div>`;
}

function registerBody(lang) {
  const L = site[lang];
  const files = `<a href="${DATA_CSV}" download${lang === 'ar' ? ' lang="en"' : ''}>CSV</a>${dot(lang)}<a href="${DATA_JSON}" download${lang === 'ar' ? ' lang="en"' : ''}>JSON</a>`;
  return `<div class="wrap">
<h1 class="page-h">${L.registerHeading}</h1>
${fragment('register-intro', lang)}
<h2 class="sec">${L.recordsHeading}</h2><ul class="records">${records.map(r => recordItem(r, lang)).join('')}</ul>
${fragment('register-method', lang)}
<h2 class="sec">${L.dataHeading}</h2><p class="prose">${L.dataText} ${files}</p>
<p class="updated">${L.registerUpdated}</p>
</div>`;
}

function recordBody(r, lang) {
  const L = site[lang];
  const t = r[lang];
  const F = L.fields;
  const prov = provisions[r.provision];
  const scale = L.grades.map((g, i) => (i + 1 === r.grade
    ? `<li class="on" aria-current="true">${num(i + 1, lang)}&nbsp;&nbsp;${g}<span class="sr">${L.gradeOfRecord}</span></li>`
    : `<li>${num(i + 1, lang)}&nbsp;&nbsp;${g}</li>`)).join('');
  const related = (r.related || []).map(slug => {
    const p = pubBySlug[slug];
    return `<a href="${P.publication(lang, p)}">${p[lang].series}</a>${lang === 'ar' ? ` (${L.inEnglish})` : ''}`;
  }).join('<br>');
  const fix = amendments(r.corrections, L.recordCorrections, lang);
  const url = ORIGIN + P.record(lang, r);
  const citation = fill(L.recordCitation, { ref: lang === 'ar' ? ref(r.id, lang) : r.id, published: t.published, url: latin(url, lang) });
  const i = records.indexOf(r);
  const newer = records[i - 1];
  const older = records[i + 1];
  const pn = newer || older
    ? `<nav class="pn" aria-label="${L.recordsHeading}">${older ? `<a href="${P.record(lang, older)}" rel="prev">${L.prevRecord}: ${ref(older.id, lang)}</a>` : '<span></span>'}${newer ? `<a href="${P.record(lang, newer)}" rel="next">${L.nextRecord}: ${ref(newer.id, lang)}</a>` : ''}</nav>`
    : '';
  return `<div class="wrap">
${back(P.register(lang), L.registerHeading)}
<article class="rec" aria-labelledby="h-rec"><h1 class="code" id="h-rec">${lang === 'ar' ? ref(r.id, lang) : r.id}</h1>${fix.note}<p>${t.text}</p><dl class="fields"><dt>${F.month}</dt><dd>${t.month}</dd><dt>${F.governorate}</dt><dd>${t.governorate}</dd><dt>${F.animals}</dt><dd>${t.animals}</dd><dt>${F.documented}</dt><dd>${t.documented}</dd><dt>${F.provision}</dt><dd>${prov[lang]}${lang === 'en' ? `<span class="ar-line" lang="ar" dir="rtl">${prov.ar}</span>` : ''}</dd><dt>${F.evidence}</dt><dd><ol class="scale">${scale}</ol></dd><dt>${F.sources}</dt><dd>${t.sources}</dd>${related ? `<dt>${F.related}</dt><dd>${related}</dd>` : ''}<dt>${F.published}</dt><dd>${t.published}</dd></dl>${fix.block}</article>
${citeBlock(L.citeRecord, citation, lang)}
${pn}
</div>`;
}

function publicationsBody(lang) {
  const L = site[lang];
  return `<div class="wrap"><h1 class="page-h">${L.publicationsHeading}</h1>
<p class="prose">${L.publicationsIntro}</p>
<ul class="pubs">${publications.map(p => pubItem(p, lang, 'h2')).join('')}</ul></div>`;
}

function publicationBody(p, lang) {
  const L = site[lang];
  const t = p[lang];
  const rel = (p.related || []).map(x => {
    if (x.law) {
      const { law, a } = articleByKey[x.law];
      return `<li><a href="${P.article(lang, law, a)}">${fill(L.relatedLaw, { article: a[lang].article, law: law[lang].title })}</a></li>`;
    }
    const r = recordById[x.record];
    return `<li><a href="${P.record(lang, r)}">${fill(L.relatedRecord, { ref: ref(r.id, lang) })}</a></li>`;
  }).join('');
  const fix = amendments(p.corrections, L.publicationCorrections, lang);
  const full = `${p.title}: ${p.subtitle}`;
  const citation = lang === 'ar'
    ? `${latin(site.name, lang)}، ${latin(full, lang)}، ${t.series}، ${ref(p.ref, lang)}، ${t.date} (${L.inEnglish}). ${latin(p.url, lang)}`
    : `${site.name}, ${full}, ${t.series}, ${ref(p.ref, lang)}, ${t.date}. ${p.url}`;
  return `<div class="wrap">
${back(P.publications(lang), L.publicationsHeading)}
<article class="pub-page" aria-labelledby="h-pub"><p class="series">${seriesLine(p, lang)}</p><h1 class="pub-h" id="h-pub">${latin(p.title, lang)}</h1><p class="pub-lead">${latin(p.subtitle, lang)}</p>${fix.note}
<p class="pub-cta"><a class="btn" href="${p.url}" hreflang="${p.language}">${L.readFull}${lang === 'ar' ? ` <span class="btn-note">(${L.inEnglish})</span>` : ''}${svg('ext', 'ext')}</a></p>
${pubExtra(p, lang)}
${rel ? `<h2 class="sec">${L.onSite}</h2><ul class="plain rel">${rel}</ul>` : ''}${fix.block}</article>
${citeBlock(L.citePublication, citation, lang)}
</div>`;
}

function aboutBody(lang) {
  const L = site[lang];
  return `<div class="wrap"><h1 class="page-h">${L.aboutHeading}</h1>
<div class="about-grid">
<p class="prose lead">${L.tagline}</p>

<div class="about-body">
${fragment('about', lang).replace('<!--standards-->', fragment('standards', lang))}
<h2 class="sec" id="app">${L.appHeading}</h2><p class="prose">${L.appText}</p><ul class="plain steps">${L.appSteps.map(x => `<li>${x}</li>`).join('')}</ul><p><button class="install" type="button" hidden>${svg('install')}${L.install}</button></p>
</div></div></div>`;
}

const notFoundBody = () => `<div class="wrap"><h1 class="page-h">Not found</h1><div class="about-grid"><p class="prose lead">This address has no page.<br><bdi lang="ar">هذا العنوان ليس له صفحة.</bdi></p><div class="about-body"><p class="prose way"><a href="/">The way back</a></p><p class="prose way"><a href="/ar/" lang="ar">طريق الرجوع</a></p></div></div></div>`;

const offlineBody = () => `<div class="wrap"><h1 class="page-h">${site.en.offlineHeading}</h1><div class="about-grid"><p class="prose lead">${site.en.offlineText}<br><bdi lang="ar">${site.ar.offlineText}</bdi></p><div class="about-body"><p class="prose way"><a href="/">${site.en.home}</a></p><p class="prose way"><a href="/ar/" lang="ar">${site.ar.home}</a></p></div></div></div>`;

// ---------------------------------------------------------- sidebar sections

function subNav(section, pg) {
  const lang = pg.lang;
  const L = site[lang];
  const cur = href => (pg.path === href ? ' aria-current="page"' : '');
  if (section === 'law') {
    return `<ul class="sub">${[...new Set(laws.map(l => l.country))].map(c => {
      const list = laws.filter(l => l.country === c);
      return `<li class="grp">${list[0][lang].country}</li>` + list.flatMap(law => law.articles.map(a => {
        const href = P.article(lang, law, a);
        const inner = pg.path === href && pg.terms
          ? `<ul class="terms">${pg.terms.map(x => `<li><a href="#${x.id}"${x.shared ? ' class="sh-t"' : ''}>${x.label}</a></li>`).join('')}<li class="terms-key">${L.tocShared}</li></ul>`
          : '';
        return `<li><a href="${href}"${cur(href)}>${law[lang].number}<small>${a[lang].article}${comma(lang)}${a[lang].heading}</small></a>${inner}</li>`;
      })).join('');
    }).join('')}</ul>`;
  }
  if (section === 'register') {
    return `<ul class="sub">${records.slice(0, 12).map(r => `<li><a href="${P.record(lang, r)}"${cur(P.record(lang, r))}>${ref(r.id, lang)}<small>${r[lang].summary}</small></a></li>`).join('')}</ul>`;
  }
  if (section === 'publications') {
    return `<ul class="sub">${publications.map(p => `<li><a href="${P.publication(lang, p)}"${cur(P.publication(lang, p))}>${latin(p.title, lang)}<small>${p[lang].series}</small></a></li>`).join('')}</ul>`;
  }
  return '';
}

function sideNav(pg) {
  const L = site[pg.lang];
  return `<nav class="side-nav" aria-label="${L.siteNav}"><ul>${SECTIONS.map(k => {
    const href = P[k](pg.lang);
    const cur = pg.path === href ? ' aria-current="page"' : pg.section === k ? ' aria-current="true"' : '';
    return `<li><a class="top-a" href="${href}"${cur}>${svg(k, 'ico')}<span>${L.nav[k]}</span></a>${pg.section === k ? subNav(k, pg) : ''}</li>`;
  }).join('')}</ul></nav>`;
}

function tabBar(pg) {
  const L = site[pg.lang];
  return `<nav class="tabs" aria-label="${L.siteNav}"><ul>${SECTIONS.map(k => {
    const href = P[k](pg.lang);
    const cur = pg.path === href ? ' aria-current="page"' : pg.section === k ? ' aria-current="true"' : '';
    return `<li><a href="${href}"${cur}>${svg(k)}<span>${L.tabs[k]}</span></a></li>`;
  }).join('')}</ul></nav>`;
}

// ------------------------------------------------------------------ the page

let cssVersion = '';
let jsVersion = '';

const JS_FLAG = "document.documentElement.className+=' js'";
const SPECULATION = JSON.stringify({
  prerender: [{
    where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/law-xray/*' } }, { not: { href_matches: '/data/*' } }, { not: { selector_matches: '[download]' } }] },
    eagerness: 'moderate',
  }],
});

// The fonts a page shows before the reader scrolls, fetched with the stylesheet.
function preloads(pg) {
  const fonts = pg.lang === 'ar' ? ['plex-arabic-400-arabic', 'plex-arabic-500-arabic', 'public-sans-latin'] : ['public-sans-latin'];
  return pg.cls === 'law' ? fonts.concat('amiri-400-arabic') : fonts;
}

const sha = s => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${sha(JS_FLAG)} ${sha(SPECULATION)}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cardPath(pg) {
  const own = `/assets/share/${pg.lang}/${pg.card.key}.png`;
  return existsSync(join(ROOT, own)) ? own : null;
}

function layout(pg) {
  const lang = pg.lang;
  const L = site[lang];
  const o = other(lang);
  const url = ORIGIN + pg.path;
  const image = pg.card ? cardPath(pg) : null;
  if (pg.card && !image) missingCards.push(pg.card.key + ' (' + lang + ')');
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="format-detection" content="telephone=no">',
    `<title>${esc(pg.title)}</title>`,
    `<meta name="description" content="${esc(pg.description)}">`,
    pg.noindex ? '<meta name="robots" content="noindex">' : '',
    pg.noindex ? '' : `<link rel="canonical" href="${url}">`,
    pg.alt && !pg.noindex ? `<link rel="alternate" hreflang="en" href="${ORIGIN + (lang === 'en' ? pg.path : pg.alt)}"><link rel="alternate" hreflang="ar" href="${ORIGIN + (lang === 'ar' ? pg.path : pg.alt)}"><link rel="alternate" hreflang="x-default" href="${ORIGIN + (lang === 'en' ? pg.path : pg.alt)}">` : '',
    `<meta property="og:site_name" content="${site.name}">`,
    `<meta property="og:title" content="${esc(pg.ogTitle || pg.title)}">`,
    `<meta property="og:description" content="${esc(pg.description)}">`,
    `<meta property="og:type" content="${pg.ogType || 'website'}">`,
    pg.noindex ? '' : `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${lang === 'ar' ? 'ar_AR' : 'en_US'}">`,
    image ? `<meta property="og:image" content="${ORIGIN + image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(strip(pg.card.title))}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    '<meta name="theme-color" content="#FFFFFF">',
    `<link rel="manifest" href="${lang === 'ar' ? '/ar/' : '/'}manifest.webmanifest">`,
    '<link rel="icon" type="image/svg+xml" href="/assets/img/favicon.svg">',
    '<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">',
    '<meta name="apple-mobile-web-app-title" content="ACB">',
    ...preloads(pg).map(f => `<link rel="preload" href="/assets/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`),
    `<link rel="stylesheet" href="/assets/site.css?v=${cssVersion}">`,
    `<script>${JS_FLAG}</script>`,
    `<script src="/assets/site.js?v=${jsVersion}" defer></script>`,
    `<script type="speculationrules">${SPECULATION}</script>`,
    pg.headExtra || '',
    ...(pg.jsonld || []).map(j => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...j }).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean).join('');

  const langLink = pg.alt
    ? cls => `<a class="lang${cls}" href="${pg.alt}" lang="${o}" hreflang="${o}">${cls ? svg('globe') : ''}${site[o].langName}</a>`
    : () => '';
  const install = `<button class="install" type="button" hidden>${svg('install')}${L.install}</button>`;
  const onSupport = pg.path === P.support(lang) ? ' aria-current="page"' : '';
  const next = pg.next
    ? `<div class="wrap"><nav class="next" aria-label="${L.next}"><a href="${pg.next.path}"><span class="next-k">${L.next}</span><span class="next-t">${pg.next.title}</span><span class="next-s">${pg.next.text}</span>${svg('next', 'go')}</a></nav></div>`
    : '';
  const contact = `<p><a href="mailto:${site.email}"${lang === 'ar' ? ' lang="en"' : ''}>${site.email}</a></p><p class="links">${site.social.map(s => `<a href="${s.url}"${lang === 'ar' ? ' lang="en"' : ''}>${s.name}</a>`).join('')}</p>`;

  return `<!doctype html>
<!-- Generated by tools/build.mjs from src/. Edit the source and build again; changes made here are lost. -->
<html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}><head>${head}</head><body><a class="skip" href="#main">${L.skip}</a>
<div class="app">
<header class="top"><a class="brand" href="${P.home(lang)}"><img src="/assets/img/acb-logo.svg" width="27" height="26" alt="">${brandName(lang)}</a><span class="top-end"><a class="top-cta" href="${P.support(lang)}"${onSupport}>${L.supportShort}</a>${langLink('')}</span></header>
<header class="side"><a class="brand" href="${P.home(lang)}"><img src="/assets/img/acb-logo.svg" width="27" height="26" alt="">${brandName(lang)}</a>${langLink(' lang-side')}${sideNav(pg)}<a class="cta" href="${P.support(lang)}"${onSupport}>${L.support}${svg('next', 'go')}</a><div class="side-foot">${install}</div></header>
<main id="main"${pg.cls ? ` class="${pg.cls}"` : ''}>${pg.noindex ? '' : `<p class="print-src">${latin(site.name, lang)}${dot(lang)}${latin(url, lang)}</p>`}${pg.body}${next}</main>
<footer class="foot"><div class="wrap"><p class="foot-brand"${lang === 'ar' ? ' lang="en"' : ''}>${site.name}</p><p>${L.tagline}</p>${contact}<p class="foot-more"><a href="${P.support(lang)}">${L.support}</a><a href="${site.subscribeUrl}" hreflang="en">${L.follow}</a></p><p class="foot-install">${install}</p></div></footer>
</div>
${tabBar(pg)}
</body></html>
`;
}

// ---------------------------------------------------------- structured data

const ORG = {
  '@type': 'Organization',
  name: site.name,
  alternateName: 'ACB',
  url: `${ORIGIN}/`,
  logo: `${ORIGIN}/assets/img/icon-512.png`,
  email: site.email,
  sameAs: site.social.map(s => s.url),
};
const ORG_REF = { '@type': 'Organization', name: site.name, url: `${ORIGIN}/` };

function crumbs(lang, trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name: strip(name), item: ORIGIN + path })),
  };
}

// ------------------------------------------------------------------- pages

// Stops the build with a plain list of what is wrong in the sources, instead of
// publishing a page with a gap or an "undefined" in it.
function validate() {
  const errors = [];
  const need = (ok, message) => { if (!ok) errors.push(message); };
  const isDate = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(s);
  const both = (item, keys, where) => {
    for (const lang of LANGS) for (const k of keys) need(typeof item[lang]?.[k] === 'string' && item[lang][k].trim(), `${where}: "${lang}.${k}" is missing`);
  };
  const dated = (list, where) => {
    for (const c of list || []) {
      need(isDate(c.date), `${where}: correction date "${c.date}" should look like 2026-11 or 2026-11-03`);
      need(c.en?.trim() && c.ar?.trim(), `${where}: correction of ${c.date} needs its text in English and Arabic`);
    }
  };
  const ids = new Set();
  for (const r of records) {
    const where = `register.json, ${r.id || 'a record without an id'}`;
    need(/^ACB\/\d{4}\/\d{3}$/.test(r.id), `${where}: the id should look like ACB/2026/001`);
    need(!ids.has(r.id), `${where}: this id is used twice`);
    ids.add(r.id);
    need([1, 2, 3, 4].includes(r.grade), `${where}: grade should be 1, 2, 3 or 4`);
    need(provisions[r.provision], `${where}: provision "${r.provision}" is not in provisions.json`);
    need(isDate(r.month) && isDate(r.published), `${where}: "month" and "published" should look like 2026-07`);
    both(r, ['summary', 'text', 'month', 'governorate', 'animals', 'documented', 'sources', 'published'], where);
    for (const s of r.related || []) need(pubBySlug[s], `${where}: related publication "${s}" is not in publications.json`);
    dated(r.corrections, where);
  }
  const slugs = new Set();
  for (const p of publications) {
    const where = `publications.json, ${p.ref || p.slug || 'a publication without a reference'}`;
    need(/^[a-z0-9-]+$/.test(p.slug || ''), `${where}: the slug should be lowercase words joined by hyphens`);
    need(!slugs.has(p.slug), `${where}: this slug is used twice`);
    slugs.add(p.slug);
    for (const k of ['ref', 'title', 'subtitle', 'url', 'language']) need(p[k]?.trim(), `${where}: "${k}" is missing`);
    need(isDate(p.date), `${where}: "date" should look like 2026-10`);
    both(p, ['series', 'date'], where);
    for (const x of p.related || []) need(x.law ? articleByKey[x.law] : recordById[x.record], `${where}: related ${x.law ? `article "${x.law}"` : `record "${x.record}"`} does not exist`);
    dated(p.corrections, where);
  }
  for (const it of ledger) {
    const where = `ledger.json, ${it.en?.category || 'an entry'}`;
    need(provisions[it.provision], `${where}: provision "${it.provision}" is not in provisions.json`);
    need(!it.annotated || articleByKey[it.annotated], `${where}: annotated article "${it.annotated}" does not exist`);
    both(it, ['category', 'act', 'penalty'], where);
  }
  for (const [key, prov] of Object.entries(provisions)) need(prov.en?.trim() && prov.ar?.trim(), `provisions.json, ${key}: needs English and Arabic`);
  // A bar may only draw an amount the published penalty states: EGP 200, or EGP 10,000 to 500,000,
  // and the Arabic penalty must name the same amounts: ٢٠٠ جنيه, or ١٠٬٠٠٠ إلى ٥٠٠٬٠٠٠ جنيه.
  const pounds = (text, pattern) => [...String(text).matchAll(pattern)].flatMap(m => m.slice(1).filter(Boolean))
    .map(x => Number(x.replace(/[,\u066C]/g, '').replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d))));
  for (const it of ledger) {
    const where = `ledger.json, ${it.en?.category || 'an entry'}`;
    const stated = pounds(it.en?.penalty, /EGP (\d[\d,]*)(?: to (\d[\d,]*))?/g);
    const statedAr = pounds(it.ar?.penalty, /([٠-٩][٠-٩\u066C]*)(?: إلى ([٠-٩][٠-٩\u066C]*))? جنيه/g);
    need(stated.join() === statedAr.join(), `${where}: the amounts in pounds differ between the English penalty (${stated.join(', ') || 'none'}) and the Arabic (${statedAr.join(', ') || 'none'})`);
    if (it.fine === undefined) {
      need(!stated.length, `${where}: the penalty names an amount but "fine" is not set`);
    } else {
      need(Number.isInteger(it.fine) && it.fine > 0, `${where}: "fine" should be a whole number of pounds`);
      need(stated.length && Math.max(...stated) === it.fine, `${where}: "fine" ${it.fine} is not the highest amount in pounds in the penalty`);
    }
  }
  // The copy map may only draw what the article's own notes state.
  for (const law of laws) {
    for (const a of law.articles) {
      if (!a.measure) continue;
      const where = `laws.json, ${law.id} article ${a.n}`;
      for (const lang of LANGS) {
        const html = fragment(a.fragment, lang);
        for (const x of terms(html, lang)) {
          const m = a.measure[x.id];
          const note = (html.match(new RegExp(`id="n${x.id.slice(1)}"[^>]*>(.*?)</div>`, 's')) || [])[1] || '';
          // The definition in Arabic, after its term: the words the red line marks are the words shared.
          const text = ((html.match(new RegExp(`id="${x.id}"><p class="ar"[^>]*>(.*?)</p>`, 's')) || [])[1] || '').replace(/^<b>.*?<\/b>/s, '');
          const underlined = [...text.matchAll(/<span class="sh">(.*?)<\/span>/gs)].reduce((n, u) => n + strip(u[1]).split(' ').length, 0);
          need(m !== undefined, `${where}: no measure for ${x.id}`);
          need((m !== 0) === x.shared, `${where}: ${x.id} is ${m === 0 ? 'measured as sharing nothing but is underlined' : 'measured as shared but not underlined'} in the ${lang} text`);
          if (Array.isArray(m)) {
            const [shared, total] = m;
            need(shared > 0 && shared <= total, `${where}: ${x.id} cannot share ${shared} of ${total} words`);
            need(underlined === shared, `${where}: ${x.id} shares ${shared} words but the ${lang} text underlines ${underlined}`);
            const phrase = lang === 'en'
              ? (shared === total ? `all ${total} words` : `${shared} of its ${total} words`)
              : (shared === total ? `الـ${num(total, 'ar')} كلها` : `${num(shared, 'ar')} ${arWords(shared)} من أصل ${num(total, 'ar')}`);
            need(note.includes(phrase), `${where}: the ${lang} note of ${x.id} does not say "${phrase}"`);
          } else if (m === 0) {
            need(note.includes(lang === 'en' ? 'Shares no run of five words' : 'لا يشترك'), `${where}: ${x.id} is measured as sharing nothing but its ${lang} note says otherwise`);
          } else {
            need(m === 'whole', `${where}: ${x.id} has a measure that is neither a count, 0 nor "whole"`);
            need(/^\s*<span class="sh">[^<]+<\/span>[\s.،]*$/.test(text), `${where}: ${x.id} is measured as whole but its ${lang} text is not underlined from end to end`);
            // A note that counts the words is drawn from its count, [shared, total], not as a whole definition.
            need(!(lang === 'en' ? /\bof its \d+ words|\ball \d+ words/ : /من أصل|كلها/).test(note), `${where}: the ${lang} note of ${x.id} counts its words; measure it as [shared, total]`);
          }
        }
      }
    }
  }
  if (errors.length) throw new Error(`The sources need fixing before the site can be built:\n- ${errors.join('\n- ')}`);
}

function nextKey(key) {
  const [kind, id] = key.split(/:(.*)/s);
  const firstArticle = `article:${laws[0].id}/${laws[0].articles[0].n}`;
  if (kind === 'home' || kind === 'law') return firstArticle;
  if (kind === 'article') return 'register';
  if (kind === 'register') return records.length ? `record:${records[0].id}` : 'publications';
  if (kind === 'record') return 'publications';
  if (kind === 'publications') return publications.length ? `publication:${publications[0].slug}` : 'support';
  if (kind === 'publication') {
    const i = publications.findIndex(p => p.slug === id);
    return publications[i + 1] ? `publication:${publications[i + 1].slug}` : 'support';
  }
  if (kind === 'about') return 'support';
  return null;
}

export function pages() {
  validate();
  const out = [];
  for (const lang of LANGS) {
    const L = site[lang];
    const o = other(lang);
    const titled = s => `${strip(s)} | ${site.name}`;
    const home = [L.nav.home, P.home(lang)];

    const start = out.length;
    out.push({
      key: 'home', lang, section: 'home', path: P.home(lang), alt: P.home(o), cls: 'home',
      title: site.name, description: L.description, body: homeBody(lang),
      card: { key: 'home', title: L.thesis },
      jsonld: [ORG, { '@type': 'WebSite', name: site.name, url: `${ORIGIN}/`, inLanguage: ['en', 'ar'], publisher: ORG_REF }],
    });

    out.push({
      key: 'law', lang, section: 'law', path: P.law(lang), alt: P.law(o), cls: 'law-index',
      title: titled(L.lawHeading), description: strip(L.lawIntro), body: lawIndexBody(lang),
      card: { key: 'law', title: L.lawHeading, sub: L.lawIntro },
      jsonld: [crumbs(lang, [home, [L.nav.law, P.law(lang)]])],
    });

    for (const law of laws) {
      for (const a of law.articles) {
        const html = fragment(a.fragment, lang);
        const path = P.article(lang, law, a);
        out.push({
          key: `article:${law.id}/${a.n}`, lang, section: 'law', path, alt: P.article(o, law, a), cls: 'law',
          peek: { title: `${law[lang].number}${comma(lang)}${a[lang].article}`, text: lawSum(a, lang) },
          title: titled(`${a[lang].article}${comma(lang)}${law[lang].title}`),
          description: strip(lawSum(a, lang)), body: articleBody(law, a, lang), terms: terms(html, lang),
          card: { key: `law-${law.id}-${a.n}`, kicker: `${law[lang].country}${dot(lang)}${law[lang].number}`, title: `${a[lang].article}${comma(lang)}${a[lang].heading}`, sub: lawSum(a, lang), bars: a.measure ? terms(html, lang).map(x => share(a.measure[x.id])) : null },
          jsonld: [
            {
              '@type': 'WebPage', name: strip(`${a[lang].article}${comma(lang)}${law[lang].title}`), url: ORIGIN + path, inLanguage: lang, publisher: ORG_REF,
              about: { '@type': 'Legislation', name: law.en.title, alternateName: law.title_ar, legislationIdentifier: law.en.number, legislationJurisdiction: law.en.country, datePublished: law.gazette_date, inLanguage: 'ar' },
            },
            crumbs(lang, [home, [L.nav.law, P.law(lang)], [`${law[lang].number}${comma(lang)}${a[lang].article}`, path]]),
          ],
        });
      }
    }

    out.push({
      key: 'register', lang, section: 'register', path: P.register(lang), alt: P.register(o), cls: 'register',
      peek: { title: L.registerHeading, text: brandIn(L.registerDescription, lang) },
      title: titled(L.registerHeading), description: L.registerDescription, body: registerBody(lang),
      card: { key: 'register', title: L.registerHeading, sub: L.registerDescription },
      jsonld: [
        {
          '@type': 'Dataset', name: strip(L.registerHeading), description: L.registerDescription, url: ORIGIN + P.register(lang),
          creator: ORG_REF, publisher: ORG_REF, inLanguage: ['en', 'ar'], spatialCoverage: { '@type': 'Place', name: 'Egypt' },
          distribution: [
            { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: ORIGIN + DATA_CSV },
            { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: ORIGIN + DATA_JSON },
          ],
        },
        crumbs(lang, [home, [L.nav.register, P.register(lang)]]),
      ],
    });

    for (const r of records) {
      const path = P.record(lang, r);
      out.push({
        key: `record:${r.id}`, lang, section: 'register', path, alt: P.record(o, r), cls: 'record', ogType: 'article',
        peek: { title: ref(r.id, lang), text: r[lang].summary },
        title: `${r.id} | ${strip(L.registerHeading)} | ${site.name}`, description: strip(r[lang].text), body: recordBody(r, lang),
        card: { key: `register-${slugOf(r.id).toLowerCase()}`, kicker: L.registerHeading, title: r.id, sub: r[lang].summary },
        jsonld: [crumbs(lang, [home, [L.nav.register, P.register(lang)], [r.id, path]])],
      });
    }

    out.push({
      key: 'publications', lang, section: 'publications', path: P.publications(lang), alt: P.publications(o), cls: 'pubs-page',
      peek: { title: L.publicationsHeading, text: L.publicationsIntro },
      title: titled(L.publicationsHeading), description: strip(L.publicationsIntro), body: publicationsBody(lang),
      card: { key: 'publications', title: L.publicationsHeading, sub: L.publicationsIntro },
      jsonld: [crumbs(lang, [home, [L.nav.publications, P.publications(lang)]])],
    });

    for (const p of publications) {
      const path = P.publication(lang, p);
      const full = `${p.title}: ${p.subtitle}`;
      const meta = [
        ['citation_title', full], ['citation_author', site.name], ['citation_publication_date', p.date.slice(0, 4)],
        ['citation_technical_report_institution', site.name], ['citation_technical_report_number', p.ref],
        ['citation_language', p.language], ['citation_fulltext_html_url', p.url], ['citation_abstract_html_url', ORIGIN + path],
      ].map(([n, c]) => `<meta name="${n}" content="${esc(c)}">`).join('');
      out.push({
        key: `publication:${p.slug}`, lang, section: 'publications', path, alt: P.publication(o, p), cls: 'pub-detail', ogType: 'article',
        peek: { title: latin(p.title, lang), text: latin(p.subtitle, lang) },
        title: titled(p.title), ogTitle: full, description: `${strip(seriesLine(p, lang))}. ${p.subtitle}`, body: publicationBody(p, lang),
        headExtra: meta,
        card: { key: `publication-${p.slug}`, kicker: `${p[lang].series}${dot(lang)}${p.ref}`, title: p.title, sub: p.subtitle, latinTitle: true },
        jsonld: [
          {
            '@type': 'Report', name: full, headline: p.title, alternativeHeadline: p.subtitle, reportNumber: p.ref, datePublished: p.date,
            inLanguage: p.language, url: p.url, mainEntityOfPage: ORIGIN + path, author: ORG_REF, publisher: ORG_REF,
          },
          crumbs(lang, [home, [L.nav.publications, P.publications(lang)], [p.title, path]]),
        ],
      });
    }

    out.push({
      key: 'about', lang, section: 'about', path: P.about(lang), alt: P.about(o), cls: 'about',
      title: titled(L.aboutHeading), description: strip(L.aboutDescription), body: aboutBody(lang),
      card: { key: 'about', title: L.aboutHeading, sub: L.tagline },
      jsonld: [ORG, crumbs(lang, [home, [L.nav.about, P.about(lang)]])],
    });

    out.push({
      key: 'support', lang, section: 'support', path: P.support(lang), alt: P.support(o), cls: 'support',
      peek: { title: L.supportHeading, text: fill(L.supportContact, { email: latin(site.email, lang) }) },
      title: titled(L.supportHeading), description: strip(L.supportDescription), body: supportBody(lang),
      card: { key: 'support', title: L.supportHeading, sub: L.thesis },
      jsonld: [ORG, crumbs(lang, [home, [L.supportHeading, P.support(lang)]])],
    });

    // Every page ends on the one page that carries the story on: the law, what happens
    // under it, what Animal Crime Bureau found, and how to support the work.
    const byKey = Object.fromEntries(out.slice(start).map(pg => [pg.key, pg]));
    for (const pg of out.slice(start)) {
      const target = byKey[nextKey(pg.key)];
      if (target) pg.next = { path: target.path, ...target.peek };
    }
  }

  out.push({
    lang: 'en', path: '/404.html', file: '404.html', alt: '/ar/', noindex: true, cls: '',
    title: `Not found | ${site.name}`, description: site.en.description, body: notFoundBody(),
  });
  out.push({
    lang: 'en', path: '/offline.html', file: 'offline.html', alt: '/ar/', noindex: true, cls: '',
    title: `${site.en.offlineHeading} | ${site.name}`, description: site.en.description, body: offlineBody(),
  });
  return out;
}

// --------------------------------------------------------------- the build

const written = [];
const missingCards = [];
function write(path, content) {
  const file = join(ROOT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  written.push(path);
}
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 10);
const outFile = pg => pg.file || `${pg.path.replace(/^\//, '')}index.html`;

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function registerData() {
  const rows = records.map(r => ({
    reference: r.id,
    month: r.month,
    published: r.published,
    governorate: { en: r.en.governorate, ar: r.ar.governorate },
    animals: { en: r.en.animals, ar: r.ar.animals },
    documented: { en: r.en.documented, ar: r.ar.documented },
    provision: { en: provisions[r.provision].en, ar: provisions[r.provision].ar },
    evidence_grade: r.grade,
    evidence: { en: site.en.grades[r.grade - 1], ar: site.ar.grades[r.grade - 1] },
    sources: { en: r.en.sources, ar: r.ar.sources },
    description: { en: strip(r.en.text), ar: strip(r.ar.text) },
    related: (r.related || []).map(s => ({ reference: pubBySlug[s].ref, title: pubBySlug[s].title, url: ORIGIN + P.publication('en', pubBySlug[s]) })),
    corrections: (r.corrections || []).map(c => ({ date: c.date, en: strip(c.en), ar: strip(c.ar) })),
    url: { en: ORIGIN + P.record('en', r), ar: ORIGIN + P.record('ar', r) },
  }));
  const updated = records.map(r => r.published).sort().pop();
  const json = JSON.stringify({ name: 'Case Register', publisher: site.name, url: ORIGIN + P.register('en'), updated, records: rows }, null, 2) + '\n';
  const cols = ['reference', 'month', 'published', 'governorate_en', 'governorate_ar', 'animals_en', 'animals_ar', 'documented_en', 'documented_ar', 'provision_en', 'provision_ar', 'evidence_grade', 'evidence_en', 'evidence_ar', 'sources_en', 'sources_ar', 'description_en', 'description_ar', 'related', 'corrections_en', 'corrections_ar', 'url_en', 'url_ar'];
  const flat = rows.map(x => ({
    reference: x.reference, month: x.month, published: x.published,
    governorate_en: x.governorate.en, governorate_ar: x.governorate.ar, animals_en: x.animals.en, animals_ar: x.animals.ar,
    documented_en: x.documented.en, documented_ar: x.documented.ar, provision_en: x.provision.en, provision_ar: x.provision.ar,
    evidence_grade: x.evidence_grade, evidence_en: x.evidence.en, evidence_ar: x.evidence.ar, sources_en: x.sources.en, sources_ar: x.sources.ar,
    description_en: x.description.en, description_ar: x.description.ar, related: x.related.map(y => y.reference).join('; '),
    corrections_en: x.corrections.map(c => `${c.date}: ${c.en}`).join(' | '), corrections_ar: x.corrections.map(c => `${c.date}: ${c.ar}`).join(' | '),
    url_en: x.url.en, url_ar: x.url.ar,
  }));
  // A byte order mark lets spreadsheet programs read the Arabic columns as UTF-8.
  const csv = '\uFEFF' + [cols.join(','), ...flat.map(row => cols.map(c => csvCell(row[c])).join(','))].join('\r\n') + '\r\n';
  return { csv, json };
}

function manifest(lang) {
  const L = site[lang];
  const icon = (size, purpose) => ({ src: `/assets/img/icon-${purpose === 'maskable' ? 'maskable-' : ''}${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose });
  return JSON.stringify({
    id: P.home(lang),
    name: site.name,
    short_name: 'ACB',
    description: strip(L.description),
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    start_url: P.home(lang),
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
    shortcuts: ['law', 'register', 'publications'].map(k => ({ name: strip(L.nav[k]), url: P[k](lang), icons: [{ src: '/assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }] })),
  }, null, 2) + '\n';
}

// Saved with the pages when the app installs. The other weights and scripts are saved the first time a page uses them.
const CORE_FONTS = ['public-sans-latin', 'plex-arabic-400-arabic', 'plex-arabic-500-arabic', 'amiri-400-arabic'];

function serviceWorker(all) {
  const assets = [
    `/assets/site.css?v=${cssVersion}`, `/assets/site.js?v=${jsVersion}`,
    '/assets/img/acb-logo.svg', '/assets/img/favicon.svg', '/assets/img/icon-192.png',
    ...CORE_FONTS.map(f => `/assets/fonts/${f}.woff2`),
  ];
  const pagesList = all.filter(p => p.path !== '/404.html').map(p => p.path);
  // The first part of every page's address: '' for the home page, then ar, law, register and so on.
  const sections = [...new Set(pagesList.map(p => p.split('/')[1]))];
  const version = hash([read('assets/site.css'), read('assets/site.js'), ...all.map(p => p.html)].join('\n'));
  return read('tools/sw.template.js')
    .replace('__VERSION__', version)
    .replace('__PAGES__', JSON.stringify(pagesList))
    .replace('__ASSETS__', JSON.stringify(assets))
    .replace('__SECTIONS__', JSON.stringify(sections));
}

function sitemap(all) {
  const urls = all.filter(p => !p.noindex).filter(p => p.lang === 'en').map(p => {
    const en = ORIGIN + p.path;
    const ar = ORIGIN + p.alt;
    const links = `<xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="ar" href="${ar}"/><xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`;
    return `<url><loc>${en}</loc>${links}</url>\n<url><loc>${ar}</loc>${links}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
<url><loc>${ORIGIN}/law-xray/</loc></url>
</urlset>
`;
}

export function build() {
  cssVersion = hash(read('assets/site.css'));
  jsVersion = hash(read('assets/site.js'));
  const all = pages();
  for (const pg of all) {
    pg.html = layout(pg);
    write(outFile(pg), pg.html);
  }
  const { csv, json } = registerData();
  write(DATA_CSV.slice(1), csv);
  write(DATA_JSON.slice(1), json);
  write('manifest.webmanifest', manifest('en'));
  write('ar/manifest.webmanifest', manifest('ar'));
  write('sitemap.xml', sitemap(all));
  write('sw.js', serviceWorker(all));
  console.log(`Wrote ${written.length} files.`);
  if (missingCards.length) console.warn(`No share image yet for: ${[...new Set(missingCards)].join(', ')}.\nRun node tools/images.mjs, then build again.`);
  return all;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    build();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
