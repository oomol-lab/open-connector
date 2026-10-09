import type { JsonSchema } from "../../core/types.ts";
import type { Schema } from "@cfworker/json-schema";

import { Validator } from "@cfworker/json-schema";
import { readSchemaProperties, readSchemaRequired } from "../../core/json-schema.ts";
import { samplePattern } from "./pattern-example.ts";

const exampleStringFormats: Record<string, string> = {
  date: "2000-01-01",
  "date-time": "2000-01-01T00:00:00Z",
  email: "user@example.com",
  hostname: "example.com",
  ipv4: "192.0.2.1",
  ipv6: "2001:db8::1",
  uri: "https://example.com",
  url: "https://example.com",
  uuid: "00000000-0000-4000-8000-000000000000",
};

/** Build a small example for the schema shapes used by the action catalog. */
export function buildExampleInput(schema: JsonSchema): Record<string, unknown> {
  const seedSchema = mergeAllOfPropertySchemas(schema);
  const properties = readSchemaProperties(seedSchema);
  const input: Record<string, unknown> = {};
  seedObjectRequirements(seedSchema, properties, input);
  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      if (isSchemaObject(member)) {
        seedObjectRequirements(member, properties, input);
      }
    }
  }
  fillMinProperties(seedSchema, properties, input);
  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      if (isSchemaObject(member)) {
        fillMinProperties(member, { ...properties, ...readSchemaProperties(member) }, input);
      }
    }
  }
  applyConditionalRequirements(seedSchema, seedSchema, input);
  return input;
}

/** Apply each selected condition once; do not search for a globally satisfying assignment. */
function applyConditionalRequirements(schema: JsonSchema, parent: JsonSchema, input: Record<string, unknown>): void {
  if (isSchemaObject(schema.if)) {
    const matches = new Validator(schema.if as Schema, "2020-12").validate(input).valid;
    const branch = matches ? schema.then : schema.else;
    if (isSchemaObject(branch)) {
      const merged = mergeExampleSchemas(parent, branch);
      const properties = readSchemaProperties(merged);
      for (const name of Object.keys(readSchemaProperties(branch))) {
        if (name in input) {
          input[name] = exampleValue(properties[name]);
        }
      }
      seedObjectRequirements({ ...branch, properties }, properties, input);
      fillMinProperties(merged, properties, input);
      applyConditionalRequirements(branch, merged, input);
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      if (isSchemaObject(member)) {
        applyConditionalRequirements(member, parent, input);
      }
    }
  }
}

/**
 * Same-named property schemas from `allOf` members apply together with the root
 * schema, so merge their constraints before seeding a required property: a
 * member that adds `minLength` must not be skipped because the root seeded the
 * value first.
 */
function mergeAllOfPropertySchemas(schema: JsonSchema): JsonSchema {
  if (!Array.isArray(schema.allOf)) {
    return schema;
  }
  const properties: Record<string, JsonSchema> = { ...readSchemaProperties(schema) };
  let merged = false;
  for (const member of schema.allOf) {
    if (!isSchemaObject(member)) {
      continue;
    }
    for (const [name, memberProperty] of Object.entries(readSchemaProperties(member))) {
      if (!isSchemaObject(memberProperty)) {
        continue;
      }
      const parentProperty = properties[name];
      properties[name] = isSchemaObject(parentProperty)
        ? mergeExampleSchemas(parentProperty, memberProperty)
        : memberProperty;
      merged = true;
    }
  }
  return merged ? { ...schema, properties } : schema;
}

/** Raise the object to its `minProperties` with named properties first, then placeholder map keys. */
function fillMinProperties(
  schema: JsonSchema,
  properties: Record<string, JsonSchema>,
  input: Record<string, unknown>,
): void {
  const minProperties = typeof schema.minProperties === "number" ? schema.minProperties : 0;
  if (minProperties === 0) {
    return;
  }
  for (const name of Object.keys(properties)) {
    if (Object.keys(input).length >= minProperties) {
      break;
    }
    if (!(name in input)) {
      input[name] = exampleValue(properties[name]);
    }
  }
  if (schema.additionalProperties !== false) {
    // A map-shaped object such as attributes or records reaches minProperties
    // only through its additional properties; placeholder keys fill the deficit
    // while still matching the outer schema. Bounded so a property named like a
    // placeholder cannot loop forever.
    for (let index = 0; Object.keys(input).length < minProperties && index < minProperties + 10; index += 1) {
      const key = isSchemaObject(schema.propertyNames) ? stringExample(schema.propertyNames) : "key";
      const name = index === 0 ? key : `${key}${index + 1}`;
      if (name in input) {
        continue;
      }
      input[name] = exampleValue(isSchemaObject(schema.additionalProperties) ? schema.additionalProperties : undefined);
    }
  }
}

