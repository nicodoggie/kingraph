import { expect, it } from 'vitest';
import slugify from './slugify.js';

it('slugifies strings and nested paths (five legacy assertions)', () => {
    expect(slugify('hi')).toBe('hi');
    expect(slugify(['hi', 'world'])).toBe('hi_world');
    expect(slugify(['hi', 0])).toBe('hi_0');
    expect(slugify(['hi', 'k'], { sep: '-' })).toBe('hi-k');
    expect(slugify(['hi', ['k']], { sep: '-' })).toBe('hi-k');
});
