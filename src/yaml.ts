import { CORE_SCHEMA, loadAll, mergeTag, timestampTag } from 'js-yaml';
import type { FamilyTree } from './types.js';
import { validateFamilyTree as validateV1 } from './v1/schemas.js';
import { validateFamilyTree as validateV2 } from './v2/schemas.js';

// js-yaml 5 defaults to YAML 1.2 core. Retain the old safe parser's
// timestamp and merge-key support without enabling executable YAML tags.
const schema = CORE_SCHEMA.withTags(mergeTag, timestampTag);

/** Parse family YAML; file access stays with the caller, not the rendering core. */
export function parseFamilyYaml(
    source: string,
    filename = 'family YAML',
): FamilyTree {
    return parseFamilyYamlWith(source, filename, validateFamilyTree);
}

/** Version-specific entries share parsing while retaining their own validator. */
export function parseFamilyYamlWith<T extends FamilyTree>(
    source: string,
    filename: string,
    validate: (input: unknown, filename: string) => T,
): T {
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
    return validate(value, filename);
}

/** Explicit dispatch; absent versions remain legacy v1. */
export function validateFamilyTree(
    input: unknown,
    source = 'Family tree',
): FamilyTree {
    if (
        input &&
        typeof input === 'object' &&
        'schemaVersion' in input &&
        input.schemaVersion === 2
    )
        return validateV2(input, source);
    return validateV1(input, source);
}
