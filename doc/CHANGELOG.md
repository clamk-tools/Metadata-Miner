# Change log

What changed in ez.Regex (called MetadataMiner until 2026-10-10), newest first. One entry per change that was published or is ready to be.

The git history is not the record: the published repository may be squashed to a single commit. This file is.

An entry says, in this order: what the user sees, what changed inside, and any decision taken (with its reason).
Keep it short; the details live in the code, the tests and `doc/ARCHITECTURE.md`. Start an entry with its date
(year-month-day) and a few words. Work that is not yet on `main` goes under **Unreleased**.

## Unreleased

### 2026-10-10 · The tool is now ez.Regex

- **Seen:** the header reads **ez.Regex**, with the tagline "File name in, regex out" beside it (under it on a
  narrow screen). The browser tab, the page description and the "newer version" messages use the new name.
- **Inside:** `App.tsx` (header), `app.css` (`.brand-line`, `.tagline`), `index.html`, `public/boot.js`, the
  end-to-end tests, the README and the docs. Older change log entries and the Python test headings keep the old
  name: they are history.
- **Decided:** the repository, the web address (`…/Metadata-Miner/`), the package name and Python's working folder
  in the worker keep the old name. Renaming the repository breaks shared links; the others are never seen.

### 2026-10-09 · A page opened before a release says so

- **Seen:** a page left open while a new version was published (a tab the phone's browser restored) said "Python
  could not be loaded (the worker script could not be loaded)", and *Try again* could never work. It now says "A
  newer version of MetadataMiner was published" and offers *Reload the page*. The same offer shows when the page's
  own script is missing and it cannot start at all. The paste box is empty after the reload.
- **Inside:** `detectClient.ts` asks the site for the worker script when Python does not load: a 404 means the page
  is out of date (`outdated` in the engine status). `App.tsx` shows the reload. `public/theme.js` is now
  `public/boot.js`: it also catches a missing script or style of the site. Two end-to-end tests in
  `e2e/offline.spec.ts`.
- **Decided:** a reload, not a stored copy of the names: the page stores nothing apart from the theme. One file
  runs before the page, not two, so the first paint waits for no extra request.

### 2026-10-09 · Docs: one place to start

- **Seen:** nothing changes on the page.
- **Inside:** `AGENTS.md` is new: what to read, the checks, the rules that are never broken. The README links it.
  `doc/ARCHITECTURE.md` (the steps of `detect()`, the proposal's rules) and `doc/CHANGING.md` (how the screen
  waits for Python, which errors reach the user, running the checks without Python 3.14 or Playwright's browsers)
  are brought in line with the code.
- **Decided:** `AGENTS.md` points to the docs instead of repeating them. `CLAUDE.md` stays local and unpublished.

### 2026-10-09 · Focus kept, no blinking, the sample read where it was labeled

- **Seen:** after an edit made with the keyboard the focus stays on the control used (it fell to the top of the
  page). Controls look dimmed only when an answer takes over 0.4 s, with "Working…", so the screen no longer blinks
  with many names. With *Anchor* on, a pattern that would read the sample in the wrong place (`s1_s2_s3`, the last
  `3` read as `2`) starts with `^`, and ends with `$` if needed; when it still misreads, or *Anchor* is off, a
  note says what it reads. *Auto* keeps the tightest style on a tie. An engine bug shows as "please report it",
  not as a bare word. "Allow fixed text **to** vary in its numbers".
- **Inside:** `metadata_detect.py` (`misread`, `build_pattern`, the tie in `analyze`, bounded caches); `glue.py`
  (only `ValueError` is the user's problem); `MetadataDetect.tsx` (`focused`, the name box waits like every
  control, `COLORS`); `detect.css` (the 400 ms delay); `theme.ts` (one `storage` listener for all subscribers).
  Python and end-to-end tests for each.
- **Decided:** controls stay disabled during a request, or two quick edits would overwrite each other; only their
  look waits. `^` and `$` are added only with *Anchor* on, which promises the pattern matches in the right place.

### 2026-10-08 · No line under the paste box

- **Seen:** the line "Only the names are read. No file is opened, and nothing is uploaded." under the paste box is
  gone. The intro above still says "Only file names are read."
- **Inside:** `NamesInput.tsx`, its style in `app.css`, and the check in `e2e/detect.spec.ts`.
- **Decided:** by the owner's choice. The README's Privacy section keeps the full statement.

### 2026-10-08 · Names are pasted, and only pasted

- **Seen:** the names step has only the paste box. The drop zone, the *Choose files…* button and dropping files or
  a folder anywhere on the page are gone. A file dropped on the page by habit is ignored, so the browser does not
  open it in place of the tool.
- **Inside:** `NamesInput.tsx`, `App.tsx` (the page-wide drop handling), `names.ts` (reading a drop and walking a
  folder) and their styles and tests are removed; the end-to-end tests give the names by pasting. A small guard in `App.tsx`
  stops a dropped file, with a test.
- **Decided:** one way in, by the owner's choice: pasting covers every case (a full path is cut to its name).

### 2026-10-06 · A way back to the other tools

- **Seen:** the header has a quiet "← All tools" link to the hub, next to the theme switch, as in the other Clamk
  tools. The footer keeps only the *Source* link; its "One of the Clamk Tools" line repeated the new link.
- **Inside:** `App.tsx`; `e2e/detect.spec.ts` checks the link.
- **Decided:** every Clamk tool has the "← All tools" link in its header (the visual identity brief, section 5).

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
