import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "detect_language";
const detectLanguageApiBaseUrl = "https://ws.detectlanguage.com/v3";
const validationPath = "/account/status";

interface DetectLanguageRequestInput {
  path: string;
  method: "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
  body?: Record<string, unknown>;
}

type DetectLanguageActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const detectLanguageActionHandlers: ProviderActionHandlers<"detect_language", DetectLanguageActionHandler> = {
  async detect_text(input, context) {
    const payload = await requestDetectLanguage({
      path: "/detect",
      method: "POST",
      context,
      phase: "execute",
      body: {
        q: input.text,
      },
    });

    return {
      detections: normalizeDetectionCandidates(payload),
    };
  },

  async detect_texts(input, context) {
    const payload = await requestDetectLanguage({
      path: "/detect-batch",
      method: "POST",
      context,
      phase: "execute",
      body: {
        q: input.texts,
      },
    });

    return {
      results: normalizeBatchDetections(payload),
    };
  },

  async get_account_status(_input, context) {
    const payload = await requestDetectLanguage({
      path: validationPath,
      method: "GET",
      context,
      phase: "execute",
    });

    return normalizeAccountStatus(payload);
  },

  async list_languages(_input, context) {
    const payload = await requestDetectLanguage({
      path: "/languages",
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      languages: normalizeLanguages(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, detectLanguageActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: detectLanguageApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestDetectLanguage({
      path: validationPath,
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const status = normalizeAccountStatus(payload);

    return {
      profile: {
        accountId: "detect-language-api-key",
        displayName: status.plan ? `Detect Language ${status.plan}` : "Detect Language API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: detectLanguageApiBaseUrl,
        validationEndpoint: validationPath,
        plan: status.plan,
        status: status.status,
        dailyRequestsLimit: status.dailyRequestsLimit,
      },
    };
  },
};

async function requestDetectLanguage(input: DetectLanguageRequestInput): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await input.context.fetcher(`${detectLanguageApiBaseUrl}${input.path}`, {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Detect Language request failed: ${error.message}` : "Detect Language request failed",
    );
  }

  const payload = await readDetectLanguagePayload(response);
  if (!response.ok) {
    throw createDetectLanguageError(response, payload, input.phase);
  }

  return payload;
}

async function readDetectLanguagePayload(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Detect Language returned invalid JSON");
  }
}

function createDetectLanguageError(
  response: Response,
  payload: unknown,
  phase: DetectLanguageRequestInput["phase"],
): ProviderRequestError {
  const message = readDetectLanguageErrorMessage(payload) ?? response.statusText;
  if (response.status == 429) {
    return new ProviderRequestError(429, message || "Detect Language rate limit exceeded", payload);
  }
  if (phase == "validate" && (response.status == 401 || response.status == 403)) {
    return new ProviderRequestError(400, message || "Detect Language credential is invalid", payload);
  }
  if (phase == "execute" && response.status == 401) {
    return new ProviderRequestError(401, message || "Detect Language credential expired", payload);
  }
  if (phase == "execute" && response.status == 403) {
    return new ProviderRequestError(403, message || "Detect Language request is forbidden", payload);
  }
  if (response.status == 400 || response.status == 422) {
    return new ProviderRequestError(400, message || "Detect Language rejected the request", payload);
  }
  return new ProviderRequestError(
    response.status || 500,
    message || `Detect Language request failed with ${response.status}`,
    payload,
  );
}

function readDetectLanguageErrorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = record.error;
  if (typeof error == "string") {
    return error;
  }
  const errorRecord = optionalRecord(error);
  return optionalString(errorRecord?.message) ?? optionalString(record.message);
}

function normalizeDetectionCandidates(payload: unknown): Array<Record<string, unknown>> {
  return requireObjectArray(payload, "Detect Language response should be an array").map((item) => ({
    language: requireStringField(item.language, "language"),
    score: requireNumberField(item.score, "score"),
  }));
}

function normalizeBatchDetections(payload: unknown): Array<Array<Record<string, unknown>>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Detect Language response should be an array", payload);
  }

  return payload.map((item) => normalizeDetectionCandidates(item));
}

function normalizeAccountStatus(payload: unknown): Record<string, unknown> {
  const record = requireObject(payload, "Detect Language account status should be an object");
  return {
    date: requireStringField(record.date, "date"),
    requests: requireIntegerField(record.requests, "requests"),
    bytes: requireIntegerField(record.bytes, "bytes"),
    plan: requireStringField(record.plan, "plan"),
    planExpires: readNullableStringField(record.plan_expires, "plan_expires"),
    dailyRequestsLimit: requireIntegerField(record.daily_requests_limit, "daily_requests_limit"),
    dailyBytesLimit: requireIntegerField(record.daily_bytes_limit, "daily_bytes_limit"),
    status: requireStringField(record.status, "status"),
  };
}

function normalizeLanguages(payload: unknown): Array<Record<string, unknown>> {
  return requireObjectArray(payload, "Detect Language languages response should be an array").map((item) => ({
    code: requireStringField(item.code, "code"),
    name: requireStringField(item.name, "name"),
  }));
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function requireObjectArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value.map((item) => requireObject(item, "Detect Language response item should be an object"));
}

function requireStringField(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed == null) {
    throw new ProviderRequestError(502, `Detect Language response missing string field: ${fieldName}`, value);
  }
  return parsed;
}

function readNullableStringField(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  return requireStringField(value, fieldName);
}

function requireNumberField(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed == null) {
    throw new ProviderRequestError(502, `Detect Language response missing numeric field: ${fieldName}`, value);
  }
  return parsed;
}

function requireIntegerField(value: unknown, fieldName: string): number {
  const parsed = requireNumberField(value, fieldName);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `Detect Language response field should be an integer: ${fieldName}`, value);
  }
  return parsed;
}
