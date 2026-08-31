import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const tpscheckApiBaseUrl = "https://api.tpscheck.uk";

type TpscheckRequestPhase = "validate" | "execute";
type TpscheckActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const tpscheckActionHandlers: ProviderActionHandlers<"tpscheck", TpscheckActionHandler> = {
  get_credits(_input, context) {
    return requestTpscheckJson(context, {
      method: "GET",
      path: "/credits",
    });
  },
  check_phone(input, context) {
    return requestTpscheckJson(context, {
      method: "POST",
      path: "/check",
      query: { version: "2" },
      body: {
        phone: requiredString(input.phone, "phone", providerInputError),
      },
    });
  },
  async batch_check_phones(input, context) {
    if (!Array.isArray(input.phones)) {
      throw new ProviderRequestError(400, "phones is required");
    }
    const payload = await requestTpscheckJson(context, {
      method: "POST",
      path: "/batch",
      query: { version: "2" },
      body: {
        phones: input.phones.map((phone) => requiredString(phone, "phones", providerInputError)),
      },
    });
    return normalizeBatchPayload(payload);
  },
};

export async function validateTpscheckCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestTpscheckJson(
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    { method: "GET", path: "/credits", phase: "validate" },
  );
  const credits = requireTpscheckObject(payload, "/credits");
  return {
    profile: {
      accountId: "tpscheck-api-key",
      displayName: "TPSCheck API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: tpscheckApiBaseUrl,
      validationEndpoint: "/credits",
      requestsUsed: optionalInteger(credits.requests_used),
      requestsRemaining: optionalInteger(credits.requests_remaining),
      monthlyLimit: optionalInteger(credits.monthly_limit),
      plan: optionalString(credits.plan),
      resetDate: optionalString(credits.reset_date),
    }),
  };
}

async function requestTpscheckJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: {
    method: "GET" | "POST";
    path: string;
    phase?: TpscheckRequestPhase;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const url = new URL(input.path, tpscheckApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }

  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Token ${context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    payload = await readTpscheckPayload(response);
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "TPSCheck request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TPSCheck request failed: ${error.message}` : "TPSCheck request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createTpscheckError(response.status, payload, input.phase ?? "execute");
  }

  return requireTpscheckObject(payload, input.path || "/");
}

async function readTpscheckPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTpscheckError(status: number, payload: unknown, phase: TpscheckRequestPhase): ProviderRequestError {
  const message = extractTpscheckErrorMessage(payload) ?? `TPSCheck request failed with ${status || 500}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 400) return new ProviderRequestError(400, message, payload);
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function extractTpscheckErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.detail) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function normalizeBatchPayload(payload: unknown): Record<string, unknown> {
  const record = requireTpscheckObject(payload, "/batch");
  const results = objectArray(record.results, "results", (message) => new ProviderRequestError(502, message));
  return {
    ...record,
    total: optionalInteger(record.total) ?? results.length,
    results,
  };
}

function requireTpscheckObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `TPSCheck ${endpoint} returned a non-object response`);
  }
  return record;
}
