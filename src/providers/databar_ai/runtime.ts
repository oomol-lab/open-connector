import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const databarAiApiBaseUrl = "https://api.databar.ai";

type DatabarAiHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const databarAiActionHandlers: ProviderActionHandlers<"databar_ai", DatabarAiHandler> = {
  async get_user_info(_input, context) {
    return { user: normalizeUser(asRecord(await requestDatabarAi({ path: "/v1/user/me", context }))) };
  },
  async list_tables(_input, context) {
    return { tables: asRecordArray(await requestDatabarAi({ path: "/v1/table/", context })).map(normalizeTable) };
  },
  async create_table(input, context) {
    const payload = await requestDatabarAi({
      path: "/v1/table/create",
      method: "POST",
      body: compactObject({ name: input.name, columns: input.columns, rows: input.rows }),
      context,
    });
    return { table: normalizeTable(asRecord(payload)) };
  },
  async get_table_columns(input, context) {
    const payload = await requestDatabarAi({
      path: `/v1/table/${encodePathSegment(input.table_uuid)}/columns`,
      context,
    });
    return { columns: asRecordArray(payload).map(normalizeColumn) };
  },
  async get_table_rows(input, context) {
    const payload = await requestDatabarAi({
      path: `/v1/table/${encodePathSegment(input.table_uuid)}/rows`,
      query: [
        ["per_page", input.per_page],
        ["page", input.page],
        ["filter", input.filter === undefined ? undefined : JSON.stringify(input.filter)],
      ],
      context,
    });
    return { rows: normalizeRowsEnvelope(asRecord(payload)) };
  },
  async insert_rows(input, context) {
    const payload = asRecord(
      await requestDatabarAi({
        path: `/v1/table/${encodePathSegment(input.table_uuid)}/rows`,
        method: "POST",
        body: compactObject({ rows: input.rows, options: input.options, return_rows: input.return_rows }),
        context,
      }),
    );
    return { results: asRecordArray(payload.results).map(normalizeBatchResult) };
  },
  async list_enrichments(input, context) {
    return {
      result: await requestDatabarAi({
        path: "/v1/enrichments/",
        query: [
          ["q", input.q],
          ["page", input.page],
          ["limit", input.limit],
          ["authorized_only", optionalBoolean(input.authorized_only)],
          ["category", input.category],
        ],
        context,
      }),
    };
  },
  async get_enrichment(input, context) {
    return {
      enrichment: asRecord(
        await requestDatabarAi({ path: `/v1/enrichments/${encodePathSegment(input.enrichment_id)}`, context }),
      ),
    };
  },
  async run_enrichment(input, context) {
    const payload = await requestDatabarAi({
      path: `/v1/enrichments/${encodePathSegment(input.enrichment_id)}/run`,
      method: "POST",
      body: compactObject({ params: input.params, pagination: input.pagination }),
      context,
    });
    return { task: normalizeTask(asRecord(payload)) };
  },
  async get_task_status(input, context) {
    return {
      task: normalizeTask(
        asRecord(await requestDatabarAi({ path: `/v1/tasks/${encodePathSegment(input.task_id)}`, context })),
      ),
    };
  },
  async run_waterfall(input, context) {
    const payload = await requestDatabarAi({
      path: `/v1/waterfalls/${encodePathSegment(input.waterfall_identifier)}/run`,
      method: "POST",
      body: compactObject({
        params: input.params,
        enrichments: input.enrichments,
        email_verifier: input.email_verifier,
      }),
      context,
    });
    return { task: normalizeTask(asRecord(payload)) };
  },
};

export async function validateDatabarAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const user = normalizeUser(asRecord(await requestDatabarAi({ path: "/v1/user/me", context })));
  return {
    profile: { accountId: user.email || "databar_ai:token", displayName: user.email || "Databar API Key" },
    grantedScopes: [],
    metadata: compactObject({ apiBaseUrl: databarAiApiBaseUrl, workspace: user.workspace, plan: user.plan }),
  };
}

