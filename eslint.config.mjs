// eslint.config.mjs  — ESLint flat config (ESLint v9+)
// Applies strict rules to .ts files only; JS files get a relaxed advisory-only profile
// so existing modules keep working without modification.

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // ── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      '_archive/**',
      'src/renderer/styles/output.css',
      '**/*.js.map',
    ],
  },

  // ── Base JS rules (advisory — does not block commits) ────────────────────
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...js.configs.recommended,
    rules: {
      // These are advisory — warn only for JS files during migration
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'no-console': 'off',
    },
  },

  // ── Strict TypeScript rules (enforced — blocks commits on .ts files) ─────
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'off',
    },
  },

  // ── Prettier compatibility — must be last ─────────────────────────────────
  prettier,
];
