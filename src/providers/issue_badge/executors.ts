import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { issueBadgeActions } from "./actions.ts";
const apiBaseUrl = "https://app.issuebadge.com/api/v1";

interface RequestOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  validate?: boolean;
}

async function request(
  path: string,
  apiKey: string,
  fetcher: typeof fetch,
  options: RequestOptions = {},
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "IssueBadge" }, async (signal) => {
    const url = new URL(`${apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
    if (!options.validate) headers.set("authorization", `Bearer ${apiKey}`);
    if (options.body) headers.set("content-type", "application/json");
    const response = await fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const text = await readProviderTextBody(response, "issue_badge response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    const record = optionalRecord(payload);
    const message =
      [optionalRawString(record?.message), optionalRawString(record?.error)].filter(Boolean).join(": ") ||
      (!response.ok && payload === null ? text.trim().slice(0, 1000) : "") ||
      `IssueBadge request failed (HTTP ${response.status})`;
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (options.validate && optionalRecord(record?.data)?.valid === false) {
      throw new ProviderRequestError(400, message, undefined, "invalid_input");
    }
    if (record?.success === false) {
      throw new ProviderRequestError(502, message, undefined, "provider_error");
    }
    return requiredResponseRecord(payload, "IssueBadge");
  });
}

const handlers = mapProviderActionHandlers(
  "issue_badge",
  issueBadgeActions,
  (action) => async (values: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const apiKey = context.apiKey;
    const fetcher = context.fetcher;
    switch (action.name) {
      case "list_badges":
        return request("/badge/getall", apiKey, fetcher, undefined, context.signal);
      case "issue_badge":
        return request("/issue/create", apiKey, fetcher, { method: "POST", body: values }, context.signal);
      case "list_issued_badges":
        return request("/issue/get", apiKey, fetcher, { query: values }, context.signal);
      case "get_issued_badge": {
        const id = requiredInputString(values.id, "id");
        if (id === "." || id === "..") {
          throw new ProviderRequestError(400, "id cannot be a dot path segment", undefined, "invalid_input");
        }
        return request(`/issue/get/${encodeURIComponent(id)}`, apiKey, fetcher, undefined, context.signal);
      }
    }
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("issue_badge", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const payload = await request("/validate-key", requiredInputString(input.apiKey, "API Key"), fetcher, {
      method: "POST",
      body: { api_key: requiredInputString(input.apiKey, "API Key") },
      validate: true,
    });
    const data = optionalRecord(payload.data);
    if (data?.valid !== true) {
      throw new ProviderRequestError(
        502,
        "IssueBadge validation response omitted a valid result",
        undefined,
        "provider_error",
      );
    }
    return {
      profile: { displayName: "IssueBadge API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "issue_badge",
  baseUrl: apiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});
