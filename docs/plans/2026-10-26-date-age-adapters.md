# Date and Age Adapters Implementation Plan

> **For Hermes:** Implemented with subagent-driven-development and tdd-review-workflow's risk-proportional evidence rules. The user approved this design, including CLI config loading and asOf composition, before implementation.

**Goal:** Let consumers customize date presentation and age policy without changing the v1 family document or teaching Kingraph application-specific calendars and life histories.

**Architecture:** Add render-scoped, synchronous Date and Age adapters to the shared DOT pipeline. Date formatting and age calculation are independent policies: consumers can share their own calendar library between them, but Kingraph does not require calendar values to become JavaScript Dates. Node, browser and Vite accept the same configuration object, and the CLI can explicitly load that object from a trusted JavaScript module. A pure asOf composition helper supplies the reference date without mutable renderer/plugin state.

**Tech Stack:** Existing TypeScript/ESM, Zod v1 input validation, Vitest, Graphviz WASM and Vite integration. No new runtime dependency or framework.

## Status and boundaries

This iteration is implemented on `feat/date-age-adapters` in the main checkout. The user approved a local commit and explicitly deferred pushing. There was no release, viewer work or Bastion Falls modification. The design and implementation sequence below record the accepted scope.

### Completion evidence

- Parent verification: `npm test` passed 150 tests across 14 files; `npm run test:browser` passed all 4 real-Chromium tests. Build, typecheck, lint, format and whitespace checks passed.
- Independent core specification and quality reviews passed. The only core quality finding, Graphviz expanding literal backslash substitutions in adapter text, was reproduced, corrected and covered by the existing real-SVG regression; focused re-review approved the fix.
- Independent CLI/Vite/documentation specification and final integration quality reviews passed. Parent also removed a host-specific CLI test-fixture path and verified Vite rejects malformed options before spreading them.
- `npm pack` and an offline installed consumer verified root/v1/browser/Vite exports, custom-calendar and metadata policies, reference composition, SVG/Node PNG, installed CLI config imports and precedence, and native Vite production/dev raw/URL behavior. A TypeScript consumer compiled against the installed declarations with literal-format return types.
- Task-local installed-package evidence is under `/home/ensu/.hermes/cache/scratch/kingraph-adapter-acceptance-qpjw9482/` (`receipt.json`, `acceptance.mjs`, `consumer.ts`, generated SVG and packed tarball). This scratch evidence is not a tracked or published artifact.

Kingraph owns the adapter interfaces, conventional defaults, composition into labels/tooltips and forwarding through its public entry points. The consuming application owns its calendar library, resurrection/undeath rules and interpretation of extra person metadata. BF is a motivating consumer, not a dependency or write target.

The later sequence remains: optional exported KingraphViewer, then references and navigation between trees. Explicit adoptive parentage and derived kinship are separate data-model work; there is no committed v2 schema in this plan.

## Current code and constraints

- `src/render_graph.ts:14` validates and renders a tree; it currently accepts no options. Person labels and tooltips are assembled at lines 139–224.
- Birth/death years and tooltip dates are hardcoded. Four-digit birth/death numbers and strings mean years; other values follow JavaScript Date conversion. Tooltips use en-US and UTC. `created_at` does not use the four-digit-year shortcut.
- There is no age calculation or age display today. Preserved metadata such as `person.age` currently has no rendering effect and must remain inert unless an adapter explicitly interprets it.
- `src/render.ts:6` and `src/browser.ts:7` define separate platform options and both call the same DOT renderer. Node's literal-format overloads must be widened as well as its implementation signature.
- `src/vite.ts:8` currently exposes `kingraph()` with no options and calls the Node renderer during module loading.
- `src/cli.ts` exposes only format/help/version; its existing input/output and exit behavior must remain intact.
- Public root exports flow through `src/v1/index.ts`. Browser-conditioned root and `/v1` exports resolve to `src/browser.ts`, so both barrels must expose the browser-safe adapter API.
- `src/v1/schemas.ts` already accepts `Date | string | number` for known date fields and retains arbitrary metadata. YAML timestamps become Dates before render adapters run; quoted custom-calendar strings remain strings. Adapters must not silently change YAML parsing or widen known fields to arbitrary objects.
- `docs/schema.md:198` documents permissive date-string parsing and invalid-date output. Changes to that behavior must be explicit rather than described as exact legacy preservation.

## Alternatives considered

