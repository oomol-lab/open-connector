import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalNumber, optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const allratestodayApiBaseUrl = "https://allratestoday.com/api/open";

const defaultBase = "USD";

export interface AllRatesTodayRuntimeContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type AllRatesTodayActionHandler = (
  input: Record<string, unknown>,
  context: AllRatesTodayRuntimeContext,
) => Promise<unknown>;

interface LatestRates {
  base: string;
  date: string;
  last_updated: string | undefined;
  next_update: string | undefined;
  rates: Record<string, number>;
  source: string | undefined;
  attribution: string | undefined;
}

export const allratestodayActionHandlers: ProviderActionHandlers<"allratestoday", AllRatesTodayActionHandler> = {
  async get_latest_rates(input, context) {
    const latest = await requestLatest(
      input.base === undefined ? defaultBase : currencyCode(input.base, "base"),
      context,
    );
    if (!Array.isArray(input.symbols)) return latest;
    const rates: Record<string, number> = {};
    const missing: string[] = [];
    for (const value of input.symbols) {
      const code = currencyCode(value, "symbols");
      const rate = latest.rates[code];
      if (rate === undefined) missing.push(code);
      else rates[code] = rate;
    }
    if (missing.length > 0) {
      throw providerInputError(`AllRatesToday open rates do not include ${missing.join(", ")}.`);
    }
    return { ...latest, rates };
  },
  async convert(input, context) {
    const from = currencyCode(input.from, "from");
    const to = currencyCode(input.to, "to");
    const amount = optionalNumber(input.amount) ?? 1;
    const latest = await requestLatest(from, context);
    const rate = from === to ? 1 : latest.rates[to];
    // A currency outside the ECB set is absent from the map; never report it as a zero rate.
    if (rate === undefined) {
      throw providerInputError(`AllRatesToday open rates do not include ${to}.`);
    }
    const result = amount * rate;
    if (!Number.isFinite(result)) throw providerInputError("The converted amount is too large to represent.");
    return { from, to, amount, rate, result, date: latest.date, attribution: latest.attribution };
  },
};

function currencyCode(value: unknown, fieldName: string): string {
  const code = requiredInputString(value, fieldName).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw providerInputError(`${fieldName} must be a three-letter currency code such as USD.`);
  }
  return code;
}

async function requestLatest(base: string, context: AllRatesTodayRuntimeContext): Promise<LatestRates> {
  const url = new URL(`${allratestodayApiBaseUrl}/latest/${base}`);
  const payload = await runProviderRequest({ label: "AllRatesToday", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw await readAllRatesTodayError(response);
    }
    return parseProviderJsonBodyText(await readProviderTextBody(response, "AllRatesToday response"), {
      emptyBody: {},
      invalidJsonMessage: "AllRatesToday returned malformed JSON",
    });
  });
  const body = requiredResponseRecord(payload, "AllRatesToday response");
  if (body.result !== "success") {
    throw providerResponseError(optionalRawString(body.message) ?? "AllRatesToday returned an error result");
  }
  const table = optionalRecord(body.rates);
  if (table === undefined) {
    throw providerResponseError("AllRatesToday response has no rates table");
  }
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(table)) {
    const rate = optionalNumber(value);
    if (rate !== undefined && Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }
  return {
    base: optionalString(body.base_code) ?? base,
    date: optionalString(body.date) ?? "",
    last_updated: optionalString(body.time_last_update_utc),
    next_update: optionalString(body.time_next_update_utc),
    rates,
    source: optionalString(body.source),
    attribution: optionalString(body.attribution),
  };
}

/**
 * Map an AllRatesToday error onto the runtime's status conventions. An unsupported
 * base currency is a caller mistake, so it becomes invalid input rather than a
 * provider failure; the endpoint needs no credentials, so nothing here is an
 * authorization failure.
 */
export async function readAllRatesTodayError(response: Response): Promise<ProviderRequestError> {
  const text = (await readProviderErrorTextBody(response, "AllRatesToday error response")).trim();
  // Error bodies are JSON with an `error-type`, but a gateway error page is not; treat that as no body.
  const body = optionalRecord(
    parseProviderJsonBodyText(text, { emptyBody: {}, invalidJsonMessage: "", invalidJsonFallback: () => ({}) }),
  );
  const message =
    optionalRawString(body?.message) ??
    (text.slice(0, 200) || `AllRatesToday request failed with HTTP ${response.status}`);
  if (body?.["error-type"] === "unsupported-code") {
    return providerInputError(message);
  }
  const status = response.status;
  return new ProviderRequestError(
    status,
    message,
    withRetryAfterSeconds(response, {}),
    status === 429 ? "rate_limited" : "provider_error",
  );
}