/** Seed every property requirement an object schema (or one `allOf` member) declares. */
function seedObjectRequirements(
  schema: JsonSchema,
  properties: Record<string, JsonSchema>,
  input: Record<string, unknown>,
): void {
  seedRequiredProperties(schema, properties, input);
  seedRequirementBranches(schema, properties, input);
}

/**
 * `requireAnyProperty`/`requireExactlyOneProperty` keep every property optional
 * and add `anyOf`/`oneOf` branches that each require some property, so an example
 * that only seeds `required` can never match. Seed the properties the first
 * usable branch asks for, using the branch's own property schemas.
 */
function seedRequirementBranches(
  schema: JsonSchema,
  properties: Record<string, JsonSchema>,
  input: Record<string, unknown>,
): void {
  const keyword = Array.isArray(schema.anyOf) ? "anyOf" : "oneOf";
  const branches = schema[keyword];
  if (!Array.isArray(branches)) {
    return;
  }
  const candidates = branches
    .filter(isSchemaObject)
    .filter((branch) => branch.type !== "null" && !conflictsWithParent(schema, branch));
  const satisfied =
    keyword === "oneOf"
      ? candidates.find((branch) => {
          const required = readSchemaRequired(branch);
          return required.length > 0 && required.every((name) => name in input);
        })
      : undefined;
  const branch =
    satisfied ??
    (keyword === "oneOf"
      ? candidates.find(
          (candidate) =>
            readSchemaRequired(schema).length > 0 ||
            readSchemaRequired(candidate).length > 0 ||
            Array.isArray(candidate.anyOf) ||
            Array.isArray(candidate.oneOf) ||
            Object.keys(readSchemaProperties(candidate)).length > 0,
        )
      : undefined) ??
    candidates[0];
  if (!branch) {
    return;
  }
  const merged = mergeBranch(schema, branch, keyword);
  const mergedProperties = { ...properties, ...readSchemaProperties(merged) };
  const required = readSchemaRequired(merged);
  for (const name of required) {
    input[name] = exampleValue(mergedProperties[name]);
  }
  // Optional properties can distinguish object shapes that would all accept {}.
  // Nested combinators must select their own requirements before adding fields.
  if (keyword === "oneOf" && required.length === 0 && !Array.isArray(merged.anyOf) && !Array.isArray(merged.oneOf)) {
    for (const name of Object.keys(mergedProperties)) {
      input[name] = exampleValue(mergedProperties[name]);
    }
  }
  seedObjectRequirements(merged, mergedProperties, input);
  fillMinProperties(merged, mergedProperties, input);
}

function seedRequiredProperties(
  schema: JsonSchema,
  fallbackProperties: Record<string, JsonSchema>,
  input: Record<string, unknown>,
): void {
  const properties = readSchemaProperties(schema);
  for (const name of readSchemaRequired(schema)) {
    if (!(name in input)) {
      input[name] = exampleValue(properties[name] ?? fallbackProperties[name]);
    }
  }
}

