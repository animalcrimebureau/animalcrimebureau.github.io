# animalcrimebureau.org

The website of Animal Crime Bureau, in English and Arabic. GitHub Pages serves
this repository as it is, so the generated pages are committed with their sources.

**This repository is public, and so is its history.** A record that has not been
published, its photographs, or any other file of an open case must never be
committed here, not even for a moment: deleting it later does not take it out of
the history.

## Rules for every change

- Change the sources in `src/`, then build and check them as below. Never edit a
  generated page by hand.
- After changing `assets/site.js`, `assets/site.css` or the page layout, also run
  the browser test.
- Add no fact, figure, date or legal reading that Animal Crime Bureau has not
  published or approved, and change the wording of a legal text only with its
  approval.
- Never change a published text silently: a correction goes in `corrections`,
  dated, in both languages.
- Keep the two languages in step: every change to an English page has its
  Arabic counterpart.
- In Arabic text, separate items with the Arabic comma, not a middle dot: next
  to Arabic digits a dot reads as zero.

## Changing the content

Edit the sources in `src/`, never the generated HTML: the next build overwrites it.

| File | Holds |
| --- | --- |
| `src/data/site.json` | Interface text in both languages, contact details, month names |
| `src/data/ledger.json`, `src/data/provisions.json` | The home page ledger of penalties by animal |
| `src/data/register.json` | Case Register records, newest first |
| `src/data/publications.json` | Publications, newest first |
| `src/data/laws.json`, `src/fragments/law-*.html` | The law library and its annotated articles |
| `src/data/xray.json`, `law-xray/` | Law X-ray: the definitions and provisions it compares, and the paper, texts and code it offers for download |
| `publications/<slug>/*.pdf` | The publications themselves, as issued |
| `src/fragments/*.html` | Longer passages: About and its standards, the register's introduction and method |

Then, from the repository root:

```sh
node tools/images.mjs   # only after adding a page or changing a title: icons and link previews
node tools/build.mjs    # every page, the sitemap, the app files, the register as CSV and JSON
node tools/check.mjs    # links, anchors, headings, previews and app files
node tools/test.mjs     # the site in a browser: ledger, copy map, citations, offline, install, phone, print, accessibility
```

`tools/images.mjs` and `tools/test.mjs` need Playwright and its Chromium, and the
accessibility part of the test needs axe-core (`npm install --no-save axe-core`).
The other two need only Node. The build stops and lists the problem if a source
is incomplete, for example a record without its Arabic text or a provision that
`provisions.json` does not have. On every pull request, GitHub runs all four
(`.github/workflows/check.yml`, without the images) and fails if the committed
pages differ from what the sources build, if a link breaks, or if a page stops
working in the browser or meeting WCAG 2.2 AA.

## Common tasks

**Publish a record.** Add it at the top of `src/data/register.json`:

```json
{
  "id": "ACB/2026/003",
  "month": "2026-09",
  "published": "2026-11",
  "grade": 3,
  "provision": "penal-357",
  "related": [],
  "en": { "summary": "", "text": "", "month": "September 2026", "governorate": "", "animals": "", "documented": "", "sources": "", "published": "November 2026" },
  "ar": { "summary": "", "text": "", "month": "سبتمبر ٢٠٢٦", "governorate": "", "animals": "", "documented": "", "sources": "", "published": "نوفمبر ٢٠٢٦" }
}
```

`provision` is a key of `src/data/provisions.json`, `grade` runs from 1 to 4, and
`related` lists publication slugs. Run the images, the build and the check.

**Publish a publication.** Add it at the top of `src/data/publications.json` with
its `slug` (the address, such as `working-paper-3`), `ref`, `date` (`2026-12`),
`language`, `url` of its Substack post, `title`, `subtitle`, and `series` and `date`
under `en` and `ar`. `version`, `licence` and `related` are optional.

Put the document itself in `publications/<slug>/` and list it under `files`, with
its language and number of pages; the page then opens it from this site and keeps
the Substack post as a second link:

```json
"files": [
  { "lang": "en", "path": "/publications/working-paper-3/ACB-WP-003.pdf", "pages": 12 },
  { "lang": "ar", "path": "/publications/working-paper-3/ACB-WP-003-ar.pdf", "pages": 14 }
]
```

A publication issued in Arabic also takes its Arabic `title` and `subtitle` under
`ar`: the Arabic pages then show them, open the Arabic file first and no longer
mark the publication as English only.

Running the images also draws the cover of the publication's Substack post, at
`assets/share/substack/<slug>.png`. It is 3:2, the shape Substack's lists crop a
post's image to, and its text stays clear of what Substack's link previews cut
off. Upload it in the post's settings as its social preview image; it is not
shown in the post itself.

