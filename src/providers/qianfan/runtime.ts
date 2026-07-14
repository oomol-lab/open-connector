import type { CredentialValidationResult, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { QianfanActionName } from "./actions.ts";

import { compactObject, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  readTransitFileInput,
} from "../provider-runtime.ts";

export const qianfanApiOrigin: string = "https://qianfan.baidubce.com";
export const qianfanApiBaseUrl: string = `${qianfanApiOrigin}/v2`;
const qianfanUserAgent = providerUserAgent;

interface ApiKeyProviderActionInput {
  apiKey: string;
  input: Record<string, unknown>;
  transitFiles?: TransitFileWriter;
}

function qianfanError(_code: string, message: string, status = 502): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

function requireApiKey(input: Record<string, string>): string {
  return requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
}

interface UploadSource {
  file: File;
  purpose?: string;
}

type QianfanActionHandler = (input: ApiKeyProviderActionInput, fetcher: typeof fetch) => Promise<unknown>;

interface QianfanRequestInput {
  method?: "DELETE" | "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  baseUrl?: string;
  mode?: "validate" | "execute";
}

export const qianfanActionHandlers: Record<QianfanActionName, QianfanActionHandler> = {
  list_models(input, fetcher) {
    return qianfanListModels(input, fetcher);
  },
  create_completion(input, fetcher) {
    return qianfanCreateCompletion(input, fetcher);
  },
  create_chat_completion(input, fetcher) {
    return qianfanCreateChatCompletion(input, fetcher);
  },
  create_ai_search_completion(input, fetcher) {
    return qianfanCreateAiSearchCompletion(input, fetcher);
  },
  create_embeddings(input, fetcher) {
    return qianfanCreateEmbeddings(input, fetcher);
  },
  rerank(input, fetcher) {
    return qianfanRerank(input, fetcher);
  },
  run_paddleocr_vl(input, fetcher) {
    return qianfanRunPaddleOcrVl(input, fetcher);
  },
  run_pp_structure_v3(input, fetcher) {
    return qianfanRunPpStructureV3(input, fetcher);
  },
  create_image_generation(input, fetcher) {
    return qianfanCreateImageGeneration(input, fetcher);
  },
  create_air_image_generation(input, fetcher) {
    return qianfanCreateAirImageGeneration(input, fetcher);
  },
  create_video_generation_task(input, fetcher) {
    return qianfanCreateVideoGenerationTask(input, fetcher);
  },
  get_video_generation_task(input, fetcher) {
    return qianfanGetVideoGenerationTask(input, fetcher);
  },
  cancel_video_generation_task(input, fetcher) {
    return qianfanCancelVideoGenerationTask(input, fetcher);
  },
  list_video_generation_tasks(input, fetcher) {
    return qianfanListVideoGenerationTasks(input, fetcher);
  },
  upload_file(input, fetcher) {
    return qianfanUploadFile(input, fetcher);
  },
  list_files(input, fetcher) {
    return qianfanListFiles(input, fetcher);
  },
  get_file_content(input, fetcher) {
    return qianfanGetFileContent(input, fetcher);
  },
  create_batch(input, fetcher) {
    return qianfanCreateBatch(input, fetcher);
  },
  cancel_batch(input, fetcher) {
    return qianfanCancelBatch(input, fetcher);
  },
  get_batch(input, fetcher) {
    return qianfanGetBatch(input, fetcher);
  },
  list_batches(input, fetcher) {
    return qianfanListBatches(input, fetcher);
  },
  create_response(input, fetcher) {
    return qianfanCreateResponse(input, fetcher);
  },
  get_response(input, fetcher) {
    return qianfanGetResponse(input, fetcher);
  },
  delete_response(input, fetcher) {
    return qianfanDeleteResponse(input, fetcher);
  },
  list_response_input_items(input, fetcher) {
    return qianfanListResponseInputItems(input, fetcher);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "qianfan",
  Object.fromEntries(
    Object.entries(qianfanActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
        handler({ apiKey: context.apiKey, input, transitFiles: context.transitFiles }, context.fetcher),
    ]),
  ),
  { skipDnsValidation: true },
);

export async function validateQianfanCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requireApiKey(input);
  const payload = (await qianfanRequest(apiKey, { path: "/models", mode: "validate" }, fetcher)) as {
    data?: Array<{ id?: unknown }>;
  };
  const availableModels = (Array.isArray(payload.data) ? payload.data : [])
    .map((model) => model.id)
    .filter((model): model is string => typeof model === "string" && model.length > 0);
  return {
    profile: { accountId: "qianfan-api-key", displayName: "Baidu Qianfan API Key", grantedScopes: [] },
    metadata: { validationEndpoint: "/v2/models", availableModels },
  };
}

