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
descriptions are possible. Date and age callbacks are synchronous and return plain text
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
also accepted. `schemaVersion: 2` selects the picture-catalog format described in
the [v2 picture guide](docs/pictures.md); unsupported versions are rejected.
Both parsed YAML and direct
render calls validate known fields with Zod, while preserving extra author
metadata on trees, families and people. Validation does not coerce values or
add relationship semantics to custom fields.

The package root dispatches by document version. Use
`@nicodoggie/kingraph/v1` or `@nicodoggie/kingraph/v2` for an explicit versioned
entry; browser-aware bundlers select the corresponding browser implementation.
The existing `/browser` entry remains available. Explicit v1 APIs continue to
reject v2 documents rather than silently changing their meaning.

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

### Pictures and portable downloads

V2 declares a `pictures` catalog in YAML and lets each person's `picture` name
an entry. Its `path`, `url` or `data` source is resolved by an environment adapter.
Relative paths are anchored to the source YAML, not the page or cwd. Inline
browser/Astro output can link pictures; portable exports embed them. See the
[v2 picture guide](docs/pictures.md) for the schema, CLI `--base-dir`, browser
source context, Vite asset integration and output-mode defaults.

The following callback API remains available for v1 compatibility.
Keep `picture` as a reference in your family YAML. Supply a `pictureResolver`
in rendering configuration to turn that reference into a self-contained image.
The browser entry includes an explicit PNG/JPEG loading helper:

```ts
import render, { loadPicture, svgToPng } from '@nicodoggie/kingraph/browser';

const familyWithPictures = {
    people: {
        Avery: { name: 'Avery', picture: '/portraits/avery.png' },
    },
};
const svg = await render(familyWithPictures, { pictureResolver: loadPicture });
const png = await svgToPng(svg, 2); // Rasterize this exact SVG snapshot.
```

`loadPicture` fetches and decodes the supplied URL using browser APIs; normal
same-origin/CORS rules apply. It does not run merely because an image reference
appears in YAML. You choose the resolver and its resource-access policy.

Node and browser renderers share the `PictureResolver` contract: a synchronous
or asynchronous function receiving the original picture string and returning
`{ dataUrl, width, height }`. `dataUrl` is a base64 PNG/JPEG data URL, and the
dimensions are positive finite intrinsic pixel sizes. Both types,
`PictureResolver` and `ResolvedPicture`, are exported from the root, `/v1` and
`/browser`. A Node resolver can read an explicitly selected file or use metadata
from an existing asset pipeline; Kingraph does not guess paths or read files on
your behalf. The same resolver can be supplied through trusted CLI configuration
or the Vite plugin's options.

Each distinct picture reference is resolved once per SVG/PNG render. The renderer
registers image dimensions with Graphviz and embeds the bytes in the resulting
SVG, so the SVG and raster exports do not depend on the original image URL.
Resolver failures reject rendering rather than silently dropping a portrait.
`renderDot` and `format: 'dot'` remain synchronous/asynchronous DOT routes,
respectively: they retain the original references and never invoke the resolver.

### Rendering limits and trusted input

Without an explicit picture resolver, the WASM Graphviz path still does not
automatically load local `picture` files. Alternatively, emit DOT and use native
Graphviz (`dot`) with access to those paths, as in the PDF example above.
Installed fonts and Graphviz versions can affect output, so PNG bytes are not a
stable snapshot.

Family data and Graphviz style/HTML-label values are trusted authoring input,
not a sanitization boundary. Do not inject untrusted rendered SVG into a page
without an appropriate sanitization policy.

## Interactive viewer and Astro

The optional viewer enhances trusted inline SVG with pan/zoom, fit/reset controls
and opt-in modal/fullscreen presentation. It is framework-neutral and powered by
`@panzoom/panzoom`; it does not load the rendering engine or require React.

Astro has a native component entry:

```astro
---
import KingraphViewer from '@nicodoggie/kingraph/astro';
import svg from './family.yaml?kingraph&raw';
---

<KingraphViewer svg={svg} label="The Example family" modal fullscreen />
```

Use the Vite plugin below to prepare the SVG. The component includes its styles
and browser setup, requires no `client:*` directive, and leaves the diagram in
the initial HTML as a static fallback. Its initial Astro peer range is 7.4.x
and later within Astro 7.

For other browser applications, import `defineKingraphViewer` from
`@nicodoggie/kingraph/viewer`, import `@nicodoggie/kingraph/viewer.css`, await
registration and place inline SVG in `<kingraph-viewer>`. Registration is
explicit; importing the module alone is safe on the server. Astro remains an
optional peer, and the existing renderer entries do not import the viewer.

Standard keeps a text toolbar outside the frame. Set `presentation="embedded"`
on either `<kingraph-viewer>` or the Astro component for compact overlay controls
and an in-frame hint. The optional Astro prop is `'standard' | 'embedded'` and
defaults to standard. Presentation can change live without replacing the diagram
or resetting its view. The [viewer guide](docs/viewer.md#custom-controls-and-styles)
documents scoped theme variables and caller-supplied toolbars.

Ordinary wheel events are not cancelled; Ctrl/Command-wheel zooms. Dragging the
diagram, including linked nodes, pans; ordinary link clicks remain native. See the
[viewer guide](docs/viewer.md) for props, view state, lifecycle and navigation
behavior, customization and qualification limits.

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

The plugin targets SVG output. V2 local picture paths are resolved relative to
the YAML file and registered with Vite's asset/watch handling. Raw v2 imports
default to linked images for inline display; SVG-URL imports default to embedded
images for image-element compatibility. Explicit `pictureMode` can override SVG
policy. See the [v2 asset guide](docs/pictures.md#astro-and-vite).

V1 still accepts shared `pictureResolver` configuration for portable pictures.
Custom callbacks own resources outside plugin-managed dependencies; those are
not automatically watched. Browser-only `loadPicture` is not a build-time file
loader. This plugin does not install an Astro integration or migrate an existing
site's CLI/build scripts automatically.

## Development

For the local browser workbench:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The plain HTML/TypeScript playground uses
current browser renderer and viewer sources, so source reload needs no `dist`
rebuild. Its first sample renders automatically; YAML edits, example selection,
and age/reference changes require **Render**. The fixed visible reference never
reads today's date. Full dates are needed for exact conventional ages.

The labeled **Viewer presentation** selector switches Standard/Embedded on the
current preview immediately, preserving its view even with invalid YAML. The
selection persists through later renders and does not change rendering options.

The example chooser includes links/tooltips, nested houses, secondary connection
styles, a custom vertical layout, dates/ages and illustrated portraits. Each has
a short description of what to try. Person and house links in the links example
lead to explanatory notes on the same page. Dashed connections demonstrate
alternate edge styling, not automatically inferred adoption or step relationships.

SVG and PNG downloads use the last successful SVG, even after unrendered edits
or an invalid render. The v2 portrait preview links bundled images; its first
download lazily creates a portable embedded copy, reused for both formats.
Conversion does not rerun Graphviz. A failed render retains the last preview;
failed export preparation can be retried. The editor accepts its curated portrait
paths or inline image data, not arbitrary resource URLs/files. General browser
applications can choose their own loader and resource policy. This is trusted
local authoring: data and SVG are not sanitized.

`npm run build:playground` builds the dev workbench into `playground/dist` using
native Vite. This is a local development tool, not a hosted service or new package API.

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