1. **Recommended: two small presentation/policy adapters.** Date formatting and age interpretation have separate interfaces. A consumer reuses its own calendar functions inside both. This meets the immediate need without an opaque parsed-date protocol, generic type parameters through every renderer, or a built-in fantasy ontology.
2. **One combined life-history adapter.** Easy to wire, but forces a date-formatting-only consumer to own age behavior and obscures the distinction between calendar arithmetic and rules about death/resurrection.
3. **Full CalendarAdapter with parsing, precision, ordering and duration operations.** Useful if Kingraph later performs date-based sorting, timelines or event queries, but not needed for today's rendering. Do not design that framework speculatively. In particular, do not force a fictional date through a Gregorian intermediary merely to simplify the API.

## Proposed public contract

### Shared types and options

Create `src/adapters.ts` for the public types and built-in adapter implementations. Export these through `src/v1/index.ts` and `src/browser.ts`; the root inherits the v1 exports. No new package subpath is needed.

Proposed symbols:

- `DateValue`: the existing known date-field union, derived from `NonNullable<Person['born']>` rather than a separate schema definition.
- `PersonContext`: readonly `id: string`, `person: Readonly<Person>` and `tree: Readonly<FamilyTree>`. Readonly is a TypeScript contract, not runtime deep-freezing or a security sandbox. Callbacks must not mutate inputs or adapter state.
- `DateContext`: PersonContext plus `field: 'born' | 'died' | 'created_at'`.
- `DateAdapter`: an object with synchronous `formatYear(value: DateValue, context: DateContext): string | undefined` and `formatDate(value: DateValue, context: DateContext): string | undefined` methods.
- `AgeContext`: PersonContext plus optional `asOf: DateValue`.
- `AgeAdapter`: a synchronous function `(context: AgeContext) => string | undefined`.
- `GraphRenderOptions`: optional `dateAdapter: DateAdapter`, `ageAdapter: AgeAdapter` and `asOf: DateValue`.
- `defaultDateAdapter` and `defaultAgeAdapter`: exported conventional implementations.
- `asOf(value: DateValue): Pick<GraphRenderOptions, 'asOf'>`: a pure composition helper returning a fresh options fragment containing the supplied reference value. It does not parse the value, consult the clock, enable age display or mutate a configuration/plugin. Use the same public DateValue runtime validation as the direct asOf option rather than a second date grammar.

`renderDot(tree, options?: GraphRenderOptions)` remains synchronous. Node RenderOptions and BrowserRenderOptions extend GraphRenderOptions while preserving their existing format, scale and return-type distinctions. All literal-format overloads accept the new common fields, not just the catch-all overload.

`dateAdapter` defaults to defaultDateAdapter. **Age display is opt-in:** omission of `ageAdapter` means no age text and no clock dependency. Opt in using `ageAdapter: defaultAgeAdapter` or a custom function. No adapter registry, singleton setter, environment variable or automatic discovery from YAML metadata.

### Shared configuration and reference-date composition

Use GraphRenderOptions as the shared configuration shape rather than introducing a second adapter-config type or a stateful builder. A JavaScript configuration module default-exports an object containing dateAdapter, ageAdapter and optionally asOf. TypeScript callers may use `satisfies GraphRenderOptions`; a defineConfig wrapper is not required for this shape.

The proposed Vite usage is `kingraph({ ...config, ...asOf(referenceDate) })`, where the consumer imports config normally in vite.config and imports asOf from the browser-safe core API. Direct rendering uses the same composition, for example `render(tree, { ...config, ...asOf(referenceDate), format: 'svg' })`. Plain `asOf: referenceDate` remains equally supported; the helper is convenience, not a mandatory configuration protocol. These are proposed API examples, not existing exports.

Prefer this pure options-fragment helper over `kingraph(config).asOf(value)`: the latter adds a fluent API to an object that must already satisfy Vite's Plugin contract and unnecessarily ties date composition to one consumer surface. Object spread uses ordinary last-wins precedence. A reference override does not discard either adapter, and reusing a base config for two reference dates must not change the base or the other result.

Reference dates are evaluated explicitly by the consuming application before composition. Do not add a clock callback or per-person reference-date factory in this iteration. A consumer needing a dynamically calculated value can call its own function and pass the result to asOf. Vite renders static output at build/dev transformation time; this helper does not promise browser-time age updates or trigger HMR when an external clock changes.

### Date adapter behavior

