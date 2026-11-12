import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const service = "veille";
const apiBaseUrl = "https://api.veille.io";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const veilleActionHandlers: ProviderActionHandlers<"veille", Handler> = {
  async verify_email(input, context) {
    return objectPayload(
      await veilleRequest("/v1/intelligence/emailq", context, { query: requiredInputString(input.email, "email") }),
      "Veille verify_email",
    );
  },
  async check_email(input, context) {
    return objectPayload(
      await veilleRequest("/v1/intelligence/email", context, { query: requiredInputString(input.email, "email") }),
      "Veille check_email",
    );
  },
  async validate_phone(input, context) {
    return objectPayload(
      await veilleRequest("/v1/intelligence/phone", context, { query: requiredInputString(input.phone, "phone") }),
      "Veille validate_phone",
    );
  },
  async check_ip(input, context) {
    return objectPayload(
      await veilleRequest("/v1/intelligence/ip", context, { query: requiredInputString(input.ip, "ip") }),
      "Veille check_ip",
    );
  },
  async check_domain(input, context) {
    return objectPayload(
      await veilleRequest("/v1/intelligence/domain", context, { query: requiredInputString(input.domain, "domain") }),
      "Veille check_domain",
    );
  },
  async verify_vat(input, context) {
    return objectPayload(
      await veilleRequest("/v1/vat", context, { query: requiredInputString(input.vatNumber, "vatNumber") }),
      "Veille verify_vat",
    );
  },
  async validate_iban(input, context) {
    return objectPayload(
      await veilleRequest("/v1/vat/iban", context, { query: requiredInputString(input.iban, "iban") }),
      "Veille validate_iban",
    );
  },
  async get_exchange_rates(input, context) {
    return objectPayload(
      await veilleRequest("/v1/vat/rates", context, {
        base: optionalString(input.base),
        symbols: optionalString(input.symbols),
      }),
      "Veille get_exchange_rates",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, veilleActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const usage = objectPayload(
      await veilleRequest("/v1/usage", { apiKey: input.apiKey, fetcher, signal }, {}, "validate"),
      "Veille usage",
    );
    const account = optionalRecord(usage.account);
    const slug = optionalString(account?.slug);
    return {
      profile: {
        accountId: slug ? `veille:account:${slug}` : "veille-api-key",
        displayName: optionalString(account?.name) ?? "Veille API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v1/usage",
        remaining: optionalNumber(usage.remaining),
      },
    };
  },
};

async function veilleRequest(
  path: string,
  context: RequestContext,
  query: Record<string, QueryValue> = {},
  phase: ProviderRequestPhase = "execute",
  body?: unknown,
): Promise<unknown> {
  try {
    return await requestJson({
      providerName: "Veille",
      baseUrl: apiBaseUrl,
      path,
      fetcher: context.fetcher,
      signal: context.signal,
      query,
      phase,
      body,
      headers: { "x-api-key": context.apiKey },
    });
  } catch (error) {
    // Veille answers an exceeded rate limit with 401, which would otherwise read as a rejected key.
    if (error instanceof ProviderRequestError && error.status === 401 && /rate limit/i.test(error.message)) {
      throw new ProviderRequestError(429, error.message, error.details);
    }
    throw error;
  }
}
