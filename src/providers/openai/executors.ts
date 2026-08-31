import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

interface UploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

type OpenAiActionContext = ApiKeyProviderContext;

interface OpenAiRequestInput {
  method?: "GET" | "POST";
  path: string;
  body?: FormData | Record<string, unknown>;
  headers?: Record<string, string>;
  mode?: "validate" | "execute";
}

type OpenAiActionHandler = (input: Record<string, unknown>, context: OpenAiActionContext) => Promise<unknown>;

const service = "openai";
const openaiApiBaseUrl = "https://api.openai.com/v1";
const openaiAudioSourceMaxBytes = 25 * 1024 * 1024;

export const openaiActionHandlers: ProviderActionHandlers<"openai", OpenAiActionHandler> = {
  list_models(_input, context) {
    return openaiListModels(context);
  },
  get_model(input, context) {
    return openaiGetModel(input, context);
  },
  create_response(input, context) {
    return openaiCreateResponse(input, context);
  },
  get_response(input, context) {
    return openaiGetResponse(input, context);
  },
  list_input_items(input, context) {
    return openaiListInputItems(input, context);
  },
  get_input_token_counts(input, context) {
    return openaiGetInputTokenCounts(input, context);
  },
  create_embeddings(input, context) {
    return openaiCreateEmbeddings(input, context);
  },
  create_moderation(input, context) {
    return openaiCreateModeration(input, context);
  },
  create_image(input, context) {
    return openaiCreateImage(input, context);
  },
  create_speech(input, context) {
    return openaiCreateSpeech(input, context);
  },
  create_audio_transcription(input, context) {
    return openaiCreateAudioTranscription(input, context);
  },
  create_audio_translation(input, context) {
    return openaiCreateAudioTranslation(input, context);
  },
  create_batch(input, context) {
    return openaiCreateBatch(input, context);
  },
  get_batch(input, context) {
    return openaiGetBatch(input, context);
  },
  cancel_batch(input, context) {
    return openaiCancelBatch(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openaiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const payload = (await openaiJsonRequest(
      input.apiKey,
      {
        path: "/models",
        mode: "validate",
      },
      fetcher,
    )) as {
      data?: Array<{ id?: unknown }>;
    };

    return {
      profile: {
        displayName: "OpenAI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/models",
        availableModels: (payload.data ?? [])
          .map((model) => model.id)
          .filter((model): model is string => typeof model === "string"),
      },
    };
  },
};

async function openaiListModels(context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      path: "/models",
    },
    context.fetcher,
  );
}

async function openaiGetModel(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      path: `/models/${encodePathSegment(requireStringField(input, "model"))}`,
    },
    context.fetcher,
  );
}

async function openaiCreateResponse(input: Record<string, unknown>, context: OpenAiActionContext) {
  assertStreamingDisabled(input);
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/responses",
      body: compactObject(input),
    },
    context.fetcher,
  );
}

async function openaiGetResponse(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      path: withOpenAiQuery(`/responses/${encodePathSegment(requireStringField(input, "response_id"))}`, {
        include: input.include,
      }),
    },
    context.fetcher,
  );
}

async function openaiListInputItems(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      path: withOpenAiQuery(
        `/responses/${encodePathSegment(requireStringField(input, "response_id"))}/input_items`,
        compactObject({
          after: input.after,
          include: input.include,
          limit: input.limit,
          order: input.order,
        }),
      ),
    },
    context.fetcher,
  );
}

async function openaiGetInputTokenCounts(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/responses/input_tokens",
      body: compactObject(input),
    },
    context.fetcher,
  );
}

async function openaiCreateEmbeddings(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/embeddings",
      body: compactObject(input),
    },
    context.fetcher,
  );
}

async function openaiCreateModeration(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/moderations",
      body: compactObject(input),
    },
    context.fetcher,
  );
}

async function openaiCreateImage(input: Record<string, unknown>, context: OpenAiActionContext) {
  assertStreamingDisabled(input);
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/images/generations",
      body: compactObject(input),
    },
    context.fetcher,
  );
}

async function openaiCreateSpeech(input: Record<string, unknown>, context: OpenAiActionContext) {
  assertSpeechStreamingDisabled(input);
  const response = await openaiRawRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/audio/speech",
      body: compactObject(input),
      headers: {
        ...openaiJsonHeaders(context.apiKey),
        accept: "*/*",
      },
    },
    context.fetcher,
  );

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    content_base64: bytes.toString("base64"),
    content_type: normalizedContentType(
      response.headers.get("content-type"),
      inferSpeechContentType(input.response_format),
    ),
  };
}

