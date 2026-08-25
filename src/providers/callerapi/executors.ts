import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "callerapi";
const callerapiApiBaseUrl = "https://api.callerapi.com";

type CallerapiRequestPhase = "validate" | "execute";
type CallerapiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const callerapiActionHandlers: ProviderActionHandlers<"callerapi", CallerapiActionHandler> = {
  get_user_information(_input, context) {
    return requestCallerapi({
      path: "/api/me",
      context,
      phase: "execute",
    });
  },

  get_phone_number_information(input, context) {
    const phone = optionalString(input.phone) ?? "";
    return requestCallerapi({
      path: `/api/lookup/${encodeURIComponent(phone)}`,
      context,
      phase: "execute",
      query: {
        hlr: optionalBoolean(input.hlr) === true ? "true" : "false",
      },
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, callerapiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestCallerapi({
      path: "/api/me",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const email = optionalString(payload.email);

    return {
      profile: {
        accountId: email ?? "callerapi",
        displayName: email ?? "CallerAPI Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/api/me",
        apiBaseUrl: callerapiApiBaseUrl,
        email,
        credits_spent: optionalNumber(payload.credits_spent),
        credits_monthly: optionalNumber(payload.credits_monthly),
        credits_left: optionalNumber(payload.credits_left),
      }),
    };
  },
};

async function requestCallerapi(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: CallerapiRequestPhase;
  query?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, callerapiApiBaseUrl);
  setSearchParams(url, input.query ?? {});

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-auth": input.context.apiKey,
      },
      signal: input.context.signal,
    });
    payload = await readCallerapiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CallerAPI request failed: ${error.message}` : "CallerAPI request failed",
    );
  }

  if (!response.ok) {
    throw createCallerapiHttpError(response, payload, input.phase);
  }

  const providerError = readCallerapiProviderError(payload);
  if (providerError) {
    throw createCallerapiPayloadError(providerError, input.phase);
  }

  return requireCallerapiObject(payload, input.path);
}

async function readCallerapiPayload(response: Response): Promise<unknown> {
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

function createCallerapiHttpError(
  response: Response,
  payload: unknown,
  phase: CallerapiRequestPhase,
): ProviderRequestError {
  const message =
    extractCallerapiMessage(payload) ?? response.statusText ?? `CallerAPI request failed with HTTP ${response.status}`;

  if (response.status === 429 || response.status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function createCallerapiPayloadError(
  error: { status?: string; message: string },
  phase: CallerapiRequestPhase,
): ProviderRequestError {
  const normalizedStatus = error.status?.toLowerCase();
  const message = error.message;

  if (normalizedStatus === "unauthorized") {
    return phase === "validate"
      ? new ProviderRequestError(400, message, error)
      : new ProviderRequestError(401, message, error);
  }
  return new ProviderRequestError(500, message, error);
}

function readCallerapiProviderError(payload: unknown): { status?: string; message: string } | null {
  const record = optionalRecord(payload);
  if (!record) {
    return null;
  }

  const error = extractCallerapiMessage(payload);
  const status = optionalString(record.status);
  if (!error && (!status || status.toLowerCase() === "success")) {
    return null;
  }
  if (error || status?.toLowerCase() === "error" || status?.toLowerCase() === "unauthorized") {
    return {
      status,
      message: error ?? status ?? "CallerAPI request failed",
    };
  }

  return null;
}

function extractCallerapiMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.detail);
}

function requireCallerapiObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `CallerAPI ${endpoint} response must be an object`);
  }
  return record;
}
