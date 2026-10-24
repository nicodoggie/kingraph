import { readFile } from 'node:fs/promises';
import { describe, expect, expectTypeOf, it } from 'vitest';
import render, { parseFamilyYaml, renderDot } from '../src/index.js';
import { render as browserRender } from '../src/browser.js';
import type { FamilyTree } from '../src/types.js';

const family: FamilyTree = {
    families: [{ parents: ['Marge', 'Homer'], children: ['Lisa'] }],
};

describe('rendering public APIs', () => {
    it('renders documented numeric birth/death years as years, not epoch milliseconds', () => {
        const dot = renderDot({ people: { A: { born: 1966, died: 1999 } } });
        expect(dot).toContain('*1966 — †1999');
        expect(dot).toContain('Born 1966  -- died 1999');
    });
    it('renders real DOT, SVG and PNG through the Node entry', async () => {
        const dot = renderDot(family);
        expect(await render(family, { format: 'dot' })).toBe(dot);
        expect(await render(family)).toContain('<svg');
        const png = await render(family, { format: 'png' });
        expect(png.subarray(0, 8)).toEqual(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
        expect(png.readUInt32BE(16)).toBeGreaterThan(0);
        expect(png.readUInt32BE(20)).toBeGreaterThan(0);
        expectTypeOf(render(family)).toEqualTypeOf<Promise<string>>();
        expectTypeOf(render(family, { format: 'png' })).toEqualTypeOf<
            Promise<Buffer>
        >();
    });
    it('keeps browser DOT/SVG usable without any DOM globals', async () => {
        expect(await browserRender(family, { format: 'dot' })).toBe(
            renderDot(family),
        );
        expect(await browserRender(family)).toContain('<svg');
    });
    it.each([null, [], 42])(
        'rejects malformed options: %s',
        async (options) => {
            // Deliberately exercise untyped JavaScript callers.
            // @ts-expect-error invalid public options
            await expect(render(family, options)).rejects.toThrow(/options/);
            // @ts-expect-error invalid public options
            await expect(browserRender(family, options)).rejects.toThrow(
                /options/,
            );
        },
    );
    it('rejects unsupported formats rather than silently returning undefined', async () => {
        // @ts-expect-error invalid format from JavaScript
        await expect(render(family, { format: 'pdf' })).rejects.toThrow(
            /format/,
        );
        // @ts-expect-error invalid format from JavaScript
        await expect(browserRender(family, { format: 'pdf' })).rejects.toThrow(
            /format/,
        );
    });
    it('retains image references in DOT for the native Graphviz workflow', async () => {
        const source = await readFile(
            new URL('./7_image.yaml', import.meta.url),
            'utf8',
        );
        const dot = renderDot(parseFamilyYaml(source));
        expect(dot).toContain("src='tests/7_image1.jpg'");
        expect(dot).toContain("src='tests/7_image2.png'");
    });
});
