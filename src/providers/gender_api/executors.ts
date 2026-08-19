import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "gender_api";
const genderApiApiBaseUrl = "https://gender-api.com/v2";
const genderApiStatisticsPath = "/statistic";

type GenderApiPhase = "validate" | "execute";
type GenderApiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GenderApiActionHandler = (input: Record<string, unknown>, context: GenderApiActionContext) => Promise<unknown>;

export const genderApiActionHandlers: ProviderActionHandlers<"gender_api", GenderApiActionHandler> = {
  query_gender_by_first_name(input, context) {
    return requestGenderApi({
      path: "/gender/by-first-name",
      method: "POST",
      body: jsonObject({
        first_name: input.first_name,
        country: input.country,
        locale: input.locale,
        ip: input.ip,
        id: input.id,
      }),
      context,
      phase: "execute",
    });
  },
  query_gender_by_full_name(input, context) {
    return requestGenderApi({
      path: "/gender/by-full-name",
      method: "POST",
      body: jsonObject({
        full_name: input.full_name,
        country: input.country,
        locale: input.locale,
        ip: input.ip,
        id: input.id,
      }),
      context,
      phase: "execute",
    });
  },
  query_gender_by_email_address(input, context) {
    return requestGenderApi({
      path: "/gender/by-email-address",
      method: "POST",
      body: jsonObject({
        email: input.email,
        country: input.country,
        locale: input.locale,
        ip: input.ip,
        id: input.id,
      }),
      context,
      phase: "execute",
    });
  },
  get_country_of_origin(input, context) {
    return requestGenderApi({
      path: "/country-of-origin",
      method: "POST",
      body: jsonObject({
        first_name: input.first_name,
        full_name: input.full_name,
        email: input.email,
        id: input.id,
      }),
      context,
      phase: "execute",
    });
  },
  get_statistics(_input, context) {
    return requestGenderApi({
      path: genderApiStatisticsPath,
      method: "GET",
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, genderApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestGenderApi({
      path: genderApiStatisticsPath,
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const statistics = normalizeGenderApiStatistics(payload);

    return {
      profile: {
        accountId: "gender-api-token",
        displayName: "Gender-API.com API Token",
      },
      grantedScopes: [],
      metadata: jsonObject({
        apiBaseUrl: genderApiApiBaseUrl,
        validationEndpoint: genderApiStatisticsPath,
        isLimitReached: statistics.is_limit_reached,
        remainingCredits: statistics.remaining_credits,
        creditsUsed: statistics.details?.credits_used,
        usageLastMonthDate: statistics.usage_last_month?.date,
        usageLastMonthCreditsUsed: statistics.usage_last_month?.credits_used,
      }),
    };
  },
};

async function requestGenderApi(input: {
  path: string;
  method: "GET" | "POST";
  context: GenderApiActionContext;
  phase: GenderApiPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(`${genderApiApiBaseUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readGenderApiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gender-API.com request failed: ${error.message}` : "Gender-API.com request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGenderApiError(response, payload, input.phase);
  }

  return payload;
}

async function readGenderApiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createGenderApiError(response: Response, payload: unknown, phase: GenderApiPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const title = optionalString(record?.title);
  const detail = optionalString(record?.detail);
  const message =
    detail || title || response.statusText || `Gender-API.com request failed with HTTP ${response.status}`;
  const normalizedTitle = title?.toLowerCase() ?? "";
  const normalizedMessage = message.toLowerCase();

  if (
    response.status === 402 ||
    response.status === 429 ||
    normalizedTitle.includes("limit") ||
    normalizedMessage.includes("limit")
  ) {
    return new ProviderRequestError(429, message, payload);
  }

  if (
    normalizedTitle === "invalid-auth-token" ||
    normalizedTitle === "invalid-key" ||
    normalizedTitle === "authorization-header-missing"
  ) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function normalizeGenderApiStatistics(payload: unknown): {
  is_limit_reached: boolean;
  remaining_credits: number;
  details?: { credits_used?: number; duration?: string };
  usage_last_month?: { date?: string; credits_used?: number };
} {
  const record = requiredRecord(payload, "Gender-API.com statistic response", (message) => {
    return new ProviderRequestError(502, message, payload);
  });
  const isLimitReached = record.is_limit_reached;
  const remainingCredits = optionalInteger(record.remaining_credits);
  if (typeof isLimitReached !== "boolean") {
    throw new ProviderRequestError(502, "Gender-API.com statistic response is missing is_limit_reached", payload);
  }
  if (remainingCredits === undefined) {
    throw new ProviderRequestError(502, "Gender-API.com statistic response is missing remaining_credits", payload);
  }

  const result: {
    is_limit_reached: boolean;
    remaining_credits: number;
    details?: { credits_used?: number; duration?: string };
    usage_last_month?: { date?: string; credits_used?: number };
  } = {
    is_limit_reached: isLimitReached,
    remaining_credits: remainingCredits,
  };
  const details = normalizeStatisticsDetails(record.details);
  if (details) result.details = details;
  const usageLastMonth = normalizeUsageLastMonth(record.usage_last_month);
  if (usageLastMonth) result.usage_last_month = usageLastMonth;
  return result;
}

function normalizeStatisticsDetails(value: unknown): { credits_used?: number; duration?: string } | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const details: { credits_used?: number; duration?: string } = {};
  const creditsUsed = optionalInteger(record.credits_used);
  if (creditsUsed !== undefined) details.credits_used = creditsUsed;
  const duration = optionalString(record.duration);
  if (duration) details.duration = duration;
  return details;
}

function normalizeUsageLastMonth(value: unknown): { date?: string; credits_used?: number } | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const usage: { date?: string; credits_used?: number } = {};
  const date = optionalString(record.date);
  if (date) usage.date = date;
  const creditsUsed = optionalInteger(record.credits_used);
  if (creditsUsed !== undefined) usage.credits_used = creditsUsed;
  return usage;
}
