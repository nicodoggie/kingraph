import { instance } from '@viz-js/viz';

let viz: ReturnType<typeof instance> | undefined;

/** Share WASM initialization; each graph is still rendered independently. */
export async function renderSvg(dot: string): Promise<string> {
    const renderer = await (viz ??= instance());
    return renderer.renderString(dot, { format: 'svg', engine: 'dot' });
}
