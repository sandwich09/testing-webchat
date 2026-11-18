// ESLint flat config. Layer rules come from docs/guidelines/code-style.md and
// docs/architecture/project-setup.md section 6.3.
import { builtinModules } from 'node:module';
import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// File groups
// ---------------------------------------------------------------------------

const TOOLING = ['prisma/**', 'stubs/**', 'scripts/**', 'e2e/**', 'test-support/**'];
const CONFIG = ['*.config.*'];
const CORE = ['src/core/**'];
const CONTRACTS = ['src/contracts/**'];
const UI = ['src/features/**', 'src/common/**', 'app/**'];
const UI_EXCEPT_API = ['app/api/**'];
// The shared HTTP client in src/common is an API file too: it holds the one `fetch` call.
const FEATURE_API = ['src/features/**/*.api.ts', 'src/common/**/*.api.ts'];
const ENV_READERS = ['src/composition/env.ts', 'instrumentation.ts', ...TOOLING, ...CONFIG];

// ---------------------------------------------------------------------------
// no-restricted-imports: options of the same rule do not merge across config objects,
// so every group lists the global restrictions again.
// ---------------------------------------------------------------------------

const nodeBuiltins = builtinModules.filter((name) => !name.startsWith('_'));

const ALL_IMPORT_PATHS = [
  {
    name: 'heic-to',
    message: "Load heic-to only with a dynamic import('heic-to/csp') (ADR 0019).",
  },
  {
    name: 'node:process',
    importNames: ['env'],
    message: 'Read env only in src/composition/env.ts.',
  },
  { name: 'process', importNames: ['env'], message: 'Read env only in src/composition/env.ts.' },
];
const ALL_IMPORT_PATTERNS = [
  {
    group: ['heic-to/*'],
    message: "Load heic-to only with a dynamic import('heic-to/csp') (ADR 0019).",
  },
];

const CORE_IMPORT_PATHS = [
  ...['next', 'react', 'react-dom', 'prisma', 'pg', 'zod', 'uuid', 'server-only'].map((name) => ({
    name,
    message: 'src/core has no framework, SDK or I/O dependencies.',
  })),
  ...nodeBuiltins.map((name) => ({
    name,
    message: 'src/core has no Node.js built-in dependencies.',
  })),
];
const CORE_IMPORT_PATTERNS = [
  {
    group: ['next/*', '@prisma/*', '@anthropic-ai/*', '@vercel/*', 'node:*'],
    message: 'src/core has no framework, SDK or I/O dependencies.',
  },
];

const CONTRACTS_IMPORT_PATTERNS = [
  {
    // Everything except zod, relative imports and the `@/` alias.
    regex: '^(?!zod(/|$)|\\.{1,2}/|@/)',
    message: 'src/contracts may import only zod from packages.',
  },
];

const UI_SERVER_ONLY_PATTERNS = [
  {
    group: ['@prisma/*', '@anthropic-ai/*', 'node:*'],
    message: 'Server-side packages are not allowed in screen code.',
  },
];
const UI_IMPORT_PATHS = [
  ...['pg', 'server-only'].map((name) => ({
    name,
    message: 'Server-side packages are not allowed in screen code.',
  })),
  {
    name: '@vercel/blob',
    message: 'Only @vercel/blob/client in src/features/**/*.api.ts is allowed in screen code.',
  },
];
const UI_BLOB_SUBPATH_PATTERN = {
  group: ['@vercel/blob/*'],
  message: 'Only @vercel/blob/client in src/features/**/*.api.ts is allowed in screen code.',
};
const FEATURE_API_BLOB_SUBPATH_PATTERN = {
  group: ['@vercel/blob/*', '!@vercel/blob/client'],
  message: 'Only @vercel/blob/client in src/features/**/*.api.ts is allowed in screen code.',
};

const restrictImports = (paths, patterns) => ['error', { paths, patterns }];

// ---------------------------------------------------------------------------
// no-restricted-syntax and no-restricted-properties (same merge caveat)
// ---------------------------------------------------------------------------

const ALL_SYNTAX = [
  {
    selector: 'Identifier[name=/^NEXT_PUBLIC_/]',
    message: 'Environment variables prefixed with NEXT_PUBLIC_ are not used.',
  },
  {
    selector: 'Literal[value=/^NEXT_PUBLIC_/]',
    message: 'Environment variables prefixed with NEXT_PUBLIC_ are not used.',
  },
];
const CORE_SYNTAX = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Use the Clock port.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Use the Clock port.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'Use the IdGenerator port.',
  },
  {
    selector: "MemberExpression[property.name='randomUUID']",
    message: 'Use the IdGenerator port.',
  },
];

