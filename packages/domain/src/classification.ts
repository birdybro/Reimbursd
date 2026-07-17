// SPDX-License-Identifier: GPL-3.0-only
import { isUuid } from './receipt.js';

const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const unsafeNamePattern = /[\u0000-\u001f\u007f]/;

interface NamedClassification {
  readonly createdAt: string;
  readonly deletedAt: string | null;
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly updatedAt: string;
  readonly version: number;
}

export type Category = NamedClassification;

export type Tag = NamedClassification;

export interface CreateClassificationInput {
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
}

export interface ClassificationValidationIssue {
  readonly field: keyof NamedClassification;
  readonly message: string;
}

export class ClassificationValidationError extends Error {
  readonly issues: readonly ClassificationValidationIssue[];

  constructor(issues: readonly ClassificationValidationIssue[]) {
    super('Category or tag data is invalid.');
    this.name = 'ClassificationValidationError';
    this.issues = issues;
  }
}

export function createCategory(input: CreateClassificationInput): Category {
  return createClassification(input);
}

export function createTag(input: CreateClassificationInput): Tag {
  return createClassification(input);
}

export function normalizeClassificationName(value: string): string {
  return normalizeDisplayName(value).toLocaleLowerCase('en-US');
}

export function validateCategory(category: Category): readonly ClassificationValidationIssue[] {
  return validateClassification(category);
}

export function validateTag(tag: Tag): readonly ClassificationValidationIssue[] {
  return validateClassification(tag);
}

export function assertValidCategory(category: Category): void {
  assertValidClassification(category);
}

export function assertValidTag(tag: Tag): void {
  assertValidClassification(tag);
}

function createClassification(input: CreateClassificationInput): NamedClassification {
  const name = normalizeDisplayName(input.name);
  const classification: NamedClassification = {
    createdAt: input.createdAt,
    deletedAt: null,
    id: input.id,
    name,
    normalizedName: normalizeClassificationName(name),
    updatedAt: input.createdAt,
    version: 1,
  };
  assertValidClassification(classification);
  return classification;
}

function validateClassification(
  classification: NamedClassification,
): readonly ClassificationValidationIssue[] {
  const issues: ClassificationValidationIssue[] = [];

  if (!isUuid(classification.id)) {
    issues.push({ field: 'id', message: 'Identifier must be a UUID.' });
  }

  const normalizedDisplayName = normalizeDisplayName(classification.name);
  if (
    normalizedDisplayName.length === 0 ||
    normalizedDisplayName.length > 80 ||
    unsafeNamePattern.test(classification.name) ||
    classification.name !== normalizedDisplayName
  ) {
    issues.push({
      field: 'name',
      message: 'Name must contain 1 to 80 normalized characters without control characters.',
    });
  }

  if (
    classification.normalizedName !== normalizeClassificationName(classification.name) ||
    classification.normalizedName.length === 0 ||
    classification.normalizedName.length > 80 ||
    unsafeNamePattern.test(classification.normalizedName)
  ) {
    issues.push({ field: 'normalizedName', message: 'Normalized name does not match the name.' });
  }

  validateDateTime(classification.createdAt, 'createdAt', false, issues);
  validateDateTime(classification.updatedAt, 'updatedAt', false, issues);
  validateDateTime(classification.deletedAt, 'deletedAt', true, issues);

  if (
    !Number.isNaN(Date.parse(classification.createdAt)) &&
    !Number.isNaN(Date.parse(classification.updatedAt)) &&
    Date.parse(classification.updatedAt) < Date.parse(classification.createdAt)
  ) {
    issues.push({ field: 'updatedAt', message: 'Update time cannot precede creation time.' });
  }

  if (
    classification.deletedAt !== null &&
    !Number.isNaN(Date.parse(classification.updatedAt)) &&
    Date.parse(classification.deletedAt) < Date.parse(classification.updatedAt)
  ) {
    issues.push({ field: 'deletedAt', message: 'Deletion time cannot precede the last update.' });
  }

  if (!Number.isSafeInteger(classification.version) || classification.version < 1) {
    issues.push({ field: 'version', message: 'Version must be a positive safe integer.' });
  }

  return issues;
}

function assertValidClassification(classification: NamedClassification): void {
  const issues = validateClassification(classification);

  if (issues.length > 0) {
    throw new ClassificationValidationError(issues);
  }
}

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function validateDateTime(
  value: string | null,
  field: 'createdAt' | 'deletedAt' | 'updatedAt',
  nullable: boolean,
  issues: ClassificationValidationIssue[],
): void {
  if (value === null) {
    if (!nullable) {
      issues.push({ field, message: 'Timestamp is required.' });
    }
    return;
  }

  if (!offsetDateTimePattern.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({ field, message: 'Timestamp must be valid ISO 8601 with a timezone offset.' });
  }
}
