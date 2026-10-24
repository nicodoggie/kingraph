# Vite plugin implementation plan

## Approved scope

Add a typed Node-side `@nicodoggie/kingraph/vite` entry to the existing package, not a monorepo or separate npm package. Update README usage. Keep Vite an optional peer and explicit dev dependency; do not re-export the plugin from the core/browser entry. BF is a read-only usage reference, not a write target. Commit and merge locally after verification; pushing, version bumps and publication are deferred.

## Public contract

- Default/named `kingraph()` returns a Vite plugin.
- Only `.yml?kingraph` and `.yaml?kingraph` imports are intercepted. Ordinary YAML remains untouched.
- Default import is an SVG URL. `?kingraph&raw` returns the rendered SVG string. Both export numeric `width` and `height` in SVG viewBox units for layout/aspect ratio, not Astro ImageMetadata.
- YAML is parsed and Graphviz rendered on the Node build/dev side; consumers receive only generated strings/metadata, not the renderer runtime.
- Build URLs use native emitted assets and file URL references, respecting Vite base paths and content hashing. Development URLs are self-contained SVG data URLs, avoiding a custom middleware server/cache. Both modes retain clickable links in inline SVG; image-element behavior follows browser semantics.
- Track the source YAML with Vite's native watch/module graph so edits regenerate the module. Do not add a custom watcher or persistent cache.
- Vite 8.3 is the initial supported line, matching BF's current Vite dependency. SSR asset emission follows Vite's native configuration: standalone SSR builds that consume URLs must enable `build.ssrEmitAssets`; document and exercise this explicitly. No framework-specific integration is promised.
- Provide opt-in ambient import declarations through `/vite/client`, including the raw variant. Malformed YAML or render failure reports the source filename; unsupported local picture loading remains the renderer's documented limitation.

## Implementation sequence

### 1. Contract and focused RED

Create `tests/vite.test.ts` using the real installed Vite `build` and `createServer`, temporary fixtures under the configured scratch root, and deterministic output assertions. Cover ordinary YAML passthrough, URL/raw exports and dimensions, configured base paths, standalone SSR with asset emission, dev regeneration, and filename-bearing errors. Use native hooks instead of mock hook contexts. Verify RED before adding `src/vite.ts`.

### 2. Plugin and package exports

Create `src/vite.ts` and opt-in `src/vite-client.d.ts`. Use type-only Vite imports and existing `parseFamilyYaml`/`render`. Add exports for `/vite` and `/vite/client`, optional peer metadata, and an explicit Vite development dependency. Keep client ambient declarations shipped from source with a types-only export, since tsc does not copy input declaration files. Run the focused integration tests to GREEN, then typecheck.

### 3. Documentation and package proof

Update README with installation, Vite configuration, URL and raw imports, dimensions, TypeScript setup, dev/build/SSR behavior, trusted SVG caveat and picture limitation. Include an Astro configuration example without modifying BF. Build and pack; exercise the installed plugin entry and ambient declarations in an isolated consumer, and verify a core-only install does not bring Vite. Run the complete suite and lint/format/type checks once at a stable milestone. Review only the bounded changed paths and stop when the import-to-render loop and docs are verified.
