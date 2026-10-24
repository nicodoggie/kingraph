import join from './join.js';
import type { Fragment } from './join.js';
import slugify from './slugify.js';
import applyStyle from './apply_style.js';
import idGenerator from './id_generator.js';
import COLORS from './defaults/colors.js';
import type { Family, FamilyTree, Person, StyleProperties } from './types.js';

const LINE2 = '# ' + Array(74).join('-');
type Path = (string | number)[];

/** Render browser-safe DOT, with family colors owned by this render. */
export default function renderGraph(data: FamilyTree): string {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new TypeError('Family tree must be an object.');
    }
    const getId = idGenerator();
    return join(
        [
            'digraph G {',
            {
                indent: [
                    applyStyle(data, [':bgcolor']),
                    'edge [',
                    { indent: applyStyle(data, [':edge']) },
                    ']',
                    '',
                    'node [',
                    { indent: applyStyle(data, [':node']) },
                    ']',
                    '',
                    applyStyle(data, [':digraph']),
                    (data.families || []).map((family, id) =>
                        renderFamily(family || {}, [id]),
                    ),
                    Object.entries(data.people || {}).map(([id, person]) =>
                        renderPerson(data, person || {}, id),
                    ),
                ],
            },
            '}',
        ],
        { indent: '  ' },
    );

    function renderFamily(family: Family, path: Path): Fragment {
        const slug = slugify(path);
        const color = COLORS[getId('family') % COLORS.length];
        const parents = family.parents || [];
        const parents2 = family.parents2 || [];
        const children = family.children || [];
        const children2 = family.children2 || [];
        const hasParents = parents.length + parents2.length > 0;
        const hasChildren = children.length + children2.length > 0;
        const union = `union_${slug}`;
        const kids = `siblings_${slug}`;

        function style(
            classes: string[],
            before: StyleProperties = {},
        ): Fragment {
            return { indent: applyStyle(data, classes, { before }) };
        }

        return [
            '',
            `subgraph cluster_family_${slug} {`,
            style([':family']),
            {
                indent: [
                    family.house && [
                        applyStyle(data, [':house'], {
                            before: {
                                label: `<<b>${family.house}</b>>`,
                                labelhref: family.links?.[0],
                            },
                        }),
                    ],
                    // Preserve the legacy reverse traversal and resulting nested path IDs.
                    [...(family.families || [])]
                        .reverse()
                        .map((nested, idx) =>
                            renderFamily(nested || {}, path.concat(idx)),
                        ),
                    '',
                    `# Family ${summarizeFamily(family)}`,
                    LINE2,
                    '',
                    hasParents && [
                        `${union} [`,
                        style([':union'], { fillcolor: color }),
                        ']',
                        '',
                        parents.length > 0 && [
                            `{${parents.map(escape).join(', ')}} -> ${union} [`,
                            style([':parent-link'], { color }),
                            ']',
                        ],
                        parents2.length > 0 && [
                            `{${parents2.map(escape).join(', ')}} -> ${union} [`,
                            style([':parent-link', ':parent2-link'], { color }),
                            ']',
                        ],
                    ],
                    hasParents &&
                        hasChildren && [
                            `${union} -> ${kids} [`,
                            style([':parent-link', ':parent-child-link'], {
                                color,
                            }),
                            ']',
                        ],
                    hasChildren && [
                        `${kids} [`,
                        style([':children'], { fillcolor: color }),
                        ']',
                        children.length > 0 && [
                            `${kids} -> {${children.map(escape).join(', ')}} [`,
                            style([':child-link'], { color }),
                            ']',
                        ],
                        children2.length > 0 && [
                            `${kids} -> {${children2.map(escape).join(', ')}} [`,
                            style([':child-link', ':child2-link'], { color }),
                            ']',
                        ],
                    ],
                    // Legacy sibling links were unreachable: (children.length * 2 > 1) > 1.
                    // Keep them disabled; repairing that layout is outside this port.
                ],
            },
            '}',
        ];
    }
}

function renderPerson(data: FamilyTree, person: Person, id: string): Fragment {
    let label: string;
    if (
        person.name ||
        person.fullname ||
        person.gender ||
        person.born ||
        person.died ||
        person.picture
    ) {
        let gender = '';
        if (person.gender?.toLowerCase() === 'f') gender = ' ♀';
        else if (person.gender?.toLowerCase() === 'm') gender = ' ♂';

        let picture = '';
        if (person.picture)
            picture = `<tr><td><img scale='true' src='${person.picture}' /></td></tr>`;
        label =
            '<<table align="center" border="0" cellpadding="0" cellspacing="2" width="4">' +
            picture +
            '<tr><td align="center">' +
            `${person.name || person.display || id}${gender}</td></tr>`;
        if (person.fullname) {
            label +=
                '<tr><td align="center"><font point-size="10" color="#aaaaaa">' +
                `${person.fullname}</font></td></tr>`;
        }
        if (person.born || person.died) {
            const born = person.born ? `*${dateYear(person.born)}` : '';
            const died = person.died ? `†${dateYear(person.died)}` : '';
            const lifespan = born && died ? `${born} — ${died}` : born || died;
            label +=
                '<tr><td align="center"><font point-size="10" color="#aaaaaa">' +
                `${lifespan}</font></td></tr>`;
        }
        label += '</table>>';
    } else {
        label = id;
    }
    return [
        `"${id}" [`,
        `tooltip="${renderPersonTooltip(person)}"`,
        {
            indent: [
                applyStyle(data, person.class || [], {
                    before: { label, href: person.links?.[0] },
                }),
            ],
        },
        ']',
    ];
}

function renderPersonTooltip(person: Person): string {
    const date = (value: Date | string | number): string =>
        new Date(value).toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'UTC',
        });
    let text = '';
    if (person.first_name || person.last_name) {
        text += (person.first_name || '') + (person.last_name || '') + '\n';
    }
    if (person.created_at) text += `Added ${date(person.created_at)}\n`;
    const lifeDate = (value: Date | string | number): string =>
        isYear(value) ? String(value) : date(value);
    if (person.born) text += `Born ${lifeDate(person.born)} `;
    if (person.born && person.died) text += ` -- died ${lifeDate(person.died)}`;
    if (!person.born && person.died) text += ` Died ${lifeDate(person.died)}`;
    text += '\n';
    if (person.comment) text += person.comment.slice(0, 50) + '...';
    return text + '\n';
}

function isYear(value: Date | string | number): boolean {
    return (
        (typeof value === 'number' || typeof value === 'string') &&
        /^\d{4}$/.test(String(value))
    );
}

function dateYear(value: Date | string | number): string | number {
    return isYear(value) ? String(value) : new Date(value).getUTCFullYear();
}

function summarizeFamily(family: Family): string {
    const parents = [
        ...(family.parents || []),
        ...(family.parents2 || []),
    ].filter(Boolean);
    const children = [
        ...(family.children || []),
        ...(family.children2 || []),
    ].filter(Boolean);
    return `[${parents.join(', ')}] -> [${children.join(', ')}]`;
}

function escape(str: string): string {
    return /^[A-Za-z]+$/.test(str) ? str : JSON.stringify(str);
}
