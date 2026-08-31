import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredResponseRecord } from "../provider-runtime.ts";

const vectorshiftApiBaseUrl = "https://api.vectorshift.ai/v1";
const listPipelinesPath = "/pipelines";
const fetchPipelinePath = "/pipeline";

type VectorshiftActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const vectorshiftActionHandlers: ProviderActionHandlers<"vectorshift", VectorshiftActionHandler> = {
  list_pipelines(input, context) {
    return executeListPipelines(input, context);
  },
  get_pipeline(input, context) {
    return executeGetPipeline(input, context);
  },
  run_pipeline(input, context) {
    return executeRunPipeline(input, context);
  },
  bulk_run_pipeline(input, context) {
    return executeBulkRunPipeline(input, context);
  },
};

export async function validateVectorshiftCredential(
  apiKey: string,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  const payload = await requestVectorshiftJson(
    buildVectorshiftUrl(listPipelinesPath),
    {
      method: "GET",
      headers: vectorshiftHeaders(apiKey, { accept: "application/json" }),
    },
    "validate",
    fetcher,
  );
  const record = requiredResponseRecord(payload, "VectorShift pipeline list response");
  const pipelineIds = Array.isArray(record.object_ids)
    ? record.object_ids.filter((value): value is string => typeof value === "string")
    : [];
  return {
    profile: {
      accountId: "vectorshift-api-key",
      displayName: "VectorShift API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: vectorshiftApiBaseUrl,
      validationEndpoint: listPipelinesPath,
      pipelineCount: pipelineIds.length,
      pipelineIds,
    },
  };
}

async function executeListPipelines(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = buildVectorshiftUrl(listPipelinesPath);
  setOptionalBoolean(url, "include_shared", input.include_shared);
  setOptionalBoolean(url, "verbose", input.verbose);
  const payload = await requestVectorshiftJson(
    url,
    {
      method: "GET",
      headers: vectorshiftHeaders(context.apiKey, { accept: "application/json" }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
  const record = requiredResponseRecord(payload, "VectorShift pipeline list response");
  return {
    status: typeof record.status === "string" ? record.status : "success",
    pipeline_ids: Array.isArray(record.object_ids)
      ? record.object_ids.filter((value): value is string => typeof value === "string")
      : [],
    pipelines: Array.isArray(record.objects)
      ? record.objects.filter((value) => value && typeof value === "object")
      : [],
  };
}

async function executeGetPipeline(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = buildVectorshiftUrl(fetchPipelinePath);
  setOptionalString(url, "id", input.pipeline_id);
  setOptionalString(url, "name", input.name);
  setOptionalString(url, "username", input.username);
  setOptionalString(url, "org_name", input.org_name);
  if (!url.searchParams.has("id") && !url.searchParams.has("name")) {
    throw new ProviderRequestError(400, "pipeline_id or name is required");
  }
  const payload = await requestVectorshiftJson(
    url,
    {
      method: "GET",
      headers: vectorshiftHeaders(context.apiKey, { accept: "application/json" }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
  const record = requiredResponseRecord(payload, "VectorShift pipeline fetch response");
  return {
    status: typeof record.status === "string" ? record.status : "success",
    pipeline: requiredResponseRecord(record.object, "VectorShift pipeline"),
  };
}

async function executeRunPipeline(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const pipelineId = requireTrimmedString(input.pipeline_id, "pipeline_id");
  const inputs = requiredResponseRecord(input.inputs, "inputs");
  assertJsonSafeRecord(inputs);
  return requestVectorshiftJson(
    buildVectorshiftUrl(`/pipeline/${encodeURIComponent(pipelineId)}/run`),
    {
      method: "POST",
      headers: vectorshiftHeaders(context.apiKey, { accept: "application/json", "content-type": "application/json" }),
      body: JSON.stringify({ inputs }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
}

async function executeBulkRunPipeline(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const pipelineId = requireTrimmedString(input.pipeline_id, "pipeline_id");
  if (!Array.isArray(input.runs)) {
    throw new ProviderRequestError(400, "runs must be an array");
  }
  const runs = input.runs.map((run, index) => {
    const runRecord = requiredResponseRecord(run, `runs[${index}]`);
    const inputs = requiredResponseRecord(runRecord.inputs, `runs[${index}].inputs`);
    assertJsonSafeRecord(inputs);
    return { inputs };
  });
  return requestVectorshiftJson(
    buildVectorshiftUrl(`/pipeline/${encodeURIComponent(pipelineId)}/bulk_run`),
    {
      method: "POST",
      headers: vectorshiftHeaders(context.apiKey, { accept: "application/json", "content-type": "application/json" }),
      body: JSON.stringify({ runs }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
}

function buildVectorshiftUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${vectorshiftApiBaseUrl}/`);
}

function vectorshiftHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function requestVectorshiftJson(
  url: URL,
  init: RequestInit,
  phase: "validate" | "execute",
  fetcher: ProviderFetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `vectorshift request failed: ${error.message}` : "vectorshift request failed",
    );
  }
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw createVectorshiftError(response, payload, phase);
  }
  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createVectorshiftError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `vectorshift request failed with ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && (response.status === 401 || response.status === 403))
    return new ProviderRequestError(400, message);
  if (phase === "execute" && (response.status === 401 || response.status === 403))
    return new ProviderRequestError(401, message);
  if (response.status >= 400 && response.status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(response.status || 502, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  const nestedError = optionalRecord(record.error);
  return optionalString(nestedError?.message);
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  return trimmed;
}

function setOptionalBoolean(url: URL, key: string, value: unknown): void {
  if (typeof value === "boolean") url.searchParams.set(key, value ? "true" : "false");
}

function setOptionalString(url: URL, key: string, value: unknown): void {
  const trimmed = optionalString(value);
  if (trimmed) url.searchParams.set(key, trimmed);
}

function assertJsonSafeRecord(record: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(record)) {
    assertJsonSafeValue(value, key);
  }
}

function assertJsonSafeValue(value: unknown, path: string): void {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafeValue(item, `${path}[${index}]`));
    return;
  }
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(400, `${path} is not JSON-safe`);
  if (record.type === "file") {
    throw new ProviderRequestError(
      400,
      "file inputs are not supported in the VectorShift connector; use JSON-safe inputs only",
    );
  }
  if (record.type === "map") {
    const items = optionalRecord(record.items);
    if (!items) throw new ProviderRequestError(400, `${path}.items must be an object`);
    assertJsonSafeRecord(items);
    return;
  }
  for (const [childKey, childValue] of Object.entries(record)) {
    assertJsonSafeValue(childValue, `${path}.${childKey}`);
  }
}
