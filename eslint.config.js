import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '.tools/**',
      'node_modules/**',
      'apps/mia-chrome-extension/pdf-lib.min.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/mia-chrome-extension/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly', PDFLib: 'readonly' },
    },
  },
  {
    files: ['apps/mia-chrome-extension/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
