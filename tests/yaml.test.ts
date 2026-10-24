import { describe, expect, it } from 'vitest';
import { parseFamilyYaml } from '../src/yaml.js';

describe('family YAML', () => {
    it('preserves timestamp and merge-key semantics from the old safe schema', () => {
        const tree = parseFamilyYaml(
            'people:\n  A: &person\n    born: 1966-03-22\n    class: [ancestor]\n  B:\n    <<: *person\nfamilies:\n  - parents: [A, B]\n',
        );
        expect(tree.people?.A?.born).toEqual(
            new Date('1966-03-22T00:00:00.000Z'),
        );
        expect(tree.people?.B?.class).toEqual(['ancestor']);
    });
    it('keeps empty and comment-only sources usable as empty graphs', () => {
        expect(parseFamilyYaml('')).toEqual({});
        expect(parseFamilyYaml('# no relatives yet')).toEqual({});
    });
    it.each([
        'null',
        '42',
        '[]',
        'families: not-an-array',
        'people: []',
        '{}\n---\n{}',
    ])('rejects invalid root/collection input: %s', (source) => {
        expect(() => parseFamilyYaml(source, 'family.yml')).toThrow(
            /family.yml/,
        );
    });
    it('retains parser diagnostics and the input filename', () => {
        expect(() => parseFamilyYaml('families: [', 'broken.yml')).toThrow(
            /broken.yml/,
        );
    });
});
