# Architecture

How ez.Regex (formerly MetadataMiner) is made, for whoever changes it next (a person or an LLM). `README.md` says what the tool does
for its user. `AGENTS.md` is where to start. `doc/CHANGING.md` says how to make a change. `doc/CHANGELOG.md`
says what changed and when.

Read sections 1 to 4 before any change. Read section 5 before touching the Python, sections 6 and 7 before
touching the page, and section 10 before every change: it lists what has to be kept in step by hand.

## 1. In one paragraph

A static page (React, built by Vite, served by GitHub Pages) with no backend. The user gives file names. The page
hands the names to a Web Worker that runs Python (Pyodide). Python proposes labels and writes the regular
expression. Each edit on the screen is one small request to Python and one full answer back. The page draws the
answer and never builds a pattern itself.

## 2. The pieces

```
 page (main thread)                           Web Worker
 ──────────────────                           ──────────────────────────────────────────
 App.tsx                                      detect.worker.ts
  ├─ NamesInput.tsx ── names.ts                ├─ loads Pyodide from the site (pyodide/)
  ├─ MetadataDetect.tsx ── selection.ts        ├─ writes the three Python files into Pyodide's file system
  ├─ ThemeSwitch.tsx ── theme.ts               └─ glue.py ─► metadata_detect.detect() ─► metadata.py
  └─ DetectClient (detectClient.ts)
        setNames(names)   once per set of names   ──►
        detect(request)   once per edit           ──►   ◄── one JSON answer per request
```

| Path | Role |
|---|---|
| `py/app/imaging/metadata_detect.py` | The engine: labels, pattern styles, the proposal, the answer. HC-Flow's file plus the changes listed in the README |
| `py/app/imaging/metadata.py` | `compile_pattern` and `extract_metadata`: the two functions of HC-Flow's file that Detect calls |
| `py/glue.py` | What the worker calls: `set_names(json)` keeps the names, `run(json)` runs one step and answers in JSON |
| `src/detect.worker.ts` | Loads Pyodide and the Python files; answers requests one at a time, in order |
| `src/detectClient.ts` | The page's side of the worker: starts it (from a blob, section 9), engine status, `setNames`, `detect`, `restart` |
| `src/detect-types.ts` | The contract: the request, the answer, the worker messages |
| `src/App.tsx` | The frame (rail, header, footer), the names step or the Detect screen, the notices, the guard that ignores a dropped file |
| `src/NamesInput.tsx` | The names step: the paste box |
| `src/names.ts` | Names from pasted text; the image filter; the same-stem warning |
| `src/MetadataDetect.tsx` | The Detect screen and its parts (sample name, label picker, field cards, matches, "i" bubbles) |
| `src/selection.ts` | A click or a drag on the sample name, turned into the stretch to label |
| `src/clipboard.ts` | Copy, with a fallback when the browser refuses |
| `src/theme.ts`, `src/ThemeSwitch.tsx` | Light or dark: system setting, switch, stored choice |
| `src/styles/` | `theme.css` tokens and native controls, `app.css` the page, `detect.css` the Detect screen |
| `index.html` | The page shell; loads `boot.js` ahead of everything else |
| `public/boot.js` | Before the page's own script: applies the stored theme, and says so when the page's own files are missing (a page opened before a release) |
| `vite.config.ts` | The build, and two plugins of its own: the Pyodide runtime put in `pyodide/<version>/`, the Content-Security-Policy written into the built page |
| `py/tests/`, `src/*.test.ts`, `e2e/` | The tests (section 8) |
| `.github/workflows/ci.yml`, `.githooks/` | CI and deploy; the privacy guard |

## 3. Life of a session

1. **Start.** `App.tsx` creates one `DetectClient` when the module loads. Its worker starts loading Pyodide
   (from `pyodide/<version>/`, on the site itself) at once, so Python is usually ready by the time the names are.
   The engine status is `loading`, `ready` or `failed`, read with `useSyncExternalStore`.
