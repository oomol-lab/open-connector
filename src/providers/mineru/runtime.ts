import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const mineruApiBaseUrl = "https://mineru.net";
const mineruValidationTaskId = "oomol-connector-validation";

type MineruRequestPhase = "validate" | "execute";
type MineruActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MineruActionHandler = (input: Record<string, unknown>, context: MineruActionContext) => Promise<unknown>;

interface MineruRequestInput {
  method?: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  phase: MineruRequestPhase;
}

export const mineruActionHandlers: ProviderActionHandlers<"mineru", MineruActionHandler> = {
  create_extract_task(input, context) {
    return createExtractTask(input, context);
  },
  get_extract_task(input, context) {
    return getExtractTask(input, context);
  },
  create_extract_batch(input, context) {
    return createExtractBatch(input, context);
  },
  get_extract_batch_results(input, context) {
    return getExtractBatchResults(input, context);
  },
};

export async function validateMineruCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedApiKey = requiredInputString(apiKey, "apiKey");
  const response = await mineruFetch(
    normalizedApiKey,
    {
      path: `/api/v4/extract/task/${encodeURIComponent(mineruValidationTaskId)}`,
      phase: "validate",
    },
    fetcher,
    signal,
  );

  if (!response.ok) {
    await assertMineruResponse(response, "validate");
  }

  return {
    profile: {
      accountId: "mineru",
      displayName: "MinerU API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mineruApiBaseUrl,
      validationEndpoint: `/api/v4/extract/task/${mineruValidationTaskId}`,
    },
  };
}

async function createExtractTask(input: Record<string, unknown>, context: MineruActionContext): Promise<unknown> {
  const envelope = await mineruJsonRequest(
    context.apiKey,
    {
      path: "/api/v4/extract/task",
      method: "POST",
      body: buildCreateTaskBody(input),
      phase: "execute",
    },
    context,
  );
  const data = requireProviderObject(envelope.data, "mineru create_extract_task data");

  return compactObject({
    task_id: requireProviderString(data.task_id, "mineru create_extract_task task_id"),
    trace_id: optionalString(envelope.trace_id),
    msg: optionalString(envelope.msg),
  });
}

async function getExtractTask(input: Record<string, unknown>, context: MineruActionContext): Promise<unknown> {
  const taskId = requiredInputString(input.task_id, "mineru task_id");
  const envelope = await mineruJsonRequest(
    context.apiKey,
    {
      path: `/api/v4/extract/task/${encodeURIComponent(taskId)}`,
      phase: "execute",
    },
    context,
  );

  return normalizeTaskResult(requireProviderObject(envelope.data, "mineru get_extract_task data"));
}

async function createExtractBatch(input: Record<string, unknown>, context: MineruActionContext): Promise<unknown> {
  const envelope = await mineruJsonRequest(
    context.apiKey,
    {
      path: "/api/v4/extract/task/batch",
      method: "POST",
      body: buildCreateBatchBody(input),
      phase: "execute",
    },
    context,
  );
  const data = requireProviderObject(envelope.data, "mineru create_extract_batch data");

  return compactObject({
    batch_id: requireProviderString(data.batch_id, "mineru create_extract_batch batch_id"),
    trace_id: optionalString(envelope.trace_id),
    msg: optionalString(envelope.msg),
  });
}

async function getExtractBatchResults(input: Record<string, unknown>, context: MineruActionContext): Promise<unknown> {
  const batchId = requiredInputString(input.batch_id, "mineru batch_id");
  const envelope = await mineruJsonRequest(
    context.apiKey,
    {
      path: `/api/v4/extract-results/batch/${encodeURIComponent(batchId)}`,
      phase: "execute",
    },
    context,
  );
  const data = requireProviderObject(envelope.data, "mineru get_extract_batch_results data");
  const rawResults = data.extract_result;
  if (!Array.isArray(rawResults)) {
    throw new ProviderRequestError(502, "mineru get_extract_batch_results response.extract_result is invalid");
  }

  return compactObject({
    batch_id: requireProviderString(data.batch_id, "mineru get_extract_batch_results batch_id"),
    extract_result: rawResults.map((item, index) => normalizeBatchResult(item, `mineru batch result ${index}`)),
    trace_id: optionalString(envelope.trace_id),
    msg: optionalString(envelope.msg),
  });
}

function buildCreateTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: readPublicDocumentUrl(input.url, "url"),
    is_ocr: optionalBoolean(input.is_ocr),
    enable_formula: optionalBoolean(input.enable_formula),
    enable_table: optionalBoolean(input.enable_table),
    language: optionalString(input.language),
    data_id: optionalString(input.data_id),
    extra_formats: optionalStringArray(input.extra_formats),
    page_ranges: optionalString(input.page_ranges),
    model_version: optionalString(input.model_version),
    no_cache: optionalBoolean(input.no_cache),
    cache_tolerance: optionalInteger(input.cache_tolerance),
  });
}

