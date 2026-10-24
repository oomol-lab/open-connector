import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  readProviderTextBody,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { mementoDatabaseActions } from "./actions.ts";
const baseUrl = "https://api.mementodatabase.com/v1";
function encodePathSegment(value: string) {
  if (value === "." || value === "..") {
    throw new ProviderRequestError(400, "resource IDs cannot be dot path segments", undefined, "invalid_input");
  }
  return encodeURIComponent(value);
}
async function request(
  path: string,
  method: string,
  apiKey: string,
  fetcher: typeof fetch,
  query = new URLSearchParams(),
  body?: Record<string, unknown>,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "memento_database" }, async (signal) => {
    const url = new URL(`${baseUrl}${path}`);
    url.search = query.toString();
    url.searchParams.set("token", apiKey);
    const response = await fetcher(url, {
      method,
      signal,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await readProviderTextBody(response, "memento_database response", undefined, signal);
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message =
        optionalRawString(record?.message) ??
        optionalRawString(record?.error) ??
        optionalRawString(optionalRecord(record?.error)?.message) ??
        (payload === null && text && !text.trimStart().startsWith("<")
          ? text
          : `Memento Database HTTP ${response.status}`);
      throw new ProviderRequestError(response.status, message, undefined, "provider_error");
    }
    if (method === "DELETE" && response.status === 204) return { success: true };
    return requiredResponseRecord(payload, "memento_database");
  }).catch((error: unknown) => {
    if (error instanceof ProviderRequestError) {
      const encodedToken = new URLSearchParams({ token: apiKey }).toString().slice(6);
      const message = [apiKey, encodeURIComponent(apiKey), encodedToken].reduce(
        (value, secret) => value.split(secret).join("[REDACTED]"),
        error.message,
      );
      throw new ProviderRequestError(error.status, message, undefined, error.code);
    }
    throw error;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "memento_database",
  mapProviderActionHandlers(
    "memento_database",
    mementoDatabaseActions,
    (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const data = input;
      let path = "/libraries";
      let method = "GET";
      let body: Record<string, unknown> | undefined;
      const query = new URLSearchParams();
      if (action.name !== "list_libraries") {
        path += `/${encodePathSegment(requiredInputString(data.libraryId, "libraryId"))}`;
      }
      if (["list_entries", "create_entry", "get_entry", "update_entry", "delete_entry"].includes(action.name)) {
        path += "/entries";
      }
      if (["get_entry", "update_entry", "delete_entry"].includes(action.name)) {
        path += `/${encodePathSegment(requiredInputString(data.entryId, "entryId"))}`;
      }
      if (action.name === "search_entries") {
        path += "/search";
        query.set("q", requiredInputString(data.q, "q"));
      }
      if (action.name === "list_entries" || action.name === "search_entries") {
        query.set("fields", optionalRawString(data.fields) ?? "*all");
        for (const key of ["pageSize", "pageToken", "startRevision"]) {
          if (data[key] !== undefined) query.set(key, String(data[key]));
        }
      }
      if (action.name === "create_entry" || action.name === "update_entry") {
        method = action.name === "create_entry" ? "POST" : "PATCH";
        body = { fields: data.fields };
      }
      if (action.name === "delete_entry") method = "DELETE";
      return request(path, method, context.apiKey, context.fetcher, query, body, context.signal);
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await request("/libraries", "GET", requiredInputString(input.apiKey, "API Key"), fetcher);
    return {
      profile: { displayName: "Memento Database Account" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "memento_database",
  baseUrl,
  auth: { type: "api_key_query", name: "token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
