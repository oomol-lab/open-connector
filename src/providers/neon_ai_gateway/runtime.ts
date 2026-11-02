import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";

import { compactObject, looseArray, optionalRecord, optionalScalarString, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export interface NeonAiGatewayContext {
  apiKey: string;
  /** Branch gateway origin, such as `https://br-x-api.ai.c-2.us-east-2.aws.neon.tech`, with no path. */
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NeonAiGatewayActionHandler = (input: Record<string, unknown>, context: NeonAiGatewayContext) => Promise<unknown>;

interface NeonAiGatewayRequestInput {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface NeonAiGatewayErrorEnvelope {
  message?: string;
  type?: string;
  code?: string;
}

const requestLabel = "Neon AI Gateway";
// Long completions and large embedding batches routinely exceed the shared
// 30 second provider timeout.
const inferenceRequestTimeoutMs = 300_000;
const validationEndpoint = "/v1/models";
const anthropicVersion = "2023-06-01";
const neonHostSuffix = ".neon.tech";
const geminiModelPattern = /^[A-Za-z0-9._-]+$/u;
// Jev 1.14 only reads image assets behind TypeSafe's experimental opt-in header.
const typesafeImageOptInModel = "typesafeai-jev-1-14-0";

export const neonAiGatewayActionHandlers: ProviderActionHandlers<"neon_ai_gateway", NeonAiGatewayActionHandler> = {
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return gatewayRequest(
      { path: "/v1/chat/completions", method: "POST", body: input, timeoutMs: inferenceRequestTimeoutMs },
      context,
    );
  },
  create_response(input, context) {
    assertStreamingDisabled(input);
    return gatewayRequest(
      { path: "/openai/v1/responses", method: "POST", body: input, timeoutMs: inferenceRequestTimeoutMs },
      context,
    );
  },
  create_message(input, context) {
    assertStreamingDisabled(input);
    return gatewayRequest(
      {
        path: "/anthropic/v1/messages",
        method: "POST",
        body: input,
        headers: { "anthropic-version": anthropicVersion },
        timeoutMs: inferenceRequestTimeoutMs,
      },
      context,
    );
  },
  create_embedding(input, context) {
    return gatewayRequest(
      { path: "/v1/embeddings", method: "POST", body: input, timeoutMs: inferenceRequestTimeoutMs },
      context,
    );
  },
  generate_content(input, context) {
    const { model, ...body } = input;
    const modelId = requiredInputString(model, "model");
    if (!geminiModelPattern.test(modelId)) {
      throw providerInputError("model must be a Gemini model ID such as gemini-3-flash");
    }
    return gatewayRequest(
      {
        path: `/gemini/v1beta/models/${encodePathSegment(modelId)}:generateContent`,
        method: "POST",
        body,
        timeoutMs: inferenceRequestTimeoutMs,
      },
      context,
    );
  },
  evaluate(input, context) {
    const hasAssets = Object.keys(optionalRecord(input.assets) ?? {}).length > 0;
    return gatewayRequest(
      {
        path: "/typesafe/v1/systemone",
        method: "POST",
        body: input,
        headers:
          hasAssets && input.model === typesafeImageOptInModel ? { "TypeSafe-Danger-Zone-Images": "true" } : undefined,
        timeoutMs: inferenceRequestTimeoutMs,
      },
      context,
    );
  },
  list_models(_input, context) {
    return gatewayRequest({ path: "/v1/models" }, context);
  },
};

/**
 * Build the per-request gateway context from the stored connection fields.
 */
export function createNeonAiGatewayContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): NeonAiGatewayContext {
  return { apiKey, baseUrl: normalizeNeonAiGatewayBaseUrl(values.baseUrl), fetcher, signal };
}

/**
 * Verify a branch credential against the gateway and record the models it can call.
 */
export async function validateNeonAiGatewayCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createNeonAiGatewayContext(values, apiKey, fetcher, signal);
  const payload = optionalRecord(await gatewayRequest({ path: validationEndpoint }, context));
  const host = new URL(context.baseUrl).host;
  // The branch ID is the first host label, followed by the `-api` suffix.
  const branchId = host.split(".")[0]!.replace(/-api$/u, "");
  return {
    profile: { accountId: `neon_ai_gateway:${host}`, displayName: `Neon AI Gateway ${branchId}` },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: context.baseUrl,
      branchId,
      validationEndpoint,
      // Every catalog model is listed; `enabled` marks the ones this account can call now.
      availableModels: looseArray(payload?.data)
        .map((model) => optionalRecord(model))
        .filter((model) => model?.enabled !== false)
        .map((model) => optionalString(model?.id))
        .filter((model): model is string => model !== undefined),
    },
  };
}

