import { describe, expect, it, vi } from 'vitest';
import { loadPicture, render, svgToPng } from '../../src/browser.js';

function source(type: 'image/png' | 'image/jpeg') {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 16;
    try {
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#f00000';
        context.fillRect(0, 0, 24, 16);
        return canvas.toDataURL(type);
    } finally {
        canvas.width = canvas.height = 0;
    }
}

async function expectRed(png: Uint8Array) {
    const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(png)], { type: 'image/png' }),
    );
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    try {
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
        ).data;
        let red = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            if (
                pixels[i] > 200 &&
                pixels[i + 1] < 40 &&
                pixels[i + 2] < 40 &&
                pixels[i + 3] === 255
            )
                red++;
        }
        expect(red).toBeGreaterThan(50);
    } finally {
        bitmap.close();
        canvas.width = canvas.height = 0;
    }
}

describe('native portable browser pictures', () => {
    it('fetches and decodes PNG/JPEG, embeds them and paints both render PNG and exact SVG downloads', async () => {
        for (const type of ['image/png', 'image/jpeg'] as const) {
            const input = source(type);
            const picture = await loadPicture(input);
            expect(picture).toEqual({ dataUrl: input, width: 24, height: 16 });
            const resolver = vi.fn(() => picture);
            const tree = {
                people: {
                    A: { picture: 'portrait' },
                    B: { picture: 'portrait' },
                },
            };
            const svg = await render(tree, { pictureResolver: resolver });
            expect(svg).toContain(input);
            expect(resolver).toHaveBeenCalledExactlyOnceWith('portrait');
            await expectRed(await svgToPng(svg, 1));
            await expectRed(
                await render(tree, {
                    format: 'png',
                    scale: 1,
                    pictureResolver: resolver,
                }),
            );
            const image = await render(tree, {
                format: 'png-image',
                scale: 1,
                pictureResolver: resolver,
            });
            try {
                expect(image.complete).toBe(true);
                expect(image.naturalWidth).toBeGreaterThan(0);
            } finally {
                image.removeAttribute('src');
            }
        }
    });

    it('propagates native fetch/decode failures and releases temporary URLs on success and failure', async () => {
        const revoke = vi.spyOn(URL, 'revokeObjectURL');
        try {
            await loadPicture(source('image/png'));
            await expect(
                loadPicture('data:image/png;base64,YmFk'),
            ).rejects.toThrow(/picture/i);
            expect(revoke).toHaveBeenCalledTimes(2);
            await expect(
                loadPicture('data:image/gif;base64,YmFk'),
            ).rejects.toThrow(/PNG|JPEG/);
            await expect(
                loadPicture('http://127.0.0.1:1/unavailable'),
            ).rejects.toThrow();
        } finally {
            revoke.mockRestore();
        }
    });
});
