import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-ssr/**',
      '.test-dist/**',
      'node_modules/**',
      'public/sw.js',
      'tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: '18.2' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React 17+ automatic JSX runtime — no need to import React in scope.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Cosmetic: escaping quotes/apostrophes in JSX display text adds noise
      // without changing rendered output.
      'react/no-unescaped-entities': 'off',
      // Type-safety rules are surfaced as warnings while `any` usage is being
      // driven out across the service layer (tracked in the cleanup plan).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Real correctness rules stay as errors.
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-fallthrough': 'error',
    },
  },
  {
    // Node-based test runner and config files.
    files: ['tests/**/*.ts', '*.config.{js,ts}', 'vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  }
);
