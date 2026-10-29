import { spawnSync } from 'node:child_process';
import {
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { expect, it } from 'vitest';
import { preview } from 'vite';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));

it('builds and checks a source-relative v2 Astro picture under a non-root base', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kingraph-astro-pictures-'));
    let deployed: Awaited<ReturnType<typeof preview>> | undefined;
    try {
        await mkdir(join(root, 'src', 'pages'), { recursive: true });
        await mkdir(join(root, 'src', 'data'), { recursive: true });
        await mkdir(join(root, 'node_modules', '@nicodoggie'), {
            recursive: true,
        });
        await mkdir(join(root, 'node_modules', '@astrojs'), {
            recursive: true,
        });
        await symlink(
            packageRoot,
            join(root, 'node_modules', '@nicodoggie', 'kingraph'),
            'dir',
        );
        for (const name of ['astro', 'typescript']) {
            await symlink(
                join(packageRoot, 'node_modules', name),
                join(root, 'node_modules', name),
                'dir',
            );
        }
        await symlink(
            join(packageRoot, 'node_modules', '@astrojs', 'check'),
            join(root, 'node_modules', '@astrojs', 'check'),
            'dir',
        );
        await writeFile(
            join(root, 'package.json'),
            JSON.stringify({
                name: 'kingraph-astro-pictures',
                private: true,
                type: 'module',
            }),
        );
        await writeFile(
            join(root, 'tsconfig.json'),
            JSON.stringify({
                extends: 'astro/tsconfigs/strict',
                include: ['.astro/types.d.ts', '**/*'],
                exclude: ['dist'],
            }),
        );
        await writeFile(
            join(root, 'astro.config.mjs'),
            `
import { defineConfig } from 'astro/config';
import kingraph from '@nicodoggie/kingraph/vite';
export default defineConfig({ base: '/book', vite: { plugins: [kingraph()] } });
`,
        );
        await writeFile(
            join(root, 'src', 'env.d.ts'),
            '/// <reference types="astro/client" />\n/// <reference types="@nicodoggie/kingraph/vite/client" />\n',
        );
        await writeFile(
            join(root, 'src', 'data', 'family.yaml'),
            `schemaVersion: 2
pictures:
  portrait: {path: './portrait.png'}
  unused: {path: './missing.png'}
people:
  Avery: {picture: portrait}
families:
  - parents: [Avery]
    children: [Rowan]
`,
        );
        const png = new Resvg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"><rect width="24" height="12" fill="red"/></svg>',
        )
            .render()
            .asPng();
        await writeFile(join(root, 'src', 'data', 'portrait.png'), png);
        await writeFile(
            join(root, 'src', 'pages', 'index.astro'),
            `---
import svg from '../data/family.yaml?kingraph&raw';
import url, { width, height } from '../data/family.yaml?kingraph';
---
<html lang="en"><head><title>V2 pictures</title></head><body>
<main><Fragment set:html={svg} /><img src={url} width={width} height={height} alt="Portable family tree" /></main>
</body></html>`,
        );
        const astroPackage = new URL(
            '../node_modules/astro/package.json',
            import.meta.url,
        );
        const metadata = JSON.parse(await readFile(astroPackage, 'utf8')) as {
            bin: { astro: string };
        };
        const cli = fileURLToPath(new URL(metadata.bin.astro, astroPackage));
        for (const operation of ['build', 'check']) {
            const result = spawnSync(
                process.execPath,
                [cli, operation, '--root', root],
                {
                    cwd: root,
                    env: {
                        ...process.env,
                        ASTRO_TELEMETRY_DISABLED: '1',
                        CI: '1',
                    },
                    encoding: 'utf8',
                    timeout: 90_000,
                    maxBuffer: 5 * 1024 * 1024,
                },
            );
            expect(
                result.status,
                `${operation}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
            ).toBe(0);
        }
        const html = await readFile(join(root, 'dist', 'index.html'), 'utf8');
        const href = html.match(
            /<image\b[^>]*\b(?:xlink:)?href="([^"]+)"/,
        )?.[1];
        expect(href).toMatch(/^\/book\/_astro\/portrait[\w.-]+\.png$/);
        expect(html).not.toMatch(/file:|kingraph.invalid|data:image\/png/);
        expect(html).not.toContain(root);
        expect(
            await readFile(join(root, 'dist', href!.slice('/book/'.length))),
        ).toEqual(png);
        const portable = html.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1];
        expect(portable).toMatch(/^\/book\/_astro\/family[\w.-]+\.svg$/);
        expect(
            await readFile(
                join(root, 'dist', portable!.slice('/book/'.length)),
                'utf8',
            ),
        ).toContain('data:image/png;base64,');
        for (const file of await readdir(join(root, 'dist'), {
            recursive: true,
        })) {
            if (!file.endsWith('.js')) continue;
            expect(
                await readFile(join(root, 'dist', file), 'utf8'),
            ).not.toMatch(/@viz-js|Graphviz|customPictureLoader/);
        }
        deployed = await preview({
            configFile: false,
            root,
            base: '/book/',
            logLevel: 'silent',
            preview: { host: '127.0.0.1', port: 0 },
        });
        const url = deployed.resolvedUrls?.local[0];
        if (!url)
            throw new Error('Expected the built Astro fixture to be served.');
        const response = await fetch(new URL(href!, url));
        expect(response.ok).toBe(true);
        expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    } finally {
        if (deployed)
            await new Promise<void>((resolve, reject) =>
                deployed!.httpServer.close((error) =>
                    error ? reject(error) : resolve(),
                ),
            );
        await rm(root, { recursive: true, force: true });
    }
}, 120_000);
