import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { colorsTuple } from '@mantine/core';
import {
  build,
  type ConfigInit,
  defineConfig,
  Logger,
  lintRunner,
  type Plugin,
  parse,
  type Resolver,
  type TokenNormalized,
  type TokenNormalizedSet,
} from '@terrazzo/parser';
import css from '@terrazzo/plugin-css';

const root = new URL('../', import.meta.url);
const source = new URL('tokens/resolver.json', root);

const darkScheme = ':root[data-mantine-color-scheme="dark"]';
// Before the color-scheme script sets the attribute, the page follows the system.
const systemScheme = ':root:not([data-mantine-color-scheme])';

/** WCAG 2.2 pairs per scheme: text at 4.5:1; control edges and the accent as focus ring or fill at 3:1, which axe does not see. */
const contrastPairs = [
  ...[
    ['ink', 'page'],
    ['ink', 'surface'],
    ['ink', 'surface-alt'],
    ['ink', 'accent-tint'],
    ['muted', 'page'],
    ['muted', 'surface'],
    ['muted', 'surface-alt'],
    ['link', 'page'],
    ['link', 'surface'],
    ['link', 'surface-alt'],
    ['link', 'accent-tint'],
    ['on-accent', 'accent'],
    ['on-accent', 'accent-hover'],
    ['warn-text', 'warn-fill'],
    ['error-text', 'page'],
    ['error-text', 'surface'],
  ].map(([fg, bg]) => ({ foreground: `color.${fg}`, background: `color.${bg}` })),
  ...[
    ['control-line', 'page'],
    ['control-line', 'surface'],
    ['accent', 'page'],
    ['accent', 'surface'],
  ].map(([fg, bg]) => ({ foreground: `color.${fg}`, background: `color.${bg}`, largeText: true })),
];

/** Terrazzo lints the default context only, so this runs the configured rules on every context. */
function lintEveryContext(): Plugin {
  let config: ConfigInit | undefined;
  return {
    name: 'lint-every-context',
    config(init) {
      config = init;
    },
    async build({ resolver, sources, context }) {
      const inputs = resolver.listPermutations?.();
      const init = config;
      if (inputs === undefined || init === undefined) throw new Error('The resolver lists no contexts to lint');
      await Promise.all(
        inputs.map((input) =>
          lintRunner({ tokens: resolver.apply(input), config: init, sources, logger: context.logger }).catch(
            (error: unknown) => {
              throw new Error(`${JSON.stringify(input)}: ${String(error)}`, { cause: error });
            },
          ),
        ),
      );
    },
  };
}

