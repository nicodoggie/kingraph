# kingraph

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 👪 Plots family trees using JavaScript and Graphviz

A family tree plotter with a very simple syntax. It probably doesn't cover everything [bigger tools](https://gramps-project.org/) do, but covers 90% of it for the sake of simplicity.

![Example Graph](examples/intro.png)

## Installation

This fork requires **Node.js 24 or newer** and ships native ESM JavaScript with
TypeScript declarations. CommonJS `require()` and private `lib/*` imports are no
longer supported entry points.

For a published release:

```sh
npm install -g @nicodoggie/kingraph
```

For this checkout:

```sh
npm ci
npm run build
./bin/kingraph --help
```

The global install adds `kingraph` to your shell; in a checkout, use
`./bin/kingraph` after building. Run `kingraph --help` for usage information.

## Getting started

A family tree is a [YAML](http://yaml.org/) file. To get started, store the following text in a file called `family.yaml`:

```yaml
families:
    - parents: [Marge, Homer]
      children: [Bart, Lisa, Maggie]
    - parents: [Lisa, Milhouse]
      children: [Zia]

people:
    Marge:
        fullname: Marjorie Bouvier Simpson
```

```sh
kingraph family.yaml -F dot | dot -Tpdf -o family.pdf
open family.pdf
```

SVG is the default; PNG now uses resvg rather than the deprecated PhantomJS stack:

```sh
kingraph family.yaml > family.svg
kingraph family.yaml -F png > family.png
cat family.yaml | kingraph -F dot > family.dot
```

Use `-` to explicitly read stdin. Multiple filenames are rendered in argument
order and their outputs are concatenated; use one input for a standalone image.

## JavaScript and TypeScript API

```ts
import render, { parseFamilyYaml, renderDot } from '@nicodoggie/kingraph';
import type { FamilyTree } from '@nicodoggie/kingraph';

const family: FamilyTree = {
    families: [{ parents: ['Marge', 'Homer'], children: ['Lisa'] }],
};

const dot = renderDot(family); // Synchronous string; no Graphviz initialization.
const svg = await render(family); // SVG string by default.
const png = await render(family, { format: 'png' }); // Node Buffer.
const parsed = parseFamilyYaml('families: []', 'family.yml');
```

Rendering accepts parsed family data, not filenames. File access and output
writing belong to the caller. `render()` always returns a Promise; the old
`async: true` option is no longer needed. `renderDot()` is the synchronous route.
Unsupported formats reject with an error rather than returning `undefined`.

The YAML parser preserves merge keys and timestamps. Four-digit birth/death
years, including unquoted numeric YAML years, are rendered as years rather than
milliseconds since 1970. Full dates use UTC for consistent year/date labels.
Family colors restart for each render, making repeated builds deterministic.

### Dates, ages and shared configuration

Rendering accepts optional `dateAdapter`, `ageAdapter` and `asOf` options in
Node, browsers and the Vite plugin. Adapters and their types are exported from
the root, `/v1` and `/browser` entries. The document schema is unchanged:
functions belong in application configuration, not family YAML.

Age display is **opt-in**. The default date formatter keeps conventional year
labels and UTC/en-US tooltip dates; invalid date strings omit their fragments
instead of producing `NaN` or `Invalid Date`. Numeric zero is a present epoch
timestamp under that formatter, not a missing value.

```ts
import render, { asOf, defaultAgeAdapter } from '@nicodoggie/kingraph';

const config = { ageAdapter: defaultAgeAdapter };
const svg = await render(family, {
    ...config,
    ...asOf('2026-10-26'),
});
```

`asOf(value)` returns a fresh options fragment; plain `asOf: value` works too.
Neither form reads the clock or enables age display by itself. The reference
is passed unchanged to the age policy, so custom-calendar strings are allowed.
Compose a different reference for each rendering without changing the base config.

The conventional age adapter calculates completed Gregorian years from UTC
calendar dates. It needs a full birth date and either an explicit reference or
a full death date. It uses death as the endpoint when death is on/before the
reference; otherwise it calculates to the reference. Without a reference, a
living person's age is omitted. Year-only, unsupported, imprecise or reversed
dates do not produce an exact age. February 29 birthdays advance on March 1 in
non-leap years. Output is `Age: N` or `Age at death: N`, shown in the label and
tooltip.

Custom `DateAdapter` objects implement `formatYear(value, context)` and
`formatDate(value, context)`. A custom `AgeAdapter` is a function receiving
`{ id, person, tree, asOf }` and can inspect preserved life-history metadata.
It returns complete age wording, so ranges or biological/chronological age
descriptions are possible. All callbacks are synchronous and return plain text
or `undefined` (empty text also omits the fragment). Unexpected callback errors
fail rendering with person/operation context rather than silently changing policy.

**A custom date formatter does not change the conventional age arithmetic.**
For a custom calendar, supply both adapters and share your calendar code between
them. Quote custom-calendar values in YAML when you need the original string:
unquoted YAML timestamps may already be `Date` objects when the adapters run.
See [date and age policies](docs/schema.md#date-and-age-adapters) for the full
contract and precision rules.

### CLI configuration

The CLI can explicitly load the same options object from trusted JavaScript.
For example, create `kingraph.config.mjs`:

```js
import { defaultAgeAdapter } from '@nicodoggie/kingraph';

export default {
    ageAdapter: defaultAgeAdapter,
    asOf: '2026-10-26',
};
```

```sh
kingraph family.yaml --config ./kingraph.config.mjs > family.svg
kingraph family.yaml --config ./kingraph.config.mjs --as-of 2020-01-01 > past.svg
kingraph family.yaml --age --as-of 2026-10-26 > conventional.svg
```

`--config` paths resolve from the working directory. Native Node module rules
apply to `.js` and `.mjs`, and relative imports inside the module resolve from
that module. The default export must be an options object, not a factory.
There is no config-file discovery or custom TypeScript transpiler. Loading a
config **executes trusted local code**; it is not a sandbox or part of YAML parsing.

`--as-of` overrides the configured reference with the supplied string; omission
preserves it and never selects today automatically. `--age` enables the built-in
policy only when no custom age adapter is configured. A configured age adapter
needs no `--age` flag, and `--as-of` alone does not enable ages. For custom policies,
pass a quoted calendar-specific reference, for example
`--as-of '14 Frostwane 843'`; the CLI does not interpret it as Gregorian first.

### V1 input validation

Unversioned family documents use schema v1. An explicit `schemaVersion: 1` is
also accepted; other version values are rejected. Both parsed YAML and direct
render calls validate known fields with Zod, while preserving extra author
metadata on trees, families and people. Validation does not coerce values or
add relationship semantics to custom fields.

The package root re-exports the v1 rendering API. Use
`@nicodoggie/kingraph/v1` for the explicit versioned entry; both select the
browser implementation in browser-aware bundlers. The existing `/browser`
entry remains available.

Import `FamilyTreeSchema`, `FamilySchema`, `PersonSchema`,
`StylePropertiesSchema`, `StylesSchema` and `validateFamilyTree` from
`@nicodoggie/kingraph/v1/schemas` for direct validation. This schema-only entry
works in Node and browsers without loading the rendering stack. Public
TypeScript types derive from these definitions. See the
[v1 field reference](docs/schema.md) for accepted inputs, defaults, actual
rendering behavior and legacy limitations.

## Browser API

Use the explicit browser entry with an ESM-capable bundler. Bundlers that honor
the `browser` export condition also select this entry from the package root.
It does not import Node filesystem APIs, Meow, or the native resvg package.

```ts
import render, { parseFamilyYaml } from '@nicodoggie/kingraph/browser';

const family = parseFamilyYaml(yamlText);
const svg = await render(family); // String; no DOM needed for DOT/SVG.
const bytes = await render(family, { format: 'png', scale: 2 }); // Uint8Array.
const image = await render(family, { format: 'png-image' }); // Loaded HTMLImageElement.
document.body.append(image);
```

Browser PNG conversion requires native image/canvas APIs. It waits for loading
and conversion, rejects failures, and releases temporary SVG object URLs. PNG
scale defaults to `devicePixelRatio`; pass a positive finite value to override.
Functional browser tests exercise Chromium SVG rendering and native PNG
conversion. They are not cross-browser or pixel-perfect visual qualification.

### Rendering limits and trusted input

The WASM Graphviz path does not automatically load local `picture` files.
For existing picture-bearing trees, emit DOT and use native Graphviz (`dot`)
with access to those paths, as in the PDF example above. The resvg replacement
does not remove this existing Graphviz image-layout limitation. Installed fonts
and Graphviz versions can affect output, so PNG bytes are not a stable snapshot.

Family data and Graphviz style/HTML-label values are trusted authoring input,
not a sanitization boundary. Do not inject untrusted rendered SVG into a page
without an appropriate sanitization policy.

## Vite plugin

The plugin lives in the same package under `@nicodoggie/kingraph/vite`; the regular
Node/browser imports and CLI do not load Vite. Vite is an optional peer
dependency, so non-Vite consumers do not need to install it.

The plugin supports **Vite 8.3.4 or newer within Vite 8**. Install kingraph and
Vite in your project:

```sh
npm install -D @nicodoggie/kingraph 'vite@^8.3.4'
```

Configure `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import kingraph from '@nicodoggie/kingraph/vite';

export default defineConfig({
    plugins: [kingraph()],
});
```

To share adapter configuration with the CLI or another renderer, import the
object in your Vite config and compose its reference normally:

```ts
import { defineConfig } from 'vite';
import { asOf } from '@nicodoggie/kingraph';
import kingraph from '@nicodoggie/kingraph/vite';
import config from './kingraph.config.mjs';

export default defineConfig({
    plugins: [kingraph({ ...config, ...asOf('2026-10-26') })],
});
```

Adapter code runs in the build/dev process, not in generated client modules.
The SVG represents that reference at transformation time: it does not update
its ages when a page opens later. Changing the reference requires regeneration;
there is no clock-driven watcher or mutable `.asOf()` plugin method.

### Import a family tree as an image URL

```ts
import familyUrl, { width, height } from './family.yaml?kingraph';

const image = new Image();
image.src = familyUrl;
image.alt = 'Family tree';
image.width = width;
image.height = height;
document.body.append(image);
```

Only `.yaml`/`.yml` imports with `?kingraph` opt in. Other YAML files are left
to your existing loaders. YAML parsing and Graphviz rendering happen in Node,
not in the browser bundle.

In development the URL is a self-contained SVG data URL. Production application
builds emit an SVG asset through Vite's native pipeline, including content hashing
and configured `base` handling. Library builds follow their configured asset
naming rules. Source edits use Vite's native module invalidation/HMR; no generated
SVG needs to be checked into your source tree.

The named `width` and `height` exports are the SVG's **viewBox dimensions**, useful
for aspect ratios and initial layout. They are not physical pixel measurements
or Astro `ImageMetadata`.

### Import the SVG string

```ts
import familySvg from './family.yml?kingraph&raw';
```

The raw variant returns the rendered SVG string instead of a URL and also
exports `width` and `height`. It does not emit a separate asset. This is useful
for inline SVG; apply the trusted-input/sanitization guidance above. Links inside
an SVG are usable when it is inline, not when the diagram is displayed in an
image element.

### TypeScript import declarations

Add these references to your project's `vite-env.d.ts` (or `env.d.ts`):

```ts
/// <reference types="vite/client" />
/// <reference types="@nicodoggie/kingraph/vite/client" />
```

Use the query order shown above so the opt-in module declarations match.

### Astro and standalone SSR builds

For an Astro project, register the same plugin under `vite.plugins`. URL imports
consumed only on the server also need SVG assets in the deployed output. For
standalone Vite SSR builds, enable Vite's `build.ssrEmitAssets` option; frameworks
may coordinate server/client assets themselves.

```ts
import { defineConfig } from 'astro/config';
import kingraph from '@nicodoggie/kingraph/vite';

export default defineConfig({
    vite: {
        plugins: [kingraph()],
        build: { ssrEmitAssets: true },
    },
});
```

An Astro component can use the URL and dimensions directly rather than passing
the string to `getImage()` as if it were imported SVG metadata:

```astro
---
import familyUrl, { width, height } from './family.yaml?kingraph';
---

<img src={familyUrl} width={width} height={height} alt="Family tree" />
```

The plugin currently targets SVG output. Local `picture` loading has the same
WASM limitation as the core renderer; use the native Graphviz workflow for those
trees. This plugin does not install an Astro integration or migrate an existing
site's CLI/build scripts automatically.

## Development

```sh
npm ci
npm run build          # ESM JavaScript and declarations in dist/
npm test               # Build, unit tests and Node/CLI integration tests
npm run test:watch
npm run test:coverage  # Vitest V8 coverage; no percentage gate
npm run test:browser:install # Install Playwright's Chromium headless shell
npm run test:browser   # Real Chromium SVG/image/canvas tests
npm run typecheck     # Source/tests plus a DOM-only browser import graph
npm run lint
npm run format:check
```

`make test` and `make lint` delegate to local npm scripts; they never install
global tools. GitHub Actions runs checks on Node 24 and 26. The lockfile is
tracked for reproducible development installs. A separate CI job runs Chromium
browser tests on Node 24. On Linux, install browser system dependencies with
`npm run test:browser:install -- --with-deps` where Playwright supports the host
distribution. TypeScript stays on the 6.0
release line while typescript-eslint's supported peer range excludes 7.x.

Vite integration tests exercise production/SSR output and development source
updates through Vite's native APIs, without browser automation.

## Further Examples

Spoiler alerts, view at your own risk :)

<details>
<summary><b>Simpsons</b> (simple)</summary>

Source: _[simpsons.yaml](examples/simpsons.yaml)_

> ![Simpsons Example](examples/simpsons.png)

</details>

<details>
<summary><b>Modern Family</b> (simple with houses)</summary>

Source: _[modernfamily.yaml](examples/modernfamily.yaml)_

> ![Modern Family Example](examples/modernfamily.png)

</details>

<details>
<summary><b>Harry Potter</b> (larger tree)</summary>

Source: _[potter.yaml](examples/potter.yaml)_

> ![Potter Example](examples/potter.png)

</details>

<details>
<summary><b>Game of Thrones</b> (overly complicated)</summary>

Source: _[got.yaml](examples/got.yaml)_

> ![GOT Example](examples/got.png)

</details>

## Documentation

For further reading:

- [Getting started](docs/getting_started.md)
- [Advanced usage](docs/advanced.md)
- [Schema](docs/schema.md)

## Thanks

Authored and initially maintained by Rico Sta. Cruz with help from contributors ([list][contributors]).

> [ricostacruz.com](http://ricostacruz.com) &nbsp;&middot;&nbsp;
> GitHub [@rstacruz](https://github.com/rstacruz) &nbsp;&middot;&nbsp;
> Twitter [@rstacruz](https://twitter.com/rstacruz)

[contributors]: http://github.com/rstacruz/kingraph/contributors
