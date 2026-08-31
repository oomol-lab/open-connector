import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";

type TurbotPipesRequestPhase = "validate" | "execute";
type TurbotPipesActionHandler = (input: Record<string, unknown>, context: TurbotPipesContext) => Promise<unknown>;

export interface TurbotPipesContext extends ApiKeyProviderContext {
  userHandle: string;
  workspaceHandle: string;
}

export const turbotPipesApiBaseUrl = "https://pipes.turbot.com/api/latest";
const credentialHelpUrl = "https://turbot.com/pipes/docs/profile#tokens";

export const turbotPipesActionHandlers: ProviderActionHandlers<"turbot_pipes", TurbotPipesActionHandler> = {
  execute_query(input, context) {
    return executeQuery(input, context);
  },
};

export async function validateTurbotPipesCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const userHandle = requiredInputString(input.values.userHandle, "userHandle");
  const workspaceHandle = requiredInputString(input.values.workspaceHandle, "workspaceHandle");
  const queryPath = turbotPipesQueryPath(userHandle, workspaceHandle);
  const payload = await turbotPipesPostJson(
    queryPath,
    { sql: "select 1 as ok" },
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    "validate",
  );
  const result = normalizeQueryPayload(payload);

  return {
    profile: {
      accountId: `${userHandle}/${workspaceHandle}`,
      displayName: `${userHandle}/${workspaceHandle}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: turbotPipesApiBaseUrl,
      validationPath: queryPath,
      credentialHelpUrl,
      userHandle,
      workspaceHandle,
      validationRowCount: result.rowCount,
    }),
  };
}

export function createTurbotPipesContext(
  context: ApiKeyProviderContext,
  values: Record<string, string>,
): TurbotPipesContext {
  return {
    ...context,
    userHandle: requiredInputString(values.userHandle, "userHandle"),
    workspaceHandle: requiredInputString(values.workspaceHandle, "workspaceHandle"),
  };
}

async function executeQuery(input: Record<string, unknown>, context: TurbotPipesContext): Promise<unknown> {
  const payload = await turbotPipesPostJson(
    turbotPipesQueryPath(context.userHandle, context.workspaceHandle),
    { sql: requiredInputString(input.sql, "sql") },
    context,
    "execute",
  );
  return normalizeQueryPayload(payload);
}

async function turbotPipesPostJson(
  path: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TurbotPipesRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(turbotPipesUrl(path), {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readTurbotPipesPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Turbot Pipes request failed: ${error.message}` : "Turbot Pipes request failed",
    );
  }

  if (!response.ok) {
    throw createTurbotPipesError(response.status, payload, phase);
  }
  return payload;
}

function turbotPipesUrl(path: string): URL {
  return new URL(`${turbotPipesApiBaseUrl}${path}`);
}

function turbotPipesQueryPath(userHandle: string, workspaceHandle: string): string {
  return `/user/${encodeURIComponent(userHandle)}/workspace/${encodeURIComponent(workspaceHandle)}/query`;
}

async function readTurbotPipesPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTurbotPipesError(
  status: number,
  payload: unknown,
  phase: TurbotPipesRequestPhase,
): ProviderRequestError {
  const message = extractTurbotPipesErrorMessage(payload) ?? `Turbot Pipes request failed with ${status || 500}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && [400, 401, 403, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function normalizeQueryPayload(payload: unknown): {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  columns: Array<{ name: string | null; type: string | null }>;
  meta: Record<string, unknown> | null;
  raw: unknown;
} {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Turbot Pipes returned invalid JSON");
  }

  const rows = extractRows(record);
  return {
    rows,
    rowCount: optionalNumber(record.row_count) ?? optionalNumber(record.rowCount) ?? rows.length,
    columns: extractColumns(record, rows),
    meta: optionalRecord(record.meta) ?? optionalRecord(record.metadata) ?? null,
    raw: payload,
  };
}

function extractRows(record: Record<string, unknown>): Array<Record<string, unknown>> {
  const data = Array.isArray(record.rows)
    ? record.rows
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.items)
        ? record.items
        : [];
  return data.map((row) => optionalRecord(row) ?? { value: row });
}

function extractColumns(
  record: Record<string, unknown>,
  rows: Array<Record<string, unknown>>,
): Array<{ name: string | null; type: string | null }> {
  const columnSource = Array.isArray(record.columns)
    ? record.columns
    : Array.isArray(record.fields)
      ? record.fields
      : undefined;
  if (columnSource) {
    return columnSource.map((column) => {
      const columnRecord = optionalRecord(column);
      if (!columnRecord) return { name: String(column), type: null };
      return {
        name: optionalString(columnRecord.name) ?? optionalString(columnRecord.column_name) ?? null,
        type: optionalString(columnRecord.type) ?? optionalString(columnRecord.data_type) ?? null,
      };
    });
  }

  const firstRow = rows[0];
  return firstRow ? Object.keys(firstRow).map((name) => ({ name, type: null })) : [];
}

function extractTurbotPipesErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const error = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(error?.message) ??
    optionalString(error?.detail) ??
    optionalString(error?.title)
  );
}
