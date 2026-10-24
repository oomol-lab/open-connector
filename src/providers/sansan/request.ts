import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const sansanApiBaseUrl = "https://api.sansan.com/v6.0";

export interface SansanContext extends ApiKeyProviderContext {
  phase?: "validate" | "execute";
}
export type SansanActionHandler = (input: Record<string, unknown>, context: SansanContext) => Promise<unknown>;

interface SansanRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, unknown>;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

export async function requestSansan<T>(
  path: string,
  input: SansanRequest,
  context: SansanContext,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  return runProviderRequest({ label: "Sansan", signal: context.signal }, async (signal) => {
    const url = new URL(`${sansanApiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        const parameter = key === "tagIds" ? "tagId[]" : path === "/reports" ? `${key}[]` : key;
        for (const item of value) url.searchParams.append(parameter, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    const headers = new Headers(input.headers);
    headers.set("X-Sansan-Api-Key", context.apiKey);
    headers.set("accept", "application/json, text/csv, image/jpeg");
    headers.set("user-agent", providerUserAgent);
    if (input.json !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.json === undefined ? input.body : JSON.stringify(input.json),
      signal,
    });
    if (!response.ok) throw await readSansanError(response, context.phase ?? "execute");
    return consume(response);
  });
}

export function requestSansanJson(
  path: string,
  input: SansanRequest,
  context: SansanContext,
): Promise<Record<string, unknown>> {
  return requestSansan(path, input, context, async (response) =>
    requiredResponseRecord(await readSansanJson(response), "Sansan response"),
  );
}

export async function readSansanJson(response: Response, allowEmpty = false): Promise<unknown> {
  const text = await response.text();
  if (allowEmpty && !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw providerResponseError("Sansan returned invalid JSON");
  }
}

export function normalizeSansanPage(payload: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(payload.data) || typeof payload.hasMore !== "boolean") {
    throw providerResponseError("Sansan list response is missing data or hasMore");
  }
  const nextPageToken = optionalString(payload.nextPageToken) || null;
  if (payload.hasMore && !nextPageToken) {
    throw providerResponseError("Sansan list response is missing nextPageToken");
  }
  return { ...payload, data: payload.data, hasMore: payload.hasMore, nextPageToken };
}

export function sansanPathId(value: unknown, field: string): string {
  const id = optionalString(value)?.trim();
  if (!id || id === "." || id === "..") {
    throw providerInputError(`${field} must be a non-empty resource ID, not a dot path segment`);
  }
  return encodeURIComponent(id);
}

export function sansanPageQuery(query: Record<string, unknown>): Record<string, unknown> {
  const token = optionalString(query.nextPageToken);
  return token ? { nextPageToken: token } : query;
}

export async function readSansanError(
  response: Response,
  phase: "validate" | "execute" = "execute",
): Promise<ProviderRequestError> {
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = { message: text };
  }
  const payload = optionalRecord(value);
  const codes = looseArray(payload?.error).flatMap((detail) => {
    const item = optionalRecord(detail);
    const code = optionalString(item?.Code) ?? optionalString(item?.code);
    return code ? [code] : [];
  });
  const detail = optionalString(payload?.message) || `Sansan request failed with status ${response.status}`;
  const message = codes.length ? `${detail} (${codes.join(", ")})` : detail;
  if (codes.includes("invalid_api_key")) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 409,
      message,
      undefined,
      phase === "validate" ? "invalid_input" : "authorization_failed",
    );
  }
  if (response.status === 429) return new ProviderRequestError(429, message, undefined, "rate_limited");
  return new ProviderRequestError(response.status, message, undefined, "provider_error");
}
