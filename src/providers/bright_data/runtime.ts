import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const brightDataApiBaseUrl = "https://api.brightdata.com";
const brightDataStatusPath = "/status";
const brightDataRequestTimeoutMs = 30_000;

type BrightDataRequestPhase = "validate" | "execute";
type BrightDataQueryValue = string | number | boolean | undefined;
type BrightDataActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BrightDataActionHandler = (input: Record<string, unknown>, context: BrightDataActionContext) => Promise<unknown>;

interface BrightDataRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: BrightDataRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, BrightDataQueryValue>;
  notFoundAsInvalidInput?: boolean;
}

export const brightDataActionHandlers: ProviderActionHandlers<"bright_data", BrightDataActionHandler> = {
  get_account_status(_input, context) {
    return getAccountStatus(context, "execute");
  },
  list_datasets(_input, context) {
    return listDatasets(context);
  },
  get_dataset_metadata(input, context) {
    return getDatasetMetadata(input, context);
  },
  list_dataset_views(_input, context) {
    return listDatasetViews(context);
  },
  get_snapshot_metadata(input, context) {
    return getSnapshotMetadata(input, context);
  },
  get_snapshot_parts(input, context) {
    return getSnapshotParts(input, context);
  },
};

export async function validateBrightDataCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const account = await getAccountStatus({ apiKey: trimmedApiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: account.customer ? `bright_data:${account.customer}` : "bright_data:api_key",
      displayName: account.customer ? `Bright Data ${account.customer}` : "Bright Data API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: brightDataApiBaseUrl,
      validationEndpoint: brightDataStatusPath,
      status: account.status,
      customer: account.customer,
      canMakeRequests: account.canMakeRequests,
      authFailReason: account.authFailReason ?? undefined,
    }),
  };
}

async function getAccountStatus(
  context: BrightDataActionContext,
  phase: BrightDataRequestPhase,
): Promise<{
  status: string;
  customer: string;
  canMakeRequests: boolean;
  authFailReason: string | null;
  ip: string | null;
  raw: Record<string, unknown>;
}> {
  const payload = await requestBrightDataJson({
    apiKey: context.apiKey,
    path: brightDataStatusPath,
    fetcher: context.fetcher,
    signal: context.signal,
    phase,
  });
  const record = readObjectPayload(payload, "Bright Data account status response");

  return {
    status: optionalString(record.status) ?? "",
    customer: optionalString(record.customer) ?? "",
    canMakeRequests: optionalBoolean(record.can_make_requests) ?? false,
    authFailReason: optionalString(record.auth_fail_reason) ?? null,
    ip: optionalString(record.ip) ?? null,
    raw: record,
  };
}

async function listDatasets(context: BrightDataActionContext): Promise<unknown> {
  const payload = await requestBrightDataJson({
    apiKey: context.apiKey,
    path: "/datasets/list",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const datasets = readArrayPayload(payload, "Bright Data dataset list response");

  return {
    datasets: datasets.map(normalizeDataset),
    raw: datasets,
  };
}

async function getDatasetMetadata(input: Record<string, unknown>, context: BrightDataActionContext): Promise<unknown> {
  const datasetId = readRequiredString(input.datasetId, "datasetId");
  const payload = await requestBrightDataJson({
    apiKey: context.apiKey,
    path: `/datasets/${encodeURIComponent(datasetId)}/metadata`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const record = readObjectPayload(payload, "Bright Data dataset metadata response");

  return {
    id: optionalString(record.id) ?? "",
    fields: readRecordField(record.fields, "fields"),
    raw: record,
  };
}

async function listDatasetViews(context: BrightDataActionContext): Promise<unknown> {
  const payload = await requestBrightDataJson({
    apiKey: context.apiKey,
    path: "/datasets/views",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const views = readArrayPayload(payload, "Bright Data dataset views response");

  return {
    views,
    raw: views,
  };
}

async function getSnapshotMetadata(input: Record<string, unknown>, context: BrightDataActionContext): Promise<unknown> {
  const snapshotId = readRequiredString(input.snapshotId, "snapshotId");
  const payload = await requestBrightDataJson({
    apiKey: context.apiKey,
    path: `/datasets/snapshots/${encodeURIComponent(snapshotId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const snapshot = readObjectPayload(payload, "Bright Data snapshot metadata response");

  return {
    snapshot,
    raw: snapshot,
  };
}

async function getSnapshotParts(input: Record<string, unknown>, context: BrightDataActionContext): Promise<unknown> {
  const snapshotId = readRequiredString(input.snapshotId, "snapshotId");
  const payload = await requestBrightDataJson({
    apiKey: context.apiKey,
    path: `/datasets/snapshots/${encodeURIComponent(snapshotId)}/parts`,
    query: compactObject({
      format: optionalString(input.format),
      compress: optionalBoolean(input.compress),
      batch_size: optionalInteger(input.batchSize),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const record = readObjectPayload(payload, "Bright Data snapshot parts response");

  return {
    parts: readRequiredNumber(record.parts, "parts"),
    raw: record,
  };
}

async function requestBrightDataJson(input: BrightDataRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, brightDataRequestTimeoutMs);
  const url = new URL(input.path, brightDataApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: brightDataHeaders(input.apiKey),
      signal: timeout.signal,
    });
    const payload = await readBrightDataPayload(response);
    if (!response.ok) {
      throw createBrightDataError(response, payload, input.phase, input.notFoundAsInvalidInput);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Bright Data request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Bright Data request failed: ${error.message}` : "Bright Data request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function brightDataHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readBrightDataPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBrightDataError(
  response: Response,
  payload: unknown,
  phase: BrightDataRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message =
    extractBrightDataErrorMessage(payload) ??
    response.statusText ??
    `Bright Data request failed with status ${response.status || 500}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if ([400, 422].includes(response.status) || (notFoundAsInvalidInput && response.status === 404)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractBrightDataErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function normalizeDataset(value: unknown): Record<string, unknown> {
  const record = readObjectPayload(value, "Bright Data dataset");
  return {
    id: optionalString(record.id) ?? "",
    name: optionalString(record.name) ?? "",
    size: optionalInteger(record.size) ?? 0,
  };
}

function readObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return record;
}

function readArrayPayload(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be a JSON array`);
  }
  return value.map((item) => readObjectPayload(item, label));
}

function readRecordField(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is required in Bright Data response`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be a finite number in Bright Data response`);
  }
  return value;
}