- `formatYear` supplies the birth/death value inside the existing `*…` / `†…` label; `formatDate` supplies the date text in existing Born/Died/Added tooltip sections.
- The renderer still owns those prefixes, punctuation and layout. Formatting dates is not a general translation or raw-markup hook.
- Both methods receive the raw schema-valid value and field/person/tree context. A custom adapter can handle quoted fictional dates or consult preserved metadata without normalizing the tree.
- All known date fields use the adapter. `created_at` uses formatDate only. Its conventional behavior remains distinct from birth/death year-only values through `context.field`.
- `undefined` or an empty result omits that particular date fragment, including its prefix; it does not invoke the Gregorian default as a fallback. If one side of a lifespan is omitted, render the other side without a dangling separator.
- Built-in formatting retains existing meaningful four-digit year and UTC/en-US output. It does not newly interpret every number as a year or reject unfamiliar strings at schema-validation time.
- Two explicit corrections accompany extraction: unsupported/unparseable values omit their date fragment instead of emitting `NaN`/`Invalid Date`; numeric zero is treated as a present value, not dropped by a truthiness check. Under the conventional adapter zero retains the existing non-four-digit epoch-millisecond meaning. A custom adapter may interpret it as its calendar's year zero.
- Empty strings produce no default date output. Valid zero values and custom formatted output must be able to activate a rich label.

### Age adapter behavior

- Receive the complete person record, including preserved unknown metadata, its stable tree-local ID, the tree and the explicitly supplied asOf value. Do not reserve new document fields such as age, lifeHistory or undead.
- Return complete plain-text age wording, or undefined/empty text to omit it. Returning wording rather than a mandatory number permits ranges, approximate ages, species-specific units, separate biological/chronological ages and resurrection-aware descriptions without additional renderer flags.
- Render the result once per explicit person record, as a small text row after the lifespan row and as a separate tooltip line. Reuse that result rather than calculating twice. Returned text can activate a rich label even when no conventional birth/death fields are present.
- Do not invoke person adapters for implicit Graphviz-only references absent from `people`; doing so would synthesize metadata nodes and change existing graph behavior.
- Default age is **conventional Gregorian elapsed age**, not whatever calendar the selected date formatter happens to display. Passing a custom Date adapter does not silently replace the arithmetic of defaultAgeAdapter. A custom-calendar consumer should pass both adapters, sharing its own calendar implementation in closures/imports. Document this prominently.
- No hidden wall clock. A living person's conventional age requires asOf; without it, omit age. A deceased person's known birth/death dates can produce age at death without asOf.
- With asOf, use death as the endpoint only when death is on/before asOf; otherwise calculate to asOf. This handles a conventional historical reference without inferring custom lifecycle events. A known but imprecise death date prevents an exact built-in age rather than silently treating the person as living.
- Compute completed Gregorian years from UTC calendar dates, not a millisecond/year constant. The proposed leap-day rule is that a February 29 birthday advances on March 1 in a non-leap year.
- Only produce an exact built-in age when the required endpoint and birth have day precision. Year-only values, invalid/unsupported strings, missing birth and an endpoint before birth yield no age. Birth on the endpoint yields age zero. Do not invent January 1 for a year-only birth or infer uncertainty ranges in this iteration.
- For age arithmetic, support valid Date values, non-four-digit numeric epoch timestamps, strict valid ISO calendar-date strings, and ISO timestamps with an explicit UTC/offset designator. Do not rely on locale-dependent Date parsing or accept normalized impossible dates as exact dates. Preserve the distinction between full input precision and legacy year-only values before parsing.
- Built-in text is `Age: N` or `Age at death: N`. A custom adapter owns its wording and can reuse or wrap defaultAgeAdapter when appropriate.

### Failure and text handling

A formatter returning undefined means an expected unsupported/unknown date, not a failed callback. A callback throwing is a rendering failure: preserve its cause and add safe context naming the adapter operation and person ID/date field. Never silently fall back to another calendar or omit an unexpected callback error.

Validate the new public option shapes at the shared entry boundary: reject null/array/non-object options, malformed Date adapters, non-function Age adapters and asOf values outside the existing valid Date/string/finite-number union with useful TypeErrors. Unfamiliar strings remain valid raw reference values for custom adapters; do not impose Gregorian parsing on them. Reject callback results other than string/undefined; this also catches accidentally async adapters rather than rendering `[object Promise]`. Reuse existing tree validation for data; do not create a second person/date schema or inspect arbitrary metadata.

