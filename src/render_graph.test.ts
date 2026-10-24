import { describe, expect, it } from 'vitest';
import renderGraph from './render_graph.js';
import type { FamilyTree } from './types.js';

describe('graph core regressions', () => {
    it('restarts family colors for every render without mutating nested groups', () => {
        const tree: FamilyTree = {
            families: [
                {
                    house: 'House A',
                    families: [
                        { parents: ['A'], children: ['B'] },
                        { parents: ['B'], children2: ['C'] },
                    ],
                },
            ],
        };
        const original = structuredClone(tree);
        const first = renderGraph(tree);
        renderGraph({ families: [{ parents: ['Other'] }] });
        expect(renderGraph(tree)).toBe(first);
        expect(tree).toEqual(original);
        expect(first.indexOf('# Family [B] -> [C]')).toBeLessThan(
            first.indexOf('# Family [A] -> [B]'),
        );
    });
    it('uses the death date in a died-only tooltip', () => {
        const dot = renderGraph({ people: { A: { died: '2000-02-03' } } });
        expect(dot).toContain(' Died 02/03/2000');
        expect(dot).not.toContain('Invalid Date');
    });
    it('omits a missing first name from the tooltip', () => {
        const dot = renderGraph({ people: { A: { last_name: 'Smith' } } });
        expect(dot).toContain('tooltip="Smith\n');
        expect(dot).not.toContain('undefinedSmith');
    });
    it('renders picture DOT with a local picture variable', () => {
        expect(
            renderGraph({ people: { A: { picture: 'portrait.png' } } }),
        ).toContain("<img scale='true' src='portrait.png' />");
        expect(renderGraph({ people: { A: { name: 'A' } } })).not.toContain(
            '<img',
        );
    });
    it('allows null metadata and families, including nested family groups', () => {
        const dot = renderGraph({
            people: { A: null },
            families: [null, { families: [null] }],
        });
        expect(dot).toContain('label="A"');
        expect(dot).toContain('subgraph cluster_family_1_0 {');
    });
    it('retains family styles and both secondary relationship styles', () => {
        const dot = renderGraph({
            families: [
                {
                    house: 'House A',
                    parents: ['A'],
                    parents2: ['B'],
                    children: ['C'],
                    children2: ['D'],
                },
            ],
        });
        expect(dot).toContain('label=<<b>House A</b>>');
        expect(dot).toContain('{B} -> union_0 [');
        expect(dot).toContain('siblings_0 -> {D} [');
        expect(dot).toContain('style="dashed"');
        expect(dot).toContain('arrowhead="tee"');
        expect(dot).not.toContain('"C" -> "D"');
    });
    it('supports Date, string, and numeric dates while retaining existing date semantics', () => {
        const dot = renderGraph({
            people: {
                A: {
                    born: new Date('1980-01-02'),
                    died: '2000-02-03',
                    created_at: Date.UTC(2020, 0, 2),
                },
            },
        });
        expect(dot).toContain('*1980 — †2000');
        expect(dot).toContain('Added 01/02/2020');
        expect(dot).toContain('Born 01/02/1980  -- died 02/03/2000');
    });
});
