/// <reference types="vite/client" />
import { afterEach, expect, it } from 'vitest';
import { cdp, userEvent } from 'vitest/browser';
import {
    defineKingraphViewer,
    type KingraphViewerElement,
} from '../../src/viewer.js';
import '../../src/viewer.css';
import { parseFamilyYaml, render } from '../../src/browser.js';

const paint = async () => {
    await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
    );
};
const cleanups: (() => void)[] = [];
afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

async function fixture(attributes = '') {
    const [ctor, repeated] = await Promise.all([
        defineKingraphViewer(),
        defineKingraphViewer(),
    ]);
    expect(ctor).toBe(repeated);
    const host = document.createElement(
        'kingraph-viewer',
    ) as KingraphViewerElement;
    host.style.cssText =
        'position:fixed;left:30px;top:30px;width:600px;--kingraph-viewer-height:400px';
    for (const attribute of attributes.split(' ').filter(Boolean))
        host.setAttribute(attribute, '');
    host.innerHTML = await render(
        parseFamilyYaml(`
schemaVersion: 1
families:
  - parents: [avery]
    children: [rowan, sage]
people:
  avery:
    name: Avery Example
    links: ['#viewer-engine-native-link']
  rowan:
    name: Rowan Example
  sage:
    name: Sage Example
`),
    );
    const svg = host.querySelector('svg')!;
    const inner = svg.querySelector('g')!;
    const originalTransform = inner.getAttribute('transform');
    const originalViewBox = svg.getAttribute('viewBox');
    document.body.append(host);
    cleanups.push(() => host.remove());
    await paint();
    expect(svg.getAttribute('viewBox')).toBe(originalViewBox);
    expect(inner.getAttribute('transform')).toBe(originalTransform);
    const { width, height } = svg.viewBox.baseVal;
    const anchors = Array.from(svg.querySelectorAll('a'));
    const viewport = host.querySelector<HTMLElement>(
        '[data-kingraph-viewport]',
    )!;
    return {
        host,
        svg,
        width,
        height,
        inner,
        originalTransform,
        anchors,
        viewport,
    };
}

// CDP belongs to the existing Vitest Chromium provider. Its input coordinates
// are top-page coordinates, while our real SVG rects are in the test iframe.
async function inputPoint(x: number, y: number) {
    const result = await cdp().send('Runtime.evaluate', {
        expression: `(() => { const r = document.querySelector('iframe').getBoundingClientRect(); return {x:r.left,y:r.top}; })()`,
        returnByValue: true,
    });
    const offset = result.result.value;
    return { x: x + offset.x, y: y + offset.y };
}
async function drag(x: number, y: number, dx: number, dy: number) {
    const start = await inputPoint(x, y);
    await cdp().send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        ...start,
    });
    await cdp().send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...start,
        button: 'left',
        clickCount: 1,
    });
    await cdp().send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: start.x + dx,
        y: start.y + dy,
        button: 'left',
        buttons: 1,
    });
    await cdp().send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: start.x + dx,
        y: start.y + dy,
        button: 'left',
        clickCount: 1,
    });
    await paint();
}

