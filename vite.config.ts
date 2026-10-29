import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export const playgroundAliases = [
    {
        find: /^@nicodoggie\/kingraph\/browser$/,
        replacement: fileURLToPath(
            new URL('./src/browser.ts', import.meta.url),
        ),
    },
    {
        find: /^@nicodoggie\/kingraph\/viewer$/,
        replacement: fileURLToPath(new URL('./src/viewer.ts', import.meta.url)),
    },
    {
        find: /^@nicodoggie\/kingraph\/viewer\.css$/,
        replacement: fileURLToPath(
            new URL('./src/viewer.css', import.meta.url),
        ),
    },
];

export default defineConfig({
    root: fileURLToPath(new URL('./playground', import.meta.url)),
    resolve: { alias: playgroundAliases },
});
