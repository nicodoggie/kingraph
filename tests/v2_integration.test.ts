import { expect, it, vi } from 'vitest';
import { render } from '../src/index.js';

it('uses current intrinsic dimensions when a linked image URL is rendered again', async () => {
    const href = 'https://example.invalid/size-change.png';
    const tree = {
        schemaVersion: 2 as const,
        pictures: { portrait: { url: href } },
        people: { alex: { name: 'Alex', picture: 'portrait' } },
    };
    const boxes: number[][] = [];
    for (const [width, height] of [
        [96, 96],
        [32, 16],
    ]) {
        const pictureLoader = vi.fn(() => ({ href, width, height }));
        const svg = await render(tree, { pictureMode: 'link', pictureLoader });
        expect(pictureLoader).toHaveBeenCalledOnce();
        const image = svg.match(/<image\b[^>]+>/)![0];
        boxes.push(
            ['width', 'height'].map((name) =>
                Number.parseFloat(
                    image.match(new RegExp(`${name}="([^"]+)"`))![1],
                ),
            ),
        );
    }
    expect(boxes[1]).not.toEqual(boxes[0]);
    expect(boxes[1][0] / boxes[1][1]).toBe(2);
});
