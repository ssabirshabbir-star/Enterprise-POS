// eslint.config.mjs - ESLint flat config (ESLint v9+)
// Approved stack: Electron + JavaScript + HTML + CSS + Tailwind + PostgreSQL.
// TypeScript/Prisma/Vite tooling is intentionally not part of the active lint path.

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      '_archive/**',
      'prisma/**',
      'tests/**',
      '**/*.ts',
      '**/*.tsx',
      'src/renderer/styles/output.css',
      '**/*.js.map',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        __dirname: 'readonly',
        alert: 'readonly',
        clearTimeout: 'readonly',
        confirm: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        module: 'readonly',
        process: 'readonly',
        prompt: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-console': 'off',
    },
  },
  prettier,
];
