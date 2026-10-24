import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

type QuantDataPhase = "validate" | "execute";
export const quantDataApiBaseUrl = "https://api.quantdata.us";

const endpointByAction: Record<string, string> = {
  get_gainers_losers: "/v1/options/tool/gainers-losers",
  get_order_flow_consolidated: "/v1/options/tool/order-flow/consolidated",
  get_exposure_by_strike: "/v1/options/tool/exposure-by-strike",
  get_exposure_by_expiration: "/v1/options/tool/exposure-by-expiration",
  get_net_drift: "/v1/options/tool/net-drift",
  get_net_flow: "/v1/options/tool/net-flow",
  get_iv_rank: "/v1/options/tool/iv-rank",
  get_volatility_skew: "/v1/options/tool/volatility-skew",
  get_dark_flow: "/v1/equities/tool/dark-flow",
  get_dark_pool_levels: "/v1/equities/tool/dark-pool-levels",
  get_equity_prints: "/v1/equities/tool/equity-prints",
  get_news_articles: "/v1/news/tool/news-articles",
};

type QuantDataHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
export const quantDataActionHandlers: ProviderActionHandlers<"quant_data", QuantDataHandler> = Object.fromEntries(
  Object.entries(endpointByAction).map(([name, path]) => [
    name,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
      validateInput(input);
      return requestQuantDataJson({
        path,
        body: input,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      });
    },
  ]),
) as ProviderActionHandlers<"quant_data", QuantDataHandler>;

function validateInput(input: Record<string, unknown>): void {
  if (input.sessionDate !== undefined && input.timeRange !== undefined)
    throw providerInputError("sessionDate and timeRange are mutually exclusive");
  if (input.sessionDate !== undefined && input.snapshotTime !== undefined)
    throw providerInputError("sessionDate and snapshotTime are mutually exclusive");
  if (input.includes !== undefined && input.excludes !== undefined)
    throw providerInputError("includes and excludes are mutually exclusive");
}

export async function validateQuantDataCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestQuantDataJson({
    path: endpointByAction.get_gainers_losers!,
    body: {},
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  return {
    profile: { accountId: "quant-data", displayName: "Quant Data API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: quantDataApiBaseUrl, validationEndpoint: endpointByAction.get_gainers_losers },
  };
}

async function requestQuantDataJson(input: {
  path: string;
  body: Record<string, unknown>;
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: QuantDataPhase;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Quant Data", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(`${quantDataApiBaseUrl}${input.path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal,
    });
    const payload = await readQuantDataPayload(response);
    if (!response.ok) throw createQuantDataError(response.status, payload, input.phase);
    return requiredResponseRecord(payload, "Quant Data response");
  });
}

async function readQuantDataPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Quant Data response");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Quant Data returned invalid JSON");
  }
}

function createQuantDataError(status: number, payload: unknown, phase: QuantDataPhase): ProviderRequestError {
  const problem = optionalRecord(payload);
  const problemType = optionalString(problem?.type);
  const message = extractQuantDataErrorMessage(payload, status);
  if (status === 429 || problemType === "https://quantdata.us/errors/rate-limit-exceeded")
    return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && 400 <= status && status < 500) return new ProviderRequestError(400, message, payload);
  if (problemType === "https://quantdata.us/errors/authentication")
    return new ProviderRequestError(401, message, payload);
  if (
    problemType === "https://quantdata.us/errors/validation" ||
    problemType === "https://quantdata.us/errors/bad-request"
  )
    return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function extractQuantDataErrorMessage(payload: unknown, status: number): string {
  const problem = optionalRecord(payload);
  const detail = optionalString(problem?.detail);
  const validationMessages = looseArray(problem?.errors)
    .map((entry) => {
      const error = optionalRecord(entry);
      const field = optionalString(error?.field);
      const message = optionalString(error?.message);
      return message ? (field ? `${field}: ${message}` : message) : undefined;
    })
    .filter((message): message is string => message !== undefined);
  if (validationMessages.length) return validationMessages.join("; ");
  const agreementUrl = optionalString(problem?.agreementUrl);
  if (detail && agreementUrl && !detail.includes(agreementUrl)) return `${detail} ${agreementUrl}`;
  return detail ?? optionalString(problem?.title) ?? `Quant Data request failed with status ${status}`;
}
