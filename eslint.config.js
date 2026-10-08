import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', 'plugins/modelwright/bin/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['packages/**/*.ts', 'apps/server/**/*.ts', 'apps/desktop/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/web/public/**/*.js'],
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
              group: ['**/platform/httpClient', '**/platform/ipcClient'],
              message: 'Depend on ProjectClient, not a client implementation.',
            },
          ],
          paths: [
            {
              name: '@modelwright/core',
              message:
                'The core runs in Node. Use @modelwright/core/contract or /ipc for shared types.',
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