async function qianfanListModels(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: "/models",
    },
    fetcher,
  );
}

async function qianfanCreateCompletion(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  assertStreamingDisabled(input.input);

  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/completions",
      body: compactObject(withoutStreamOptions(input.input)),
    },
    fetcher,
  );
}

async function qianfanCreateChatCompletion(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  assertStreamingDisabled(input.input);

  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/chat/completions",
      body: compactObject(withoutStreamOptions(input.input)),
    },
    fetcher,
  );
}

async function qianfanCreateAiSearchCompletion(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  assertStreamingDisabled(input.input);

  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/ai_search/chat/completions",
      body: compactObject(withoutStreamOptions(input.input)),
    },
    fetcher,
  );
}

async function qianfanCreateEmbeddings(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/embeddings",
      body: compactObject(input.input),
    },
    fetcher,
  );
}

async function qianfanRerank(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/rerank",
      body: compactObject(input.input),
    },
    fetcher,
  );
}

async function qianfanRunPaddleOcrVl(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/ocr/paddleocr",
      body: compactObject({
        model: input.input.model ?? "paddleocr-vl-0.9b",
        ...input.input,
      }),
    },
    fetcher,
  );
}

async function qianfanRunPpStructureV3(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/ocr/paddleocr",
      body: compactObject({
        model: input.input.model ?? "pp-structurev3",
        ...input.input,
      }),
    },
    fetcher,
  );
}

async function qianfanCreateImageGeneration(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/images/generations",
      body: compactObject(input.input),
    },
    fetcher,
  );
}

async function qianfanCreateAirImageGeneration(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/musesteamer/images/generations",
      body: compactObject({
        model: input.input.model ?? "musesteamer-air-image",
        ...input.input,
      }),
    },
    fetcher,
  );
}

async function qianfanCreateVideoGenerationTask(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/video/generations",
      baseUrl: qianfanApiOrigin,
      body: compactObject(input.input),
    },
    fetcher,
  );
}

async function qianfanGetVideoGenerationTask(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: withQianfanQuery("/video/generations", {
        task_id: requireStringField(input.input, "task_id"),
      }),
      baseUrl: qianfanApiOrigin,
    },
    fetcher,
  );
}

async function qianfanCancelVideoGenerationTask(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "DELETE",
      path: withQianfanQuery("/video/generations", {
        task_id: requireStringField(input.input, "task_id"),
      }),
      baseUrl: qianfanApiOrigin,
    },
    fetcher,
  );
}

async function qianfanListVideoGenerationTasks(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: withQianfanQuery(
        "/video/generations/list",
        compactObject({
          page_num: input.input.page_num,
          page_size: input.input.page_size,
          "filter.status": input.input.status,
          "filter.task_ids": Array.isArray(input.input.task_ids)
            ? (input.input.task_ids as Array<unknown>).join(",")
            : undefined,
          "filter.model_name": input.input.model_name,
          "filter.start_time": input.input.start_time,
          "filter.end_time": input.input.end_time,
        }),
      ),
      baseUrl: qianfanApiOrigin,
    },
    fetcher,
  );
}

async function qianfanUploadFile(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  const uploadSource = await resolveUploadSource(input);
  const formData = new FormData();

  formData.set("file", uploadSource.file);

  if (uploadSource.purpose) {
    formData.set("purpose", uploadSource.purpose);
  }

  return qianfanMultipartRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/files",
    },
    formData,
    fetcher,
  );
}