2. **Names.** The paste box gives raw names. `intake()` keeps the image names (sorted, each once) and counts the
   rest. `App.load` sends the kept names to the worker (`client.setNames`) in the event handler, so they are there before the first question. It then bumps `run`,
   the React `key` of the Detect screen: each set of names gets a fresh screen.
3. **First answer.** `MetadataDetect` mounts and asks `{ suggest: true }`.
4. **An edit.** Every action on the screen calls `call(patch)`, which sends
   `{ sample_index, fields, generalize, anchor, ...patch }`. `fields` are the ones of the last answer, unchanged.
   The patch holds at most one action. The answer replaces the screen's state as a whole.
5. **Close.** The cross, or the tool's name in the header, sets the names aside (`setResult(null)`) and shows the
   names step again. The paste box keeps its text.

Things this flow relies on:

- **The worker runs requests in order** (a promise queue), so a request never runs before the names it is about.
- **A late answer is dropped.** `attempt` in `MetadataDetect` counts requests; an answer that is not the latest
  is ignored, also after the screen is closed.
- **Two kinds of failure.** Python raises `ValueError` for a problem the user can fix (a bad field name): the
  message is shown as it is. Anything else, a `KeyError` or `TypeError` included, is a bug: `glue.run` marks it
  `unexpected`, and the screen says something went wrong and asks for a report. `glue.run` never raises.
- **Every control waits for the answer.** While a request is in flight the screen's controls are disabled, so two
  quick edits cannot overwrite each other. They are drawn dimmed only after 0.4 s (`detect.css`), with "Working…".
  The keyboard focus goes back to the control that sent the request, or to the one now in its place, or to the
  screen (`focused` in `MetadataDetect`).
- **Python that does not load.** The worker posts `failed`; the page explains (the connection dropped) and
  offers *Try again*, which is `client.restart()`: a new worker, the names sent again.
- **A page opened before a release.** A release replaces every file, and the worker script's name changes with its
  content, so a page the browser kept from before asks for files that are gone. When Python does not load,
  `detectClient.ts` asks the site for the worker script (`HEAD`): a 404 means the page is out of date
  (`outdated`), and the page offers *Reload the page* instead of *Try again*. When the page's own script or styles
  are missing, the page cannot start at all: `public/boot.js`, which runs first, catches the failed file and shows
  the same offer.
- **Python that the browser will not run.** Before the download, the worker compiles the smallest WebAssembly
  module there is. A browser that refuses it (too old for the policy of section 9, or WebAssembly turned off)
  would fail on every try: the worker posts `failed` with `refused`, and the page says so without offering
  *Try again*. The same when the browser throws on starting the worker.

## 4. The contract between the page and Python

Defined three times, and the three must agree:

| What | Python | TypeScript |
|---|---|---|
| The request | the keyword arguments of `detect()`; `glue.run` reads each key from the JSON | `DetectRequest` in `detect-types.ts` |
| The answer | the dictionary `detect()` returns, and each entry of its `fields` | `MetadataDetect` and `DetectField` |

A new request key needs all of: a `detect()` argument, a line in `glue.run`, a field in `DetectRequest`. A key
missing from `glue.run` is dropped without an error.

Notes on the answer:

- `fields[*]` holds two things: what the screen sends back (`name`, `s_seg`, `k0`, `e_seg`, `k1`, `s0`, `e1`,
  `prefix`, `auto`, `mode`; see `Field.to_wire`) and what Python worked out for display (`start`, `end`, `text`,
  `pattern`, `covers`, `fit`, ...). Python ignores the second group when the fields come back.
- `tokens` is the sample name cut into runs and separators. Selection snaps to it.
- `pieces` is the pattern in order, each piece tagged with its field, so the screen can colour the groups.
  `pattern` is the same pieces joined.
- `unmatched` and `rows` hold the first 8 only (`PREVIEW_ROWS`); `fields[*].values` the first 8 distinct values
  (`PREVIEW_VALUES`). `unmatched_count` and `distinct` are the full counts.
- `start` and `end` are Python string positions (code points). JavaScript counts UTF-16 units. They are equal
  except for characters outside the Basic Multilingual Plane, which is the known limit in the README.

## 5. The engine (`metadata_detect.py`)

