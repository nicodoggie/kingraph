#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import meow from 'meow';
import {
    defaultAgeAdapter,
    type GraphRenderOptions,
    validateGraphRenderOptions,
} from './adapters.js';
import { render } from './render.js';
import { parseFamilyYaml } from './yaml.js';

const cli = meow(
    `
    Usage
      $ kingraph [INPUT.yaml ...] [--format svg]
      $ cat family.yml | kingraph -F png > family.png

    Options
      -h, --help          Show usage information
      -v, --version       Print version information
      -F, --format        Output format: dot, svg, png (default: svg)
          --config <path> Load a trusted local JavaScript options module
          --age           Enable conventional ages unless a policy is configured
          --as-of <value> Override the reference date (no implicit current date)

    With no input files, or with -, read YAML from standard input.
`,
    {
        importMeta: import.meta,
        allowUnknownFlags: false,
        flags: {
            format: {
                type: 'string',
                shortFlag: 'F',
                choices: ['dot', 'svg', 'png'],
                default: 'svg',
            },
            help: { type: 'boolean', shortFlag: 'h' },
            version: { type: 'boolean', shortFlag: 'v' },
            config: { type: 'string' },
            age: { type: 'boolean' },
            asOf: { type: 'string' },
        },
    },
);

if (cli.flags.version) cli.showVersion();
if (cli.flags.help) cli.showHelp(0);

async function loadConfig(filename: string): Promise<GraphRenderOptions> {
    try {
        const { default: options } = await import(
            pathToFileURL(resolve(process.cwd(), filename)).href
        );
        validateGraphRenderOptions(options);
        return options;
    } catch (cause) {
        throw new Error(
            `Could not load config ${JSON.stringify(filename)}: ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
        );
    }
}

async function readStdin(): Promise<string> {
    process.stdin.setEncoding('utf8');
    let source = '';
    for await (const chunk of process.stdin) source += chunk;
    return source;
}

try {
    const format = cli.flags.format;
    // Keep validation explicit at the CLI-to-library type boundary as well.
    if (format !== 'dot' && format !== 'svg' && format !== 'png') {
        throw new RangeError(`Unsupported render format: ${format}.`);
    }
    const options = {
        ...(cli.flags.config !== undefined
            ? await loadConfig(cli.flags.config)
            : {}),
    };
    if (cli.flags.asOf !== undefined) options.asOf = cli.flags.asOf;
    if (cli.flags.age && options.ageAdapter === undefined) {
        options.ageAdapter = defaultAgeAdapter;
    }
    const inputs = cli.input.length ? cli.input : ['-'];
    let stdin: Promise<string> | undefined;
    for (const filename of inputs) {
        const source =
            filename === '-'
                ? await (stdin ??= readStdin())
                : await readFile(filename, 'utf8');
        const tree = parseFamilyYaml(
            source,
            filename === '-' ? 'stdin' : filename,
        );
        const output = await render(tree, { ...options, format });
        await new Promise<void>((resolve, reject) => {
            process.stdout.write(output, (error) =>
                error ? reject(error) : resolve(),
            );
        });
    }
} catch (error) {
    console.error(
        `kingraph: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 8;
}
