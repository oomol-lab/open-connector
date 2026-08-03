import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GroqcloudActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import {
  base64Bytes,
  compactObject,
  optionalRecord,
  optionalScalarString,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "groqcloud";
const groqcloudApiBaseUrl = "https://api.groq.com/openai/v1";
// Multipart attachments are capped at 25 MB; larger audio must use url.
const groqcloudAudioAttachmentMaxBytes = 25 * 1024 * 1024;

type GroqcloudRequestPhase = "validate" | "execute";
type GroqcloudActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const groqcloudActionHandlers: Record<GroqcloudActionName, GroqcloudActionHandler> = {
  list_models(_input, context) {
    return groqcloudRequest({
      context,
      path: "/models",
      phase: "execute",
    });
  },
  get_model(input, context) {
    return groqcloudRequest({
      context,
      path: `/models/${encodeURIComponent(readInputString(input.model, "model"))}`,
      phase: "execute",
    });
  },
  create_chat_completion(input, context) {
    assertStreamingDisabled(input);
    return groqcloudRequest({
      context,
      method: "POST",
      path: "/chat/completions",
      body: compactObject(input),
      phase: "execute",
    });
  },
  create_audio_transcription(input, context) {
    return groqcloudRequest({
      context,
      method: "POST",
      path: "/audio/transcriptions",
      body: buildGroqcloudAudioFormData(input),
      phase: "execute",
    });
  },
  create_audio_translation(input, context) {
    return groqcloudRequest({
      context,
      method: "POST",
      path: "/audio/translations",
      body: buildGroqcloudAudioFormData(input),
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, groqcloudActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await groqcloudRequest({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/models",
      phase: "validate",
    });
    const data = optionalRecord(payload)?.data;
    const availableModels = Array.isArray(data)
      ? data
          .map((model) => optionalString(optionalRecord(model)?.id))
          .filter((model): model is string => Boolean(model))
      : [];
    return {
      profile: {
        accountId: `groqcloud:api_key:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "GroqCloud API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: groqcloudApiBaseUrl,
        validationEndpoint: "/openai/v1/models",
        availableModels,
      },
    };
  },
};

async function groqcloudRequest(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: GroqcloudRequestPhase;
  method?: "GET" | "POST";
  path: string;
  body?: Record<string, unknown> | FormData;
}): Promise<unknown> {
  // Multipart carries its own boundary, so omit the JSON content type.
  const isMultipart = input.body instanceof FormData;
  let response: Response;
  try {
    response = await input.context.fetcher(`${groqcloudApiBaseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: groqcloudHeaders(input.context.apiKey, input.body !== undefined && !isMultipart),
      body: isMultipart ? (input.body as FormData) : input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GroqCloud request failed: ${error.message}` : "GroqCloud request failed",
    );
  }

  const raw = await response.text().catch(() => "");
  const payload = raw ? tryParseJson(raw) : null;
  if (!response.ok) {
    throw mapGroqcloudError(response.status, payload ?? raw, input.phase);
  }
  if (raw && payload === undefined) {
    throw new ProviderRequestError(502, "GroqCloud returned malformed JSON");
  }
  return payload;
}

function groqcloudHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

function assertStreamingDisabled(input: Record<string, unknown>): void {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by connector actions");
  }
}

function mapGroqcloudError(status: number, payload: unknown, phase: GroqcloudRequestPhase): ProviderRequestError {
  const error = readGroqcloudError(payload, status);
  if (status === 429) {
    return new ProviderRequestError(429, error.message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, error.message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, error.message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, error.message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, error.message, payload);
}

function readGroqcloudError(payload: unknown, status: number): { type: string; code?: string; message: string } {
  if (typeof payload === "string" && payload.trim()) {
    return {
      type: "provider_error",
      message: payload,
    };
  }
  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  return {
    type: optionalString(nestedError?.type) ?? "provider_error",
    code: optionalString(nestedError?.code),
    message:
      optionalString(nestedError?.message) ??
      optionalString(record?.message) ??
      `GroqCloud request failed with ${status}`,
  };
}

function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function buildGroqcloudAudioFormData(input: Record<string, unknown>): FormData {
  const file = optionalRecord(input.file);
  if (!file) {
    throw new ProviderRequestError(400, "file is required");
  }
  const url = optionalString(file.url);
  const contentBase64 = optionalString(file.content_base64);
  if (!url && !contentBase64) {
    throw new ProviderRequestError(400, "file must include url or content_base64");
  }
  if (url && contentBase64) {
    throw new ProviderRequestError(400, "provide only one of file.url or file.content_base64");
  }
  assertGroqcloudTimestampGranularities(input);

  const formData = new FormData();
  if (contentBase64) {
    const name = readInputString(file.name, "file.name");
    const bytes = base64Bytes(
      contentBase64,
      "file.content_base64",
      (message) => new ProviderRequestError(400, message),
    );
    if (bytes.byteLength > groqcloudAudioAttachmentMaxBytes) {
      throw new ProviderRequestError(400, `file.content_base64 exceeds ${groqcloudAudioAttachmentMaxBytes} bytes`);
    }
    const mimetype = optionalString(file.mimetype) ?? "application/octet-stream";
    formData.set("file", new File([bytes], name, { type: mimetype }));
  } else {
    // GroqCloud fetches this URL, not the connector, so screen it before forwarding.
    assertPublicHttpUrl(url!, {
      fieldName: "file.url",
      createError: (message) => new ProviderRequestError(400, message),
    });
    formData.set("url", url!);
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === "file" || value === undefined || value === null) {
      continue;
    }
    if (key === "timestamp_granularities" && Array.isArray(value)) {
      for (const granularity of value) {
        appendGroqcloudField(formData, "timestamp_granularities[]", granularity);
      }
      continue;
    }
    appendGroqcloudField(formData, key, value);
  }

  return formData;
}

function assertGroqcloudTimestampGranularities(input: Record<string, unknown>): void {
  if (input.timestamp_granularities === undefined) {
    return;
  }
  if (input.response_format !== "verbose_json") {
    throw new ProviderRequestError(400, "timestamp_granularities requires response_format=verbose_json");
  }
}

function appendGroqcloudField(formData: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  formData.append(key, optionalScalarString(value) ?? JSON.stringify(value));
}
