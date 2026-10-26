/** Explicit v1 rendering API; the package root re-exports this entry. */
export { default, render } from '../render.js';
export type { RenderFormat, RenderOptions } from '../render.js';
export { default as renderDot } from '../render_graph.js';
export { parseFamilyYaml } from '../yaml.js';
export type {
    FamilyTree,
    Family,
    Person,
    StyleProperties,
    Stylesheet,
} from '../types.js';

export { asOf, defaultDateAdapter, defaultAgeAdapter } from '../adapters.js';
export type {
    DateValue,
    PersonContext,
    DateContext,
    DateAdapter,
    AgeContext,
    AgeAdapter,
    GraphRenderOptions,
} from '../adapters.js';