Adapter output is **text, not DOT or HTML**. Encode it for its actual sink: XML/HTML-label escaping for table content and quoted DOT-string escaping for tooltip text. Reuse existing helpers only if they implement the required escaping; `apply_style.ts`'s value serialization is not automatically an HTML escaper. A representative real Graphviz render must prove quotes, ampersands, angle brackets and line breaks do not corrupt generated output. This does not turn the whole existing trusted-authoring renderer into a sanitizer, and it does not authorize a global escaping rewrite of legacy name/style/picture paths.

### Surface wiring

- **Direct DOT / Node / browser:** forward common graph options unchanged before the shared DOT render. Keep all adapters browser-safe, including conventional defaults. No Node APIs in the adapter import graph.
- **Vite:** extend `kingraph(options?: GraphRenderOptions)`, accepting the same object a CLI config module exports, composed with asOf as needed. The consumer imports the module through normal Vite config imports; the plugin does not receive a config filename or implement another module loader. Adapters execute in the Node config/build/dev process, never serialize into generated client modules. Keep SVG-only output, URL/raw imports and native asset/HMR behavior. Options apply to all trees handled by that plugin instance; there is no per-file resolver callback in this iteration. Readonly context includes tree metadata if a consumer needs to select behavior.
- **CLI:** add `--config <path>`, `--age` and `--as-of <value>`. Explicitly load one trusted JavaScript config module per invocation, before rendering any input. Resolve a relative path from the invocation's working directory and import its file URL with native Node ESM; relative imports inside the module resolve from that module normally. Support .js under Node's normal package-module rules and .mjs; do not introduce TS transpilation, config discovery, remote imports, custom require interop, module factories or a watcher. The default export must be a GraphRenderOptions object; use the same shared option validation and add the config filename to load/export/validation diagnostics. Native module evaluation may be async, but the exported adapter callbacks remain synchronous. Config loading/evaluation is execution of trusted local code, not a sandbox or a family-document feature.
- **CLI precedence:** begin with the loaded config or an empty object. An explicitly provided --as-of replaces config.asOf with that raw string; omission preserves config.asOf and never consults today's date. --age selects defaultAgeAdapter only if no ageAdapter is already configured, so it cannot accidentally replace a custom lifecycle policy. A configured ageAdapter enables age rendering without --age. --as-of alone does not enable age output. No new disable flag is proposed. Unknown/imprecise dates follow the selected adapter's policy, not a separate CLI Gregorian parser. Document full ISO reference dates for the conventional default and quoted calendar-specific strings for custom policies. The minimal custom-calendar command is `kingraph family.yaml --config ./kingraph.config.js --as-of '14 Frostwane 843'`.
- **Schema/YAML:** unchanged. Functions belong in runtime configuration. Object-shaped fictional dates remain possible only in unknown metadata read by a consumer adapter; known born/died fields keep their v1 union. Document quoting to prevent YAML timestamp conversion when a custom calendar requires the original string.

## Implementation sequence (completed)

Each executable slice uses focused behavioral RED → minimal GREEN when introducing a new seam. Keep its failing test and implementation together; do not commit or hand off an intentionally red shared tree. Types, exports, documentation and ordinary configuration use native type/format/build evidence, not bespoke source-string assertions. Do not add a test for every helper or duplicate calendar policy cases across every platform.

### 1. Date formatting extraction

**Files:** create `src/adapters.ts` and `src/adapters.test.ts`; modify `src/render_graph.ts` and `src/render_graph.test.ts`.

1. Extend current graph regressions for a custom-calendar Date adapter affecting year labels, full Born/Died/Added dates and suppression. Include raw values/context, year zero and invalid-date omission in the relevant cases.
2. Run `npx --no-install vitest run src/adapters.test.ts src/render_graph.test.ts` and observe the intended missing-hook/behavior failures, not collection errors.
3. Implement the default formatter, Date context, graph options and per-person integration. Preserve the source input and existing unrelated ordering/style behavior.
4. Verify focused GREEN. Exercise adapter-produced punctuation through real SVG in step 3 below rather than building a second DOT parser for tests.

### 2. Age policy and deterministic presentation

**Files:** extend `src/adapters.ts`, `src/adapters.test.ts`, `src/render_graph.ts` and `src/render_graph.test.ts`.

