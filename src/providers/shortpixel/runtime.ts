import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const shortpixelAccountApiBaseUrl = "https://api.shortpixel.com/v2";
const shortpixelCdnApiBaseUrl = "https://no-cdn.shortpixel.ai";
const shortpixelDefaultRequestTimeoutMs = 30_000;

type ShortpixelPhase = "validate" | "execute";
type ShortpixelActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const shortpixelActionHandlers: ProviderActionHandlers<"shortpixel", ShortpixelActionHandler> = {
  async get_domain_cdn_usage(input, context) {
    const domain = readRequiredDomain(input.domain);
    const payload = await requestShortpixelJson(
      {
        url: `${shortpixelCdnApiBaseUrl}/read-domain-cdn-usage/${encodeURIComponent(
          domain,
        )}/${encodeURIComponent(context.apiKey)}`,
        method: "GET",
      },
      context,
      "execute",
    );

    return normalizeDomainUsagePayload(payload);
  },
  async add_domain(input, context) {
    return executeShortpixelStatusAction(
      `${shortpixelCdnApiBaseUrl}/add-domain/${encodeURIComponent(readRequiredDomain(input.domain))}/${encodeURIComponent(context.apiKey)}`,
      context,
    );
  },
  async set_domain(input, context) {
    return executeShortpixelStatusAction(
      `${shortpixelCdnApiBaseUrl}/set-domain/${encodeURIComponent(readRequiredDomain(input.domain))}/${encodeURIComponent(context.apiKey)}`,
      context,
    );
  },
  async revoke_domain(input, context) {
    return executeShortpixelStatusAction(
      `${shortpixelCdnApiBaseUrl}/revoke-domain/${encodeURIComponent(readRequiredDomain(input.domain))}/${encodeURIComponent(context.apiKey)}`,
      context,
    );
  },
  async purge_domain_storage(input, context) {
    return executeShortpixelStatusAction(
      `${shortpixelCdnApiBaseUrl}/purge-storage-bulk/${encodeURIComponent(context.apiKey)}/${encodeURIComponent(readRequiredDomain(input.domain))}`,
      context,
    );
  },
  async purge_domain_cache(input, context) {
    return executeShortpixelStatusAction(
      `${shortpixelCdnApiBaseUrl}/purge-cdn-cache-bulk/${encodeURIComponent(context.apiKey)}/${encodeURIComponent(readRequiredDomain(input.domain))}`,
      context,
    );
  },
};

export async function validateShortpixelCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const url = new URL("api-status.php", `${shortpixelAccountApiBaseUrl}/`);
  url.searchParams.set("key", apiKey);
  const payload = await requestShortpixelJson(
    {
      url: String(url),
      method: "GET",
    },
    { fetcher },
    "validate",
  );
  const status = readStatus(payload);
  assertShortpixelSuccess(status, "validate");

  return {
    profile: {
      accountId: "shortpixel-api-key",
      displayName: "ShortPixel API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: shortpixelAccountApiBaseUrl,
      validationEndpoint: "/api-status.php",
      apiCallsMade: readOptionalNumber(payload.APICallsMade),
      apiCallsFree: readOptionalNumber(payload.APICallsFree),
      apiCallsQuota: readOptionalNumber(payload.APICallsQuota),
      apiCallsQuotaOneTime: readOptionalNumber(payload.APICallsQuotaOneTime),
      apiCallsMadeOneTime: readOptionalNumber(payload.APICallsMadeOneTime),
      dateSubscription: readOptionalString(payload.DateSubscription),
      domainCheck: readOptionalString(payload.DomainCheck),
      unlimited: readOptionalBoolean(payload.Unlimited),
    }),
  };
}

async function executeShortpixelStatusAction(url: string, context: ApiKeyProviderContext) {
  const payload = await requestShortpixelJson(
    {
      url,
      method: "GET",
    },
    context,
    "execute",
  );
  const status = readStatus(payload);
  assertShortpixelSuccess(status, "execute");

  return {
    status,
    domain: readOptionalString(payload.Domain) ?? null,
    raw: payload,
  };
}