/**
 * Validates the branch gateway URL and reduces it to its origin. Neon serves
 * every dialect from the branch host root, so a pasted SDK base URL such as
 * `https://host/v1`, `https://host/openai/v1`, or `https://host/anthropic`
 * resolves to the same connection. Only HTTPS hosts under `neon.tech` are
 * accepted, so the branch token is never sent anywhere else.
 */
export function normalizeNeonAiGatewayBaseUrl(value: unknown): string {
  const url = assertPublicHttpUrl(requiredInputString(value, "baseUrl"), {
    fieldName: "baseUrl",
    createError: providerInputError,
  });
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  if (url.protocol !== "https:" || !url.hostname.endsWith(neonHostSuffix)) {
    throw providerInputError(
      "baseUrl must be the HTTPS Neon AI Gateway host for a branch, such as https://<branch-id>-api.ai.<cell>.<region>.aws.neon.tech",
    );
  }
  return url.origin;
}

/**
 * Map a failed gateway response to a provider error. Errors the gateway raises
 * itself use the OpenAI `{ error: { message } }` envelope, while quota blocks
 * and upstream failures use a flat `{ error_code, message }` envelope with the
 * upstream status kept. Quota blocks (`REQUEST_LIMIT_EXCEEDED`) stay 429 with
 * any `Retry-After`. An organization without prepaid credits has been seen to
 * answer `credits_required` / "AI Gateway credits required", which is reported
 * as `insufficient_credit` so callers can tell it apart from an auth failure.
 */
async function readNeonAiGatewayError(response: Response, signal?: AbortSignal): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, `${requestLabel} error response`, signal);
  const envelope = parseErrorEnvelope(text);
  const message = envelope.message ?? (text.trim() || `${requestLabel} request failed with HTTP ${response.status}`);
  const details = withRetryAfterSeconds(
    response,
    compactObject({ status: response.status, type: envelope.type, code: envelope.code }),
  );

  if (
    response.status === 402 ||
    [envelope.code, envelope.type].includes("credits_required") ||
    /credits (are )?required/iu.test(message)
  ) {
    return new ProviderRequestError(402, message, details, "insufficient_credit");
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, details);
  }
  if (response.status === 401 || response.status === 403 || response.status === 404 || response.status >= 500) {
    return new ProviderRequestError(response.status, message, details, "provider_error");
  }
  if (response.status === 413 || response.status === 415) {
    return new ProviderRequestError(response.status, message, details);
  }
  return new ProviderRequestError(400, message, details);
}

function gatewayRequest(input: NeonAiGatewayRequestInput, context: NeonAiGatewayContext): Promise<unknown> {
  return runProviderRequest(
    { signal: context.signal, label: requestLabel, timeoutMs: input.timeoutMs },
    async (signal) => {
      const headers = new Headers({
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
        ...input.headers,
      });
      if (input.body !== undefined) {
        headers.set("content-type", "application/json");
      }
      const response = await context.fetcher(`${context.baseUrl}${input.path}`, {
        method: input.method ?? "GET",
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(compactObject(input.body)),
        signal,
      });
      if (!response.ok) {
        throw await readNeonAiGatewayError(response, signal);
      }
      return readProviderJsonBody(response, {
        emptyBody: null,
        invalidJsonMessage: `${requestLabel} returned malformed JSON`,
      });
    },
  );
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw providerInputError("stream=true is not supported by connector actions");
  }
}

function parseErrorEnvelope(text: string): NeonAiGatewayErrorEnvelope {
  let payload: Record<string, unknown> | undefined;
  try {
    payload = optionalRecord(JSON.parse(text));
  } catch {
    return {};
  }
  const nested = optionalRecord(payload?.error);
  return {
    message: optionalString(nested?.message) ?? optionalString(payload?.error) ?? optionalString(payload?.message),
    type: optionalString(nested?.type) ?? optionalString(payload?.type),
    code:
      optionalScalarString(nested?.code) ??
      optionalScalarString(payload?.error_code) ??
      optionalScalarString(payload?.code),
  };
}
