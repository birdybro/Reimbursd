// SPDX-License-Identifier: GPL-3.0-only
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['**/.expo/**', '**/coverage/**', '**/dist/**', '**/node_modules/**']),
  expoConfig,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['eslint.config.js', 'scripts/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
]);
