import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalBooleanOrNull,
  optionalIntegerOrNull,
  optionalNumber,
  optionalRecord,
  optionalScalarString,
  optionalString,
  optionalStringArray,
  optionalStringOrNull,
  recordOrEmpty,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export interface LitellmContext {
  apiKey: string;
  /** Proxy root URL, without a trailing `/v1`. */
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type LitellmActionHandler = (input: Record<string, unknown>, context: LitellmContext) => Promise<unknown>;

interface LitellmRequestInput {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

interface LitellmErrorEnvelope {
  message?: string;
  type?: string;
  code?: string;
  param?: string;
}

interface LitellmModelInfo {
  modelName: string;
  modelId: string | null;
  provider: string | null;
  mode: string | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  inputCostPerToken: number | null;
  outputCostPerToken: number | null;
  supportsFunctionCalling: boolean | null;
  supportsVision: boolean | null;
  supportsReasoning: boolean | null;
  supportsResponseSchema: boolean | null;
}

interface LitellmKeyInfo {
  keyAlias: string | null;
  keyName: string | null;
  status: string | null;
  spend: number;
  maxBudget: number | null;
  remainingBudget: number | null;
  budgetDuration: string | null;
  budgetResetAt: string | null;
  models: string[];
  tpmLimit: number | null;
  rpmLimit: number | null;
  teamId: string | null;
  userId: string | null;
  expires: string | null;
  blocked: boolean | null;
}

const requestLabel = "LiteLLM";
// Long completions and large embedding batches routinely exceed the shared
// 30 second provider timeout.
const inferenceRequestTimeoutMs = 300_000;
const validationEndpoint = "/v1/models";

export const litellmActionHandlers: ProviderActionHandlers<"litellm", LitellmActionHandler> = {
  async create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return litellmRequest(
      { path: "/v1/chat/completions", method: "POST", body: input, timeoutMs: inferenceRequestTimeoutMs },
      context,
    );
  },
  async create_message(input, context) {
    assertStreamingDisabled(input);
    return litellmRequest(
      { path: "/v1/messages", method: "POST", body: input, timeoutMs: inferenceRequestTimeoutMs },
      context,
    );
  },
  create_embedding(input, context) {
    return litellmRequest(
      { path: "/v1/embeddings", method: "POST", body: input, timeoutMs: inferenceRequestTimeoutMs },
      context,
    );
  },
  list_models(_input, context) {
    return litellmRequest({ path: "/v1/models" }, context);
  },
  async get_model_info(input, context) {
    const model = optionalString(input.model);
    const payload = optionalRecord(await litellmRequest({ path: "/model/info" }, context));
    const models = looseArray(payload?.data)
      .map(normalizeModelInfo)
      .filter((info): info is LitellmModelInfo => info !== undefined)
      .filter((info) => model === undefined || info.modelName === model);
    return { models };
  },
  async get_key_info(_input, context) {
    try {
      const payload = optionalRecord(await litellmRequest({ path: "/key/info" }, context));
      return normalizeKeyInfo(requiredResponseRecord(payload?.info, "LiteLLM key info"));
    } catch (error) {
      if (!(error instanceof ProviderRequestError)) {
        throw error;
      }
      const details = optionalRecord(error.details);
      if (details?.status !== 404) {
        throw error;
      }
      // The proxy master key authenticates but lives in the proxy environment,
      // not the key table, so `/key/info` answers 404 with a `not_found_error`
      // envelope for it. Any other 404, such as FastAPI's `{"detail":"Not Found"}`,
      // means the route itself is missing at this base URL.
      if (details.type === "not_found_error") {
        throw providerInputError(
          "LiteLLM authenticated this key but has no record of it in the proxy key table, which is the case for the proxy master key. Connect a LiteLLM virtual key to read its budget.",
        );
      }
      throw error;
    }
  },
};

/**
 * Build the per-request LiteLLM context from the stored connection fields.
 */
export function createLitellmContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): LitellmContext {
  return { apiKey, baseUrl: normalizeLitellmBaseUrl(values.baseUrl), fetcher, signal };
}

/**
 * Verify a LiteLLM key against the proxy and record the models it can call.
 * `/v1/models` accepts both virtual keys and the master key, unlike `/key/info`.
 */
export async function validateLitellmCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createLitellmContext(values, apiKey, fetcher, signal);
  const payload = optionalRecord(await litellmRequest({ path: validationEndpoint }, context));
  const host = new URL(context.baseUrl).host;
  return {
    profile: { accountId: `litellm:${host}`, displayName: `LiteLLM ${host}` },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: context.baseUrl,
      validationEndpoint,
      availableModels: looseArray(payload?.data)
        .map((model) => optionalString(optionalRecord(model)?.id))
        .filter((model): model is string => model !== undefined),
    },
  };
}

/**
 * Validates a LiteLLM proxy URL, rejects embedded credentials and unsafe
 * targets, removes query/hash components, and reduces it to the proxy root.
 * LiteLLM serves its OpenAI routes under both `/` and `/v1`, so a pasted
 * `https://host/v1` and `https://host` resolve to the same connection, while a
 * path prefix such as `https://host/litellm` (SERVER_ROOT_PATH) is kept.
 */
