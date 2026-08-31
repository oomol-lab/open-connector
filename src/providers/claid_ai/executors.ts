import type { ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "claid_ai";
const claidAiApiBaseUrl = "https://api.claid.ai";
const claidAiApiVersion = "v1";
const claidAiEditPath = "/image/edit";
const claidAiEditAsyncPath = "/image/edit/async";

type ClaidAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type ClaidAiRequestPhase = "validate" | "execute";

export const claidAiActionHandlers: ProviderActionHandlers<"claid_ai", ClaidAiActionHandler> = {
  async edit_image(input, context) {
    const payload = await requestClaidAi(
      claidAiEditPath,
      { method: "POST", body: buildEditRequestBody(input) },
      context,
      "execute",
    );
    return { result: normalizeEditResult(payload) };
  },
  async submit_edit_image(input, context) {
    const payload = await requestClaidAi(
      claidAiEditAsyncPath,
      { method: "POST", body: buildEditRequestBody(input) },
      context,
      "execute",
    );
    return { task: normalizeAsyncTask(payload) };
  },
  async get_edit_task(input, context) {
    const taskId = requireTaskId(input.taskId);
    const payload = await requestClaidAi(`${claidAiEditAsyncPath}/${taskId}`, { method: "GET" }, context, "execute");
    return { task: normalizeAsyncTask(payload) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, claidAiActionHandlers);

function buildEditRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    input: requireInputString(input.input, "input"),
    operations: requireInputRecord(input.operations, "operations"),
    output: input.output,
  });
}

async function requestClaidAi(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ClaidAiRequestPhase,
): Promise<unknown> {
  const url = new URL(`/${claidAiApiVersion}${path}`, claidAiApiBaseUrl);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: init.method,
      headers: claidAiHeaders(context.apiKey, init.body !== undefined),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: context.signal,
    });
    payload = await readClaidAiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Claid request failed: ${error.message}` : "Claid request failed",
    );
  }

  if (!response.ok) {
    throw createClaidAiError(response, payload, phase);
  }
  return payload;
}

function claidAiHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readClaidAiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createClaidAiError(response: Response, payload: unknown, phase: ClaidAiRequestPhase): ProviderRequestError {
  const message = extractClaidAiErrorMessage(payload) ?? response.statusText ?? "Claid request failed";
  if (response.status === 402 || response.status === 429 || response.status === 503) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractClaidAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error_message) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function normalizeEditResult(payload: unknown): Record<string, unknown> {
  const data = unwrapClaidResponseData(payload, "edit response");
  return compactObject({
    input: normalizeProcessingImage(requiredResponseRecord(data.input, "data.input")),
    output: normalizeProcessingImage(requiredResponseRecord(data.output, "data.output")),
    profiling: data.profiling,
  });
}

function normalizeAsyncTask(payload: unknown): Record<string, unknown> {
  const data = unwrapClaidResponseData(payload, "async task response");
  const request = requiredResponseRecord(data.request, "data.request");
  return {
    id: requireResponseInteger(data.id, "id"),
    status: requireInputString(data.status, "status"),
    result_url: optionalNonEmptyString(data.result_url) ?? null,
    created_at: requireInputString(data.created_at, "created_at"),
    request: normalizeRequestEcho(request),
    errors: Array.isArray(data.errors)
      ? data.errors.map((item, index) => normalizeAsyncError(item, `errors[${index}]`))
      : [],
    result: optionalRecord(data.result) ? normalizeAsyncResult(data.result) : null,
  };
}

function normalizeAsyncError(value: unknown, label: string): Record<string, unknown> {
  const record = requiredResponseRecord(value, label);
  const inputObject = optionalRecord(record.input_object);
  return compactObject({
    error: optionalNonEmptyString(record.error),
    created_at: optionalNonEmptyString(record.created_at),
    input_object: inputObject ? normalizeProcessingImage(inputObject) : undefined,
  });
}

function normalizeAsyncResult(value: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(value, "result");
  return {
    input_object: normalizeProcessingImage(requiredResponseRecord(record.input_object, "result.input_object")),
    output_object: normalizeProcessingImage(requiredResponseRecord(record.output_object, "result.output_object")),
  };
}

function normalizeRequestEcho(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    input: requireInputString(record.input, "request.input"),
    operations: requiredResponseRecord(record.operations, "request.operations"),
    output: record.output,
  });
}

function normalizeProcessingImage(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ext: requireInputString(record.ext, "ext"),
    mps: requireResponseNumber(record.mps, "mps"),
    mime: requireInputString(record.mime, "mime"),
    format: requireInputString(record.format, "format"),
    width: requireResponseInteger(record.width, "width"),
    height: requireResponseInteger(record.height, "height"),
    tmp_url: optionalNonEmptyString(record.tmp_url),
    object_key: optionalNonEmptyString(record.object_key),
    object_bucket: optionalNonEmptyString(record.object_bucket),
    object_uri: optionalNonEmptyString(record.object_uri),
    claid_storage_uri: optionalNonEmptyString(record.claid_storage_uri),
  });
}

function unwrapClaidResponseData(payload: unknown, label: string): Record<string, unknown> {
  const record = requiredResponseRecord(payload, label);
  return requiredResponseRecord(record.data, `${label}.data`);
}

function requireInputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function requireInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function optionalNonEmptyString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function requireTaskId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, "taskId must be an integer");
  }
  return value;
}

function requireResponseNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be a number`);
  }
  return value;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value;
}
