import { readFile } from 'node:fs/promises';
import { imageSize } from 'image-size';

import { PictureSourceSchema, type PictureSource } from './v2/schemas.js';
import type { PictureLoadContext, ResolvedPictureAsset } from './pictures.js';

/** Load document-owned bytes and validate them with native image decoding. */
export async function loadPictureAsset(
    source: PictureSource,
    context: PictureLoadContext,
): Promise<ResolvedPictureAsset> {
    let stage = 'validate the picture source';
    try {
        source = PictureSourceSchema.parse(source);
        stage = 'validate picture mode (expected embed or link)';
        if (context.mode !== 'embed' && context.mode !== 'link')
            throw new TypeError('Invalid picture mode.');
        let bytes: Buffer;
        let declaredMime: string | undefined;
        let linkedHref: string | undefined;
        if ('path' in source) {
            stage = 'resolve a relative path using a file documentUrl';
            if (!context.documentUrl)
                throw new Error('Relative paths require documentUrl.');
            const base = new URL(context.documentUrl);
            if (base.protocol !== 'file:')
                throw new Error('Path sources require a file documentUrl.');
            const url = new URL(source.path, base);
            if (url.protocol !== 'file:')
                throw new Error('Path must resolve to a file URL.');
            stage = 'read the resolved picture file';
            bytes = await readFile(url);
            linkedHref = url.href;
        } else if ('url' in source) {
            stage = 'download an HTTP(S) picture';
            const url = new URL(source.url);
            if (!['http:', 'https:'].includes(url.protocol))
                throw new Error('Expected an HTTP(S) URL.');
            const response = await fetch(url);
            if (!response.ok) {
                stage = `download the picture (HTTP ${response.status})`;
                throw new Error(`HTTP ${response.status}.`);
            }
            declaredMime = response.headers
                .get('content-type')
                ?.split(';')[0]
                ?.trim()
                .toLowerCase();
            bytes = Buffer.from(await response.arrayBuffer());
            linkedHref = url.href;
        } else {
            stage = 'decode a complete PNG/JPEG data URL';
            const match =
                /^data:(image\/(?:png|jpeg));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(
                    source.data,
                );
            if (!match || !match[2])
                throw new Error('Expected a complete PNG/JPEG data URL.');
            declaredMime = match[1];
            bytes = Buffer.from(match[2], 'base64');
        }
        stage = 'recognize valid PNG/JPEG content and intrinsic dimensions';
        const { type, width, height } = imageSize(bytes);
        if (
            (type !== 'png' && type !== 'jpg') ||
            !Number.isFinite(width) ||
            width <= 0 ||
            !Number.isFinite(height) ||
            height <= 0
        ) {
            throw new Error(
                'Expected PNG/JPEG bytes with positive finite dimensions.',
            );
        }
        const mime = type === 'png' ? 'image/png' : 'image/jpeg';
        stage = 'match the declared image MIME to the actual content';
        if (declaredMime?.startsWith('image/') && declaredMime !== mime)
            throw new Error('Declared image MIME does not match actual bytes.');
        const href = `data:${mime};base64,${bytes.toString('base64')}`;
        // Force alpha only after native decoding, so a valid transparent image
        // paints too. resvg silently omits failed raster decodes; bbox alone
        // only proves that an image header was recognized.
        stage = 'load the native image decoder';
        const { Resvg: NativeRender } = await import('@resvg/resvg-js');
        stage = 'decode the PNG/JPEG image content';
        const nativeRender = new NativeRender(
            `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><defs><filter id="decoded" x="0" y="0" width="1" height="1" filterUnits="userSpaceOnUse"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter></defs><image href="${href}" width="1" height="1" filter="url(#decoded)"/></svg>`,
            { font: { loadSystemFonts: false } },
        );
        if (nativeRender.render().pixels[3] !== 255)
            throw new Error('Native image decoding failed.');
        return {
            href: context.mode === 'link' && linkedHref ? linkedHref : href,
            width,
            height,
        };
    } catch (cause) {
        // Do not echo source data, URL credentials, or native parser payloads.
        const code =
            cause && typeof cause === 'object' && 'code' in cause
                ? cause.code
                : undefined;
        const detail =
            stage === 'read the resolved picture file' && code === 'ENOENT'
                ? 'the picture file was not found'
                : stage === 'read the resolved picture file' &&
                    code === 'EACCES'
                  ? 'permission to read the picture file was denied'
                  : `could not ${stage}`;
        throw new Error(
            `Could not load picture ${JSON.stringify(context.id)}: ${detail}.`,
            { cause },
        );
    }
}
