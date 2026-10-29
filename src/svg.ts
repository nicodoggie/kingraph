import type { ImageSize } from '@viz-js/viz';
import { instance } from '@viz-js/viz';

let viz: ReturnType<typeof instance> | undefined;

/** Share the asset-free engine; image layouts need fresh native image caches. */
export async function renderSvg(
    dot: string,
    images?: ImageSize[],
): Promise<string> {
    // Viz retains image dimensions by name across renders. Reusing that cache
    // would ignore changed dimensions at a stable linked URL. Use a fresh
    // instance for image layouts, retaining reuse for asset-free graphs.
    const renderer = await (images?.length ? instance() : (viz ??= instance()));
    return renderer.renderString(dot, { format: 'svg', engine: 'dot', images });
}
