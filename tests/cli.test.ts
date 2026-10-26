import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const cli = new URL('../dist/cli.js', import.meta.url);
const tempRoot = tmpdir();
const family = 'people:\n  A:\n    name: Ada\n    born: "2000-06-15"\n';
let scratch: string;
const { version } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
function run(args: string[], input?: string) {
    return spawnSync(process.execPath, [cli.pathname, ...args], {
        cwd: root,
        input,
        timeout: 15_000,
        env: { ...process.env, TMPDIR: tempRoot },
    });
}

describe('built CLI', () => {
    beforeAll(() => {
        scratch = mkdtempSync(join(tempRoot, 'kingraph-cli-'));
        writeFileSync(join(scratch, 'package.json'), '{"type":"module"}');
        writeFileSync(
            join(scratch, 'helper.js'),
            'export const policy = ({ asOf }) => `Custom age at ${asOf}`;',
        );
        writeFileSync(
            join(scratch, 'config.js'),
            `import { policy } from './helper.js';
export default { ageAdapter: policy, asOf: 'configured reference', format: 'png' };`,
        );
    });
    afterAll(() => {
        if (scratch) rmSync(scratch, { recursive: true, force: true });
    });
    it.each(['--help', '-h', '--version', '-v'])(
        'exposes %s without reading input',
        (flag) => {
            const result = run([flag]);
            expect(result.status, result.stderr.toString()).toBe(0);
            if (flag.includes('help') || flag === '-h') {
                expect(result.stdout.toString()).toContain('--format');
                for (const option of ['--config', '--age', '--as-of']) {
                    expect(result.stdout.toString()).toContain(option);
                }
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
    it('keeps help and version ahead of config loading', () => {
        for (const flag of ['--help', '--version']) {
            const result = run([flag, '--config', 'missing-config.mjs']);
            expect(result.status, result.stderr.toString()).toBe(0);
        }
    });
    it('opts into conventional ages with an explicit reference', () => {
        const result = run(
            ['-F', 'dot', '--age', '--as-of', '2024-06-14'],
            family,
        );
        expect(result.status, result.stderr.toString()).toBe(0);
        expect(result.stdout.toString()).toContain('Age: 23');
    });
    it.each([[], ['--age'], ['--as-of', '2024-06-14']])(
        'does not infer a living age with %j',
        (...args) => {
            const result = run(['-F', 'dot', ...args], family);
            expect(result.status, result.stderr.toString()).toBe(0);
            expect(result.stdout.toString()).not.toContain('Age:');
        },
    );
    it.each([
        [[], 'configured reference'],
        [['--as-of', '14 Frostwane 843'], '14 Frostwane 843'],
        [['--age', '--as-of=14 Frostwane 843'], '14 Frostwane 843'],
    ])('preserves custom config policy with %j', (args, reference) => {
        const config = relative(root.pathname, join(scratch, 'config.js'));
        const result = run(['--config', config, '-F', 'dot', ...args], family);
        expect(result.status, result.stderr.toString()).toBe(0);
        expect(result.stdout.toString()).toContain('digraph G');
        expect(result.stdout.toString()).toContain(
            `Custom age at ${reference}`,
        );
        expect(result.stdout.toString()).not.toContain('Age:');
    });
    it('loads one config before rendering multiple inputs', () => {
        const config = join(scratch, 'once.mjs');
        writeFileSync(
            config,
            `let calls = 0; export default { ageAdapter: () => 'Call ' + ++calls };`,
        );
        const result = run(['-', '-', '-F', 'dot', '--config', config], family);
        expect(result.status, result.stderr.toString()).toBe(0);
        expect(result.stdout.toString()).toContain('Call 1');
        expect(result.stdout.toString()).toContain('Call 2');
    });
    it.each([
        ['missing.mjs', undefined, /Cannot find module/],
        [
            'evaluation.mjs',
            'throw new Error("config evaluation failed");',
            /config evaluation failed/,
        ],
        [
            'bad-default.mjs',
            'export default () => ({});',
            /options must be an object/i,
        ],
        [
            'malformed.mjs',
            'export default { ageAdapter: 42 };',
            /ageAdapter must be a function/,
        ],
    ])('rejects config %s before reading inputs', (filename, source, cause) => {
        const config = join(scratch, filename);
        if (source !== undefined) writeFileSync(config, source);
        const result = run(['missing-family-file.yml', '--config', config]);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toHaveLength(0);
        expect(result.stderr.toString()).toContain(config);
        expect(result.stderr.toString()).toMatch(cause);
        expect(result.stderr.toString()).not.toContain(
            'missing-family-file.yml',
        );
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
