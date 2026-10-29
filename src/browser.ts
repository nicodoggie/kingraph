import type { GraphRenderOptions } from './adapters.js';
import renderDot from './render_graph.js';
import { renderSvg } from './svg.js';
import { preparePictureGraph, escapeSvgPictureHrefs } from './pictures.js';
import { svgToPng, svgToPngImage } from './browser_png.js';
import type { FamilyTree } from './types.js';
import { loadPictureAsset } from './browser_pictures.js';

export type BrowserRenderFormat = 'dot' | 'svg' | 'png' | 'png-image';
export interface BrowserRenderOptions<
    T extends FamilyTree = FamilyTree,
> extends GraphRenderOptions<T> {
    format?: BrowserRenderFormat;
    /** PNG pixel scale. Defaults to the browser devicePixelRatio. */
    scale?: number;
}

export function render<T extends FamilyTree>(
    data: T,
    options: BrowserRenderOptions<T> & { format: 'png' },
): Promise<Uint8Array>;
export function render<T extends FamilyTree>(
    data: T,
    options: BrowserRenderOptions<T> & { format: 'png-image' },
): Promise<HTMLImageElement>;
export function render<T extends FamilyTree>(
    data: T,
    options?: BrowserRenderOptions<T> & { format?: 'svg' | 'dot' },
): Promise<string>;
export function render<T extends FamilyTree>(
    data: T,
    options: BrowserRenderOptions<T>,
): Promise<string | Uint8Array | HTMLImageElement>;
export async function render<T extends FamilyTree>(
    data: T,
    options: BrowserRenderOptions<T> = {},
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
    if (format === 'dot') return renderDot(data, options);
    if (
        (format === 'png' || format === 'png-image') &&
        options.scale !== undefined &&
        (!Number.isFinite(options.scale) || options.scale <= 0)
    ) {
        throw new RangeError('PNG scale must be a positive, finite number.');
    }
    const { dot, images } = await preparePictureGraph(
        data,
        options,
        loadPictureAsset,
        format === 'svg' ? (options.pictureMode ?? 'link') : 'embed',
    );
    const svg = escapeSvgPictureHrefs(await renderSvg(dot, images), images);
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

export type {
    ResolvedPicture,
    PictureResolver,
    PictureMode,
    ResolvedPictureAsset,
    PictureLoadContext,
    PictureLoader,
} from './pictures.js';
export type { PictureSource } from './v2/schemas.js';
export {
    loadPicture,
    loadPictureAsset,
    embedSvgPictures,
} from './browser_pictures.js';
export { svgToPng };

export interface BrowserRenderFunction<T extends FamilyTree> {
    (
        data: T,
        options: BrowserRenderOptions<T> & { format: 'png' },
    ): Promise<Uint8Array>;
    (
        data: T,
        options: BrowserRenderOptions<T> & { format: 'png-image' },
    ): Promise<HTMLImageElement>;
    (
        data: T,
        options?: BrowserRenderOptions<T> & { format?: 'svg' | 'dot' },
    ): Promise<string>;
    (
        data: T,
        options: BrowserRenderOptions<T>,
    ): Promise<string | Uint8Array | HTMLImageElement>;
}
