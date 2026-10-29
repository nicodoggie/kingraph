# Feature examples and portable portraits implementation plan

> **For Hermes:** Use subagent-driven-development with bounded implementation ownership and independent specification/quality review.

**Goal:** Make the playground a useful reference for links/tooltips, grouping, secondary connections, styling/layout, dates/ages and real portable portraits.

**Authorization:** Nico approved this feature-example design, including the necessary bounded image-support slice, on 2026-10-27. Preserve all existing uncommitted viewer/playground/contrast work on `feat/viewer`. No staging, commits, pushes, publication, dependencies, BF changes or unrelated refactors.

**Architecture:** Keep the v1 YAML unchanged. Add an explicitly supplied picture resolver to common render options; the library never guesses paths or fetches/reads assets automatically. Use Viz's supported image-size registration and data-URI image names to produce self-contained SVG, then rasterize that same SVG. Native Node and browser rendering share this path. The playground uses a small allowlisted collection of authored example portraits and displays a short description of each selected example.

**Tech stack:** Existing TypeScript, Viz/Graphviz WASM, native browser image decoding, resvg, Vite/Vitest/Chromium. No new dependency.

## Capability evidence

A parent probe of installed `@viz-js/viz` (Graphviz 16.1.0) rendered an HTML-label image with a PNG data URI as both its source and registered image name. The resulting SVG contains a real `<image>` with that self-contained URI. This proves layout/serialization, not yet browser painting or PNG export; those are acceptance gates below.

## Frozen integration contract

- Export `ResolvedPicture` with `dataUrl: string`, `width: number`, `height: number`, and `PictureResolver = (source: string) => ResolvedPicture | Promise<ResolvedPicture>` from the Node/v1 and browser APIs.
- `GraphRenderOptions.pictureResolver?: PictureResolver` is additive. Validate a supplied resolver as a function. A resolved picture must have positive finite intrinsic pixel dimensions and a base64 PNG/JPEG image data URL; reject unusable metadata with a clear picture-specific error. Let native decoding own actual image validity; do not build another image parser or arbitrary size caps.
- Resolve each distinct nonempty `people.*.picture` once per SVG/PNG render. Validate document/options before invoking caller code. Preserve person/tree metadata seen by date/age adapters and do not mutate caller data. Keep deterministic ordering and existing family color ownership.
- An internal picture-source map may replace only generated image sources during DOT construction; retain one canonical graph builder. The public `renderDot` and `format: 'dot'` retain original references and never invoke the resolver. Existing behavior without a resolver remains unchanged.
- Register each resolved data URI and its size with Viz; its native SVG output embeds the image without custom SVG postprocessing. Share this preparation between Node and browser paths, while preserving each format's existing return types.
- Export browser-only `loadPicture(source)` as an explicit native fetch/decode helper returning `ResolvedPicture`. Support PNG/JPEG, clean up temporary image resources, propagate failed fetch/decode, and avoid DOM access at import time. Fetching happens only when the caller chooses this helper/resolver, never automatically during ordinary render.
- Re-export the existing browser `svgToPng` converter so the playground can download PNG from the exact last successful SVG instead of re-running Graphviz or refetching mutable picture assets. Failed render/download retains the established last-good state behavior.
- The playground resolver accepts only its bundled portrait keys. Unknown keys fail clearly; arbitrary URLs/files from editor input are not fetched. General API consumers can explicitly use `pictureResolver: loadPicture` under browser CORS policies.
- No YAML schemas, viewer/gesture/presentation code or Astro props need changing.

## Task 1: Shared picture preparation and browser loading

**Owner:** Core implementer. **Allowed writes:** `src/pictures.ts`, `src/browser_pictures.ts`, `src/adapters.ts`, `src/render_graph.ts`, `src/svg.ts`, `src/render.ts`, `src/browser.ts`, `src/v1/index.ts`, `tests/pictures.test.ts`, `tests/browser/pictures.browser.ts`.

### RED

Add compact meaningful behavior coverage and witness failure before implementation: real PNG/JPEG resolver-driven SVG/PNG, data/context immutability and per-source reuse, pure DOT not loading images, and representative invalid resolver/metadata/failure handling. Use the existing Vitest environment and existing browser raster techniques. Avoid one test per incidental field/value and avoid static source-string architecture tests.

### GREEN

Implement the frozen contract using the native capabilities above. Preserve public two-argument DOT API via an internal canonical builder if an image-source map is needed. Extend existing boundaries rather than duplicating the complete renderer. Run owning Node/browser cases and changed-file type/lint/format checks. No full builds or full-suite loops while the parallel gallery is incomplete; report any integration dependency honestly.

## Task 2: Feature gallery and original image assets

**Owner:** Gallery implementer. **Allowed writes:** `playground/app.ts`, `playground/style.css`, `playground/examples.ts`, `playground/examples/ages.yaml`, five new YAML files `links.yaml`, `houses.yaml`, `secondary.yaml`, `styling.yaml`, `portraits.yaml`, original avatar source/PNG files under `playground/examples/portraits/`, and `tests/browser/playground.browser.ts`.

### RED

Extend existing playground coverage with the missing example selection/description behavior before implementation. Declarative YAML and art do not need bespoke schema/string tests; render the actual new examples and check their distinguishing effects in one compact scenario.