### 5.1 Vocabulary

- **Part**: a name is split at `_`, `-`, `.` and spaces. `plate1_B03_s2.tif` has the parts `plate1`, `B03`, `s2`,
  `tif`.
- **Run**: a part is split into blocks of letters, of digits, or of anything else. `08(fld` is `08`, `(`, `fld`.
- **Field**: a labeled stretch of the sample, from run `k0` of part `s_seg` to run `k1` of part `e_seg`. It is
  stored as positions in parts and runs, not as characters, so it finds the same place in a name of another
  length (`B03` and `B3`). `s0` and `e1` mean "from the start of the part" and "to the end of the part".
- **Sample**: the name the user labels. `Context` holds all parsed names, which one is the sample, and the two
  options.
- **Same layout**: the names a field can be compared across. They have as many parts as the sample, or more
  parts that line up with it in exactly one way (`align`: `Far Red` where the sample has `Blue`).
- **Style** (`mode` in the code): how a field's value is written as a pattern.

### 5.2 The styles

For a sample value `B03`:

| Style | Pattern | Rule |
|---|---|---|
| `shape` | `[A-Z]\d{2}` | Same runs, same lengths. A word of 2+ letters that every name shares stays as text |
| `flex` | `[A-Z]+\d+` | Same runs, any length |
| `word` | `[A-Za-z0-9]+` | Any letters and digits; other characters stay as text |
| `words` | `[A-Za-z0-9]+(?: [A-Za-z0-9]+)*` | `word`, repeated across the separators some names hold in that value |
| `list` | `(?:B03\|B04)` | The values seen, longest first |

`auto` tries `shape`, `flex`, `word`, then `words` when some name needs it, and takes the first that reads the
sample and at least 95% (`COVER`) of the same-layout names. If none does, it takes the one that covers the most,
the tightest of them on a tie.
A style chosen by hand sets `auto` to false and sticks.

### 5.3 One call to `detect()`

1. Build the `Context`. Check there are names and the sample has something to label.
2. Read the fields from the request (`Field.from_wire`, which validates them).
3. If the sample changed (`from_index`): try `widen`, else `remap` (5.4).
4. Apply at most one action, in this order of priority: `suggest`, `add`, `remove`, `rename`, `edit`.
5. `analyze`: for each field, where it sits, what the other names hold there, the pattern of every style, how
   many names each style reads, the style `auto` picks.
6. `build_pattern`: the fields as named groups, with the unlabeled text between and around them (5.5). With
   *Anchor* on, tied to the start (`^`) or both ends (`$`) of the name if it would misread the sample.
7. `misread`: a note for each field the pattern still reads somewhere else in the sample.
8. Compile the pattern (`metadata.compile_pattern`) and read every name with it (`extract_metadata`, a `search`,
   not a full match). From that: matched and unmatched names, the preview rows, each field's values, type and hint.

### 5.4 When the sample changes

- **`remap`** carries the fields to the new sample. A name with a different number of parts clears the labels,
  with a note. A field whose pattern no longer fits is widened to the tightest style that fits both names, and
  stays widened (`auto` off).
- **`widen`** handles a name with more parts than the sample that the pattern does not read (a value in several
  words). That name cannot carry the labels, so the sample stays and the fields are widened to read it. The
  answer's `sample_index` is then the old one, and a note says why.

Both return notes, shown under the sample name.

### 5.5 The text around the fields

- **Anchor** (option, on by default): the pattern keeps the whole neighbouring part on each side of the labels,
  so it cannot match elsewhere in the name. A trailing extension is not taken as a neighbour (`_EXTENSION`).
- **Generalize** (option, on by default): digits in unlabeled text become `\d+`. Off, they stay as in the sample.
- Unlabeled letters stay as text when every name has the same ones, and become a letter class when they vary.
- A part that some names build differently (`ctx.varies`) is matched loosely: `[^_\-.\s]+`.
- **The sample is read where it was labeled.** A pattern is looked for anywhere in a name (`search`), so loose text
  could make it match earlier than the labels (`misread`). With *Anchor* on, `build_pattern` then ties it to the
  start of the name (`^` and everything before the labels), and if that is not enough to its end too (`$`).
  When neither reads the sample right, or *Anchor* is off, `detect` adds a note saying what it reads instead.

