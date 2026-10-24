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
import { amazingMarvinActions } from "./actions.ts";
const baseUrl = "https://serv.amazingmarvin.com/api";
const endpoints: Record<string, string> = {
  create_task: "/addTask",
  create_project: "/addProject",
  complete_task: "/markDone",
  list_today_items: "/todayItems",
  list_done_items: "/doneItems",
  list_due_items: "/dueItems",
  list_children: "/children",
  list_categories: "/categories",
  list_labels: "/labels",
};
async function request(
  endpoint: string,
  method: "GET" | "POST",
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Amazing Marvin" }, async (signal) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    const headers = new Headers({
      "X-API-Token": apiKey,
      accept: "application/json",
      "user-agent": providerUserAgent,
    });
    const { autoComplete, ...body } = input;
    if (autoComplete !== undefined) headers.set("X-Auto-Complete", String(autoComplete));
    if (method === "GET") {
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    } else {
      headers.set("content-type", "application/json");
    }
    const response = await fetcher(url.toString(), {
      method,
      headers,
      signal,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const text = await readProviderTextBody(response, "amazing_marvin response", undefined, signal);
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (response.ok && (method === "GET" || response.headers.get("content-type")?.includes("json"))) {
          throw new ProviderRequestError(502, "Amazing Marvin returned invalid JSON", undefined, "provider_error");
        }
        payload = text;
      }
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message =
        optionalRawString(record?.message) ?? optionalRawString(record?.error) ?? optionalRawString(payload);
      throw new ProviderRequestError(
        response.status,
        message ? `Amazing Marvin: ${message}` : `Amazing Marvin request failed (${response.status})`,
        undefined,
        "provider_error",
      );
    }
    return payload;
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "amazing_marvin",
  mapProviderActionHandlers(
    "amazing_marvin",
    amazingMarvinActions,
    (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      const method = action.operationType === "read" ? "GET" : "POST";
      const payload = await request(
        endpoints[action.name]!,
        method,
        input,
        context.apiKey,
        context.fetcher,
        context.signal,
      );
      if (method === "GET") {
        if (!Array.isArray(payload)) {
          throw new ProviderRequestError(
            502,
            "Amazing Marvin returned an invalid item list",
            undefined,
            "provider_error",
          );
        }
        return { items: payload };
      }
      return { result: payload };
    },
  ),
  { skipDnsValidation: true },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const payload = requiredResponseRecord(
      await request("/me", "GET", {}, requiredInputString(input.apiKey, "API Key"), fetcher),
      "Amazing Marvin account",
    );
    return {
      profile: { displayName: optionalRawString(payload.email) ?? "Amazing Marvin Account" },
      grantedScopes: [],
      metadata: { validationEndpoint: "/api/me" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "amazing_marvin",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-Token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [key, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(key)) headers.set(key, value);
  },
});
