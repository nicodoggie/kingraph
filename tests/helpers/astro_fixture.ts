import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Build a real Astro/MDX consumer without installing or mutating its dependencies. */
export async function createAstroFixture(
    root: string,
    packageRoot: string,
    dependencyRoot: string,
): Promise<void> {
    const modules = join(root, 'node_modules');
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await mkdir(join(modules, '@nicodoggie'), { recursive: true });
    await mkdir(join(modules, '@astrojs'), { recursive: true });
    await symlink(packageRoot, join(modules, '@nicodoggie', 'kingraph'), 'dir');
    for (const name of ['astro', 'typescript']) {
        await symlink(join(dependencyRoot, name), join(modules, name), 'dir');
    }
    for (const name of ['mdx', 'check']) {
        await symlink(
            join(dependencyRoot, '@astrojs', name),
            join(modules, '@astrojs', name),
            'dir',
        );
    }
    await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
            name: 'kingraph-astro-consumer',
            private: true,
            type: 'module',
            scripts: { build: 'astro build', check: 'astro check' },
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
import mdx from '@astrojs/mdx';
import kingraph from '@nicodoggie/kingraph/vite';
export default defineConfig({
    integrations: [mdx()],
    vite: { plugins: [kingraph()], build: { ssrEmitAssets: true } },
});
`,
    );
    await writeFile(
        join(root, 'src', 'env.d.ts'),
        `/// <reference types="astro/client" />\n/// <reference types="@nicodoggie/kingraph/vite/client" />\n`,
    );
    await writeFile(
        join(root, 'src', 'family.yaml'),
        `
people:
  Avery:
    name: Avery Example
    born: '1970-06-15'
    links: ['#person-details']
  Rowan:
    name: Rowan Example
    born: '2000-02-29'
  Sage:
    name: Sage Example
families:
  - parents: [Avery]
    children: [Rowan]
    children2: [Sage]
`,
    );
    const frontmatter = `
import { ClientRouter } from 'astro:transitions';
import KingraphViewer from '@nicodoggie/kingraph/astro';
import svg from '../family.yaml?kingraph&raw';
`;
    const style = `<style is:global>
body { margin: 0; padding: 2rem; background: #171c26; color: #e8ecf4; font: 16px system-ui, sans-serif; }
main { max-width: 960px; margin: auto; } a { color: #a8cdff; } nav { display: flex; gap: 1.5rem; margin: 1.5rem 0; }
</style>`;
    await writeFile(
        join(root, 'src', 'pages', 'index.astro'),
        `---\n${frontmatter}---
<html lang="en"><head><meta charset="UTF-8" /><title>Kingraph viewer — native Astro</title><ClientRouter /></head>
<body><main><h1>Kingraph viewer</h1><p>A native Astro component. No React island; the diagram is already in the page.</p>
<KingraphViewer svg={svg} label="Primary family tree" presentation="embedded" modal fullscreen />
<h2>Independent second instance</h2><KingraphViewer svg={svg} label="Secondary family tree" height="220px" />
<nav><a href="/next/">Next diagram page</a><a href="/story/">MDX example</a></nav>
<section id="person-details"><h2>Avery Example</h2><p>The person link remains a native anchor.</p></section>
</main></body></html>${style}`,
    );
    await writeFile(
        join(root, 'src', 'pages', 'next.astro'),
        `---\n${frontmatter}---
<html lang="en"><head><meta charset="UTF-8" /><title>Next diagram — Kingraph</title><ClientRouter /></head>
<body><main><h1>Next diagram page</h1><KingraphViewer svg={svg} label="Next family tree" modal />
<nav><a href="/">Back to first page</a><a href="/story/">MDX example</a></nav></main></body></html>${style}`,
    );
    await writeFile(
        join(root, 'src', 'pages', 'story.mdx'),
        `import KingraphViewer from '@nicodoggie/kingraph/astro';
import svg from '../family.yaml?kingraph&raw';

# A family tree in MDX

<KingraphViewer svg={svg} label="MDX family tree" modal />

[Back to first page](/)
`,
    );
}
