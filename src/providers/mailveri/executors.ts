import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "mailveri";
const apiBaseUrl = "https://api.mailveri.com";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

export const mailveriActionHandlers: ProviderActionHandlers<"mailveri", Handler> = {
  async verify_email(input, context) {
    const email = requiredInputString(input.email, "email");
    const result = await mailveriRequest(context, { path: "/v1/verify-mail/", method: "POST", body: { email } });
    const status = optionalString(result.status);
    if (!status) {
      throw new ProviderRequestError(502, "MailVeri verify_email returned no status", result);
    }
    return compactObject({
      status,
      email: optionalString(result.email) ?? optionalString(result.mail) ?? email,
      message: optionalString(result.message),
      quality_score: optionalInteger(result.quality_score),
      is_forwarding: optionalBoolean(result.is_forwarding),
      credits_used: optionalInteger(result.credits_used),
      balance: optionalInteger(result.balance),
    });
  },
  async get_balance(_input, context) {
    const result = await mailveriRequest(context, { path: "/v1/get-balance/", method: "GET" });
    const balance = optionalInteger(result.balance);
    if (balance === undefined) {
      throw new ProviderRequestError(502, "MailVeri get_balance returned no balance", result);
    }
    return compactObject({
      balance,
      message: optionalString(result.message),
      daily_limit: optionalInteger(result.daily_limit),
      daily_remaining: optionalInteger(result.daily_remaining),
      daily_used: optionalInteger(result.daily_used),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailveriActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    // The balance endpoint is free and unthrottled, so validating a key never spends credits.
    const balance = await mailveriRequest(
      { apiKey: input.apiKey, fetcher, signal },
      { path: "/v1/get-balance/", method: "GET" },
      "validate",
    );
    const remaining = optionalInteger(balance.balance);
    if (remaining === undefined) {
      throw new ProviderRequestError(502, "MailVeri get-balance returned no balance", balance);
    }
    return {
      profile: {
        accountId: `mailveri:api_key:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "MailVeri API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v1/get-balance/",
        balance: remaining,
      },
    };
  },
};

async function mailveriRequest(
  context: RequestContext,
  request: { path: string; method: "GET" | "POST"; body?: Record<string, unknown> },
  phase: ProviderRequestPhase = "execute",
): Promise<Record<string, unknown>> {
  const { response, payload } = await runProviderRequest(
    { signal: context.signal, label: "MailVeri" },
    async (signal) => {
      const response = await context.fetcher(new URL(request.path, apiBaseUrl).toString(), {
        method: request.method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${context.apiKey}`,
          "user-agent": providerUserAgent,
          ...(request.body ? { "content-type": "application/json" } : {}),
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal,
      });
      const text = await readProviderTextBody(response, "MailVeri response", undefined, signal);
      return { response, payload: parseMailveriPayload(text) };
    },
  );

  if (!response.ok) {
    throw createMailveriHttpError(response, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `MailVeri response for ${request.path} was not a JSON object`, payload);
  }

  // MailVeri reports request-level failures with HTTP 200 and a non-zero `error` code.
  const errorCode = optionalInteger(record.error) ?? 0;
  if (errorCode !== 0) {
    throw createMailveriEnvelopeError(errorCode, record);
  }

  return record;
}

function parseMailveriPayload(text: string): unknown {
  // Rejected keys answer with a plain-text 403 body, so JSON parsing must be optional.
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMailveriHttpError(
  response: Response,
  payload: unknown,
  phase: ProviderRequestPhase,
): ProviderRequestError {
  const message = extractMailveriMessage(payload) ?? `MailVeri request failed with HTTP ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    // A missing, invalid, revoked or expired key answers 403.
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function createMailveriEnvelopeError(errorCode: number, record: Record<string, unknown>): ProviderRequestError {
  const message = optionalString(record.message) ?? `MailVeri request failed with error code ${errorCode}`;
  if (errorCode === 2) {
    // Error 2 on a verification means the account has no credits left.
    return new ProviderRequestError(402, message, record, "insufficient_credit");
  }
  if (errorCode === 1 || errorCode === 3) {
    // 1: missing required parameter, 3: wrong email syntax.
    return new ProviderRequestError(400, message, record);
  }
  return new ProviderRequestError(502, message, record);
}

function extractMailveriMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}
