import type { PanzoomEventDetail, PanzoomObject } from '@panzoom/panzoom';

/** Raw pan offsets are pre-scale local content pixels. Scale is CSS px/local px. */
export interface ViewerView {
    x: number;
    y: number;
    scale: number;
}

export interface KingraphViewerElement extends HTMLElement {
    fit(): void;
    reset(): void;
    zoomIn(): void;
    zoomOut(): void;
    getView(): ViewerView;
    setView(view: ViewerView): void;
}

let registration: Promise<CustomElementConstructor> | undefined;

/** Explicit client-only registration; importing this module is safe on a server. */
export async function defineKingraphViewer(): Promise<CustomElementConstructor> {
    if (
        typeof window === 'undefined' ||
        typeof customElements === 'undefined'
    ) {
        throw new Error(
            'defineKingraphViewer requires a browser with custom elements',
        );
    }
    const existing = customElements.get('kingraph-viewer');
    if (existing) return existing;
    registration ??= register().catch((error: unknown) => {
        registration = undefined;
        throw error;
    });
    return registration;
}

async function register(): Promise<CustomElementConstructor> {
    const { default: Panzoom } = await import('@panzoom/panzoom');
    const existing = customElements.get('kingraph-viewer');
    if (existing) return existing;

    class Viewer extends HTMLElement implements KingraphViewerElement {
        private engine?: PanzoomObject;
        private svg?: SVGSVGElement;
        private surface?: HTMLDivElement;
        private viewport?: HTMLDivElement;
        private observer?: ResizeObserver;
        private events?: AbortController;
        private dialog?: HTMLDialogElement;
        private placeholder?: Comment;
        private controlsPlaceholder?: Comment;
        private suppliedControls?: HTMLElement;
        private focusBeforeModal?: HTMLElement;
        private originalStyle: string | null = null;
        private saved?: ViewerView;
        private savedSize?: { width: number; height: number };
        private size = { width: 0, height: 0 };
        private content = { width: 0, height: 0 };
        private restoreFrame = 0;

        static observedAttributes = ['presentation'];

        attributeChangedCallback(): void {
            this.present();
        }

        private present(): void {
            if (!this.surface || !this.viewport) return;
            const embedded = this.getAttribute('presentation') === 'embedded';
            const controls = this.surface.querySelector<HTMLElement>(
                '[data-kingraph-controls]',
            );
            const hint = this.surface.querySelector<HTMLElement>(
                '[data-kingraph-hint]',
            );
            if (controls) {
                if (embedded) this.viewport.append(controls);
                else this.surface.prepend(controls);
            }
            if (hint) (embedded ? this.viewport : this.surface).append(hint);
            const close = this.dialog?.querySelector(
                '[data-kingraph-modal-close]',
            );
            if (close) {
                if (embedded) this.viewport.append(close);
                else this.dialog!.prepend(close);
            }
        }

        private actionButton(
            action: string,
            label: string,
            icon: string,
        ): HTMLButtonElement {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.kingraphAction = action;
            button.setAttribute('aria-label', label);
            button.title = label;
            const glyph = document.createElement('span');
            glyph.dataset.kingraphIcon = '';
            glyph.setAttribute('aria-hidden', 'true');
            glyph.textContent = icon;
            const text = document.createElement('span');
            text.dataset.kingraphLabel = '';
            text.textContent = label;
            button.append(glyph, text);
            return button;
        }

        connectedCallback(): void {
            if (this.engine) return;
            cancelAnimationFrame(this.restoreFrame);
            const svg = this.querySelector<SVGSVGElement>(':scope > svg');
            if (!svg) return; // Static fallback remains useful without enhancement.
            const { width, height } = svg.viewBox.baseVal;
            if (!(
                width > 0 &&
                height > 0 &&
                Number.isFinite(width) &&
                Number.isFinite(height)
            ))
                return;
            this.svg = svg;
            this.content = { width, height };
            this.originalStyle = svg.getAttribute('style');
            this.setAttribute('role', this.getAttribute('role') ?? 'region');
            if (!this.hasAttribute('aria-label'))
                this.setAttribute('aria-label', 'Family tree');
            const surface = document.createElement('div');
            surface.dataset.kingraphSurface = '';
            const viewport = document.createElement('div');
            viewport.dataset.kingraphViewport = '';
            this.surface = surface;
            this.viewport = viewport;
            svg.before(surface);
            surface.append(viewport);
            viewport.append(svg);
            Object.assign(svg.style, {
                width: `${width}px`,
                height: `${height}px`,
                maxWidth: 'none',
                maxHeight: 'none',
                display: 'block',
                margin: '0',
                padding: '0',
                border: '0',
            });
            const supplied = this.querySelector<HTMLElement>(
                '[data-kingraph-controls]',
            );
            if (supplied) {
                this.controlsPlaceholder =
                    document.createComment('kingraph controls');
                supplied.before(this.controlsPlaceholder);
                this.suppliedControls = supplied;
                surface.prepend(supplied);
            } else {
                const controls = document.createElement('div');
                controls.dataset.kingraphControls = '';
                controls.setAttribute('role', 'group');
                controls.setAttribute('aria-label', 'Tree controls');
                // Public data-kingraph-action values; custom controls use the same buttons.
                controls.dataset.kingraphDefaultControls = '';
                const navigation = document.createElement('div');
                navigation.dataset.kingraphNavigation = '';
                const expansion = document.createElement('div');
                expansion.dataset.kingraphExpansion = '';
                controls.append(navigation, expansion);
                const actions = [
                    ['zoom-in', 'Zoom in', '+'],
                    ['zoom-out', 'Zoom out', '−'],
                    ['fit', 'Fit', '⊡'],
                    ['reset', 'Reset', '↺'],
                ];
                if (this.hasAttribute('modal'))
                    actions.push(['expand', 'Expand', '↗']);
                if (this.hasAttribute('fullscreen'))
                    actions.push(['fullscreen', 'Fullscreen', '⛶']);
                for (const [action, label, icon] of actions) {
                    const group =
                        action === 'expand' || action === 'fullscreen'
                            ? expansion
                            : navigation;
                    group.append(this.actionButton(action, label, icon));
                }
                surface.prepend(controls);
            }
            const hint = document.createElement('small');
            hint.dataset.kingraphHint = '';
            hint.textContent =
                'Ctrl/⌘ + scroll to zoom. Drag the diagram or pinch to explore.';
            surface.append(hint);
            this.present();
            this.events = new AbortController();
            const { signal } = this.events;
            this.addEventListener('click', this.onAction, { signal });
            // Panzoom owns movement. Only distinguish a drag from a native
            // link click; small pointer jitter should still count as a click.
            let gestureStart: { x: number; y: number } | undefined;
            let dragged = false;
            svg.addEventListener(
                'pointerdown',
                () => {
                    // Also reset for author-excluded descendants: Panzoom will not
                    // emit a start event for them, but their clicks remain native.
                    if (!gestureStart) dragged = false;
                },
                { capture: true, signal },
            );
            svg.addEventListener(
                'panzoomstart',
                (event) => {
                    const pointer = (event as CustomEvent<PanzoomEventDetail>)
                        .detail.originalEvent;
                    if (gestureStart)
                        dragged = true; // A second contact is a pinch.
                    else if ('clientX' in pointer) {
                        gestureStart = {
                            x: pointer.clientX,
                            y: pointer.clientY,
                        };
                        dragged = false;
                    }
                },
                { signal },
            );
            svg.addEventListener(
                'panzoomend',
                () => {
                    gestureStart = undefined;
                },
                { signal },
            );
            document.addEventListener(
                'pointermove',
                (event) => {
                    if (
                        gestureStart &&
                        Math.hypot(
                            event.clientX - gestureStart.x,
                            event.clientY - gestureStart.y,
                        ) > 4
                    )
                        dragged = true;
                },
                { signal },
            );
            svg.addEventListener(
                'click',
                (event) => {
                    // Keyboard activation has detail=0 and remains native even
                    // after a drag. The next pointer gesture resets this flag.
                    if (dragged && event.detail !== 0) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                },
                { capture: true, signal },
            );
            svg.addEventListener(
                'dragstart',
                (event) => event.preventDefault(),
                { signal },
            );
            viewport.addEventListener(
                'wheel',
                (event) => {
                    if (event.ctrlKey || event.metaKey)
                        this.engine?.zoomWithWheel(event);
                },
                { passive: false, signal },
            );
            this.size = this.measure();
            const initial = this.saved ? { ...this.saved } : this.fitted();
            if (
                this.saved &&
                this.savedSize?.width &&
                this.savedSize.height &&
                this.size.width &&
                this.size.height
            ) {
                initial.x +=
                    (this.size.width - this.savedSize.width) /
                    (2 * initial.scale);
                initial.y +=
                    (this.size.height - this.savedSize.height) /
                    (2 * initial.scale);
            }
            this.engine = Panzoom(svg, {
                canvas: true,
                exclude: [
                    surface.querySelector<HTMLElement>(
                        '[data-kingraph-controls]',
                    )!,
                ],
                handleStartEvent(event) {
                    // Keep native link focus/modifiers, but prevent the browser
                    // from selecting non-link SVG content during a pan.
                    if (!(
                        event.target instanceof Element &&
                        event.target.closest('a')
                    ))
                        event.preventDefault();
                    event.stopPropagation();
                },
                animate: false,
                startX: initial.x,
                startY: initial.y,
                startScale: initial.scale,
                ...this.bounds(initial.scale),
            });
            this.apply(initial);
            if (
                this.saved &&
                this.savedSize &&
                (!this.size.width || !this.size.height)
            ) {
                // Keep the last measurable geometry until a hidden reconnect is shown.
                this.size = { ...this.savedSize };
            }
            this.observer = new ResizeObserver(() => this.resized());
            this.observer.observe(viewport);
        }

        disconnectedCallback(): void {
            this.saved = this.engine ? this.getView() : this.saved;
            if (this.size.width && this.size.height)
                this.savedSize = { ...this.size };
            this.observer?.disconnect();
            this.events?.abort();
            this.engine?.destroy();
            this.engine = undefined;
            this.closeModal();
            this.exitOwnedFullscreen();
            const svg = this.svg;
            const style = this.originalStyle;
            if (svg && this.surface) {
                if (this.suppliedControls && this.controlsPlaceholder) {
                    this.controlsPlaceholder.replaceWith(this.suppliedControls);
                    this.suppliedControls = undefined;
                    this.controlsPlaceholder = undefined;
                }
                this.surface.before(svg);
                this.surface.remove();
                const restore = () => {
                    if (style === null) svg.removeAttribute('style');
                    else svg.setAttribute('style', style);
                };
                restore();
                // Panzoom queues transforms in rAF; restore after its pending writes too.
                this.restoreFrame = requestAnimationFrame(restore);
            }
            this.surface = undefined;
            this.viewport = undefined;
            this.size = { width: 0, height: 0 };
        }

        private bounds(scale: number): { minScale: number; maxScale: number } {
            // Normal interaction range 0.01–100, widened to include fit/saved states.
            const fit = this.fitted().scale;
            return {
                minScale: Math.min(0.01, fit, scale),
                maxScale: Math.max(100, fit, scale),
            };
        }

        private fitted(): ViewerView {
            const { width: w, height: h } = this.content;
            const { width: W, height: H } = this.size;
            if (!W || !H) return { x: 0, y: 0, scale: 1 };
            const scale = Math.min(W / w, H / h);
            return {
                x: (W - w) / (2 * scale),
                y: (H - h) / (2 * scale),
                scale,
            };
        }

        private apply(view: ViewerView): void {
            const engine = this.engine;
            if (!engine) return;
            engine.setOptions({
                ...this.bounds(view.scale),
                startX: view.x,
                startY: view.y,
            });
            engine.zoom(view.scale, { animate: false });
            engine.pan(view.x, view.y, { animate: false });
        }

        private measure(): { width: number; height: number } {
            const rect = this.viewport!.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        }

        private resized(): void {
            if (!this.viewport || !this.engine) return;
            const next = this.measure();
            if (!next.width || !next.height) return;
            const previous = this.size;
            const view = this.getView();
            this.size = next;
            if (!previous.width || !previous.height) {
                this.apply(this.saved ?? this.fitted());
            } else {
                // q at the viewport center stays fixed under o+s*(q+pan-o).
                this.apply({
                    ...view,
                    x:
                        view.x +
                        (next.width - previous.width) / (2 * view.scale),
                    y:
                        view.y +
                        (next.height - previous.height) / (2 * view.scale),
                });
            }
        }

        fit(): void {
            this.apply(this.fitted());
        }
        reset(): void {
            this.fit();
        }
        zoomIn(): void {
            this.engine?.zoomIn({ animate: false });
        }
        zoomOut(): void {
            this.engine?.zoomOut({ animate: false });
        }
        getView(): ViewerView {
            return this.engine
                ? { ...this.engine.getPan(), scale: this.engine.getScale() }
                : { ...(this.saved ?? { x: 0, y: 0, scale: 1 }) };
        }
        setView(view: ViewerView): void {
            if (
                !view ||
                typeof view !== 'object' ||
                Array.isArray(view) ||
                !Number.isFinite(view.x) ||
                !Number.isFinite(view.y) ||
                !Number.isFinite(view.scale) ||
                view.scale <= 0
            ) {
                throw new TypeError(
                    'Viewer view requires finite x/y and a positive finite scale',
                );
            }
            this.saved = { x: view.x, y: view.y, scale: view.scale };
            this.apply(this.saved);
        }

        private onAction = (event: MouseEvent): void => {
            const button =
                event.target instanceof Element
                    ? event.target.closest('button[data-kingraph-action]')
                    : null;
            if (
                !button ||
                button.closest('kingraph-viewer') !== this ||
                button.hasAttribute('disabled')
            )
                return;
            switch (button.getAttribute('data-kingraph-action')) {
                case 'zoom-in':
                    this.zoomIn();
                    break;
                case 'zoom-out':
                    this.zoomOut();
                    break;
                case 'fit':
                    this.fit();
                    break;
                case 'reset':
                    this.reset();
                    break;
                case 'expand':
                    this.openModal();
                    break;
                case 'close':
                    this.closeModal();
                    break;
                case 'fullscreen':
                    void this.toggleFullscreen();
                    break;
            }
        };

        private openModal(): void {
            if (!this.hasAttribute('modal') || !this.surface || this.dialog)
                return;
            const dialog = document.createElement('dialog');
            if (typeof dialog.showModal !== 'function') return;
            dialog.dataset.kingraphDialog = '';
            dialog.setAttribute(
                'aria-label',
                this.getAttribute('aria-label') ?? 'Family tree',
            );
            const close = this.actionButton('close', 'Close', '×');
            close.dataset.kingraphModalClose = '';
            close.classList.add('panzoom-exclude');
            dialog.append(close);
            this.focusBeforeModal =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : undefined;
            this.placeholder = document.createComment('kingraph surface');
            this.surface.before(this.placeholder);
            this.append(dialog);
            dialog.append(this.surface);
            this.dialog = dialog;
            this.present();
            dialog.addEventListener(
                'close',
                () => {
                    if (this.dialog === dialog) this.closeModal();
                },
                { signal: this.events?.signal },
            );
            try {
                dialog.showModal();
                this.resized();
            } catch {
                this.closeModal();
            }
        }

        private closeModal(): void {
            const dialog = this.dialog;
            if (!dialog) return;
            dialog.querySelector('[data-kingraph-modal-close]')?.remove();
            this.dialog = undefined;
            if (this.surface && this.placeholder)
                this.placeholder.replaceWith(this.surface);
            this.placeholder = undefined;
            if (dialog.open) dialog.close();
            dialog.remove();
            this.resized();
            if (this.focusBeforeModal?.isConnected)
                this.focusBeforeModal.focus();
            this.focusBeforeModal = undefined;
        }

        private exitOwnedFullscreen(): void {
            if (
                document.fullscreenElement === this &&
                document.exitFullscreen
            ) {
                void document.exitFullscreen().catch(() => {});
            }
        }

        private async toggleFullscreen(): Promise<void> {
            if (!this.hasAttribute('fullscreen')) return;
            if (document.fullscreenElement === this) {
                this.exitOwnedFullscreen();
                return;
            }
            if (document.fullscreenElement || !this.requestFullscreen) return;
            try {
                await this.requestFullscreen();
                if (!this.isConnected) this.exitOwnedFullscreen();
            } catch {
                /* Denial leaves the real inline/modal surface usable. */
            }
        }
    }
    customElements.define('kingraph-viewer', Viewer);
    return Viewer;
}
