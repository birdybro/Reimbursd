// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['packages/*/src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
    include: ['packages/**/*.test.ts'],
  },
});
