/** Explicit v1 browser entry. */
import { render as sharedRender } from '../browser.js';
import type {
    BrowserRenderFunction,
    BrowserRenderOptions as SharedOptions,
} from '../browser.js';
import sharedDot from '../render_graph.js';
import { parseFamilyYamlWith as sharedYaml } from '../yaml.js';
import { validateFamilyTree } from './schemas.js';
import type { FamilyTree } from './types.js';
export type {
    FamilyTree,
    Family,
    Person,
    StyleProperties,
    Stylesheet,
} from './types.js';
export type { BrowserRenderFormat } from '../browser.js';
export type BrowserRenderOptions = SharedOptions<FamilyTree>;

export const render = (async (
    data: FamilyTree,
    options: BrowserRenderOptions = {},
) => {
    validateFamilyTree(data);
    return sharedRender(data, options);
}) as BrowserRenderFunction<FamilyTree>;
export default render;
export function renderDot(
    data: FamilyTree,
    options: GraphRenderOptions = {},
): string {
    validateFamilyTree(data);
    return sharedDot(data, options);
}
export function parseFamilyYaml(
    source: string,
    filename = 'family YAML',
): FamilyTree {
    return sharedYaml(source, filename, validateFamilyTree);
}

export { asOf, defaultDateAdapter, defaultAgeAdapter } from '../adapters.js';
export type { DateValue } from '../adapters.js';
import type * as adapters from '../adapters.js';
export type PersonContext = adapters.PersonContext<FamilyTree>;
export type DateContext = adapters.DateContext<FamilyTree>;
export type DateAdapter = adapters.DateAdapter<FamilyTree>;
export type AgeContext = adapters.AgeContext<FamilyTree>;
export type AgeAdapter = adapters.AgeAdapter<FamilyTree>;
export type GraphRenderOptions = adapters.GraphRenderOptions<FamilyTree>;
export type {
    ResolvedPicture,
    PictureResolver,
    PictureMode,
    ResolvedPictureAsset,
    PictureLoadContext,
    PictureLoader,
} from '../pictures.js';
export type { PictureSource } from '../v2/schemas.js';
export {
    loadPicture,
    loadPictureAsset,
    embedSvgPictures,
} from '../browser_pictures.js';
export { svgToPng } from '../browser_png.js';
