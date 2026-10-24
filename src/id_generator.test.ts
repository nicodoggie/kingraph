import { expect, it } from 'vitest';
import idGenerator from './id_generator.js';

it('keeps independent counters for each key (five legacy assertions)', () => {
    const get = idGenerator();
    expect(get('family')).toBe(0);
    expect(get('family')).toBe(1);
    expect(get('family')).toBe(2);
    expect(get('other')).toBe(0);
    expect(get('other')).toBe(1);
});
