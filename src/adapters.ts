import type { FamilyTree, Person } from './types.js';

export type DateValue = NonNullable<Person['born']>;
export interface PersonContext {
    readonly id: string;
    readonly person: Readonly<Person>;
    readonly tree: Readonly<FamilyTree>;
}
export interface DateContext extends PersonContext {
    readonly field: 'born' | 'died' | 'created_at';
}
export interface DateAdapter {
    formatYear(value: DateValue, context: DateContext): string | undefined;
    formatDate(value: DateValue, context: DateContext): string | undefined;
}
export interface AgeContext extends PersonContext {
    readonly asOf?: DateValue;
}
export type AgeAdapter = (context: AgeContext) => string | undefined;
export interface GraphRenderOptions {
    dateAdapter?: DateAdapter;
    ageAdapter?: AgeAdapter;
    asOf?: DateValue;
}

function validateDateValue(value: unknown): asserts value is DateValue {
    if (!(
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (value instanceof Date && Number.isFinite(value.getTime()))
    )) {
        throw new TypeError(
            'asOf must be a valid Date, string, or finite number.',
        );
    }
}

export function validateGraphRenderOptions(options: GraphRenderOptions): void {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Render options must be an object.');
    }
    if (options.dateAdapter !== undefined) {
        const adapter = options.dateAdapter;
        if (
            !adapter ||
            typeof adapter !== 'object' ||
            Array.isArray(adapter) ||
            typeof adapter.formatYear !== 'function' ||
            typeof adapter.formatDate !== 'function'
        ) {
            throw new TypeError(
                'dateAdapter must provide formatYear and formatDate functions.',
            );
        }
    }
    if (
        options.ageAdapter !== undefined &&
        typeof options.ageAdapter !== 'function'
    ) {
        throw new TypeError('ageAdapter must be a function.');
    }
    if (options.asOf !== undefined) validateDateValue(options.asOf);
}

/** A fresh reference fragment; it neither enables ages nor consults a clock. */
export function asOf(value: DateValue): Pick<GraphRenderOptions, 'asOf'> {
    validateDateValue(value);
    return { asOf: value };
}

function isYear(value: DateValue): boolean {
    return (
        (typeof value === 'string' || typeof value === 'number') &&
        /^\d{4}$/.test(String(value))
    );
}
function conventionalDate(value: DateValue): Date | undefined {
    if (value === '') return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
}
export const defaultDateAdapter: DateAdapter = {
    formatYear(value) {
        return isYear(value)
            ? String(value)
            : conventionalDate(value)?.getUTCFullYear().toString();
    },
    formatDate(value, context) {
        if (context.field !== 'created_at' && isYear(value))
            return String(value);
        return conventionalDate(value)?.toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'UTC',
        });
    },
};

/** Parse only day-precision Gregorian inputs, validating before Date can normalize. */
function exactDay(value: DateValue | undefined): number | undefined {
    if (value === undefined || isYear(value)) return undefined;
    if (typeof value === 'string') {
        const match =
            /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
                value,
            );
        if (!match) return undefined;
        const [, year, month, day, hour, minute, second, zone] = match;
        const check = new Date(0);
        check.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
        if (
            check.getUTCFullYear() !== Number(year) ||
            check.getUTCMonth() !== Number(month) - 1 ||
            check.getUTCDate() !== Number(day)
        )
            return undefined;
        if (
            hour !== undefined &&
            (Number(hour) > 23 ||
                Number(minute) > 59 ||
                Number(second ?? 0) > 59)
        )
            return undefined;
        if (
            zone &&
            zone !== 'Z' &&
            (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)
        )
            return undefined;
    }
    const parsed = conventionalDate(value);
    if (!parsed) return undefined;
    parsed.setUTCHours(0, 0, 0, 0);
    return parsed.getTime();
}

/** Conventional UTC ages are independent of the selected date presentation. */
export const defaultAgeAdapter: AgeAdapter = ({ person, asOf }) => {
    const birth = exactDay(person.born);
    if (birth === undefined) return undefined;
    const death = exactDay(person.died);
    if (person.died !== undefined && death === undefined) return undefined;
    const reference = exactDay(asOf);
    if (asOf !== undefined && reference === undefined) return undefined;
    const atDeath =
        death !== undefined && (reference === undefined || death <= reference);
    const endpoint = atDeath ? death : reference;
    if (endpoint === undefined || endpoint < birth) return undefined;
    const start = new Date(birth);
    const end = new Date(endpoint);
    let years = end.getUTCFullYear() - start.getUTCFullYear();
    // Comparing month/day makes Feb 29 advance on March 1 in non-leap years.
    if (
        end.getUTCMonth() < start.getUTCMonth() ||
        (end.getUTCMonth() === start.getUTCMonth() &&
            end.getUTCDate() < start.getUTCDate())
    )
        years--;
    return `${atDeath ? 'Age at death' : 'Age'}: ${years}`;
};

/** Enforce synchronous text results and retain callback failures as causes. */
export function adapterText(
    operation: string,
    context: PersonContext,
    callback: () => unknown,
): string | undefined {
    let value: unknown;
    try {
        value = callback();
    } catch (cause) {
        throw new Error(
            `${operation} failed for person ${JSON.stringify(context.id)}.`,
            { cause },
        );
    }
    if (value !== undefined && typeof value !== 'string') {
        throw new TypeError(
            `${operation} for person ${JSON.stringify(context.id)} must return string or undefined.`,
        );
    }
    return value || undefined;
}
