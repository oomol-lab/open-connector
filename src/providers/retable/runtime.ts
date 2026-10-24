import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import {
  compactObject,
  looseArray,
  objectArray,
  optionalNumber,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const retableApiBaseUrl = "https://api.retable.io";
const apiRoot = "/v1/public";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
interface RequestInput extends ApiKeyProviderContext {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, number | string | undefined>;
  body?: unknown;
  phase: "execute" | "validate";
}

export const handlers: ProviderActionHandlers<"retable", Handler> = {
  async list_workspaces(_input, context) {
    const data = requiredResponseRecord(
      await requestData({ ...context, path: `${apiRoot}/workspace`, phase: "execute" }),
      "Retable workspace response data",
    );
    return { workspaces: objects(data.workspaces, "Retable workspaces") };
  },
  async list_projects(input, context) {
    const data = requiredResponseRecord(
      await requestData({
        ...context,
        path: `${apiRoot}/workspace/${segment(input.workspaceId, "workspaceId")}/project`,
        phase: "execute",
      }),
      "Retable project response data",
    );
    return { projects: objects(data.projects, "Retable projects") };
  },
  async list_retables(input, context) {
    const data = requiredResponseRecord(
      await requestData({
        ...context,
        path: `${apiRoot}/project/${segment(input.projectId, "projectId")}/retable`,
        phase: "execute",
      }),
      "Retable table response data",
    );
    return { retables: objects(data.retables, "Retable tables") };
  },
  async get_retable(input, context) {
    return {
      retable: requiredResponseRecord(
        await requestData({ ...context, path: retablePath(input), phase: "execute" }),
        "Retable table response data",
      ),
    };
  },
  async list_rows(input, context) {
    const rowIds = integerArray(input.rowIds);
    return normalizeRows(
      await requestData({
        ...context,
        path: `${retablePath(input)}/data`,
        query: { row_id: rowIds?.join(",") },
        phase: "execute",
      }),
    );
  },
  async search_rows(input, context) {
    const columnIds = stringArray(input.columnIds);
    return normalizeRows(
      await requestData({
        ...context,
        path: `${retablePath(input)}/search`,
        query: compactObject({
          columnID: requiredInputString(input.columnId, "columnId"),
          term: requiredInputString(input.term, "term"),
          columnIDs: columnIds?.join(","),
          limit: optionalNumber(input.limit),
          offset: optionalNumber(input.offset),
        }),
        phase: "execute",
      }),
    );
  },
  async insert_rows(input, context) {
    return {
      result: await requestData({
        ...context,
        path: `${retablePath(input)}/data`,
        method: "POST",
        body: { data: looseArray(input.rows) },
        phase: "execute",
      }),
    };
  },
  async update_rows(input, context) {
    return {
      result: await requestData({
        ...context,
        path: `${retablePath(input)}/data`,
        method: "PUT",
        body: { rows: looseArray(input.rows) },
        phase: "execute",
      }),
    };
  },
  async delete_rows(input, context) {
    const data = recordOrEmpty(
      await requestData({
        ...context,
        path: `${retablePath(input)}/data`,
        method: "DELETE",
        body: { row_ids: integerArray(input.rowIds) ?? [] },
        phase: "execute",
      }),
    );
    const count = optionalNumber(data.deleted_row_count);
    if (count == null || !Number.isInteger(count))
      throw providerResponseError("Retable deleted_row_count must be an integer");
    return { deletedRowCount: count };
  },
};

export async function validateCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const data = requiredResponseRecord(
    await requestData({ apiKey, fetcher, signal, path: `${apiRoot}/workspace`, phase: "validate" }),
    "Retable workspace response data",
  );
  const workspaces = objects(data.workspaces, "Retable workspaces");
  return {
    profile: { displayName: optionalString(workspaces[0]?.name) ?? "Retable API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: retableApiBaseUrl, workspaceCount: workspaces.length },
  };
}

async function requestData(input: RequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Retable", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, retableApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        ApiKey: input.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const text = await response.text();
    if (!text) throw providerResponseError("Retable returned an empty response");
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw providerResponseError("Retable returned invalid JSON");
    }
    if (!response.ok) throw requestError(response.status, payload, input.phase);
    const envelope = requiredResponseRecord(payload, "Retable response");
    if (!("data" in envelope)) throw providerResponseError("Retable response data is required");
    return envelope.data;
  });
}
function requestError(status: number, payload: unknown, phase: "execute" | "validate"): ProviderRequestError {
  const error = recordOrEmpty(payload);
  const message =
    optionalString(error.message) || optionalString(error.error) || `Retable request failed with ${status}`;
  if (phase == "validate" && (status == 401 || status == 423)) return providerInputError(message);
  return new ProviderRequestError(status == 400 || status == 404 ? 400 : status >= 400 ? status : 502, message);
}
function segment(value: unknown, name: string): string {
  return encodeURIComponent(requiredInputString(value, name));
}
function retablePath(input: Record<string, unknown>): string {
  return `${apiRoot}/retable/${segment(input.retableId, "retableId")}`;
}
function normalizeRows(data: unknown) {
  const record = requiredResponseRecord(data, "Retable row response data");
  return { rows: objects(record.rows, "Retable rows"), count: optionalNumber(record.count) ?? null };
}
function objects(value: unknown, name: string) {
  return objectArray(value, name, providerResponseError);
}
function integerArray(value: unknown): number[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item) && item > 0) : undefined;
}
function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item == "string" && item.length > 0)
    : undefined;
}
