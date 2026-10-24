# Kingraph TS/ESM modernization

## Approved scope

Modernize this fork as a native ESM TypeScript package, update the dependency chain, keep current Meow, replace Tape with Vitest and deprecated Istanbul with optional V8 coverage. Maintain CLI YAML/file/stdin input and DOT/SVG/PNG output. Modernize the browser entry and awaitable PNG/image conversion with unit tests, but do not add real-browser automation. Preserve useful YAML semantics and graph styling. No CJS build is required. A Vite plugin and changes to Bastion Falls builds belong to the next pass.

## Architecture

The browser-safe typed graph core produces DOT. A shared WASM Graphviz layer produces SVG. The Node entry adds SVG-to-PNG rasterization using resvg; the browser entry uses native image/canvas APIs without importing Node dependencies. The package exports the Node entry by default, a browser condition, and an explicit browser subpath. ESM JavaScript and declarations are emitted by TypeScript. Keep a default render export, expose named render/renderDot functions, and document Promise return values instead of the obsolete async toggle.

## Implementation plan

### 1. Typed graph core

Create `src/types.ts`, typed ESM versions of the graph/style/join/id/slug utilities and defaults, and migrate the existing utility assertions to Vitest. Remove object-loops/object-assign by using native object operations with equivalent traversal order. Fix directly implicated strict-mode errors (the undeclared picture variable) and per-render state ownership. Preserve graph behavior otherwise. Focused characterization assertions precede changes to behavior; native typecheck establishes type correctness.

### 2. Runtime and packaging

Update `package.json`, add a lockfile, TypeScript configurations, local lint/format commands, and Vitest configuration. Use mutually supported maintained tool versions rather than peer overrides. Implement typed Node/browser renderers, async browser image completion/error handling, current Meow CLI and current js-yaml parsing. Isolate platform dependencies with explicit imports/exports. Replace the global-install Makefile commands with local scripts and replace Travis with CI using the chosen Node baseline. Remove obsolete CommonJS source after its replacement is exercised.

### 3. Focused verification

Use focused RED/GREEN tests for runtime changes: repeated rendering, SVG/PNG generation, CLI parsing/error behavior, browser conversion orchestration/failure paths. Reuse fixtures and existing assertions; do not test incidental configuration strings or impose a coverage percentage gate. No Playwright, browser simulator, or browser fidelity claim. Typecheck with DOM-only configuration for the browser import graph. Test emitted ESM and CLI via a packed, independently installed consumer so Vitest transforms cannot mask broken packaging.

### 4. Documentation and closeout

Update README/getting-started material with Node baseline, ESM/TS entry points, browser usage and output differences, build/test commands, package-name installation and known picture/font limits. Verify tests, build, typecheck, lint, format, packed consumer and fresh production/all-dependency audit. Review the bounded final changes and fix substantive findings. Leave changes uncommitted unless the user explicitly requests a commit; do not push, publish, open a PR, or modify BF.

## Acceptance and boundaries

The existing baseline has 25 passing assertions; simple DOT/SVG rendering works and PNG fails in deprecated PhantomJS. The current manifest has no tracked lockfile. A fresh scratch resolution reports 16 affected-package audit findings, including inherited severity. Success requires a usable packaged ESM library/CLI, working PNG, preserved fixture content, browser-safe imports and honest unit-only browser evidence. Native Graphviz picture layout limitations must not be misrepresented as newly supported image embedding.
