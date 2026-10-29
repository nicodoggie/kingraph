import {
    loadPicture,
    loadPictureAsset,
    type PictureLoader,
} from '@nicodoggie/kingraph/browser';
import ages from './examples/ages.yaml?raw';
import simpsons from '../examples/simpsons.yaml?raw';
import modernFamily from '../examples/modernfamily.yaml?raw';
import potter from '../examples/potter.yaml?raw';
import links from './examples/links.yaml?raw';
import houses from './examples/houses.yaml?raw';
import secondary from './examples/secondary.yaml?raw';
import styling from './examples/styling.yaml?raw';
import portraits from './examples/portraits.yaml?raw';
import alexUrl from './examples/portraits/alex.png?url&no-inline';
import samUrl from './examples/portraits/sam.png?url&no-inline';

export const examples = [
    {
        label: 'Fictional family · full dates',
        yaml: ages,
        description:
            'What to try: enable conventional ages and change the reference date; hover Avery for full date metadata.',
    },
    {
        label: 'The Simpsons',
        yaml: simpsons,
        description:
            'What to try: explore a compact family with year-only dates; these do not imply exact ages.',
    },
    {
        label: 'Modern Family',
        yaml: modernFamily,
        description:
            'What to try: follow a larger connected family and compare its branches.',
    },
    {
        label: 'Harry Potter · spoilers',
        yaml: potter,
        description:
            'What to try: zoom and pan through a larger fictional tree. Contains spoilers.',
    },
    {
        label: 'Links & tooltips',
        yaml: links,
        description:
            'What to try: hover Alex for names, dates and a comment; click Alex or Harbor archive to jump to local notes below.',
    },
    {
        label: 'Nested houses',
        yaml: houses,
        description:
            'What to try: find Garden branch inside Harbor house; edit a house label and render again.',
    },
    {
        label: 'Secondary connections',
        yaml: secondary,
        description:
            'What to try: compare solid and dashed edges. parents2 and children2 select alternate styles; they do not encode adoption or step relationships.',
    },
    {
        label: 'Class colors & vertical layout',
        yaml: styling,
        description:
            'What to try: compare ocean and forest classes; change rankdir from TB to LR and render to rotate the layout.',
    },
    {
        label: 'Portable portraits',
        yaml: portraits,
        description:
            'What to try: inspect the v2 picture catalog and its relative paths. The preview links the bundled portraits; SVG/PNG downloads embed them. Arbitrary paths and URLs are not loaded.',
    },
];

const portraitUrls = new Map([
    ['portrait-alex', alexUrl],
    ['portrait-sam', samUrl],
]);

export async function resolveExamplePicture(source: string) {
    const url = portraitUrls.get(source);
    if (!url)
        throw new Error(
            `Unknown playground picture: ${source}. Use portrait-alex or portrait-sam.`,
        );
    return loadPicture(url);
}

// The editor has no source-file location. This curated adapter supplies the
// two authored examples' Vite URLs without granting arbitrary resource access.
export const resolveExampleAsset: PictureLoader = async (source, context) => {
    if ('data' in source) return loadPictureAsset(source, context);
    const url =
        'path' in source
            ? new Map([
                  ['./portraits/alex.png', alexUrl],
                  ['./portraits/sam.png', samUrl],
              ]).get(source.path)
            : undefined;
    if (!url)
        throw new Error(
            'Unknown playground picture: use a bundled portrait path or inline image data.',
        );
    return loadPictureAsset(
        { url: new URL(url, document.baseURI).href },
        context,
    );
};