### 5.6 The proposal (`suggest_fields`)

For each part whose text varies across the names: if 95% of its values look like a known thing (`B03` a Well,
`s1`/`f1` a Site, `t1` a Time, `z1` a Z, `plate1`/`p1` a Plate, `w1`/`c1` a Channel), the whole part gets that
label; otherwise a part with at most 12 different word-like values is a Channel.
Otherwise each varying run is labeled on its own: Row for a letter A to P, the label of the word before it
(`_ALIAS`: `fld 4` is a Field), Column for digits after one capital, else `Part1`, `Part2`. A run where almost
every name has its own value is an identifier and is skipped. A candidate that always changes together with one
already accepted is redundant and is dropped.

### 5.7 Speed

`parse`, `align`, `_runs` and `_shape` are cached with `lru_cache` at module level, each bounded to 100,000
entries so a long session with many sets of names cannot grow without end. The worker keeps the module
alive, so the names are parsed once and the cache serves every later request. `Context` also counts over the
different values a field has, not over every name. The README gives the measured times. Do not add work that
loops over every name once per field per style.

## 6. The page

### 6.1 State

| Where | State | Meaning |
|---|---|---|
| `App` | `result` | The last intake (`names`, `ignored`, `sameStem`, ...) or null. Detect shows when it has names |
| `App` | `run` | Key of the Detect screen: bumped for each new set of names and on *Try again* |
| `App` | `text` | The paste box |
| `MetadataDetect` | `answer` | The last answer from Python: everything drawn comes from it |
| `MetadataDetect` | `options` | `generalize` and `anchor`, sent with every request |
| `MetadataDetect` | `pending` | The selection waiting for a label (`{ start, end }`) |
| `MetadataDetect` | `busy`, `slow`, `error`, `copied` | A request in flight; over 0.4 s (`SLOW_MS`); a message; the copy state |
| `MetadataDetect` | `focused` (a ref) | The control that sent the request and its place, to give the focus back |

There is no other store, no router and no persistence apart from the theme.

### 6.2 Selecting on the sample name

Each character of the sample is a `<span data-i="…">`. A click selects the letters and digits around it
(`cluster`); a drag selects every group it touches (`snap`); the *Or pick a part* buttons list the same groups
(`clusters`) for keyboard and touch. Choosing a label sends `add: { name, start, end }`. Python snaps again
(`add_field`), so the page's snapping is a preview and Python's is the rule.

### 6.3 Names intake (`names.ts`)

Only `.tif`, `.tiff`, `.png`, `.jpg`, `.jpeg` are kept, as HC-Flow's folder listing does. The names are
pasted, one per line; there is no drop or file picker (removed 2026-10-08, see the change log). `App.tsx` ignores a
file dropped on the page, so the browser does not open it in place of the tool. Pasted lines may
be full paths, quoted or not: the file name is kept. Two names with the same stem give a warning
because HC-Flow refuses that folder.

### 6.4 Theme

`public/boot.js`, a plain script that `index.html` loads in its `<head>`, puts a stored choice on
`<html data-theme>` before the first paint. It is a file because the page's policy allows no inline script
(section 9). `theme.ts` reads it, follows the system setting when there is none, and stores a choice under `clamk-tools:theme` in `localStorage`. The hub and
every Clamk tool share that key and the same origin, so the choice holds across them.

## 7. Styles

- Plain CSS, three files, loaded in `main.tsx` in this order: `theme.css`, `detect.css`, `app.css`.
- `theme.css` holds the design tokens (custom properties) and the look of native controls (`button`, `input`,
  `select`, `textarea`) with their variants (`primary`, `quiet`, `danger`, `compact`, `icon`, `with-icon`, `link`).
  **The dark values are written twice**: under `@media (prefers-color-scheme: dark)` and under
  `:root[data-theme="dark"]`. Change both.
