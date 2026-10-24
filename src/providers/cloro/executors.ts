import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { CloroEndpoint } from "./actions.ts";

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
import { cloroActions } from "./actions.ts";
import { cloroEndpointByName } from "./actions.ts";
const baseUrl = "https://api.cloro.dev";
async function request(
  apiKey: string,
  endpoint: Pick<CloroEndpoint, "path" | "method" | "timeoutMs" | "arrayField">,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Cloro", timeoutMs: endpoint.timeoutMs, signal: parentSignal }, async (signal) => {
    const url = new URL(endpoint.path.replace("{taskId}", encodeURIComponent(String(input.taskId))), baseUrl);
    if (endpoint.method === "GET") {
      for (const [key, value] of Object.entries(input)) {
        if (key !== "taskId" && value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await fetcher(url, {
      method: endpoint.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body:
        endpoint.method === "POST" ? JSON.stringify(endpoint.path.endsWith("/batch") ? input.tasks : input) : undefined,
      signal,
    });
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const error = optionalRecord(optionalRecord(body)?.error);
      const code = optionalString(error?.code);
      const message = optionalString(error?.message);
      const detail = [code, message].filter(Boolean).join(": ");
      const invalidCredential = code === "INVALID_OR_EXPIRED_API_KEY" || code === "INVALID_API_KEY_FORMAT";
      throw new ProviderRequestError(
        invalidCredential && validating ? 400 : response.status,
        `Cloro request failed (${response.status})${detail ? `: ${detail}` : ""}`,
        undefined,
        invalidCredential ? (validating ? "invalid_input" : "authorization_failed") : "provider_error",
      );
    }
    if (endpoint.arrayField) {
      if (!Array.isArray(body)) throw providerResponseError("Cloro response must be an array");
      return { [endpoint.arrayField]: body };
    }
    return requiredResponseRecord(body, "Cloro response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const endpoint = cloroEndpointByName.get(actionName);
  if (!endpoint) throw providerInputError(`Unknown Cloro action: ${actionName}`);
  return request(apiKey, endpoint, values, fetcher, undefined, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(input.apiKey, { path: "/v1/credits", method: "GET" }, {}, fetcher, true, signal);
    return { profile: { displayName: "Cloro API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "cloro",
  Object.fromEntries(
    cloroActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "cloro",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
