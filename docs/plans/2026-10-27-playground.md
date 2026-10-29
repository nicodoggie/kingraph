# Vite Development Playground Implementation Plan

> **For Hermes:** The user approved this design and implementation. Execute one bounded playground slice with subagent-driven-development and risk-proportional tdd-review-workflow evidence. Preserve the existing uncommitted viewer milestone on feat/viewer. Do not commit, push, publish or modify BF.

**Goal:** Provide `npm run dev` as a persistent local workbench for the browser renderer and viewer.

**Architecture:** Plain HTML/TypeScript/CSS under `playground/`, served by existing Vite. Exact development aliases resolve the public `/browser`, `/viewer` and `/viewer.css` imports to current library source, without building dist. Browser API rendering produces the SVG; each successful render mounts a new viewer instead of replacing SVG inside a live viewer. Vitest remains the automated runner, not the interactive application.

**Tech Stack:** Existing Vite, TypeScript, Vitest/Chromium and Kingraph APIs. No new dependencies, framework, editor library or backend.

## Accepted behavior

- One accessible, responsive, dark workbench: editable YAML, example selection, explicit Render button, age checkbox, explicit as-of reference, status/errors and the actual modal/fullscreen-enabled viewer.
- Reuse a few existing example files via native Vite raw imports. Intro contains pictures unsupported by WASM; either omit that example or explain the existing limitation. Include one small fictional full-date sample if needed to make the age option visibly useful; existing example years do not imply exact ages.
- Initial sample renders automatically once. Edits do not invoke Graphviz on every keystroke; Render explicitly snapshots input/options. Do not read today's date implicitly. A fixed visible example reference is acceptable.
- On success, detach the previous viewer and mount a fresh element containing the new trusted SVG. On parsing/render failure, display text diagnostics and retain the last successful preview and downloads. Avoid overlapping render operations by disabling the Render button while busy.
- Download SVG and browser-generated PNG from the last successful render's data/options. Subsequent unrendered or invalid edits must not silently change the downloaded tree. Release download object URLs without revoking them before the browser can consume them. Use ordinary native download behavior.
- Local trusted authoring only; display that boundary. This is not SVG sanitization or a place to execute adapter JavaScript from a textarea. Existing conventional age adapter and pure asOf options composition are sufficient.
- Keep source aliases narrow and share them with the browser test configuration if the playground browser tests consume the same public imports. Do not alias the renderer root or redirect Node/schema/Vite entry points globally.
- Preserve the viewer's standalone dependency boundary: the playground intentionally loads Graphviz because it renders; importing the viewer entry alone still does not.

## Task 1: Native dev configuration and app

**Files:** `vite.config.ts`, `playground/index.html`, `playground/main.ts`, optional `playground/app.ts`, `playground/style.css`, optional `playground/examples/ages.yaml`; modify scripts in `package.json`, `tsconfig.test.json`, `vitest.browser.config.ts`; create `tsconfig.playground.json`.

Use Vite's native root, exact aliases, raw imports, dev reload and build. Add `dev` and `build:playground` scripts. Keep generated playground output in `playground/dist` (already ignored by `dist/`). Extend native lint/format/typecheck scripts to actually include the new authored HTML/CSS/TypeScript/sample/config, without linting or formatting generated output. Keep playground files outside the npm package's existing files allowlist. No dependency/lockfile changes are necessary for script-only edits.

## Task 2: Focused browser behavior

**File:** `tests/browser/playground.browser.ts`.

Use the existing real-Chromium Vitest provider and public API imports. Before implementing behavior, witness a focused failure at the new UI seam. Cover successful render/re-render with a fresh viewer and detached predecessor, invalid YAML preserving last success, and conventional ages/reference forwarding in a representative sample. Use native production parsing/rendering and the actual custom element, not mocks of Graphviz, geometry or Panzoom. Avoid duplicating existing calendar/gesture unit cases or adding a new browser harness. A narrow exported mount function is acceptable to use the same production app logic in a test fixture; no test-only runtime branch.

## Task 3: Documentation and acceptance

**File:** `README.md` development instructions; this plan records final evidence.

