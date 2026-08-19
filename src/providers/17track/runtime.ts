import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const seventeenTrackApiBaseUrl = "https://api.17track.net/track/v2.4";
const seventeenTrackRequestTimeoutMs = 30_000;
const seventeenTrackMaxResponseBytes = 1_048_576;

export const seventeenTrackActionHandlers: ProviderActionHandlers<
  "17track",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  register_trackings: async (input, context) =>
    normalizeBatchResponse(
      await requestSeventeenTrack("register", input.trackings, context.apiKey, context, "execute"),
    ),
  get_tracking_details: async (input, context) =>
    normalizeBatchResponse(
      await requestSeventeenTrack("gettrackinfo", input.trackings, context.apiKey, context, "execute"),
    ),
  list_trackings: async (input, context) => {
    const { tracking_numbers: trackingNumbers, ...filters } = input;
    const body = compactObject({
      ...filters,
      number: Array.isArray(trackingNumbers) ? trackingNumbers.join(",") : undefined,
    });
    return normalizeListResponse(await requestSeventeenTrack("gettracklist", body, context.apiKey, context, "execute"));
  },
  get_quota: async (_input, context) =>
    normalizeQuotaResponse(await requestSeventeenTrack("getquota", [], context.apiKey, context, "execute")),
};

export async function validateSeventeenTrackCredential(
  apiKey: string,
  fetcher: ApiKeyProviderContext["fetcher"],
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const quota = normalizeQuotaResponse(
    await requestSeventeenTrack("getquota", [], apiKey, { fetcher, signal }, "validate"),
  );

  return {
    profile: { displayName: "17TRACK API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: seventeenTrackApiBaseUrl,
      validationEndpoint: "/getquota",
      quotaTotal: quota.total,
      quotaRemaining: quota.remaining,
    },
  };
}

async function requestSeventeenTrack(
  path: string,
  body: unknown,
  apiKey: string,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  phase: "validate" | "execute",
) {
  const timeout = createProviderTimeout(context.signal, seventeenTrackRequestTimeoutMs);
  try {
    const response = await context.fetcher(`${seventeenTrackApiBaseUrl}/${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "17token": apiKey,
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createHttpError(response, payload, phase);
    }

    assertSuccessfulEnvelope(payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const timedOut = timeout.didTimeout() || isAbortLikeError(error);
    throw providerError(
      "provider_error",
      timedOut ? "17TRACK request timed out" : error instanceof Error ? error.message : "17TRACK request failed",
      timedOut ? 504 : 502,
    );
  } finally {
    timeout.cleanup();
  }
}

function providerError(_code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

async function readPayload(response: Response) {
  const text = await readResponseText(response);
  if (!text.trim()) {
    if (!response.ok) {
      return undefined;
    }
    throw providerError("provider_error", "17TRACK returned an empty response", 502);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw providerError("provider_error", `17TRACK returned non-JSON response (${response.status})`, 502);
    }
    return text;
  }
}

async function readResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > seventeenTrackMaxResponseBytes) {
    throw responseTooLargeError();
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return text + decoder.decode();
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > seventeenTrackMaxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseTooLargeError();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function responseTooLargeError() {
  return providerError("provider_error", `17TRACK response exceeds ${seventeenTrackMaxResponseBytes} bytes`, 502);
}

function assertSuccessfulEnvelope(payload: unknown, phase: "validate" | "execute") {
  const raw = readObject(payload, "body");
  const code = optionalNumber(raw.code);
  if (code === undefined) {
    throw providerError("provider_error", "17TRACK response is missing code", 502);
  }

  const data = optionalRecord(raw.data);
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  if (code !== 0 || errors.length > 0) {
    const firstError = optionalRecord(errors[0]);
    throw createEmbeddedError(
      optionalNumber(firstError?.code) ?? code,
      optionalString(firstError?.message) ?? readErrorMessage(payload),
      phase,
    );
  }
}

function createHttpError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const message = readErrorMessage(payload) ?? `17TRACK API request failed with status ${response.status}`;

  if (response.status === 429) {
    return providerError("rate_limited", message, 429);
  }
  if (response.status === 401 || response.status === 403) {
    return providerError(
      phase === "validate" ? "invalid_input" : "credential_expired",
      message,
      phase === "validate" ? 400 : response.status,
    );
  }
  if (response.status === 400 || response.status === 422) {
    return providerError("invalid_input", message, response.status);
  }
  return providerError("provider_error", message, response.status || 502);
}

function createEmbeddedError(code: number, message: string | undefined, phase: "validate" | "execute") {
  const detail = message ?? `17TRACK API returned error ${code}`;
  if ([-18010001, -18010002, -18010004, -18010005].includes(code)) {
    return providerError(
      phase === "validate" ? "invalid_input" : "credential_expired",
      detail,
      phase === "validate" ? 400 : 401,
    );
  }
  if (code === -18019907 || code === -18019908) {
    return providerError("rate_limited", detail, 429);
  }
  if (code === -18010003 || [-18019815, -18019816, -18019817].includes(code)) {
    return providerError("provider_error", detail, 502);
  }
  return providerError("invalid_input", detail, 400);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const raw = optionalRecord(payload);
  const data = optionalRecord(raw?.data);
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  const firstError = optionalRecord(errors[0]);
  return optionalString(firstError?.message) ?? optionalString(raw?.message) ?? optionalString(raw?.error);
}

function normalizeBatchResponse(payload: unknown) {
  const raw = readObject(payload, "body");
  const data = readObject(raw.data, "data");
  return {
    accepted: readObjectArray(data.accepted, "accepted"),
    rejected: readObjectArray(data.rejected, "rejected"),
  };
}

function normalizeListResponse(payload: unknown) {
  const raw = readObject(payload, "body");
  const data = readObject(raw.data, "data");
  const page = readObject(raw.page, "page");
  return {
    trackings: readObjectArray(data.accepted, "accepted"),
    pagination: {
      totalItems: readNumber(page.data_total, "page.data_total"),
      totalPages: readNumber(page.page_total, "page.page_total"),
      pageNumber: readNumber(page.page_no, "page.page_no"),
      pageSize: readNumber(page.page_size, "page.page_size"),
    },
  };
}

function normalizeQuotaResponse(payload: unknown) {
  const raw = readObject(payload, "body");
  const data = readObject(raw.data, "data");
  return {
    total: readNumber(data.quota_total, "data.quota_total"),
    used: readNumber(data.quota_used, "data.quota_used"),
    remaining: readNumber(data.quota_remain, "data.quota_remain"),
    todayUsed: readNumber(data.today_used, "data.today_used"),
    dailyLimit: readNumber(data.max_track_daily, "data.max_track_daily"),
    freeEmailQuota: readNumber(data.free_email_quota, "data.free_email_quota"),
    freeEmailQuotaUsed: readNumber(
      data.free_email_quotaused ?? data.free_email_quota_used,
      "data.free_email_quotaused",
    ),
  };
}

function readObjectArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw providerError("provider_error", `17TRACK response field ${fieldName} is not an array`, 502);
  }
  return value.map((item) => readObject(item, `${fieldName} item`));
}

function readObject(value: unknown, fieldName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw providerError("provider_error", `17TRACK response field ${fieldName} is not an object`, 502);
  }
  return object;
}

function readNumber(value: unknown, fieldName: string) {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw providerError("provider_error", `17TRACK response field ${fieldName} is not a number`, 502);
  }
  return number;
}
