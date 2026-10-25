# animalcrimebureau.org

The website of Animal Crime Bureau, in English and Arabic. GitHub Pages serves
this repository as it is, so the generated pages are committed with their sources.

**This repository is public, and so is its history.** A record that has not been
published, its photographs, or any other file of an open case must never be
committed here, not even for a moment: deleting it later does not take it out of
the history.

## Changing the content

Edit the sources in `src/`, never the generated HTML: the next build overwrites it.

| File | Holds |
| --- | --- |
| `src/data/site.json` | Interface text in both languages, contact details, month names |
| `src/data/ledger.json`, `src/data/provisions.json` | The home page ledger of penalties by animal |
| `src/data/register.json` | Case Register records, newest first |
| `src/data/publications.json` | Publications, newest first |
| `src/data/laws.json`, `src/fragments/law-*.html` | The law library and its annotated articles |
| `src/fragments/*.html` | Longer passages: About, the register's introduction and method |

Then, from the repository root:

```sh
node tools/images.mjs   # only after adding a page or changing a title: icons and link previews
node tools/build.mjs    # every page, the sitemap, the app files, the register as CSV and JSON
node tools/check.mjs    # links, anchors, headings, previews and app files
node tools/test.mjs     # the site in a browser: ledger, record links, citations, offline, phone
```

`tools/images.mjs` and `tools/test.mjs` need Playwright and its Chromium. The
other two need only Node. The build stops and lists the problem if a source is
incomplete, for example a record without its Arabic text or a provision that
`provisions.json` does not have. On every pull request, GitHub runs the build and
the check (`.github/workflows/check.yml`) and fails if the committed pages differ
from what the sources build.

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
`language`, `url` of the full text, `title`, `subtitle`, and `series` and `date`
under `en` and `ar`. `tool`, `version` and `related` are optional.

**Record a correction.** Never change a published text silently. Add the
correction, with its date and both languages, to the record or publication it
amends:

```json
"corrections": [
  { "date": "2026-11-03", "en": "What was corrected, and what the text now says.", "ar": "ما الذي صُحّح، وما الذي يقوله النص الآن." }
]
```

The page then shows "Amended 3 November 2026" under its title and the dated list
below it, and the register's data files carry it.

## What the build makes

- Every page in English and under `/ar/` in Arabic, including a page for each
  record (`/register/ACB-2026-001/`) and each publication (`/publications/working-paper-2/`).
- `data/acb-case-register.csv` and `.json`: the published records in both languages.
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
- Images in `assets/img` that no page uses are kept on purpose. Do not link,
  cache or delete them without asking.