async function qianfanListFiles(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: withQianfanQuery("/files", compactObject(input.input)),
    },
    fetcher,
  );
}

async function qianfanGetFileContent(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanTextRequest(
    input.apiKey,
    {
      path: `/files/${encodePathSegment(requireStringField(input.input, "file_id"))}/content`,
    },
    fetcher,
  );
}

async function qianfanCreateBatch(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/batches",
      body: compactObject(input.input),
    },
    fetcher,
  );
}

async function qianfanCancelBatch(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  const batchId = requireStringField(input.input, "batch_id");
  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: `/batches/${encodePathSegment(batchId)}/cancel`,
    },
    fetcher,
  );
}

async function qianfanGetBatch(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  const batchId = requireStringField(input.input, "batch_id");
  return qianfanRequest(
    input.apiKey,
    {
      path: `/batches/${encodePathSegment(batchId)}`,
    },
    fetcher,
  );
}

async function qianfanListBatches(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: withQianfanQuery("/batches", compactObject(input.input)),
    },
    fetcher,
  );
}

async function qianfanCreateResponse(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  assertStreamingDisabled(input.input);

  return qianfanRequest(
    input.apiKey,
    {
      method: "POST",
      path: "/responses",
      body: compactObject(withoutStreamOptions(input.input)),
    },
    fetcher,
  );
}

async function qianfanGetResponse(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: `/responses/${encodePathSegment(requireStringField(input.input, "response_id"))}`,
    },
    fetcher,
  );
}

async function qianfanDeleteResponse(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      method: "DELETE",
      path: `/responses/${encodePathSegment(requireStringField(input.input, "response_id"))}`,
    },
    fetcher,
  );
}

async function qianfanListResponseInputItems(input: ApiKeyProviderActionInput, fetcher: typeof fetch) {
  return qianfanRequest(
    input.apiKey,
    {
      path: withQianfanQuery(
        `/responses/${encodePathSegment(requireStringField(input.input, "response_id"))}/input_items`,
        compactObject({
          after: input.input.after,
          before: input.input.before,
          limit: input.input.limit,
          order: input.input.order,
        }),
      ),
    },
    fetcher,
  );
}