**Draw a fine or a measurement.** The home ledger draws, on one scale, the
highest amount in pounds in each penalty, from `fine` in
`src/data/ledger.json`, beside the penalty as the law writes it and its
provision; an amount too small to see on the scale is drawn as a hairline. An
annotated article draws Animal Crime Bureau's measurement, one bar per
definition, from `measure` in `src/data/laws.json`: `[shared, total]` words as
its notes count them, `0` for none, or `"whole"` for a definition its red line
marks from end to end and its notes do not count. The build refuses a fine that
is not the highest amount in the penalty, English and Arabic penalties that name
different amounts, and a measurement that differs from the article's notes or
from the words its red line marks, so a bar never draws what the text does not
say.

**The donation campaign.** While a campaign is live, its full address is in
`donateUrl` in `src/data/site.json`. Every page then says Donate on the way to
the Support page, which opens with the Donate button, what the donations cover
(`donateItems`) and who collects them (`donateHow`), in both languages. Take
that wording from the campaign's own page, and change it when the campaign
changes. The button is a plain link, so the pages still load nothing from
another site. When the campaign closes, empty `donateUrl`: the button goes and
the pages say Support this work again.

**Search engines.** The site is registered in Google Search Console, verified
through the domain's DNS, and in Bing Webmaster Tools, imported from Google.
Both read `sitemap.xml`, which the build keeps up to date, so a new page needs
nothing more. To add an HTML tag as a second way of verifying the site with
Google, put only the tag's `content` in `googleSiteVerification` in
`src/data/site.json` and build: the home page then carries the tag. Leave it in
place afterwards, since Google checks it again from time to time.

**Law X-ray.** `src/data/xray.json` holds the data of Working Paper No. 2 as
published: each definition or provision of Egypt's law, the text it is compared
with in the Emirati and Bahraini laws, and the words they share. The build finds
every mark again from the words, by the paper's method, and refuses the data if
one differs; it also refuses a copy map on the law page that counts differently
from the tool. The files in `law-xray/` are the paper, its texts and its code,
and their addresses are cited in the paper: do not rename them.

**Record a correction.** Never change a published text silently. Add the
correction, with its date and both languages, to the record, the publication or
the annotated article (in `src/data/laws.json`) it amends:

```json
"corrections": [
  { "date": "2026-11-03", "en": "What was corrected, and what the text now says.", "ar": "ما الذي صُحّح، وما الذي يقوله النص الآن." }
]
```

The page then shows "Amended 3 November 2026" under its title and the dated list
below it, and the register's data files carry it. A change to the wording of the
home ledger is recorded the same way, in `ledgerCorrections` in
`src/data/site.json`; the home page shows it under the ledger.

## How a reader moves through the site

Every page ends on one page that carries the story on: the law, what happens
under it in the Case Register, what Animal Crime Bureau published, and how to
support the work. The order is `nextKey` in `tools/build.mjs`. The Support page,
the button at the foot of the sidebar and the one in the phone's top bar
are how a funder reaches Animal Crime Bureau; the footer also links to email
subscription on Substack. The Case Register page says how to bring an incident
to Animal Crime Bureau, in the terms of the register itself: change that text
only with the register's method.

## Privacy and security

Every page carries a Content Security Policy: scripts, stylesheets, fonts and
images load only from this site, and the only scripts written into the pages are
the two lines the build adds, allowed by their hashes. Nothing is fetched from
another service. The site sets no cookies and has no analytics. Adding anything
from elsewhere, such as an embedded video or a counter, means changing the
policy in `tools/build.mjs` on purpose; the test fails otherwise.

The About page tells visitors the same, under Privacy, and says what the site
is built to under Accessibility; the footer of every page links to both. The
browser test holds the site to those words: no cookie, nothing kept in the
browser's storage, no request to another site, and WCAG 2.2 AA on every page.
If one of them has to change, change the text in `src/data/site.json` first.

## What the build makes

- Every page in English and under `/ar/` in Arabic, including a page for each
  record (`/register/ACB-2026-001/`) and each publication (`/publications/working-paper-2/`),
  and Law X-ray (`/law-xray/`).
- `data/acb-case-register.csv` and `.json`: the published records in both languages,
  which anyone may reuse with credit to Animal Crime Bureau (CC BY 4.0).
- `sitemap.xml` with the English and Arabic address of every page.
- `manifest.webmanifest`, `ar/manifest.webmanifest` and `sw.js`: the site installs
  as an app and its pages can be read without a connection.

## Withdrawing

The redesign is undone by reverting its merge on `main`.

The app is the one part that lives on readers' devices. To withdraw it, replace
`tools/sw.template.js` with the worker below, remove the line in `assets/site.js`
that registers `/sw.js`, then build and publish. Each device that installed the
app clears its saved copies and drops the worker on its next visit.

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.map(key => caches.delete(key))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll())
    .then(clients => clients.forEach(client => client.navigate(client.url))),
));
```

## Conventions

- Red marks only Animal Crime Bureau's measurement.
- Every legal statement cites the published text of the law.
- Record numbers are never changed or reused.
- A record's photographs and other files are added only when the record is
  published, never before.
