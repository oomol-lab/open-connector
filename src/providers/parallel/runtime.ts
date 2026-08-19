import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const parallelApiBaseUrl = "https://api.parallel.ai";

type ParallelActionContext = ApiKeyProviderContext;

type ParallelActionHandler = (input: Record<string, unknown>, context: ParallelActionContext) => Promise<unknown>;

export const parallelActionHandlers: ProviderActionHandlers<"parallel", ParallelActionHandler> = {
  async search(input, context) {
    const payload = await requestParallel({
      path: "/v1/search",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: compactObject({
        objective: input.objective,
        search_queries: input.search_queries,
        mode: input.mode,
        max_chars_total: input.max_chars_total,
        session_id: input.session_id,
        client_model: input.client_model,
        advanced_settings: input.advanced_settings,
      }),
    });
    return {
      ...normalizeSearchResponse(asRecord(payload)),
      raw: asRecord(payload),
    };
  },

  async extract(input, context) {
    const payload = await requestParallel({
      path: "/v1/extract",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: compactObject({
        urls: input.urls,
        objective: input.objective,
        search_queries: input.search_queries,
        max_chars_total: input.max_chars_total,
        session_id: input.session_id,
        client_model: input.client_model,
        advanced_settings: input.advanced_settings,
      }),
    });
    return {
      ...normalizeExtractResponse(asRecord(payload)),
      raw: asRecord(payload),
    };
  },

  async create_task_run(input, context) {
    const payload = await requestParallel({
      path: "/v1/tasks/runs",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parallelBeta: optionalString(input.parallel_beta),
      body: compactObject({
        processor: input.processor,
        input: input.input,
        metadata: input.metadata,
        source_policy: input.source_policy,
        advanced_settings: input.advanced_settings,
        task_spec: input.task_spec,
        previous_interaction_id: input.previous_interaction_id,
        enable_events: input.enable_events,
        webhook: input.webhook,
      }),
    });
    return { run: normalizeTaskRun(asRecord(payload)) };
  },

  async retrieve_task_run(input, context) {
    const payload = await requestParallel({
      path: `/v1/tasks/runs/${encodeURIComponent(String(input.run_id))}`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
    });
    return { run: normalizeTaskRun(asRecord(payload)) };
  },

  async retrieve_task_run_result(input, context) {
    const query: Array<[string, unknown]> = [["timeout", input.timeout]];
    const payload = await requestParallel({
      path: `/v1/tasks/runs/${encodeURIComponent(String(input.run_id))}/result`,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query,
      parallelBeta: optionalString(input.parallel_beta),
    });
    const record = asRecord(payload);
    return {
      run: normalizeTaskRun(asRecord(record.run)),
      output: asRecord(record.output),
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("parallel", parallelActionHandlers);

export async function validateParallelCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestParallel({
    path: "/v1/search",
    method: "POST",
    apiKey,
    fetcher,
    body: {
      search_queries: ["Parallel Web Systems"],
      mode: "turbo",
      max_chars_total: 1000,
    },
    phase: "validate",
  });
  const record = asRecord(payload);
  return {
    profile: {
      accountId: optionalString(record.search_id) ?? "parallel-api-key",
      displayName: optionalString(record.search_id) ?? "Parallel API key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: parallelApiBaseUrl,
      sessionId: optionalString(record.session_id),
    },
  };
}

async function requestParallel(input: {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  query?: Array<[string, unknown]>;
  body?: unknown;
  phase?: "validate" | "execute";
  parallelBeta?: string;
}) {
  const url = new URL(`${parallelApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: buildParallelHeaders(input.apiKey, input.body !== undefined, input.parallelBeta),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Parallel request failed: ${error.message}` : "Parallel request failed",
    );
  }

  const payload = await readParallelPayload(response);
  if (!response.ok) {
    throw mapParallelHttpError(response.status, payload, input.phase ?? "execute");
  }
  return payload;
}

function buildParallelHeaders(apiKey: string, hasBody: boolean, parallelBeta?: string) {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  if (parallelBeta) {
    headers.set("parallel-beta", parallelBeta);
  }
  return headers;
}

async function readParallelPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Parallel returned invalid JSON");
  }
}

function mapParallelHttpError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = readParallelErrorMessage(payload) ?? `Parallel request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status === 408) {
    return new ProviderRequestError(504, message);
  }
  if (status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message);
  }
  return new ProviderRequestError(502, message);
}

function readParallelErrorMessage(payload: unknown) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return optionalString(error.message) ?? optionalString(record.message);
}

function appendQueryValue(url: URL, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function normalizeSearchResponse(record: Record<string, unknown>) {
  return {
    search_id: optionalString(record.search_id) ?? "",
    results: asRecordArray(record.results),
    warnings: asNullableRecordArray(record.warnings),
    usage: asNullableRecordArray(record.usage),
    session_id: optionalString(record.session_id) ?? "",
  };
}

function normalizeExtractResponse(record: Record<string, unknown>) {
  return {
    extract_id: optionalString(record.extract_id) ?? "",
    results: asRecordArray(record.results),
    errors: asRecordArray(record.errors),
    warnings: asNullableRecordArray(record.warnings),
    usage: asNullableRecordArray(record.usage),
    session_id: optionalString(record.session_id) ?? "",
  };
}

function normalizeTaskRun(record: Record<string, unknown>) {
  return {
    ...record,
    run_id: optionalString(record.run_id) ?? "",
    interaction_id: optionalString(record.interaction_id) ?? "",
    status: optionalString(record.status) ?? "",
    is_active: typeof record.is_active === "boolean" ? record.is_active : false,
    processor: optionalString(record.processor) ?? "",
    created_at: optionalString(record.created_at) ?? null,
    modified_at: optionalString(record.modified_at) ?? null,
  };
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(asRecord);
}

function asNullableRecordArray(value: unknown) {
  if (value === null) {
    return null;
  }
  return Array.isArray(value) ? value.map(asRecord) : null;
}
