import { CORE_SCHEMA, loadAll, mergeTag, timestampTag } from 'js-yaml';
import type { FamilyTree } from './types.js';
import { validateFamilyTree } from './v1/schemas.js';

// js-yaml 5 defaults to YAML 1.2 core. Retain the old safe parser's
// timestamp and merge-key support without enabling executable YAML tags.
const schema = CORE_SCHEMA.withTags(mergeTag, timestampTag);

/** Parse family YAML; file access stays with the caller, not the rendering core. */
export function parseFamilyYaml(
    source: string,
    filename = 'family YAML',
): FamilyTree {
    let value: unknown;
    try {
        const documents = loadAll(source, { schema, filename });
        if (documents.length > 1)
            throw new Error('Expected a single family-tree document.');
        value = documents.length === 0 ? {} : documents[0];
    } catch (error) {
        throw new Error(
            `${filename}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
        );
    }
    return validateFamilyTree(value, filename);
}