- Colours come from tokens only. No colour literal in `app.css` or `detect.css`.
- Class prefixes: `dt-` the Detect screen, `in-` the names step, `is-` the matches table and `field-pop` the "i"
  bubble (names kept from HC-Flow), no prefix for the frame (`frame`, `rail`, `wrap`, `top`, `brand`, `foot`,
  `notice`, `engine`).
- A labeled field's colour is `.g0` to `.g5` (`detect.css`): six colours, given in the order of the fields.
- The rules of the look are in `doc/LLMfeed_VISUAL-IDENTITY.md`, the Clamk Tools brief. It wins over taste.
- The fonts (Figtree, IBM Plex Mono) are npm packages (`@fontsource/*`), imported in `main.tsx` and served with
  the page.

## 8. Tests

| Layer | Where | Runs with | Covers |
|---|---|---|---|
| Engine | `py/tests/test_metadata_detect.py` | `npm run test:py` | `detect()`: proposal, labeling, styles, sample change, options, the answer |
| Glue | `py/tests/test_glue.py` | `npm run test:py` | `set_names`, `run`, the two kinds of failure |
| Units | `src/names.test.ts`, `src/selection.test.ts` | `npm test` | Intake rules; click and drag selection |
| End to end | `e2e/detect.spec.ts`, `e2e/offline.spec.ts`, `e2e/network.spec.ts` | `npm run e2e` | The built site in Chromium, Firefox and WebKit, with the real Pyodide |

- `test_metadata_detect.py` starts with HC-Flow's tests, unchanged. What this tool adds goes in dated sections at the end
  of the file (the older ones say "MetadataMiner", its old name).
- The end-to-end tests run on **`dist/`** served by `npm run preview` under `/ez.Regex/`. Build first, or
  they test the previous build. Pyodide is in `dist/`, so they need no network.
- `e2e/network.spec.ts` holds the privacy promise. One test records every request of a session (the worker's
  too) and fails on one that is not to the site, on anything the policy refused, or on a worker that did not
  start from a blob. The other makes a request to another host from inside the page and from inside the worker,
  and fails unless the browser refuses both. It also checks that each refusal is reported where the first test
  listens. WebKit reports nothing inside a worker: there, a refusal in the worker during the session is not seen.
- `e2e/offline.spec.ts` covers Python that does not load: the download cut, then let through; a browser that
  refuses WebAssembly, played by taking `'wasm-unsafe-eval'` out of the policy of the page it is served; and a page
  opened before a release, played by answering 404 for the worker script, then for the page's own script.
- `PLATE_PATTERN` in `e2e/detect.spec.ts` is the same string as the Python test asserts for the same plate of
  names. The browser and plain Python are held to one answer.
- Every end-to-end test fails on an uncaught page error (`pageerror`): the spec files take `test` from
  `e2e/fixtures.ts`, which adds the check. Two exceptions, written in their tests: while the download is cut,
  Pyodide's loader leaves errors of its own; and WebKit reports a missing worker script as a page error (the
  outdated-page test lets that one message through, nothing else). The worker script is imported with an
  `import` statement, not an `import()` call: WebKit also reports a failed `import()` as a page error, even when
  caught, and an `import()` cancelled by leaving the page fails that way in normal use.
- The end-to-end tests find things by role, label and visible text, plus four test ids: `pattern`, `matched`,
  `engine`, `ignored`, and the `data-i` of a character. Changing a text on the page can break a test.
- The React components have no unit tests: the end-to-end tests cover them.

## 9. Build, CI and deploy

- Vite, `base: "./"`: asset paths are relative, so the site works under any repository name. `appType: "mpa"`:
  one page, no routes. The Python files are imported as text (`?raw`) and travel inside the worker's bundle.
- The Pyodide runtime is served with the site. `pyodideRuntime` in `vite.config.ts` takes the four files
  `loadPyodide` fetches (`PYODIDE_FILES`) from the `pyodide` npm package, pinned to an exact version: the build
  writes them to `dist/pyodide/<version>/`, the dev server answers `/pyodide/<version>/` with them. The worker
  finds the folder beside the one its own script is in (`../pyodide/<version>/`). Both sides take the version
  from the package (its `version` export). It is in the address because GitHub Pages lets a browser keep a file
  for ten minutes: with one fixed address, a release that changes Pyodide could pair the new worker with the
  runtime kept from the release before, and Python would not start.