1. Add focused cases for completed-year boundaries/leap day; exact versus year-only dates; living/deceased/reference-endpoint selection; and omission for unknown/future birth. Parameterize distinct policy branches rather than near-identical value variations.
2. Add one custom age policy consuming unknown life-history metadata and returning nonnumeric wording without born/died. Assert label/tooltip agreement and one invocation per explicit person.
3. Witness focused RED, implement defaultAgeAdapter and optional row/tooltip integration, then focused GREEN with the same command as step 1.
4. Verify no adapter means no age, authored age metadata stays inert, and repeated renders with different options do not leak state or mutate the input.

### 3. Public Node/browser API and real renderer proof

**Files:** modify `src/adapters.ts`, `src/adapters.test.ts`, `src/render.ts`, `src/browser.ts`, `src/v1/index.ts` and `tests/render.test.ts`; extend `tests/browser/render.browser.ts` only for the actual browser handoff.

1. Add a representative custom-adapter flow through public renderDot, Node render and browser render, with literal-format return types checked through expectTypeOf/typecheck. Cover the new malformed-option/async-result failures at the shared boundary, not a duplicate matrix in each wrapper. Add one focused composition test proving asOf preserves a fictional reference value and gives two independent overrides of the same adapter config without mutation or automatic age opt-in.
2. Witness RED; implement the pure asOf helper, forward graph options and export the adapter types/defaults/helper consistently from the root/v1/browser entries.
3. Run `npx --no-install vitest run src/adapters.test.ts tests/render.test.ts tests/schema.test.ts` to GREEN. Include a real Graphviz SVG output assertion for special-character adapter text so a string-only DOT assertion cannot mask broken syntax. Preserve schema/export separation and root-v1 parity.
4. Extend one existing real-Chromium SVG test to display custom date and age text through the browser import path. Existing PNG tests continue proving rasterization; no adapter-specific PNG snapshots or cross-browser campaign.

### 4. Vite configuration forwarding

**Files:** modify `src/vite.ts` and `tests/vite.test.ts`.

1. Extend the native build/dev fixture to accept plugin options. Add one representative policy fixture using the shared config composed with asOf, proving custom text and the reference override reach raw SVG and the emitted URL asset without adapter code entering client modules; retain existing SSR/base-path/HMR cases rather than cloning their entire matrix. Keep config-path loading out of the plugin; normal Vite imports own that handoff.
2. Witness RED with `npx --no-install vitest run tests/vite.test.ts`.
3. Add typed plugin options and forwarding to the existing renderer. Run that focused suite to GREEN. No custom cache, watcher or build-context serialization.

### 5. Explicit CLI configuration and reference overrides

**Files:** modify `src/cli.ts` and `tests/cli.test.ts`.

1. Extend built-CLI coverage for help discovery, an explicit full-date --age/--as-of result, and no implicit living age when asOf is absent. Add a task-owned scratch config fixture with a default-exported object and a relative helper import; invoke the built CLI with an explicit config path and custom-calendar reference. Prove configuration enables the custom age policy without --age, a CLI reference overrides its configured reference, omission preserves the configured reference, and --age does not replace the custom adapter. Keep existing stdin/file/format/error tests.
2. Build with `npm run build` before `npx --no-install vitest run tests/cli.test.ts`; the CLI tests execute dist rather than source transforms. Witness behavioral RED before implementation, rebuild after the CLI change, then focused GREEN.
3. Wire Meow's native flags and native Node config import to the shared options. Reuse shared validation; do not add a separate CLI age/date calculator or generic config-loading framework.
4. Cover the distinct config failure paths: missing module, evaluation/import failure and a non-object default export or malformed adapter. Errors must name the config path, return a nonzero exit and produce no rendered stdout when loading fails. Do not duplicate the shared adapter validation matrix in CLI process tests. Config fixture files remain task-owned temporary files under the configured scratch root, not shipped sample executable assets.

### 6. Documentation, packaging and stable-milestone acceptance

**Files:** update `README.md` and `docs/schema.md`. No package.json/export-map change is expected; add one only if actual packaging proof establishes a need.

Document default-preserving usage, explicit conventional age opt-in, the shared config object, asOf composition/no-clock behavior, precision and leap-day rules, the custom-calendar pairing requirement, quoted YAML values, callback failure semantics, Vite config imports, trusted CLI config module loading, exact flag/config precedence and the two intentional invalid/zero-date rendering corrections. Make clear that changing a reference for a static Vite asset requires regeneration, not merely opening the page later. Distinguish proposal from implemented behavior until this work is approved and completed.

At the stable milestone, run serially as appropriate to consumed inputs:

