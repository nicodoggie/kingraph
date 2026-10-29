import { afterEach, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { KingraphViewerElement } from '../../src/viewer.js';
import { mountPlayground } from '../../playground/app.js';

let root: HTMLElement;
afterEach(() => {
    root?.remove();
    vi.restoreAllMocks();
});

async function fixture() {
    root = document.createElement('main');
    document.body.append(root);
    mountPlayground(root);
    await expect
        .poll(() => root.querySelector('kingraph-viewer svg'))
        .toBeTruthy();
    return {
        editor: root.querySelector<HTMLTextAreaElement>('#yaml')!,
        render: root.querySelector<HTMLButtonElement>('button[type="submit"]')!,
        status: root.querySelector<HTMLElement>('[role="status"]')!,
    };
}

it('offers feature examples with descriptions while selection waits for Render', async () => {
    const { editor } = await fixture();
    const selection = root.querySelector<HTMLSelectElement>('#example')!;
    expect(
        Array.from(selection.options, (option) => option.value).slice(0, 4),
    ).toEqual(['0', '1', '2', '3']);
    const viewer = root.querySelector('kingraph-viewer');
    await userEvent.selectOptions(selection, '4');
    expect(root.querySelector('#example-description')?.textContent).toContain(
        'What to try:',
    );
    expect(editor.value).toContain('#example-person');
    expect(root.querySelector('kingraph-viewer')).toBe(viewer);
});

it('renders gallery semantics and portable portraits, retaining the exact download snapshot after an unknown picture', async () => {
    const { editor, render, status } = await fixture();
    const selection = root.querySelector<HTMLSelectElement>('#example')!;
    async function select(value: string) {
        await userEvent.selectOptions(selection, value);
        const before = root.querySelector('svg');
        await userEvent.click(render);
        await expect.poll(() => root.querySelector('svg')).not.toBe(before);
        return root.querySelector('svg')!;
    }
    const links = await select('4');
    const anchors = Array.from(links.querySelectorAll('a'));
    for (const id of ['example-person', 'example-house']) {
        expect(
            anchors.some(
                (anchor) => anchor.getAttribute('xlink:href') === `#${id}`,
            ),
        ).toBe(true);
        expect(root.querySelector(`#${id}`)).toBeTruthy();
    }
    const tooltip = anchors.find(
        (anchor) => anchor.getAttribute('xlink:href') === '#example-person',
    )!;
    expect(tooltip.getAttribute('xlink:title')).toContain('Born 04/09/1978');
    expect(tooltip.getAttribute('xlink:title')).toContain('Added 10/01/2026');
    expect(tooltip.getAttribute('xlink:title')).toContain('harbor archive');

    const houses = await select('5');
    const clusters = Array.from(houses.querySelectorAll('g.cluster'));
    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.textContent).join(' ')).toContain(
        'Garden branch',
    );
    expect(clusters.map((cluster) => cluster.textContent).join(' ')).toContain(
        'Harbor house',
    );
    const secondary = await select('6');
    expect(
        secondary.querySelectorAll('g.edge path[stroke-dasharray]').length,
    ).toBe(2);
    expect(root.querySelector('#example-description')?.textContent).toContain(
        'do not encode adoption',
    );
    const styling = await select('7');
    expect(
        styling.querySelector('g.node polygon[fill="#164e63"]'),
    ).toBeTruthy();
    expect(
        styling.querySelector('g.node polygon[fill="#14532d"]'),
    ).toBeTruthy();
    const nodes = Array.from(styling.querySelectorAll<SVGGElement>('g.node'));
    const centerY = (id: string) => {
        const box = nodes
            .find((node) => node.querySelector('title')?.textContent === id)!
            .getBBox();
        return box.y + box.height / 2;
    };
    expect(centerY('alex')).toBeLessThan(centerY('kit'));

    const portraits = await select('8');
    const images = Array.from(portraits.querySelectorAll('image'));
    expect(images).toHaveLength(2);
    for (const image of images) {
        const source = image.getAttribute('xlink:href')!;
        expect(source).toMatch(/^https?:\/\//);
        const decoded = new Image();
        decoded.src = source;
        await decoded.decode();
        expect([decoded.naturalWidth, decoded.naturalHeight]).toEqual([96, 96]);
        expect(image.getBBox().width).toBeGreaterThan(0);
    }

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    editor.value = editor.value.replace(
        'path: ./portraits/alex.png',
        'url: https://invalid.example/private.png',
    );
    await userEvent.click(render);
    await expect
        .poll(() => status.textContent)
        .toContain('Unknown playground picture');
    expect(root.querySelector('svg')).toBe(portraits);
    expect(fetchSpy).not.toHaveBeenCalled();

    const blobs = new Map<string, Blob>();
    const downloads: Blob[] = [];
    const createUrl = URL.createObjectURL.bind(URL);
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
        const url = createUrl(blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
    ) {
        const blob = blobs.get(this.href);
        if (blob) downloads.push(blob);
    });
    // A transient export failure keeps the linked preview and permits retry.
    fetchSpy.mockRejectedValueOnce(new Error('Temporary export failure'));
    await userEvent.click(
        root.querySelector<HTMLButtonElement>('#download-svg')!,
    );
    await expect
        .poll(() => status.textContent)
        .toContain('SVG download failed:');
    expect(root.querySelector('svg')).toBe(portraits);
    expect(downloads).toHaveLength(0);
    await userEvent.click(
        root.querySelector<HTMLButtonElement>('#download-svg')!,
    );
    await expect
        .poll(() => downloads.find((blob) => blob.type === 'image/svg+xml'))
        .toBeTruthy();
    const savedSvg = await downloads
        .find((blob) => blob.type === 'image/svg+xml')!
        .text();
    const savedImages = new DOMParser()
        .parseFromString(savedSvg, 'image/svg+xml')
        .querySelectorAll('image');
    expect(savedImages).toHaveLength(2);
    for (const image of savedImages)
        expect(
            image.getAttribute('xlink:href') ?? image.getAttribute('href'),
        ).toMatch(/^data:image\/png;base64,/);
    const exportFetches = fetchSpy.mock.calls.length;
    await userEvent.click(
        root.querySelector<HTMLButtonElement>('#download-png')!,
    );
    await expect
        .poll(() => downloads.find((blob) => blob.type === 'image/png'))
        .toBeTruthy();
    // Rasterize with real browser decoding: both authored shirt colors must paint.
    const png = downloads.find((blob) => blob.type === 'image/png')!;
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const painted = (r: number, g: number, b: number) => {
        for (let i = 0; i < pixels.length; i += 4) {
            if (
                pixels[i] === r &&
                pixels[i + 1] === g &&
                pixels[i + 2] === b &&
                pixels[i + 3] === 255
            )
                return true;
        }
        return false;
    };
    expect(painted(8, 127, 140)).toBe(true);
    expect(painted(128, 68, 163)).toBe(true);
    expect(
        downloads.filter((blob) => blob.type === 'image/svg+xml'),
    ).toHaveLength(1);
    expect(fetchSpy.mock.calls.length).toBe(exportFetches);
    expect(
        fetchSpy.mock.calls.every(
            ([url]) => !String(url).includes('invalid.example'),
        ),
    ).toBe(true);
    expect(root.querySelector('svg')).toBe(portraits);
});

