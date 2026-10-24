import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { aktaActions } from "./actions.ts";
import { aktaRoutes } from "./actions.ts";
const baseUrl = "https://api.akta.pro/api";
async function request(
  apiKey: string,
  name: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const route = aktaRoutes[name];
  if (!route) throw providerInputError(`Unknown Akta action: ${name}`);
  return runProviderRequest({ label: "Akta", timeoutMs: route.timeoutMs, signal: parentSignal }, async (signal) => {
    const path = route.path.replace("{request_id}", encodeURIComponent(String(input.request_id)));
    const url = new URL(`${baseUrl}${path}`);
    if (route.method === "GET") {
      for (const [key, value] of Object.entries(input)) {
        if (key === "request_id" || value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) url.searchParams.append(key, String(item));
        } else url.searchParams.set(key, String(value));
      }
    }
    const response = await fetcher(url, {
      method: route.method,
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: route.method === "POST" ? JSON.stringify(input) : undefined,
      signal,
    });
    if (response.status === 204 && ["search_news", "search_companies", "search_industries"].includes(name)) {
      return { data: [] };
    }
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const error = optionalRecord(body);
      const nested = optionalRecord(error?.error);
      const message =
        optionalString(error?.detail) ??
        optionalString(error?.message) ??
        optionalString(nested?.message) ??
        optionalString(error?.error);
      const code = optionalString(error?.code) ?? optionalString(nested?.code);
      const detail = [code, message].filter(Boolean).join(": ");
      throw new ProviderRequestError(
        response.status,
        `Akta request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(body, "Akta response");
  });
}
function normalizeStatus(body: Record<string, unknown>) {
  const data = optionalRecord(body.data) ?? body;
  const detail = optionalRecord(data.detail);
  const status = optionalString(detail?.status) ?? optionalString(data.status);
  if (!status) throw providerResponseError("Akta response is missing request status");
  return { ...body, ...data, status };
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const data = values;
  if (actionName === "get_addition_result") {
    const handle = data.handle as Record<string, unknown>;
    if (handle.company) return { status: "completed", company: handle.company };
    return normalizeStatus(
      await request(apiKey, "get_request_status", { request_id: handle.request_id }, fetcher, context.signal),
    );
  }
  const body = await request(apiKey, actionName, data, fetcher, context.signal);
  if (actionName === "get_request_status") return normalizeStatus(body);
  if (actionName === "add_company") {
    const result = optionalRecord(body.data) ?? body;
    const company = optionalRecord(result.company);
    const requestId = optionalString(result.request_id);
    if (result.already_exists === true && company) return { ...body, ...result, handle: { company } };
    if (result.already_exists !== true && requestId) return { ...body, ...result, handle: { request_id: requestId } };
    throw providerResponseError("Akta addition response is missing a request ID or existing company");
  }
  return body;
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(input.apiKey, "search_companies", { query: "canva" }, fetcher, signal);
    return { profile: { displayName: "Akta API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "akta",
  Object.fromEntries(
    aktaActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "akta",
  baseUrl: baseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
