import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { build, createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { asOf, type GraphRenderOptions } from '../src/v1/index.js';
import kingraph from '../src/vite.js';

let root: string;
let server: ViteDevServer | undefined;
const family = 'families:\n  - parents: [Marge, Homer]\n    children: [Lisa]\n';
const policyFamily = `${family}people:\n  Lisa:\n    born: '3 Frostwane 812'\n`;
const config: GraphRenderOptions = {
    dateAdapter: {
        formatYear: function customCalendarYear() {
            return 'Era 812';
        },
        formatDate: (value) => `Calendar date: ${value}`,
    },
    ageAdapter: ({ asOf }) => `Chronicle at ${asOf}`,
    asOf: 'original reference',
};
const policyOptions = { ...config, ...asOf('14 Frostwane 843') };

function expectPolicySvg(svg: unknown) {
    expect(String(svg)).toContain('<svg');
    expect(String(svg)).toContain('Era 812');
    expect(String(svg)).toContain('Calendar date: 3 Frostwane 812');
    expect(String(svg)).toContain('Chronicle at 14 Frostwane 843');
    expect(String(svg)).not.toContain('original reference');
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kingraph-vite-'));
    await writeFile(join(root, 'family.yaml'), family);
});
afterEach(async () => {
    await server?.close();
    server = undefined;
    await rm(root, { recursive: true, force: true });
});

function outputs(result: Awaited<ReturnType<typeof build>>) {
    return (Array.isArray(result) ? result : [result]).flatMap((item) => {
        if (!('output' in item))
            throw new Error('Expected a one-shot Vite build.');
        return item.output;
    });
}

