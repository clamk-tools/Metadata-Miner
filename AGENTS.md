# Working on ez.Regex

For an LLM assistant or a new contributor. ez.Regex (called MetadataMiner, repository `Metadata-Miner`, until
2026-10-10) is a static page (React, Vite, GitHub Pages) where the
user labels one microscopy file name and Python, running in the browser (Pyodide in a Web Worker), writes the
named-group regular expression for all of them. There is no backend.

## Read first

1. `doc/ARCHITECTURE.md` sections 1 to 4 (the flow and the page/Python contract) and 10 (pairs kept in step by
   hand). Section 5 before touching the Python, 6 and 7 before touching the page, 11 before reversing anything.
2. `doc/CHANGING.md`: the loop, where each kind of change goes (section 4), recipes, the checklist (section 7).
3. `doc/LLMfeed_VISUAL-IDENTITY.md` before any visual change. It is the Clamk Tools family brief: follow it, do
   not edit it here.

## Checks

```
npm run test:py && npm test && npm run lint && npm run build && npm run e2e
```

`npm run e2e` tests `dist/`, so build first. Setup: README, *Developing*. Fixes for a missing Python 3.14 or
Playwright browser: `doc/CHANGING.md` section 3. Say which checks were not run.

## Never

- Build or change a pattern in TypeScript. Python writes it; the page only draws the answer.
- Add a request to another host, loosen the Content-Security-Policy in `vite.config.ts`, or start a Web Worker
  other than from a blob. The README's privacy promise and `e2e/network.spec.ts` depend on it.
- Put anything about the browser in `py/engine.py`, or use a package outside the standard library there: the
  engine stays plain Python, tested in under a second. What belongs to the page goes in `py/glue.py`.
- Change one side of a pair in `doc/ARCHITECTURE.md` section 10 without the other.
- Write a local path, a personal email or a secret in any file: the repo is public (`.githooks/check-privacy.sh`).
- Commit, push or merge without the owner's word. A push to `main` deploys the site.
- Reverse a decision of `doc/ARCHITECTURE.md` section 11 without asking the owner first.

## Done means

Tests for the change (Python first when it is about the pattern), every check passing, and the docs in step:
`README.md` for what the user sees, `doc/ARCHITECTURE.md` for structure, a short entry in `doc/CHANGELOG.md`
for every change. Write in the plain words the docs already use: the owner is a scientist, not a developer.
