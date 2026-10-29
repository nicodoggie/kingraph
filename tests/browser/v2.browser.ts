import { describe, expect, it, vi } from 'vitest';
import * as browser from '../../src/browser.js';
import type { PictureSource, PictureLoadContext } from '../../src/browser.js';

function redSource() {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f00000';
    context.fillRect(0, 0, 24, 16);
    try {
        return canvas.toDataURL('image/png');
    } finally {
        canvas.width = canvas.height = 0;
    }
}

async function expectPaint(png: Uint8Array) {
    const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: 'image/png' }),
    );
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    try {
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
        ).data;
        expect(
            pixels.some(
                (value, i) =>
                    i % 4 === 0 &&
                    value > 200 &&
                    pixels[i + 1] < 40 &&
                    pixels[i + 2] < 40 &&
                    pixels[i + 3] === 255,
            ),
        ).toBe(true);
    } finally {
        bitmap.close();
        canvas.width = canvas.height = 0;
    }
}

describe('v2 browser native pictures', () => {
    it('links SVG by default, forces embedded PNG, and makes an existing layout portable', async () => {
        const href =
            new URL(
                '../../playground/examples/portraits/alex.png',
                import.meta.url,
            ).href + '?portrait=alex&size=original';
        const input = {
            schemaVersion: 2 as const,
            pictures: { portrait: { url: href } },
            people: { A: { picture: 'portrait' }, B: { picture: 'portrait' } },
        };
        const svg = await browser.render(input);
        expect(svg).toContain(href.replace('&', '&amp;'));
        const fetch = vi.spyOn(globalThis, 'fetch');
        try {
            // Vite/Astro emits public root-relative URLs in inline SVG.
            const inlineSvg = svg.replaceAll(new URL(href).origin, '');
            const portable = await browser.embedSvgPictures(inlineSvg);
            expect(fetch).toHaveBeenCalledTimes(1);
            const parse = (source: string) =>
                new DOMParser().parseFromString(source, 'image/svg+xml');
            const original = parse(svg),
                embedded = parse(portable);
            expect(original.querySelector('parsererror')).toBeNull();
            expect(
                original.querySelector('image')?.getAttribute('xlink:href'),
            ).toBe(href);
            for (const element of embedded.querySelectorAll('image'))
                expect(
                    element.getAttribute('xlink:href') ??
                        element.getAttribute('href'),
                ).toMatch(/^data:image\/png;base64,/);
            for (const doc of [original, embedded])
                for (const element of doc.querySelectorAll('image')) {
                    element.removeAttribute('href');
                    element.removeAttributeNS(
                        'http://www.w3.org/1999/xlink',
                        'href',
                    );
                }
            expect(
                embedded.documentElement.isEqualNode(original.documentElement),
            ).toBe(true);
            fetch.mockRejectedValue(
                new Error('original resources unavailable'),
            );
            const png = await browser.svgToPng(portable, 1);
            expect(png.subarray(0, 8)).toEqual(
                new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
            );
            expect(fetch).toHaveBeenCalledTimes(1);
        } finally {
            fetch.mockRestore();
        }
        const data = redSource();
        const tree = { ...input, pictures: { portrait: { data } } };
        await expectPaint(
            await browser.render(tree, {
                format: 'png',
                pictureMode: 'link',
                scale: 1,
            }),
        );
        const loader = vi.fn(
            (_source: PictureSource, _context: PictureLoadContext) => ({
                href: data,
                width: 24,
                height: 16,
            }),
        );
        const image = await browser.render(tree, {
            format: 'png-image',
            pictureMode: 'link',
            pictureLoader: loader,
            scale: 1,
        });
        try {
            expect(image.naturalWidth).toBeGreaterThan(0);
            expect(loader.mock.calls[0]?.[1]).toMatchObject({
                id: 'portrait',
                mode: 'embed',
            });
        } finally {
            image.removeAttribute('src');
        }
        const linkedRed = await browser.render(tree, {
            pictureLoader: () => ({ href: data, width: 24, height: 16 }),
        });
        await expectPaint(
            await browser.svgToPng(
                await browser.embedSvgPictures(linkedRed),
                1,
            ),
        );
    });

    it('requires source context for relative paths and uses normal Image loading for links', async () => {
        const documentUrl = new URL(
            '../../playground/examples/portraits.yaml',
            import.meta.url,
        ).href;
        const source = { path: 'portraits/alex.png' };
        const fetch = vi.spyOn(globalThis, 'fetch');
        try {
            const picture = await browser.loadPictureAsset(source, {
                id: 'portrait',
                documentUrl,
                mode: 'link',
            });
            expect(picture.href).toBe(new URL(source.path, documentUrl).href);
            expect(picture.width).toBeGreaterThan(0);
            expect(fetch).not.toHaveBeenCalled();
            await expect(
                browser.loadPictureAsset(source, {
                    id: 'portrait',
                    mode: 'link',
                }),
            ).rejects.toThrow(/portrait.*documentUrl/);
        } finally {
            fetch.mockRestore();
        }
    });

    it('cleans up successful/failed embed decoding and reports unsupported or unavailable resources', async () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL');
        try {
            await browser.loadPictureAsset(
                { data: redSource() },
                { id: 'good', mode: 'link' },
            );
            await expect(
                browser.loadPictureAsset(
                    { data: 'data:image/png;base64,YmFk' },
                    { id: 'bad', mode: 'embed' },
                ),
            ).rejects.toThrow(/bad.*decod/i);
            expect(revoke).toHaveBeenCalledTimes(2);
            await expect(
                browser.embedSvgPictures(
                    '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://127.0.0.1:1/no.png"/></svg>',
                ),
            ).rejects.toThrow(/picture.*CORS/i);
            await expect(browser.embedSvgPictures('<svg>')).rejects.toThrow(
                /SVG/,
            );
            // Successful siblings settle and release their object URLs even if another image fails.
            await expect(
                browser.embedSvgPictures(
                    `<svg xmlns="http://www.w3.org/2000/svg"><image href="${redSource()}"/><image href="data:image/png;base64,YmFk"/></svg>`,
                ),
            ).rejects.toThrow(/picture/i);
            expect(revoke).toHaveBeenCalledTimes(4);
        } finally {
            revoke.mockRestore();
        }
    });
});
