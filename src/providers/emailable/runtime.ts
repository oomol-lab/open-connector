import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const emailableApiBaseUrl = "https://api.emailable.com";
const emailableDefaultRequestTimeoutMs = 30_000;

type EmailableRequestPhase = "validate" | "execute";
type EmailableActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const emailableActionHandlers: ProviderActionHandlers<"emailable", EmailableActionHandler> = {
  get_account_info(_input, context) {
    return requestEmailableAccountInfo({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  verify_email(input, context) {
    return requestEmailableVerifyEmail({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      email: requiredString(input.email, "email", badInput),
    });
  },
  verify_batch_emails(input, context) {
    return requestEmailableBatchCreate({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emails: Array.isArray(input.emails) ? input.emails.map(String) : [],
    });
  },
  get_batch_status(input, context) {
    return requestEmailableBatchStatus({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      batchId: requiredString(input.batch_id, "batch_id", badInput),
    });
  },
};

export async function validateEmailableCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestEmailableAccountInfo({ apiKey, fetcher, signal, phase: "validate" });

  return {
    profile: {
      accountId: payload.owner_email,
      displayName: payload.owner_email,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: emailableApiBaseUrl,
      validationEndpoint: "/v1/account",
      owner_email: payload.owner_email,
      available_credits: payload.available_credits,
    },
  };
}

async function requestEmailableAccountInfo(input: EmailableRequestInput): Promise<{
  owner_email: string;
  available_credits: number;
}> {
  const payload = await requestEmailableJson({
    path: "/v1/account",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  const record = requireEmailableObject(payload, "/v1/account");
  const ownerEmail = optionalString(record.owner_email);
  const availableCredits = optionalInteger(record.available_credits);
  if (!ownerEmail || availableCredits === undefined) {
    throw new ProviderRequestError(
      502,
      "Emailable account response did not include owner_email and available_credits",
      record,
    );
  }

  return {
    owner_email: ownerEmail,
    available_credits: availableCredits,
  };
}

async function requestEmailableVerifyEmail(
  input: EmailableRequestInput & { email: string },
): Promise<Record<string, unknown>> {
  const payload = await requestEmailableJson({
    path: "/v1/verify",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      email: input.email,
    },
  });

  return normalizeEmailableVerificationResult(payload, "/v1/verify");
}

async function requestEmailableBatchCreate(
  input: EmailableRequestInput & { emails: string[] },
): Promise<{ id: string; message: string }> {
  const payload = await requestEmailableJson({
    path: "/v1/batch",
    method: "POST",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    body: {
      emails: input.emails.join(","),
    },
  });

  return requireEmailableBatchSummary(payload, "/v1/batch");
}

async function requestEmailableBatchStatus(
  input: EmailableRequestInput & { batchId: string },
): Promise<Record<string, unknown>> {
  const payload = await requestEmailableJson({
    path: "/v1/batch",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      id: input.batchId,
    },
  });

  const record = requireEmailableObject(payload, "/v1/batch");
  const totalCounts = normalizeIntegerRecord(record.total_counts);
  const batchSummary = requireEmailableBatchSummary(record, "/v1/batch");

  return compactObject({
    id: batchSummary.id,
    message: batchSummary.message,
    processed: optionalInteger(record.processed) ?? optionalInteger(totalCounts?.processed),
    total: optionalInteger(record.total) ?? optionalInteger(totalCounts?.total),
    emails: Array.isArray(record.emails)
      ? record.emails.map((item) => normalizeEmailableVerificationResult(item, "batch email"))
      : undefined,
    download_file: optionalString(record.download_file),
    total_counts: totalCounts,
    reason_counts: normalizeIntegerRecord(record.reason_counts),
  });
}

interface EmailableRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: EmailableRequestPhase;
}

async function requestEmailableJson(
  input: EmailableRequestInput & {
    path: string;
    method?: "GET" | "POST";
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  const url = new URL(input.path, emailableApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, emailableDefaultRequestTimeoutMs);
  try {
    const hasJsonBody = input.body !== undefined;
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: emailableHeaders(input.apiKey, hasJsonBody),
      body: hasJsonBody ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readEmailablePayload(response);
    if (!response.ok) {
      throw createEmailableError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `Emailable ${input.path} request timed out after 30 seconds`, error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Emailable request failed: ${error.message}` : "Emailable request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function emailableHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readEmailablePayload(response: Response): Promise<unknown> {
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

function createEmailableError(
  response: Response,
  payload: unknown,
  phase: EmailableRequestPhase,
): ProviderRequestError {
  const message =
    extractEmailableErrorMessage(payload) ??
    response.statusText ??
    `Emailable request failed with status ${response.status}`;

  if (response.status === 249) {
    return new ProviderRequestError(503, message, payload);
  }
  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractEmailableErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.status);
}

function requireEmailableObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Emailable response for ${endpoint} was not a JSON object`, payload);
  }
  return record;
}

function requireEmailableBatchSummary(payload: unknown, endpoint: string): { id: string; message: string } {
  const record = requireEmailableObject(payload, endpoint);
  const id = optionalString(record.id);
  const message = optionalString(record.message);
  if (!id || !message) {
    throw new ProviderRequestError(502, `Emailable response for ${endpoint} did not include id and message`, record);
  }

  return { id, message };
}

function normalizeEmailableVerificationResult(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = requireEmailableObject(payload, endpoint);
  const email = optionalString(record.email);
  const state = optionalString(record.state);
  const reason = optionalString(record.reason);
  if (!email || !state || !reason) {
    throw new ProviderRequestError(
      502,
      `Emailable response for ${endpoint} did not include email, state, and reason`,
      record,
    );
  }

  return compactObject({
    email,
    state,
    reason,
    score: optionalInteger(record.score),
    user: optionalString(record.user),
    domain: optionalString(record.domain),
    free: optionalBoolean(record.free),
    role: optionalBoolean(record.role),
    accept_all: optionalBoolean(record.accept_all),
    disposable: optionalBoolean(record.disposable),
    did_you_mean: optionalString(record.did_you_mean),
    mx_record: optionalString(record.mx_record),
    smtp_provider: optionalString(record.smtp_provider),
    no_reply: optionalBoolean(record.no_reply),
    mailbox_full: optionalBoolean(record.mailbox_full),
    first_name: optionalString(record.first_name),
    last_name: optionalString(record.last_name),
    full_name: optionalString(record.full_name),
    gender: optionalString(record.gender),
    tag: optionalString(record.tag),
    duration: optionalNumber(record.duration),
  });
}

function normalizeIntegerRecord(value: unknown): Record<string, number> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject(
    Object.fromEntries(Object.entries(record).map(([key, child]) => [key, optionalInteger(child)])) as Record<
      string,
      number | undefined
    >,
  ) as Record<string, number>;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
