import type { FamilyTree as V1FamilyTree } from './v1/types.js';
import type { FamilyTree as V2FamilyTree } from './v2/schemas.js';

export type {
    StyleProperties,
    Stylesheet,
    Person,
    Family,
} from './v1/types.js';
export type FamilyTree = V1FamilyTree | V2FamilyTree;
