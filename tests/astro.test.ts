import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createAstroFixture } from './helpers/astro_fixture.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const astroPackage = new URL(
    '../node_modules/astro/package.json',
    import.meta.url,
);

it('builds and typechecks a native Astro/MDX consumer with static inline diagrams', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kingraph-astro-'));
    try {
        await createAstroFixture(
            root,
            packageRoot,
            join(packageRoot, 'node_modules'),
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
        expect(html).toContain('aria-label="Primary family tree"');
        expect(html).toContain('presentation="embedded"');
        expect(html).toContain('presentation="standard"');
        expect(html).toContain('aria-label="Secondary family tree"');
        expect(html.match(/<kingraph-viewer\b/g)).toHaveLength(2);
        expect(html.match(/<svg\b/g)).toHaveLength(2);
        expect(html).toContain('Avery Example');
        expect(html).not.toContain('astro-island');
        const mdx = await readFile(
            join(root, 'dist', 'story', 'index.html'),
            'utf8',
        );
        expect(mdx).toContain('aria-label="MDX family tree"');
        expect(mdx).toContain('<svg');
        expect(mdx).toContain('Avery Example');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}, 120_000);
