import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";

interface ShopifyGraphQLResponse {
  data?: unknown;
  errors?: unknown;
  extensions?: unknown;
}

export function readMutationResult(payload: ShopifyGraphQLResponse, fieldName: string): Record<string, unknown> {
  const result = requiredResponseRecord(requiredResponseRecord(payload.data, "data")[fieldName], fieldName);
  const errors = readMutationUserErrors(result.userErrors);
  if (errors.length > 0) {
    throw new ProviderRequestError(422, `shopify ${fieldName} user error: ${errors.join("; ")}`);
  }
  return result;
}

export function readMutationUserErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const error = optionalRecord(item);
    const message = optionalString(error?.message) ?? "unknown mutation error";
    const code = optionalString(error?.code);
    const field = Array.isArray(error?.field)
      ? error.field.filter((part): part is string => typeof part === "string").join(".")
      : undefined;
    return [field ? `${field}:` : undefined, code ? `[${code}]` : undefined, message]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  });
}

export function connectionVariables(input: Record<string, unknown>): Record<string, unknown> {
  return {
    first: input.first ?? 50,
    after: input.after,
    query: input.query,
  };
}

export function normalizeShop(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    myshopifyDomain: readRequiredString(raw, "myshopifyDomain"),
    primaryDomainUrl: optionalString(optionalRecord(raw.primaryDomain)?.url) ?? null,
    primaryDomainHost: optionalString(optionalRecord(raw.primaryDomain)?.host) ?? null,
    raw,
  };
}

export function normalizePageInfo(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    hasNextPage: readRequiredBoolean(raw, "hasNextPage"),
    hasPreviousPage: readRequiredBoolean(raw, "hasPreviousPage"),
    startCursor: optionalString(raw.startCursor) ?? null,
    endCursor: optionalString(raw.endCursor) ?? null,
  };
}

export function readEdges(connection: Record<string, unknown>): Record<string, unknown>[] {
  const edges = connection.edges;
  if (!Array.isArray(edges)) {
    throw new ProviderRequestError(502, "shopify response is missing edges");
  }
  return edges.map((edge) => requiredResponseRecord(edge, "edge"));
}

export function readNullableObject(value: unknown, fieldName: string): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  return requiredResponseRecord(value, fieldName);
}

export function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `shopify response is missing ${key}`);
  }
  return value;
}

export function readRequiredInteger(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `shopify response is missing ${key}`);
  }
  return value as number;
}

export function readRequiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `shopify response is missing ${key}`);
  }
  return value;
}