it('registers once, fits real SVG geometry, preserves transforms and round-trips raw view state', async () => {
    const f = await fixture();
    const scale = f.host.getView().scale;
    const viewport = f.viewport.getBoundingClientRect();
    let rect = f.svg.getBoundingClientRect();
    expect(scale).toBeCloseTo(
        Math.min(viewport.width / f.width, viewport.height / f.height),
    );
    expect(rect.width).toBeCloseTo(f.width * scale, 3);
    expect(rect.height).toBeCloseTo(f.height * scale, 3);
    expect(getComputedStyle(f.svg).transformOrigin).toBe(
        `${f.width / 2}px ${f.height / 2}px`,
    );
    expect(rect.left + rect.width / 2).toBeCloseTo(
        viewport.left + viewport.width / 2,
        3,
    );
    expect(rect.top + rect.height / 2).toBeCloseTo(
        viewport.top + viewport.height / 2,
        3,
    );
    const before = rect;
    const pan = f.host.getView();
    f.host.setView({ ...pan, x: pan.x + 12, y: pan.y + 8 });
    await paint();
    rect = f.svg.getBoundingClientRect();
    expect(rect.left - before.left).toBeCloseTo(12 * scale, 3);
    expect(rect.top - before.top).toBeCloseTo(8 * scale, 3);
    f.host.setView({ x: 14, y: -9, scale: 0.00001 });
    expect(f.host.getView()).toEqual({ x: 14, y: -9, scale: 0.00001 });
    f.host.reset();
    await paint();
    expect(f.host.getView()).toEqual(pan);
    expect(f.inner.getAttribute('transform')).toBe(f.originalTransform);
    expect(f.originalTransform).toContain('translate');
    expect(f.host.getAttribute('aria-label')).toBe('Family tree');
    expect(f.host.getAttribute('role')).toBe('region');
    expect(f.host.querySelector('[data-kingraph-action="expand"]')).toBeNull();
    expect(
        f.host.querySelector('[data-kingraph-action="fullscreen"]'),
    ).toBeNull();
    expect(getComputedStyle(f.svg).transitionDuration).toBe('0s');
    for (const bad of [
        null,
        [],
        4,
        {},
        { x: 0, y: 0, scale: 0 },
        { x: Infinity, y: 0, scale: 1 },
        { x: 0, y: 0, scale: NaN },
    ]) {
        expect(() => f.host.setView(bad as never)).toThrow(TypeError);
    }
});

it('preserves native link clicks while dragging linked nodes, labels and background', async () => {
    const f = await fixture();
    f.host.style.width = '360px';
    await paint();
    f.host.fit();
    await paint();
    const oldUrl = location.href;
    cleanups.push(() => history.replaceState(null, '', oldUrl));
    let trustedClick = false;
    const initial = f.host.getView();
    f.anchors[0].addEventListener('click', (event) => {
        trustedClick = event.isTrusted;
    });
    await userEvent.click(f.anchors[0]);
    await expect.poll(() => location.hash).toBe('#viewer-engine-native-link');
    expect(trustedClick).toBe(true);
    expect(f.host.getView()).toEqual(initial);
    expect(document.activeElement).toBe(f.anchors[0]);
    history.replaceState(null, '', oldUrl);
    const linkedBox = f.anchors[0]
        .querySelector('polygon')!
        .getBoundingClientRect();
    const before = f.host.getView();
    await drag(linkedBox.left + 5, linkedBox.top + 5, 12, 9);
    expect(f.host.getView().x - before.x).toBeCloseTo(12 / before.scale, 3);
    expect(f.host.getView().y - before.y).toBeCloseTo(9 / before.scale, 3);
    expect(location.href).toBe(oldUrl);
    // Drag suppression must not swallow keyboard activation or the next click.
    f.anchors[0].classList.add('panzoom-exclude');
    await userEvent.click(f.anchors[0]);
    await expect.poll(() => location.hash).toBe('#viewer-engine-native-link');
    history.replaceState(null, '', oldUrl);
    f.anchors[0].classList.remove('panzoom-exclude');
    f.anchors[0].focus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => location.hash).toBe('#viewer-engine-native-link');
    history.replaceState(null, '', oldUrl);
    f.host.fit();
    await paint();
    const label = Array.from(f.svg.querySelectorAll('.node text'))
        .find((text) => text.textContent === 'Sage Example')!
        .getBoundingClientRect();
    const labelBefore = f.host.getView();
    expect(
        document
            .elementFromPoint(
                label.left + label.width / 2,
                label.top + label.height / 2,
            )
            ?.closest('.node'),
    ).toBeTruthy();
    await drag(
        label.left + label.width / 2,
        label.top + label.height / 2,
        20,
        15,
    );
    expect(f.host.getView().x - labelBefore.x).toBeCloseTo(
        20 / labelBefore.scale,
        3,
    );
    expect(f.host.getView().y - labelBefore.y).toBeCloseTo(
        15 / labelBefore.scale,
        3,
    );
    f.host.fit();
    await paint();
    const backgroundBefore = f.host.getView();
    const viewport = f.viewport.getBoundingClientRect();
    await drag(viewport.left + 10, viewport.top + 10, 60, 30);
    expect(f.host.getView().x - backgroundBefore.x).toBeCloseTo(
        60 / backgroundBefore.scale,
        3,
    );
    expect(f.host.getView().y - backgroundBefore.y).toBeCloseTo(
        30 / backgroundBefore.scale,
        3,
    );
    expect(location.href).toBe(oldUrl);
    await userEvent.click(f.anchors[0]);
    await expect.poll(() => location.hash).toBe('#viewer-engine-native-link');
});

