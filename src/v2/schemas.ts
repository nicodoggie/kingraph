import { z } from 'zod';
import { FamilyTreeSchema as V1FamilyTreeSchema } from '../v1/schemas.js';

export {
    FamilySchema,
    PersonSchema,
    StylePropertiesSchema,
    StylesSchema,
} from '../v1/schemas.js';

const nonempty = z
    .string()
    .refine((value) => value.trim().length > 0, 'Expected a nonempty source.');
const httpUrl = nonempty.refine((value) => {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}, 'Expected an absolute HTTP(S) URL.');
const dataUrl = nonempty.regex(
    /^data:image\/(?:png|jpeg);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/,
    'Expected a complete base64 PNG/JPEG data URL.',
);
const relativePath = nonempty.refine(
    (value) => !/^(?:[/\\]|[a-z][a-z\d+.-]*:)/i.test(value.trim()),
    'Expected a relative source path without a URI scheme.',
);

/** Sources are exclusive; author metadata belongs on the tree/person instead. */
export const PictureSourceSchema = z.union([
    z.strictObject({ url: httpUrl }),
    z.strictObject({ data: dataUrl }),
    z.strictObject({ path: relativePath }),
]);
export type PictureSource = z.infer<typeof PictureSourceSchema>;

export const FamilyTreeSchema = V1FamilyTreeSchema.extend({
    schemaVersion: z.literal(2),
    pictures: z.record(z.string(), PictureSourceSchema).optional(),
}).superRefine((tree, context) => {
    for (const [id, person] of Object.entries(tree.people ?? {})) {
        const key = person?.picture;
        if (key && !Object.hasOwn(tree.pictures ?? {}, key)) {
            context.addIssue({
                code: 'custom',
                path: ['people', id, 'picture'],
                message: `Undeclared picture ${JSON.stringify(key)}.`,
            });
        }
    }
});

export type FamilyTree = z.infer<typeof FamilyTreeSchema>;
export type {
    Family,
    Person,
    StyleProperties,
    Stylesheet,
} from '../v1/types.js';

export function validateFamilyTree(
    input: unknown,
    source = 'Family tree',
): FamilyTree {
    const result = FamilyTreeSchema.safeParse(input);
    if (result.success) return result.data;
    const details = result.error.issues
        .map(
            (issue) =>
                `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`,
        )
        .join('; ');
    throw new TypeError(`${source}: invalid v2 input: ${details}`);
}