- `npm test` — builds and runs the full Node/core/Vite/CLI suite.
- `npm run typecheck` — includes test types and the DOM-only browser import graph.
- `npm run lint` and `npm run format:check` — native repository gates; report unrelated baseline issues rather than reformatting outside the allowlist.
- `npm run test:browser` — existing Chromium suite with the representative adapter integration. If a browser prerequisite is missing, report it rather than claim browser verification from Node tests.
- `git diff --check` and a changed-path review against this plan.

Pack to a task-owned scratch directory under `$TMPDIR` using npm's native pack destination option, install the tarball into a disposable consumer, and import the root, explicit /v1, /browser and /vite entries. Exercise a custom date/age render composed with asOf, invoke the installed CLI with an explicit config module, and compile a small TypeScript consumer using the literal format overloads and shared config. Reuse the existing installed Vite for the plugin check rather than introducing a new dependency selection. This catches emitted JavaScript/declaration/barrel problems that source-transformed Vitest cannot establish. No publication or version bump.

Review the bounded final API and implementation, fix substantive findings, and stop when the approved acceptance criteria pass. A local implementation milestone commit requires applicable user authorization; this planning turn does not commit anything.

## Acceptance criteria

- Existing callers keep meaningful legacy date presentation and do not acquire age text or a hidden current-date dependency.
- Custom dates reach every intended date label/tooltip without changing the YAML schema or requiring JavaScript Date conversion.
- Age policy can inspect preserved life-history metadata and emit nonnumeric text, including when conventional dates are absent.
- Conventional age has explicit endpoint/precision semantics; custom Date formatting is never advertised as automatically changing conventional age arithmetic.
- Direct DOT, Node, browser, Vite and CLI config loading exercise the same graph-options contract, with preserved output types and platform isolation.
- A shared config composed with asOf supports different reference dates without mutation; the CLI preserves configured policies and applies only explicit overrides. Neither the core nor Vite loads config files implicitly or executes code from family YAML.
- Adapter output is encoded as text; unsupported values can be omitted intentionally, while callback bugs fail with contextual errors.
- No mutation or global adapter state; no viewer, navigation, relationship inference, new package dependency or BF change.

## Other extension points: recommendations, not dependencies

### Person presentation — strongest next candidate

`src/render_graph.ts` hardcodes main-name selection, first/last-name concatenation, m/f symbols, English tooltip labels, comment truncation and row layout. A future narrow presentation hook or structured person-view model could cover locale/cultural name order, nonbinary/custom symbols, translation and selected metadata. Avoid a public callback for every string. The Date/Age text hooks must not become an accidental raw-HTML person-template API.

### Link resolution — design with the viewer/navigation milestone

People and houses currently use only `links[0]`. Resolving stable application IDs into URLs, tree targets or viewer actions is a good runtime boundary. Wait for the references design; do not promise a URL-only adapter now and then force non-URL tree navigation into it. Viewer interaction, browser history and modal ownership are not core DOT concerns.

### Picture/resource loading — a separate rendering capability

The documented WASM path does not load local pictures. An asset resolver/loader could help, but string substitution alone does not implement Graphviz image sizing/loading. It also introduces platform, asynchronous I/O and trust/lifetime decisions. Keep it separate from these synchronous policy hooks.

### Relationship semantics — not an adapter escape hatch

Adoptive/biological parentage and uncertainty are authored relationship facts. Half/adoptive/step-sibling descriptions are derived from those facts. Default overridable styles come afterward. A callback must not silently reinterpret v1 secondary lines as adoption or substitute for an agreed relationship model.

### Already configurable: styling and layout

Graphviz attributes and person classes already provide style/layout customization. Do not add a parallel theme/layout adapter until a real consumer requirement cannot be expressed by the current mechanism. Family palette configuration could be a small ordinary option later; it does not require an adapter architecture.

## Review decisions

The concrete proposal is deliberately narrow: independent text/policy adapters, opt-in ages with an explicit reference, a conventional full-date default, one shared configuration shape with pure asOf composition, and explicit trusted CLI config loading. User review confirmed that configuration-based custom adapters belong in the CLI as well as Vite; the earlier conventional-only CLI restriction is superseded. The main remaining tradeoff is that a custom calendar supplies both its date and age policies rather than Kingraph standardizing reusable calendar arithmetic now. Review that boundary before implementation; expand to a CalendarAdapter only if a concrete consumer operation needs it.
