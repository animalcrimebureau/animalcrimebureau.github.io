# animalcrimebureau.org

The website of Animal Crime Bureau, in English and Arabic. GitHub Pages serves
this repository as it is, so the generated pages are committed with their sources.

## Changing the content

Edit the sources in `src/`, never the generated HTML: the next build overwrites it.

| File | Holds |
| --- | --- |
| `src/data/site.json` | Interface text in both languages, contact details |
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
```

`tools/images.mjs` needs Playwright and its Chromium. The other two need only Node.

## What the build makes

- Every page in English and under `/ar/` in Arabic, including a page for each
  record (`/register/ACB-2026-001/`) and each publication (`/publications/working-paper-2/`).
- `data/acb-case-register.csv` and `.json`: the published records in both languages.
- `sitemap.xml` with the English and Arabic address of every page.
- `manifest.webmanifest`, `ar/manifest.webmanifest` and `sw.js`: the site installs
  as an app and its pages can be read without a connection.

## Conventions

- Red marks only Animal Crime Bureau's measurement.
- Every legal statement cites the published text of the law.
- Record numbers are never changed or reused.
- Images in `assets/img` that no page uses are kept on purpose. Do not link,
  cache or delete them without asking.
