import { Resvg } from '@resvg/resvg-js';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { parseFamilyYaml, render, renderDot } from '../src/index.js';
import * as v1 from '../src/v1/index.js';
import * as browser from '../src/browser.js';
import * as v2 from '../src/v2/index.js';
import * as v1Browser from '../src/v1/browser.js';
import * as v2Browser from '../src/v2/browser.js';
import { FamilyTreeSchema, PictureSourceSchema } from '../src/v2/schemas.js';
import type { PictureSource, FamilyTree } from '../src/v2/schemas.js';
import type { PictureLoadContext } from '../src/pictures.js';

const red = new Resvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><path fill="#f00000" d="M0 0h24v16H0z"/></svg>',
).render();
const data = `data:image/png;base64,${red.asPng().toString('base64')}`;
const asset = { href: data, width: 24, height: 16 };
const tree = {
    schemaVersion: 2 as const,
    pictures: {
        portrait: { data },
        unused: { url: 'https://example.invalid/unused.png' },
    },
    people: {
        A: { picture: 'portrait', born: '2000', custom: 'person metadata' },
        B: { picture: 'portrait' },
    },
    custom: 'tree metadata',
};

describe('v2 catalog rendering', () => {
    it('dispatches only explicit v2 and keeps every DOT path free of resource loading', async () => {
        const loader = vi.fn(
            (_source: PictureSource, _context: PictureLoadContext) => asset,
        );
        const input = {
            ...tree,
            pictures: { portrait: { path: '../portraits/alex.png' } },
        };
        const dot = renderDot(input, { pictureLoader: loader });
        expect(dot).toContain("src='../portraits/alex.png'");
        expect(
            await render(input, { format: 'dot', pictureLoader: loader }),
        ).toBe(dot);
        expect(
            await browser.render(input, {
                format: 'dot',
                pictureLoader: loader,
            }),
        ).toBe(dot);
        expect(loader).not.toHaveBeenCalled();
        expect(parseFamilyYaml('schemaVersion: 2\npictures: {}')).toMatchObject(
            { schemaVersion: 2 },
        );
        expect(() => parseFamilyYaml('schemaVersion: 3')).toThrow(
            /schemaVersion/,
        );
        expect(() => v1.renderDot(input as never)).toThrow(/v1/);
        await expect(v1.render(input as never)).rejects.toThrow(/v1/);
        await expect(v1.render({}, null as never)).rejects.toThrow(/options/);
        await expect(v2.render(tree, null as never)).rejects.toThrow(/options/);
        expect(() => v1.parseFamilyYaml('schemaVersion: 2')).toThrow(/v1/);
        expect(() => v1Browser.renderDot(input as never)).toThrow(/v1/);
        expect(v2.renderDot(input)).toBe(dot);
        expect(v2Browser.renderDot(input)).toBe(dot);
        expect(await render(tree)).toContain(data);
        expect(() => v2.parseFamilyYaml('people: {}')).toThrow(/v2/);
        expect(
            renderDot({
                pictures: { portrait: { path: 'ignored.png' } },
                people: { A: { picture: 'portrait' } },
            }),
        ).toContain("src='portrait'");
    });

    it('loads only referenced keys once, registers native image sizes and retains authored adapter metadata', async () => {
        const before = structuredClone(tree);
        const loader = vi.fn(
            (_source: PictureSource, _context: PictureLoadContext) => asset,
        );
        const svg = await render(tree, {
            pictureLoader: loader,
            dateAdapter: {
                formatYear: (_value, context) => {
                    expect(context.person.picture).toBe('portrait');
                    expect(context.person.custom).toBe('person metadata');
                    expect(context.tree).toBe(tree);
                    return '2000';
                },
                formatDate: () => undefined,
            },
        });
        expect(svg).toContain(data);
        expect(svg.match(/<image /g)).toHaveLength(2);
        expect(loader.mock.calls).toEqual([
            [tree.pictures.portrait, { id: 'portrait', mode: 'embed' }],
        ]);
        const linked = await render(
            {
                ...tree,
                pictures: {
                    portrait: { url: 'https://example.org/portrait.png' },
                },
            },
            {
                pictureMode: 'link',
                pictureLoader: () => ({
                    ...asset,
                    href: "https://example.org/alex's.png?a=1&b=2",
                }),
            },
        );
        expect(linked).toContain("https://example.org/alex's.png?a=1&amp;b=2");
        const png = await render(tree, {
            format: 'png',
            pictureMode: 'link',
            pictureLoader: loader,
        });
        const pixels = new Resvg(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${png.readUInt32BE(16)}" height="${png.readUInt32BE(20)}"><image href="data:image/png;base64,${png.toString('base64')}" width="100%" height="100%"/></svg>`,
        ).render().pixels;
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
        expect(loader.mock.calls.at(-1)?.[1]).toMatchObject({ mode: 'embed' });
        const keyedLoader = vi.fn(
            (_source: PictureSource, _context: PictureLoadContext) => asset,
        );
        await render(
            {
                ...tree,
                pictures: { ...tree.pictures, alias: tree.pictures.portrait },
                people: { ...tree.people, C: { picture: 'alias' } },
            },
            {
                pictureLoader: keyedLoader,
                documentUrl: 'file:///families/example.yaml',
            },
        );
        expect(keyedLoader.mock.calls.map(([, context]) => context)).toEqual([
            {
                id: 'portrait',
                mode: 'embed',
                documentUrl: 'file:///families/example.yaml',
            },
            {
                id: 'alias',
                mode: 'embed',
                documentUrl: 'file:///families/example.yaml',
            },
        ]);
        expect(tree).toEqual(before);
    });

    it('rejects unknown references and invalid original options before any loader runs', async () => {
        const loader = vi.fn(
            (_source: PictureSource, _context: PictureLoadContext) => asset,
        );
        await expect(
            render(
                { ...tree, people: { Alex: { picture: 'missing' } } } as never,
                { pictureLoader: loader },
            ),
        ).rejects.toThrow(/people\.Alex\.picture.*missing/);
        for (const options of [
            null,
            [],
            { pictureMode: 'other' },
            { documentUrl: 'relative.yml' },
            { pictureLoader: 42 },
        ]) {
            await expect(render(tree, options as never)).rejects.toThrow(
                /options|pictureMode|documentUrl|pictureLoader/,
            );
        }
        expect(loader).not.toHaveBeenCalled();
        for (const invalid of [
            null,
            { ...asset, width: 0 },
            { ...asset, height: Infinity },
            { ...asset, href: 'javascript:alert(1)' },
        ]) {
            await expect(
                render(tree, { pictureLoader: () => invalid } as never),
            ).rejects.toThrow(/portrait/);
        }
        const cause = new Error('policy denied');
        await expect(
            render(tree, {
                pictureLoader: () => {
                    throw cause;
                },
            } as never),
        ).rejects.toMatchObject({ cause });
    });
});

