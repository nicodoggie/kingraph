# Embedded Viewer Presentation Implementation Plan

> **For Hermes:** The user approved implementation. Use subagent-driven-development and risk-proportional tdd-review-workflow. Preserve all existing uncommitted work on feat/viewer. No commit, push, publication or BF changes.

**Goal:** Add an article-friendly embedded presentation of the existing viewer and let users compare it live with the standard layout in the playground.

**Architecture:** Opt in using `presentation="embedded"` on the same light-DOM custom element. Standard remains the default. Controls/hint overlay the untransformed viewport frame; Panzoom still owns only the diagram. Native Astro exposes `presentation?: 'standard' | 'embedded'`. The playground switches this presentation immediately without rendering or replacing its current viewer.

**Tech Stack:** Existing TypeScript/CSS/custom element/Panzoom, native Astro, Vite and Vitest Chromium. No new runtime dependency, icon library, gesture engine or BF integration.

## Accepted behavior

- Standard layout retains its existing external toolbar/hint and readable text labels. Embedded puts compact zoom/fit/reset controls in one viewscreen corner, expansion/fullscreen actions in the opposite corner, and a subdued hint inside the frame.
- Use icon-only visual buttons in embedded mode while preserving accessible names, native tooltips, keyboard focus and practical touch target sizes. Prefer simple aria-hidden icon spans (not additional diagram-like SVGs) and shared action-button creation over duplicate handler code. Controls remain untransformed HTML and must not initiate diagram dragging or block native links outside their actual interactive bounds.
- Keep the default controls customizable. A caller-supplied toolbar is still caller markup: do not rewrite its labels/icons or assume it has every default action. Provide scoped CSS hooks/theme variables sufficient for a consuming site to adapt the embedded colors; do not introduce a theme framework.
- Keep one live diagram/Panzoom instance across inline, modal and fullscreen. Embed the native modal Close action within the frame without colliding with fullscreen controls. Preserve native Escape/focus restoration, owned fullscreen and cleanup. Fit/view math and calendar/render semantics are unchanged.
- CSS responds to actual container width where necessary. Test both a practical narrow embedded container and a regular desktop frame. Keep overlay controls usable and inside the frame; do not hide essential controls until hover or impose mandatory animations.
- Attribute changes between standard and embedded are live presentation changes, not reconnects. Preserve the same SVG and view state; any actual viewport-size changes still use the existing ResizeObserver behavior.
- Astro's optional presentation prop defaults to standard and selects the same attribute/CSS/runtime. Existing class/style and custom controls slot remain supported. No React island, extra registration mechanism or site-wide styling.
- Add a labeled Standard/Embedded selector next to the playground preview. Default standard. Changing it affects the existing viewer immediately, even with invalid/unrendered YAML, and persists across later successful renders. It must not silently alter source data, age settings, last-success downloads or trigger Graphviz again.

## Task 1: Shared presentation and focused Chromium proof

**Files:** `src/viewer.ts`, `src/viewer.css`, `tests/browser/viewer.browser.ts`.

Write a focused behavioral RED at the layout/interaction seam. Exercise real rendered SVG and actual element rectangles: controls inside the frame, untransformed while diagram zooms/pans, actual clicks change scale without unintended pan, usable narrow layout, and working modal Close/Escape/focus. Preserve existing gesture/link/fullscreen/reconnect cases rather than cloning them for every style. Add only minimal grouping/icon markup needed by the shared controls; no competing gesture or template abstraction. Scope overlay styling to embedded presentation and leave standard/caller controls intact.

## Task 2: Astro and playground

**Files:** `astro/KingraphViewer.astro`, `tests/helpers/astro_fixture.ts`, `tests/astro.test.ts`, `playground/app.ts`, `playground/style.css`, `tests/browser/playground.browser.ts`.

Use native Astro build/check for the new prop and compiled HTML, extending the existing fixture rather than creating another framework test harness. The playground selector sets the existing element's presentation and new viewers inherit the selected mode. Extend one current app behavior case or add one focused case proving switching without replacing SVG/viewer, retaining view state and keeping mode through a later render. Do not change aliases, package exports/dependencies or renderer APIs.

## Task 3: Documentation and qualification

**Files:** `docs/viewer.md`, `README.md`; parent owns this completion record.

Document standard/embedded markup, the Astro prop, live playground selector, theme hooks, custom toolbar behavior and presentation versus rendering. Native gates: `npm test`, `npm run test:browser`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build:playground`, `git diff --check` on the stable candidate. Keep Vite's known Graphviz chunk warning visible; don't treat it as a presentation defect.

Parent inspects the actual running playground through T3 preview first, following its bounded fallback rules if snapshots still fail. Qualify standard/embedded switching, actual overlay geometry, zoom/Fit, modal/Escape/Close/fullscreen, narrow layout and absence of page errors. Leave a working dev server for the user. Browser screenshots supplement, not substitute for, behavioral checks. Independent specification then quality review of this bounded delta; unchanged adapter/schema work and BF are excluded.

## Ownership

The implementer owns only the files enumerated in Tasks 1–3 except this plan. The existing viewer, Astro and playground files are uncommitted but valid baseline: extend them without reset/restore/checkout/clean or full-file clobbering. Parent owns planning/evidence, service handoff and final acceptance. No installs, package/lock changes, staging, commits or BF writes. Existing example contrast fixes must remain intact.

## Verified completion

Implemented on `feat/viewer`, uncommitted. The shared custom element and Astro
wrapper accept `presentation="embedded"`; Standard remains the default. The
playground's **Viewer presentation** selector switches the existing viewer live
and keeps the chosen mode on subsequent successful renders.

- Parent native gates passed: 152 Node/integration tests, 22 Chromium tests across
  three files, typecheck, lint, formatting, playground build and diff checks.
- The worker captured meaningful browser RED/GREEN and a native Astro-checker
  RED for the missing prop before implementation. Parent inspected the resulting
  real-geometry, pointer, native link, narrow-container and modal/focus cases.
- Live Chromium acceptance passed on `http://127.0.0.1:5173/`: same viewer/SVG/view
  state across switching, fixed controls during zoom and background pan,
  modal Close/Escape/focus/fullscreen, invalid-input independence, later-render
  mode retention, 44px narrow targets and a working theme override. No page errors.
- Visual inspection prompted a scoped CSS refinement: a dark canvas/edge makes
  the viewport visibly distinct from the surrounding page, and the hint is a
  subdued, width-capped overlay rather than a full-width light banner. These
  changes do not affect viewport dimensions. All 22 Chromium cases, the actual
  UI acceptance, build and affected formatting checks passed again afterward.
- Independent specification and quality reviews passed. A fresh bounded quality
  review also approved the final CSS/hint/theme-variable delta.
- Baseline hashes confirm renderer/adapters, package/lock/config and example
  contrast fixes stayed unchanged. No dependencies, commit, push, publication
  or BF migration were introduced.

Temporary evidence, including the actual interaction script, receipts and
Standard/Embedded/modal/mobile screenshots, is retained under
`/home/ensu/.hermes/cache/scratch/kingraph-embedded-8u4p4usy/`.
The T3 preview loads the live selector and reads back embedded state, but its
snapshot operation timed out twice; installed Chromium completed visual and
interaction qualification. Physical devices and other browsers remain outside
the evidence scope. The existing Graphviz bundle-size warning remains visible.
