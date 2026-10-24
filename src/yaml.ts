import { CORE_SCHEMA, loadAll, mergeTag, timestampTag } from 'js-yaml';
import type { FamilyTree } from './types.js';

// js-yaml 5 defaults to YAML 1.2 core. Retain the old safe parser's
// timestamp and merge-key support without enabling executable YAML tags.
const schema = CORE_SCHEMA.withTags(mergeTag, timestampTag);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
    if (!isRecord(value)) {
        throw new TypeError(`${filename}: expected a family-tree mapping.`);
    }
    if (value.families !== undefined && !Array.isArray(value.families)) {
        throw new TypeError(`${filename}: families must be an array.`);
    }
    if (value.people !== undefined && !isRecord(value.people)) {
        throw new TypeError(`${filename}: people must be a mapping.`);
    }
    if (value.styles !== undefined && !isRecord(value.styles)) {
        throw new TypeError(`${filename}: styles must be a mapping.`);
    }
    return value as FamilyTree;
}
