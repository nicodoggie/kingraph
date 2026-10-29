import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { Resvg } from '@resvg/resvg-js';
import { describe, it, expect } from 'vitest';
import { loadPictureAsset } from '../src/node_pictures.js';

const png = new Resvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><path d="M0 0h3v2H0z"/></svg>',
)
    .render()
    .asPng();
const data = `data:image/png;base64,${png.toString('base64')}`;
const context = { id: 'portrait', mode: 'embed' as const };

describe('Node picture assets', () => {
    it('validates data and preserves intrinsic dimensions', async () => {
        expect(await loadPictureAsset({ data }, context)).toEqual({
            href: data,
            width: 3,
            height: 2,
        });
    });
    it('decodes JPEG and fully transparent PNG bytes', async () => {
        const jpeg = await readFile(new URL('./7_image1.jpg', import.meta.url));
        const jpegData = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
        const asset = await loadPictureAsset({ data: jpegData }, context);
        expect(asset.href).toBe(jpegData);
        expect(asset.width).toBeGreaterThan(0);
        expect(asset.height).toBeGreaterThan(0);
        const transparent = new Resvg(
            '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="4"/>',
        )
            .render()
            .asPng();
        expect(
            await loadPictureAsset(
                {
                    data: `data:image/png;base64,${transparent.toString('base64')}`,
                },
                context,
            ),
        ).toMatchObject({ width: 2, height: 4 });
    });
    it('anchors file paths explicitly and supports linked files', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'kingraph-node-'));
        try {
            await writeFile(join(dir, 'portrait.png'), png);
            const documentUrl = pathToFileURL(join(dir, 'family.yaml')).href;
            const jpeg = await readFile(
                new URL('./7_image1.jpg', import.meta.url),
            );
            await writeFile(join(dir, 'portrait.jpg'), jpeg);
            expect(
                (
                    await loadPictureAsset(
                        { path: 'portrait.jpg' },
                        { ...context, documentUrl },
                    )
                ).href,
            ).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);

            expect(
                await loadPictureAsset(
                    { path: 'portrait.png' },
                    { ...context, documentUrl },
                ),
            ).toEqual({ href: data, width: 3, height: 2 });
            expect(
                (
                    await loadPictureAsset(
                        { path: 'portrait.png' },
                        { ...context, documentUrl, mode: 'link' },
                    )
                ).href,
            ).toBe(pathToFileURL(join(dir, 'portrait.png')).href);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
    it('rejects missing/non-file bases and contextualizes errors without payloads', async () => {
        await expect(
            loadPictureAsset({ data }, {
                ...context,
                mode: 'invalid',
            } as never),
        ).rejects.toThrow(/portrait/);
        for (const documentUrl of [
            undefined,
            'https://example.invalid/family.yaml',
        ]) {
            await expect(
                loadPictureAsset(
                    { path: 'portrait.png' },
                    { ...context, documentUrl },
                ),
            ).rejects.toThrow(/portrait/);
        }
        await expect(
            loadPictureAsset({ data: 'data:image/png;base64,YmFk' }, context),
        ).rejects.toThrow(/portrait/);
        await expect(
            loadPictureAsset(
                { data: data.replace('image/png', 'image/jpeg') },
                context,
            ),
        ).rejects.toThrow(/portrait/);
        await expect(
            loadPictureAsset(
                {
                    data: `data:image/png;base64,${png.subarray(0, 30).toString('base64')}`,
                },
                context,
            ),
        ).rejects.toThrow(/portrait/);
    });
    it('loads owned HTTP bytes, accepts nonspecific MIME, rejects mismatch and HTTP failures', async () => {
        const jpeg = await readFile(new URL('./7_image1.jpg', import.meta.url));
        const server = createServer((req, res) => {
            if (req.url === '/missing') {
                res.writeHead(404).end();
                return;
            }
            if (req.url === '/wrong')
                res.setHeader('Content-Type', 'image/jpeg');
            if (req.url === '/generic')
                res.setHeader('Content-Type', 'application/octet-stream');
            res.end(
                req.url === '/jpeg'
                    ? jpeg
                    : req.url === '/corrupt'
                      ? png.subarray(0, 30)
                      : req.url === '/unsupported'
                        ? Buffer.from('GIF89a')
                        : png,
            );
        });
        await new Promise<void>((resolve) =>
            server.listen(0, '127.0.0.1', resolve),
        );
        try {
            const address = server.address();
            if (!address || typeof address === 'string')
                throw new Error('Missing address');
            const base = `http://127.0.0.1:${address.port}`;
            for (const suffix of ['/', '/generic']) {
                const url = base + suffix;
                expect(await loadPictureAsset({ url }, context)).toEqual({
                    href: data,
                    width: 3,
                    height: 2,
                });
                expect(
                    (
                        await loadPictureAsset(
                            { url },
                            { ...context, mode: 'link' },
                        )
                    ).href,
                ).toBe(url);
            }
            expect(
                (await loadPictureAsset({ url: base + '/jpeg' }, context)).href,
            ).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
            for (const suffix of [
                '/wrong',
                '/missing',
                '/corrupt',
                '/unsupported',
            ])
                await expect(
                    loadPictureAsset({ url: base + suffix }, context),
                ).rejects.toThrow(/portrait/);
        } finally {
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
        }
    });
});
