import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { ploidActions } from "./actions.ts";
import { ploidEndpointByName } from "./actions.ts";
const baseUrl = "https://api.ploid.com";
async function request(
  apiKey: string,
  name: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const endpoint = ploidEndpointByName.get(name)!;
  let path = endpoint.path;
  for (const key of endpoint.pathKeys) {
    const value = String(input[key]);
    if (value === "." || value === "..") throw providerInputError(`${key} must not be a dot path segment`);
    path = path.replace(`{${key}}`, encodeURIComponent(value));
  }
  const url = new URL(path, baseUrl);
  for (const key of endpoint.queryKeys) {
    if (input[key] !== undefined) url.searchParams.set(key, String(input[key]));
  }
  if (name === "export_set") url.searchParams.set("format", "json");
  const body = optionalRecord(input.body);
  const data = name === "start_dataset" ? { ...body, mode: "async" } : body;
  const timeoutMs =
    name === "sync_people_search"
      ? 150000
      : name === "create_harness_chat_completion"
        ? 100000
        : name === "enrich_person"
          ? 90000
          : name === "create_dataset"
            ? 70000
            : undefined;
  return runProviderRequest({ label: "Ploid", timeoutMs, signal: parentSignal }, async (signal) => {
    const headers = new Headers({ authorization: `Bearer ${apiKey}`, accept: "application/json" });
    if (data !== undefined) headers.set("content-type", "application/json");
    const idempotencyKey = optionalString(input.idempotencyKey);
    if (idempotencyKey !== undefined) headers.set("Idempotency-Key", idempotencyKey);
    const response = await fetcher(url, {
      method: endpoint.method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {}
    }
    if (!response.ok) {
      const error = optionalRecord(optionalRecord(payload)?.error);
      const code = optionalString(error?.code);
      const message = optionalString(error?.message);
      const requestId = optionalString(error?.request_id);
      const detail = [code, message, requestId ? `request_id=${requestId}` : undefined].filter(Boolean).join(": ");
      throw new ProviderRequestError(
        response.status,
        `Ploid request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        undefined,
        code && ["invalid_api_key", "expired_api_key", "revoked_api_key"].includes(code)
          ? "authorization_failed"
          : code === "insufficient_scope"
            ? "authorization_failed"
            : "provider_error",
      );
    }
    if (
      name === "enrich_person" &&
      body?.response_format === "markdown" &&
      response.headers.get("content-type")?.includes("text/markdown")
    )
      return { markdown: text };
    if (name === "delete_monitor" && !text.trim()) return { success: true };
    if (name === "export_set" && Array.isArray(payload)) return { items: payload };
    const result = requiredResponseRecord(payload, "Ploid response");
    if (name === "get_person" || name === "get_person_run") {
      if (!("data" in result)) throw providerResponseError("Ploid person response is missing data");
      const person = optionalRecord(result.data);
      const runId = optionalString(person?.run_id);
      const pendingStatus = optionalString(person?.status);
      if (runId && !pendingStatus) throw providerResponseError("Ploid person run is missing status");
      return {
        ...result,
        status: runId ? pendingStatus : "completed",
        run_id: runId ?? (name === "get_person_run" ? String(input.id) : undefined),
      };
    }
    return result;
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  return request(apiKey, actionName, values, fetcher, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await request(input.apiKey, "get_account_profile", {}, fetcher, signal);
    const profile = requiredResponseRecord(result.data, "Ploid account profile");
    const name = [optionalString(profile.first_name), optionalString(profile.last_name)]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      profile: { displayName: name || optionalString(profile.email) || "Ploid API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "ploid",
  Object.fromEntries(
    ploidActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "ploid",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
