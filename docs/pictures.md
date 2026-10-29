# V2 picture catalogs and asset resolution

V2 makes picture sources part of the family document. It is selected explicitly
with `schemaVersion: 2`; unversioned documents and `schemaVersion: 1` retain the
[v1 contract](schema.md), including custom `pictureResolver` configuration.

```yaml
schemaVersion: 2
pictures:
    portrait-alex:
        path: ./portraits/alex.png
people:
    alex:
        name: Alex
        picture: portrait-alex
```

The person's `picture` is a catalog key, not an implicit filename or URL. Unknown
keys are rejected with reference context before loading. Only entries used by
people are loaded, once per key per render. Unused valid entries do not trigger
filesystem or network access. Other family/person metadata and style semantics
remain available, including date/age policies and their original metadata.

## Source declarations

Every catalog entry has exactly one source; ambiguous or unknown source fields
are rejected:

- `path`: a nonempty relative source path. Parent-directory references such as
  `../portraits/alex.png` are allowed; absolute paths and URI schemes are not.
- `url`: an absolute HTTP(S) image URL.
- `data`: a complete base64 PNG/JPEG image data URL, including its MIME type.

PNG and JPEG are the supported image formats. Loaders verify supported content
and intrinsic dimensions rather than trusting an HTTP MIME header alone. Image
failures reject the render instead of silently dropping a portrait.

Declarations describe resources; they are not a sandbox. Render only trusted
resource-bearing documents with default loaders. Server applications handling
untrusted input should supply an access-restricting `pictureLoader`.

## The source document is the anchor

`path` is relative to the YAML document's location, not the working directory,
page route, importing component or generated SVG directory. The loader supplies
this context; it is not inferred from fields in the authored data.

- CLI file inputs supply their individual source-file URLs.
- `--base-dir` supplies an explicit directory base, including for stdin. It takes
  precedence over configured `documentUrl`, which takes precedence over the input
  filename. Stdin has no implicit working-directory base.
- Library calls can supply `documentUrl`, an absolute source-document or directory
  URL. Directory URLs must end in `/`.
- Browser callers that fetch YAML can use the response's final URL, provided the
  relative assets are served alongside it. Pasted YAML or a plain object has no
  inherent origin; provide a source base or a curated asset loader.
- Astro/Vite imports resolve from the original YAML file, then map local files to
  native build asset URLs. The viewer never receives unresolved source paths.

```sh
kingraph trees/family.yaml > family.svg
kingraph trees/family.yaml -F png > family.png
cat trees/family.yaml | kingraph --base-dir trees > family.svg
```

For a direct Node call:

```ts
import { render } from '@nicodoggie/kingraph';

const svg = await render(tree, {
    documentUrl: new URL('./trees/family.yaml', import.meta.url).href,
});
```

For fetched browser data:

```ts
import { parseFamilyYaml, render } from '@nicodoggie/kingraph/browser';

const response = await fetch('/trees/family.yaml');
if (!response.ok) throw new Error('Could not load family document.');
const tree = parseFamilyYaml(await response.text(), response.url);
const svg = await render(tree, { documentUrl: response.url });
```

The plain parser does not attach an invisible filesystem location to its result.
Source context remains explicit at the environment boundary.

## Linked display and portable export

Generation location and image inclusion are separate choices. A build-time SVG
can link web images, and browser-generated SVG can embed them.

`pictureMode` selects `'link'` or `'embed'` for SVG output:

- Node/CLI default to embedded output for portable exports.
- Browser v2 SVG defaults to linked output for inline display.
- PNG/PNG-image rendering prepares embedded images even if SVG link mode was
  requested, so native raster conversion has usable resources.
- Data sources are already embedded regardless of mode.

Linked output still needs image dimensions before layout. Loading enough image
metadata does not require copying image bytes into the final SVG. A linked SVG
continues to depend on its image URLs and browser access policy.

For an existing linked SVG, the browser's `embedSvgPictures` prepares a portable
copy without rerunning Graphviz; `svgToPng` can then rasterize that same copy:

```ts
import { embedSvgPictures, svgToPng } from '@nicodoggie/kingraph/browser';

const portableSvg = await embedSvgPictures(svg);
const png = await svgToPng(portableSvg, 2);
```

This helper resolves final SVG web hrefs against the displaying page's base URI,
including the root-relative URLs emitted by Astro/Vite. If the SVG came from a
different document URL, pass that URL as its optional second argument. This does
not change catalog `path` anchoring, which still requires source-document context.

Native image loading and normal CORS rules apply. An image that displays through
an external URL is not automatically readable for export. Failed export preparation
must be reported rather than delivering a portrait-free image. Keep the linked
preview if export fails; an application can retry or offer an alternate resource.

SVG used as an HTML image or canvas source can be blocked from loading nested
external images. Prefer linked images for inline SVG and embedded images for
portable downloads or SVG-as-image usage. Embedding also copies the supplied
image bytes into the exported file; include only resources intended for export.

## Astro and Vite

The existing native plugin is the integration boundary:

```astro
---
import KingraphViewer from '@nicodoggie/kingraph/astro';
import svg from '../trees/family.yaml?kingraph&raw';
---

<KingraphViewer svg={svg} label="Family" presentation="embedded" />
```

For v2, raw imports default to linked pictures for inline SVG. Referenced local
assets participate in native Vite URL handling, base-path rewriting, production
asset names, SSR emission and watch invalidation. Picture changes can therefore
regenerate layout when intrinsic dimensions change. Asset resolution uses the
YAML directory even when an Astro page imports it from another directory.

The SVG-URL import variant defaults to embedded pictures because it is commonly
used as an HTML image. Explicit `pictureMode` configuration can select another
SVG policy. Existing v1 URL/raw behavior is preserved. The renderer runs on the
build/dev side; image declarations do not add Graphviz to the viewer bundle.

A supplied custom `pictureLoader` remains responsible for its own access policy
and any resources outside native plugin-managed dependencies.

## Shared configuration and versioned APIs

`PictureSource` describes a source. `PictureLoader` receives it plus
`{ id, documentUrl, mode }` and returns `{ href, width, height }`, directly or
asynchronously. The environment-specific `loadPictureAsset` implements this
contract. `pictureLoader` overrides default v2 access behavior; legacy
`pictureResolver` remains the v1 data-URL callback.

Root APIs dispatch by the explicit document version. `/v1` and `/v2` provide
version-specific APIs; `/v1/schemas` and `/v2/schemas` expose their corresponding
validators and inferred types. Do not send v2 data through an explicit v1 entry.

DOT is a pure intermediate format: it never invokes asset loaders. V2 resolves
catalog IDs to declared source strings; relative file strings remain relative to
the source document, so native Graphviz consumers must use that document's base.
V1 DOT behavior is unchanged.

## Playground

The portrait example demonstrates a v2 catalog with relative paths. Because the
editor accepts raw text rather than loading a source file, its curated adapter
maps only the known bundled portrait paths to native Vite asset URLs. Arbitrary
edited URLs/paths are not fetched. Inline image data can be decoded locally.
The preview links images; SVG/PNG downloads lazily prepare and reuse a portable
copy of the last successful SVG without rerunning layout.
