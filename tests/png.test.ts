import { describe, expect, it } from 'vitest';
import { svgToPng } from '../src/png.js';

describe('Node PNG conversion', () => {
    it('rasterizes real SVG into a PNG with the requested dimensions', async () => {
        const png = await svgToPng(
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="12"><rect width="20" height="12" fill="red"/></svg>',
        );
        expect(png.subarray(0, 8)).toEqual(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
        expect(png.readUInt32BE(16)).toBe(20);
        expect(png.readUInt32BE(20)).toBe(12);
    });
});