async function importCode(code: string): Promise<Record<string, unknown>> {
    return import(
        `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    );
}

async function bundle(ssr = false, options?: GraphRenderOptions) {
    await writeFile(
        join(root, 'entry.js'),
        `
        export { default as url, width, height } from './family.yaml?kingraph';
        export { default as svg } from './family.yaml?kingraph&raw';
    `,
    );
    return outputs(
        await build({
            configFile: false,
            root,
            base: '/book/',
            logLevel: 'silent',
            plugins: [kingraph(options)],
            build: {
                write: false,
                minify: false,
                ...(ssr
                    ? { ssr: join(root, 'entry.js'), ssrEmitAssets: true }
                    : {
                          rolldownOptions: {
                              input: join(root, 'entry.js'),
                              preserveEntrySignatures: 'strict',
                          },
                      }),
            },
        }),
    );
}

describe('kingraph Vite integration', () => {
    it.each([[null], [[]], [42]])('rejects malformed config %j', (options) => {
        // @ts-expect-error exercise untyped configuration callers
        expect(() => kingraph(options)).toThrow(/options must be an object/i);
    });

    it.each([false, true])(
        'emits a hashed SVG URL, raw SVG and dimensions (SSR=%s)',
        async (ssr) => {
            const result = await bundle(ssr);
            const assets = result.filter(
                (item) =>
                    item.type === 'asset' && item.fileName.endsWith('.svg'),
            );
            expect(assets).toHaveLength(1);
            const asset = assets[0];
            expect(asset.fileName).toMatch(/family-[\w-]+\.svg$/);
            const chunk = result.find((item) => item.type === 'chunk');
            if (!chunk || asset.type !== 'asset')
                throw new Error('Expected Vite output.');
            const module = await importCode(chunk.code);
            expect(module.url).toBe(`/book/${asset.fileName}`);
            expect(String(module.svg)).toContain('<svg');
            expect(String(asset.source)).toBe(module.svg);
            expect(module.width).toBeGreaterThan(0);
            expect(module.height).toBeGreaterThan(0);
            expect(
                Object.keys(chunk.modules).some((id) => id.includes('@viz-js')),
            ).toBe(false);
        },
    );

    it('renders shared date/age config with a reference override only on the Node side', async () => {
        await writeFile(join(root, 'family.yaml'), policyFamily);
        // JavaScript callers can supply extra fields; the plugin still owns SVG output.
        const options = { ...policyOptions, format: 'dot' };
        const result = await bundle(false, options);
        const asset = result.find(
            (item) => item.type === 'asset' && item.fileName.endsWith('.svg'),
        );
        const chunk = result.find((item) => item.type === 'chunk');
        if (!chunk || !asset || asset.type !== 'asset')
            throw new Error('Expected a JS chunk and SVG asset.');
        const module = await importCode(chunk.code);
        expect(module.url).toBe(`/book/${asset.fileName}`);
        expectPolicySvg(module.svg);
        expectPolicySvg(asset.source);
        expect(String(asset.source)).toBe(module.svg);
        expect(
            Object.keys(chunk.modules).some((id) =>
                /@viz-js|\/(?:adapters|render_graph|render)\.[jt]s/.test(id),
            ),
        ).toBe(false);
        expect(chunk.code).not.toContain('customCalendarYear');
        expect(config.asOf).toBe('original reference');
    });

    it('leaves ordinary YAML imports to other plugins', async () => {
        await writeFile(join(root, 'ordinary.yml'), 'ordinary: yaml');
        await writeFile(
            join(root, 'entry.js'),
            "export { default } from './ordinary.yml';",
        );
        const result = outputs(
            await build({
                configFile: false,
                root,
                logLevel: 'silent',
                plugins: [
                    kingraph(),
                    {
                        name: 'ordinary-yaml-consumer',
                        transform(_source, id) {
                            if (id.endsWith('/ordinary.yml'))
                                return 'export default "ordinary YAML";';
                        },
                    },
                ],
                build: {
                    write: false,
                    minify: false,
                    lib: { entry: join(root, 'entry.js'), formats: ['es'] },
                },
            }),
        );
        const chunk = result.find((item) => item.type === 'chunk');
        if (!chunk) throw new Error('Expected a JS chunk.');
        expect((await importCode(chunk.code)).default).toBe('ordinary YAML');
    });

    it.each(['families: [', "styles:\n  ':digraph':\n    '[': invalid"])(
        'includes the source filename when parsing/rendering fails: %s',
        async (source) => {
            await writeFile(join(root, 'family.yaml'), source);
            await expect(bundle()).rejects.toThrow(/family.yaml/);
        },
    );

    it('uses the real dev server to regenerate both URL and raw modules after a YAML edit', async () => {
        await writeFile(join(root, 'family.yaml'), policyFamily);
        let changed: (() => void) | undefined;
        server = await createServer({
            configFile: false,
            root,
            base: '/book/',
            logLevel: 'silent',
            plugins: [
                kingraph(policyOptions),
                {
                    name: 'observe-native-update',
                    handleHotUpdate({ file }) {
                        if (file === join(root, 'family.yaml')) changed?.();
                    },
                },
            ],
            server: { host: '127.0.0.1', port: 0 },
        });
        await server.listen();
        const url = server.resolvedUrls?.local[0];
        if (!url) throw new Error('Expected a listening Vite server.');
        const response = await fetch(`${url}family.yaml?kingraph&import`);
        expect(response.ok).toBe(true);
        expect(await response.text()).toContain('data:image/svg+xml;base64,');
        const before = await server.ssrLoadModule('/family.yaml?kingraph');
        const raw = await server.ssrLoadModule('/family.yaml?kingraph&raw');
        expectPolicySvg(raw.default);
        const transformed = await server.transformRequest(
            '/family.yaml?kingraph&raw',
        );
        expectPolicySvg((await importCode(transformed?.code ?? '')).default);
        expect(
            Buffer.from(before.default.split(',')[1], 'base64').toString(),
        ).toBe(raw.default);
        const updated = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
                () =>
                    reject(new Error('Vite did not observe the YAML change.')),
                10_000,
            );
            changed = () => {
                clearTimeout(timeout);
                resolve();
            };
        });
        await writeFile(
            join(root, 'family.yaml'),
            policyFamily.replaceAll('Lisa', 'Maggie'),
        );
        await updated;
        const after = await server.ssrLoadModule('/family.yaml?kingraph');
        const afterRaw = await server.ssrLoadModule(
            '/family.yaml?kingraph&raw',
        );
        expect(after.default).not.toBe(before.default);
        expect(afterRaw.default).toContain('Maggie');
        expect(afterRaw.default).not.toContain('>Lisa<');
        expectPolicySvg(afterRaw.default);
    }, 20_000);
});
