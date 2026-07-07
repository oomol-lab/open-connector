import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { HiggsfieldAiActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const higgsfieldAiApiBaseUrl = "https://platform.higgsfield.ai";
const higgsfieldAiValidationRequestId = "validation";
const higgsfieldAiValidationPath = `/requests/${higgsfieldAiValidationRequestId}/status`;
const higgsfieldAiValidationNotFoundStatus = "request_not_found";
const higgsfieldAiDefaultImageModelId = "higgsfield-ai/soul/standard";
const higgsfieldAiDefaultVideoModelId = "higgsfield-ai/dop/standard";
const higgsfieldAiRequestTimeoutMs = 30_000;

type HiggsfieldAiRequestPhase = "validate" | "execute";

export interface HiggsfieldAiContext extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  apiSecret: string;
}

interface HiggsfieldAiRequestInput {
  context: HiggsfieldAiContext;
  method: string;
  path: string;
  phase?: HiggsfieldAiRequestPhase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

export const higgsfieldAiActionHandlers: Record<HiggsfieldAiActionName, ProviderRuntimeHandler<HiggsfieldAiContext>> = {
  submit_image_generation(input, context) {
    return submitGenerationRequest(input, context, {
      defaultModelId: higgsfieldAiDefaultImageModelId,
      baseBody: {
        prompt: readInputString(input.prompt, "prompt"),
        aspect_ratio: optionalString(input.aspectRatio),
        resolution: optionalString(input.resolution),
        camera_fixed: optionalBoolean(input.cameraFixed),
      },
    });
  },
  submit_video_generation(input, context) {
    return submitGenerationRequest(input, context, {
      defaultModelId: higgsfieldAiDefaultVideoModelId,
      baseBody: {
        image_url: readInputString(input.imageUrl, "imageUrl"),
        prompt: readInputString(input.prompt, "prompt"),
        duration: input.duration,
      },
    });
  },
  get_request_status(input, context) {
    return requestHiggsfieldAiJson({
      context,
      method: "GET",
      path: `/requests/${encodeURIComponent(readInputString(input.requestId, "requestId"))}/status`,
      phase: "execute",
    }).then(normalizeGenerationResponse);
  },
  async cancel_request(input, context): Promise<unknown> {
    const requestId = readInputString(input.requestId, "requestId");
    const response = await requestHiggsfieldAiResponse({
      context,
      method: "POST",
      path: `/requests/${encodeURIComponent(requestId)}/cancel`,
    });
    const payload = await readOptionalJson(response);
    handleHiggsfieldAiError(response, payload, "execute");
    return {
      requestId,
      accepted: response.status === 202 || response.ok,
    };
  },
};

export async function validateHiggsfieldAiCredential(
  apiKey: string,
  apiSecret: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestHiggsfieldAiJson({
    context: { apiKey, apiSecret, fetcher, signal },
    method: "GET",
    path: higgsfieldAiValidationPath,
    phase: "validate",
  });
  const status = optionalString(optionalRecord(payload)?.status) ?? higgsfieldAiValidationNotFoundStatus;

  return {
    profile: {
      accountId: `higgsfield_ai:api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`,
      displayName: "Higgsfield AI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: higgsfieldAiApiBaseUrl,
      validationEndpoint: higgsfieldAiValidationPath,
      validationStatus: status,
    },
  };
}

export function readHiggsfieldAiApiSecret(value: unknown): string {
  return requiredString(value, "apiSecret", (message) => new ProviderRequestError(400, message));
}

async function submitGenerationRequest(
  input: Record<string, unknown>,
  context: HiggsfieldAiContext,
  options: {
    defaultModelId: string;
    baseBody: Record<string, unknown>;
  },
): Promise<unknown> {
  const modelId = normalizeModelId(input.modelId) ?? options.defaultModelId;
  const body = compactObject({
    ...readArgumentsObject(input.arguments),
    ...options.baseBody,
  });
  const query = compactObject({
    hf_webhook: optionalString(input.webhookUrl),
  });
  const payload = await requestHiggsfieldAiJson({
    context,
    method: "POST",
    path: `/${modelId}`,
    query,
    body,
    phase: "execute",
  });
  return normalizeGenerationResponse(payload);
}

async function requestHiggsfieldAiJson(input: HiggsfieldAiRequestInput): Promise<unknown> {
  const response = await requestHiggsfieldAiResponse(input);
  const payload = await readOptionalJson(response);
  handleHiggsfieldAiError(response, payload, input.phase ?? "execute");
  return payload;
}

async function requestHiggsfieldAiResponse(input: HiggsfieldAiRequestInput): Promise<Response> {
  const timeout = createProviderTimeout(input.context.signal, higgsfieldAiRequestTimeoutMs);
  try {
    return await input.context.fetcher(buildHiggsfieldAiUrl(input.path, input.query), {
      method: input.method,
      headers: buildHiggsfieldAiHeaders(input.context),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Higgsfield AI request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Higgsfield AI request failed: ${error.message}` : "Higgsfield AI request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildHiggsfieldAiUrl(path: string, query?: Record<string, unknown>): URL {
  if (path.startsWith("//")) {
    throw new ProviderRequestError(400, "Higgsfield AI path must stay on the API host");
  }
  const url = new URL(path, higgsfieldAiApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildHiggsfieldAiHeaders(context: Pick<HiggsfieldAiContext, "apiKey" | "apiSecret">): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Key ${context.apiKey}:${context.apiSecret}`,
    "user-agent": providerUserAgent,
  };
}

function normalizeModelId(value: unknown): string | undefined {
  const modelId = optionalString(value);
  if (modelId === undefined) return undefined;
  if (modelId.startsWith("/") || modelId.includes("://") || modelId.includes("\\")) {
    throw new ProviderRequestError(400, "modelId must be a Higgsfield model path");
  }
  return modelId;
}

async function readOptionalJson(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Higgsfield AI returned a non-JSON response");
  }
}

function handleHiggsfieldAiError(response: Response, payload: unknown, phase: HiggsfieldAiRequestPhase): void {
  if (response.ok) return;
  const message = readErrorMessage(payload) ?? response.statusText ?? "Higgsfield AI request failed";
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (phase === "validate" && response.status === 404) return;
  if (response.status === 400 || response.status === 404) {
    throw new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, message, payload);
  }
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) return payload;
  const record = optionalRecord(payload);
  return (
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    optionalString(optionalRecord(record?.error)?.message)
  );
}