/** The hex of an sRGB color token, which must equal its `hex`: the contrast lint reads the components, the outputs the hex. */
function colorHex(token: TokenNormalized & { $type: 'color' }): string {
  const { colorSpace, components, hex } = token.$value;
  const fromComponents = `#${components
    .map((component) =>
      Math.round(Number(component) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
  if (colorSpace !== 'srgb' || hex !== fromComponents)
    throw new Error(`${token.id}: hex ${String(hex)} is not its ${colorSpace} components (${fromComponents})`);
  return hex;
}

function cssValue(token: TokenNormalized): string {
  switch (token.$type) {
    case 'color':
      return colorHex(token);
    case 'dimension':
      return `${token.$value.value}${token.$value.unit}`;
    case 'fontFamily':
      return token.$value.map((name) => (name.includes(' ') ? `"${name}"` : name)).join(', ');
    case 'fontWeight':
    case 'number':
      return String(token.$value);
    default:
      throw new Error(`${token.id}: no CSS value for type ${token.$type}`);
  }
}

/** The values of the tokens below `group`, by the rest of their id. */
function values(tokens: TokenNormalizedSet, group: string): Record<string, string> {
  return Object.fromEntries(
    Object.values(tokens)
      .filter((token) => token.id.startsWith(`${group}.`))
      .map((token) => [token.id.slice(group.length + 1), cssValue(token)]),
  );
}

const steps = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

type Colors = Record<'light' | 'dark', Record<string, string>>;

function mantineTheme(tokens: TokenNormalizedSet, colors: Colors) {
  const accent = colors.light['accent'];
  if (accent === undefined) throw new Error('No token color.accent');
  const value = (id: string) => {
    const token = tokens[id];
    if (token === undefined) throw new Error(`No token ${id}`);
    return cssValue(token);
  };
  const heading = (level: string) => ({
    fontSize: value(`font.heading.${level}.size`),
    fontWeight: value(`font.heading.${level}.weight`),
    lineHeight: value(`font.heading.${level}.line-height`),
  });
  return {
    fontFamily: value('font.family.ui'),
    fontSizes: Object.fromEntries(steps.map((step) => [step, value(`font.size.${step}`)])),
    spacing: Object.fromEntries(steps.map((step) => [step, value(`space.${step}`)])),
    radius: Object.fromEntries(steps.map((step) => [step, value('radius.default')])),
    headings: {
      fontFamily: value('font.family.ui'),
      sizes: { h1: heading('h1'), h2: heading('h2'), h3: heading('h3') },
    },
    // Mantine needs ten shades; the scheme variables below replace the ones the site's components read.
    colors: { accent: colorsTuple(accent) },
    primaryColor: 'accent',
    white: colors.light['on-accent'],
    black: colors.dark['on-accent'],
    // Mantine runs transitions under prefers-reduced-motion unless this is set.
    respectReducedMotion: true,
  };
}

/** Mantine's scheme colors by the token role that replaces each. */
const mantineRoles = {
  '--mantine-color-body': 'page',
  '--mantine-color-text': 'ink',
  '--mantine-color-bright': 'ink',
  '--mantine-color-dimmed': 'muted',
  '--mantine-color-placeholder': 'muted',
  '--mantine-color-anchor': 'link',
  '--mantine-color-default': 'page',
  '--mantine-color-default-hover': 'surface-alt',
  '--mantine-color-default-color': 'ink',
  '--mantine-color-default-border': 'control-line',
  '--mantine-color-error': 'error-text',
  '--mantine-primary-color-contrast': 'on-accent',
  '--mantine-color-accent-filled': 'accent',
  '--mantine-color-accent-filled-hover': 'accent-hover',
  '--mantine-color-accent-light': 'accent-tint',
  '--mantine-color-accent-light-color': 'link',
};

const mantineVariables = Object.fromEntries(
  Object.entries(mantineRoles).map(([name, role]) => [name, `var(--${role})`]),
);

function moduleSource(resolver: Resolver): string {
  const light = resolver.apply({ theme: 'light' });
  const colors = { light: values(light, 'color'), dark: values(resolver.apply({ theme: 'dark' }), 'color') };
  return [
    '// Generated by scripts/tokens.ts from tokens/ (tokens version 1, pnpm run tokens): do not edit.',
    '',
    "/** The Mantine theme of the tokens, for Mantine's `createTheme`. */",
    `export const theme = ${JSON.stringify(mantineTheme(light, colors), null, 2)} as const;`,
    '',
    '/** The scheme colors Mantine derives from its palette, set to the variables of `tokens.css`, for `cssVariablesResolver`. */',
    `export const cssVariables = ${JSON.stringify({ variables: {}, light: mantineVariables, dark: mantineVariables }, null, 2)} as const;`,
    '',
  ].join('\n');
}

function moduleOutput(): Plugin {
  return {
    name: 'mantine-theme-module',
    build({ resolver, outputFile }) {
      outputFile('src/theme/theme.generated.ts', moduleSource(resolver));
    },
  };
}

const cssOutput = css({
  filename: 'src/theme/tokens.css',
  legacyHex: true,
  variableName: (token) => `--${token.id.replace(/^color\./, '').replaceAll('.', '-')}`,
  permutations: [
    {
      input: { theme: 'light', density: 'fine' },
      prepare: (body) =>
        `/* Generated by scripts/tokens.ts from tokens/ (tokens version 1): do not edit. */\n:root {\n  color-scheme: light;\n  ${body}\n}`,
    },
    {
      input: { theme: 'dark', density: 'fine' },
      include: ['color.**'],
      prepare: (body) => `@media screen {\n  ${darkScheme} {\n    color-scheme: dark;\n    ${body}\n  }\n}`,
    },
    {
      input: { theme: 'dark', density: 'fine' },
      include: ['color.**'],
      prepare: (body) =>
        `@media screen and (prefers-color-scheme: dark) {\n  ${systemScheme} {\n    color-scheme: dark;\n    ${body}\n  }\n}`,
    },
    {
      input: { theme: 'light', density: 'coarse' },
      include: ['size.**', 'font.size.field'],
      prepare: (body) => `@media (pointer: coarse) {\n  :root {\n    ${body}\n  }\n}`,
    },
  ],
});

/** The generated theme module and stylesheet from the DTCG source in `tokens/`. */
export async function outputs(): Promise<{ filename: string; contents: string }[]> {
  const logger = new Logger({ level: 'warn' });
  const config = defineConfig(
    {
      tokens: ['./tokens/resolver.json'],
      outDir: './',
      lint: { rules: { 'a11y/min-contrast': ['error', { level: 'AA', pairs: contrastPairs }] } },
      plugins: [lintEveryContext(), cssOutput, moduleOutput()],
    },
    { cwd: root, logger },
  );
  const { tokens, resolver, sources } = await parse([{ src: readFileSync(source, 'utf8'), filename: source }], {
    config,
    logger,
    skipLint: true,
  });
  const { outputFiles } = await build(tokens, { resolver, sources, config, logger });
  return outputFiles.map(({ filename, contents }) => ({ filename, contents: String(contents) }));
}

if (import.meta.main) {
  for (const { filename, contents } of await outputs()) {
    const file = new URL(filename, root);
    mkdirSync(new URL('.', file), { recursive: true });
    writeFileSync(file, contents);
  }
}
