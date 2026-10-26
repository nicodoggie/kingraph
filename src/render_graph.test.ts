import { describe, expect, it } from 'vitest';
import renderGraph from './render_graph.js';
import { asOf, defaultAgeAdapter } from './adapters.js';
import type { GraphRenderOptions } from './adapters.js';
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

describe('date and age policies', () => {
    it('formats raw calendar values and suppresses individual fragments', () => {
        const calls: unknown[] = [];
        const dot = renderGraph(
            {
                people: {
                    A: { born: 0, died: 'unknown', created_at: 'Frost' },
                },
            },
            {
                dateAdapter: {
                    formatYear(value, context) {
                        calls.push([
                            value,
                            context.field,
                            context.id,
                            context.person.born,
                            context.tree.people?.A?.born,
                        ]);
                        return value === 0 ? 'Zero' : undefined;
                    },
                    formatDate(value, context) {
                        return context.field === 'died' ? '' : `full ${value}`;
                    },
                },
            },
        );
        expect(dot).toContain('*Zero');
        expect(dot).not.toContain('†');
        expect(dot).not.toContain(' — ');
        expect(dot).toContain('Added full Frost');
        expect(dot).toContain('Born full 0');
        expect(calls).toContainEqual([0, 'born', 'A', 0, 0]);
    });
    it('omits invalid default fragments and treats epoch zero as present', () => {
        const dot = renderGraph({
            people: { A: { born: 0, died: 'unparseable' } },
        });
        expect(dot).toContain('*1970');
        expect(dot).toContain('Born 01/01/1970');
        expect(dot).not.toMatch(/NaN|Invalid Date|†| — /);
    });
    it('invokes custom age once for explicit metadata records and reuses text', () => {
        let calls = 0;
        const tree: FamilyTree = {
            people: { A: { lifeHistory: ['reborn'] } },
            families: [{ parents: ['A'], children: ['implicit'] }],
        };
        const original = structuredClone(tree);
        const dot = renderGraph(tree, {
            asOf: 'Frost',
            ageAdapter(context) {
                calls++;
                expect(context.person.lifeHistory).toEqual(['reborn']);
                expect(context.asOf).toBe('Frost');
                return 'Three lives';
            },
        });
        expect(calls).toBe(1);
        expect(dot.match(/Three lives/g)).toHaveLength(2);
        expect(dot).toContain('<table');
        expect(renderGraph(tree)).not.toContain('Three lives');
        expect(tree).toEqual(original);
    });
});

describe('adapter boundary and failure handling', () => {
    const tree: FamilyTree = {
        people: { A: { born: '2000-01-01', age: 999 } },
    };
    it.each([
        null,
        [],
        42,
        { dateAdapter: null },
        { dateAdapter: [] },
        { dateAdapter: {} },
        { ageAdapter: {} },
        { asOf: null },
        { asOf: Infinity },
        { asOf: new Date(NaN) },
        { asOf: {} },
    ])('rejects malformed options %j', (options) => {
        expect(() => renderGraph(tree, options as GraphRenderOptions)).toThrow(
            TypeError,
        );
    });
    it.each([null, Infinity, new Date(NaN), {}])(
        'validates helper reference %s using the same union',
        (value) => {
            expect(() => asOf(value as never)).toThrow(/asOf/);
        },
    );
    it('keeps ages opt-in and conventional arithmetic independent of presentation', () => {
        expect(renderGraph(tree, { asOf: '2020-01-01' })).not.toContain('Age:');
        const options = {
            asOf: '2020-01-01',
            ageAdapter: defaultAgeAdapter,
            dateAdapter: {
                formatYear: () => 'Frost 843',
                formatDate: () => undefined,
            },
        };
        expect(renderGraph(tree, options)).toContain('Age: 20');
        expect(renderGraph(tree, { ...options, asOf: '2021-01-01' })).toContain(
            'Age: 21',
        );
        expect(renderGraph(tree, options)).toContain('Age: 20');
    });
    it.each(['formatYear', 'formatDate', 'ageAdapter'] as const)(
        'preserves the cause and context of %s failure',
        (operation) => {
            const cause = new Error('callback failed');
            const fail = () => {
                throw cause;
            };
            const options =
                operation === 'ageAdapter'
                    ? { ageAdapter: fail }
                    : {
                          dateAdapter: {
                              formatYear: () => 'year',
                              formatDate: () => 'date',
                              [operation]: fail,
                          },
                      };
            try {
                renderGraph(tree, options);
                throw new Error('Expected failure');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).cause).toBe(cause);
                expect((error as Error).message).toContain(operation);
                expect((error as Error).message).toContain('"A"');
                if (operation !== 'ageAdapter')
                    expect((error as Error).message).toContain('born');
            }
        },
    );
    it.each([null, 4, Promise.resolve('async')])(
        'rejects invalid callback result %s with context',
        (result) => {
            expect(() =>
                renderGraph(tree, {
                    dateAdapter: {
                        formatYear: () => result,
                        formatDate: () => undefined,
                    },
                } as unknown as GraphRenderOptions),
            ).toThrow(/formatYear.*born.*"A".*string or undefined/);
            expect(() =>
                renderGraph(tree, {
                    ageAdapter: () => result,
                } as unknown as GraphRenderOptions),
            ).toThrow(/ageAdapter.*"A".*string or undefined/);
        },
    );
});