it('gates native wheel zoom on Ctrl/Meta and leaves ordinary wheel uncanceled', async () => {
    const f = await fixture();
    await paint();
    const wheels: {
        trusted: boolean;
        prevented: boolean;
        ctrl: boolean;
        meta: boolean;
    }[] = [];
    const onWheel = (event: WheelEvent) => {
        // Observe the viewer-owned policy after its listener.
        wheels.push({
            trusted: event.isTrusted,
            prevented: event.defaultPrevented,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
        });
    };
    f.viewport.addEventListener('wheel', onWheel, { passive: false });
    cleanups.push(() => f.viewport.removeEventListener('wheel', onWheel));
    const rect = f.viewport.getBoundingClientRect();
    const point = await inputPoint(rect.left + 260, rect.top + 160);
    const initial = f.host.getView().scale;
    for (const modifiers of [0, 2, 4]) {
        const before = f.svg.getBoundingClientRect();
        const scaleBefore = f.host.getView().scale;
        const local = {
            x: (rect.left + 260 - before.left) / scaleBefore,
            y: (rect.top + 160 - before.top) / scaleBefore,
        };
        await cdp().send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            ...point,
            deltaX: 0,
            deltaY: -100,
            modifiers,
        });
        await expect
            .poll(() => wheels.length)
            .toBe(modifiers === 0 ? 1 : modifiers === 2 ? 2 : 3);
        await paint();
        if (modifiers === 0) expect(f.host.getView().scale).toBe(initial);
        else {
            const after = f.svg.getBoundingClientRect();
            expect(after.left + local.x * f.host.getView().scale).toBeCloseTo(
                rect.left + 260,
                3,
            );
            expect(after.top + local.y * f.host.getView().scale).toBeCloseTo(
                rect.top + 160,
                3,
            );
        }
    }
    expect(wheels).toEqual([
        { trusted: true, prevented: false, ctrl: false, meta: false },
        { trusted: true, prevented: true, ctrl: true, meta: false },
        { trusted: true, prevented: true, ctrl: false, meta: true },
    ]);
    expect(f.host.getView().scale).toBeGreaterThan(initial);
});

it('accepts trusted Chromium touch pan and two-contact pinch through the native pointer pipeline', async () => {
    const f = await fixture();
    await paint();
    const session = cdp();
    await session.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 2,
    });
    let trustedTouchPointers = 0;
    f.host.addEventListener(
        'pointerdown',
        (event) => {
            if (event.isTrusted && event.pointerType === 'touch')
                trustedTouchPointers++;
        },
        { capture: true },
    );
    const node = f.anchors[0].querySelector('polygon')!.getBoundingClientRect();
    const point = await inputPoint(node.left + 5, node.top + 5);
    const touch = (x: number, y: number, id: number) => ({
        x,
        y,
        id,
        radiusX: 1,
        radiusY: 1,
        force: 1,
    });
    try {
        const pan = f.host.getView();
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [touch(point.x, point.y, 0)],
        });
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [touch(point.x + 50, point.y + 30, 0)],
        });
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
        });
        await paint();
        expect(f.host.getView().x - pan.x).toBeCloseTo(
            50 / f.host.getView().scale,
            3,
        );
        expect(f.host.getView().y - pan.y).toBeCloseTo(
            30 / f.host.getView().scale,
            3,
        );
        const scale = f.host.getView().scale;
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [
                touch(point.x, point.y, 0),
                touch(point.x + 80, point.y, 1),
            ],
        });
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
                touch(point.x - 20, point.y, 0),
                touch(point.x + 100, point.y, 1),
            ],
        });
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
        });
        await paint();
        expect(f.host.getView().scale).toBeGreaterThan(scale);
        expect(trustedTouchPointers).toBe(3);
        expect(getComputedStyle(f.viewport).touchAction).toBe('none');
    } finally {
        await session.send('Emulation.setTouchEmulationEnabled', {
            enabled: false,
        });
    }
});

function centerContent(f: Awaited<ReturnType<typeof fixture>>) {
    const viewport = f.viewport.getBoundingClientRect();
    const svg = f.svg.getBoundingClientRect();
    const scale = f.host.getView().scale;
    return {
        x: (viewport.left + viewport.width / 2 - svg.left) / scale,
        y: (viewport.top + viewport.height / 2 - svg.top) / scale,
    };
}

