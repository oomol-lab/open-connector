import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "intrinio";
const apiBaseUrl = "https://api-v2.intrinio.com";

const handlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async search_companies(input, context) {
    const payload = await requestIntrinio("/companies/search", context, {
      query: input.query,
      active: input.active,
      mode: input.mode,
      page_size: input.pageSize,
    });
    return { companies: payload.companies };
  },
  async lookup_company(input, context) {
    const identifier = requiredString(input.identifier, "identifier");
    return { company: await requestIntrinio(`/companies/${encodePathSegment(identifier)}`, context) };
  },
  async lookup_security(input, context) {
    const identifier = requiredString(input.identifier, "identifier");
    return { security: await requestIntrinio(`/securities/${encodePathSegment(identifier)}`, context) };
  },
  async get_security_stock_prices(input, context) {
    const identifier = requiredString(input.identifier, "identifier");
    const payload = await requestIntrinio(`/securities/${encodePathSegment(identifier)}/prices`, context, {
      start_date: input.startDate,
      end_date: input.endDate,
      frequency: input.frequency,
      page_size: input.pageSize,
      next_page: input.nextPage,
    });
    return { stockPrices: payload.stock_prices, security: payload.security, nextPage: payload.next_page };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    await requestIntrinio("/account/current_usage", context);
    const result: CredentialValidationResult = {
      profile: { accountId: "api_key", displayName: "Intrinio API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl, validationEndpoint: "/account/current_usage" },
    };
    return result;
  },
};

async function requestIntrinio(
  path: string,
  context: ApiKeyProviderContext,
  query: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const url = new URL(path, apiBaseUrl);
  for (const [name, value] of Object.entries(query)) if (value != null) url.searchParams.set(name, String(value));
  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Intrinio request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "Intrinio returned malformed JSON");
      payload = { message: text };
    }
  }
  const record = optionalRecord(payload);
  if (response.ok && !record) throw new ProviderRequestError(502, "Intrinio returned non-object JSON");
  if (!response.ok) {
    const message = optionalString(record?.message) ?? optionalString(record?.error) ?? "Intrinio request failed";
    throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
  }
  return record ?? {};
}
