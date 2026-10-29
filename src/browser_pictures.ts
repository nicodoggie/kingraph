import { validateResolvedPicture } from './pictures.js';
import type { ResolvedPicture } from './pictures.js';
import { validateResolvedPictureAsset } from './pictures.js';
import type { PictureLoadContext, ResolvedPictureAsset } from './pictures.js';
import { PictureSourceSchema } from './v2/schemas.js';
import type { PictureSource } from './v2/schemas.js';

/** Explicit browser fetch/decode helper. Importing this module touches no DOM. */
export async function loadPicture(source: string): Promise<ResolvedPicture> {
    return fetchPicture(source, source);
}

async function fetchPicture(
    source: string,
    description: string,
    explainFetchFailure = false,
): Promise<ResolvedPicture> {
    const response = await fetch(source).catch((cause: unknown) => {
        if (!explainFetchFailure) throw cause;
        throw new Error(
            'Could not fetch picture; embedding requires a reachable URL with CORS permission.',
            { cause },
        );
    });
    if (!response.ok) {
        throw new Error(
            `Could not fetch picture ${JSON.stringify(description)}: HTTP ${response.status}.`,
        );
    }
    const input = await response.blob();
    const type = input.type.split(';')[0].trim().toLowerCase();
    if (type !== 'image/png' && type !== 'image/jpeg') {
        throw new TypeError('Picture must have PNG or JPEG content type.');
    }
    const blob = input.slice(0, input.size, type);
    const url = URL.createObjectURL(blob);
    let image: HTMLImageElement | undefined;
    try {
        image = new Image();
        image.src = url;
        try {
            await image.decode();
        } catch (cause) {
            throw new Error(
                `Could not decode picture ${JSON.stringify(description)}.`,
                {
                    cause,
                },
            );
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () =>
                reject(reader.error ?? new Error('Could not read picture.'));
            reader.readAsDataURL(blob);
        });
        const picture = {
            dataUrl,
            width: image.naturalWidth,
            height: image.naturalHeight,
        };
        validateResolvedPicture(picture, description);
        return picture;
    } finally {
        image?.removeAttribute('src');
        URL.revokeObjectURL(url);
    }
}

/** Link mode uses the browser's ordinary image policy, without a CORS fetch. */
export async function loadPictureAsset(
    source: PictureSource,
    context: PictureLoadContext,
): Promise<ResolvedPictureAsset> {
    try {
        const input = PictureSourceSchema.parse(source);
        if (context.mode !== 'embed' && context.mode !== 'link')
            throw new TypeError('picture mode must be embed or link.');
        let href: string;
        if ('path' in input) {
            if (!context.documentUrl)
                throw new TypeError(
                    'Relative picture paths require an absolute documentUrl.',
                );
            const base = new URL(context.documentUrl);
            href = new URL(input.path, base).href;
        } else href = 'url' in input ? input.url : input.data;
        if (
            !href.startsWith('data:') &&
            !['http:', 'https:'].includes(new URL(href).protocol)
        )
            throw new TypeError(
                'Browser pictures require an HTTP(S) URL or image data.',
            );
        let result: ResolvedPictureAsset;
        if (context.mode === 'embed' || 'data' in input) {
            const picture = await fetchPicture(href, context.id, true);
            result = {
                href: picture.dataUrl,
                width: picture.width,
                height: picture.height,
            };
        } else {
            const image = new Image();
            try {
                image.src = href;
                await image.decode();
                result = {
                    href,
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                };
            } finally {
                image.removeAttribute('src');
            }
        }
        validateResolvedPictureAsset(result, context.id, context.mode);
        return result;
    } catch (cause) {
        let detail = '';
        if (cause instanceof Error) {
            if (cause.message.includes('documentUrl'))
                detail = ' Relative paths require an absolute documentUrl.';
            else if (cause.message.includes('CORS permission'))
                detail =
                    ' Embedding requires a reachable URL with CORS permission.';
            else if (
                cause.message.includes('decode') ||
                cause.name === 'EncodingError'
            )
                detail = ' Image decoding failed.';
        }
        throw new Error(
            `Could not load picture ${JSON.stringify(context.id)}.${detail}`,
            { cause },
        );
    }
}

/** Embed an existing layout; no Graphviz initialization or rerendering occurs. */
export async function embedSvgPictures(
    svg: string,
    baseUrl = globalThis.document.baseURI,
): Promise<string> {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (
        document.querySelector('parsererror') ||
        document.documentElement.localName !== 'svg' ||
        document.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg'
    )
        throw new TypeError('Expected a valid SVG document.');
    const xlink = 'http://www.w3.org/1999/xlink';
    const loads = new Map<string, Promise<ResolvedPictureAsset>>();
    const replacements: { element: Element; href: string; xlink: boolean }[] =
        [];
    for (const element of document.querySelectorAll('image')) {
        const href =
            element.getAttribute('href') ??
            element.getAttributeNS(xlink, 'href');
        if (!href) continue;
        let resolved: string;
        try {
            // These are final web hrefs, not unresolved catalog file paths.
            // Match inline SVG's page-relative URL semantics by default.
            resolved = new URL(href, baseUrl).href;
        } catch (cause) {
            throw new Error(
                'Could not embed picture: expected a valid image URL and web base.',
                { cause },
            );
        }
        replacements.push({
            element,
            href: resolved,
            xlink: !element.hasAttribute('href'),
        });
    }
    for (const { href } of replacements) {
        if (!loads.has(href))
            loads.set(
                href,
                loadPictureAsset(
                    href.startsWith('data:') ? { data: href } : { url: href },
                    {
                        id: href.startsWith('data:') ? 'inline image' : href,
                        mode: 'embed',
                    },
                ),
            );
    }
    // Settle every owned load before reporting a failure, so all temporary URLs are released.
    const results = await Promise.allSettled([...loads.values()]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    for (const replacement of replacements) {
        const picture = await loads.get(replacement.href)!;
        if (replacement.xlink)
            replacement.element.setAttributeNS(
                xlink,
                'xlink:href',
                picture.href,
            );
        else {
            replacement.element.setAttribute('href', picture.href);
            if (replacement.element.hasAttributeNS(xlink, 'href'))
                replacement.element.setAttributeNS(
                    xlink,
                    'xlink:href',
                    picture.href,
                );
        }
    }
    return new XMLSerializer().serializeToString(document);
}
