# Changing ez.Regex

How to make a change, step by step. Written for an LLM-assisted session, and it works the same for a person.
`doc/ARCHITECTURE.md` explains how the tool is made; read its sections 1 to 4 and 10 first.

## 1. Asking for a change

A request that gives these three things can be done in one pass:

- **The names.** A few real file names that show the case (the engine learns from several names, so give at
  least four that differ where it matters).
- **What happens now**, and **what should happen**: the pattern, the labels, or what the page shows.
- **Where it shows**: the names step, the sample name, the pattern, a field card, the matches table.

Example: "With `A - 08(fld 4 wv Far Red - Cy5).tif` among names that have `Blue` there, Channel is not read from
that name. It should read `Far Red`."

## 2. The loop

1. **Find the place.** Use the table in section 4, then the files it names.
2. **Write the test first** when the change is about the pattern: a failing test in
   `py/tests/test_engine.py` with the names from the request. It runs in half a second.
3. **Change the code.** Python first, then the contract (`glue.py`, `contract.ts`), then the page.
4. **Run the checks** (section 3).
5. **Look at it** in the browser (`npm run dev`), in light and dark, and at a narrow width if the layout changed.
6. **Update the docs** (section 5).
7. **Stop before publishing.** Committing, pushing and merging are decided by the owner. A push to `main`
   deploys the site.

## 3. The checks

The five commands are in `AGENTS.md` (*Checks*), and the first-time setup in the README (*Developing*). The first
three take a second each, the build a few seconds, the end-to-end tests about a minute per browser.

- **`npm run e2e` tests `dist/`.** Run `npm run build` first, every time, or it tests the previous build.
- While working, run one browser and one test:
  `npx playwright test --project=chromium -g "part of the test's title"`. Run all three browsers before finishing.
- A failed end-to-end test leaves a trace in `test-results/`: `npx playwright show-trace <path to trace.zip>`.
- A change is not done while a check fails. If a check cannot be run (a browser that is not installed), say so
  in the report.
- Python 3.14 not installed: `uv run --python 3.14 --with pytest python -m pytest` runs the same tests.
- Playwright says a browser executable does not exist: its browsers belong to another Playwright version. Run
  `npx playwright install chromium firefox webkit`; where downloads are blocked, point `launchOptions.executablePath`
  at an installed Chromium in a throwaway config, and delete it afterwards.
- The dev server has no Content-Security-Policy; the built page has one. Something that works on `npm run dev`
  and not on `npm run preview` is usually the policy refusing it (recipe 6.10).

## 4. Where to make a change

| The change | Start in | Also touch |
|---|---|---|
| The pattern written for some names | `engine.py`: `core_pattern`, `analyze`, `build_pattern` | Python tests; the README if a limit moves |
| What happens when the sample changes | `remap`, `widen` | Python tests; the notes shown under the name |
| A message from Python to the user | The `ValueError` text or the `notes` in `engine.py`. Only a `ValueError` reaches the user as a message: anything else is shown as a bug (`glue.run`) | Any test that asserts it |
| How the screen waits for Python (disabled controls, dimming, focus) | `call` and the `focused` effect in `DetectScreen.tsx`; the 400 ms rule in `detect.css` | `SLOW_MS` pair (`doc/ARCHITECTURE.md` section 10); the focus and dimming tests in `e2e/detect.spec.ts` |
| A new pattern style | Recipe 6.1 | |
| A new option or action on the screen | Recipe 6.2 | |
| Something new shown from the answer | Recipe 6.3 | |
| The preset labels | Recipe 6.4 | |
| Which names are accepted | Recipe 6.5 | |
| A text, a layout, a control on the Detect screen | `src/detect/`, `detect.css` | `e2e/` locators; the README if it quotes the text |
| The names step, the notices, the frame | `src/names/`, `App.tsx`, `app.css` | Same |
| What the page says while Python loads or fails | `src/python/PythonStatus.tsx` | Same; the tests in `e2e/offline.spec.ts` |
| Colours, type, spacing, a control's look | Recipe 6.6 | |
| The Pyodide version | Recipe 6.7 | |
| The repository name or the site's path | Recipe 6.8 | |
| A new dependency | Recipe 6.9 | |
| Something new the page loads (an image, a font, a script, a style) | Recipe 6.10 | |

