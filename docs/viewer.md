# Kingraph viewer

Kingraph's viewer is a progressive enhancement of an already-rendered inline SVG.
It uses `@panzoom/panzoom`, requires no React runtime, and does not load Graphviz,
YAML parsing or PNG conversion just to display a diagram. Rendering and viewing
remain separate: use the Vite plugin or rendering API to prepare the SVG first.

Family data, rendered SVG and configuration are trusted authoring inputs. The
viewer is not an SVG/HTML sanitizer; apply an appropriate policy before embedding
untrusted markup.

## Native Astro component

Import the `.astro` component directly. No React integration, `client:load` or
other framework hydration directive is required:

```astro
---
import KingraphViewer from '@nicodoggie/kingraph/astro';
import svg from './family.yaml?kingraph&raw';
---

<KingraphViewer svg={svg} label="The Example family" modal fullscreen />
```

Configure the existing Kingraph Vite plugin as documented in the README. The
component renders the SVG into the initial page HTML, imports the shared styles,
and registers the browser component through Astro's bundled script handling.
Without JavaScript, the inline diagram remains visible. The same component works
in Astro MDX pages.

Required props are `svg: string` and `label: string`. Optional props are
`presentation: 'standard' | 'embedded'` (default `'standard'`),
`height: string` (default `300px`), `modal: boolean` and `fullscreen: boolean`
(both default false), plus native `class` and `style` customization. For example,
`height="420px"` changes the inline viewport, not the SVG's intrinsic geometry.
Astro is an optional peer for general Kingraph consumers; the initial supported
line is Astro 7.4. Exact qualified versions are recorded in the implementation
plan's completion evidence.

Date/Age adapters and `asOf` stay in renderer/Vite configuration. Their functions
are not serialized into browser props. A generated SVG is a snapshot, not a live
age calculator.

## General browser component

Use the explicit viewer entry in a browser-capable bundler:

```ts
import { defineKingraphViewer } from '@nicodoggie/kingraph/viewer';
import '@nicodoggie/kingraph/viewer.css';

await defineKingraphViewer();
```

Place trusted inline SVG as a direct child of `<kingraph-viewer aria-label="Family tree">`.
The optional boolean `modal` and `fullscreen` attributes enable those controls.
The CSS custom property `--kingraph-viewer-height` controls its height, defaulting
to `300px`. Each element has its own viewport and lifecycle; no global IDs or
page-wide setup loop are required.

Registration is explicit and asynchronous. Repeated/concurrent calls reuse the
registered constructor. Importing the module is safe on the server and does not
register a custom element or access browser DOM globals; actually registering
is a browser operation. The renderer/root/browser/schema APIs do not re-export
the viewer.

## Embedded presentation

Standard is the default, with a text toolbar and hint outside the viewport.
For an article-sized frame, opt into compact, always-visible overlay controls:

```html
<kingraph-viewer
    presentation="embedded"
    aria-label="Family tree"
    modal
    fullscreen
>
    <!-- Trusted inline SVG goes here. -->
</kingraph-viewer>
```

In Astro, use `<KingraphViewer svg={svg} label="Family tree" presentation="embedded" modal fullscreen />`.
Zoom/Fit/Reset occupy one corner; Expand/Fullscreen occupy the opposite corner.
Narrow containers place expansion actions on a second row. The hint stays inside
the frame, and modal Close occupies the lower opposite corner. Controls use
HTML text icons, accessible names, native tooltips and visible keyboard focus.
Only the diagram transforms; control buttons remain at least 44 × 44 CSS pixels.

Changing the `presentation` attribute on a connected viewer updates its layout
without replacing the SVG or Panzoom instance. Scale and viewed content center
are preserved; if viewport dimensions change, the existing resize behavior
adjusts pan offsets to retain that center.

The playground's **Viewer presentation** selector applies immediately to the
existing preview, including after invalid or unrendered YAML edits. It keeps the
view state while switching and retains the selected mode through later Render
operations. A successful Render still creates a fresh, fitted viewer for the new
SVG. Presentation does not invoke Graphviz or change YAML, age options or
last-success downloads.

## Interaction policy

- Drag the diagram, including person/house nodes, labels and pictures, to pan.
  Ordinary link clicks and keyboard activation remain native; a drag does not
  follow the link. Panzoom still owns movement and pinch gestures. Viewer controls
  and explicitly `panzoom-exclude` descendants do not initiate panning.
- Hold Ctrl or Command while using the wheel to zoom. An ordinary wheel event is
  not cancelled, so the viewer does not intentionally trap page scrolling.
- Panzoom owns touch/pinch gestures inside the viewport. Page scrolling remains
  available outside the viewport; one-finger page scrolling and diagram panning
  do not simultaneously own the same gesture.
- Zoom, Fit and Reset controls are keyboard-operable. Fit/Reset recompute the
  fitted baseline for the current viewport; Reset does not mean scale one.
