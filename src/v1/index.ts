/** Explicit v1 Node entry. */
import { render as sharedRender } from '../render.js';
import type {
    RenderFunction,
    RenderOptions as SharedOptions,
} from '../render.js';
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
export type { RenderFormat } from '../render.js';
export type RenderOptions = SharedOptions<FamilyTree>;

export const render = (async (
    data: FamilyTree,
    options: RenderOptions = {},
) => {
    validateFamilyTree(data);
    return sharedRender(data, options);
}) as RenderFunction<FamilyTree>;
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
export { loadPictureAsset } from '../node_pictures.js';
