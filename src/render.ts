import renderDot from './render_graph.js';
import { renderSvg } from './svg.js';
import type { FamilyTree } from './types.js';

export type RenderFormat = 'dot' | 'svg' | 'png';
export interface RenderOptions {
    format?: RenderFormat;
}

export function render(
    data: FamilyTree,
    options: { format: 'png' },
): Promise<Buffer>;
export function render(
    data: FamilyTree,
    options?: { format?: 'svg' | 'dot' },
): Promise<string>;
export function render(
    data: FamilyTree,
    options: RenderOptions,
): Promise<string | Buffer>;
export async function render(
    data: FamilyTree,
    options: RenderOptions = {},
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
    const dot = renderDot(data);
    if (format === 'dot') return dot;
    const svg = await renderSvg(dot);
    if (format === 'svg') return svg;
    const { svgToPng } = await import('./png.js');
    return svgToPng(svg);
}

export default render;