function isSchemaObject(value: unknown): value is JsonSchema {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Unwrap one `anyOf`/`oneOf` branch while keeping the wrapper's own keywords, so
 * a branch that only adds `required`/`properties` inherits the parent type. Same
 * named properties are merged so the branch adds constraints instead of
 * replacing the parent's (`format` plus `minLength`, for example). The
 * consumed parent combinator is dropped; sibling and branch combinators remain.
 */
function mergeBranch(schema: JsonSchema, branch: JsonSchema, keyword: "anyOf" | "oneOf"): JsonSchema {
  const parent = { ...schema };
  delete parent[keyword];
  return mergeExampleSchemas(parent, branch);
}

/** Merge the property and item refinements used by catalog branches. */
function mergeExampleSchemas(parent: JsonSchema, branch: JsonSchema): JsonSchema {
  const merged = { ...parent, ...branch };
  if (parent.properties && branch.properties) {
    const properties = { ...readSchemaProperties(parent) };
    for (const [name, property] of Object.entries(readSchemaProperties(branch))) {
      properties[name] = properties[name] ? mergeExampleSchemas(properties[name], property) : property;
    }
    merged.properties = properties;
  }
  if (isSchemaObject(parent.items) && isSchemaObject(branch.items)) {
    merged.items = mergeExampleSchemas(parent.items, branch.items);
  }
  if (parent.required || branch.required) {
    merged.required = [...new Set([...readSchemaRequired(parent), ...readSchemaRequired(branch)])];
  }
  return merged;
}

function exampleValue(schema: JsonSchema | undefined): unknown {
  if (!schema) {
    return "";
  }
  if (schema.default !== undefined && new Validator(schema as Schema, "2020-12").validate(schema.default).valid) {
    return schema.default;
  }
  if (schema.const !== undefined) {
    return schema.const;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (schema.minimum !== undefined || schema.maximum !== undefined) {
      const validator = new Validator(schema as Schema, "2020-12");
      return schema.enum.find((value) => validator.validate(value).valid) ?? schema.enum[0];
    }
    return schema.enum[0];
  }
  if (schema.type === "object") {
    return buildExampleInput(schema);
  }
  const branch = firstActionableBranch(schema);
  if (branch) {
    return branch.type === "object" ? buildExampleInput(schema) : exampleValue(branch);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((entry) => entry !== "null") : schema.type;
  if (type === undefined || type === "null") {
    return type === "null" ? null : stringExample(schema);
  }
  if (type === "integer" || type === "number") {
    return numberExample(schema);
  }
  if (type === "boolean") {
    return false;
  }
  if (type === "array") {
    return arrayExample(schema);
  }
  if (type === "object") {
    return buildExampleInput(schema);
  }
  return stringExample(schema);
}

/** Unwrap `anyOf`/`oneOf` wrappers such as nullable fields, choosing the first non-null branch. */
function firstActionableBranch(schema: JsonSchema): JsonSchema | undefined {
  const keyword = Array.isArray(schema.anyOf) ? "anyOf" : "oneOf";
  const branches = schema[keyword];
  if (!Array.isArray(branches)) {
    return undefined;
  }
  for (const branch of branches) {
    if (isSchemaObject(branch) && branch.type !== "null" && !conflictsWithParent(schema, branch)) {
      return mergeBranch(schema, branch, keyword);
    }
  }
  return mergeBranch(schema, { type: "null" }, keyword);
}

/**
 * A branch that pins a property the parent already pins with `const` to another
 * value can never match; a discriminated `oneOf` relies on this.
 */
function conflictsWithParent(schema: JsonSchema, branch: JsonSchema): boolean {
  const parentProperties = readSchemaProperties(schema);
  for (const [name, branchProperty] of Object.entries(readSchemaProperties(branch))) {
    const parentProperty = parentProperties[name];
    if (
      isSchemaObject(branchProperty) &&
      isSchemaObject(parentProperty) &&
      branchProperty.const !== undefined &&
      parentProperty.const !== undefined &&
      branchProperty.const !== parentProperty.const
    ) {
      return true;
    }
  }
  return false;
}

function stringExample(schema: JsonSchema): string {
  const minLength = typeof schema.minLength === "number" && schema.minLength > 0 ? schema.minLength : 0;
  const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : undefined;
  if (typeof schema.format === "string") {
    return formatStringExample(schema.format, minLength, maxLength);
  }
  if (typeof schema.pattern === "string") {
    const sample = samplePattern(schema.pattern, { minLength });
    if (sample !== undefined) {
      return sample;
    }
  }
  if (minLength === 0 && typeof schema.pattern !== "string") {
    return "";
  }
  const length = Math.min(Math.max(1, minLength || 1), maxLength ?? Number.POSITIVE_INFINITY);
  return length <= 0 ? "" : "a".repeat(Math.min(length, Math.max(64, minLength)));
}

/**
 * A fixed format sample may be shorter than `minLength`; extend the formats that
 * accept arbitrary length (email local part, URI path, hostname label) so the
 * example still satisfies the schema's own bounds.
 */
function formatStringExample(format: string, minLength: number, maxLength: number | undefined): string {
  const sample = exampleStringFormats[format] ?? "string";
  const target = Math.max(minLength, sample.length);
  if (target === sample.length || (maxLength !== undefined && target > maxLength)) {
    // Bounds that exclude every length the sample can take leave no better value.
    return sample;
  }
  if (format === "email") {
    const domain = "@example.com";
    return `${"a".repeat(Math.max(1, target - domain.length))}${domain}`;
  }
  if (format === "uri" || format === "url") {
    return `${sample}/${"a".repeat(target - sample.length - 1)}`;
  }
  if (format === "hostname") {
    return hostnameExample(target);
  }
  return sample;
}

/** DNS labels are limited to 63 characters; spread the target length across dot-separated labels. */
function hostnameExample(length: number): string {
  if (length <= 63) {
    return "a".repeat(Math.max(1, length));
  }
  const labelCount = Math.ceil((length + 1) / 64);
  let remaining = length - (labelCount - 1);
  const labels: string[] = [];
  for (let index = 0; index < labelCount; index += 1) {
    const labelLength = Math.min(63, remaining - (labelCount - 1 - index));
    labels.push("a".repeat(Math.max(1, labelLength)));
    remaining -= labelLength;
  }
  return labels.join(".");
}

function numberExample(schema: JsonSchema): number {
  const integer = schema.type === "integer";
  const minimum = typeof schema.minimum === "number" ? schema.minimum : undefined;
  const maximum = typeof schema.maximum === "number" ? schema.maximum : undefined;
  const exclusiveMinimum = typeof schema.exclusiveMinimum === "number" ? schema.exclusiveMinimum : undefined;
  const exclusiveMaximum = typeof schema.exclusiveMaximum === "number" ? schema.exclusiveMaximum : undefined;
  let candidate = 1;
  if (minimum !== undefined) {
    candidate = Math.max(candidate, minimum);
  }
  if (exclusiveMinimum !== undefined) {
    candidate = Math.max(candidate, integer ? Math.floor(exclusiveMinimum) + 1 : exclusiveMinimum + 1);
  }
  if (maximum !== undefined && candidate > maximum) {
    candidate = maximum;
  }
  if (exclusiveMaximum !== undefined && candidate >= exclusiveMaximum) {
    candidate = integer ? Math.ceil(exclusiveMaximum) - 1 : exclusiveMaximum - 1;
  }
  if (
    exclusiveMinimum !== undefined &&
    exclusiveMaximum !== undefined &&
    candidate <= exclusiveMinimum &&
    Number.isFinite(exclusiveMinimum) &&
    Number.isFinite(exclusiveMaximum)
  ) {
    // Both exclusive bounds push the candidate outside the interval; a value
    // between them is the only one that can satisfy both.
    candidate = (exclusiveMinimum + exclusiveMaximum) / 2;
  }
  return integer ? Math.floor(candidate) : candidate;
}

function arrayExample(schema: JsonSchema): unknown[] {
  const minItems = typeof schema.minItems === "number" && schema.minItems > 0 ? schema.minItems : 0;
  const itemSchema = Array.isArray(schema.items) ? undefined : (schema.items as JsonSchema | undefined);
  const values = Array.isArray(schema.prefixItems)
    ? schema.prefixItems.map((item) => exampleValue(item as JsonSchema))
    : [];
  while (values.length < minItems) {
    values.push(exampleValue(itemSchema));
  }
  const distinct = new Set(values.map((value) => JSON.stringify(value))).size === values.length;
  if (schema.uniqueItems === true && values.length > 1 && !distinct) {
    if (itemSchema?.type === "string") {
      const minLength = typeof itemSchema.minLength === "number" && itemSchema.minLength > 0 ? itemSchema.minLength : 1;
      const maxLength = typeof itemSchema.maxLength === "number" ? itemSchema.maxLength : undefined;
      const length = Math.max(1, Math.min(minLength, maxLength ?? Number.POSITIVE_INFINITY));
      return values.map((_, index) => String.fromCharCode(97 + index).repeat(length));
    }
    if (itemSchema?.type === "integer" || itemSchema?.type === "number") {
      const first = numberExample(itemSchema);
      return values.map((_, index) => numberExample({ ...itemSchema, minimum: first + index }));
    }
  }
  return values;
}
