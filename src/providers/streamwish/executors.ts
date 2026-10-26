import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { streamwishActions, streamwishEndpoints } from "./actions.ts";

const baseUrl = "https://api.streamwish.com/api";
async function request(
  path: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", apiKey);
  return runProviderRequest({ signal: parentSignal, label: "StreamWish" }, async (signal) => {
    const response = await fetcher(url, { headers: { accept: "application/json" }, signal });
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    const payload = optionalRecord(body);
    const status = optionalNumber(payload?.status);
    if (!response.ok || status !== 200) {
      const message = optionalString(payload?.msg) ?? "Invalid or unsuccessful response";
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `StreamWish (${status ?? response.status}): ${message.replaceAll(apiKey, "[REDACTED]")}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(payload, "StreamWish response");
  });
}

async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const endpoint = streamwishEndpoints.find(({ action }) => action.name === actionName);
  if (!endpoint) throw providerInputError(`Unknown StreamWish action: ${actionName}`);
  return request(endpoint.path, values, context.apiKey, context.fetcher, context.signal);
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "streamwish",
  Object.fromEntries(
    streamwishActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await request("/account/info", {}, input.apiKey, fetcher, signal);
    const account = requiredResponseRecord(payload.result, "StreamWish account");
    return {
      profile: { displayName: optionalString(account.login) ?? "StreamWish API Key" },
      grantedScopes: [],
      metadata: {},
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "streamwish",
  baseUrl,
  auth: { type: "api_key_query", name: "key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
