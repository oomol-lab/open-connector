import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { smoothActions } from "./actions.ts";

const baseUrl = "https://api.smooth.sh/api/v1";
const defaultHeaders = { accept: "application/json" };
interface SmoothRequest {
  url: URL;
  method: string;
  apiKey: string;
  body: Record<string, unknown> | undefined;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ url, method, apiKey, body, fetcher, parentSignal }: SmoothRequest) {
  return runProviderRequest({ signal: parentSignal, label: "Smooth" }, async (signal) => {
    const response = await fetcher(url.toString(), {
      method,
      headers: { ...defaultHeaders, apikey: apiKey, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    let payload: Record<string, unknown>;
    try {
      payload = requiredResponseRecord(await response.json(), "Smooth response");
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        "Smooth returned an invalid JSON response",
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const detail = optionalRawString(payload.detail);
      throw new ProviderRequestError(
        response.status,
        `Smooth request failed${detail ? `: ${detail.split(apiKey).join("[REDACTED]")}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return payload.r;
  });
}
const handlers = mapProviderActionHandlers(
  "smooth",
  smoothActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const values = dataInput;
    const url = new URL(
      `${baseUrl}/${action.name.endsWith("profile") || action.name.endsWith("profiles") ? "profile" : "task"}`,
    );
    const id = values.task_id ?? values.profile_id;
    if (action.name === "get_task" || action.name === "cancel_task" || action.name === "delete_profile") {
      const segment = String(id);
      if (segment === "." || segment === "..")
        throw new ProviderRequestError(400, "Resource ID must not be a dot segment", undefined, "invalid_input");
      url.pathname += `/${encodeURIComponent(segment)}`;
    }
    const method =
      action.name === "submit_task" || action.name === "create_profile"
        ? "POST"
        : action.name === "cancel_task" || action.name === "delete_profile"
          ? "DELETE"
          : "GET";
    if (action.name === "get_task" || action.name === "list_tasks") {
      for (const key of action.name === "get_task" ? ["event_t", "downloads"] : ["t", "l"]) {
        if (values[key] !== undefined) url.searchParams.set(key, String(values[key]));
      }
    }
    const result = await request({
      url: url,
      method: method,
      apiKey: context.apiKey,
      body: method === "POST" ? values : undefined,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
    if (action.name === "list_tasks" || action.name === "list_profiles") {
      if (!Array.isArray(result))
        throw new ProviderRequestError(502, "Smooth returned an invalid list", undefined, "provider_error");
      return action.name === "list_tasks" ? { tasks: result } : { profiles: result };
    }
    if (method === "DELETE") {
      if (typeof result !== "boolean")
        throw new ProviderRequestError(502, "Smooth returned an invalid operation result", undefined, "provider_error");
      return { success: result };
    }
    const object = requiredResponseRecord(result, "Smooth response result");
    if (!optionalRawString(object.id)?.trim())
      throw new ProviderRequestError(502, "Smooth response is missing an ID", undefined, "provider_error");
    if (action.name !== "create_profile" && !optionalRawString(object.status)?.trim())
      throw new ProviderRequestError(502, "Smooth task is missing status", undefined, "provider_error");
    return object;
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("smooth", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "API Key");
    return {
      profile: { displayName: "Smooth API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_key" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "smooth",
  baseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
