import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { MinimaxActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "minimax";
const minimaxApiBaseUrl = "https://api.minimax.io";
const minimaxChinaApiBaseUrl = "https://api.minimaxi.com";

type MinimaxActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MinimaxActionHandler = (input: Record<string, unknown>, context: MinimaxActionContext) => Promise<unknown>;

export const minimaxActionHandlers: Record<MinimaxActionName, MinimaxActionHandler> = {
  list_models(_input, context) {
    return minimaxGetJson("/v1/models", context);
  },
  retrieve_model(input, context) {
    const modelId = readInputString(input.modelId, "modelId");
    return minimaxGetJson(`/v1/models/${encodeURIComponent(modelId)}`, context);
  },
  create_response(input, context) {
    assertStreamingDisabled(input);
    return minimaxPostJson("/v1/responses", normalizeMinimaxBody(input), context);
  },
  estimate_input_tokens(input, context) {
    return minimaxPostJson("/v1/responses/input_tokens", normalizeMinimaxBody(input), context);
  },
  text_to_video(input, context) {
    return minimaxPostJson(
      "/v1/video_generation",
      normalizeMinimaxVideoBody(input),
      context,
      minimaxBaseUrlForRegion(input.region),
    );
  },
  image_to_video(input, context) {
    return minimaxPostJson(
      "/v1/video_generation",
      normalizeMinimaxVideoBody(input),
      context,
      minimaxBaseUrlForRegion(input.region),
    );
  },
  query_video_generation(input, context) {
    const taskId = readInputString(input.task_id, "task_id");
    return minimaxGetJson(
      `/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      context,
      minimaxBaseUrlForRegion(input.region),
    );
  },
  download_video(input, context) {
    const fileId = readInputString(input.file_id, "file_id");
    return minimaxGetJson(
      `/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
      context,
      minimaxBaseUrlForRegion(input.region),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, minimaxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await minimaxGetJson("/v1/models", {
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
    return {
      profile: {
        accountId: `minimax:key:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "MiniMax API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: minimaxApiBaseUrl,
        validationEndpoint: "/v1/models",
        availableModels: readModelIds(payload),
      },
    };
  },
};

async function minimaxGetJson(
  path: string,
  context: MinimaxActionContext,
  baseUrl: string = minimaxApiBaseUrl,
): Promise<Record<string, unknown>> {
  return minimaxRequestJson(
    path,
    {
      method: "GET",
      headers: minimaxHeaders(context.apiKey, { accept: "application/json" }),
      signal: context.signal,
    },
    context.fetcher,
    baseUrl,
  );
}

async function minimaxPostJson(
  path: string,
  body: Record<string, unknown>,
  context: MinimaxActionContext,
  baseUrl: string = minimaxApiBaseUrl,
): Promise<Record<string, unknown>> {
  return minimaxRequestJson(
    path,
    {
      method: "POST",
      headers: minimaxHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
      signal: context.signal,
    },
    context.fetcher,
    baseUrl,
  );
}

async function minimaxRequestJson(
  path: string,
  init: RequestInit,
  fetcher: ProviderFetch,
  baseUrl: string = minimaxApiBaseUrl,
): Promise<Record<string, unknown>> {
  const url = new URL(path, baseUrl);
  let response: Response;
  try {
    response = await fetcher(url.toString(), init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `MiniMax request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readMinimaxPayload(response);
  if (!response.ok) {
    throw mapMinimaxError(response.status, payload);
  }
  return payload;
}

function minimaxHeaders(apiKey: string, headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function normalizeMinimaxBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...input,
    model: trimString(input.model),
    input: typeof input.input === "string" ? input.input.trim() : input.input,
    instructions: trimString(input.instructions),
    prompt_cache_key: trimString(input.prompt_cache_key),
  });
}

function minimaxBaseUrlForRegion(region: unknown): string {
  return optionalString(region) === "china" ? minimaxChinaApiBaseUrl : minimaxApiBaseUrl;
}

function normalizeMinimaxVideoBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = compactObject({
    ...input,
    model: trimString(input.model),
    prompt: trimString(input.prompt),
    first_frame_image: trimString(input.first_frame_image),
    resolution: trimString(input.resolution),
    callback_url: trimString(input.callback_url),
  });
  delete body.region;
  return body;
}

async function readMinimaxPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "MiniMax returned malformed JSON");
    }
    return { detail: text };
  }
}

function mapMinimaxError(status: number, payload: Record<string, unknown>): ProviderRequestError {
  const errorCode = readMinimaxErrorCode(payload);
  const message = readMinimaxErrorMessage(payload) ?? `MiniMax request failed with status ${status}`;

  if (status === 401 || status === 403 || errorCode === "1004" || errorCode === "2049") {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429 || errorCode === "1002" || errorCode === "1008") {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readMinimaxErrorCode(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.code,
    optionalRecord(payload.error)?.code,
    optionalRecord(payload.base_resp)?.status_code,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

function readMinimaxErrorMessage(payload: Record<string, unknown>): string | undefined {
  return (
    optionalString(optionalRecord(payload.error)?.message) ??
    optionalString(payload.message) ??
    optionalString(payload.msg) ??
    optionalString(optionalRecord(payload.base_resp)?.status_msg) ??
    optionalString(payload.detail) ??
    optionalString(payload.error)
  );
}

function readModelIds(payload: Record<string, unknown>): string[] {
  const data = payload.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => optionalString(optionalRecord(item)?.id))
    .filter((item): item is string => item !== undefined);
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}
