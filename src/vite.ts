import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePath, type Plugin } from 'vite';
import { validateGraphRenderOptions } from './adapters.js';
import type { GraphRenderOptions } from './adapters.js';
import { loadPictureAsset } from './node_pictures.js';
import type { PictureLoader } from './pictures.js';
import { render } from './render.js';
import { parseFamilyYaml } from './yaml.js';

/** Render opt-in family YAML imports on Vite's Node side, never in client code. */
export function kingraph(options: GraphRenderOptions = {}): Plugin {
    validateGraphRenderOptions(options);
    let building = false;
    const pictureDependencies = new Map<string, Set<string>>();
    return {
        name: 'kingraph',
        enforce: 'pre',
        // SSR imports must contribute assets to the native Vite output graph too.
        config() {
            return { build: { ssrEmitAssets: true } };
        },
        configResolved(config) {
            building = config.command === 'build';
        },
        hotUpdate({ file, modules, timestamp }) {
            const affected = new Set(modules);
            const graph = this.environment.moduleGraph;
            for (const [id, files] of pictureDependencies) {
                if (!files.has(normalizePath(file))) continue;
                const module = graph.getModuleById(id);
                if (!module) continue;
                // A native asset import normally soft-invalidates its importer.
                // Image dimensions also affect Graphviz: rerun this load hook.
                graph.invalidateModule(module, new Set(), timestamp, true);
                affected.add(module);
            }
            return [...affected];
        },
        async load(id) {
            const separator = id.indexOf('?');
            if (separator < 0) return;
            const filename = id.slice(0, separator);
            const query = new URLSearchParams(id.slice(separator + 1));
            if (!/\.ya?ml$/i.test(filename) || !query.has('kingraph')) return;
            this.addWatchFile(filename);
            const dependencies = new Set<string>();
            pictureDependencies.set(id, dependencies);
            try {
                const source = await readFile(filename, 'utf8');
                const documentUrl = pathToFileURL(filename).href;
                const assets = new Map<string, string>();
                const pictureLoader: PictureLoader = async (
                    source,
                    context,
                ) => {
                    if (!('path' in source))
                        return loadPictureAsset(source, context);
                    const file = fileURLToPath(
                        new URL(source.path, documentUrl),
                    );
                    this.addWatchFile(file);
                    dependencies.add(normalizePath(file));
                    // Let the native loader verify bytes and dimensions. A file URL
                    // is never exposed to Graphviz or a browser-facing SVG.
                    const picture = await loadPictureAsset(source, {
                        ...context,
                        mode: 'embed',
                    });
                    if (context.mode === 'embed') return picture;
                    // The renderer isolates native image caches per layout.
                    // Later binding matches the complete quoted href value.
                    const placeholder = `https://kingraph.invalid/vite-picture/${assets.size}`;
                    assets.set(placeholder, file);
                    return { ...picture, href: placeholder };
                };
                const svg = await render(parseFamilyYaml(source, filename), {
                    ...options,
                    documentUrl,
                    pictureMode:
                        options.pictureMode ??
                        (query.has('raw') ? 'link' : 'embed'),
                    pictureLoader: options.pictureLoader ?? pictureLoader,
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
                let imports = '';
                let value = JSON.stringify(svg);
                let index = 0;
                for (const [placeholder, file] of assets) {
                    const name = `picture${index++}`;
                    // Static native imports preserve hashing, base/renderBuiltUrl,
                    // SSR emission, and Vite's image watch dependency graph.
                    imports += `import ${name} from ${JSON.stringify(`${normalizePath(file)}?url&no-inline`)};\n`;
                    value += `.replaceAll(${JSON.stringify(`"${placeholder}"`)}, () => '"' + escapePictureUrl(${name}) + '"')`;
                }
                if (assets.size) {
                    imports += `const escapePictureUrl = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');\n`;
                }
                if (!query.has('raw')) {
                    if (assets.size) {
                        // With an explicit link policy, bind native asset URLs
                        // before constructing the SVG data URL.
                        value = `"data:image/svg+xml;charset=utf-8," + encodeURIComponent(${value})`;
                    } else if (building) {
                        const reference = this.emitFile({
                            type: 'asset',
                            name: basename(filename).replace(
                                /\.ya?ml$/i,
                                '.svg',
                            ),
                            source: svg,
                        });
                        value = `import.meta.ROLLUP_FILE_URL_${reference}`;
                    } else {
                        value = JSON.stringify(
                            `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
                        );
                    }
                }
                return {
                    code: `${imports}export default ${value};\nexport const width = ${Number(viewBox[1])};\nexport const height = ${Number(viewBox[2])};`,
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
