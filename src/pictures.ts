import type { GraphRenderOptions } from './adapters.js';
import { buildGraph, validateGraphInput } from './render_graph.js';
import type { FamilyTree } from './types.js';
import type { PictureSource } from './v2/schemas.js';

export type PictureMode = 'embed' | 'link';
export interface ResolvedPictureAsset {
    href: string;
    width: number;
    height: number;
}
export interface PictureLoadContext {
    id: string;
    documentUrl?: string;
    mode: PictureMode;
}
export type PictureLoader = (
    source: PictureSource,
    context: PictureLoadContext,
) => ResolvedPictureAsset | Promise<ResolvedPictureAsset>;

/** A portable image and its intrinsic pixel dimensions, owned by the caller. */
export interface ResolvedPicture {
    dataUrl: string;
    width: number;
    height: number;
}
export type PictureResolver = (
    source: string,
) => ResolvedPicture | Promise<ResolvedPicture>;

/** Validate transport/metadata only; native image decoders own image validity. */
export function validateResolvedPicture(
    value: unknown,
    source: string,
): asserts value is ResolvedPicture {
    const picture = value as ResolvedPicture | null;
    if (
        !picture ||
        typeof picture.dataUrl !== 'string' ||
        !/^data:image\/(?:png|jpeg);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/.test(
            picture.dataUrl,
        ) ||
        !Number.isFinite(picture.width) ||
        picture.width <= 0 ||
        !Number.isFinite(picture.height) ||
        picture.height <= 0
    ) {
        throw new TypeError(
            `Invalid picture ${JSON.stringify(source)}: expected a base64 PNG/JPEG data URL and positive finite pixel dimensions.`,
        );
    }
}

/** Resolve once per source and render, preserving document metadata and ordering. */
export async function preparePictureGraph<T extends FamilyTree>(
    input: T,
    options: GraphRenderOptions<T>,
    defaultLoader?: PictureLoader,
    mode: PictureMode = options.pictureMode ?? 'embed',
) {
    validateGraphInput(input, options);
    const sources = new Map<string, string>();
    const images = new Map<
        string,
        { name: string; width: number; height: number }
    >();
    if (input.schemaVersion === 2) {
        const loader = options.pictureLoader ?? defaultLoader;
        for (const person of Object.values(input.people ?? {})) {
            const id = person?.picture;
            if (!id || sources.has(id)) continue;
            const source = input.pictures![id];
            if (!loader)
                throw new Error(
                    `No picture loader available for ${JSON.stringify(id)}.`,
                );
            const context: PictureLoadContext = { id, mode };
            if (options.documentUrl !== undefined)
                context.documentUrl = options.documentUrl;
            let picture: ResolvedPictureAsset;
            try {
                picture = await loader(source, context);
            } catch (cause) {
                throw new Error(
                    `Picture loader failed for ${JSON.stringify(id)}.`,
                    { cause },
                );
            }
            validateResolvedPictureAsset(picture, id, mode, 'path' in source);
            if ('data' in source && !picture.href.startsWith('data:'))
                throw new TypeError(
                    `Invalid picture ${JSON.stringify(id)}: data sources must remain inline.`,
                );
            sources.set(id, picture.href);
            images.set(picture.href, {
                name: picture.href,
                width: picture.width,
                height: picture.height,
            });
        }
    } else if (options.pictureResolver) {
        for (const person of Object.values(input.people ?? {})) {
            const source = person?.picture;
            if (!source || sources.has(source)) continue;
            let picture: ResolvedPicture;
            try {
                picture = await options.pictureResolver(source);
            } catch (cause) {
                throw new Error(
                    `Picture resolver failed for ${JSON.stringify(source)}.`,
                    { cause },
                );
            }
            validateResolvedPicture(picture, source);
            sources.set(source, picture.dataUrl);
            images.set(picture.dataUrl, {
                name: picture.dataUrl,
                width: picture.width,
                height: picture.height,
            });
        }
    }
    return {
        dot: buildGraph(input, options, sources),
        images: [...images.values()],
    };
}

/** Transport policy and dimensions; each environment verifies native image decoding. */
export function validateResolvedPictureAsset(
    value: unknown,
    id: string,
    mode: PictureMode,
    allowFile = false,
): asserts value is ResolvedPictureAsset {
    const picture = value as ResolvedPictureAsset | null;
    let validHref = false;
    if (picture && typeof picture.href === 'string') {
        if (picture.href.startsWith('data:')) {
            try {
                validateResolvedPicture(
                    { ...picture, dataUrl: picture.href },
                    id,
                );
                validHref = true;
            } catch {
                /* Report the common asset error below. */
            }
        } else if (mode === 'link') {
            try {
                const protocol = new URL(picture.href).protocol;
                validHref =
                    protocol === 'http:' ||
                    protocol === 'https:' ||
                    (allowFile && protocol === 'file:');
            } catch {
                /* Relative/unsupported hrefs cannot escape the loader boundary. */
            }
        }
    }
    if (
        !picture ||
        !validHref ||
        !Number.isFinite(picture.width) ||
        picture.width <= 0 ||
        !Number.isFinite(picture.height) ||
        picture.height <= 0
    ) {
        throw new TypeError(
            `Invalid picture ${JSON.stringify(id)}: expected a supported ${mode === 'embed' ? 'embedded PNG/JPEG' : 'image URL'} and positive finite pixel dimensions.`,
        );
    }
}

/** Viz emits registered image names verbatim; preserve their value in valid XML. */
export function escapeSvgPictureHrefs(
    svg: string,
    images: readonly { name: string }[],
): string {
    for (const { name } of images) {
        const escaped = name
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        if (escaped !== name)
            svg = svg.replaceAll(
                `<image xlink:href="${name}"`,
                `<image xlink:href="${escaped}"`,
            );
    }
    return svg;
}
