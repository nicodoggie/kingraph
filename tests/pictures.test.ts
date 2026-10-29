import { readFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { render, renderDot } from '../src/index.js';
import type { PictureResolver, ResolvedPicture } from '../src/index.js';
import type * as v1 from '../src/v1/index.js';
import * as browser from '../src/browser.js';

const red = new Resvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="#f00000" d="M0 0h16v16H0z"/></svg>',
).render();
const picture: ResolvedPicture = {
    dataUrl: `data:image/png;base64,${red.asPng().toString('base64')}`,
    width: 16,
    height: 16,
};
const tree = {
    people: {
        A: { picture: 'portrait', born: '2000', custom: 'retained' },
        B: { picture: 'portrait' },
    },
    custom: 'tree metadata',
};

function pngPixels(png: Buffer) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    return new Resvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}"/></svg>`,
    ).render().pixels;
}

function hasRed(pixels: Uint8Array) {
    for (let i = 0; i < pixels.length; i += 4) {
        if (
            pixels[i] > 200 &&
            pixels[i + 1] < 40 &&
            pixels[i + 2] < 40 &&
            pixels[i + 3] === 255
        )
            return true;
    }
    return false;
}

describe('explicit portable pictures', () => {
    it('embeds native images, paints Node PNG, reuses sources per render and retains adapter metadata', async () => {
        const before = structuredClone(tree);
        const resolver = vi.fn(async () => picture);
        const dateAdapter = {
            formatYear: vi.fn((_value, context) => {
                expect(context.person.picture).toBe('portrait');
                expect(context.person.custom).toBe('retained');
                expect(context.tree.custom).toBe('tree metadata');
                return '2000';
            }),
            formatDate: () => undefined,
        };
        const svg = await render(tree, {
            pictureResolver: resolver,
            dateAdapter,
            ageAdapter: ({ person, tree: contextTree }) => {
                expect(person.picture).toBe('portrait');
                expect(contextTree.custom).toBe('tree metadata');
                if (person.born) expect(person.custom).toBe('retained');
                return undefined;
            },
        });
        expect(svg.match(/<image /g)).toHaveLength(2);
        expect(svg).toContain(picture.dataUrl);
        expect(resolver.mock.calls).toEqual([['portrait']]);
        const png = await render(tree, {
            format: 'png',
            pictureResolver: resolver,
        });
        expect(Buffer.isBuffer(png)).toBe(true);
        expect(hasRed(pngPixels(png))).toBe(true);
        expect(resolver).toHaveBeenCalledTimes(2);
        expect(tree).toEqual(before);
        const jpg = await readFile(new URL('./7_image1.jpg', import.meta.url));
        const jpeg = {
            dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}`,
            width: 178,
            height: 100,
        };
        expect(await render(tree, { pictureResolver: () => jpeg })).toContain(
            jpeg.dataUrl,
        );
        const jpegPng = await render(tree, {
            format: 'png',
            pictureResolver: () => jpeg,
        });
        const jpegPixels = pngPixels(jpegPng);
        let black = 0;
        for (let i = 0; i < jpegPixels.length; i += 4) {
            // The existing JPEG fixture is a black silhouette; graph styling has no black fill.
            if (
                jpegPixels[i] === 0 &&
                jpegPixels[i + 1] === 0 &&
                jpegPixels[i + 2] === 0 &&
                jpegPixels[i + 3] === 255
            )
                black++;
        }
        expect(black).toBeGreaterThan(50);
        expectTypeOf<PictureResolver>().toEqualTypeOf<v1.PictureResolver>();
        expectTypeOf<ResolvedPicture>().toEqualTypeOf<browser.ResolvedPicture>();
    });

    it('keeps every public DOT path pure and browser SVG usable without DOM globals', async () => {
        const resolver = vi.fn(() => picture);
        const input = {
            ...tree,
            people: {
                ...tree.people,
                C: { picture: 'other' },
                D: { picture: '' },
                E: null,
            },
        };
        const expected = renderDot(input);
        expect(renderDot(input, { pictureResolver: resolver })).toBe(expected);
        expect(
            await render(input, { format: 'dot', pictureResolver: resolver }),
        ).toBe(expected);
        expect(
            await browser.render(input, {
                format: 'dot',
                pictureResolver: resolver,
            }),
        ).toBe(expected);
        expect(resolver).not.toHaveBeenCalled();
        expect(
            await browser.render(input, { pictureResolver: resolver }),
        ).toContain(picture.dataUrl);
        expect(resolver.mock.calls).toEqual([['portrait'], ['other']]);
    });

    it('rejects invalid options/documents before resolving and reports metadata and resolver failures', async () => {
        const resolver = vi.fn(() => picture);
        await expect(
            render({ people: { A: { picture: 42 } } } as never, {
                pictureResolver: resolver,
            }),
        ).rejects.toThrow(/picture/);
        await expect(
            render(tree, {
                ageAdapter: 42,
                pictureResolver: resolver,
            } as never),
        ).rejects.toThrow(/ageAdapter/);
        await expect(
            browser.render(tree, {
                format: 'png',
                scale: 0,
                pictureResolver: resolver,
            }),
        ).rejects.toThrow(/scale/);
        expect(resolver).not.toHaveBeenCalled();
        await expect(
            render(tree, { pictureResolver: 42 } as never),
        ).rejects.toThrow(/pictureResolver/);
        for (const invalid of [
            null,
            { ...picture, width: Infinity },
            { ...picture, height: 0 },
            { ...picture, dataUrl: 'data:image/svg+xml;base64,AAAA' },
            { ...picture, dataUrl: 'data:image/png;base64,not base64' },
        ]) {
            await expect(
                render(tree, { pictureResolver: () => invalid } as never),
            ).rejects.toThrow(/picture/i);
        }
        const cause = new Error('resolver unavailable');
        await expect(
            render(tree, {
                pictureResolver: () => {
                    throw cause;
                },
            }),
        ).rejects.toMatchObject({ cause });
    });
});
