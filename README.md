# ez.Regex

**File name in, regex out.**

Write the metadata pattern for your microscopy image file names by labeling one of them.

You give the tool file names such as `plate1_B03_s2_w1_DAPI.tif`. You say which part is the plate, the well, the
site, the channel. It writes the regular expression that reads those parts from every name:

```
(?P<Plate>plate\d+)_(?P<Well>[A-Z]\d{2})_s(?P<Site>\d+)_w\d+_(?P<Channel>[A-Za-z0-9]+)
```

That is a Python regular expression with named groups (CellProfiler's convention): paste it into CellProfiler's
*Metadata* module, or anything else that reads Python's `re`.

**Open it:** https://clamk-tools.github.io/ez.Regex/

The tool is one of the [Clamk Tools](https://clamk-tools.github.io/). It runs entirely in the browser. It was called
MetadataMiner until 2026-10-10, at `clamk-tools.github.io/Metadata-Miner/` (that address no longer works).

## Using it

The page opens on a single step: the names. Then it shows the Detect screen on them.

1. **Paste your names**, one per line (full paths work, the file name is kept). In Windows Explorer, select the
   files and use *Copy as path*, then paste here.
2. **Check the labels.** The tool proposes labels from what varies across the names. To change them, drag across
   the sample name, click a part of it, or use the **Or pick a part** buttons, then choose what the part is.
3. **Check what it reads.** The table shows the values read from the first names. Names the pattern does not match
   are listed: click one to use it as the sample, and the pattern widens to fit it.
4. **Copy this pattern**, and paste it where you need it.

The cross at the top right of the Detect screen goes back to the names, and so does the tool's name in the header.

The **i** beside *Pattern* is a short reference for every symbol the tool writes (`(?P<…>)`, `[A-Z]`, `\d`, `{2}`,
`+`, `*`, `(?:…)`, `|`, `[^_\-.\s]`, `^`, `$`, `\`), and the two options under the pattern each have an **i** with
an example.

Each label has a pattern style (same shape, flexible, any word, several words, seen values). *Auto* picks the
tightest one that fits at least 95% of the names.

A value that is several words in some names (`Far Red` where the others have `Blue`) is read too: the *several
words* style is picked when enough names need it. When only an odd name or two do, they stay in the unmatched
list; clicking one widens the label to *several words* and keeps the sample. Give the tool several names from the
same folder: with a single name it has nothing to compare, so it proposes nothing and keeps a word such as `DAPI` as
fixed text.

### What counts as a name

Every pasted line is a name, whatever its extension (`.tif`, `.nd2`, `.czi`, ...). A full path is cut down to its
file name, and a name found twice is kept once.

### Light or dark

The page follows the system setting until the switch at the top right is used. The choice is then kept in the
browser, and it is the same one on the hub and on every Clamk tool.

## Privacy

Only file names are read. No file is opened, and nothing is uploaded: the names stay in the page. A pasted full
path is cut down to its file name.

Every network request goes to the site itself: the page, its fonts and the Python runtime (see below) are all
served from it. No CDN, no analytics, no other third party. Two things hold that in place:

- The page carries a Content-Security-Policy: the browser refuses the requests a script makes to another host
  (to load something from it or to send something to it), from the page and from the Python worker. A policy
  does not stop the page from going to another address: the "← All tools" link in the header, the *Source* link in
  the footer, or a script written to send the page elsewhere. It guards against a request added by mistake or by a
  dependency, not against code written to get round it.
- The end-to-end tests fail if a session asks anything of another host, or if the browser lets such a request
  through.

What this cannot cover: a browser extension can read any page you open, and you are trusting the code this site
serves (it is the code in this repository, built by its CI).

## Known limits

- **First visit**: the Python runtime is about 6 MB to download. The browser keeps it afterwards. The names can be
  given while it loads. If the download fails, the page says so and offers to try again.
- **A page left open across a release**: a release replaces the site's files, so a page opened before it (a tab
  the browser restored) cannot load Python or start. It says a newer version was published and offers *Reload the
  page*; the paste box is then empty, since nothing is stored. Pages opened before 2026-10-09 show "Python could
  not be loaded" instead: reload them by hand.
- **An old browser**: the page's policy allows WebAssembly with a word that Safari learned in version 16, Chrome
  in 97 and Firefox in 102. An older one refuses to run Python, and so does a browser with WebAssembly turned
  off (Lockdown Mode on an iPhone or a Mac): the page says the browser cannot run Python, and does not offer to
  try again. Tested by taking the word out of the policy, not on an old browser.
- **Speed with many names**: every change is checked against all the names. Measured on a desktop PC, a change
  takes under 0.06 s with 500 names; with 12,000 names, a change (a label, an option, another sample name) takes
  about 0.2 s and the first suggestion about 1 s. The controls wait while an answer is worked out; they are drawn
  dimmed, and the page shows "Working…", only when it takes longer than 0.4 s. The keyboard focus stays where it was.
- **Only the file name is labeled**, not the names of its folders.
- **A value in several words** is read only from a sample that has it as one word (`Blue`, not `Far Red`), and
  only when there is a single way to line the longer name up with the sample. `plate1_extra_B03` against
  `plate1_B03` could be cut two ways, so that name is left out as before. Moving the sample to a longer name with
  the arrows clears the labels.
- **An existing pattern cannot be loaded** to edit it: the pattern is always written from labels.
- **A pattern that reads the sample in the wrong place.** A pattern is looked for anywhere in a name, so loose text
  around the labels could make it read an earlier stretch (`s1_s2_s3`, labeling the last `3`, read `2`). With
  *Anchor* ticked, such a pattern is tied to the start of the name (`^`), and to its end (`$`) when that is not
  enough. When nothing can pin it down (two loose stretches in one part), or *Anchor* is unticked, a note under the
  sample name says what it reads instead.
- **Characters outside the Basic Multilingual Plane** (an emoji in a file name) shift the selection by one
  character.
- **Browsers**: tested automatically in Chromium, Firefox and WebKit. Safari itself has not been tried on a Mac or
  an iPhone; WebKit is the stand-in.

## How it works

The pattern is written by Python, by one file: `py/engine.py` (the labels, the pattern styles, the proposal), on the
standard library only. It runs in the browser with [Pyodide](https://pyodide.org) (Python compiled to WebAssembly)
inside a Web Worker, so the page never freezes. Running the real Python matters: the pattern is for Python's `re`, and a JavaScript
regular expression is not the same language (`(?P<Name>` against `(?<Name>`, and other differences). The Pyodide
runtime comes from the `pyodide` npm package and is published with the site, in `pyodide/<version>/`.

| Path | Role |
|---|---|
| `py/engine.py` | The engine: writes the pattern |
| `py/glue.py` | What the page calls: keeps the names, runs one step of Detect, answers in JSON |
| `src/python/` | The page's side of Python: the worker that runs Pyodide, the client that talks to it, the messages between them |
| `src/names/` | The names step: the paste box, and names from pasted text |
| `src/detect/` | The Detect screen and its parts |
| `src/theme/` | Light or dark: the system setting, the switch, the stored choice |
| `src/App.tsx` | The page around them: the frame (header, footer), the notices |
| `src/styles/` | The look: `theme.css` holds the tokens and the controls, `app.css` the page, `detect.css` the Detect screen |
| `vite.config.ts` | The build: puts the Pyodide runtime in `pyodide/`, writes the page's Content-Security-Policy |

The look is the Clamk Tools visual identity: the hub's neutrals and blue accent, Figtree and IBM Plex Mono, flat
cards with hairlines, the rail at the top. The six colours that tell the labeled fields apart are the identity's
blue, green, coral and amber, plus a violet and a grey added here (`theme.css`).

## Developing

Needs Node 24 and Python 3.14 (the Python version of the Pyodide release in `package.json`).

```
npm install
pip install -r requirements-dev.txt
npx playwright install chromium firefox webkit

npm run dev        # the page, at http://localhost:5173
npm run test:py    # Python tests: the engine and glue.py
npm test           # TypeScript unit tests
npm run lint
npm run build      # type check, then build into dist/
npm run preview    # dist/ at http://localhost:4173/ez.Regex/, the path it has on GitHub Pages
npm run e2e        # end-to-end tests of dist/ in three browsers (build first)
```

The end-to-end tests run on `npm run preview`, and assert the same pattern string as the Python tests for the same
plate of names, so the browser and plain Python are held to one answer. The Content-Security-Policy is in the
built page only: the dev server runs without it.

### Changing it

Before a change, read these (they are written for a person or an LLM assistant):

| File | What it holds |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Where to start: what to read, the checks, the rules that are never broken |
| [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) | How the tool is made: the flow, the contract between the page and Python, the engine, what is kept in step by hand, the decisions that stand |
| [`doc/CHANGING.md`](doc/CHANGING.md) | How to make a change: the loop, the checks, where each kind of change goes, recipes, the list to go through before it is done |
| [`doc/CHANGELOG.md`](doc/CHANGELOG.md) | What changed, newest first |
| [`doc/LLMfeed_VISUAL-IDENTITY.md`](doc/LLMfeed_VISUAL-IDENTITY.md) | The Clamk Tools look, which every change to the page follows |

### Publishing safely

The repo is public, so `.githooks/check-privacy.sh` keeps a personal email, a private path on a local machine and
secrets out of every commit (identity, message and content). Turn it on once per clone:
`git config core.hooksPath .githooks` (it then runs on commit and push). CI runs it before deploying.
Private terms (an OS user name, a private folder name) go one per line in `~/.git-privacy-terms` or
`.git/privacy-terms`. A line holding an invented example, such as a made-up path in a test, carries the comment marker `privacy-ok`.

`.github/workflows/ci.yml` runs all of the above on every push and pull request, and publishes `dist/` to GitHub
Pages from `main`.
