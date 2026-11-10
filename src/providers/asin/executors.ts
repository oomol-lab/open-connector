import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalInteger, optionalNumber, optionalString } from "../../core/cast.ts";
import { objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { requiredInputString } from "../provider-runtime.ts";

const service = "asin";
const apiBaseUrl = "https://www.asin.dev/api/v1";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const asinActionHandlers: ProviderActionHandlers<"asin", Handler> = {
  async search_products(input, context) {
    return objectPayload(
      await asinRequest("/search", context, {
        query: requiredInputString(input.query, "query"),
        marketplace: optionalString(input.marketplace),
      }),
      "Asin search_products",
    );
  },
  async read_offers(input, context) {
    return objectPayload(
      await asinRequest("/offers", context, {}, "execute", {
        asin: requiredInputString(input.asin, "asin"),
        marketplace: optionalString(input.marketplace),
      }),
      "Asin read_offers",
    );
  },
  async get_offers(input, context) {
    return objectPayload(
      await asinRequest("/offers", context, {
        asin: requiredInputString(input.asin, "asin"),
        marketplace: optionalString(input.marketplace),
      }),
      "Asin get_offers",
    );
  },
  async get_price_history(input, context) {
    return objectPayload(
      await asinRequest("/history", context, {
        asin: requiredInputString(input.asin, "asin"),
        marketplace: optionalString(input.marketplace),
        days: optionalInteger(input.days),
      }),
      "Asin get_price_history",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, asinActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = objectPayload(
      await asinRequest("/account", { apiKey: input.apiKey, fetcher, signal }, {}, "validate"),
      "Asin account",
    );
    const plan = optionalString(account.plan_name) ?? optionalString(account.plan);
    return {
      profile: {
        accountId: "asin-api-key",
        displayName: plan ? `Asin (${plan})` : "Asin API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/account",
        plan: optionalString(account.plan),
        credits: optionalNumber(account.credits),
      },
    };
  },
};

function asinRequest(
  path: string,
  context: RequestContext,
  query: Record<string, QueryValue> = {},
  phase: ProviderRequestPhase = "execute",
  body?: unknown,
): Promise<unknown> {
  return requestJson({
    providerName: "Asin",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    phase,
    body,
    headers: { authorization: `Bearer ${context.apiKey}` },
  });
}
