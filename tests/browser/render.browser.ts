import { describe, expect, it } from 'vitest';
import { parseFamilyYaml, render } from '../../src/browser.js';
import { svgToPng } from '../../src/browser_png.js';
import { FamilyTreeSchema } from '../../src/v1/schemas.js';

const familyYaml = `
schemaVersion: 1
families:
  - parents: [avery]
    children: [rowan]
    children2: [sage]
people:
  avery:
    name: Avery Example
    links: [https://example.org/avery]
  rowan:
    name: Rowan Example
  sage:
    name: Sage Example
`;

function family() {
    return parseFamilyYaml(familyYaml, 'browser-family.yaml');
}

// Check actual painted content without depending on fonts or exact layout.
function expectPainted(
    source: CanvasImageSource,
    width: number,
    height: number,
) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Expected a native 2D canvas context.');
        context.drawImage(source, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        const colors = new Set<string>();
        for (let i = 0; i < pixels.length && colors.size < 2; i += 4) {
            if (pixels[i + 3] > 0) {
                colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
            }
        }
        expect(colors.size).toBeGreaterThan(1);
    } finally {
        canvas.width = canvas.height = 0;
    }
}

describe('native browser rendering', () => {
    it('renders parsed v1 YAML through Graphviz WASM into inline SVG with links and secondary edges', async () => {
        expect(FamilyTreeSchema.safeParse(family()).success).toBe(true);
        const host = document.createElement('div');
        document.body.append(host);
        try {
            host.innerHTML = await render(family(), { format: 'svg' });
            const svg = host.querySelector('svg');
            expect(svg).toBeInstanceOf(SVGSVGElement);
            expect(svg!.getBoundingClientRect().width).toBeGreaterThan(0);
            const labels = Array.from(
                host.querySelectorAll('text'),
                (node) => node.textContent,
            );
            expect(labels).toEqual(
                expect.arrayContaining([
                    'Avery Example',
                    'Rowan Example',
                    'Sage Example',
                ]),
            );
            const link = host.querySelector<SVGAElement>('svg a');
            expect(link).toBeInstanceOf(SVGAElement);
            expect(link!.href.baseVal).toBe('https://example.org/avery');
            expect(link!.textContent).toContain('Avery Example');

            const edges = Array.from(host.querySelectorAll('g.edge'));
            const edgeTo = (id: string) =>
                edges.find(
                    (edge) =>
                        edge.querySelector('title')?.textContent ===
                        `siblings_0->${id}`,
                );
            const secondary = edgeTo('sage')?.querySelector('path');
            const primary = edgeTo('rowan')?.querySelector('path');
            expect(secondary).toBeInstanceOf(SVGPathElement);
            expect(secondary!.getAttribute('stroke-dasharray')).toMatch(/\d/);
            expect(primary).toBeInstanceOf(SVGPathElement);
            expect(primary!.hasAttribute('stroke-dasharray')).toBe(false);
        } finally {
            host.remove();
        }
    });

    it('returns real PNG bytes that decode to painted bitmaps at the requested scale', async () => {
        const bitmaps: ImageBitmap[] = [];
        try {
            for (const scale of [1, 2]) {
                const png = await render(family(), { format: 'png', scale });
                expect(png).toBeInstanceOf(Uint8Array);
                expect(Array.from(png.subarray(0, 8))).toEqual([
                    137, 80, 78, 71, 13, 10, 26, 10,
                ]);
                const bitmap = await createImageBitmap(
                    new Blob([new Uint8Array(png)], { type: 'image/png' }),
                );
                bitmaps.push(bitmap);
                expect(bitmap.width).toBeGreaterThan(0);
                expect(bitmap.height).toBeGreaterThan(0);
                expectPainted(bitmap, bitmap.width, bitmap.height);
            }
            expect(bitmaps[1].width).toBe(bitmaps[0].width * 2);
            expect(bitmaps[1].height).toBe(bitmaps[0].height * 2);
        } finally {
            for (const bitmap of bitmaps) bitmap.close();
        }
    });

    it('returns an already loaded PNG image with display dimensions and a scaled usable raster', async () => {
        const image = await render(family(), { format: 'png-image', scale: 2 });
        try {
            expect(image).toBeInstanceOf(HTMLImageElement);
            expect(image.complete).toBe(true);
            expect(image.src).toMatch(/^data:image\/png;base64,/);
            expect(image.width).toBeGreaterThan(0);
            expect(image.height).toBeGreaterThan(0);
            expect(image.naturalWidth).toBe(image.width * 2);
            expect(image.naturalHeight).toBe(image.height * 2);
            document.body.append(image);
            expect(image.getBoundingClientRect().width).toBe(image.width);
            expect(image.getBoundingClientRect().height).toBe(image.height);
            expectPainted(image, image.naturalWidth, image.naturalHeight);
        } finally {
            image.remove();
            image.removeAttribute('src');
        }
    });

    it('rejects invalid SVG through the real browser image decoder', async () => {
        await expect(
            svgToPng('<svg xmlns="http://www.w3.org/2000/svg"><unclosed>', 1),
        ).rejects.toThrow('Could not load SVG image.');
    });
});
