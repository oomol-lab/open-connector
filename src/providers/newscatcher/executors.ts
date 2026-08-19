import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderActionSources } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionSources,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "newscatcher";
const baseUrl = "https://v3-api.newscatcherapi.com";
const paths: ProviderActionSources<"newscatcher", string> = {
  search_articles: "/api/search",
  get_latest_headlines: "/api/latest_headlines",
  list_sources: "/api/sources",
  get_subscription: "/api/subscription",
};

async function request(
  path: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetcher(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
      "x-api-token": apiKey,
    },
    body: JSON.stringify(input),
    signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "NewsCatcher returned invalid JSON");
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ?? `NewsCatcher request failed with ${response.status}`,
      payload,
    );
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "NewsCatcher returned a non-object JSON response", payload);
  return record;
}

const handlers: ProviderActionHandlers<
  "newscatcher",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = mapProviderActionSources(
  service,
  paths,
  (_name, path) => (input, context) => request(path, input, context.apiKey, context.fetcher, context.signal),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "x-api-token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const subscription = await request(paths.get_subscription, {}, input.apiKey, fetcher, signal);
    const plan = optionalString(subscription.plan);
    return {
      profile: { accountId: "api_key", displayName: plan ? `NewsCatcher ${plan}` : "NewsCatcher API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: paths.get_subscription, plan: plan ?? null },
    };
  },
};
