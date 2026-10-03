import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['packages/**/*.ts', 'apps/server/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The platform boundary: only apps/web/src/platform may touch the network.
    // Components go through ProjectClient so the Electron wrap is a swap, not a rewrite.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/platform/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use ProjectClient (useProjectClient) instead of fetch.' },
        { name: 'XMLHttpRequest', message: 'Use ProjectClient (useProjectClient) instead.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: 'Use ProjectClient instead of fetch.' },
        { object: 'globalThis', property: 'fetch', message: 'Use ProjectClient instead of fetch.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'fs/*', 'path'], message: 'No Node APIs in the web app.' },
            {
              group: ['**/platform/httpClient'],
              message: 'Depend on ProjectClient, not httpClient.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\/api(\\/|$)/]',
          message: 'Server URLs belong in src/platform only.',
        },
        {
          selector: 'TemplateElement[value.raw=/^\\/api(\\/|$)/]',
          message: 'Server URLs belong in src/platform only.',
        },
      ],
    },
  },
);
