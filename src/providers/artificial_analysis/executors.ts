import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { artificialAnalysisActions, artificialAnalysisEndpointByName } from "./actions.ts";
const baseUrl = "https://artificialanalysis.ai/api/v2";
async function request(
  apiKey: string,
  path: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ signal: parentSignal, label: "Artificial Analysis" }, async (signal) => {
    const url = new URL(`${baseUrl}${path.replace("{slug}", encodeURIComponent(String(input.slug)))}`);
    for (const [key, value] of Object.entries(input)) {
      if (key !== "slug" && value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetcher(url, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal,
    });
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const message = optionalString(optionalRecord(body)?.error);
      throw new ProviderRequestError(
        response.status,
        `Artificial Analysis request failed (${response.status})${message ? `: ${message}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(body, "Artificial Analysis response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const endpoint = artificialAnalysisEndpointByName.get(actionName);
  if (!endpoint) throw providerInputError(`Unknown Artificial Analysis action: ${actionName}`);
  return request(context.apiKey, endpoint.path, values, context.fetcher, context.signal);
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "artificial_analysis",
  Object.fromEntries(
    artificialAnalysisActions.map((action) => [
      action.name,
      (values, context) => execute(action.name, values, context),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request(input.apiKey, "/language/models/free", { page: 1 }, fetcher, signal);
    return {
      profile: { displayName: "Artificial Analysis API Key" },
      grantedScopes: [],
      metadata: {},
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "artificial_analysis",
  baseUrl: baseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries({ accept: "application/json" }))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