const HTML_PROPERTIES = [
  { property: 'innerHTML', message: 'Do not inject HTML.' },
  { property: 'outerHTML', message: 'Do not inject HTML.' },
];
const ENV_PROPERTY = {
  object: 'process',
  property: 'env',
  message: 'Read env only in src/composition/env.ts.',
};
const WINDOW_FETCH_PROPERTY = {
  object: 'window',
  property: 'fetch',
  message: 'Call the API through the feature *.api.ts file.',
};

// ---------------------------------------------------------------------------
// eslint-plugin-boundaries 7.4.4: `element-types` and `entry-point` are deprecated in
// favour of `boundaries/dependencies`, so the allow table and the index.ts entry rule
// are both expressed as dependency policies. Element patterns are folders anchored at the
// repo root (`partialMatch: false`), so imports inside one element (one layer, one adapter,
// one feature) are internal and not checked. Single files (`proxy.ts`, `instrumentation.ts`,
// `e2e/helpers/line-webhook.ts`) cannot be elements in 7.x, so they are file categories.
// ---------------------------------------------------------------------------

const ADAPTER_NAMES = '{line,claude,prisma,blob,local-storage,system}';

const boundaryElements = [
  { type: 'domain', pattern: 'src/core/domain', partialMatch: false },
  { type: 'ports', pattern: 'src/core/ports', partialMatch: false },
  { type: 'use-cases', pattern: 'src/core/use-cases', partialMatch: false },
  {
    type: 'adapter',
    pattern: `src/adapters/${ADAPTER_NAMES}`,
    partialMatch: false,
    capture: ['adapterName'],
  },
  { type: 'fakes', pattern: 'src/adapters/fakes', partialMatch: false },
  { type: 'contracts', pattern: 'src/contracts', partialMatch: false },
  { type: 'composition', pattern: 'src/composition', partialMatch: false },
  { type: 'feature', pattern: 'src/features/*', partialMatch: false, capture: ['featureName'] },
  { type: 'common', pattern: 'src/common', partialMatch: false },
  { type: 'app-api', pattern: 'app/api', partialMatch: false },
  { type: 'app-page', pattern: 'app', partialMatch: false },
  { type: 'fixtures', pattern: 'e2e/fixtures', partialMatch: false },
  { type: 'test-support', pattern: 'test-support', partialMatch: false },
  { type: 'tooling', pattern: '{prisma,stubs,scripts,e2e}', partialMatch: false },
];

/** Target reached through the layer's `index.ts` only. */
const viaIndex = (type, element = {}) => ({
  to: { element: { type, fileInternalPath: 'index.ts', ...element } },
});
/** Target reachable through any file (test-support and fixtures have no single entry). */
const anyFile = (type, element = {}) => ({ to: { element: { type, ...element } } });
const toFixtures = { to: { file: { categories: 'fixtures' } } };
const from = (type) => ({ element: { type } });

const boundaryFiles = [
  { pattern: '**/*.spec.ts', category: 'spec' },
  { pattern: '{proxy,instrumentation}.ts', category: 'edge' },
  { pattern: 'e2e/fixtures/**', category: 'fixtures' },
  { pattern: 'e2e/helpers/line-webhook.ts', category: 'fixtures' },
];

const LAYER_POLICIES = [
  { from: from('ports'), allow: [viaIndex('domain')] },
  { from: from('use-cases'), allow: [viaIndex('domain'), viaIndex('ports')] },
  {
    from: from('adapter'),
    allow: [
      viaIndex('domain'),
      viaIndex('ports'),
      // A different adapter is never allowed; the same adapter folder is internal.
    ],
  },
  { from: from('fakes'), allow: [viaIndex('domain'), viaIndex('ports')] },
  { from: from('contracts'), allow: [viaIndex('domain')] },
  {
    from: from('composition'),
    allow: [
      viaIndex('domain'),
      viaIndex('ports'),
      viaIndex('use-cases'),
      viaIndex('adapter'),
      viaIndex('contracts'),
    ],
  },
  // common and feature folders have no barrel: a shared index.ts would be edited by every screen
  // and would mix client and server modules. Their files are imported directly.
  { from: from('feature'), allow: [viaIndex('contracts'), anyFile('common')] },
  { from: from('common'), allow: [viaIndex('contracts')] },
  { from: from('app-api'), allow: [viaIndex('composition'), viaIndex('contracts')] },
  { from: from('app-page'), allow: [anyFile('feature'), anyFile('common')] },
  { from: { file: { categories: 'edge' } }, allow: [viaIndex('composition')] },
  {
    from: { element: { type: ['tooling', 'test-support'] } },
    allow: [
      viaIndex('domain'),
      viaIndex('ports'),
      viaIndex('adapter'),
      viaIndex('fakes'),
      viaIndex('contracts'),
      viaIndex('composition'),
      toFixtures,
      anyFile('common', { fileInternalPath: 'test-ids.ts' }),
      anyFile('tooling'),
      anyFile('test-support'),
    ],
  },
  // *.spec.ts keeps its layer's rights and may also use fakes, test-support and fixtures.
  {
    from: { file: { categories: 'spec' } },
    allow: [viaIndex('fakes'), anyFile('test-support'), toFixtures],
  },
  // Fixtures are shared by every test layer, so they depend on domain and other fixtures
  // only. Listed last so it overrides the tooling rights of e2e/helpers/line-webhook.ts.
  {
    from: { file: { categories: 'fixtures' } },
    disallow: { to: { element: { type: '*' } } },
  },
  {
    from: { file: { categories: 'fixtures' } },
    allow: [viaIndex('domain'), toFixtures],
  },
];

