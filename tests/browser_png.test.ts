import { afterEach, describe, expect, it, vi } from 'vitest';
import { svgToPng, svgToPngImage } from '../src/browser_png.js';

function browserStubs(
    options: {
        failImage?: boolean;
        noContext?: boolean;
        noBlob?: boolean;
    } = {},
) {
    class TestImage {
        width = 20;
        height = 12;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(source: string) {
            if (source.startsWith('data:image/png')) {
                this.width = canvas.width;
                this.height = canvas.height;
            }
            queueMicrotask(() =>
                options.failImage ? this.onerror?.() : this.onload?.(),
            );
        }
    }
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => 'data:image/png;base64,AA==');
    const canvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => (options.noContext ? null : { drawImage })),
        toDataURL,
        toBlob: vi.fn((callback: (blob: Blob | null) => void) =>
            callback(
                options.noBlob
                    ? null
                    : new Blob([new Uint8Array([137, 80, 78, 71])]),
            ),
        ),
    };
    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const revoke = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-svg');
    return { canvas, drawImage, toDataURL, revoke };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('browser PNG conversion (unit stubs, not browser rendering)', () => {
    it('waits for SVG loading, draws at device scale, returns bytes and revokes its URL', async () => {
        const { canvas, drawImage, revoke } = browserStubs();
        expect(await svgToPng('<svg/>')).toEqual(
            new Uint8Array([137, 80, 78, 71]),
        );
        expect([canvas.width, canvas.height]).toEqual([40, 24]);
        expect(drawImage).toHaveBeenCalledOnce();
        expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test-svg');
    });
    it('calls toDataURL and waits for the PNG image to load', async () => {
        const { canvas, toDataURL } = browserStubs();
        const image = await svgToPngImage('<svg/>');
        expect(toDataURL).toHaveBeenCalledWith('image/png');
        expect([canvas.width, canvas.height]).toEqual([40, 24]);
        expect([image.width, image.height]).toEqual([20, 12]);
        expect(image).toBeInstanceOf(Image);
    });
    it.each([
        [{ failImage: true }, /load SVG/],
        [{ noContext: true }, /2D canvas/],
        [{ noBlob: true }, /encode PNG/],
    ])(
        'rejects conversion failures and releases its URL: %j',
        async (options, message) => {
            const { revoke } = browserStubs(options);
            await expect(svgToPng('<svg/>')).rejects.toThrow(message);
            expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test-svg');
        },
    );
    it('rejects invalid scaling before allocating a URL', async () => {
        browserStubs();
        await expect(svgToPng('<svg/>', 0)).rejects.toThrow(/scale/);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
});
