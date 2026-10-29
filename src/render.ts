import type { GraphRenderOptions } from './adapters.js';
import renderDot from './render_graph.js';
import { renderSvg } from './svg.js';
import { preparePictureGraph, escapeSvgPictureHrefs } from './pictures.js';
import type { FamilyTree } from './types.js';
import { loadPictureAsset } from './node_pictures.js';

export type RenderFormat = 'dot' | 'svg' | 'png';
export interface RenderOptions<
    T extends FamilyTree = FamilyTree,
> extends GraphRenderOptions<T> {
    format?: RenderFormat;
}

export function render<T extends FamilyTree>(
    data: T,
    options: RenderOptions<T> & { format: 'png' },
): Promise<Buffer>;
export function render<T extends FamilyTree>(
    data: T,
    options?: RenderOptions<T> & { format?: 'svg' | 'dot' },
): Promise<string>;
export function render<T extends FamilyTree>(
    data: T,
    options: RenderOptions<T>,
): Promise<string | Buffer>;
export async function render<T extends FamilyTree>(
    data: T,
    options: RenderOptions<T> = {},
): Promise<string | Buffer> {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Render options must be an object.');
    }
    const format = options.format ?? 'svg';
    if (!['dot', 'svg', 'png'].includes(format)) {
        throw new RangeError(
            `Unsupported render format: ${String(format)}. Expected dot, svg, or png.`,
        );
    }
    if (format === 'dot') return renderDot(data, options);
    const { dot, images } = await preparePictureGraph(
        data,
        options,
        loadPictureAsset,
        format === 'png' ? 'embed' : (options.pictureMode ?? 'embed'),
    );
    const svg = escapeSvgPictureHrefs(await renderSvg(dot, images), images);
    if (format === 'svg') return svg;
    const { svgToPng } = await import('./png.js');
    return svgToPng(svg);
}

export default render;

/** Versioned entries preserve format-specific returns and callback tree types. */
export interface RenderFunction<T extends FamilyTree> {
    (data: T, options: RenderOptions<T> & { format: 'png' }): Promise<Buffer>;
    (
        data: T,
        options?: RenderOptions<T> & { format?: 'svg' | 'dot' },
    ): Promise<string>;
    (data: T, options: RenderOptions<T>): Promise<string | Buffer>;
}
