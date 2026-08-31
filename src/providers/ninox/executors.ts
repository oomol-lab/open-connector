import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";

export const ninoxApiBaseUrl = "https://api.ninox.com/v1";

const service = "ninox";
const ninoxValidationPath = "/teams";

type NinoxPhase = "validate" | "execute";
type NinoxQueryValue = string | undefined;
type NinoxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface NinoxRequestInput {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: NinoxPhase;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, NinoxQueryValue>;
  body?: unknown;
  allowNoContent?: boolean;
}

interface NinoxTablePath {
  teamId: string;
  databaseId: string;
  tableId: string;
}

export const ninoxActionHandlers: ProviderActionHandlers<"ninox", NinoxActionHandler> = {
  list_workspaces(_input, context) {
    return listWorkspaces(context);
  },
  get_workspace(input, context) {
    return getWorkspace(input, context);
  },
  list_databases(input, context) {
    return listDatabases(input, context);
  },
  get_database(input, context) {
    return getDatabase(input, context);
  },
  list_tables(input, context) {
    return listTables(input, context);
  },
  get_table(input, context) {
    return getTable(input, context);
  },
  list_records(input, context) {
    return listRecords(input, context);
  },
  get_record(input, context) {
    return getRecord(input, context);
  },
  search_record(input, context) {
    return searchRecord(input, context);
  },
  save_records(input, context) {
    return saveRecords(input, context);
  },
  delete_record(input, context) {
    return deleteRecord(input, context);
  },
  delete_records(input, context) {
    return deleteRecords(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ninoxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const workspaces = normalizeWorkspaceList(
      await requestNinoxJson({
        path: ninoxValidationPath,
        context: {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        phase: "validate",
      }),
    );
    const firstWorkspace = workspaces[0];

    return {
      profile: {
        accountId: firstWorkspace?.id ?? "ninox-api-key",
        displayName: firstWorkspace?.name ?? "Ninox API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: ninoxValidationPath,
        workspaceCount: workspaces.length,
        firstWorkspaceId: firstWorkspace?.id,
        firstWorkspaceName: firstWorkspace?.name,
      }),
    };
  },
};

async function listWorkspaces(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestNinoxJson({
    path: ninoxValidationPath,
    context,
    phase: "execute",
  });

  return {
    workspaces: normalizeWorkspaceList(payload),
  };
}

async function getWorkspace(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const teamId = requireTrimmedString(input, "teamId");
  const payload = requireObjectPayload(
    await requestNinoxJson({
      path: `/teams/${encodeURIComponent(teamId)}`,
      context,
      phase: "execute",
    }),
    "workspace",
  );

  return {
    workspace: normalizeWorkspace(payload),
  };
}

async function listDatabases(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const teamId = requireTrimmedString(input, "teamId");
  const payload = await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases`,
    context,
    phase: "execute",
  });

  return {
    databases: normalizeDatabaseSummaryList(payload),
  };
}

async function getDatabase(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const teamId = requireTrimmedString(input, "teamId");
  const databaseId = requireTrimmedString(input, "databaseId");
  const payload = requireObjectPayload(
    await requestNinoxJson({
      path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}`,
      context,
      phase: "execute",
    }),
    "database",
  );

  return {
    database: normalizeDatabaseDetail(payload),
  };
}

async function listTables(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const teamId = requireTrimmedString(input, "teamId");
  const databaseId = requireTrimmedString(input, "databaseId");
  const payload = await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables`,
    context,
    phase: "execute",
  });

  return {
    tables: normalizeTableList(payload),
  };
}

async function getTable(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const teamId = requireTrimmedString(input, "teamId");
  const databaseId = requireTrimmedString(input, "databaseId");
  const tableId = requireTrimmedString(input, "tableId");
  const payload = requireObjectPayload(
    await requestNinoxJson({
      path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}`,
      context,
      phase: "execute",
    }),
    "table",
  );

  return {
    table: normalizeTable(payload),
  };
}

async function listRecords(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { teamId, databaseId, tableId } = readTablePath(input);
  const payload = await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/records`,
    context,
    phase: "execute",
    query: compactObject({
      choiceStyle: readOptionalTrimmedString(input.choiceStyle),
    }),
  });

  return {
    records: normalizeRecordList(payload),
  };
}

async function getRecord(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { teamId, databaseId, tableId } = readTablePath(input);
  const recordId = requirePositiveInteger(input.recordId, "recordId");
  const payload = requireObjectPayload(
    await requestNinoxJson({
      path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/records/${recordId}`,
      context,
      phase: "execute",
      query: compactObject({
        choiceStyle: readOptionalTrimmedString(input.choiceStyle),
        style: readOptionalTrimmedString(input.style),
      }),
    }),
    "record",
  );

  return {
    record: normalizeRecord(payload),
  };
}

async function searchRecord(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { teamId, databaseId, tableId } = readTablePath(input);
  const filters = requireObjectPayload(input.filters, "filters");
  const payload = await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/record`,
    context,
    phase: "execute",
    method: "POST",
    query: compactObject({
      style: readOptionalTrimmedString(input.style),
      dateStyle: readOptionalTrimmedString(input.dateStyle),
      choiceStyle: readOptionalTrimmedString(input.choiceStyle),
    }),
    body: {
      filters,
    },
  });

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return { record: null };
    }

    const firstRecord = optionalRecord(payload[0]);
    return {
      record: firstRecord ? normalizeRecord(firstRecord) : null,
    };
  }

  return {
    record: normalizeRecord(requireObjectPayload(payload, "record")),
  };
}

async function saveRecords(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { teamId, databaseId, tableId } = readTablePath(input);
  const records = readSaveRecords(input.records);
  const payload = await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/records`,
    context,
    phase: "execute",
    method: "POST",
    body: records,
  });

  return {
    records: normalizeRecordList(payload),
  };
}

