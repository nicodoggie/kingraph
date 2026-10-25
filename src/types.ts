import type { z } from 'zod';
import type {
    StylePropertiesSchema,
    StylesSchema,
    PersonSchema,
    FamilySchema,
    FamilyTreeSchema,
} from './v1/schemas.js';

export type StyleProperties = z.infer<typeof StylePropertiesSchema>;
export type Stylesheet = z.infer<typeof StylesSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type Family = z.infer<typeof FamilySchema>;
export type FamilyTree = z.infer<typeof FamilyTreeSchema>;