it('preserves viewed center and absolute scale through resize, and fits only on request', async () => {
    const f = await fixture();
    f.host.setView({ x: 23, y: -17, scale: 2.3 });
    await paint();
    const center = centerContent(f);
    f.host.style.width = '480px';
    f.host.style.setProperty('--kingraph-viewer-height', '240px');
    await paint();
    await paint();
    expect(f.host.getView().scale).toBe(2.3);
    expect(centerContent(f).x).toBeCloseTo(center.x, 3);
    expect(centerContent(f).y).toBeCloseTo(center.y, 3);
    f.host.fit();
    await paint();
    expect(f.host.getView().scale).toBeCloseTo(
        Math.min(480 / f.width, 240 / f.height),
    );
});

it('moves one live surface through a native modal, preserves center, and restores focus on Escape', async () => {
    const f = await fixture('modal');
    f.host.setView({ x: 11, y: -5, scale: 1.4 });
    await paint();
    const center = centerContent(f);
    const expand = f.host.querySelector<HTMLButtonElement>(
        '[data-kingraph-action="expand"]',
    )!;
    expand.focus();
    await userEvent.keyboard('{Enter}');
    await paint();
    const dialog = f.host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.matches(':modal')).toBe(true);
    expect(dialog.querySelector('svg')).toBe(f.svg);
    expect(f.host.querySelectorAll('svg')).toHaveLength(1);
    expect(centerContent(f).x).toBeCloseTo(center.x, 3);
    expect(centerContent(f).y).toBeCloseTo(center.y, 3);
    expect(f.host.getView().scale).toBe(1.4);
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => f.host.querySelector('dialog')).toBeNull();
    await paint();
    expect(document.activeElement).toBe(expand);
    expect(centerContent(f).x).toBeCloseTo(center.x, 3);
    expect(centerContent(f).y).toBeCloseTo(center.y, 3);
});

it('tears down detached input/modal state and reconnects without duplicated controls/listeners', async () => {
    const f = await fixture('modal');
    const original = f.host.getView();
    const controls = f.host.querySelectorAll('button').length;
    await userEvent.click(
        f.host.querySelector('[data-kingraph-action="expand"]')!,
    );
    f.host.remove();
    await paint();
    expect(f.host.querySelector('dialog')).toBeNull();
    expect(f.host.querySelector('[data-kingraph-viewport]')).toBeNull();
    expect(f.svg.getAttribute('style') ?? '').toBe('');
    document.body.append(f.host);
    await paint();
    expect(f.host.querySelectorAll('button')).toHaveLength(controls);
    expect(f.host.getView().scale).toBe(original.scale);
    expect(f.host.getView().x).toBeCloseTo(original.x, 10);
    expect(f.host.getView().y).toBeCloseTo(original.y, 10);
    const scale = f.host.getView().scale;
    await userEvent.click(
        f.host.querySelector('[data-kingraph-action="zoom-in"]')!,
    );
    expect(f.host.getView().scale).toBeCloseTo(scale * Math.exp(0.3), 6);
    // Detached viewport no longer handles wheel events.
    const wheel = new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -100,
        cancelable: true,
    });
    f.viewport.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
});

it.each(['denied', 'unsupported', 'foreign'] as const)(
    'keeps operation usable when fullscreen is %s',
    async (policy) => {
        const f = await fixture('fullscreen');
        let requests = 0;
        Object.defineProperty(f.host, 'requestFullscreen', {
            configurable: true,
            value:
                policy === 'unsupported'
                    ? undefined
                    : async () => {
                          requests++;
                          throw new Error('denied');
                      },
        });
        if (policy === 'foreign') {
            Object.defineProperty(document, 'fullscreenElement', {
                configurable: true,
                value: document.body,
            });
            cleanups.push(() => {
                delete (document as unknown as Record<string, unknown>)
                    .fullscreenElement;
            });
        }
        await userEvent.click(
            f.host.querySelector('[data-kingraph-action="fullscreen"]')!,
        );
        await paint();
        expect(requests).toBe(policy === 'denied' ? 1 : 0);
        expect(document.fullscreenElement).toBe(
            policy === 'foreign' ? document.body : null,
        );
        const scale = f.host.getView().scale;
        f.host.zoomIn();
        expect(f.host.getView().scale).toBeGreaterThan(scale);
        f.host.remove();
        if (policy === 'foreign')
            expect(document.fullscreenElement).toBe(document.body);
    },
);