it('validates the catalog source matrix with native schemas and exposes version-specific types', () => {
    for (const source of [
        { url: 'https://example.org/a.png' },
        { data },
        { path: '../portraits/a.png' },
    ]) {
        expect(PictureSourceSchema.parse(source)).toEqual(source);
    }
    for (const source of [
        {},
        { url: '' },
        { path: ' ' },
        { url: '/a.png' },
        { url: 'file:///a.png' },
        { data: 'data:image/gif;base64,AAAA' },
        { path: '/a.png' },
        { path: 'C:\\a.png' },
        { path: 'https://example.org/a.png' },
        { path: 'a.png', url: 'https://example.org/a.png' },
        { path: 'a.png', extra: true },
    ]) {
        expect(PictureSourceSchema.safeParse(source).success).toBe(false);
    }
    expect(FamilyTreeSchema.parse(tree)).toEqual(tree);
    expect(
        FamilyTreeSchema.safeParse({
            ...tree,
            people: { A: { picture: 'toString' } },
        }).success,
    ).toBe(false);
    expectTypeOf<PictureSource>().toEqualTypeOf<v2.PictureSource>();
    expectTypeOf<FamilyTree['schemaVersion']>().toEqualTypeOf<2>();
    expectTypeOf<
        Parameters<typeof v1.render>[0]['schemaVersion']
    >().toEqualTypeOf<1 | undefined>();
    expectTypeOf<
        Parameters<typeof v2.render>[0]['schemaVersion']
    >().toEqualTypeOf<2>();
    expectTypeOf<
        Parameters<typeof v1Browser.render>[0]['schemaVersion']
    >().toEqualTypeOf<1 | undefined>();
    expectTypeOf<
        Parameters<typeof v2Browser.render>[0]['schemaVersion']
    >().toEqualTypeOf<2>();
    expectTypeOf<v2.DateContext['tree']['schemaVersion']>().toEqualTypeOf<2>();
    const v1Options: v1.GraphRenderOptions = {
        ageAdapter: (_context: v1.AgeContext) => undefined,
    };
    expect(v1.renderDot({}, v1Options)).toContain('digraph');
    expectTypeOf(() => v2.render(tree)).returns.toEqualTypeOf<
        Promise<string>
    >();
    expectTypeOf(() =>
        v2.render(tree, { format: 'png' }),
    ).returns.toEqualTypeOf<Promise<Buffer>>();
});
