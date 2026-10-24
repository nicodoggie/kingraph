import DEFAULT_STYLES from './defaults/styles.js';
import type { FamilyTree, StyleProperties, Stylesheet } from './types.js';

interface StyleOptions {
    before?: StyleProperties;
    after?: StyleProperties;
}

export default function applyStyle(
    data: FamilyTree,
    classes: readonly string[],
    options: StyleOptions = {},
): string[] {
    const result: StyleProperties = Object.assign({}, options.before);
    function applyStyles(stylesheet: Stylesheet): void {
        for (const [key, properties] of Object.entries(stylesheet)) {
            if (classes.includes(key)) Object.assign(result, properties);
        }
    }
    applyStyles(DEFAULT_STYLES);
    applyStyles(data.styles || {});
    Object.assign(result, options.after);
    return Object.entries(result).flatMap(([key, value]) => {
        if (value == null) return [];
        const rendered =
            typeof value === 'string' && /^<.*>$/.test(value)
                ? value
                : JSON.stringify(value);
        return [`${key}=${rendered}`];
    });
}