function buildCreateBatchBody(input: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(input.files)) {
    throw new ProviderRequestError(400, "mineru files must be an array");
  }

  return compactObject({
    files: input.files.map((item, index) => {
      const file = requireInputObject(item, `mineru files ${index}`);
      return compactObject({
        url: readPublicDocumentUrl(file.url, `files[${index}].url`),
        is_ocr: optionalBoolean(file.is_ocr),
        data_id: optionalString(file.data_id),
        page_ranges: optionalString(file.page_ranges),
      });
    }),
    enable_formula: optionalBoolean(input.enable_formula),
    enable_table: optionalBoolean(input.enable_table),
    language: optionalString(input.language),
    extra_formats: optionalStringArray(input.extra_formats),
    model_version: optionalString(input.model_version),
    no_cache: optionalBoolean(input.no_cache),
    cache_tolerance: optionalInteger(input.cache_tolerance),
  });
}

async function mineruJsonRequest(
  apiKey: string,
  input: MineruRequestInput,
  context: MineruActionContext,
): Promise<Record<string, unknown>> {
  const response = await mineruFetch(apiKey, input, context.fetcher, context.signal);
  await assertMineruResponse(response, input.phase);
  const payload = await readMineruJson(response);
  const envelope = requireProviderObject(payload, "mineru response");
  assertMineruEnvelope(envelope, input.phase);
  return envelope;
}

async function mineruFetch(
  apiKey: string,
  input: MineruRequestInput,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  let body: string | undefined;
  if (input.body) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input.body);
  }

  try {
    return await fetcher(new URL(input.path, mineruApiBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body,
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MinerU request failed: ${error.message}` : "MinerU request failed",
    );
  }
}

async function assertMineruResponse(response: Response, phase: MineruRequestPhase): Promise<void> {
  if (response.ok) {
    return;
  }

  const message = await readMineruErrorMessage(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, message);
  }

  throw new ProviderRequestError(response.status || 502, message);
}

function assertMineruEnvelope(envelope: Record<string, unknown>, phase: MineruRequestPhase): void {
  const code = typeof envelope.code === "number" ? envelope.code : undefined;
  if (code === 0 || code === undefined) {
    return;
  }

  const message = optionalString(envelope.msg) ?? `MinerU API returned code ${code}`;
  if (code === -60018 || code === -60019) {
    throw new ProviderRequestError(429, message, envelope);
  }
  if (phase === "validate") {
    throw new ProviderRequestError(400, message, envelope);
  }
  throw new ProviderRequestError(400, message, envelope);
}

async function readMineruJson(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `failed to read mineru response body: ${error.message}`
        : "failed to read mineru response body",
    );
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "mineru response is not valid JSON");
  }
}

async function readMineruErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await readMineruJson(response);
    const object = optionalRecord(payload);
    return (
      optionalString(object?.msg) ??
      optionalString(object?.message) ??
      `MinerU API request failed with status ${response.status}`
    );
  } catch {
    return `MinerU API request failed with status ${response.status}`;
  }
}

function normalizeTaskResult(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    task_id: requireProviderString(input.task_id, "mineru task_id"),
    data_id: optionalString(input.data_id),
    state: requireProviderString(input.state, "mineru state"),
    full_zip_url: optionalString(input.full_zip_url),
    err_msg: optionalString(input.err_msg),
    extract_progress: normalizeProgress(input.extract_progress),
  });
}

function normalizeBatchResult(input: unknown, label: string): Record<string, unknown> {
  const object = requireProviderObject(input, label);
  return compactObject({
    file_name: optionalString(object.file_name),
    data_id: optionalString(object.data_id),
    state: requireProviderString(object.state, `${label} state`),
    full_zip_url: optionalString(object.full_zip_url),
    err_msg: optionalString(object.err_msg),
    extract_progress: normalizeProgress(object.extract_progress),
  });
}

function normalizeProgress(input: unknown): Record<string, unknown> | undefined {
  const object = optionalRecord(input);
  if (!object) {
    return undefined;
  }

  return compactObject({
    extracted_pages: optionalInteger(object.extracted_pages),
    total_pages: optionalInteger(object.total_pages),
    start_time: optionalString(object.start_time),
  });
}

function readPublicDocumentUrl(value: unknown, fieldName: string): string {
  const url = requiredInputString(value, fieldName);
  return assertPublicHttpUrl(url, {
    fieldName,
    createError: (message) => new ProviderRequestError(400, message),
  }).toString();
}

function requireInputObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${label} must be an object`);
  }
  return object;
}

function requireProviderObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return object;
}

function requireProviderString(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  throw new ProviderRequestError(502, `${label} is missing`);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }
  return value.map((item) => String(item));
}
