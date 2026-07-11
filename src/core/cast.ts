import { Buffer } from "node:buffer";

/**
 * Error factory used by strict cast helpers.
 */
export type CastErrorFactory = (message: string) => Error;

/**
 * Default error raised by strict cast helpers.
 */
export class CastError extends Error {}

/**
 * Return a shallow copy without undefined values. Example:
 * `compactObject({ a: 1, b: undefined }) => { a: 1 }`.
 */
export function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Partial<T> = {};
  for (const [key, value] of Object.entries(input) as Array<[keyof T, T[keyof T]]>) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Return a trimmed string when the value is a non-empty string. Examples:
 * `optionalString(" x ") => "x"`, `optionalString(" ") => undefined`,
 * `optionalString(1) => undefined`.
 */
export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || undefined;
}

/**
 * Return a string exactly as provided, including empty strings and surrounding whitespace. Examples:
 * `optionalRawString(" x ") => " x "`, `optionalRawString(1) => undefined`.
 */
export function optionalRawString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Return a string or throw a caller-provided error. Examples:
 * `requiredString(" x ", "name") => "x"`, `requiredString("", "name")` throws.
 */
export function requiredString(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): string {
  const result = optionalString(value);
  if (result) {
    return result;
  }

  throw createError(`${fieldName} is required.`);
}

/**
 * Decode a strict non-empty Base64 string into bytes, or throw.
 */
export function base64Bytes(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): Uint8Array<ArrayBuffer> {
  const normalized = optionalString(value);
  if (!normalized) {
    throw createError(`${fieldName} must be valid base64`);
  }

  try {
    const bytes = Buffer.from(normalized, "base64");
    if (bytes.length === 0 || stripBase64Padding(bytes.toString("base64")) !== stripBase64Padding(normalized)) {
      throw createError(`${fieldName} must be valid base64`);
    }
    return Uint8Array.from(bytes);
  } catch {
    throw createError(`${fieldName} must be valid base64`);
  }
}

/**
 * Return a plain object record when the value can be used as JSON object data. Examples:
 * `optionalRecord({ a: 1 }) => { a: 1 }`, `optionalRecord([]) => undefined`.
 */
export function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

/**
 * Return a plain object record or throw a caller-provided error. Examples:
 * `requiredRecord({ a: 1 }, "body") => { a: 1 }`, `requiredRecord([], "body")` throws.
 */
export function requiredRecord(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): Record<string, unknown> {
  const result = optionalRecord(value);
  if (result) {
    return result;
  }

  throw createError(`${fieldName} must be an object`);
}

/**
 * Keep only non-empty string values and trim them. Example:
 * `stringRecord({ a: " x ", b: 1, c: "" }) => { a: "x" }`.
 */
export function stringRecord(input: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const text = optionalString(value);
    if (text) {
      values[key] = text;
    }
  }
  return values;
}

/**
 * Return every array item converted with `String`, or throw. Examples:
 * `stringArray([1, "x"], "ids") => ["1", "x"]`, `stringArray("x", "ids")` throws.
 */
export function stringArray(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): string[] {
  if (!Array.isArray(value)) {
    throw createError(`${fieldName} must be an array`);
  }

  return value.map((item) => String(item));
}

/**
 * Return an array only when every item is already a string, or throw.
 * Unlike `stringArray`, this helper does not coerce scalar values.
 */
export function requiredStringArray(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw createError(`${fieldName} must be an array of strings`);
  }

  return value;
}

/**
 * Return every array item as a plain object record, or throw. Examples:
 * `objectArray([{ a: 1 }], "items") => [{ a: 1 }]`, `objectArray([1], "items")` throws.
 */
export function objectArray(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw createError(`${fieldName} must be an array`);
  }

  return value.map((item) => requiredRecord(item, fieldName, createError));
}

/**
 * Return every array item as a plain object record, or an empty array when the
 * value is absent or not an array. Examples:
 * `optionalObjectArray([{ a: 1 }]) => [{ a: 1 }]`, `optionalObjectArray(null) => []`.
 */
export function optionalObjectArray(
  value: unknown,
  fieldName = "array item",
  createError: CastErrorFactory = (message) => new CastError(message),
): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => requiredRecord(item, fieldName, createError)) : [];
}

/**
 * Return a scalar value as a string when it is a string, number, or boolean.
 * Empty strings are preserved for APIs that distinguish them from omission.
 */
export function optionalScalarString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/**
 * Return an integer if the value is already an integer number. Examples:
 * `optionalInteger(1) => 1`, `optionalInteger("1") => undefined`.
 */
export function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * Return a finite number if the value is already a number. Examples:
 * `optionalNumber(1.2) => 1.2`, `optionalNumber("1") => undefined`.
 */
export function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Return an integer from a number or numeric string. Examples:
 * `integer("2", "count") => 2`, `integer("x", "count")` throws.
 */
export function integer(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN;
  if (Number.isInteger(parsed)) {
    return parsed;
  }

  throw createError(`${fieldName} must be an integer`);
}

/**
 * Return an integer from a number or numeric string when present. Examples:
 * `optionalIntegerLike("2", "count") => 2`, `optionalIntegerLike("", "count") => undefined`.
 */
export function optionalIntegerLike(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  return integer(value, fieldName, createError);
}

/**
 * Return an integer, null, or undefined when the value is not an integer. Examples:
 * `nullableInteger(null) => null`, `nullableInteger(1.2) => undefined`.
 */
export function nullableInteger(value: unknown): number | null | undefined {
  return value === null ? null : optionalInteger(value);
}

/**
 * Return a boolean if the value is already boolean. Examples:
 * `optionalBoolean(false) => false`, `optionalBoolean(1) => undefined`.
 */
export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Return a boolean or null when the value is not boolean.
 */
export function optionalBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Pick the first present boolean from a record. Examples:
 * `pickOptionalBoolean({ a: false }, "a") => false`, missing keys return undefined.
 */
export function pickOptionalBoolean(input: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = optionalBoolean(input[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/**
 * Pick the first non-empty string from a record. Examples:
 * `pickOptionalString({ a: " x " }, "a") => "x"`, empty strings are skipped.
 */
export function pickOptionalString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function stripBase64Padding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Pick the first integer-like value from a record. Examples:
 * `pickOptionalInteger({ a: "2" }, "a") => 2`.
 */
export function pickOptionalInteger(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    if (input[key] == null) {
      continue;
    }

    const value = optionalIntegerLike(input[key], key);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/**
 * Return a string, null, or undefined when the value is not a string. Examples:
 * `nullableString(null) => null`, `nullableString(" x ") => "x"`,
 * `nullableString(1) => undefined`.
 */
export function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

/**
 * Return a string or null when the value is not a string.
 */
export function optionalStringOrNull(value: unknown): string | null {
  return optionalString(value) ?? null;
}

/**
 * Return an integer from an integer number or numeric string, or null.
 */
export function optionalIntegerOrNull(value: unknown): number | null {
  if (Number.isInteger(value)) {
    return value as number;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Return a positive integer from a number or numeric string. Examples:
 * `positiveInteger("2", "page") => 2`, `positiveInteger(0, "page")` throws.
 */
export function positiveInteger(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed > 0) {
      return parsed;
    }
  }

  throw createError(`${fieldName} must be a positive integer`);
}
