export type Fragment =
    | string
    | number
    | boolean
    | null
    | undefined
    | { indent: Fragment }
    | Fragment[];

interface JoinOptions {
    prefix?: string;
    indent?: string;
    sep?: string;
}

export default function join(
    array: Fragment,
    options: JoinOptions = {},
): string {
    const prefix = options.prefix || '';
    const indent = options.indent || '\t';
    return flatten(array)
        .map((fragment) => {
            if (typeof fragment === 'object') {
                return join(fragment.indent, {
                    ...options,
                    prefix: prefix + indent,
                });
            }
            return prefix + fragment;
        })
        .join(options.sep || '\n');
}

type FlatFragment = string | number | true | { indent: Fragment };

function flatten(array: Fragment): FlatFragment[] {
    if (array == null || array === false) return [];
    if (!Array.isArray(array)) return [array];
    return array.flatMap(flatten);
}
