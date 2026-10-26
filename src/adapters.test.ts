import { describe, expect, it } from 'vitest';
import { asOf, defaultAgeAdapter, defaultDateAdapter } from './adapters.js';
import type { DateValue } from './adapters.js';
import type { Person } from './types.js';

const age = (person: Person, asOf?: DateValue) =>
    defaultAgeAdapter({
        id: 'A',
        person,
        tree: { people: { A: person } },
        asOf,
    });
describe('conventional age policy', () => {
    it.each([
        [{ born: '2000-06-15' }, '2020-06-14', 'Age: 19'],
        [{ born: '2000-06-15' }, '2020-06-15', 'Age: 20'],
        [{ born: '2000-02-29' }, '2021-02-28', 'Age: 20'],
        [{ born: '2000-02-29' }, '2021-03-01', 'Age: 21'],
        [
            { born: '2000-01-02', died: '2010-01-02' },
            undefined,
            'Age at death: 10',
        ],
        [{ born: '2000-01-02', died: '2010-01-02' }, '2005-01-02', 'Age: 5'],
        [
            { born: '2000-01-02', died: '2010-01-02' },
            '2010-01-02',
            'Age at death: 10',
        ],
        [{ born: 0 }, new Date('1970-01-01'), 'Age: 0'],
        [{ born: '2000-01-02T23:00:00-02:00' }, '2020-01-02', 'Age: 19'],
    ] satisfies [Person, DateValue | undefined, string][])(
        'calculates %j at %s',
        (person, reference, expected) => {
            expect(age(person, reference)).toBe(expected);
        },
    );
    it.each([
        [{ born: '2000-01-02' }, undefined],
        [{ born: '2000' }, '2020-01-02'],
        [{ born: 2000 }, '2020-01-02'],
        [{ born: '2000-02-30' }, '2020-01-02'],
        [{ born: '2000-02-30T12:00:00Z' }, '2020-01-02'],
        [{ born: '01/02/2000' }, '2020-01-02'],
        [{ born: '2000-01-02T12:00:00' }, '2020-01-02'],
        [{ born: '2000-01-02' }, '1999-01-02'],
        [{ born: '2000-01-02', died: '2010' }, '2005-01-02'],
        [{ born: '2000-01-02', died: '' }, '2020-01-02'],
        [{}, '2020-01-02'],
    ] satisfies [Person, DateValue | undefined][])(
        'omits imprecise or unsupported %j at %s',
        (person, reference) => {
            expect(age(person, reference)).toBeUndefined();
        },
    );
});
it('keeps conventional formatting year and created-at semantics distinct', () => {
    const context = { id: 'A', person: {}, tree: {}, field: 'born' as const };
    expect(defaultDateAdapter.formatDate(2000, context)).toBe('2000');
    expect(
        defaultDateAdapter.formatDate(2000, {
            ...context,
            field: 'created_at',
        }),
    ).toBe('01/01/1970');
    expect(defaultDateAdapter.formatYear('', context)).toBeUndefined();
});
it('composes fresh independent reference fragments without enabling age', () => {
    const base = { dateAdapter: defaultDateAdapter };
    const first = { ...base, ...asOf('Frost 843') };
    const second = { ...base, ...asOf('Frost 844') };
    expect(first.asOf).toBe('Frost 843');
    expect(second.asOf).toBe('Frost 844');
    expect(base).toEqual({ dateAdapter: defaultDateAdapter });
    expect(first).not.toHaveProperty('ageAdapter');
    expect(asOf('Frost')).not.toBe(asOf('Frost'));
});
