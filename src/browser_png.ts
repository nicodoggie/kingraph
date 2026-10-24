function loadImage(
    source: string,
    description: string,
): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
            reject(new Error(`Could not load ${description}.`));
        image.src = source;
    });
}

async function drawSvg(
    svg: string,
    scale = globalThis.window?.devicePixelRatio || 1,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
    if (!Number.isFinite(scale) || scale <= 0) {
        throw new RangeError('PNG scale must be a positive, finite number.');
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
        const image = await loadImage(url, 'SVG image');
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(image.width * scale);
        canvas.height = Math.ceil(image.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a 2D canvas context.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { canvas, width: image.width, height: image.height };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Return encoded PNG bytes after image decoding and canvas conversion complete. */
export async function svgToPng(
    svg: string,
    scale?: number,
): Promise<Uint8Array> {
    const { canvas } = await drawSvg(svg, scale);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('Could not encode PNG from canvas.'));
        }, 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

/** Return a loaded PNG image, not an element whose conversion is still pending. */
export async function svgToPngImage(
    svg: string,
    scale?: number,
): Promise<HTMLImageElement> {
    const { canvas, width, height } = await drawSvg(svg, scale);
    const image = await loadImage(canvas.toDataURL('image/png'), 'PNG image');
    image.width = width;
    image.height = height;
    return image;
}
