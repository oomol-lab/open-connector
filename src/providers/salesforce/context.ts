import type { OAuthProviderContext } from "../provider-executors.ts";

import { requiredRawString } from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import {
  salesforceFileRequestTimeoutMs,
  salesforceOrigin,
  salesforceRequest,
  withSalesforceResponse,
} from "./transport.ts";
export interface SalesforceContext extends OAuthProviderContext {
  base: string;
  version: string;
  origin: string;
  request(path: string, method?: string, body?: unknown, extraHeaders?: HeadersInit): Promise<unknown>;
  object(path: string, method?: string, body?: unknown, extraHeaders?: HeadersInit): Promise<Record<string, unknown>>;
  items(
    path: string,
    method?: string,
    body?: unknown,
  ): Promise<{
    results: unknown[];
  }>;
  response<T>(
    path: string,
    init: RequestInit,
    consume: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T>;
}
export function createSalesforceContext(
  context: OAuthProviderContext,
  data: Record<string, unknown>,
): SalesforceContext {
  const origin = salesforceOrigin(
    requiredInputString(context.providerSecret?.instanceUrl, "instanceUrl"),
    "instanceUrl",
  );
  const version = String(data.apiVersion ?? "66.0");
  const base = `/services/data/v${version}`;
  function url(path: string): URL {
    const resolved = new URL(path, origin);
    if (resolved.origin !== origin || !path.startsWith("/services/"))
      throw providerInputError("Salesforce path must stay within the connected instance");
    return resolved;
  }
  function initWithAuth(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${context.accessToken}`);
    return { ...init, headers };
  }
  async function request(path: string, method = "GET", body?: unknown, extraHeaders?: HeadersInit): Promise<unknown> {
    const headers = new Headers(extraHeaders);
    if (body !== undefined) headers.set("content-type", "application/json");
    return (
      await salesforceRequest(
        url(path),
        initWithAuth({
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        context.fetcher,
        context.signal,
      )
    ).body;
  }
  return {
    ...context,
    base,
    version,
    origin,
    request,
    async object(
      path: string,
      method = "GET",
      body?: unknown,
      extraHeaders?: HeadersInit,
    ): Promise<Record<string, unknown>> {
      return requiredResponseRecord(await request(path, method, body, extraHeaders), "Salesforce response");
    },
    async items(
      path: string,
      method = "GET",
      body?: unknown,
    ): Promise<{
      results: unknown[];
    }> {
      const results = await request(path, method, body);
      if (!Array.isArray(results)) throw providerResponseError("Salesforce results must be an array");
      return { results };
    },
    response<T>(
      path: string,
      init: RequestInit,
      consume: (response: Response, signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
      return withSalesforceResponse(
        url(path),
        initWithAuth(init),
        context.fetcher,
        consume,
        salesforceFileRequestTimeoutMs,
        context.signal,
      );
    },
  };
}
export type SalesforceHandler = (data: Record<string, unknown>, context: SalesforceContext) => Promise<unknown>;
export function segment(value: unknown): string {
  const raw = requiredRawString(value, "path segment", providerInputError);
  if (!raw || raw === "." || raw === "..") throw providerInputError("Salesforce path cannot contain dot segments");
  return encodeURIComponent(raw);
}
export function queryPath(path: string, params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  return search.size ? `${path}?${search}` : path;
}
