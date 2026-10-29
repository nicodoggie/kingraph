import {
    adapterText,
    defaultDateAdapter,
    validateGraphRenderOptions,
} from './adapters.js';
import type {
    DateContext,
    GraphRenderOptions,
    PersonContext,
} from './adapters.js';
import join from './join.js';
import type { Fragment } from './join.js';
import slugify from './slugify.js';
import applyStyle from './apply_style.js';
import idGenerator from './id_generator.js';
import COLORS from './defaults/colors.js';
import { validateFamilyTree } from './yaml.js';
import type { Family, FamilyTree, Person, StyleProperties } from './types.js';

const LINE2 = '# ' + Array(74).join('-');
type Path = (string | number)[];

/** Render browser-safe DOT, with family colors owned by this render. */
export default function renderGraph<T extends FamilyTree>(
    data: T,
    options: GraphRenderOptions<T> = {},
): string {
    validateGraphInput(data, options);
    return buildGraph(data, options);
}

/** Shared validation boundary before any explicitly supplied picture loader. */
export function validateGraphInput<T extends FamilyTree>(
    data: T,
    options: GraphRenderOptions<T>,
): FamilyTree {
    validateGraphRenderOptions(options);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new TypeError('Family tree must be an object.');
    }
    return validateFamilyTree(data);
}

/** Canonical builder; substitutions affect image sources, never adapter contexts. */
export function buildGraph<T extends FamilyTree>(
    data: T,
    options: GraphRenderOptions<T>,
    pictureSources?: ReadonlyMap<string, string>,
): string {
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
                        renderPerson(
                            data,
                            person || {},
                            id,
                            options,
                            pictureSources,
                        ),
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
                                href: family.links?.[0],
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

function renderPerson<T extends FamilyTree>(
    data: T,
    person: Person,
    id: string,
    options: GraphRenderOptions<T>,
    pictureSources?: ReadonlyMap<string, string>,
): Fragment {
    const context: PersonContext<T> = { id, person, tree: data };
    const adapter = options.dateAdapter ?? defaultDateAdapter;
    const date = (
        field: DateContext['field'],
        operation: 'formatYear' | 'formatDate',
    ) => {
        const value = person[field];
        if (value === undefined) return undefined;
        const dateContext = { ...context, field };
        return adapterText(`dateAdapter.${operation} (${field})`, context, () =>
            adapter[operation](value, dateContext),
        );
    };
    const bornYear = date('born', 'formatYear');
    const diedYear = date('died', 'formatYear');
    const bornDate = date('born', 'formatDate');
    const diedDate = date('died', 'formatDate');
    const addedDate = date('created_at', 'formatDate');
    const age = options.ageAdapter
        ? adapterText('ageAdapter', context, () =>
              options.ageAdapter!({ ...context, asOf: options.asOf }),
          )
        : undefined;

    let label: string;
    if (
        person.name ||
        person.fullname ||
        person.gender ||
        bornYear ||
        diedYear ||
        age ||
        person.picture
    ) {
        let gender = '';
        if (person.gender?.toLowerCase() === 'f') gender = ' ♀';
        else if (person.gender?.toLowerCase() === 'm') gender = ' ♂';

        let picture = '';
        if (person.picture) {
            const catalog =
                data.schemaVersion === 2 ? data.pictures : undefined;
            const source = catalog?.[person.picture];
            const href =
                pictureSources?.get(person.picture) ??
                (source
                    ? 'url' in source
                        ? source.url
                        : 'data' in source
                          ? source.data
                          : source.path
                    : person.picture);
            // Catalog/loaded sources can contain HTML delimiters; keep legacy DOT intact.
            picture = `<tr><td><img scale='true' src='${data.schemaVersion === 2 || pictureSources?.has(person.picture) ? htmlText(href) : href}' /></td></tr>`;
        }
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
        if (bornYear || diedYear) {
            const born = bornYear ? `*${htmlText(bornYear)}` : '';
            const died = diedYear ? `†${htmlText(diedYear)}` : '';
            const lifespan = born && died ? `${born} — ${died}` : born || died;
            label +=
                '<tr><td align="center"><font point-size="10" color="#aaaaaa">' +
                `${lifespan}</font></td></tr>`;
        }
        if (age)
            label +=
                '<tr><td align="center"><font point-size="10" color="#aaaaaa">' +
                `${htmlText(age)}</font></td></tr>`;
        label += '</table>>';
    } else {
        label = id;
    }
    return [
        `"${id}" [`,
        `tooltip="${renderPersonTooltip(person, bornDate, diedDate, addedDate, age)}"`,
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

function renderPersonTooltip(
    person: Person,
    born?: string,
    died?: string,
    added?: string,
    age?: string,
): string {
    let text = '';
    if (person.first_name || person.last_name) {
        text += (person.first_name || '') + (person.last_name || '') + '\n';
    }
    if (added) text += `Added ${dotText(added)}\n`;
    if (born) text += `Born ${dotText(born)} `;
    if (born && died) text += ` -- died ${dotText(died)}`;
    if (!born && died) text += ` Died ${dotText(died)}`;
    text += '\n';
    if (age) text += dotText(age) + '\n';
    if (person.comment) text += person.comment.slice(0, 50) + '...';
    return text + '\n';
}

function htmlText(value: string): string {
    return (
        value
            // HTML labels still undergo Graphviz escString substitutions.
            .replace(/\\/g, '\\\\')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\r\n|\r|\n/g, '<br/>')
    );
}
function dotText(value: string): string {
    return (
        value
            // Preserve literals through both DOT parsing and escString expansion.
            .replace(/\\/g, '\\\\\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r\n|\r|\n/g, '\\n')
    );
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
