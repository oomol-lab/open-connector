import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalIntegerOrNull,
  optionalNumber,
  optionalObjectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { compactJson } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const promptLayerApiBaseUrl = "https://api.promptlayer.com";

type PromptLayerPhase = "validate" | "execute";
type PromptLayerMethod = "GET" | "POST";
type PromptLayerQueryValue = string | number | boolean | string[] | undefined;

interface PromptLayerRequestInput {
  method: PromptLayerMethod;
  path: string;
  query?: Record<string, PromptLayerQueryValue>;
  body?: Record<string, unknown>;
  context: ApiKeyProviderContext;
  phase: PromptLayerPhase;
}

export const promptLayerActionHandlers: ProviderActionHandlers<
  "promptlayer",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_request(input, context) {
    const payload = await requestPromptLayerJson({
      method: "GET",
      path: `/api/public/v2/requests/${encodeURIComponent(String(input.requestId))}`,
      context,
      phase: "execute",
    });
    return {
      request: normalizeRequestLog(payload),
    };
  },

  async list_prompt_templates(input, context) {
    const payload = await requestPromptLayerJson({
      method: "GET",
      path: "/prompt-templates",
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        label: optionalString(input.label),
        name: optionalString(input.name),
        tags: input.tags === undefined ? undefined : requiredStringArray(input.tags, "tags"),
        status: optionalString(input.status),
        external_source: optionalString(input.externalSource),
        external_id: optionalString(input.externalId),
        created_by_email: optionalString(input.createdByEmail),
        created_after: optionalString(input.createdAfter),
        created_before: optionalString(input.createdBefore),
        updated_after: optionalString(input.updatedAfter),
        updated_before: optionalString(input.updatedBefore),
        sort_by: optionalString(input.sortBy),
        sort_order: optionalString(input.sortOrder),
        is_snippet: optionalBoolean(input.isSnippet),
      },
      context,
      phase: "execute",
    });
    return normalizePromptTemplateList(payload);
  },

  async get_prompt_template(input, context) {
    const identifier = requiredString(input.identifier, "identifier");
    const body = compactJson({
      version: input.version,
      workspace_id: input.workspaceId,
      label: input.label,
      provider: input.provider,
      input_variables: input.inputVariables,
      metadata_filters: input.metadataFilters,
      model: input.model,
      model_parameter_overrides: input.modelParameterOverrides,
    }) as Record<string, unknown>;
    const payload = await requestPromptLayerJson({
      method: "POST",
      path: `/prompt-templates/${encodeURIComponent(identifier)}`,
      body,
      context,
      phase: "execute",
    });
    return {
      promptTemplate: normalizePromptTemplate(payload),
    };
  },

  async list_tables(input, context) {
    const payload = await requestPromptLayerJson({
      method: "GET",
      path: "/api/public/v2/tables",
      query: {
        folder_id: optionalInteger(input.folderId),
        name: optionalString(input.name),
        cursor: optionalString(input.cursor),
        limit: optionalInteger(input.limit),
        order: optionalString(input.order),
        prompt_id: optionalInteger(input.promptId),
        prompt_version_id: optionalInteger(input.promptVersionId),
        prompt_label_id: optionalInteger(input.promptLabelId),
      },
      context,
      phase: "execute",
    });
    return normalizeTableList(payload);
  },

  async list_table_sheets(input, context) {
    const payload = await requestPromptLayerJson({
      method: "GET",
      path: `/api/public/v2/tables/${encodeURIComponent(String(input.tableId))}/sheets`,
      query: {
        cursor: optionalString(input.cursor),
        limit: optionalInteger(input.limit),
        order: optionalString(input.order),
        prompt_id: optionalInteger(input.promptId),
        prompt_version_id: optionalInteger(input.promptVersionId),
        prompt_label_id: optionalInteger(input.promptLabelId),
      },
      context,
      phase: "execute",
    });
    return normalizeSheetList(payload);
  },

  async list_table_sheet_rows(input, context) {
    const payload = await requestPromptLayerJson({
      method: "GET",
      path: `/api/public/v2/tables/${encodeURIComponent(String(input.tableId))}/sheets/${encodeURIComponent(String(input.sheetId))}/rows`,
      query: {
        include_system_columns: optionalBoolean(input.includeSystemColumns),
        include_execution_metadata_aggregates: optionalBoolean(input.includeExecutionMetadataAggregates),
        cursor: optionalString(input.cursor),
        limit: optionalInteger(input.limit),
        order: optionalString(input.order),
        include_columns: optionalBoolean(input.includeColumns),
        include_row_count: optionalBoolean(input.includeRowCount),
      },
      context,
      phase: "execute",
    });
    return normalizeRowList(payload);
  },
};

