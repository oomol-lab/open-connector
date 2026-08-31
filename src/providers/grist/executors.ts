import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "grist";
const gristApiBaseUrl = "https://api.getgrist.com/api";
const gristApiOrigin = "https://api.getgrist.com";
const gristValidationPath = "/profile/user";

type GristRequestPhase = "validate" | "execute";
type GristActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const gristActionHandlers: ProviderActionHandlers<"grist", GristActionHandler> = {
  list_workspaces(_input, context) {
    return listGristWorkspaces(context);
  },
  get_document(input, context) {
    return requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_tables(input, context) {
    return requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}/tables`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_columns(input, context) {
    return requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}/tables/${encodeURIComponent(requireTableId(input))}/columns`,
      query: compactObject({
        hidden: optionalBoolean(input.hidden),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_records(input, context) {
    return requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}/tables/${encodeURIComponent(requireTableId(input))}/records`,
      query: compactObject({
        hidden: optionalBoolean(input.hidden),
        sort: optionalString(input.sort),
        filter: optionalString(input.filter),
        limit: optionalNumber(input.limit),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  async add_records(input, context) {
    const payload = await requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}/tables/${encodeURIComponent(requireTableId(input))}/records`,
      method: "POST",
      body: compactObject({
        noparse: optionalBoolean(input.noparse),
        records: readCreateRecords(input.records),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      records: readRowIds(payload).map((id) => ({ id })),
    };
  },
  async update_records(input, context) {
    const records = readUpdateRecords(input.records);
    await requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}/tables/${encodeURIComponent(requireTableId(input))}/records`,
      method: "PATCH",
      body: compactObject({
        noparse: optionalBoolean(input.noparse),
        records,
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      ok: true,
      updatedCount: records.length,
    };
  },
  async delete_records(input, context) {
    const rowIds = readDeleteRowIds(input);
    await requestGristJson({
      context,
      path: `/docs/${encodeURIComponent(requireDocId(input))}/tables/${encodeURIComponent(requireTableId(input))}/records/delete`,
      method: "POST",
      body: rowIds,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      ok: true,
      deletedRowIds: rowIds,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, gristActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = requiredRecord(
      await requestGristJson({
        context: {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        path: gristValidationPath,
        phase: "validate",
      }),
      "profile",
      providerResponseError,
    );
    const id = optionalInteger(payload.id);
    const ref = optionalString(payload.ref);
    const email = optionalString(payload.email);
    const name = optionalString(payload.name);
    return {
      profile: {
        accountId: email ?? ref ?? `grist:user:${id ?? "api-key"}`,
        displayName: name ?? email ?? "Grist API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: gristApiBaseUrl,
        validationEndpoint: gristValidationPath,
        id,
        ref,
        email,
        name,
        anonymous: payload.anonymous === true,
      }),
    };
  },
};

async function listGristWorkspaces(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const orgsPayload = await requestGristJson({
    context,
    path: "/orgs",
    phase: "execute",
  });
  const orgs = Array.isArray(orgsPayload)
    ? orgsPayload.map((org) => requiredRecord(org, "org", providerResponseError))
    : [];
  const workspaceLists = await Promise.all(
    orgs.map(async (org) => {
      const orgId = readPositiveInteger(org.id, "org id");
      const workspacesPayload = await requestGristJson({
        context,
        path: `/orgs/${orgId}/workspaces`,
        phase: "execute",
      });
      const workspaces = Array.isArray(workspacesPayload)
        ? workspacesPayload.map((workspace) => requiredRecord(workspace, "workspace", providerResponseError))
        : [];
      return workspaces.map((workspace) => ({
        ...workspace,
        orgDomain: optionalString(workspace.orgDomain) ?? optionalString(org.domain) ?? null,
        docs: Array.isArray(workspace.docs) ? workspace.docs : [],
      }));
    }),
  );
  return {
    workspaces: workspaceLists.flat(),
  };
}

async function requestGristJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: GristRequestPhase;
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const normalizedPath = input.path.startsWith("/api/")
    ? input.path
    : `/api${input.path.startsWith("/") ? input.path : `/${input.path}`}`;
  const url = new URL(normalizedPath, gristApiOrigin);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: gristHeaders(input.context.apiKey, input.body === undefined ? undefined : "application/json"),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `grist ${input.phase} request failed: ${error.message}`
        : `grist ${input.phase} request failed`,
    );
  }
  const payload = await readGristPayload(response);
  if (!response.ok) {
    throw createGristError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
  }
  return payload;
}

function gristHeaders(apiKey: string, contentType?: string): Record<string, string> {
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

async function readGristPayload(response: Response): Promise<unknown> {
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

function createGristError(
  response: Response,
  payload: unknown,
  phase: GristRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `grist request failed with ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if ((notFoundAsInvalidInput && response.status === 404) || response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(
    response.status >= 500 ? 502 : response.status || 502,
    `grist ${phase} failed: ${message}`,
    payload,
  );
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
}

function requireDocId(input: Record<string, unknown>): string {
  return requireInputString(input.docId, "docId");
}

function requireTableId(input: Record<string, unknown>): string {
  return requireInputString(input.tableId, "tableId");
}

function readCreateRecords(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "records", providerResponseError).map((record) => ({
    fields: requiredRecord(record.fields, "fields", providerResponseError),
  }));
}

function readUpdateRecords(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "records", providerResponseError).map((record) => ({
    id: readPositiveInteger(record.id, "record id"),
    fields: requiredRecord(record.fields, "fields", providerResponseError),
  }));
}

function readDeleteRowIds(input: Record<string, unknown>): number[] {
  const value = input.rowIds;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "rowIds is required");
  }
  return value.map((rowId) => readPositiveInteger(rowId, "row id"));
}

function readRowIds(payload: unknown): number[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "grist returned an unexpected record creation response", payload);
  }
  return payload.map((rowId) => readPositiveInteger(rowId, "row id"));
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(502, `grist returned an invalid ${fieldName}`);
  }
  return parsed;
}

function requireInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