- Optional modal/fullscreen presentation uses the same live SVG surface, not a
  duplicated diagram. Resize and modal expansion preserve the viewed content
  center and absolute scale. Closing the modal restores focus to its opener.
- Fullscreen may be unavailable or denied by the browser. Inline/modal viewing
  remains usable, and the viewer must not exit fullscreen owned by another
  component.
- Default transforms are not animated, so reduced-motion users do not receive
  mandatory motion. Animated layout changes are not part of this viewer.

## Programmatic view state

Import the `KingraphViewerElement` and `ViewerView` types from `/viewer`.
The element exposes `fit()`, `reset()`, `zoomIn()`, `zoomOut()`, `getView()` and
`setView(view)`. `ViewerView` contains `{ x, y, scale }`:

- `x` and `y` are pre-scale pan offsets in local content pixels.
- `scale` is CSS viewport pixels per local content pixel.
- The SVG is normalized to fixed dimensions equal to its viewBox width/height;
  its viewBox and internal Graphviz transforms are retained.
- The outer SVG uses Panzoom's default center transform origin. A pan delta moves
  the screen by that delta multiplied by scale.

Offsets must be finite and scale must be positive and finite. View state applies
to the same diagram and geometry; the same offsets are not automatically
meaningful in another tree. Cross-tree target resolution, history and dynamic SVG
content replacement remain separate work.

## Custom controls and styles

The light DOM exposes `data-kingraph-surface`, `data-kingraph-viewport`,
`data-kingraph-controls`, `data-kingraph-hint` and `data-kingraph-dialog` for
host styling. Scope overrides under your viewer's own class rather than changing
every diagram on the page.

Supply a toolbar marked `data-kingraph-controls` to replace the default toolbar.
Use ordinary `type="button"` buttons with `data-kingraph-action` values:
`zoom-in`, `zoom-out`, `fit`, `reset`, `expand`, `close` or `fullscreen`.
Expansion and fullscreen still require their corresponding opt-in attributes.
The toolbar moves with the live surface into the modal and returns to its
authored location on teardown. Embedded presentation positions it inside the
frame but preserves its labels, icons, actions and markup; callers can supply
only the actions they need. Keep a custom toolbar compact enough for its frame.
The default corner grouping and icon-only styling apply only to generated
controls, not supplied markup.

Embedded colors can be adapted per viewer using these CSS custom properties:
`--kingraph-viewer-background`, `--kingraph-viewer-frame-border`,
`--kingraph-viewer-control-background`, `--kingraph-viewer-control-color`,
`--kingraph-viewer-control-border`, `--kingraph-viewer-focus-color`,
`--kingraph-viewer-hint-color` and `--kingraph-viewer-hint-background`.
For example:

```css
.article-tree {
    --kingraph-viewer-height: 360px;
    --kingraph-viewer-control-background: #202938;
    --kingraph-viewer-control-color: #fff;
    --kingraph-viewer-hint-color: #e2e8f0;
    --kingraph-viewer-hint-background: #202938;
}
```

Generated controls expose `data-kingraph-default-controls`,
`data-kingraph-navigation`, `data-kingraph-expansion`, `data-kingraph-icon` and
`data-kingraph-label` for scoped overrides. No page-wide theme setup is required.

In Astro, pass that toolbar through the named `controls` slot:

```astro
<KingraphViewer svg={svg} label="Family tree" modal>
    <div
        slot="controls"
        data-kingraph-controls
        role="group"
        aria-label="Diagram controls"
    >
        <button type="button" data-kingraph-action="zoom-in">
            Zoom in
        </button>
        <button type="button" data-kingraph-action="reset">
            Reset view
        </button>
        <button type="button" data-kingraph-action="expand">
            Open larger view
        </button>
    </div>
</KingraphViewer>
```

Normal interactive scale limits are 0.01–100; the viewer widens them to include
the fitted view and explicitly supplied valid state. Large diagrams and saved
views are therefore not rejected merely for crossing those normal limits.

## Lifecycle and Astro navigation

The custom element initializes on connection and releases Panzoom handlers,
listeners and observers on disconnection. Reconnection is supported without
creating another toolbar or retaining a removed viewer's handlers.

Astro bundled scripts can run once across ClientRouter navigation. The viewer
therefore uses per-element lifecycle rather than depending on a page-global
querySelector that only runs on the first page. Native Astro navigation and
multiple instances are part of package acceptance; persisting an element while
changing its SVG content is not an implied capability.

## Verification scope

The browser suite exercises actual SVG geometry and native Chromium inputs.
Chromium touch emulation is not physical-device or Safari/Firefox qualification.
The Astro fixture uses native Astro build/check, and installed-consumer acceptance
covers package exports and shipped CSS/component files in addition to source tests.
