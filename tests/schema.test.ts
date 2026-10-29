import { describe, expect, it } from 'vitest';
import { FamilyTreeSchema, validateFamilyTree } from '../src/v1/schemas.js';
import * as schemas from '../src/v1/schemas.js';
import * as rootApi from '../src/index.js';
import * as v1Api from '../src/v1/index.js';
import * as browserApi from '../src/browser.js';
import render, { parseFamilyYaml, renderDot } from '../src/index.js';
import { render as browserRender } from '../src/browser.js';
import type { FamilyTree } from '../src/types.js';

describe('permissive v1 contract', () => {
    it('keeps explicit v1 separate from root version dispatch and schemas out of rendering barrels', () => {
        expect(rootApi.default).not.toBe(v1Api.default);
        expect(Object.keys(rootApi).sort()).toEqual(Object.keys(v1Api).sort());
        expect(rootApi).not.toHaveProperty('FamilyTreeSchema');
        expect(browserApi).not.toHaveProperty('FamilyTreeSchema');
        expect(Object.keys(schemas).sort()).toEqual([
            'FamilySchema',
            'FamilyTreeSchema',
            'PersonSchema',
            'StylePropertiesSchema',
            'StylesSchema',
            'validateFamilyTree',
        ]);
    });
    it('preserves dates, optional/null entries, extensions and open style attributes', () => {
        const input = {
            schemaVersion: 1,
            metadata: { source: 'author' },
            families: [
                null,
                {
                    parents: ['A'],
                    parents2: ['B'],
                    children: ['C'],
                    children2: ['D'],
                    house: 'Example',
                    links: ['https://example.org/house'],
                    note: 'preserve',
                    families: [null, { children: ['E'] }],
                },
            ],
            people: {
                A: {
                    name: 'Alex',
                    display: 'A',
                    fullname: 'Alex Example',
                    first_name: 'Alex',
                    last_name: 'Example',
                    gender: 'F',
                    born: new Date('1966-03-22T00:00:00Z'),
                    died: 1999,
                    created_at: '2020-01-01',
                    picture: 'portrait.png',
                    links: ['https://example.org/person'],
                    class: ['ancestor'],
                    comment: 'Note',
                    adopted: new Date('1970-01-01T00:00:00Z'),
                    age: 33,
                    nickname: 'A',
                },
                B: null,
            },
            styles: {
                ancestor: {
                    custom_attribute: 'value',
                    fontsize: 12,
                    fixedsize: true,
                    href: null,
                    tooltip: undefined,
                },
            },
        };
        const tree: FamilyTree = FamilyTreeSchema.parse(input);
        expect(tree).toEqual(input);
        expect(validateFamilyTree({})).toEqual({});
        expect(validateFamilyTree({ schemaVersion: 1 })).toEqual({
            schemaVersion: 1,
        });
        const implicit = {
            families: [{ parents: ['Unlisted'], children: ['AlsoUnlisted'] }],
        };
        expect(validateFamilyTree(implicit)).toEqual(implicit);
    });

    it('validates YAML after timestamps/merges without changing unknown metadata', () => {
        const tree = parseFamilyYaml(
            'people:\n  A: &person\n    born: 1966-03-22\n    adopted: 1970-01-01\n    age: 33\n  B:\n    <<: *person\nfamilies:\n  - parents: [A]\n    children2: [B]\n',
        );
        expect(tree.people?.B?.born).toEqual(new Date('1966-03-22T00:00:00Z'));
        expect(tree.people?.B?.adopted).toEqual(
            new Date('1970-01-01T00:00:00Z'),
        );
        expect(tree.people?.B?.age).toBe(33);
        expect(() =>
            parseFamilyYaml(
                'people:\n  A:\n    class: wrong\n',
                'invalid.yaml',
            ),
        ).toThrow(/invalid\.yaml.*people\.A\.class/s);
        expect(() =>
            parseFamilyYaml('schemaVersion: 3\n', 'future.yaml'),
        ).toThrow(/future\.yaml.*schemaVersion/s);
    });

    it.each([
        [[], '<root>'],
        [{ schemaVersion: '1' }, 'schemaVersion'],
        [{ families: [{ parents: 'A' }] }, 'families.0.parents'],
        [{ families: [{ children: [42] }] }, 'families.0.children.0'],
        [{ people: { A: { born: {} } } }, 'people.A.born'],
        [{ people: { A: false } }, 'people.A'],
        [{ styles: { ':node': { color: [] } } }, 'styles.:node.color'],
    ])(
        'rejects malformed known shapes with an input path: %j',
        (input, path) => {
            expect(() => validateFamilyTree(input)).toThrow(String(path));
        },
    );

    it('uses the same runtime contract for direct DOT, Node and browser render calls', async () => {
        const bad = JSON.parse('{"families":[{"parents":"A"}]}') as FamilyTree;
        expect(() => renderDot(bad)).toThrow('families.0.parents');
        await expect(render(bad)).rejects.toThrow('families.0.parents');
        await expect(browserRender(bad)).rejects.toThrow('families.0.parents');
    });

    it('does not infer relationships or rendering effects from preserved extension metadata', () => {
        const plain = {
            families: [{ children: ['A'] }],
            people: { A: { name: 'Alex' } },
        };
        const extended = {
            ...plain,
            metadata: 'root',
            families: [{ ...plain.families[0], custom: true }],
            people: {
                A: {
                    ...plain.people.A,
                    age: 33,
                    nickname: 'Other',
                    adopted: '1970',
                },
            },
        };
        expect(renderDot(validateFamilyTree(extended))).toBe(renderDot(plain));
    });
});
