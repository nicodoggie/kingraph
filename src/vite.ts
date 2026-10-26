import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Plugin } from 'vite';
import { validateGraphRenderOptions } from './adapters.js';
import type { GraphRenderOptions } from './adapters.js';
import { render } from './render.js';
import { parseFamilyYaml } from './yaml.js';

/** Render opt-in family YAML imports on Vite's Node side, never in client code. */
export function kingraph(options: GraphRenderOptions = {}): Plugin {
    validateGraphRenderOptions(options);
    let building = false;
    return {
        name: 'kingraph',
        enforce: 'pre',
        configResolved(config) {
            building = config.command === 'build';
        },
        async load(id) {
            const separator = id.indexOf('?');
            if (separator < 0) return;
            const filename = id.slice(0, separator);
            const query = new URLSearchParams(id.slice(separator + 1));
            if (!/\.ya?ml$/i.test(filename) || !query.has('kingraph')) return;
            this.addWatchFile(filename);
            try {
                const source = await readFile(filename, 'utf8');
                const svg = await render(parseFamilyYaml(source, filename), {
                    ...options,
                    format: 'svg',
                });
                // Graphviz always emits a viewBox. Its dimensions preserve the
                // diagram's aspect ratio without pretending to be CSS pixels.
                const viewBox =
                    /\bviewBox="[^"\s]+\s+[^"\s]+\s+([\d.]+)\s+([\d.]+)"/.exec(
                        svg,
                    );
                if (!viewBox)
                    throw new Error('Rendered SVG has no viewBox dimensions.');
                let value: string;
                if (query.has('raw')) {
                    value = JSON.stringify(svg);
                } else if (building) {
                    const reference = this.emitFile({
                        type: 'asset',
                        name: basename(filename).replace(/\.ya?ml$/i, '.svg'),
                        source: svg,
                    });
                    value = `import.meta.ROLLUP_FILE_URL_${reference}`;
                } else {
                    value = JSON.stringify(
                        `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
                    );
                }
                return {
                    code: `export default ${value};\nexport const width = ${Number(viewBox[1])};\nexport const height = ${Number(viewBox[2])};`,
                    map: { mappings: '' },
                };
            } catch (error) {
                this.error({
                    message: `Could not render ${filename}: ${error instanceof Error ? error.message : String(error)}`,
                    id: filename,
                });
            }
        },
    };
}

export default kingraph;