## 5. The docs to update

| When | Update |
|---|---|
| Anything the user can see or that changes a limit | `README.md` (*How to use it*, *Known limits*) |
| Every change | A line in `doc/CHANGELOG.md` |
| A file added, moved or given a new role; the flow or the contract changed | `doc/ARCHITECTURE.md` (sections 2 to 9) |
| A new pair that has to be kept in step | `doc/ARCHITECTURE.md` section 10: a test in `test/pairs.test.ts` (10.1) when one can hold it, else a line in 10.2 |
| A decision made or reversed | `doc/ARCHITECTURE.md` section 11 |
| A new kind of change that took some finding | A recipe here |

Write the docs in the same plain words as the README. Do not write a local path, a personal email or a private
name in any file: the privacy guard refuses the commit (README, *Publishing safely*).

## 6. Recipes

### 6.1 A new pattern style

1. `engine.py`: add it to `MODES` (the order is from tightest to loosest: `remap` and `widen` use it as
   a rank), to `MODE_LABEL`, and to `core_pattern`. Add it to `AUTO_ORDER` only if *Auto* may pick it.
2. If the style writes syntax the tool did not write before, add it to `GUIDE` in `help.tsx` and to the
   symbol list in the README.
3. Tests: Python (the pattern, what *Auto* picks, how many names it covers), and one end-to-end test that picks
   the style in the select. The page needs no change: the answer's `styles` lists it.
4. README: the table of choices under *How to use it*, *Fine-tuning*.

### 6.2 A new option or action

An option is sent with every request (`generalize`, `anchor`). An action is sent once (`add`, `remove`, `rename`,
`edit`).

1. `detect()`: a keyword argument with a default that keeps today's behaviour.
2. `glue.run`: read the key from the request and pass it. A key missing here is dropped without an error
   (`test/pairs.test.ts` catches it).
3. `contract.ts`: the field in `DetectRequest`.
4. The page: an option goes in `Options` and gets its checkbox in `PatternOptions.tsx` (`DetectScreen.tsx` sends
   the options with every request); an action is a `call({ … })` from its control in `src/detect/`.
5. Tests: `test_engine.py`, `test_glue.py` (`test_run_takes_the_options…`), and an end-to-end test.
6. If the option has a checkbox, give it an "i" bubble with a worked example, like the two that exist.

### 6.3 Something new in the answer

1. `detect()`: add it to the returned dictionary, or to each entry of `out_fields`.
2. `contract.ts`: `DetectAnswer` or `DetectField`, with a comment that says what it is.
3. Draw it in `src/detect/`.
4. `test_the_answer_describes_the_sample_each_field_and_what_the_folder_gives` asserts the shape of the answer.

Keep the answer small: it is rebuilt and sent on every edit. Lists are cut to a preview (8) with a full count
beside them.

### 6.4 The preset labels

- The buttons: `PRESETS` in `LabelPicker.tsx`.
- What the engine knows about a name is separate, in `engine.py`: `NUMERIC_NAMES` (the value skips its
  letters by default: `s2` reads `2`), `_hint` (the
  warning when the values do not look like the label).
- A field name must be usable as a group name: a letter, then letters, digits or `_` (`check_name`).

### 6.5 Which names are accepted

- Every pasted name is kept (`namesFromText` in `names.ts`, with `names.test.ts` and *What counts as a name* in the
  README). A filter would go there.
- `_EXTENSION` in `engine.py` is another thing: it tells the engine which last part of a name is an extension, so
  anchoring does not take it as a neighbour.

### 6.6 The look

1. Read `doc/LLMfeed_VISUAL-IDENTITY.md`. It gives the tokens, the sizes and what must stay the same across the
   Clamk tools.