it('uses caller controls in the live modal surface and returns authored markup on detach', async () => {
    await defineKingraphViewer();
    const host = document.createElement(
        'kingraph-viewer',
    ) as KingraphViewerElement;
    host.setAttribute('modal', '');
    host.style.width = '400px';
    host.innerHTML =
        '<div data-kingraph-controls><button data-kingraph-action="expand"><svg viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10"/></svg>Custom expand</button><button data-kingraph-action="zoom-in">Custom zoom</button></div><svg viewBox="0 0 200 100" style="background: pink"><rect width="200" height="100"/></svg>';
    host.setAttribute('presentation', 'embedded');
    const controls = host.firstElementChild!;
    const authoredControls = controls.outerHTML;
    const svg = host.querySelector(':scope > svg')!;
    document.body.append(host);
    cleanups.push(() => host.remove());
    await paint();
    expect(host.querySelectorAll('[data-kingraph-controls]')).toHaveLength(1);
    expect(host.querySelector('[data-kingraph-viewport] > svg')).toBe(svg);
    await userEvent.click(controls.querySelector('button')!);
    expect(host.querySelector('dialog')!.contains(controls)).toBe(true);
    await userEvent.click(controls.querySelectorAll('button')[1]);
    host.remove();
    await paint();
    expect(host.firstElementChild).toBe(controls);
    expect(controls.outerHTML).toBe(authoredControls);
    expect(svg.getAttribute('style')).toBe('background: pink');
});

it('fits when initially hidden geometry first becomes measurable', async () => {
    await defineKingraphViewer();
    const host = document.createElement(
        'kingraph-viewer',
    ) as KingraphViewerElement;
    host.style.cssText =
        'display:none;width:400px;--kingraph-viewer-height:200px';
    host.innerHTML =
        '<svg viewBox="0 0 200 100"><rect width="200" height="100"/></svg>';
    document.body.append(host);
    cleanups.push(() => host.remove());
    await paint();
    host.style.display = 'block';
    await paint();
    await paint();
    expect(host.getView().scale).toBe(2);
    expect(
        host.querySelector('svg')!.getBoundingClientRect().width,
    ).toBeCloseTo(400, 3);
});

it('enters real owned fullscreen and releases it on detach', async () => {
    const f = await fixture('fullscreen');
    f.host.style.width = '400px';
    f.host.setAttribute('presentation', 'embedded');
    await paint();
    await userEvent.click(
        f.host.querySelector('[data-kingraph-action="fullscreen"]')!,
    );
    await expect.poll(() => document.fullscreenElement).toBe(f.host);
    f.host.remove();
    await expect.poll(() => document.fullscreenElement).toBeNull();
});

it('restores authored SVG even when detached before the engine first paints', async () => {
    await defineKingraphViewer();
    const host = document.createElement(
        'kingraph-viewer',
    ) as KingraphViewerElement;
    host.innerHTML =
        '<svg viewBox="0 0 200 100" style="background: pink"></svg>';
    const svg = host.querySelector('svg')!;
    document.body.append(host);
    host.remove();
    await paint();
    await paint();
    expect(svg.getAttribute('style')).toBe('background: pink');
});

it('retains the viewed center when reconnecting hidden into a different viewport size', async () => {
    const f = await fixture();
    f.host.setView({ x: 10, y: 30, scale: 1.5 });
    await paint();
    const center = centerContent(f);
    f.host.remove();
    await paint();
    f.host.style.display = 'none';
    f.host.style.width = '420px';
    document.body.append(f.host);
    await paint();
    f.host.style.display = 'block';
    await paint();
    await paint();
    const current = {
        ...f,
        viewport: f.host.querySelector<HTMLElement>(
            '[data-kingraph-viewport]',
        )!,
    };
    expect(centerContent(current).x).toBeCloseTo(center.x, 3);
    expect(centerContent(current).y).toBeCloseTo(center.y, 3);
    expect(f.host.getView().scale).toBe(1.5);
});

