import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, optionalNumber, recordOrEmpty } from "../../core/cast.ts";
import { readSchemaProperties } from "../../core/json-schema.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { justoneapiActions, justoneapiEndpoints } from "./actions.ts";
const apiBaseUrl = "https://api.justoneapi.com";
const endpointByRequest = new Map(
  justoneapiEndpoints.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]),
);

function validateRelatedInputs(path: string, values: Record<string, unknown>) {
  if (path === "/api/vcg/search-image/v1" || path === "/api/pixabay/search-image/v1") {
    if (values.resultMode === "candidate_ids") {
      values.limit ??= 10000;
      values.maxPages ??= 1;
      if (
        values.limit !== 10000 ||
        values.maxPages !== 1 ||
        (Array.isArray(values.excludeResourceIds) && values.excludeResourceIds.length > 0)
      ) {
        throw providerInputError("candidate_ids requires limit 10000, maxPages 1, and no excluded resource IDs");
      }
    }
    const startPage = optionalNumber(values.startPage);
    const maxPages = optionalNumber(values.maxPages);
    if (startPage != null && maxPages != null && startPage + maxPages - 1 > 10000) {
      throw providerInputError("The last requested page must not exceed 10000");
    }
  }
  if ("similarUserId" in values || "similarWord" in values) {
    if (Boolean(values.similarUserId) !== Boolean(values.similarWord)) {
      throw providerInputError("similarUserId and similarWord must be provided together");
    }
  }
  if (values.kolPriceRange && !values.kolPriceType) throw providerInputError("kolPriceRange requires kolPriceType");
  if (path.startsWith("/api/xiaohongshu-ec/") && (optionalNumber(values.page) ?? 1) > 1 && !values.searchId) {
    throw providerInputError("searchId is required after the first page");
  }
}

const handlers = mapProviderActionHandlers(
  "justoneapi",
  justoneapiActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const endpoint = justoneapiEndpoints.find((endpoint) => endpoint.name === action.name)!;
    values = { ...values };
    for (const [name, schema] of Object.entries(readSchemaProperties(endpoint.inputSchema))) {
      if (values[name] === undefined && schema.default !== undefined) values[name] = schema.default;
    }
    const token = requiredInputString(context.apiKey, "apiKey");
    validateRelatedInputs(endpoint.path, values);
    const url = new URL(endpoint.path, apiBaseUrl);
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) parameters.append(key, String(item));
      } else {
        parameters.set(key, String(value));
      }
    }
    parameters.set("token", token);
    const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
    let body: string | undefined;
    if (endpoint.authLocation === "form") {
      headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
      body = parameters.toString();
    } else {
      url.search = parameters.toString();
    }
    return runProviderRequest({ signal: context.signal, label: "Just One API", timeoutMs: 120_000 }, async (signal) => {
      const response = await context.fetcher(url, {
        method: endpoint.method,
        headers,
        body,
        signal,
      });
      const text = await readProviderTextBody(response, "justoneapi response", undefined, signal);
      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch {
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `Just One API returned invalid JSON (HTTP ${response.status})`,
          undefined,
          "provider_error",
        );
      }
      const payload = response.ok ? requiredResponseRecord(decoded, "Just One API response") : recordOrEmpty(decoded);
      const code = optionalNumber(payload.code);
      if (!response.ok || code !== 0) {
        const detail = [optionalRawString(payload.message), optionalRawString(payload.reason)]
          .filter(Boolean)
          .join("; ");
        const message =
          `Just One API ${code == null ? `HTTP ${response.status}` : `code ${code}`}${detail ? `: ${detail}` : " request failed"}`.replaceAll(
            token,
            "[REDACTED]",
          );
        if (code === 100) throw new ProviderRequestError(401, message, undefined, "authorization_failed");
        if (code === 302 || code === 303) throw new ProviderRequestError(429, message, undefined, "rate_limited");
        throw new ProviderRequestError(response.ok ? 502 : response.status, message, undefined, "provider_error");
      }
      if (!("data" in payload)) {
        throw new ProviderRequestError(502, "Just One API response is missing data", undefined, "provider_error");
      }
      return payload;
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("justoneapi", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "apiKey");
    return {
      profile: { displayName: "Just One API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl, validationMode: "format_only" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "justoneapi",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "token" },
  timeoutMs: 120_000,
  skipDnsValidation: true,
  customizeRequest({ url, method, headers, body, setBody }) {
    const endpoint = endpointByRequest.get(`${method.toUpperCase()} ${url.pathname}`);
    if (!endpoint)
      throw providerInputError("Just One API proxy only supports documented current endpoints and methods");
    if (endpoint.authLocation === "form") {
      const token = url.searchParams.get("token")!;
      url.searchParams.delete("token");
      const form = new URLSearchParams(optionalRawString(body));
      if (body != null && typeof body !== "string") {
        const fields = optionalRecord(body);
        if (!fields) throw providerInputError("token proxy auth requires a form-compatible body");
        for (const [key, value] of Object.entries(fields)) if (value != null) form.set(key, String(value));
      }
      form.set("token", token);
      headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
      setBody(form.toString());
    }
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
