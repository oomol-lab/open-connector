import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  values: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
}

export const smartsuiteApiBaseUrl = "https://app.smartsuite.com/api/v1";
const smartsuiteRequestTimeoutMs = 30_000;

interface SmartsuiteActionInput extends ApiKeyProviderActionInput {
  actionName: string;
}

interface SmartsuiteRequestInput {
  apiKey: string;
  workspaceId: string;
  path: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
  allowEmpty?: boolean;
}

export async function validateSmartsuiteCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const workspaceId = readWorkspaceId(input);
  await requestSmartsuite({
    apiKey: input.apiKey,
    workspaceId,
    path: "/solutions/",
    fetcher,
    phase: "validate",
  });

  return {
    accountLabel: `SmartSuite workspace ${workspaceId}`,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: smartsuiteApiBaseUrl,
      workspaceId,
      validationEndpoint: "/solutions/",
    },
  };
}

export async function executeSmartsuiteAction(input: SmartsuiteActionInput, fetcher: typeof fetch): Promise<unknown> {
  const apiKey = input.apiKey;
  const workspaceId = readWorkspaceId(input.values);
  const request = (options: Omit<SmartsuiteRequestInput, "apiKey" | "workspaceId" | "fetcher" | "phase">) =>
    requestSmartsuite({
      apiKey,
      workspaceId,
      fetcher,
      phase: "execute",
      ...options,
    });

  switch (input.actionName) {
    case "list_solutions":
      return { solutions: requireArray(await request({ path: "/solutions/" }), "solutions") };
    case "list_tables": {
      const solutionId = optionalString(input.input.solutionId);
      return {
        tables: requireArray(await request({ path: "/applications/", query: { solution: solutionId } }), "tables"),
      };
    }
    case "list_records": {
      const tableId = readRequiredString(input.input.tableId, "tableId");
      const payload = optionalRecord(
        await request({
          path: `/applications/${encodeURIComponent(tableId)}/records/list/`,
          method: "POST",
          query: jsonObject({
            offset: stringifyOptionalInteger(optionalInteger(input.input.offset)),
            limit: stringifyOptionalInteger(optionalInteger(input.input.limit)),
            all: stringifyOptionalBoolean(optionalBoolean(input.input.includeDeleted)),
          }),
          body: jsonObject({
            hydrated: optionalBoolean(input.input.hydrated),
            sort: input.input.sort,
            filter: input.input.filter,
          }),
        }),
      );
      if (!payload || !Array.isArray(payload.items)) {
        throw invalidPayload("record list response did not include items");
      }
      return {
        total: readRequiredInteger(payload.total, "total"),
        offset: readRequiredInteger(payload.offset, "offset"),
        limit: readRequiredInteger(payload.limit, "limit"),
        records: payload.items,
      };
    }
    case "get_record": {
      const { tableId, recordId } = readRecordIdentity(input.input);
      return {
        record: requireObject(
          await request({
            path: `/applications/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}/`,
            query: {
              hydrated: stringifyOptionalBoolean(optionalBoolean(input.input.hydrated)),
            },
          }),
          "record",
        ),
      };
    }
    case "create_record": {
      const tableId = readRequiredString(input.input.tableId, "tableId");
      return {
        record: requireObject(
          await request({
            path: `/applications/${encodeURIComponent(tableId)}/records/`,
            method: "POST",
            body: requireInputObject(input.input.fields, "fields"),
          }),
          "record",
        ),
      };
    }
    case "update_record": {
      const { tableId, recordId } = readRecordIdentity(input.input);
      return {
        record: requireObject(
          await request({
            path: `/applications/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}/`,
            method: "PATCH",
            body: requireInputObject(input.input.fields, "fields"),
          }),
          "record",
        ),
      };
    }
    case "delete_record": {
      const { tableId, recordId } = readRecordIdentity(input.input);
      await request({
        path: `/applications/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}/`,
        method: "DELETE",
        allowEmpty: true,
      });
      return { deleted: true };
    }
  }
}

async function requestSmartsuite(input: SmartsuiteRequestInput) {
  const url = new URL(`${smartsuiteApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(undefined, smartsuiteRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Token ${input.apiKey}`,
        "account-id": input.workspaceId,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response, input.allowEmpty === true);
    if (!response.ok) throw createSmartsuiteError(response, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "SmartSuite request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SmartSuite request failed: ${error.message}` : "SmartSuite request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response, allowEmpty: boolean) {
  const text = await response.text();
  if (text.trim() === "") {
    if (allowEmpty || !response.ok) return null;
    throw invalidPayload("response did not include JSON");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return null;
    throw invalidPayload("response was not valid JSON");
  }
}

function createSmartsuiteError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.error) ??
    `SmartSuite request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (400 <= response.status && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readWorkspaceId(input: Record<string, unknown> | undefined) {
  return readRequiredString(input?.workspaceId, "workspaceId");
}

function readRequiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (!result) throw new ProviderRequestError(400, `SmartSuite requires ${field}`);
  return result;
}

function readRecordIdentity(input: Record<string, unknown>) {
  return {
    tableId: readRequiredString(input.tableId, "tableId"),
    recordId: readRequiredString(input.recordId, "recordId"),
  };
}

function requireInputObject(value: unknown, field: string) {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(400, `SmartSuite requires ${field} object`);
  return object;
}

function requireObject(value: unknown, label: string) {
  const object = optionalRecord(value);
  if (!object) throw invalidPayload(`${label} response was not an object`);
  return object;
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw invalidPayload(`${label} response was not an array`);
  return value;
}

function readRequiredInteger(value: unknown, field: string) {
  const integer = optionalInteger(value);
  if (integer === undefined) throw invalidPayload(`record list response did not include ${field}`);
  return integer;
}

function stringifyOptionalInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}

function invalidPayload(message: string) {
  return new ProviderRequestError(502, `SmartSuite ${message}`);
}