async function deleteRecord(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { teamId, databaseId, tableId } = readTablePath(input);
  const recordId = requirePositiveInteger(input.recordId, "recordId");
  await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/records/${recordId}`,
    context,
    phase: "execute",
    method: "DELETE",
  });

  return {
    deleted: true,
  };
}

async function deleteRecords(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { teamId, databaseId, tableId } = readTablePath(input);
  const recordIds = readRecordIdArray(input.recordIds, "recordIds");
  await requestNinoxJson({
    path: `/teams/${encodeURIComponent(teamId)}/databases/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/records`,
    context,
    phase: "execute",
    method: "DELETE",
    body: recordIds,
    allowNoContent: true,
  });

  return {
    deletedCount: recordIds.length,
  };
}

async function requestNinoxJson(input: NinoxRequestInput): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "Ninox" }, async (signal) => {
    const response = await input.context.fetcher(buildNinoxUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });

    if (input.allowNoContent && response.status === 204) {
      return null;
    }

    const payload = await readNinoxPayload(response);
    if (!response.ok) {
      throw createNinoxError(response.status, payload, input.phase);
    }

    return payload;
  });
}

function buildNinoxUrl(path: string, query?: Record<string, NinoxQueryValue>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${ninoxApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readNinoxPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Ninox returned invalid JSON");
  }
}

function createNinoxError(status: number, payload: unknown, phase: NinoxPhase): ProviderRequestError {
  const message = extractNinoxErrorMessage(payload) ?? `Ninox request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractNinoxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function normalizeWorkspaceList(value: unknown): Array<{ id: string; name: string; raw: Record<string, unknown> }> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Ninox workspaces payload must be an array", value);
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => normalizeWorkspace(item));
}

function normalizeWorkspace(value: Record<string, unknown>): {
  id: string;
  name: string;
  raw: Record<string, unknown>;
} {
  return {
    id: optionalString(value.id) ?? "",
    name: optionalString(value.name) ?? "",
    raw: value,
  };
}

function normalizeDatabaseSummaryList(
  value: unknown,
): Array<{ id: string; name: string; raw: Record<string, unknown> }> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Ninox databases payload must be an array", value);
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      id: optionalString(item.id) ?? "",
      name: optionalString(item.name) ?? "",
      raw: item,
    }));
}

function normalizeDatabaseDetail(value: Record<string, unknown>): Record<string, unknown> {
  return {
    settings: optionalRecord(value.settings) ?? null,
    schema: optionalRecord(value.schema) ?? null,
    raw: value,
  };
}

function normalizeTableList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Ninox tables payload must be an array", value);
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => normalizeTable(item));
}

function normalizeTable(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(value.id) ?? "",
    name: optionalString(value.name) ?? "",
    fields: normalizeTableFields(value.fields),
    raw: value,
  };
}

function normalizeTableFields(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      id: optionalString(item.id) ?? null,
      name: optionalString(item.name) ?? null,
      type: optionalString(item.type) ?? null,
      choices: normalizeTableChoices(item.choices),
      raw: item,
    }));
}

function normalizeTableChoices(value: unknown): Array<Record<string, unknown>> | null {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({
      id: optionalString(item.id) ?? null,
      caption: optionalString(item.caption) ?? null,
      captions: optionalRecord(item.captions) ?? null,
      raw: item,
    }));
}

function normalizeRecordList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Ninox records payload must be an array", value);
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => normalizeRecord(item));
}

function normalizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const id = optionalInteger(value.id);
  if (id === undefined || id <= 0) {
    throw new ProviderRequestError(502, "Ninox record is missing a valid id", value);
  }

  return {
    id,
    sequence: optionalInteger(value.sequence) ?? null,
    createdAt: optionalString(value.createdAt) ?? null,
    createdBy: value.createdBy ?? null,
    modifiedAt: optionalString(value.modifiedAt) ?? null,
    modifiedBy: value.modifiedBy ?? null,
    fields: optionalRecord(value.fields) ?? {},
    raw: value,
  };
}

function readTablePath(input: Record<string, unknown>): NinoxTablePath {
  return {
    teamId: requireTrimmedString(input, "teamId"),
    databaseId: requireTrimmedString(input, "databaseId"),
    tableId: requireTrimmedString(input, "tableId"),
  };
}

function readSaveRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "records must be a non-empty array");
  }

  return value.map((item) => {
    const record = requireObjectPayload(item, "record");
    const fields = requireObjectPayload(record.fields, "fields");
    const id = optionalInteger(record.id);

    return compactObject({
      id,
      fields,
    });
  });
}

function readRecordIdArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }

  return value.map((item) => requirePositiveInteger(item, fieldName));
}

function requireTrimmedString(input: Record<string, unknown>, fieldName: string): string {
  const value = readOptionalTrimmedString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const objectValue = optionalRecord(value);
  if (!objectValue) {
    throw new ProviderRequestError(502, `Ninox ${label} payload is invalid`, value);
  }
  return objectValue;
}