async function qianfanRequest(apiKey: string, input: QianfanRequestInput, fetcher: typeof fetch) {
  const method = input.method ?? "GET";
  let response: Response;
  try {
    response = await fetcher(`${input.baseUrl ?? qianfanApiBaseUrl}${input.path}`, {
      method,
      headers: qianfanHeaders(apiKey),
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown network error";
    throw qianfanError(
      "provider_error",
      `qianfan ${method} ${input.path} failed before receiving response: ${message}`,
    );
  }

  await assertQianfanResponse(response, input.mode ?? "execute");
  return readQianfanJson(response);
}

async function qianfanMultipartRequest(
  apiKey: string,
  input: QianfanRequestInput,
  body: FormData,
  fetcher: typeof fetch,
) {
  const method = input.method ?? "POST";
  let response: Response;
  try {
    response = await fetcher(`${input.baseUrl ?? qianfanApiBaseUrl}${input.path}`, {
      method,
      headers: qianfanHeaders(apiKey, false),
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown network error";
    throw qianfanError(
      "provider_error",
      `qianfan ${method} ${input.path} failed before receiving response: ${message}`,
    );
  }

  await assertQianfanResponse(response, input.mode ?? "execute");
  return readQianfanJson(response);
}

async function qianfanTextRequest(apiKey: string, input: QianfanRequestInput, fetcher: typeof fetch) {
  const method = input.method ?? "GET";
  let response: Response;
  try {
    response = await fetcher(`${input.baseUrl ?? qianfanApiBaseUrl}${input.path}`, {
      method,
      headers: qianfanHeaders(apiKey),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown network error";
    throw qianfanError(
      "provider_error",
      `qianfan ${method} ${input.path} failed before receiving response: ${message}`,
    );
  }

  await assertQianfanResponse(response, input.mode ?? "execute");

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw qianfanError(
      "provider_error",
      error instanceof Error
        ? `failed to read qianfan response body: ${error.message}`
        : "failed to read qianfan response body",
      response.status,
    );
  }

  return {
    content: text,
    content_type: response.headers.get("content-type") ?? undefined,
  };
}

function qianfanHeaders(apiKey: string, includeJsonContentType = true) {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    ...(includeJsonContentType ? { "content-type": "application/json" } : {}),
    "user-agent": qianfanUserAgent,
  };
}

function assertStreamingDisabled(input: Record<string, unknown>) {
  if (input.stream === true) {
    throw qianfanError("invalid_input", "stream=true is not supported by connector actions", 400);
  }
}

function withoutStreamOptions(input: Record<string, unknown>) {
  const { stream_options: _streamOptions, ...rest } = input;
  return rest;
}

function requireStringField(input: Record<string, unknown>, field: string) {
  const value = input[field];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw qianfanError("invalid_input", `${field} must be a non-empty string`, 400);
}

function withQianfanQuery(path: string, query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

async function resolveUploadSource(input: ApiKeyProviderActionInput): Promise<UploadSource> {
  const transitFile = await readTransitFileInput(input.input.file, input);
  return {
    file: transitFile.file,
    purpose:
      typeof input.input.purpose === "string" && input.input.purpose.trim() ? input.input.purpose.trim() : undefined,
  };
}

async function assertQianfanResponse(response: Response, mode: "validate" | "execute") {
  if (response.ok) {
    return;
  }

  const error = await readQianfanError(response);
  if (response.status === 429) {
    throw qianfanError("rate_limited", error.message, 429);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw qianfanError("invalid_input", error.message, 400);
  }
  if (mode === "execute" && response.status === 401) {
    throw qianfanError("credential_expired", error.message);
  }
  if (response.status === 400 || response.status === 422) {
    throw qianfanError("invalid_input", error.message, 400);
  }

  throw qianfanError("provider_error", error.message, response.status);
}

async function readQianfanJson(response: Response) {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw qianfanError(
      "provider_error",
      error instanceof Error
        ? `failed to read qianfan response body: ${error.message}`
        : "failed to read qianfan response body",
      response.status,
    );
  }
  if (response.status === 204 || text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw qianfanError(
      "provider_error",
      `qianfan returned invalid JSON with ${response.status}: ${text.slice(0, 200)}`,
      response.status,
    );
  }
}

async function readQianfanError(response: Response) {
  const raw = await response.text().catch(() => "");

  try {
    const payload = (raw ? JSON.parse(raw) : {}) as {
      type?: unknown;
      code?: unknown;
      message?: unknown;
      error?: unknown;
      error_code?: unknown;
      error_msg?: unknown;
      msg?: unknown;
    };
    const nestedError =
      payload.error && typeof payload.error === "object"
        ? (payload.error as { type?: unknown; code?: unknown; message?: unknown; msg?: unknown })
        : null;

    return {
      type:
        typeof nestedError?.type === "string"
          ? nestedError.type
          : typeof payload.type === "string"
            ? payload.type
            : "provider_error",
      code:
        typeof nestedError?.code === "string"
          ? nestedError.code
          : typeof payload.code === "string"
            ? payload.code
            : typeof payload.error_code === "string"
              ? payload.error_code
              : undefined,
      message:
        typeof nestedError?.message === "string"
          ? nestedError.message
          : typeof nestedError?.msg === "string"
            ? nestedError.msg
            : typeof payload.message === "string"
              ? payload.message
              : typeof payload.error_msg === "string"
                ? payload.error_msg
                : typeof payload.msg === "string"
                  ? payload.msg
                  : raw || `qianfan request failed with ${response.status}`,
    };
  } catch {
    return {
      type: "provider_error",
      code: undefined,
      message: raw || `qianfan request failed with ${response.status}`,
    };
  }
}
