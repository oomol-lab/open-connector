import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  requiredRecord,
  stringArray,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export {
  compactObject,
  optionalBoolean,
  optionalIntegerLike as asOptionalInteger,
  optionalRecord as asOptionalObject,
  optionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  requiredRecord,
  stringArray,
};

export function resolveFileId(input: Record<string, unknown>): string {
  const value = optionalString(input.fileId);
  if (!value) {
    throw new ProviderRequestError(400, "fileId is required");
  }
  return extractFileId(value);
}

export function resolveSupportsAllDrives(input: Record<string, unknown>): boolean {
  return optionalBoolean(input.includeSharedDrives) ?? optionalBoolean(input.supportsAllDrives) ?? true;
}

export function resolveRequiredString(input: Record<string, unknown>, keys: string[], message: string): string {
  const value = pickOptionalString(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, message);
  }
  return value;
}

export function asStringRecord(value: unknown): Record<string, string> {
  const record = requiredRecord(value, "string map input", (message) => new ProviderRequestError(400, message));
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, String(child)]));
}

export function asStringRecordOrUndefined(value: unknown): Record<string, string> | undefined {
  if (value == null) {
    return undefined;
  }
  return asStringRecord(value);
}

export function optionalNestedString(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return optionalString(current);
}

export function parseSizeBytes(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function compactUnknownObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return compactObject(value);
}

export function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}

export function asStringArray(value: unknown): string[] {
  return stringArray(value, "string array", (message) => new ProviderRequestError(400, message));
}

function extractFileId(value: string): string {
  const normalizedValue = value.trim();
  const maybeId = extractIdFromGoogleUrl(normalizedValue);
  return maybeId ?? normalizedValue;
}

function extractIdFromGoogleUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    const idFromQuery = url.searchParams.get("id");
    if (idFromQuery) {
      return idFromQuery;
    }
    const match = url
      .toString()
      .match(
        /\/(?:document|spreadsheets|presentation)(?:\/u\/\d+)?\/d\/([^/?#]+)|\/file(?:\/u\/\d+)?\/d\/([^/?#]+)|\/folders\/([^/?#]+)/,
      );
    return match?.[1] ?? match?.[2] ?? match?.[3];
  } catch {
    return undefined;
  }
}
