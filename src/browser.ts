import type { GraphRenderOptions } from './adapters.js';
import renderDot from './render_graph.js';
import { renderSvg } from './svg.js';
import { svgToPng, svgToPngImage } from './browser_png.js';
import type { FamilyTree } from './types.js';

export type BrowserRenderFormat = 'dot' | 'svg' | 'png' | 'png-image';
export interface BrowserRenderOptions extends GraphRenderOptions {
    format?: BrowserRenderFormat;
    /** PNG pixel scale. Defaults to the browser devicePixelRatio. */
    scale?: number;
}

export function render(
    data: FamilyTree,
    options: BrowserRenderOptions & { format: 'png' },
): Promise<Uint8Array>;
export function render(
    data: FamilyTree,
    options: BrowserRenderOptions & { format: 'png-image' },
): Promise<HTMLImageElement>;
export function render(
    data: FamilyTree,
    options?: BrowserRenderOptions & { format?: 'svg' | 'dot' },
): Promise<string>;
export function render(
    data: FamilyTree,
    options: BrowserRenderOptions,
): Promise<string | Uint8Array | HTMLImageElement>;
export async function render(
    data: FamilyTree,
    options: BrowserRenderOptions = {},
): Promise<string | Uint8Array | HTMLImageElement> {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Render options must be an object.');
    }
    const format = options.format ?? 'svg';
    if (!['dot', 'svg', 'png', 'png-image'].includes(format)) {
        throw new RangeError(
            `Unsupported browser render format: ${String(format)}.`,
        );
    }
    const dot = renderDot(data, options);
    if (format === 'dot') return dot;
    const svg = await renderSvg(dot);
    if (format === 'svg') return svg;
    if (format === 'png') return svgToPng(svg, options.scale);
    return svgToPngImage(svg, options.scale);
}

export default render;
export { renderDot };
export { parseFamilyYaml } from './yaml.js';
export type {
    FamilyTree,
    Family,
    Person,
    StyleProperties,
    Stylesheet,
} from './types.js';

export { asOf, defaultDateAdapter, defaultAgeAdapter } from './adapters.js';
export type {
    DateValue,
    PersonContext,
    DateContext,
    DateAdapter,
    AgeContext,
    AgeAdapter,
    GraphRenderOptions,
} from './adapters.js';
