import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const cli = new URL('../dist/cli.js', import.meta.url);
const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
function run(args: string[], input?: string) {
    return spawnSync(process.execPath, [cli.pathname, ...args], {
        cwd: root,
        input,
        timeout: 15_000,
    });
}

describe('built CLI', () => {
    it.each(['--help', '-h', '--version', '-v'])(
        'exposes %s without reading input',
        (flag) => {
            const result = run([flag]);
            expect(result.status, result.stderr.toString()).toBe(0);
            if (flag.includes('help') || flag === '-h') {
                expect(result.stdout.toString()).toContain('--format');
            } else {
                expect(result.stdout.toString().trim()).toBe(version);
            }
        },
    );
    it('reads stdin with no filename and with an explicit dash', () => {
        for (const args of [
            ['-F', 'dot'],
            ['-', '--format=dot'],
        ]) {
            const result = run(args, 'families:\n  - parents: [A, B]\n');
            expect(result.status, result.stderr.toString()).toBe(0);
            expect(result.stdout.toString()).toContain('# Family [A, B] -> []');
        }
    });
    it('renders files in argument order', () => {
        const result = run([
            'tests/1_simple.yaml',
            'tests/2_name-only.yaml',
            '-F',
            'dot',
        ]);
        expect(result.status, result.stderr.toString()).toBe(0);
        expect(result.stdout.toString().match(/digraph G/g)).toHaveLength(2);
        expect(result.stdout.toString().indexOf(' ♀')).toBeLessThan(
            result.stdout.toString().lastIndexOf('digraph G'),
        );
        expect(
            result.stdout.toString().lastIndexOf('Marjorie'),
        ).toBeGreaterThan(result.stdout.toString().lastIndexOf('digraph G'));
    });
    it('writes binary PNG output', () => {
        const result = run(['tests/1_simple.yaml', '-F', 'png']);
        expect(result.status, result.stderr.toString()).toBe(0);
        expect(result.stdout.subarray(0, 8)).toEqual(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
    });
    it.each([
        [['--format', 'pdf'], undefined, /format|choices|allowed/i],
        [['--not-a-flag'], undefined, /unknown/i],
        [['missing-family-file.yml'], undefined, /missing-family-file.yml/],
        [['-F', 'dot'], 'families: [', /stdin/],
    ] as const)('rejects invalid CLI input: %j', (args, input, message) => {
        const result = run([...args], input);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toHaveLength(0);
        expect(result.stderr.toString()).toMatch(message);
    });
});