export async function validatePromptLayerCredential(
  context: ApiKeyProviderContext,
): Promise<CredentialValidationResult> {
  const payload = await requestPromptLayerJson({
    method: "GET",
    path: "/prompt-templates",
    query: { per_page: 1 },
    context,
    phase: "validate",
  });
  const firstPrompt = normalizePromptTemplateList(payload).items[0];
  return {
    profile: {
      displayName: "PromptLayer API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/prompt-templates",
      totalPromptTemplates: optionalInteger(payload.total),
      firstPromptName: firstPrompt?.promptName,
    }),
  };
}

async function requestPromptLayerJson(input: PromptLayerRequestInput): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "X-API-KEY": input.context.apiKey,
    };
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildPromptLayerUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPromptLayerPayload(response);
    if (!response.ok) {
      throw createPromptLayerError(response.status, payload, input.phase);
    }
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "PromptLayer returned an invalid payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "PromptLayer request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PromptLayer request failed: ${error.message}` : "PromptLayer request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildPromptLayerUrl(path: string, query: Record<string, PromptLayerQueryValue> = {}): URL {
  const url = new URL(path.replace(/^\/+/, ""), `${promptLayerApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readPromptLayerPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "PromptLayer returned invalid JSON",
  });
}

function createPromptLayerError(status: number, payload: unknown, phase: PromptLayerPhase): ProviderRequestError {
  const message = extractPromptLayerErrorMessage(payload) ?? `PromptLayer request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractPromptLayerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.error);
  if (message) {
    return message;
  }
  if (typeof record?.detail === "string") {
    return optionalString(record.detail);
  }
  if (Array.isArray(record?.detail)) {
    for (const item of record.detail) {
      const detail = optionalRecord(item);
      const detailMessage = optionalString(detail?.msg);
      if (detailMessage) {
        return detailMessage;
      }
    }
  }
  return undefined;
}

function normalizePromptTemplateList(payload: Record<string, unknown>): {
  items: Array<Record<string, unknown>>;
  page: number;
  pages: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextNum: number;
  prevNum: number;
  raw: Record<string, unknown>;
} {
  return {
    items: objectArray(payload.items, "PromptLayer prompt template list items", providerResponseError).map(
      normalizePromptTemplateSummary,
    ),
    page: requireResponseInteger(payload.page, "PromptLayer prompt template list page"),
    pages: requireResponseInteger(payload.pages, "PromptLayer prompt template list pages"),
    total: requireResponseInteger(payload.total, "PromptLayer prompt template list total"),
    hasNext: requireResponseBoolean(payload.has_next, "PromptLayer prompt template list has_next"),
    hasPrev: requireResponseBoolean(payload.has_prev, "PromptLayer prompt template list has_prev"),
    nextNum: requireResponseInteger(payload.next_num, "PromptLayer prompt template list next_num"),
    prevNum: requireResponseInteger(payload.prev_num, "PromptLayer prompt template list prev_num"),
    raw: payload,
  };
}

function normalizePromptTemplateSummary(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseInteger(record.id, "PromptLayer prompt template id"),
    promptName: requireResponseString(record.prompt_name, "PromptLayer prompt template prompt_name"),
    version: optionalIntegerOrNull(record.version),
    isSnippet: optionalBoolean(record.is_snippet) ?? null,
    promptTemplate: requiredRecord(
      record.prompt_template,
      "PromptLayer prompt template prompt_template",
      providerResponseError,
    ),
    metadata: optionalRecord(record.metadata) ?? null,
    commitMessage: optionalStringOrNull(record.commit_message),
    llmKwargs: optionalRecord(record.llm_kwargs) ?? null,
    externalIds: objectArray(record.external_ids, "PromptLayer prompt template external_ids", providerResponseError),
    raw: record,
  };
}

function normalizePromptTemplate(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseInteger(record.id, "PromptLayer prompt template id"),
    promptName: requireResponseString(record.prompt_name, "PromptLayer prompt template prompt_name"),
    version: optionalIntegerOrNull(record.version),
    promptTemplate: requiredRecord(
      record.prompt_template,
      "PromptLayer prompt template prompt_template",
      providerResponseError,
    ),
    metadata: optionalRecord(record.metadata) ?? null,
    commitMessage: optionalStringOrNull(record.commit_message),
    llmKwargs: optionalRecord(record.llm_kwargs) ?? null,
    raw: record,
  };
}

function normalizeRequestLog(record: Record<string, unknown>): Record<string, unknown> {
  return {
    success: requireResponseBoolean(record.success, "PromptLayer request success"),
    requestId: requireResponseInteger(record.request_id, "PromptLayer request request_id"),
    provider: optionalStringOrNull(record.provider),
    model: optionalStringOrNull(record.model),
    inputTokens: optionalIntegerOrNull(record.input_tokens),
    outputTokens: optionalIntegerOrNull(record.output_tokens),
    tokens: optionalIntegerOrNull(record.tokens),
    price: optionalNumber(record.price) ?? null,
    requestStartTime: optionalStringOrNull(record.request_start_time),
    requestEndTime: optionalStringOrNull(record.request_end_time),
    latencyMs: optionalNumber(record.latency_ms) ?? null,
    traceId: optionalStringOrNull(record.trace_id),
    promptBlueprint: requiredRecord(
      record.prompt_blueprint,
      "PromptLayer request prompt_blueprint",
      providerResponseError,
    ),
    raw: record,
  };
}

function normalizeTableList(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    tables: objectArray(payload.data, "PromptLayer table list data", providerResponseError).map(normalizeTable),
    nextCursor: optionalStringOrNull(payload.next_cursor),
    hasMore: requireResponseBoolean(payload.has_more, "PromptLayer table list has_more"),
    raw: payload,
  };
}

function normalizeTable(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(record.id, "PromptLayer table id"),
    workspaceId: optionalIntegerOrNull(record.workspace_id),
    title: optionalStringOrNull(record.title),
    folderId: optionalIntegerOrNull(record.folder_id),
    sheetCount: optionalIntegerOrNull(record.sheet_count),
    createdAt: optionalStringOrNull(record.created_at),
    updatedAt: optionalStringOrNull(record.updated_at),
    raw: record,
  };
}

function normalizeSheetList(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    sheets: objectArray(payload.data, "PromptLayer sheet list data", providerResponseError).map(normalizeSheet),
    nextCursor: optionalStringOrNull(payload.next_cursor),
    hasMore: requireResponseBoolean(payload.has_more, "PromptLayer sheet list has_more"),
    raw: payload,
  };
}

function normalizeSheet(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(record.id, "PromptLayer sheet id"),
    tableId: requireResponseString(record.table_id, "PromptLayer sheet table_id"),
    workspaceId: optionalIntegerOrNull(record.workspace_id),
    title: optionalStringOrNull(record.title),
    index: optionalIntegerOrNull(record.index),
    rowCount: optionalIntegerOrNull(record.row_count),
    versionCount: optionalIntegerOrNull(record.version_count),
    createdAt: optionalStringOrNull(record.created_at),
    updatedAt: optionalStringOrNull(record.updated_at),
    raw: record,
  };
}

function normalizeRowList(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    rows: objectArray(payload.data, "PromptLayer row list data", providerResponseError).map(normalizeRow),
    columns: optionalObjectArray(
      payload.columns,
      "PromptLayer row list column",
      () => new ProviderRequestError(502, "PromptLayer row list columns are invalid"),
    ).map(normalizeColumn),
    nextCursor: optionalStringOrNull(payload.next_cursor),
    hasMore: requireResponseBoolean(payload.has_more, "PromptLayer row list has_more"),
    rowCount: optionalIntegerOrNull(payload.row_count),
    version: optionalIntegerOrNull(payload.version),
    executionMetadataAggregates: optionalRecord(payload.execution_metadata_aggregates) ?? null,
    raw: payload,
  };
}

function normalizeRow(record: Record<string, unknown>): Record<string, unknown> {
  return {
    rowIndex: requireResponseInteger(record.row_index, "PromptLayer row row_index"),
    cells: normalizeCells(requiredRecord(record.cells, "PromptLayer row cells", providerResponseError)),
    raw: record,
  };
}

function normalizeColumn(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(record.id, "PromptLayer column id"),
    sheetId: optionalStringOrNull(record.sheet_id),
    workspaceId: optionalIntegerOrNull(record.workspace_id),
    title: optionalStringOrNull(record.title),
    type: optionalStringOrNull(record.type),
    config: optionalRecord(record.config) ?? null,
    positionRank: optionalNumber(record.position_rank) ?? null,
    isOutputColumn: optionalBoolean(record.is_output_column) ?? null,
    raw: record,
  };
}

function normalizeCells(cells: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(cells).map(([columnId, value]) => [
      columnId,
      normalizeCell(requiredRecord(value, `PromptLayer cell ${columnId}`, providerResponseError)),
    ]),
  );
}

function normalizeCell(record: Record<string, unknown>): Record<string, unknown> {
  const requestMetrics = optionalRecord(record.request_metrics);
  return compactObject({
    id: optionalString(record.id),
    sheetId: optionalString(record.sheet_id),
    columnId: optionalString(record.column_id),
    rowIndex: optionalInteger(record.row_index),
    status: optionalString(record.status),
    displayValue: record.display_value === null ? null : optionalRawString(record.display_value),
    value: record.value,
    error: optionalStringOrNull(record.error),
    inputHash: optionalStringOrNull(record.input_hash),
    updatedAt: optionalString(record.updated_at),
    requestMetrics:
      record.request_metrics === null ? null : requestMetrics ? normalizeRequestMetrics(requestMetrics) : undefined,
    executionId: optionalStringOrNull(record.execution_id),
    lastComputedVersion: optionalIntegerOrNull(record.last_computed_version),
    errorMessage: optionalStringOrNull(record.error_message),
  });
}

function normalizeRequestMetrics(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    requestCount: optionalInteger(record.request_count),
    requestIds: Array.isArray(record.request_ids)
      ? record.request_ids
          .map((value) => optionalInteger(value))
          .filter((value): value is number => value !== undefined)
      : undefined,
    latencyMs: optionalIntegerOrNull(record.latency_ms),
    price: record.price === null ? null : optionalNumber(record.price),
    inputTokens: optionalIntegerOrNull(record.input_tokens),
    outputTokens: optionalIntegerOrNull(record.output_tokens),
    traceIds:
      record.trace_ids === undefined
        ? undefined
        : requiredStringArray(
            record.trace_ids,
            "PromptLayer cell request_metrics.trace_ids",
            () => new ProviderRequestError(502, "PromptLayer cell request_metrics.trace_ids are invalid"),
          ),
  });
}

function requireResponseString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, () => new ProviderRequestError(502, `${fieldName} is missing or invalid`));
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(502, `${fieldName} is missing or invalid`);
  }
  return integer;
}

function requireResponseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} is missing or invalid`);
  }
  return value;
}
