import { describe, expect, it } from 'vitest';
import applyStyle from './apply_style.js';

describe('applyStyle legacy assertions', () => {
    const data = {
        styles: {
            hello: { color: 'gold', dir: 'none' },
            world: { style: 'filled', color: 'blue' },
        },
    };
    it('applies single classes', () => {
        expect(applyStyle(data, ['hello'])).toEqual([
            'color="gold"',
            'dir="none"',
        ]);
        expect(applyStyle(data, ['world'])).toEqual([
            'style="filled"',
            'color="blue"',
        ]);
    });
    it('uses stylesheet order regardless of class order', () => {
        expect(applyStyle(data, ['hello', 'world'])).toEqual([
            'color="blue"',
            'dir="none"',
            'style="filled"',
        ]);
        expect(applyStyle(data, ['world', 'hello'])).toEqual([
            'color="blue"',
            'dir="none"',
            'style="filled"',
        ]);
    });
    it('applies before and after overrides', () => {
        expect(
            applyStyle(data, ['hello'], { before: { color: 'red' } }),
        ).toEqual(['color="gold"', 'dir="none"']);
        expect(
            applyStyle(data, ['hello'], { after: { color: 'red' } }),
        ).toEqual(['color="red"', 'dir="none"']);
    });
});

it('preserves default styles, HTML labels, scalar attributes and null omission', () => {
    expect(
        applyStyle(
            {
                styles: {
                    ':node': {
                        width: 3,
                        label: '<<b>A</b>>',
                        hidden: null,
                        fixedsize: true,
                    },
                },
            },
            [':node'],
        ),
    ).toEqual([
        'shape="box"',
        'style="filled"',
        'fontname="Helvetica, Arial, sans-serif"',
        'fontcolor="white"',
        'width=3',
        'fillcolor="#36393f"',
        'color="#cccccc"',
        'label=<<b>A</b>>',
        'fixedsize=true',
    ]);
});