// ---------------------------------------------------------------------------

export default defineConfig(
  // 1. Ignores
  {
    ignores: [
      '.next/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      'src/adapters/prisma/generated/',
      'prisma/migrations/',
      'next-env.d.ts',
    ],
  },

  // 2. ESLint recommended
  js.configs.recommended,

  // 3. typescript-eslint strict, type-checked
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // 4. Next.js (React, React Hooks, jsx-a11y, Core Web Vitals)
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-config-next sets its Babel parser for every file; TypeScript files keep the
    // typed parser so the type-checked rules above work.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // 5. Hexagonal boundaries
  {
    plugins: { boundaries },
    settings: {
      'boundaries/include': [
        'app/**',
        'src/**',
        'prisma/**',
        'stubs/**',
        'scripts/**',
        'e2e/**',
        'test-support/**',
        'proxy.ts',
        'instrumentation.ts',
      ],
      'boundaries/elements': boundaryElements,
      'boundaries/files': boundaryFiles,
      'boundaries/legacy-templates': false,
    },
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': ['error', { default: 'disallow', policies: LAYER_POLICIES }],
    },
  },

  // 6. Project rules (docs/architecture/project-setup.md section 6.3, "กฎเฉพาะ")
  {
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
      'react/no-danger': 'error',
      'no-restricted-imports': restrictImports(ALL_IMPORT_PATHS, ALL_IMPORT_PATTERNS),
      'no-restricted-syntax': ['error', ...ALL_SYNTAX],
      'no-restricted-properties': ['error', ...HTML_PROPERTIES, ENV_PROPERTY],
    },
  },
  {
    files: [...TOOLING, ...CONFIG],
    rules: { 'no-console': 'off' },
  },
  {
    files: ENV_READERS,
    rules: { 'no-restricted-properties': ['error', ...HTML_PROPERTIES] },
  },
  {
    files: CORE,
    rules: {
      'no-restricted-imports': restrictImports(
        [...ALL_IMPORT_PATHS, ...CORE_IMPORT_PATHS],
        [...ALL_IMPORT_PATTERNS, ...CORE_IMPORT_PATTERNS],
      ),
      'no-restricted-syntax': ['error', ...ALL_SYNTAX, ...CORE_SYNTAX],
    },
  },
  {
    files: CONTRACTS,
    // Specs need vitest; the package restriction is for shipped contract code.
    ignores: ['src/contracts/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': restrictImports(ALL_IMPORT_PATHS, [
        ...ALL_IMPORT_PATTERNS,
        ...CONTRACTS_IMPORT_PATTERNS,
      ]),
    },
  },
  {
    files: UI,
    ignores: UI_EXCEPT_API,
    rules: {
      'no-restricted-imports': restrictImports(
        [...ALL_IMPORT_PATHS, ...UI_IMPORT_PATHS],
        [...ALL_IMPORT_PATTERNS, ...UI_SERVER_ONLY_PATTERNS, UI_BLOB_SUBPATH_PATTERN],
      ),
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Call the API through the feature *.api.ts file.' },
      ],
      'no-restricted-properties': [
        'error',
        ...HTML_PROPERTIES,
        ENV_PROPERTY,
        WINDOW_FETCH_PROPERTY,
      ],
    },
  },
  {
    files: FEATURE_API,
    rules: {
      'no-restricted-imports': restrictImports(
        [...ALL_IMPORT_PATHS, ...UI_IMPORT_PATHS],
        [...ALL_IMPORT_PATTERNS, ...UI_SERVER_ONLY_PATTERNS, FEATURE_API_BLOB_SUBPATH_PATTERN],
      ),
      'no-restricted-globals': 'off',
      'no-restricted-properties': ['error', ...HTML_PROPERTIES, ENV_PROPERTY],
    },
  },

  // JavaScript config files are not part of the TypeScript project, so the type-checked
  // rules (including the project rules above) are switched off for them last.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