function normalizeGenerationResponse(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Higgsfield AI returned an invalid response");
  }
  return {
    status: readStatus(record.status),
    requestId: readOutputString(record.request_id, "request_id"),
    statusUrl: optionalString(record.status_url) ?? null,
    cancelUrl: optionalString(record.cancel_url) ?? null,
    images: readImageResults(record.images),
    video: readVideoResult(record.video),
    error: readErrorMessage(record) ?? null,
    raw: record,
  };
}

function readStatus(value: unknown): string {
  const status = readOutputString(value, "status");
  if (
    status !== "queued" &&
    status !== "in_progress" &&
    status !== "nsfw" &&
    status !== "failed" &&
    status !== "completed"
  ) {
    throw new ProviderRequestError(502, `unknown Higgsfield AI status: ${status}`);
  }
  return status;
}

function readImageResults(value: unknown): Array<{ url: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      url: readOutputString(item.url, "images.url"),
    }));
}

function readVideoResult(value: unknown): { url: string } | null {
  const record = optionalRecord(value);
  if (!record) return null;
  return {
    url: readOutputString(record.url, "video.url"),
  };
}

function readArgumentsObject(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, "arguments must be an object");
  }
  return record;
}

function readInputString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return text;
}

function readOutputString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `Higgsfield AI ${field} must be a string`);
  }
  return value;
}
