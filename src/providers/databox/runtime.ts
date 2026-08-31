import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

const databoxApiBaseUrl = "https://api.databox.com";
const validateKeyPath = "/v1/auth/validate-key";

type DataboxPhase = "validate" | "execute";
type DataboxMethod = "GET" | "POST" | "DELETE";
type DataboxHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const databoxActionHandlers: ProviderActionHandlers<"databox", DataboxHandler> = {
  list_accounts(_input, context) {
    return databoxRequestJson({ method: "GET", path: "/v1/accounts", context, phase: "execute" });
  },
  create_data_source(input, context) {
    return createWrappedResource({
      method: "POST",
      path: "/v1/data-sources",
      body: { accountId: input.accountId, title: input.title, timezone: input.timezone },
      context,
      outputKey: "dataSource",
    });
  },
  delete_data_source(input, context) {
    return databoxRequestJson({
      method: "DELETE",
      path: `/v1/data-sources/${encodePathSegment(input.dataSourceId)}`,
      context,
      phase: "execute",
    });
  },
  create_dataset(input, context) {
    return createWrappedResource({
      method: "POST",
      path: "/v1/datasets",
      body: { dataSourceId: input.dataSourceId, title: input.title, primaryKeys: input.primaryKeys },
      context,
      outputKey: "dataset",
    });
  },
  delete_dataset(input, context) {
    return databoxRequestJson({
      method: "DELETE",
      path: `/v1/datasets/${encodePathSegment(input.datasetId)}`,
      context,
      phase: "execute",
    });
  },
  push_dataset_data(input, context) {
    return databoxRequestJson({
      method: "POST",
      path: `/v1/datasets/${encodePathSegment(input.datasetId)}/data`,
      body: { records: input.records },
      context,
      phase: "execute",
    });
  },
  get_dataset_ingestion_status(input, context) {
    return databoxRequestJson({
      method: "GET",
      path: `/v1/datasets/${encodePathSegment(input.datasetId)}/ingestions/${encodePathSegment(input.ingestionId)}`,
      context,
      phase: "execute",
    });
  },
};

export async function validateDataboxCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const payload = await databoxRequestJson({ method: "GET", path: validateKeyPath, context, phase: "validate" });
  const record = requireDataboxPayloadObject(payload);
  return {
    profile: { accountId: "databox:token", displayName: "Databox API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: databoxApiBaseUrl,
      validationEndpoint: validateKeyPath,
      status: optionalString(record.status),
      requestId: optionalString(record.requestId),
    }),
  };
}

async function createWrappedResource(input: {
  method: DataboxMethod;
  path: string;
  body: Record<string, unknown>;
  context: ApiKeyProviderContext;
  outputKey: "dataSource" | "dataset";
}) {
  const payload = await databoxRequestJson({
    method: input.method,
    path: input.path,
    body: input.body,
    context: input.context,
    phase: "execute",
  });
  const record = requireDataboxPayloadObject(payload);
  const resource = Object.hasOwn(record, input.outputKey) ? record[input.outputKey] : omitRequestId(record);
  return compactObject({ requestId: optionalString(record.requestId), [input.outputKey]: resource });
}

async function databoxRequestJson(input: {
  method: DataboxMethod;
  path: string;
  context: ApiKeyProviderContext;
  phase: DataboxPhase;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  return runProviderRequest({ signal: input.context.signal, label: "Databox" }, async (signal) => {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-api-key": input.context.apiKey,
    };
    if (input.body !== undefined) headers["content-type"] = "application/json";
    const response = await input.context.fetcher(new URL(input.path, databoxApiBaseUrl), {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readDataboxPayload(response);
    if (!response.ok) throw createDataboxError(response.status, payload, input.phase);
    return payload;
  });
}

async function readDataboxPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Databox returned invalid JSON");
  }
}

function createDataboxError(status: number, payload: unknown, phase: DataboxPhase): ProviderRequestError {
  const message = extractDataboxErrorMessage(payload) ?? `Databox request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status || 500, message);
}

function extractDataboxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const nestedError = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(nestedError?.message)
  );
}

function requireDataboxPayloadObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "Databox returned invalid response payload");
  return record;
}

function omitRequestId(record: Record<string, unknown>): Record<string, unknown> {
  const { requestId: _requestId, ...rest } = record;
  return rest;
}