async function requestShortpixelJson(
  input: {
    url: string;
    method: "GET";
  },
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  phase: ShortpixelPhase,
) {
  const timeoutHandle = createProviderTimeout(context.signal, shortpixelDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(input.url, {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readShortpixelPayload(response);

    if (!response.ok) {
      throw createShortpixelHttpError(response.status, payload, phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "ShortPixel returned an invalid payload");
    }
    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ShortPixel request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ShortPixel request failed: ${error.message}` : "ShortPixel request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readShortpixelPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ShortPixel returned invalid JSON");
  }
}

function createShortpixelHttpError(status: number, payload: unknown, phase: ShortpixelPhase) {
  const message = extractShortpixelMessage(payload) ?? `ShortPixel request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function readStatus(payload: Record<string, unknown>) {
  const record = optionalRecord(payload.Status);
  if (!record) {
    throw new ProviderRequestError(502, "ShortPixel response did not include Status");
  }

  const code = readRequiredString(record.Code, "Status.Code");
  const message = readRequiredString(record.Message, "Status.Message");
  return { code, message };
}

function assertShortpixelSuccess(status: { code: string; message: string }, phase: ShortpixelPhase) {
  if (status.code === "2") {
    return;
  }

  if (phase === "validate") {
    throw new ProviderRequestError(400, status.message);
  }

  throw new ProviderRequestError(400, status.message);
}

function normalizeDomainUsagePayload(payload: Record<string, unknown>) {
  return {
    email: readOptionalString(payload.Email) ?? null,
    apiQuota: readOptionalNumber(payload.APIQuota),
    apiQuotaOneTime: readOptionalNumber(payload.APIQuotaOneTime),
    daysToReset: readOptionalNumber(payload.DaysToReset),
    isSubaccount: readOptionalBoolean(payload.IsSubaccount),
    isAlias: readOptionalBoolean(payload.IsAlias),
    remainingCdnTraffic: readOptionalNumber(payload.RemainingCDNTraffic),
    usedCdnTraffic: readOptionalNumber(payload.UsedCDNTraffic),
    freeApiCalls: readOptionalNumber(payload.FreeAPICalls),
    paidApiCalls: readOptionalNumber(payload.PaidAPICalls),
    paidApiCallsOneTime: readOptionalNumber(payload.PaidAPICallsOneTime),
    cdnQuota: readOptionalNumber(payload.CDNQuota),
    unlimited: readOptionalBoolean(payload.Unlimited),
    usedCdn: normalizeUsedCdnMap(payload.UsedCDN),
    usedCredits: normalizeUsedCreditsMap(payload.UsedCredits),
    raw: payload,
  };
}

function normalizeUsedCdnMap(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([date, child]) => {
      const childRecord = optionalRecord(child);
      return [
        date,
        {
          traffic: readOptionalNumber(childRecord?.Traf),
          raw: childRecord ?? {},
        },
      ];
    }),
  );
}

function normalizeUsedCreditsMap(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([date, child]) => {
      const childRecord = optionalRecord(child);
      return [
        date,
        {
          paid: readOptionalNumber(childRecord?.Paid),
          free: readOptionalNumber(childRecord?.Free),
          originalBytes: readOptionalNumber(childRecord?.Orig),
          optimizedBytes: readOptionalNumber(childRecord?.Opt),
          raw: childRecord ?? {},
        },
      ];
    }),
  );
}

function extractShortpixelMessage(payload: unknown) {
  const payloadRecord = optionalRecord(payload);
  if (!payloadRecord) {
    return undefined;
  }

  const statusRecord = optionalRecord(payloadRecord.Status);
  return optionalString(statusRecord?.Message) ?? optionalString(payloadRecord.Message);
}

function readRequiredDomain(value: unknown) {
  return readRequiredString(value, "domain");
}

function readOptionalString(value: unknown) {
  const text = optionalString(value)?.trim();
  return text ? text : null;
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return value.trim();
}

function readOptionalNumber(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return null;
}
