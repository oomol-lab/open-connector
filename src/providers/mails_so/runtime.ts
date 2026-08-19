import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const mailsSoApiBaseUrl = "https://api.mails.so";
const mailsSoDefaultRequestTimeoutMs = 30_000;

type MailsSoRequestPhase = "validate" | "execute";
type MailsSoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mailsSoActionHandlers: ProviderActionHandlers<"mails_so", MailsSoActionHandler> = {
  validate_email(input, context) {
    return requestSingleValidation({
      context,
      email: requiredInputString(input.email, "email"),
      phase: "execute",
    });
  },
  create_validation_batch(input, context) {
    return requestCreateBatch({
      context,
      emails: stringArray(input.emails, "emails", inputError),
      phase: "execute",
    });
  },
  get_validation_batch(input, context) {
    return requestBatch({
      context,
      batchId: requiredInputString(input.batchId, "batchId"),
      phase: "execute",
    });
  },
};

export async function validateMailsSoCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestSingleValidation({
    context: { apiKey: requiredInputString(apiKey, "apiKey"), fetcher, signal },
    email: "hello@mails.so",
    phase: "validate",
  });

  return {
    profile: {
      accountId: await buildMailsSoProviderAccountId(apiKey),
      displayName: "Mails API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mailsSoApiBaseUrl,
      validationEndpoint: "/v1/validate",
    },
  };
}

async function buildMailsSoProviderAccountId(apiKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function requestSingleValidation(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  email: string;
  phase: MailsSoRequestPhase;
}): Promise<unknown> {
  const payload = await requestMailsSoJson({
    path: "/v1/validate",
    context: input.context,
    phase: input.phase,
    query: { email: input.email },
  });

  const body = requireObject(payload, "mails_so single validation response");
  const record = requireObject(body.data, "mails_so single validation data");
  return normalizeValidationResult(record);
}

async function requestCreateBatch(input: {
  context: ApiKeyProviderContext;
  emails: string[];
  phase: MailsSoRequestPhase;
}): Promise<unknown> {
  const payload = await requestMailsSoJson({
    path: "/v1/batch",
    context: input.context,
    phase: input.phase,
    method: "POST",
    body: { emails: input.emails },
  });
  return normalizeBatchRecord(requireObject(payload, "mails_so create batch response"));
}

async function requestBatch(input: {
  context: ApiKeyProviderContext;
  batchId: string;
  phase: MailsSoRequestPhase;
}): Promise<unknown> {
  const payload = await requestMailsSoJson({
    path: `/v1/batch/${encodeURIComponent(input.batchId)}`,
    context: input.context,
    phase: input.phase,
  });

  const record = requireObject(payload, "mails_so batch response");
  if (!Array.isArray(record.emails)) {
    throw new ProviderRequestError(502, "mails_so batch response is missing emails");
  }

  return {
    ...normalizeBatchRecord(record),
    emails: record.emails.map((item) => normalizeValidationResult(requireObject(item, "mails_so batch email result"))),
  };
}

async function requestMailsSoJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: MailsSoRequestPhase;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}): Promise<unknown> {
  const url = new URL(input.path, mailsSoApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const timeout = createProviderTimeout(input.context.signal, mailsSoDefaultRequestTimeoutMs);
  try {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-mails-api-key": input.context.apiKey,
    });
    if (input.body) {
      headers.set("content-type", "application/json");
    }

    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw mapMailsSoError(response.status, await readMailsSoErrorMessage(response), input.phase);
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ProviderRequestError(502, "mails_so returned invalid JSON");
    }
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "mails_so request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "mails_so request failed");
  } finally {
    timeout.cleanup();
  }
}

async function readMailsSoErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    const object = optionalRecord(payload);
    const error = optionalString(object?.error);
    if (error) {
      return error;
    }
    const message = optionalString(object?.message);
    if (message) {
      return message;
    }
  } catch {}

  return `mails_so request failed with ${response.status}`;
}

function mapMailsSoError(status: number, message: string, phase: MailsSoRequestPhase): ProviderRequestError {
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401) {
    if (message.toLowerCase().includes("paid subscription")) {
      return new ProviderRequestError(403, message);
    }
    return new ProviderRequestError(phase === "validate" ? 400 : 400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function normalizeBatchRecord(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireProviderString(record.id, "id"),
    name: readNullableString(record.name),
    createdAt: requireProviderString(record.created_at, "created_at"),
    updatedAt: requireProviderString(record.updated_at, "updated_at"),
    deletedAt: readNullableString(record.deleted_at),
    finishedAt: readNullableString(record.finished_at),
    userId: requireProviderString(record.user_id, "user_id"),
    size: requireProviderInteger(record.size, "size"),
  };
}

function normalizeValidationResult(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireProviderString(record.id, "id"),
    email: requireProviderString(record.email, "email"),
    username: readNullableString(record.username),
    domain: readNullableString(record.domain),
    mxRecord: readNullableString(record.mx_record),
    score: requireProviderInteger(record.score, "score"),
    isValidFormat: requireProviderBoolean(record.isv_format, "isv_format"),
    isValidDomain: requireProviderBoolean(record.isv_domain, "isv_domain"),
    isValidMx: readNullableBoolean(record.isv_mx),
    hasNoBlocklist: requireProviderBoolean(record.isv_noblock, "isv_noblock"),
    hasNoCatchall: requireProviderBoolean(record.isv_nocatchall, "isv_nocatchall"),
    hasNoGeneric: requireProviderBoolean(record.isv_nogeneric, "isv_nogeneric"),
    isFree: requireProviderBoolean(record.is_free, "is_free"),
    result: requireProviderString(record.result, "result"),
    reason: requireProviderString(record.reason, "reason"),
  };
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, inputError);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return object;
}

function requireProviderString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `mails_so returned invalid ${fieldName}`);
  }
  return parsed;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return requireProviderString(value, "string field");
}

function requireProviderInteger(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `mails_so returned invalid ${fieldName}`);
  }
  return parsed;
}

function requireProviderBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `mails_so returned invalid ${fieldName}`);
  }
  return parsed;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (value === null) {
    return null;
  }
  return requireProviderBoolean(value, "boolean field");
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