it('renders once, explicitly rerenders into a fresh viewer, and retains it on invalid input', async () => {
    const { editor, render, status } = await fixture();
    const first = root.querySelector('kingraph-viewer')!;
    expect(first.querySelector('svg')?.textContent).toContain('Avery');
    editor.value = editor.value.replaceAll('Avery', 'Taylor');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('kingraph-viewer')).toBe(first);
    await userEvent.click(render);
    await expect
        .poll(() => root.querySelector('kingraph-viewer'))
        .not.toBe(first);
    const second = root.querySelector(
        'kingraph-viewer',
    )! as KingraphViewerElement;
    const svg = second.querySelector('svg');
    const presentation =
        root.querySelector<HTMLSelectElement>('#presentation')!;
    expect(presentation).toBeTruthy();
    expect(presentation.value).toBe('standard');
    second.setView({ x: 12, y: -8, scale: 1.7 });
    expect(first.isConnected).toBe(false);
    expect(second.querySelector('svg')?.textContent).toContain('Taylor');
    expect(second.querySelector('[data-kingraph-action="fit"]')).toBeTruthy();
    editor.value = 'families: [';
    await userEvent.click(render);
    await expect.poll(() => status.textContent).toContain('Render failed:');
    expect(root.querySelector('kingraph-viewer')).toBe(second);
    await userEvent.selectOptions(presentation, 'embedded');
    expect(second.getAttribute('presentation')).toBe('embedded');
    expect(root.querySelector('kingraph-viewer')).toBe(second);
    expect(second.querySelector('svg')).toBe(svg);
    expect(second.getView()).toEqual({ x: 12, y: -8, scale: 1.7 });
    expect(status.textContent).toContain('Render failed:');
    editor.value = 'families: []';
    await userEvent.click(render);
    await expect
        .poll(() => root.querySelector('kingraph-viewer'))
        .not.toBe(second);
    expect(
        root.querySelector('kingraph-viewer')?.getAttribute('presentation'),
    ).toBe('embedded');
    expect(
        root.querySelector<HTMLButtonElement>('#download-svg')?.disabled,
    ).toBe(false);
    expect(
        root.querySelector<HTMLButtonElement>('#download-png')?.disabled,
    ).toBe(false);
});

it('snapshots the opt-in conventional age policy and explicit reference', async () => {
    const { render } = await fixture();
    expect(root.querySelector('svg')?.textContent).not.toContain('Age:');
    await userEvent.click(root.querySelector<HTMLInputElement>('#ages')!);
    const reference = root.querySelector<HTMLInputElement>('#reference')!;
    reference.value = '2026-10-27';
    await userEvent.click(render);
    await expect
        .poll(() => root.querySelector('svg')?.textContent)
        .toContain('Age: 46');
    reference.value = '2020-10-27';
    await userEvent.click(render);
    await expect
        .poll(() => root.querySelector('svg')?.textContent)
        .toContain('Age: 40');
    await userEvent.click(root.querySelector<HTMLInputElement>('#ages')!);
    await userEvent.click(render);
    await expect
        .poll(() => root.querySelector('svg')?.textContent)
        .not.toContain('Age:');
    const previous = root.querySelector('kingraph-viewer');
    reference.value = '';
    await userEvent.click(render);
    await expect
        .poll(() => root.querySelector('kingraph-viewer'))
        .not.toBe(previous);
});
