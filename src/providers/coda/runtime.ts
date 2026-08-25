import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const codaApiBaseUrl = "https://coda.io/apis/v1";
const codaWhoamiPath = "/whoami";

interface CodaCredentialInput {
  apiKey: string;
}

type CodaRequestMode = "validate" | "execute";
type CodaQueryValue = string | number | boolean | string[] | undefined;
type CodaRuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CodaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const codaActionHandlers: ProviderActionHandlers<"coda", CodaActionHandler> = {
  async get_current_user(_input, context) {
    const user = await requestCodaObject({
      context,
      path: codaWhoamiPath,
      mode: "execute",
    });
    return { user };
  },

  async list_docs(input, context) {
    return requestCodaList({
      context,
      path: "/docs",
      query: compactObject({
        isOwner: optionalBoolean(input.isOwner),
        isPublished: optionalBoolean(input.isPublished),
        query: optionalString(input.query),
        sourceDoc: optionalString(input.sourceDoc),
        isStarred: optionalBoolean(input.isStarred),
        inGallery: optionalBoolean(input.inGallery),
        workspaceId: optionalString(input.workspaceId),
        folderId: optionalString(input.folderId),
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        pageToken: optionalString(input.pageToken),
      }),
      mode: "execute",
    });
  },

  async get_doc(input, context) {
    const doc = await requestCodaObject({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return { doc };
  },

  async list_pages(input, context) {
    return requestCodaList({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/pages`,
      query: compactObject({
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        pageToken: optionalString(input.pageToken),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },

  async create_page(input, context) {
    const payload = await requestCodaObject({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/pages`,
      method: "POST",
      body: compactObject({
        name: optionalString(input.name),
        subtitle: optionalString(input.subtitle),
        iconName: optionalString(input.iconName),
        imageUrl: optionalString(input.imageUrl),
        parentPageId: optionalString(input.parentPageId),
        pageContent: optionalRecord(input.pageContent),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      requestId: requiredString(payload.requestId, "requestId", providerResponseError),
      id: requiredString(payload.id, "id", providerResponseError),
    };
  },

  async list_tables(input, context) {
    return requestCodaList({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/tables`,
      query: compactObject({
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        pageToken: optionalString(input.pageToken),
        sortBy: optionalString(input.sortBy),
        tableTypes: readOptionalStringArray(input.tableTypes),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },

  async get_table(input, context) {
    const table = await requestCodaObject({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/tables/${encodeURIComponent(
        requireInputString(input.tableIdOrName, "tableIdOrName"),
      )}`,
      query: compactObject({
        useUpdatedTableLayouts: optionalBoolean(input.useUpdatedTableLayouts),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return { table };
  },

  async list_columns(input, context) {
    return requestCodaList({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/tables/${encodeURIComponent(
        requireInputString(input.tableIdOrName, "tableIdOrName"),
      )}/columns`,
      query: compactObject({
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        pageToken: optionalString(input.pageToken),
        visibleOnly: optionalBoolean(input.visibleOnly),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },

  async list_rows(input, context) {
    const payload = await requestCodaObject({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/tables/${encodeURIComponent(
        requireInputString(input.tableIdOrName, "tableIdOrName"),
      )}/rows`,
      query: compactObject({
        query: optionalString(input.query),
        sortBy: optionalString(input.sortBy),
        useColumnNames: optionalBoolean(input.useColumnNames),
        valueFormat: optionalString(input.valueFormat),
        visibleOnly: optionalBoolean(input.visibleOnly),
        limit: readOptionalPositiveInteger(input.limit, "limit"),
        pageToken: optionalString(input.pageToken),
        syncToken: optionalString(input.syncToken),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      items: readListItems(payload),
      nextPageToken: optionalString(payload.nextPageToken) ?? null,
      nextPageLink: optionalString(payload.nextPageLink) ?? null,
      nextSyncToken: optionalString(payload.nextSyncToken) ?? null,
    };
  },

  async upsert_rows(input, context) {
    const payload = await requestCodaObject({
      context,
      path: `/docs/${encodeURIComponent(requireInputString(input.docId, "docId"))}/tables/${encodeURIComponent(
        requireInputString(input.tableIdOrName, "tableIdOrName"),
      )}/rows`,
      method: "POST",
      query: compactObject({
        disableParsing: optionalBoolean(input.disableParsing),
      }),
      body: compactObject({
        rows: readRowsUpsert(input.rows),
        keyColumns: readOptionalStringArray(input.keyColumns),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });

    return compactObject({
      requestId: requiredString(payload.requestId, "requestId", providerResponseError),
      addedRowIds: readOptionalStringArray(payload.addedRowIds),
    });
  },

  async get_mutation_status(input, context) {
    const payload = await requestCodaObject({
      context,
      path: `/mutationStatus/${encodeURIComponent(requireInputString(input.requestId, "requestId"))}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return compactObject({
      completed: payload.completed === true,
      warning: optionalString(payload.warning),
    });
  },
};

export async function validateCodaApiKey(
  input: CodaCredentialInput,
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context: CodaRuntimeContext = {
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
  };
  const payload = await requestCodaObject({
    context,
    path: codaWhoamiPath,
    mode: "validate",
  });

  const accountId =
    optionalString(payload.loginId) ?? optionalString(payload.tokenName) ?? optionalString(payload.name) ?? "coda-user";
  const displayName =
    optionalString(payload.name) ??
    optionalString(payload.tokenName) ??
    optionalString(payload.loginId) ??
    "Coda API Token";

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: codaApiBaseUrl,
      validationEndpoint: codaWhoamiPath,
      loginId: optionalString(payload.loginId),
      type: optionalString(payload.type),
      scoped: payload.scoped === true,
      tokenName: optionalString(payload.tokenName),
      workspace: optionalRecord(payload.workspace),
    }),
  };
}

async function requestCodaList(input: {
  context: CodaRuntimeContext;
  path: string;
  query?: Record<string, CodaQueryValue>;
  mode: CodaRequestMode;
  notFoundAsInvalidInput?: boolean;
}): Promise<Record<string, unknown>> {
  const payload = await requestCodaObject({
    context: input.context,
    path: input.path,
    query: input.query,
    mode: input.mode,
    notFoundAsInvalidInput: input.notFoundAsInvalidInput,
  });

  return {
    items: readListItems(payload),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
    nextPageLink: optionalString(payload.nextPageLink) ?? null,
  };
}

async function requestCodaObject(input: {
  context: CodaRuntimeContext;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, CodaQueryValue>;
  body?: unknown;
  mode: CodaRequestMode;
  notFoundAsInvalidInput?: boolean;
}): Promise<Record<string, unknown>> {
  const payload = await requestCodaJson(input);
  return requiredRecord(payload, "coda response", providerResponseError);
}

async function requestCodaJson(input: {
  context: CodaRuntimeContext;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, CodaQueryValue>;
  body?: unknown;
  mode: CodaRequestMode;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${codaApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: codaHeaders(input.context.apiKey, input.body === undefined ? undefined : "application/json"),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: input.context.signal,
    });
  } catch (error) {
    throw wrapCodaTransportError(error, input.mode, "request");
  }

  let payload: unknown;
  try {
    payload = await readCodaPayload(response);
  } catch (error) {
    throw wrapCodaTransportError(error, input.mode, "response parsing");
  }

  if (!response.ok) {
    throw createCodaError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

function codaHeaders(apiKey: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  return headers;
}

async function readCodaPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCodaError(
  response: Response,
  payload: unknown,
  mode: CodaRequestMode,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readCodaErrorMessage(payload) ?? `coda request failed with ${response.status}`;

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    if (response.status !== 404 || notFoundAsInvalidInput) {
      return new ProviderRequestError(400, message, payload);
    }
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, `coda ${mode} failed: ${message}`, payload);
}

function wrapCodaTransportError(error: unknown, mode: CodaRequestMode, step: string): ProviderRequestError {
  const message = error instanceof Error ? error.message : String(error);
  return new ProviderRequestError(502, `coda ${mode} ${step} failed: ${message}`);
}

function readCodaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readListItems(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(payload.items)
    ? payload.items.map((item) => requiredRecord(item, "items", providerResponseError))
    : [];
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return positiveInteger(value, fieldName, invalidInputError);
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map((item) => String(item));
}

function readRowsUpsert(value: unknown): Array<Record<string, unknown>> {
  const rows = objectArray(value, "rows", invalidInputError);
  if (rows.length === 0) {
    throw new ProviderRequestError(400, "rows is required");
  }

  return rows.map((row, rowIndex) => {
    const cells = objectArray(row.cells, `rows[${rowIndex}].cells`, invalidInputError);
    if (cells.length === 0) {
      throw new ProviderRequestError(400, `rows[${rowIndex}].cells is required`);
    }

    return {
      cells: cells.map((cell, cellIndex) => ({
        column: requiredString(cell.column, `rows[${rowIndex}].cells[${cellIndex}].column`, invalidInputError),
        value: cell.value,
      })),
    };
  });
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, invalidInputError);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
