import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerInputError } from "../provider-runtime.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  isAbortLikeError,
} from "../provider-runtime.ts";
import actions from "./actions.ts";
const baseUrl = "https://storerocket.io/api/v2";
const headers = { accept: "application/json", "user-agent": providerUserAgent };
function encodeId(value: unknown, name: string) {
  const id = requiredInputString(value, name);
  if (id === "." || id === "..") throw providerInputError(`${name} must be a public ID`);
  return encodeURIComponent(id);
}
async function request(
  endpoint: string,
  method: string,
  query: Record<string, string>,
  body: unknown,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "StoreRocket" }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const requestHeaders = new Headers(headers);
    requestHeaders.set("authorization", `Bearer ${apiKey}`);
    if (body !== undefined) requestHeaders.set("content-type", "application/json");
    const response = await fetcher(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `StoreRocket returned invalid JSON (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const result = requiredResponseRecord(raw, "StoreRocket");
    if (!response.ok) {
      const message = optionalString(result.message) ?? `StoreRocket request failed (HTTP ${response.status})`;
      if (response.status === 401 && message === "Unauthenticated.")
        throw new ProviderRequestError(401, message, undefined, "authorization_failed");
      throw new ProviderRequestError(
        response.status,
        message,
        optionalRecord(result.errors),
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return result;
  });
}
async function execute(
  actionName: string,
  valuesInput: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const values = valuesInput;
  let endpoint: string;
  let method = "GET";
  if (actionName === "get_user") endpoint = "/user";
  else if (actionName === "list_projects") endpoint = "/projects";
  else {
    endpoint = `/projects/${encodeId(values.project_id, "project_id")}/locations`;
    if (["get_location", "update_location", "delete_location"].includes(actionName))
      endpoint += `/${encodeId(values.location_id, "location_id")}`;
    if (actionName === "create_location") method = "POST";
    if (actionName === "update_location") method = "PATCH";
    if (actionName === "delete_location") method = "DELETE";
  }
  const query: Record<string, string> = {};
  for (const key of ["page", "limit", "includeHours", "includeFilters", "includeFields", "includeCallsToAction"]) {
    const value = values[key];
    if (value !== undefined) query[key] = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  }
  for (const [field, operators] of Object.entries(optionalRecord(values.filters) ?? {})) {
    for (const [operator, value] of Object.entries(optionalRecord(operators) ?? {}))
      query[`${field}[${operator}]`] = String(value);
  }
  return request(endpoint, method, query, values.location, context.apiKey, context.fetcher, context.signal);
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "storerocket",
  Object.fromEntries(
    actions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ApiKeyProviderContext) => execute(action.name, values, context),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const body = await request("/user", "GET", {}, undefined, input.apiKey, fetcher);
    const user = requiredResponseRecord(body.data, "StoreRocket user");
    return {
      profile: { displayName: optionalString(user.name) || optionalString(user.email) || "StoreRocket Account" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "storerocket",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