export function normalizeLitellmBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const proxyUrl = requiredInputString(value, "baseUrl");
  const url = assertPublicHttpUrl(proxyUrl, {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "");
  return url.toString().replace(/\/$/u, "");
}

/**
 * Map a failed LiteLLM response to a provider error. LiteLLM wraps errors in
 * an OpenAI-style `{ error: { message, type, code, param } }` envelope; an
 * exhausted key, team, or user budget arrives with type `budget_exceeded`
 * (HTTP 400 on older releases, 422 on newer ones, so the type is what is
 * checked), which is reported as `insufficient_credit` so callers can tell it
 * apart from a malformed request.
 */
async function readLitellmError(response: Response, signal?: AbortSignal): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, `${requestLabel} error response`, signal);
  const envelope = parseLitellmErrorEnvelope(text);
  const message = envelope.message ?? (text.trim() || `${requestLabel} request failed with HTTP ${response.status}`);
  const details = withRetryAfterSeconds(
    response,
    compactObject({ status: response.status, type: envelope.type, code: envelope.code, param: envelope.param }),
  );

  if (envelope.type === "budget_exceeded") {
    return new ProviderRequestError(402, message, details, "insufficient_credit");
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, details);
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return new ProviderRequestError(response.status, message, details, "provider_error");
  }
  if (response.status >= 500) {
    return new ProviderRequestError(response.status, message, details, "provider_error");
  }
  return new ProviderRequestError(400, message, details);
}

function litellmRequest(input: LitellmRequestInput, context: LitellmContext): Promise<unknown> {
  return runProviderRequest(
    { signal: context.signal, label: requestLabel, timeoutMs: input.timeoutMs },
    async (signal) => {
      const response = await context.fetcher(`${context.baseUrl}${input.path}`, {
        method: input.method ?? "GET",
        headers: buildLitellmHeaders(context.apiKey, input.body !== undefined),
        body: input.body === undefined ? undefined : JSON.stringify(compactObject(input.body)),
        signal,
      });
      if (!response.ok) {
        throw await readLitellmError(response, signal);
      }
      return readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: `${requestLabel} returned malformed JSON`,
      });
    },
  );
}

function buildLitellmHeaders(apiKey: string, includeJsonContentType: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (includeJsonContentType) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw providerInputError("stream=true is not supported by connector actions");
  }
}

function parseLitellmErrorEnvelope(text: string): LitellmErrorEnvelope {
  let payload: Record<string, unknown> | undefined;
  try {
    payload = optionalRecord(JSON.parse(text));
  } catch {
    return {};
  }
  const nested = optionalRecord(payload?.error);
  return {
    message:
      optionalString(nested?.message) ??
      optionalString(payload?.error) ??
      optionalString(payload?.detail) ??
      optionalString(optionalRecord(payload?.detail)?.error),
    type: optionalString(nested?.type),
    code: optionalScalarString(nested?.code),
    param: optionalString(nested?.param),
  };
}

function normalizeModelInfo(entry: unknown): LitellmModelInfo | undefined {
  const record = optionalRecord(entry);
  const modelName = optionalString(record?.model_name);
  if (!modelName) {
    return undefined;
  }
  const info = recordOrEmpty(record?.model_info);
  return {
    modelName,
    modelId: optionalStringOrNull(info.id),
    provider: optionalStringOrNull(info.litellm_provider),
    mode: optionalStringOrNull(info.mode),
    maxInputTokens: optionalIntegerOrNull(info.max_input_tokens),
    maxOutputTokens: optionalIntegerOrNull(info.max_output_tokens),
    inputCostPerToken: optionalNumber(info.input_cost_per_token) ?? null,
    outputCostPerToken: optionalNumber(info.output_cost_per_token) ?? null,
    supportsFunctionCalling: optionalBooleanOrNull(info.supports_function_calling),
    supportsVision: optionalBooleanOrNull(info.supports_vision),
    supportsReasoning: optionalBooleanOrNull(info.supports_reasoning),
    supportsResponseSchema: optionalBooleanOrNull(info.supports_response_schema),
  };
}

// The `/key/info` envelope also echoes the looked-up key, which this keeps out
// of action output; only the key's record is normalized.
function normalizeKeyInfo(info: Record<string, unknown>): LitellmKeyInfo {
  const spend = optionalNumber(info.spend) ?? 0;
  const maxBudget = optionalNumber(info.max_budget) ?? null;
  return {
    keyAlias: optionalStringOrNull(info.key_alias),
    keyName: optionalStringOrNull(info.key_name),
    status: optionalStringOrNull(info.status),
    spend,
    maxBudget,
    remainingBudget: maxBudget === null ? null : Math.max(0, maxBudget - spend),
    budgetDuration: optionalStringOrNull(info.budget_duration),
    budgetResetAt: optionalStringOrNull(info.budget_reset_at),
    models: optionalStringArray(info.models) ?? [],
    tpmLimit: optionalIntegerOrNull(info.tpm_limit),
    rpmLimit: optionalIntegerOrNull(info.rpm_limit),
    teamId: optionalStringOrNull(info.team_id),
    userId: optionalStringOrNull(info.user_id),
    expires: optionalStringOrNull(info.expires),
    blocked: optionalBooleanOrNull(info.blocked),
  };
}
