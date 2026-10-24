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
} from "../provider-runtime.ts";
import { fundableActions } from "./actions.ts";
import { fundableRoutes } from "./actions.ts";
const fundableApiBaseUrl = "https://www.tryfundable.ai/api/v1";
async function requestFundable(
  path: string,
  method: "GET" | "POST",
  parameters: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  validating = false,
  parentSignal?: AbortSignal,
) {
  const url = new URL(`${fundableApiBaseUrl}${path}`);
  if (method === "GET") {
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return runProviderRequest({ label: "fundable", signal: parentSignal }, async (signal) => {
    const headers = new Headers({ accept: "application/json", authorization: `Bearer ${apiKey}` });
    if (method === "POST") headers.set("content-type", "application/json");
    const response = await fetcher(url.toString(), {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(parameters) : undefined,
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        response.ok ? "fundable returned malformed JSON" : `fundable request failed (${response.status})`,
        undefined,
        "provider_error",
      );
    }
    const object = optionalRecord(payload);
    if (!response.ok || object?.success === false || object?.error != null) {
      const error = optionalRecord(object?.error);
      const code = optionalString(error?.code);
      const message =
        optionalString(error?.message) ??
        optionalString(object?.error) ??
        optionalString(object?.message) ??
        `fundable request failed (${response.status})`;
      const detail = code ? `${code}: ${message}` : message;
      if (code === "INVALID_API_KEY" || code === "INACTIVE_API_KEY") {
        throw new ProviderRequestError(
          validating ? 400 : 409,
          detail,
          undefined,
          validating ? "invalid_input" : "authorization_failed",
        );
      }
      throw new ProviderRequestError(response.ok ? 502 : response.status, detail, undefined, "provider_error");
    }
    return requiredResponseRecord(payload, "Fundable response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const route = fundableRoutes[actionName];
  if (!route) throw providerInputError("Unknown action route");
  const path = route.path.replace("{id}", encodeURIComponent(String(values.id)));
  const parameters = { ...values };
  if (route.path.includes("{id}")) delete parameters.id;
  return requestFundable(path, route.method, parameters, apiKey, fetcher, undefined, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestFundable("/industry/search", "GET", { name: "software" }, input.apiKey, fetcher, true, signal);
    return { profile: { displayName: "Fundable API Key" }, grantedScopes: [], metadata: {} };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "fundable",
  Object.fromEntries(
    fundableActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "fundable",
  baseUrl: fundableApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