it('keeps embedded overlays in the frame through zoom, narrow layout and modal input', async () => {
    const f = await fixture('modal fullscreen');
    const zoom = f.host.querySelector<HTMLButtonElement>(
        '[data-kingraph-action="zoom-in"]',
    )!;
    expect(zoom.textContent).toContain('Zoom in');
    expect(zoom.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        f.viewport.getBoundingClientRect().top,
    );
    f.host.setView({ x: 13, y: -7, scale: 1.6 });
    await paint();
    const center = centerContent(f);
    f.host.setAttribute('presentation', 'embedded');
    await paint();
    expect(f.host.querySelector('svg')).toBe(f.svg);
    expect(f.host.getView().scale).toBe(1.6);
    expect(centerContent(f).x).toBeCloseTo(center.x, 3);
    expect(centerContent(f).y).toBeCloseTo(center.y, 3);
    const inside = (element: Element) => {
        const r = element.getBoundingClientRect();
        const frame = f.viewport.getBoundingClientRect();
        expect(r.left).toBeGreaterThanOrEqual(frame.left);
        expect(r.right).toBeLessThanOrEqual(frame.right);
        expect(r.top).toBeGreaterThanOrEqual(frame.top);
        expect(r.bottom).toBeLessThanOrEqual(frame.bottom);
    };
    const controls = () =>
        Array.from(f.host.querySelectorAll<HTMLButtonElement>('button'));
    controls().forEach(inside);
    inside(f.host.querySelector('[data-kingraph-hint]')!);
    expect(zoom.getAttribute('aria-label')).toBe('Zoom in');
    expect(zoom.title).toBe('Zoom in');
    const rect = zoom.getBoundingClientRect();
    const before = f.host.getView();
    await userEvent.click(zoom);
    await paint();
    expect(f.host.getView().scale).toBeCloseTo(before.scale * Math.exp(0.3), 6);
    expect(f.host.getView().x).toBeCloseTo(before.x, 6);
    expect(f.host.getView().y).toBeCloseTo(before.y, 6);
    expect(zoom.getBoundingClientRect().toJSON()).toEqual(rect.toJSON());
    await drag(rect.left + 10, rect.top + 10, 20, 15);
    expect(f.host.getView().x).toBeCloseTo(before.x, 6);
    expect(f.host.getView().y).toBeCloseTo(before.y, 6);
    const viewport = f.viewport.getBoundingClientRect();
    await drag(viewport.left + 12, viewport.bottom - 80, 20, -15);
    expect(f.host.getView().x - before.x).toBeCloseTo(
        20 / f.host.getView().scale,
        3,
    );
    expect(zoom.getBoundingClientRect().toJSON()).toEqual(rect.toJSON());
    await userEvent.click(
        f.host.querySelector('[data-kingraph-action="fit"]')!,
    );
    await paint();
    expect(f.host.getView().scale).toBeCloseTo(
        Math.min(viewport.width / f.width, viewport.height / f.height),
    );
    const oldUrl = location.href;
    cleanups.push(() => history.replaceState(null, '', oldUrl));
    const linkedView = f.host.getView();
    await userEvent.click(f.anchors[0]);
    await expect.poll(() => location.hash).toBe('#viewer-engine-native-link');
    expect(f.host.getView()).toEqual(linkedView);
    history.replaceState(null, '', oldUrl);
    f.host.style.width = '280px';
    await paint();
    controls().forEach((button) => {
        inside(button);
        expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
        expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(
            44,
        );
    });
    const expand = f.host.querySelector<HTMLButtonElement>(
        '[data-kingraph-action="expand"]',
    )!;
    await userEvent.click(expand);
    await paint();
    controls().forEach(inside);
    const close = f.host.querySelector<HTMLButtonElement>(
        '[data-kingraph-action="close"]',
    )!;
    const full = f.host
        .querySelector('[data-kingraph-action="fullscreen"]')!
        .getBoundingClientRect();
    expect(close.getBoundingClientRect().top).toBeGreaterThan(full.bottom);
    expect(f.host.querySelectorAll('svg')).toHaveLength(1);
    await userEvent.click(close);
    expect(f.host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(expand);
    await userEvent.click(expand);
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => f.host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(expand);
    f.host.setAttribute('presentation', 'standard');
    await paint();
    expect(zoom.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        f.viewport.getBoundingClientRect().top,
    );
});
