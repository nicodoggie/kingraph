# V1 schema validation and browser qualification

## Goal and boundaries

Implement the agreed v1 work: permissive Zod validation for the existing v1 document, a complete source-backed field reference, and a small native-browser regression suite. Base: released 0.5.0 (`a49b137`). Integrate the verified `feature/v1-schema` candidate into `master` and push without a package version bump. Npm publication and release tags are separate. BF is read-only compatibility input. Do not implement v2 relationships, migration tooling, visual snapshot infrastructure or schema-to-JSON-Schema tooling.

## Contract

- Missing `schemaVersion`, or explicit numeric `schemaVersion: 1`, selects v1. Reject other version values; there is no v2 implementation yet.
- Schema exports use PascalCase without version suffixes: `FamilyTreeSchema`, `FamilySchema`, `PersonSchema`, `StylePropertiesSchema` and `StylesSchema`, plus `validateFamilyTree`. The `/v1/schemas` path supplies the version; do not retain aliases for the earlier unreleased names.
- Define public Zod schemas in `src/v1/schemas.ts`, with inferred public types retaining the existing type names. Expose schemas and the validator only through `@nicodoggie/kingraph/v1/schemas`, a rendering-independent Node/browser entry. Expose the explicit rendering API through `/v1` and make the root index re-export it, not a namespace. Keep the existing `/browser` entry and browser conditions for both root and `/v1`. Do not make consumers load Node dependencies in a browser.
- Validate known object/collection/value shapes. Known optional fields retain their supported types; family list entries and people values may be null. Preserve unknown keys on root, family and person objects. Preserve all scalar Graphviz attributes and null/undefined suppression. Do not coerce dates, strings or identifiers, invent defaults, resolve person IDs against the optional people map, or infer relationship semantics.
- Preserve the YAML loader's timestamp and merge tags. Validate parsed YAML with filename/path diagnostics and validate direct render/DOT calls through their shared render boundary. Empty/comment-only input remains an empty graph.
- Preserve actual rendering behavior, including quirks: `display` alone does not activate the rich label, only the first link is used, secondary connections are style distinctions, and known metadata-only fields do not gain new rendering effects.
- Use current v1 documents as compatibility evidence, not as authorization to silently accept every malformed value. Reject clearly malformed known fields with actionable diagnostics.

## Evidence already captured

Before implementation, `/home/ensu/.hermes/cache/scratch/kingraph-v1-compat.mjs baseline` recorded hashes for all 16 repository fixtures/examples and all 11 tracked BF `family.yaml` files. The private baseline contains input, canonical parsed-content and DOT hashes, not copied family data. Existing extra person metadata includes `adopted`, `age` and `nickname`; retain it without pretending it has renderer semantics.

## Implementation and verification sequence

1. Write compact contract tests against the new public schemas and shared validation boundary. Verify RED because the new module/boundary is absent; preserve existing fixture tests.
2. Implement `src/v1/schemas.ts`; derive `src/types.ts` aliases; integrate YAML and direct-render validation; expose versioned schemas separately from rendering barrels. Verify focused GREEN and typecheck. Clean generated `dist` before builds so moved schemas cannot remain as stale package payloads.
3. Inventory every known root, family and person field, all built-in style selectors, generic style values and their precedence in `docs/schema.md`. Distinguish accepted input, real behavior, ignored metadata and native-picture restrictions. Avoid attaching new semantics to legacy data.
4. Add Vitest Browser Mode with its matching Playwright provider and Chromium. Keep Node tests separate. A small real-browser suite must exercise inline SVG/links and secondary edges, native PNG bytes/scaling, loaded PNG image output, and an actual decode failure. Wire reproducible local setup and a single Chromium CI job; do not multiply browser/OS matrices.
5. Run Node tests, browser tests, typecheck, lint/format and audit. Re-run the compatibility helper against built output: all source, parsed-content and DOT hashes must match 0.5.0. Verify the packed schema declarations/runtime in a separate installed consumer and build the browser-conditioned entry without Node-only imports.
6. Inspect the complete diff and obtain a bounded independent review. Commit and merge the verified candidate, then read back the pushed `master` ref. Report exact test counts and platform limits. Do not claim cross-browser visual fidelity from a Chromium functional pass, and do not publish an npm release as part of source integration.
