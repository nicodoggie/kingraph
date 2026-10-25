import { z } from 'zod';

/** Graphviz owns attribute names; kingraph accepts scalar values and omits nulls. */
export const StylePropertiesSchema = z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]),
);
export const StylesSchema = z.record(z.string(), StylePropertiesSchema);

const dateValue = z.union([z.date(), z.string(), z.number()]);
const strings = z.array(z.string());

/** Unknown author metadata is retained, without acquiring rendering semantics. */
export const PersonSchema = z.looseObject({
    name: z.string().optional(),
    display: z.string().optional(),
    fullname: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    gender: z.string().optional(),
    born: dateValue.optional(),
    died: dateValue.optional(),
    created_at: dateValue.optional(),
    picture: z.string().optional(),
    links: strings.optional(),
    class: strings.optional(),
    comment: z.string().optional(),
});

const FamilyFieldsSchema = z.looseObject({
    parents: strings.optional(),
    parents2: strings.optional(),
    children: strings.optional(),
    children2: strings.optional(),
    house: z.string().optional(),
    links: strings.optional(),
});

// Only the recursive link needs an explicit type; field types come from Zod.
type RecursiveFamily = z.infer<typeof FamilyFieldsSchema> & {
    families?: (RecursiveFamily | null)[];
};
export const FamilySchema: z.ZodType<RecursiveFamily> =
    FamilyFieldsSchema.extend({
        families: z.lazy(() => z.array(FamilySchema.nullable())).optional(),
    });

/** Unversioned documents remain v1. Future versions must not be guessed as v1. */
export const FamilyTreeSchema = z.looseObject({
    schemaVersion: z.literal(1).optional(),
    families: z.array(FamilySchema.nullable()).optional(),
    people: z.record(z.string(), PersonSchema.nullable()).optional(),
    styles: StylesSchema.optional(),
});

export function validateFamilyTree(
    input: unknown,
    source = 'Family tree',
): z.infer<typeof FamilyTreeSchema> {
    const result = FamilyTreeSchema.safeParse(input);
    if (result.success) return result.data;
    const details = result.error.issues
        .map(
            (issue) =>
                `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`,
        )
        .join('; ');
    throw new TypeError(`${source}: invalid v1 input: ${details}`);
}