### GREEN

Keep the original four numeric example values/order and default dated family. Add the five feature examples above with clear labels and useful short “what to try” descriptions. The existing dates example covers the sixth feature and can gain tooltip metadata without changing its dates/tested ages. Use working local detail anchors for person/house links, with small explanatory notes on the page. Explicitly explain that dashed `parents2`/`children2` are alternate styles, not encoded adoption/step semantics. Demonstrate nested houses, readable class colors and a vertical layout. Create two small original illustrated PNG portraits (optional SVG source retained) rather than copying private or unattributed photos. Import them with Vite asset URLs and map stable YAML picture keys to `loadPicture`. Use the exact SVG snapshot for PNG download via `svgToPng`. Keep Render explicit, live presentation switching unchanged, and last-success preview/download retention intact. Cover valid portrait display, unknown-picture failure retention and actual distinguishing gallery output. If the parallel core API is not ready, report that boundary instead of polling/replacing it or pretending GREEN.

## Task 3: Integration, docs and native acceptance

**Owner:** Parent. Read actual child deltas and RED/GREEN output. Update `README.md`, `docs/schema.md` and `docs/getting_started.md` for explicit resolver ownership, Node/browser support, helper/output contracts, portable downloads and new examples. Remove obsolete blanket claims that WASM cannot render pictures, while retaining the no-automatic-local-file-loading distinction. Keep native Graphviz DOT workflow documented. Format the plan and changed docs.

At the stable integration milestone run `npm test`, `npm run test:browser`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build:playground`, and `git diff --check` with `TMPDIR=/home/ensu/.hermes/cache/scratch`. Check installed-package declarations and a real Node/CLI/Vite configured picture consumer proportionately to the shared contract; do not replay the unchanged viewer lifecycle matrix.

Exercise the actual Vite app: select/render every new example, click person and house links, inspect tooltips/groups/dashed edges/layout, view both portraits, retain preview and downloads after bad image input, download real SVG/PNG, verify embedded image payloads and painted portrait pixels after removing server access. Inspect desktop/narrow screenshots. Prefer T3 preview when operational; native Vitest Chromium remains the repository workflow. Leave the existing dev server running.

## Task 4: Frozen review and closeout

**Owner:** Parent plus fresh read-only reviewers. Freeze implementation/doc bytes and protected baseline, run independent spec review against this plan then quality review, resolve concrete important findings and re-review only corrections. Reviewers may inspect code and supplied receipts but not edit, install, build, execute tests or scan BF/home/secrets. Record exact evidence and limits here. No external publication or commit is implied by completion.

## Integration findings and current evidence

- The gallery exposed an existing family-link defect: Graphviz ignored the
  generated cluster `labelhref`. Parent removed the example-only `:house.href`
  workaround, witnessed the actual gallery case fail, then corrected the shared
  family mapping to `href`. The same case passed, including the portrait and
  export assertions. House links now use the first `families[].links` value,
  applying to the native cluster label/frame, with ordinary style precedence.
- Parent full gates passed: 155 Node/integration tests across 17 files,
  26 Chromium tests across four files, typecheck, lint, formatting, playground
  build and diff checks. The existing Graphviz bundle-size warning remains.
- An offline-installed tarball consumer passed actual Node SVG/PNG, DOM-free
  browser SVG, pure DOT, configured CLI, Vite-emitted embedded SVG and installed
  TypeScript declaration checks.
- Actual Vite/Chromium acceptance rendered all nine chooser entries, including
  the five newly added feature examples. Native person and house clicks reached
  the intended local notes. The dates example produced the expected opt-in age.
  Both portraits appeared on desktop and a 390px emulated viewport without page
  overflow. Unknown picture input made no fetch and retained the exact SVG.
- Saved SVG and PNG downloads painted both authored portrait shirt colors while
  network access was disabled. PNG download itself also succeeded offline after
  the failed input. Seven standalone exported artifacts were decoded offline:
  the actual UI SVG/PNG and installed Node SVG/PNG, DOM-free browser SVG, CLI SVG
  and Vite-emitted SVG. All contained the expected painted image markers; there
  were no page errors.
- Independent specification and quality reviews passed with unchanged candidate
  hashes, HEAD and semantic index. Neither reviewer wrote files, executed tests
  or accessed memory. Parent verified 103 protected baseline files unchanged;
  the 14 changed existing paths include the parent-owned plan/evidence update.
- Both implementation workers self-reported one prohibited memory lookup each,
  with no reported use of the results or memory writes. This is a procedural
  scope deviation, not exception-free custody. Parent independently verified
  unchanged HEAD and the semantic staged index; raw index metadata is not used
  as a staging-change assertion.

Temporary baseline, installed consumer and acceptance artifacts are retained at
`/home/ensu/.hermes/cache/scratch/kingraph-examples-swgr2ep_/`.

The live development server remains at `http://127.0.0.1:5173/`. T3 snapshot
automation timed out twice at 15000ms; native Chromium supplied visual/download
acceptance. T3 JavaScript readback subsequently confirmed all nine options and a
successful two-portrait preview. Physical devices and other browsers are not
qualified by these results. Everything remains uncommitted; no BF edits or
external publication occurred.
