# Change log

What changed in MetadataMiner, newest first. One entry per change that was published or is ready to be.

The git history is not the record: the published repository may be squashed to a single commit. This file is.

An entry says, in this order: what the user sees, what changed inside, and any decision taken (with its reason).
Keep it short; the details live in the code, the tests and `doc/ARCHITECTURE.md`. Start an entry with its date
(year-month-day) and a few words. Work that is not yet on `main` goes under **Unreleased**.

## Unreleased

- (nothing)

## 2026-10-02 · No third party, and the browser holds the page to it

- **Seen:** the names step said "Only file names are uploaded"; it says "read", which is what happens. Python no
  longer comes from the jsDelivr CDN: it is served by the site, so a network that blocks the CDN is no longer a
  limit, and the first visit is still about 6 MB. The README's Privacy section says what is promised and what
  holds it. A browser that refuses to run Python (too old for the policy, or WebAssembly turned off) is told so,
  with no *Try again* that could never work.
- **Inside:** `vite.config.ts` puts the Pyodide runtime of the `pyodide` package in `pyodide/<version>/` (the
  version in the address, so a new release never meets runtime files a browser kept from the one before) and
  writes a Content-Security-Policy into the built page (the site's own files only, no inline script: the theme
  script moved to `public/theme.js`). The worker starts from a blob so the policy applies to Python too.
  `e2e/network.spec.ts` fails on a request to another host and on a worker not started from a blob, and checks
  that the browser refuses a request to another host, from the page and from the worker. `e2e/fixtures.ts` makes
  every end-to-end test fail on an uncaught page error. The end-to-end tests need no network any more.
- **Decided:** the decision "Pyodide from jsDelivr" is reversed (`doc/ARCHITECTURE.md` section 11): the CDN's
  code ran where the names are, unchecked. Each deploy is about 13 MB larger. The policy guards against a request
  added by mistake or by a dependency; it does not stop a navigation, and the README says so. `worker-src`
  keeps `'self'` beside `blob:`: without it the browser refuses the script the worker imports, so a worker
  started from a file is caught by the test, not by the policy.

## 2026-10-02 · Docs for changing the tool

- **Seen:** nothing changes on the page.
- **Inside:** `doc/ARCHITECTURE.md` (how it is made), `doc/CHANGING.md` (how to make a change), this file, and
  the Clamk Tools visual identity brief are published with the repo. The README links them under *Changing it*.
- **Decided:** this file is the record of what changed, since the published history is one commit.

## 2026-10-02 · The Clamk Tools look

- **Seen:** the page has the family's frame: the rail at the top, a header with the tool's name (it goes back to
  the names) and a light or dark switch, a footer. The theme follows the system until the switch is used; the
  choice is shared with the hub and the other tools. Each labeled field has one of six colours.
- **Inside:** `theme.css` holds the identity's tokens for light and dark; `theme.ts` and `ThemeSwitch.tsx` are
  new; the fonts (Figtree, IBM Plex Mono) are served with the page from `@fontsource` packages.
- **Decided:** the page has a header and a theme switch after all, because every Clamk tool has them
  (`doc/LLMfeed_VISUAL-IDENTITY.md`). The fonts are not loaded from a font CDN: the page makes no third-party
  request apart from the Python runtime.

## 2026-10-02 · Engine changes not yet in HC-Flow

- **Seen:** a value that is several words in some names (`Far Red` where the others have `Blue`) is read. A new
  pattern style, *Several words*. Clicking an unmatched name of that kind widens the label and keeps the sample.
  A change with 12,000 names takes about 0.2 s, down from 0.5 to 0.9 s.
- **Inside:** `align`, `widen` and the `words` style in `metadata_detect.py`; parsed names and alignments cached
  between requests; counting over a field's different values. A fix: a value with a superscript digit (`10²`)
  made every request fail.
- **Decided:** a longer name that could be lined up with the sample in two ways is left out, not guessed at.

## 2026-10-02 · First release

- **Seen:** the names step (drop files or a folder, choose files, paste names) and the Detect screen: proposed
  labels, labeling by click, drag or button, pattern styles, the two pattern options, what the pattern reads, the
  unmatched names, *Copy this pattern*.
- **Inside:** HC-Flow's Detect dialog as a static page. Python (`metadata_detect.py`, `metadata.py`) runs in
  Pyodide in a Web Worker behind `glue.py`. Tests in Python, in TypeScript and end to end in three browsers. CI
  tests, builds and publishes to GitHub Pages. The privacy guard checks every commit.
- **Decided:** see `doc/ARCHITECTURE.md`, section 11.