2. A colour, a radius or a font is a token in `theme.css`. Dark values are written twice there: change both
   blocks (`npm test` fails until they agree). Use tokens in `app.css` and `detect.css`, never a colour literal.
3. A control's look (button, input, select) is in `theme.css`; reuse the variants before adding one.
4. Check light and dark, a narrow window (the layout stacks under 860 px), keyboard focus, and
   `prefers-reduced-motion`.
5. If `--bg` changes, update `DARK` and `LIGHT` in `e2e/detect.spec.ts` (`npm test` says so).
6. A seventh field colour needs a `.g6` in `detect.css`, its tokens in `theme.css` (light and both dark blocks),
   and `COLORS` changed in `DetectScreen.tsx` (`npm test` fails until the last two agree).

### 6.7 The Pyodide version

1. `package.json`: the exact version of `pyodide` (no `^`), then `npm install`. The build takes the runtime from
   the package (`pyodideRuntime` in `vite.config.ts`) and puts it in `pyodide/<version>/`; the worker reads the
   same version from the package. Nothing else names the version.
2. If the Python minor version changes: `python-version` in `.github/workflows/ci.yml`, and "Needs Node … and
   Python …" in the README (`npm test` fails until both say it).
3. Run everything, including the end-to-end tests in the three browsers. If Python does not load, the new
   version fetches a file that `PYODIDE_FILES` in `vite.config.ts` does not list: the browser's network tab on
   `npm run preview` shows the 404.
4. If the download size changed noticeably, update "about 6 MB" in `PythonStatus.tsx` and in the README.

### 6.8 The repository name or the site's path

`vite.config.ts` needs nothing (`base: "./"`). Change `/ez.Regex/` in the `preview` script of
`package.json` and twice in `playwright.config.ts`, the *Source* link in the footer (`App.tsx`), and the address
in the README.

### 6.9 A new dependency

- A runtime dependency must not make a network request to another host. The README promises that every request
  goes to the site itself; the page's policy refuses the rest and `e2e/network.spec.ts` fails on it.
- A Python package cannot be added lightly: Pyodide would download it on every first visit. The engine uses the
  standard library only.

### 6.10 Something new the page loads

The built page's Content-Security-Policy (`contentSecurityPolicy` in `vite.config.ts`) allows the site's own
files and nothing else. The dev server has no policy, so a refusal shows only on the build.

1. Keep the new thing on the site: a file in `src/` or `public/`, or an npm package that ships its files (as the
   fonts do). Not a URL on another host, and not a `data:` address either.
2. `npm run build`, `npm run preview`, and look at the browser's console: a refusal is an error that names the
   directive (`img-src`, `style-src`, ...).
3. What the policy refuses without saying much: a `style="…"` attribute written as HTML (React's `style={{…}}`
   is fine), any inline `<script>` (the first script is a file, `public/boot.js`, for that reason), `eval`.
4. If a directive has to be widened, widen that one only, and never to another host: that reverses a decision of
   `doc/ARCHITECTURE.md` section 11.
5. `e2e/network.spec.ts` must still pass in the three browsers. It also fails when the policy refused something
   during its session.
6. A new Web Worker starts from a blob, as `client.ts` does. The policy lets a worker start from a file of
   the site, and that worker would not be held to the policy (`doc/ARCHITECTURE.md` section 9).

## 7. Before saying it is done

- [ ] The request's example gives the expected result, in a test.
- [ ] `npm run test:py`, `npm test`, `npm run lint`, `npm run build`, `npm run e2e` pass. What was not run is said.
- [ ] Every pair of `doc/ARCHITECTURE.md` section 10 touched by the change is in step.
- [ ] The README says what the tool now does; `doc/CHANGELOG.md` has a line; the other docs of section 5 are
      updated where they apply.
- [ ] No request to another host, no file opened, nothing stored apart from the theme.
- [ ] Nothing is committed or pushed without the owner's word.
