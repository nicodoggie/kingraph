import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import render, { parseFamilyYaml, renderDot } from '../src/index.js';

const fixtures = [...globSync(['tests/*.yaml', 'examples/*.yaml'])].sort();

describe('repository family fixtures', () => {
    it.each(fixtures)(
        'renders %s through its supported output paths',
        async (filename) => {
            const source = readFileSync(filename, 'utf8');
            const tree = parseFamilyYaml(source, filename);
            expect(renderDot(tree)).toContain('digraph G {');
            if (
                Object.values(tree.people ?? {}).some(
                    (person) => person?.picture,
                )
            ) {
                // WASM cannot read local pictures; DOT remains the native Graphviz handoff.
                expect(renderDot(tree)).toContain('<img');
            } else {
                expect(await render(tree)).toContain('<svg');
                const png = await render(tree, { format: 'png' });
                expect(png.subarray(0, 8)).toEqual(
                    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
                );
            }
        },
    );
});
