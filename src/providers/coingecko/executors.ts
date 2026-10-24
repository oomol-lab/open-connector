import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionSources } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  coingeckoAuthHeader,
  coingeckoBaseUrl,
  coingeckoRoutes,
  executeCoingeckoAction,
  resolveCoingeckoPlan,
  validateCoingeckoCredential,
} from "./runtime.ts";

const service = "coingecko";

interface CoingeckoContext {
  apiKey: string;
  plan: "demo" | "pro";
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CoingeckoHandler = (input: Record<string, unknown>, context: CoingeckoContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"coingecko", CoingeckoHandler> = mapProviderActionSources(
  service,
  coingeckoRoutes,
  (actionName) => (input, context) =>
    executeCoingeckoAction(
      {
        apiKey: context.apiKey,
        actionName,
        input,
        providerMetadata: { plan: context.plan },
      },
      context.fetcher,
      context.signal,
    ),
);

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CoingeckoContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      plan: resolveCoingeckoPlan(credential.values.plan),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return coingeckoBaseUrl(resolveCoingeckoPlan(credential.values.plan));
  },
  auth: {
    type: "credential_headers",
    headers: [
      { name: "x-cg-demo-api-key", source: { type: "api_key" } },
      { name: "x-cg-pro-api-key", source: { type: "api_key" } },
    ],
  },
  skipDnsValidation: true,
  async customizeRequest({ credential, headers }) {
    const plan = resolveCoingeckoPlan(credential?.authType === "api_key" ? credential.values.plan : undefined);
    const selectedHeader = coingeckoAuthHeader(plan);
    const otherHeader = selectedHeader === "x-cg-demo-api-key" ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
    headers.delete(otherHeader);
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCoingeckoCredential({ apiKey: input.apiKey, plan: input.values.plan }, fetcher, signal);
  },
};
