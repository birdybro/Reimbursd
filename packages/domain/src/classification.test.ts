// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  ClassificationValidationError,
  createCategory,
  createTag,
  normalizeClassificationName,
  validateCategory,
} from './classification.js';

const timestamp = '2026-07-17T14:00:00-06:00';

describe('category and tag domain', () => {
  it('creates normalized, versioned local categories and tags', () => {
    expect(
      createCategory({
        createdAt: timestamp,
        id: '11111111-1111-4111-8111-111111111111',
        name: '  Client   Meals  ',
      }),
    ).toEqual({
      createdAt: timestamp,
      deletedAt: null,
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Client Meals',
      normalizedName: 'client meals',
      updatedAt: timestamp,
      version: 1,
    });
    expect(
      createTag({
        createdAt: timestamp,
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Reimbursable',
      }),
    ).toMatchObject({ name: 'Reimbursable', normalizedName: 'reimbursable' });
  });

  it('normalizes names deterministically for uniqueness', () => {
    expect(normalizeClassificationName('  CLIENT\t Meals ')).toBe('client meals');
  });

  it('rejects malformed identifiers, names, chronology, and versions', () => {
    const category = createCategory({
      createdAt: timestamp,
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Travel',
    });
    const issues = validateCategory({
      ...category,
      deletedAt: '2026-07-17T13:00:00-06:00',
      id: 'not-a-uuid',
      name: ' Travel\n',
      normalizedName: 'wrong',
      updatedAt: '2026-07-17T13:30:00-06:00',
      version: 0,
    });

    expect(issues.map(({ field }) => field)).toEqual(
      expect.arrayContaining(['id', 'name', 'normalizedName', 'updatedAt', 'deletedAt', 'version']),
    );
  });

  it('throws instead of creating an empty classification', () => {
    expect(() =>
      createTag({
        createdAt: timestamp,
        id: '22222222-2222-4222-8222-222222222222',
        name: '   ',
      }),
    ).toThrowError(ClassificationValidationError);
  });
});
