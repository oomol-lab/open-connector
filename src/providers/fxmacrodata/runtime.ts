import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const fxmacrodataApiBaseUrl = "https://api.fxmacrodata.com";

interface FxmacrodataContext {
  apiKey?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface FxmacrodataRequest {
  context: FxmacrodataContext;
  path: string;
  query?: Record<string, string | number | undefined>;
}

type FxmacrodataActionHandler = (input: Record<string, unknown>, context: FxmacrodataContext) => Promise<unknown>;

export const fxmacrodataActionHandlers: ProviderActionHandlers<"fxmacrodata", FxmacrodataActionHandler> = {
  async get_announcements(input, context) {
    return requestFxmacrodata({
      context,
      path: `/v1/announcements/${currencyCode(input.currency, "currency")}/${indicatorSlug(input.indicator)}`,
      query: dateWindow(input),
    });
  },
  async get_latest_announcements(input, context) {
    return requestFxmacrodata({
      context,
      path: `/v1/announcements/${currencyCode(input.currency, "currency")}/latest`,
    });
  },
  async get_release_calendar(input, context) {
    return requestFxmacrodata({
      context,
      path: `/v1/calendar/${currencyCode(input.currency, "currency")}`,
      query: {
        indicator: input.indicator === undefined ? undefined : indicatorSlug(input.indicator),
        start_date: optionalString(input.startDate),
        end_date: optionalString(input.endDate),
      },
    });
  },
  async get_data_catalogue(input, context) {
    return requestFxmacrodata({
      context,
      path: `/v1/data_catalogue/${currencyCode(input.currency, "currency")}`,
    });
  },
  async get_forex(input, context) {
    return requestFxmacrodata({
      context,
      path: `/v1/forex/${currencyCode(input.base, "base")}/${currencyCode(input.quote, "quote")}`,
      query: dateWindow(input),
    });
  },
  async get_cot(input, context) {
    return requestFxmacrodata({
      context,
      path: `/v1/cot/${currencyCode(input.currency, "currency")}`,
      query: dateWindow(input),
    });
  },
};

/**
 * Build the action context. A no_auth connection has no key and reaches the keyless USD data only.
 */
export async function createFxmacrodataContext(
  context: ExecutionContext,
  fetcher: ProviderFetch,
): Promise<FxmacrodataContext> {
  const credential = await context.getCredential("fxmacrodata");
  return {
    apiKey: credential?.authType === "api_key" ? credential.apiKey : undefined,
    fetcher,
    signal: context.signal,
  };
}

/**
 * Validate a key against the USD indicator catalogue, which answers without a key
 * but rejects a key it does not recognise.
 */
export async function validateFxmacrodataCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await requestFxmacrodata({
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    path: "/v1/data_catalogue/usd",
  });
  return {
    profile: { displayName: "FXMacroData API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: fxmacrodataApiBaseUrl, validationEndpoint: "/v1/data_catalogue/usd" },
  };
}

/**
 * Read an FXMacroData error response and map it onto the runtime's status conventions.
 * The API answers a keyless request for data that needs a key with a 401 and the code
 * api_key_required; that is reported as invalid input, not as a credential to reconnect,
 * for actions and the proxy alike. Other authorization failures retain the upstream status without guessing that
 * reconnecting will help. Known keys are removed from diagnostic messages.
 */
export async function readFxmacrodataError(response: Response, apiKey?: string): Promise<ProviderRequestError> {
  const status = response.status;
  const payload = parseProviderJsonBodyText(await readProviderErrorTextBody(response, "FXMacroData error response"), {
    emptyBody: {},
    invalidJsonMessage: "FXMacroData returned malformed JSON",
    invalidJsonFallback: () => ({}),
  });
  const body = optionalRecord(payload);
  const upstreamMessage =
    optionalString(body?.detail) ?? optionalString(body?.message) ?? `FXMacroData request failed with HTTP ${status}`;
  const message = apiKey ? upstreamMessage.replaceAll(apiKey, "[REDACTED]") : upstreamMessage;
  const containsApiKey = apiKey && JSON.stringify(payload).includes(JSON.stringify(apiKey).slice(1, -1));
  const details = withRetryAfterSeconds(response, containsApiKey ? {} : payload);
  if ((status === 401 || status === 403) && optionalString(body?.code) === "api_key_required") {
    return new ProviderRequestError(400, message, details);
  }
  return new ProviderRequestError(status, message, details, status === 429 ? "rate_limited" : "provider_error");
}

/**
 * Check the key before it goes into a header. The platform's own error for an invalid
 * header value quotes the value, so a malformed key is refused here without echoing it.
 */
function apiKeyHeaderValue(apiKey: string): string {
  if (!/^[!-~]+$/.test(apiKey)) {
    throw providerInputError("The FXMacroData API key contains characters that are not valid in an HTTP header.");
  }
  return apiKey;
}

function currencyCode(value: unknown, fieldName: string): string {
  const code = requiredInputString(value, fieldName).toLowerCase();
  if (!/^[a-z]{3}$/.test(code)) {
    throw providerInputError(`${fieldName} must be a three-letter currency code.`);
  }
  return code;
}

function indicatorSlug(value: unknown): string {
  const slug = requiredInputString(value, "indicator").toLowerCase();
  if (!/^[a-z0-9_]+$/.test(slug)) {
    throw providerInputError("indicator must be a slug such as inflation or policy_rate.");
  }
  return slug;
}

function dateWindow(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    start_date: optionalString(input.startDate),
    end_date: optionalString(input.endDate),
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  };
}

async function requestFxmacrodata(input: FxmacrodataRequest): Promise<Record<string, unknown>> {
  const { context } = input;
  const url = new URL(`${fxmacrodataApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }
  const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
  if (context.apiKey) headers.set("x-api-key", apiKeyHeaderValue(context.apiKey));
  return runProviderRequest({ signal: context.signal, label: "FXMacroData" }, async (signal) => {
    // context.fetcher follows redirects itself and drops X-API-Key on any change of origin or scheme.
    const response = await context.fetcher(url, { method: "GET", headers, signal });
    if (!response.ok) {
      throw await readFxmacrodataError(response, context.apiKey);
    }
    const payload = parseProviderJsonBodyText(await readProviderTextBody(response, "FXMacroData response"), {
      emptyBody: {},
      invalidJsonMessage: "FXMacroData returned malformed JSON",
    });
    return requiredResponseRecord(payload, "FXMacroData response");
  });
}
