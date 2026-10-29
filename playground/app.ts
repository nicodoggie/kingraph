import {
    render,
    parseFamilyYaml,
    defaultAgeAdapter,
    asOf,
    svgToPng,
    embedSvgPictures,
    type GraphRenderOptions,
} from '@nicodoggie/kingraph/browser';
import { defineKingraphViewer } from '@nicodoggie/kingraph/viewer';
import '@nicodoggie/kingraph/viewer.css';
import './style.css';
import {
    examples,
    resolveExamplePicture,
    resolveExampleAsset,
} from './examples.js';

function download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Keep the URL alive while the browser starts consuming the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Mount the local authoring workbench, shared by the page and browser fixture. */
export function mountPlayground(root: HTMLElement): void {
    root.innerHTML = `
        <header>
            <h1>Kingraph playground</h1>
            <p>Write a family tree, then render it to explore.</p>
            <p class="notice">Trusted local authoring only. Family data and rendered SVG are not sanitized. No adapter JavaScript is accepted here.</p>
        </header>
        <div class="workbench">
            <form aria-label="Tree authoring">
                <label for="example">Load example</label>
                <select id="example" aria-describedby="example-description">
                    ${examples.map((item, index) => `<option value="${index}">${item.label}</option>`).join('')}
                </select>
                <p id="example-description"></p>
                <label for="yaml">Family YAML</label>
                <textarea id="yaml" spellcheck="false" wrap="off" aria-describedby="render-help"></textarea>
                <p id="render-help">Edits and example selection take effect when you press Render.</p>
                <div class="options">
                    <label><input id="ages" type="checkbox"> Show conventional ages</label>
                    <label for="reference">As of (optional UTC date)</label>
                    <input id="reference" type="date" value="2026-10-27">
                </div>
                <p>Exact ages need full dates; year-only examples do not imply exact ages. The reference never follows today's date.</p>
                <button type="submit">Render</button>
            </form>
            <section aria-label="Rendered tree">
                <div class="presentation-choice">
                    <label for="presentation">Viewer presentation</label>
                    <select id="presentation">
                        <option value="standard">Standard</option>
                        <option value="embedded">Embedded</option>
                    </select>
                </div>
                <div class="downloads" aria-label="Download last successful render">
                    <button id="download-svg" type="button" disabled>Download SVG</button>
                    <button id="download-png" type="button" disabled>Download PNG</button>
                </div>
                <p role="status" aria-live="polite">Preparing preview…</p>
                <div id="preview" aria-busy="false"></div>
                <p>Preview and downloads use the exact last successful SVG, including its age options and bundled portraits.</p>
            </section>
        </div>
        <aside class="example-notes" aria-label="Local example details">
            <p id="example-person" tabindex="-1"><strong>Alex · person detail.</strong> The linked person carries a full name, birth date, record-added date and comment. Hover the node to inspect its tooltip.</p>
            <p id="example-house" tabindex="-1"><strong>Harbor archive · house detail.</strong> The linked house label and frame lead to these details. These local notes demonstrate links without leaving the playground.</p>
        </aside>`;
    const form = root.querySelector('form')!;
    const editor = root.querySelector<HTMLTextAreaElement>('#yaml')!;
    const example = root.querySelector<HTMLSelectElement>('#example')!;
    const agesControl = root.querySelector<HTMLInputElement>('#ages')!;
    const reference = root.querySelector<HTMLInputElement>('#reference')!;
    const renderButton = root.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
    )!;
    const svgButton = root.querySelector<HTMLButtonElement>('#download-svg')!;
    const pngButton = root.querySelector<HTMLButtonElement>('#download-png')!;
    const status = root.querySelector<HTMLElement>('[role="status"]')!;
    const preview = root.querySelector<HTMLElement>('#preview')!;
    const presentation =
        root.querySelector<HTMLSelectElement>('#presentation')!;
    presentation.addEventListener('change', () => {
        preview
            .querySelector('kingraph-viewer')
            ?.setAttribute('presentation', presentation.value);
    });
    let last: { svg: string; portable?: Promise<string> } | undefined;
    function portable(snapshot: NonNullable<typeof last>): Promise<string> {
        const pending = (snapshot.portable ??= embedSvgPictures(snapshot.svg));
        return pending.catch((error) => {
            if (snapshot.portable === pending) snapshot.portable = undefined;
            throw error;
        });
    }
    let busy = false;
    const description = root.querySelector<HTMLElement>(
        '#example-description',
    )!;
    editor.value = examples[0].yaml;
    description.textContent = examples[0].description;
    example.addEventListener('change', () => {
        const selected = examples[Number(example.value)];
        editor.value = selected.yaml;
        description.textContent = selected.description;
    });

    async function update(): Promise<void> {
        if (busy) return;
        busy = true;
        renderButton.disabled = true;
        preview.setAttribute('aria-busy', 'true');
        status.textContent = 'Rendering…';
        try {
            const data = parseFamilyYaml(editor.value, 'playground.yaml');
            const options: GraphRenderOptions = {
                pictureResolver: resolveExamplePicture,
                pictureLoader: resolveExampleAsset,
                ...(reference.value ? asOf(reference.value) : {}),
                ...(agesControl.checked
                    ? { ageAdapter: defaultAgeAdapter }
                    : {}),
            };
            const svg = await render(data, options);
            await defineKingraphViewer();
            const viewer = document.createElement('kingraph-viewer');
            viewer.setAttribute('aria-label', 'Family tree preview');
            viewer.setAttribute('presentation', presentation.value);
            viewer.setAttribute('modal', '');
            viewer.setAttribute('fullscreen', '');
            viewer.innerHTML = svg;
            preview.replaceChildren(viewer);
            last = { svg };
            svgButton.disabled = false;
            pngButton.disabled = false;
            status.textContent =
                'Rendered successfully. Preview and downloads are ready.';
        } catch (error) {
            const detail =
                error instanceof Error && error.cause instanceof Error
                    ? ` ${error.cause.message}`
                    : '';
            status.textContent = `Render failed: ${error instanceof Error ? error.message : String(error)}${detail}`;
        } finally {
            busy = false;
            renderButton.disabled = false;
            preview.setAttribute('aria-busy', 'false');
        }
    }
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        void update();
    });
    svgButton.addEventListener('click', async () => {
        if (!last || svgButton.disabled) return;
        const snapshot = last;
        svgButton.disabled = true;
        try {
            download(
                new Blob([await portable(snapshot)], { type: 'image/svg+xml' }),
                'family.svg',
            );
        } catch (error) {
            status.textContent = `SVG download failed: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            svgButton.disabled = false;
        }
    });
    pngButton.addEventListener('click', async () => {
        if (!last || pngButton.disabled) return;
        const snapshot = last;
        pngButton.disabled = true;
        try {
            const bytes = await svgToPng(await portable(snapshot));
            download(
                new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
                'family.png',
            );
        } catch (error) {
            status.textContent = `PNG download failed: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            pngButton.disabled = false;
        }
    });
    void update();
}
