import { describe, expect, it } from 'vitest';
import join from './join.js';

describe('join legacy assertions', () => {
    it('flattens nested fragments and omits null and false', () => {
        expect(join(['a', 'b'], { sep: ',' })).toBe('a,b');
        expect(join(['a', ['b']], { sep: ',' })).toBe('a,b');
        expect(join(['a', ['b', 'c']], { sep: ',' })).toBe('a,b,c');
        expect(join(['a', ['b', null, 'c']], { sep: ',' })).toBe('a,b,c');
        expect(join(['a', '', 'b'], { sep: ',' })).toBe('a,,b');
        expect(join(['a', false, 'b'], { sep: ',' })).toBe('a,b');
    });
    it('indents nested blocks', () => {
        expect(
            join(['a {', { indent: ['hello'] }, '}'], {
                sep: '\n',
                indent: '  ',
            }),
        ).toBe('a {\n  hello\n}');
        expect(join(['a {', { indent: ['hello'] }, '}'])).toBe(
            'a {\n\thello\n}',
        );
        expect(
            join([
                'a {',
                { indent: ['hello {', { indent: ['world'] }, '}'] },
                '}',
            ]),
        ).toBe('a {\n\thello {\n\t\tworld\n\t}\n}');
    });
});