async function openaiCreateAudioTranscription(input: Record<string, unknown>, context: OpenAiActionContext) {
  assertStreamingDisabled(input);
  const response = await openaiRawRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/audio/transcriptions",
      body: await buildOpenAiAudioFormData(input, context, {
        include: "include[]",
        timestamp_granularities: "timestamp_granularities[]",
      }),
    },
    context.fetcher,
  );

  return openaiReadJsonOrTextResponse(response);
}

async function openaiCreateAudioTranslation(input: Record<string, unknown>, context: OpenAiActionContext) {
  const response = await openaiRawRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/audio/translations",
      body: await buildOpenAiAudioFormData(input, context),
    },
    context.fetcher,
  );

  return openaiReadJsonOrTextResponse(response);
}

async function openaiCreateBatch(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: "/batches",
      body: compactObject(input),
    },
    context.fetcher,
  );
}

async function openaiGetBatch(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      path: `/batches/${encodePathSegment(requireStringField(input, "batch_id"))}`,
    },
    context.fetcher,
  );
}

async function openaiCancelBatch(input: Record<string, unknown>, context: OpenAiActionContext) {
  return openaiJsonRequest(
    context.apiKey,
    {
      method: "POST",
      path: `/batches/${encodePathSegment(requireStringField(input, "batch_id"))}/cancel`,
    },
    context.fetcher,
  );
}

function openaiBaseHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function openaiJsonHeaders(apiKey: string): Record<string, string> {
  return {
    ...openaiBaseHeaders(apiKey),
    "content-type": "application/json",
  };
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

function assertSpeechStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream_format === "sse") {
    throw new ProviderRequestError(400, "stream_format=sse is not supported by connector actions");
  }
}

async function openaiJsonRequest(apiKey: string, input: OpenAiRequestInput, fetcher: typeof fetch): Promise<unknown> {
  const response = await openaiRawRequest(apiKey, input, fetcher);
  return response.json();
}

