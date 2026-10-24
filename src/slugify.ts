type SlugInput = string | number | SlugInput[];
interface SlugOptions {
    sep?: string;
}

export default function slugify(
    object: SlugInput,
    options?: SlugOptions,
): string {
    const sep = options?.sep || '_';
    if (Array.isArray(object))
        return object.map((value) => slugify(value, options)).join(sep);
    const words = object
        .toString()
        .toLowerCase()
        .match(/[a-z0-9]+/g);
    if (!words)
        throw new TypeError('Cannot slugify a value without letters or digits');
    return words.join(sep);
}
