import { renderAsync } from '@resvg/resvg-js';

/** Rasterize SVG without a browser or PhantomJS subprocess. */
export async function svgToPng(svg: string): Promise<Buffer> {
    const image = await renderAsync(svg);
    return image.asPng();
}
