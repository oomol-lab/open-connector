import type { CredentialDefinition } from "./types.ts";

import { optionalRawString, optionalString } from "./cast.ts";

/**
 * Error factory used when credential field validation fails.
 */
export type CredentialFieldErrorFactory = (message: string) => Error;

/**
 * Options for normalizing provider-declared credential fields.
 */
export type NormalizeCredentialValuesOptions = {
  fields: CredentialDefinition[];
  values: Record<string, unknown>;
  createError: CredentialFieldErrorFactory;
  preserveSecrets?: boolean;
};

/**
 * Normalize values after enforcing a provider field contract.
 * Custom credentials preserve secrets; API keys and OAuth configuration retain trimming.
 *
 * This keeps local connection APIs aligned with the public provider catalog:
 * callers may only submit fields declared by the provider, and required fields
 * must contain non-empty string values.
 */
export function normalizeCredentialValues(options: NormalizeCredentialValuesOptions): Record<string, string> {
  const values: Record<string, string> = {};
  const fieldsByKey = new Map(options.fields.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(options.values)) {
    const field = fieldsByKey.get(key);
    const text = options.preserveSecrets && field?.secret ? optionalRawString(value) : optionalString(value);
    if (!text) continue;
    if (!field) {
      throw options.createError(`Unexpected credential field: ${key}.`);
    }
    values[key] = text;
  }

  for (const field of options.fields) {
    if (field.required && !values[field.key]) {
      throw options.createError(`${field.key} is required.`);
    }
  }

  return values;
}
