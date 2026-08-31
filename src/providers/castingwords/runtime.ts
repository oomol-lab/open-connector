import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalString,
  optionalStringArray,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const castingwordsApiBaseUrl = "https://castingwords.com/store/API4";

const castingwordsRequestTimeoutMs = 30_000;
const castingwordsRunningStatuses = new Set([
  "Audio Processing",
  "Awaiting Edit",
  "Awaiting Final Approval",
  "Billing Processing",
  "Checking Audio Quality",
  "Editing to Word Count",
  "On Hold",
  "Order Chargeable",
  "Order Processing",
  "Out for edit",
  "Pre-Processing",
  "Processing",
  "Temporary Error",
  "Transcribing",
]);

type CastingwordsPhase = "validate" | "execute";
type CastingwordsResponseMode = "json" | "text";
type CastingwordsNormalizedStatus = "running" | "succeeded" | "failed" | "cancelled" | "refunded";

export const castingwordsActionHandlers: ProviderActionHandlers<
  "castingwords",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async submit_transcription(input, context) {
    const serviceTier = requiredString(input.serviceTier, "serviceTier", providerInputError);
    const addons = optionalStringArray(input.addons) ?? [];
    const speakerNames = optionalStringArray(input.speakerNames) ?? [];
    const payload = await requestCastingwords({
      path: "/order_url",
      context,
      phase: "execute",
      method: "POST",
      body: compactObject({
        url: requiredString(input.mediaUrl, "mediaUrl", providerInputError),
        sku: addons.length > 0 ? [serviceTier, ...addons] : serviceTier,
        names: speakerNames.length > 0 ? speakerNames : undefined,
        notes: optionalString(input.notes),
        test: optionalBoolean(input.test) ? "1" : undefined,
      }),
    });
    const result = requiredRecord(payload, "CastingWords order response", providerResponseError);
    const audiofiles = Array.isArray(result.audiofiles) ? result.audiofiles : [];

    return {
      orderId: requiredIdentifier(result.order, "order"),
      audiofileId: positiveInteger(audiofiles[0], "audiofiles[0]", providerResponseError),
      message: typeof result.message === "string" ? result.message : null,
      raw: result,
    };
  },
  async get_transcription_status(input, context) {
    const audiofileId = positiveInteger(input.audiofileId, "audiofileId", providerInputError);
    const payload = await requestCastingwords({
      path: `/audiofile/${audiofileId}`,
      context,
      phase: "execute",
    });
    const result = requiredRecord(payload, "CastingWords audio file response", providerResponseError);
    const details = requiredRecord(result.audiofile, "CastingWords audiofile", providerResponseError);
    const providerStatus = requiredString(details.statename, "audiofile.statename", providerResponseError);

    return {
      audiofileId: positiveInteger(details.id ?? audiofileId, "audiofile.id", providerResponseError),
      status: normalizeCastingwordsStatus(providerStatus),
      providerStatus,
      details,
    };
  },
  async get_transcript(input, context) {
    const audiofileId = positiveInteger(input.audiofileId, "audiofileId", providerInputError);
    const format = input.format === "html" ? "html" : "txt";
    const payload = await requestCastingwords({
      path: `/audiofile/${audiofileId}/transcript.${format}`,
      context,
      phase: "execute",
      query: optionalBoolean(input.test) ? { test: "1" } : undefined,
      responseMode: "text",
      accept: format === "html" ? "text/html" : "text/plain",
    });
    return {
      format,
      transcript: String(payload),
    };
  },
  async get_prepay_balance(_input, context) {
    const payload = await requestCastingwords({
      path: "/prepay_balance",
      context,
      phase: "execute",
    });
    const result = requiredRecord(payload, "CastingWords prepay balance response", providerResponseError);
    return {
      balance: requiredIdentifier(result.balance, "balance"),
      raw: result,
    };
  },
};

export async function validateCastingwordsCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestCastingwords({
    path: "/prepay_balance",
    context: {
      apiKey,
      fetcher,
      signal,
    },
    phase: "validate",
  });
  return {
    profile: {
      displayName: "CastingWords API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: castingwordsApiBaseUrl,
      validationEndpoint: "/prepay_balance",
    },
  };
}

async function requestCastingwords(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: CastingwordsPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number>;
  body?: Record<string, unknown>;
  responseMode?: CastingwordsResponseMode;
  accept?: string;
}): Promise<unknown> {
  const method = input.method ?? "GET";
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${castingwordsApiBaseUrl}/`);
  if (method === "GET") {
    url.searchParams.set("api_key", input.context.apiKey);
  }
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const body =
    method === "POST"
      ? JSON.stringify({
          ...input.body,
          api_key: input.context.apiKey,
        })
      : undefined;

  const timeout = createProviderTimeout(input.context.signal, castingwordsRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method,
      headers: {
        accept: input.accept ?? "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "CastingWords request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CastingWords request failed: ${error.message}` : "CastingWords request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const text = await readProviderTextBody(response, "CastingWords response");
  const payload = parseCastingwordsPayload(text);
  if (!response.ok) {
    throw createCastingwordsError(response.status, payload, input.phase);
  }
  if (input.responseMode === "text") {
    return text;
  }
  if (payload === undefined) {
    throw new ProviderRequestError(502, "CastingWords returned an empty response");
  }
  return payload;
}

function parseCastingwordsPayload(text: string): unknown {
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCastingwordsError(status: number, payload: unknown, phase: CastingwordsPhase): ProviderRequestError {
  const message = castingwordsErrorMessage(payload) ?? `CastingWords request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function castingwordsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_message))
    : undefined;
}

function requiredIdentifier(value: unknown, field: string): string {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    throw new ProviderRequestError(502, `CastingWords response is missing ${field}`);
  }
  return String(value);
}

function normalizeCastingwordsStatus(providerStatus: string): CastingwordsNormalizedStatus {
  if (providerStatus === "Delivered") {
    return "succeeded";
  }
  if (providerStatus === "Order Cancelled") {
    return "cancelled";
  }
  if (providerStatus === "Refunded") {
    return "refunded";
  }
  if (providerStatus === "Error" || providerStatus === "Technical Difficulty") {
    return "failed";
  }
  if (castingwordsRunningStatuses.has(providerStatus)) {
    return "running";
  }
  throw new ProviderRequestError(502, `CastingWords returned an unknown transcription status: ${providerStatus}`);
}