async function openaiRawRequest(apiKey: string, input: OpenAiRequestInput, fetcher: typeof fetch): Promise<Response> {
  let body: BodyInit | undefined;
  let headers: Record<string, string>;
  if (input.body instanceof FormData) {
    body = input.body;
    headers = input.headers ?? openaiBaseHeaders(apiKey);
  } else if (input.body) {
    body = JSON.stringify(input.body);
    headers = input.headers ?? openaiJsonHeaders(apiKey);
  } else {
    headers = input.headers ?? openaiBaseHeaders(apiKey);
  }

  let response: Response;
  try {
    response = await fetcher(`${openaiApiBaseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown network error";
    throw new ProviderRequestError(
      502,
      `openai ${(input.method ?? "GET").toUpperCase()} ${input.path} failed before receiving response: ${message}`,
    );
  }

  await assertOpenAiResponse(response, input.mode ?? "execute");
  return response;
}

async function assertOpenAiResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readOpenAiError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message);
  }
  if (mode === "execute" && response.status === 403) {
    throw new ProviderRequestError(403, error.message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, error.message);
  }

  throw new ProviderRequestError(502, error.message, response.status);
}

async function readOpenAiError(response: Response): Promise<{ type: string; code?: string; message: string }> {
  try {
    const payload = (await response.json()) as {
      error?: {
        type?: unknown;
        code?: unknown;
        message?: unknown;
      };
      type?: unknown;
      code?: unknown;
      message?: unknown;
    };

    return {
      type:
        typeof payload.error?.type === "string"
          ? payload.error.type
          : typeof payload.type === "string"
            ? payload.type
            : "provider_error",
      code:
        typeof payload.error?.code === "string"
          ? payload.error.code
          : typeof payload.code === "string"
            ? payload.code
            : undefined,
      message:
        typeof payload.error?.message === "string"
          ? payload.error.message
          : typeof payload.message === "string"
            ? payload.message
            : `openai request failed with ${response.status}`,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `openai request failed with ${response.status}`;
    return {
      type: "provider_error",
      code: undefined,
      message,
    };
  }
}

function requireStringField(input: Record<string, unknown>, fieldName: string): string {
  const value = input[fieldName];
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function withOpenAiQuery(path: string, query: Record<string, unknown>): string {
  const url = new URL(path, openaiApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(url, key, value);
  }
  return `${url.pathname}${url.search}`;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }
  if (typeof value === "object") {
    url.searchParams.append(key, JSON.stringify(value));
    return;
  }
  url.searchParams.append(key, String(value));
}

async function buildOpenAiAudioFormData(
  input: Record<string, unknown>,
  context: Pick<OpenAiActionContext, "fetcher" | "signal">,
  arrayFieldMap: Record<string, string> = {},
): Promise<FormData> {
  const source = await resolveAudioUploadSource(input, context);
  const formData = new FormData();
  formData.set("file", new File([Buffer.from(source.bytes)], source.fileName, { type: source.mimeType }));

  for (const [key, value] of Object.entries(input)) {
    if (key === "file" || value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      const targetKey = arrayFieldMap[key] ?? key;
      for (const item of value) {
        appendMultipartField(formData, targetKey, item);
      }
      continue;
    }
    appendMultipartField(formData, key, value);
  }

  return formData;
}

async function resolveAudioUploadSource(
  input: Record<string, unknown>,
  context: Pick<OpenAiActionContext, "fetcher" | "signal">,
): Promise<UploadSource> {
  const nestedFile = optionalRecord(input.file);
  if (!nestedFile) {
    throw new ProviderRequestError(400, "file is required");
  }

  const fileName = optionalString(nestedFile.name);
  const fileUrl = optionalString(nestedFile.url);
  const contentBase64 = optionalString(nestedFile.content_base64);
  const mimeType = optionalString(nestedFile.mimetype);
  const sourceCount = Number(Boolean(fileUrl)) + Number(Boolean(contentBase64));

  if (!fileName) {
    throw new ProviderRequestError(400, "file.name is required");
  }
  if (sourceCount === 0) {
    throw new ProviderRequestError(400, "file.url or file.content_base64 is required");
  }
  if (sourceCount > 1) {
    throw new ProviderRequestError(400, "provide only one of file.url or file.content_base64");
  }

  if (fileUrl) {
    const response = await fetchPublicAudioUrl(fileUrl, context);
    return {
      bytes: await readBoundedResponseBytes(response, {
        maxBytes: openaiAudioSourceMaxBytes,
        fieldName: "file.url",
        createError: (message) => new ProviderRequestError(400, message),
      }),
      fileName,
      mimeType: normalizedContentType(response.headers.get("content-type"), mimeType ?? "application/octet-stream"),
    };
  }

  const bytes = decodeBase64Content(contentBase64!, "file.content_base64");
  assertOpenAiAudioSourceSize(bytes.byteLength, "file.content_base64");
  return {
    bytes,
    fileName,
    mimeType: mimeType ?? "application/octet-stream",
  };
}

async function fetchPublicAudioUrl(
  url: string,
  context: Pick<OpenAiActionContext, "fetcher" | "signal">,
): Promise<Response> {
  assertPublicAudioUrl(url);
  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  try {
    response = await context.fetcher(url, { signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "failed to fetch audio source: request timed out");
    }
    const message = error instanceof Error ? error.message : "unknown network error";
    throw new ProviderRequestError(502, `failed to fetch audio source: ${message}`);
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw new ProviderRequestError(502, `failed to fetch audio source: ${response.status}`, response.status);
  }

  return response;
}

function assertOpenAiAudioSourceSize(byteLength: number, fieldName: string): void {
  if (byteLength > openaiAudioSourceMaxBytes) {
    throw new ProviderRequestError(400, `${fieldName} exceeds ${openaiAudioSourceMaxBytes} bytes`);
  }
}

function assertPublicAudioUrl(value: string): void {
  assertPublicHttpUrl(value, {
    fieldName: "file.url",
    createError: (message) => new ProviderRequestError(400, message),
  });
}

function appendMultipartField(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === "string") {
    formData.append(key, value);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    formData.append(key, String(value));
    return;
  }
  formData.append(key, JSON.stringify(value));
}

function decodeBase64Content(value: string, fieldName: string): Uint8Array {
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length === 0) {
      throw new Error("empty");
    }
    if (stripTrailingPadding(bytes.toString("base64")) !== stripTrailingPadding(value)) {
      throw new Error("mismatch");
    }
    return new Uint8Array(bytes);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be valid base64`);
  }
}

function stripTrailingPadding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") {
    end -= 1;
  }
  return value.slice(0, end);
}

async function openaiReadJsonOrTextResponse(response: Response): Promise<unknown> {
  const contentType = normalizedContentType(response.headers.get("content-type"), "");
  if (contentType === "application/json") {
    return response.json();
  }
  return {
    text: await response.text(),
  };
}

function normalizedContentType(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const [contentType] = value.split(";", 1);
  return contentType?.trim() || fallback;
}

function inferSpeechContentType(responseFormat: unknown): string {
  switch (responseFormat) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/opus";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/pcm";
    default:
      return "audio/mpeg";
  }
}