- The built page carries a Content-Security-Policy, as a `<meta>` tag (GitHub Pages sets no header).
  `contentSecurityPolicy` in `vite.config.ts` writes it at build time: everything from the site itself only,
  WebAssembly allowed, no inline script (the theme script is a file for that reason). The dev server runs
  without the policy: hot reload needs an inline script and a WebSocket.
- **The worker starts from a blob** (`detectClient.ts`): a one-line script that imports the real worker script.
  A worker made from a blob is held to the page's policy; a worker made from a file is held only to the headers
  that file came with, and GitHub Pages sets none. Without the blob, Python could reach any host. Because of it,
  the worker reads its own address from `import.meta.url`, not from `self.location`.
- The policy cannot be the one to refuse a worker started from a file. `worker-src` has to name the site as well
  as `blob:`, because a browser fetches what a module worker imports as a worker script: with `blob:` alone the
  real worker script is refused (tried on 2026-10-02). So `new Worker(new URL(...))`, Vite's usual way, would be
  let through and would escape the policy. `e2e/network.spec.ts` is what fails on it.
- A policy does not stop a navigation (a link, or a script that sends the page elsewhere). It guards against a
  request added by mistake or by a dependency, not against code written to get round it.
- Dev server: port 5183, strict (5173 is HC-Flow's). Preview: port 4173, base `/ez.Regex/`.
- CI (`ci.yml`) on every push to `main` and every pull request: the privacy guard, the Python tests, lint, unit
  tests, build, end-to-end tests. On `main`, the `dist/` that was tested is then published to GitHub Pages.
  **A push to `main` is a release.**
- CI runs the Python tests on the Python version Pyodide ships (3.14 for `pyodide` 314.x).

## 10. Kept in step by hand

Nothing checks these pairs. When one side changes, change the other.

| One side | Other side | If they differ |
|---|---|---|
| `detect()` arguments | `glue.run`, `DetectRequest` | The new key is ignored, silently |
| `detect()` answer | `MetadataDetect`, `DetectField` in `detect-types.ts` | TypeScript shows a field that is not there |
| `MODES`, `MODE_LABEL` (Python) | `STYLES` in `MetadataDetect.tsx` | The field card crashes on a style it does not know |
| Syntax the engine can write | `GUIDE` in `MetadataDetect.tsx`, the symbol list in the README | The "i" beside *Pattern* is incomplete |
| The plate pattern in `test_metadata_detect.py` | `PLATE_PATTERN` and `WORDS` in `e2e/detect.spec.ts` | One of the two suites fails |
| `IMAGE_EXTENSIONS` in `names.ts` | HC-Flow's folder listing; "What counts as a name" in the README | The tool accepts names HC-Flow will not load |
| Six field colours: `.g0` to `.g5` in `detect.css` | `COLORS` in `MetadataDetect.tsx` | A seventh field has no colour |
| `SLOW_MS` (400) in `MetadataDetect.tsx` | The 400 ms delay of the dimmed controls in `detect.css`; "0.4 s" in the README | "Working…" and the dimming do not show together |
| Dark tokens under the media query | Dark tokens under `[data-theme="dark"]` | Dark differs between "system" and "chosen" |
| `--bg` in `theme.css` | `DARK`, `LIGHT` in `e2e/detect.spec.ts` | The theme tests fail |
| `pyodide` version in `package.json` | `python-version` in `ci.yml`; "Needs … Python" in the README | Tests run on another Python than the one shipped |
| Tool name `ez.Regex` and its tagline | `index.html` (title, description, noscript), the header and the "newer version" messages in `App.tsx` and `public/boot.js`, `e2e/`, the README | The page, the tests and the docs name different tools |
| Repository name `ez.Regex` | `preview` script, `playwright.config.ts`, the footer link in `App.tsx`, the README | Preview and tests use a path the site does not have |
| `clamk-tools:theme` in `theme.ts` | The same key in `public/boot.js`; the hub | The theme flashes, or is not shared |
| Texts and labels on the page | The locators in `e2e/`; the words quoted in the README | Tests fail; the README describes another page |
| "About 6 MB" and the measured times | `App.tsx` message, README "Known limits" | The page promises what is no longer true |
| `PYODIDE_FILES` in `vite.config.ts` | The files `loadPyodide` fetches at the pinned `pyodide` version; `pyodide.asm.wasm` in `e2e/network.spec.ts` | Python does not load: every end-to-end test fails |
| `pyodide/<version>/` in `vite.config.ts` | `../pyodide/${version}/` in `detect.worker.ts`; the routes in `e2e/offline.spec.ts`; the address looked for in `e2e/network.spec.ts` | Python does not load; the offline tests block nothing; the network test does not see Python's requests |
| `'wasm-unsafe-eval'` in the policy (`vite.config.ts`) | The text taken out in `e2e/offline.spec.ts`; the browser versions named in `App.tsx` and the README | The refused-browser test fails; the page names the wrong versions |
| A worker starts from a blob (`detectClient.ts`) | Every other `new Worker` added later | A worker from a file is not held to the policy; `e2e/network.spec.ts` fails if it starts during its session |
| The policy in `vite.config.ts` | What the built page loads (scripts, styles, fonts, images, workers) | The browser refuses the new thing, in the build only: the dev server has no policy |

## 11. Decisions that stand

Each can be changed, but only on purpose: ask Clem first, then update this list.

- **Python writes the pattern**, in Pyodide, in a Web Worker. No TypeScript port and no backend. The pattern is
  for Python's `re`, and a JavaScript regular expression is a different language (`(?P<Name>` against `(?<Name>`).
  Running the same code as HC-Flow is what makes the pattern trustworthy there.
- **Names only, nothing uploaded.** No file is opened. Every network request goes to the site itself. No CDN,
  no analytics, no other third party: the README's Privacy section depends on it. The page's
  Content-Security-Policy and `e2e/network.spec.ts` hold it in place (section 9); neither is to be loosened to
  make room for a new request.
- **The names go to the worker once.** Each edit sends only its small request, so the page stays quick at 12,000
  names.
- **Detect needs several names.** There is no single-name mode: the engine learns from what varies.
- **The page is two views in the family's frame**: the names step and the Detect screen. No example names, no
  routes, no stored state apart from the theme.
- **The pattern is copied, not loaded.** It is always written from labels; an existing pattern cannot be edited.
- **Pyodide core only**, exact version pinned, served with the site. No extra Python package (each one is a
  download). Until 2026-10-02 the runtime came from jsDelivr; that was reversed because the CDN's code ran in
  the worker that holds the names, with nothing to check it. The cost is about 13 MB more in each deploy.
- **`metadata_detect.py` stays a drop-in for HC-Flow**: standard library only, module path `app.imaging`, nothing
  about the browser in it. What belongs to the page goes in `glue.py`.
- **`base: "./"`** in Vite, so the site does not depend on the repository name.
- **The tool and the repository are ez.Regex** (2026-10-10, formerly MetadataMiner and `Metadata-Miner`). GitHub
  forwards the old repository address, not the old site address: `…/Metadata-Miner/` no longer works. Renaming
  again breaks the shared links once more; do it on purpose, with section 10's row about the repository name.
- **The look follows the Clamk Tools brief** (`doc/LLMfeed_VISUAL-IDENTITY.md`): tokens, flat hairlines, the rail,
  the header with the name, a quiet "← All tools" link to the hub and the theme switch.

## 12. HC-Flow

Detect was built in HC-Flow, as a dialog of its *Load images* screen backed by an HTTP endpoint. ez.Regex is
that dialog as a page: `glue.py` replaces the endpoint, the folder scan is replaced by the names step, and *Use
this pattern* became *Copy this pattern*. The engine has moved ahead of HC-Flow's copy; the README lists the
differences and what porting them back needs. Until that is done, do not replace `metadata_detect.py` with
HC-Flow's file.