Document `npm install`, `npm run dev`, the local URL printed by Vite, source reload without a dist rebuild, Render/download snapshot behavior, trusted input and `npm run build:playground`. Keep this dev-only, not a promise of a hosted playground or another public package API.

Parent qualification after the worker finishes:

1. Read the candidate and focused RED/GREEN evidence; preserve viewer/source custody.
2. Run `npm test`, `npm run test:browser`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build:playground`, `git diff --check` on the stable candidate.
3. Start the actual `npm run dev` server and inspect its browser UI through the T3 collaborative preview first. Exercise sample/render, malformed YAML recovery, age/reference controls, modal, and SVG/PNG downloads. Inspect actual download contents/types and source module requests. Use the existing Chromium automation only if the documented preview fallback condition occurs.
4. Verify the dev page consumes source rather than dist and inspect a real production playground build. Do not delete/rename dist merely to prove aliasing.
5. Independent specification then quality/integration review of this bounded addition; correct substantive findings and rerun affected checks. No need to re-review the unchanged viewer milestone.
6. Leave a working dev server/preview for the user, with its actual URL and process handle; no push/publication or implicit BF integration.

## Ownership and exclusions

The playground implementer may change only the files enumerated above and README. Existing viewer/runtime/CSS, Astro integration, adapters, package exports/dependencies/lockfile and prior tests/plan are immutable inputs. Parent owns this plan, scratch acceptance artifacts, final review and service handoff. Shared files package.json/README already contain uncommitted viewer changes: merge narrowly, never reset/restore/overwrite those changes. No staging or commits.

## Verified completion

Implemented on `feat/viewer` without altering the protected viewer/adapter/Astro
source, lockfile, dependencies or package exports. Changes remain uncommitted;
no push, publication or BF modification was performed.

- `npm run dev` serves the workbench from Vite. At handoff the actual server is
  `http://127.0.0.1:5173/`, tracked as `proc_459a29d26796`; restart later with
  `npm run dev` and use the URL printed by Vite.
- Worker Chromium RED/GREEN: two new UI tests initially failed at the missing
  preview, then passed. Parent extended the age case for an empty optional
  reference: one failure with the required date input, then two passes after
  removing that unnecessary form constraint and omitting an empty asOf option.
- Native gates passed: 152 Node/integration tests, 21 Chromium tests across three
  files, typecheck including the playground, lint, formatting, playground build
  and diff checks. After the optional-reference correction, all affected browser,
  type/lint/format and playground build gates passed again.
- Live browser requests directly consume `src/browser.ts`, `src/viewer.ts` and
  `src/viewer.css`, not Kingraph dist outputs. The source-driven page was tested
  without deleting or renaming dist. Native npm pack dry-run confirms the
  playground and its development configuration are not shipped.
- Actual browser acceptance exercised initial rendering, unrendered-edit
  retention, fresh viewer replacement, invalid YAML retaining last success,
  explicit age/reference forwarding, example selection and recovery, modal/Fit/
  Escape/fullscreen, and a narrow viewport without horizontal page overflow.
- Native downloads were saved and inspected: SVG retained the last successful
  tree and ages despite invalid editor content; PNG had its real file signature,
  dimensions 647×207 and the matching family/age content. No page errors were
  observed. Fresh mobile initialization fitted the SVG to its 358px viewport;
  later viewport resizing intentionally preserves the viewer's existing scale.
- Independent read-only specification and quality/integration reviews passed
  against the frozen playground candidate. The unchanged viewer milestone was
  not reopened for review.

Vite's production build warns about the approximately 1.5 MB Graphviz-containing
JavaScript chunk. Rendering in the browser intentionally includes that engine;
no warning suppression or extra splitting framework was added.

Local temporary evidence is under
`/home/ensu/.hermes/cache/scratch/kingraph-playground-l57t30mv/`, including the
acceptance script/receipt, baseline hashes, downloaded SVG/PNG and desktop/mobile/
modal screenshots. The collaborative preview loaded and inspected the page, but
its snapshot operation timed out twice; installed Chromium automation completed
visual/download acceptance. This is Chromium qualification, not physical-device
or cross-browser coverage.
