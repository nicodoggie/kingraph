import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('imports in native Node without DOM globals and clearly rejects server registration', () => {
    const source = new URL('../src/viewer.ts', import.meta.url).href;
    const result = execFileSync(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            `
        const { defineKingraphViewer } = await import(${JSON.stringify(source)});
        try {
            await defineKingraphViewer();
            throw new Error('registration unexpectedly succeeded');
        } catch (error) {
            if (!/requires a browser/.test(error.message)) throw error;
        }
        console.log('SSR import and rejection passed');
    `,
        ],
        { encoding: 'utf8' },
    );
    expect(result.trim()).toBe('SSR import and rejection passed');
});
