import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "countdown_api";
const countdownApiBaseUrl = "https://api.countdownapi.com";

type CountdownApiRequestPhase = "validate" | "execute";

interface CountdownApiContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CountdownApiActionHandler = (input: Record<string, unknown>, context: CountdownApiContext) => Promise<unknown>;

const countdownApiActionHandlers: ProviderActionHandlers<"countdown_api", CountdownApiActionHandler> = {
  get_account(_input, context) {
    return getAccount(context);
  },
  autocomplete(input, context) {
    return autocomplete(input, context);
  },
  search_products(input, context) {
    return searchProducts(input, context);
  },
  get_product(input, context) {
    return getProduct(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, countdownApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestCountdownApiJson({
      path: "/account",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    if (!isCountdownApiPayloadSuccessful(payload)) {
      throw new ProviderRequestError(
        400,
        extractCountdownApiMessage(payload) ?? "Countdown API credential validation failed",
        payload,
      );
    }

    const accountInfo = optionalRecord(payload.account_info);
    return {
      profile: {
        accountId: optionalString(accountInfo?.email) ?? "api_key",
        displayName: optionalString(accountInfo?.email) ?? optionalString(accountInfo?.name) ?? "Countdown API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: countdownApiBaseUrl,
        validationEndpoint: "/account",
        plan: optionalString(accountInfo?.plan),
        creditsRemaining:
          typeof accountInfo?.credits_remaining === "number" ? accountInfo.credits_remaining : undefined,
        creditsLimit: typeof accountInfo?.credits_limit === "number" ? accountInfo.credits_limit : undefined,
        collectionsAvailable:
          typeof accountInfo?.collections_available === "number" ? accountInfo.collections_available : undefined,
      }),
    };
  },
};

async function getAccount(context: CountdownApiContext): Promise<unknown> {
  const payload = await requestCountdownApiJson({ path: "/account", ...context, phase: "execute" });
  return wrapCountdownApiPayload(payload);
}

async function autocomplete(input: Record<string, unknown>, context: CountdownApiContext): Promise<unknown> {
  const payload = await requestCountdownApiJson({
    path: "/request",
    ...context,
    params: compactObject({
      type: "autocomplete",
      "ebay domain": readRequiredString(input.ebay_domain, "ebay_domain"),
      "search term": readRequiredString(input.search_term, "search_term"),
    }),
    phase: "execute",
  });
  return wrapCountdownApiPayload(payload);
}

async function searchProducts(input: Record<string, unknown>, context: CountdownApiContext): Promise<unknown> {
  if (!optionalString(input.search_term) && !optionalString(input.ebay_url)) {
    throw new ProviderRequestError(400, "search_term or ebay_url is required.");
  }
  const num = optionalInteger(input.num);
  if (num !== undefined && num !== 60 && num !== 120 && num !== 240) {
    throw new ProviderRequestError(400, "num must be 60, 120, or 240.");
  }

  const payload = await requestCountdownApiJson({
    path: "/request",
    ...context,
    params: compactObject({
      type: "search",
      "ebay domain": optionalStringValue(input.ebay_domain),
      "search term": optionalStringValue(input.search_term),
      url: optionalStringValue(input.ebay_url),
      page: optionalIntegerString(input.page),
      "max page": optionalIntegerString(input.max_page),
      "category id": optionalStringValue(input.category_id),
      "listing type": optionalStringValue(input.listing_type),
      condition: optionalStringValue(input.condition),
      "sort by": optionalStringValue(input.sort_by),
      num: optionalIntegerString(input.num),
      facets: optionalStringValue(input.facets),
      "sold items": optionalBooleanString(input.sold_items),
      "completed items": optionalBooleanString(input.completed_items),
      "authorized sellers": optionalBooleanString(input.authorized_sellers),
      "returns accepted": optionalBooleanString(input.returns_accepted),
      "free returns": optionalBooleanString(input.free_returns),
      "authenticity verified": optionalBooleanString(input.authenticity_verified),
      "deals and savings": optionalBooleanString(input.deals_and_savings),
      "sale items": optionalBooleanString(input.sale_items),
      "allow rewritten results": optionalBooleanString(input.allow_rewritten_results),
      "customer location": optionalStringValue(input.customer_location),
      "customer zipcode": optionalStringValue(input.customer_zipcode),
      "include fields": optionalStringValue(input.include_fields),
      "exclude fields": optionalStringValue(input.exclude_fields),
    }),
    phase: "execute",
  });
  return wrapCountdownApiPayload(payload);
}

async function getProduct(input: Record<string, unknown>, context: CountdownApiContext): Promise<unknown> {
  if (!optionalString(input.epid) && !optionalString(input.gtin) && !optionalString(input.ebay_url)) {
    throw new ProviderRequestError(400, "epid, gtin, or ebay_url is required.");
  }

  const payload = await requestCountdownApiJson({
    path: "/request",
    ...context,
    params: compactObject({
      type: "product",
      "ebay domain": optionalStringValue(input.ebay_domain),
      epid: optionalStringValue(input.epid),
      gtin: optionalStringValue(input.gtin),
      url: optionalStringValue(input.ebay_url),
      "skip gtin cache": optionalBooleanString(input.skip_gtin_cache),
      "include parts compatibility": optionalBooleanString(input.include_parts_compatibility),
      "customer location": optionalStringValue(input.customer_location),
      "customer zipcode": optionalStringValue(input.customer_zipcode),
      "include fields": optionalStringValue(input.include_fields),
      "exclude fields": optionalStringValue(input.exclude_fields),
    }),
    phase: "execute",
  });
  return wrapCountdownApiPayload(payload);
}

async function requestCountdownApiJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: CountdownApiRequestPhase;
  signal?: AbortSignal;
  params?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildCountdownApiUrl(input.path, input.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readCountdownApiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Countdown API request failed: ${error.message}` : "Countdown API request failed",
    );
  }

  if (!response.ok) {
    throw createCountdownApiError(response, payload, input.phase);
  }

  return normalizePayloadObject(payload);
}

function buildCountdownApiUrl(path: string, apiKey: string, params: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, countdownApiBaseUrl);
  url.searchParams.set("api key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readCountdownApiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `Countdown API returned malformed JSON: ${text.slice(0, 200)}`);
  }
}

function normalizePayloadObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (record) {
    return record;
  }
  if (typeof payload === "string") {
    return { message: payload };
  }
  return {};
}

function wrapCountdownApiPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const successful = isCountdownApiPayloadSuccessful(payload);
  return compactObject({
    data: payload,
    error: successful ? undefined : extractCountdownApiMessage(payload),
    successful,
  });
}

function isCountdownApiPayloadSuccessful(payload: Record<string, unknown>): boolean {
  const requestInfo = optionalRecord(payload.request_info);
  return requestInfo?.success === true;
}

function createCountdownApiError(
  response: Response,
  payload: unknown,
  phase: CountdownApiRequestPhase,
): ProviderRequestError {
  const message = extractCountdownApiMessage(payload) ?? `Countdown API request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && response.status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractCountdownApiMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const requestInfo = optionalRecord(record.request_info);
  return optionalString(requestInfo?.message) ?? optionalString(record.message) ?? optionalString(record.error);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function optionalStringValue(value: unknown): string | undefined {
  return optionalString(value);
}

function optionalIntegerString(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function optionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}