async function requestDatabarAi(input: {
  path: string;
  context: ApiKeyProviderContext;
  method?: string;
  query?: Array<[string, unknown]>;
  body?: unknown;
}): Promise<unknown> {
  const url = new URL(`${databarAiApiBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await input.context.fetcher(url, {
    method: input.method ?? "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-apikey": input.context.apiKey,
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.context.signal,
  });
  const rawBody = await response.text();
  const payload = rawBody ? parseDatabarAiJson(rawBody, response.status) : {};
  if (!response.ok) throw mapDatabarAiHttpError(response.status, payload, rawBody);
  return payload;
}

function parseDatabarAiJson(rawBody: string, status: number): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 500,
      buildDatabarAiHttpErrorMessage(status, rawBody, error instanceof Error ? error.message : undefined),
    );
  }
}

function normalizeUser(record: Record<string, unknown>) {
  return {
    first_name: optionalString(record.first_name) ?? null,
    email: optionalString(record.email) ?? "",
    balance: optionalNumber(record.balance) ?? 0,
    plan: optionalString(record.plan) ?? "",
    workspace: optionalString(record.workspace) ?? null,
    raw: record,
  };
}

function normalizeTable(record: Record<string, unknown>) {
  return {
    identifier: optionalString(record.identifier) ?? "",
    name: optionalString(record.name) ?? "",
    created_at: optionalString(record.created_at) ?? "",
    updated_at: optionalString(record.updated_at) ?? "",
    workspace_identifier: optionalString(record.workspace_identifier) ?? null,
    table_url: optionalString(record.table_url) ?? "",
    raw: record,
  };
}

function normalizeColumn(record: Record<string, unknown>) {
  return {
    identifier: optionalString(record.identifier) ?? "",
    internal_name: optionalString(record.internal_name) ?? "",
    additional_intenal_name: optionalString(record.additional_intenal_name) ?? null,
    name: optionalString(record.name) ?? "",
    type_of_value: optionalString(record.type_of_value) ?? "",
    data_processor_id: optionalNumber(record.data_processor_id) ?? null,
    raw: record,
  };
}

function normalizeRowsEnvelope(record: Record<string, unknown>) {
  return {
    has_next_page: optionalBoolean(record.has_next_page) ?? null,
    total_count: optionalNumber(record.total_count) ?? null,
    page: optionalNumber(record.page) ?? null,
    data: asRecordArray(record.data),
    raw: record,
  };
}

function normalizeBatchResult(record: Record<string, unknown>) {
  return {
    action: optionalString(record.action) ?? null,
    id: optionalString(record.id) ?? null,
    index: optionalNumber(record.index) ?? null,
    row_data: record.row_data ? asRecord(record.row_data) : null,
    raw: record,
  };
}

function normalizeTask(record: Record<string, unknown>) {
  return {
    task_id: optionalString(record.task_id) ?? "",
    request_id: optionalString(record.request_id) ?? null,
    status: optionalString(record.status) ?? "",
    data: record.data ?? null,
    error: record.error ?? null,
    credits_spent: optionalNumber(record.credits_spent) ?? null,
    raw: record,
  };
}

function mapDatabarAiHttpError(status: number, payload: unknown, rawBody: string): ProviderRequestError {
  const message = readDatabarAiErrorMessage(payload) ?? buildDatabarAiHttpErrorMessage(status, rawBody);
  return new ProviderRequestError(status === 0 ? 500 : status, message);
}

function readDatabarAiErrorMessage(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const detail = record.detail;
  if (typeof detail === "string") return detail;
  if (detail) return JSON.stringify(detail);
  return typeof record.error === "string" ? record.error : undefined;
}

function buildDatabarAiHttpErrorMessage(status: number, rawBody: string, parseErrorMessage?: string): string {
  const parts = [`databar_ai request failed with ${status}`];
  if (parseErrorMessage) parts.push(`invalid JSON response: ${parseErrorMessage}`);
  const bodySnippet = rawBody.trim().slice(0, 200);
  if (bodySnippet) parts.push(`body: ${bodySnippet}`);
  return parts.join("; ");
}

function asRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
