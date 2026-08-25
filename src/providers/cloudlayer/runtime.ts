import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type CloudlayerRequestPhase = "validate" | "execute";

const cloudlayerApiBaseUrl = "https://api.cloudlayer.io";
const cloudlayerAccountPath = "/v2/account";
const cloudlayerJobsPath = "/v2/jobs";
const cloudlayerAssetsPath = "/v2/assets";

export const cloudlayerActionHandlers: ProviderActionHandlers<
  "cloudlayer",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_account(_input, context) {
    const payload = await requestCloudlayerJson({
      path: cloudlayerAccountPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      account: normalizeAccount(payload),
    };
  },
  create_html_pdf_job(input, context) {
    return createCloudlayerPdfJob("/v2/html/pdf", input, context);
  },
  create_url_pdf_job(input, context) {
    return createCloudlayerPdfJob("/v2/url/pdf", input, context);
  },
  create_template_pdf_job(input, context) {
    return createCloudlayerPdfJob("/v2/template/pdf", input, context);
  },
  async get_job(input, context) {
    const jobId = readRequiredString(input.jobId, "jobId");
    const payload = await requestCloudlayerJson({
      path: `${cloudlayerJobsPath}/${encodeURIComponent(jobId)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      job: normalizeJob(payload),
    };
  },
  async list_jobs(input, context) {
    const payload = await requestCloudlayerJson({
      path: buildListPath(cloudlayerJobsPath, input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      jobs: normalizeJobList(payload),
    };
  },
  async get_asset(input, context) {
    const assetId = readRequiredString(input.assetId, "assetId");
    const payload = await requestCloudlayerJson({
      path: `${cloudlayerAssetsPath}/${encodeURIComponent(assetId)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      asset: normalizeAsset(payload),
    };
  },
  async list_assets(input, context) {
    const payload = await requestCloudlayerJson({
      path: buildListPath(cloudlayerAssetsPath, input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      assets: normalizeAssetList(payload),
    };
  },
};

export async function validateCloudlayerCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestCloudlayerJson({
    path: cloudlayerAccountPath,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const account = normalizeAccount(payload);
  return {
    profile: {
      accountId: `cloudlayer:${String(account.uid)}`,
      displayName: String(account.uid),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: cloudlayerApiBaseUrl,
      validationEndpoint: cloudlayerAccountPath,
      ...account,
    },
  };
}

async function createCloudlayerPdfJob(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestCloudlayerJson({
    path,
    method: "POST",
    body: buildCreatePdfJobBody(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizeJob(payload);
}

async function requestCloudlayerJson(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: CloudlayerRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": input.apiKey,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(new URL(input.path, cloudlayerApiBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readCloudlayerPayload(response);
  } catch (error) {
    const message =
      error instanceof Error ? `cloudlayer request failed: ${error.message}` : "cloudlayer request failed";
    throw new ProviderRequestError(isCloudlayerTimeoutError(error) ? 504 : 502, message);
  }
  if (!response.ok) {
    throw createCloudlayerError(response, payload, input.phase);
  }
  return payload;
}

function createCloudlayerError(
  response: Response,
  payload: unknown,
  phase: CloudlayerRequestPhase,
): ProviderRequestError {
  const message =
    extractCloudlayerErrorMessage(payload) ??
    response.statusText ??
    `cloudlayer request failed with status ${response.status}`;
  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

async function readCloudlayerPayload(response: Response): Promise<unknown> {
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

function extractCloudlayerErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "error", "errorMessage", "detail"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeAccount(payload: unknown): Record<string, unknown> {
  const record = readRecord(payload);
  return compactObject({
    uid: readRequiredString(record.uid, "uid"),
    subscription: readRequiredString(record.subscription, "subscription"),
    subType: readRequiredString(record.subType, "subType"),
    subActive: readRequiredBoolean(record.subActive, "subActive"),
    calls: readRequiredInteger(record.calls, "calls"),
    callsLimit: readRequiredInteger(record.callsLimit, "callsLimit"),
    credit: optionalNumber(record.credit),
    bytesTotal: readRequiredInteger(record.bytesTotal, "bytesTotal"),
    bytesLimit: readRequiredInteger(record.bytesLimit, "bytesLimit"),
    computeTimeTotal: readRequiredInteger(record.computeTimeTotal, "computeTimeTotal"),
    computeTimeLimit: readRequiredInteger(record.computeTimeLimit, "computeTimeLimit"),
    storageUsed: readRequiredInteger(record.storageUsed, "storageUsed"),
    storageLimit: readRequiredInteger(record.storageLimit, "storageLimit"),
    totalJobs: readRequiredInteger(record.totalJobs, "totalJobs"),
    successJobs: readRequiredInteger(record.successJobs, "successJobs"),
    errorJobs: readRequiredInteger(record.errorJobs, "errorJobs"),
  });
}

function normalizeJob(payload: unknown): Record<string, unknown> {
  const record = readRecord(payload);
  return compactObject({
    id: readRequiredString(record.id, "id"),
    uid: optionalString(record.uid),
    type: optionalString(record.type),
    status: readRequiredString(record.status, "status"),
    params: optionalRecord(record.params),
    size: optionalInteger(record.size),
    processTime: optionalInteger(record.processTime),
    apiCreditCost: optionalInteger(record.apiCreditCost),
    workerName: optionalString(record.workerName),
    timestamp: optionalInteger(record.timestamp),
  });
}

function normalizeJobList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "cloudlayer jobs response must be an array");
  }
  return payload.map((item) => normalizeJob(item));
}

function normalizeAsset(payload: unknown): Record<string, unknown> {
  const record = readRecord(payload);
  return {
    id: readRequiredString(record.id, "id"),
    jobId: readRequiredString(record.jobId, "jobId"),
    ext: readRequiredString(record.ext, "ext"),
    type: readRequiredString(record.type, "type"),
    size: readRequiredInteger(record.size, "size"),
    url: readRequiredString(record.url, "url"),
    timestamp: readRequiredInteger(record.timestamp, "timestamp"),
  };
}

function normalizeAssetList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "cloudlayer assets response must be an array");
  }
  return payload.map((item) => normalizeAsset(item));
}

function buildCreatePdfJobBody(input: Record<string, unknown>): Record<string, unknown> {
  const url = optionalString(input.url);
  return compactObject({
    html: optionalString(input.html),
    url: url
      ? assertPublicHttpUrl(url, {
          fieldName: "url",
          createError: (message) => new ProviderRequestError(400, message),
        }).toString()
      : undefined,
    template: optionalString(input.template),
    data: optionalRecord(input.data),
    format: optionalString(input.format),
    margin: optionalRecord(input.margin),
    printBackground: optionalBoolean(input.printBackground),
    waitUntil: optionalString(input.waitUntil),
    timeout: optionalInteger(input.timeout),
    filename: optionalString(input.filename),
  });
}

function buildListPath(path: string, input: Record<string, unknown>): string {
  const url = new URL(path, cloudlayerApiBaseUrl);
  const limit = optionalInteger(input.limit);
  const startAfterId = optionalString(input.startAfterId);
  if (limit !== undefined) {
    url.searchParams.set("limit", String(limit));
  }
  if (startAfterId) {
    url.searchParams.set("startAfterId", startAfterId);
  }
  return `${url.pathname}${url.search}`;
}

function readRecord(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "cloudlayer response", (message) => new ProviderRequestError(502, message));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `cloudlayer response is missing required field: ${fieldName}`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `cloudlayer response is missing required integer field: ${fieldName}`);
  }
  return parsed;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `cloudlayer response is missing required boolean field: ${fieldName}`);
  }
  return parsed;
}

function isCloudlayerTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }
  const errorType = "type" in error && typeof error.type === "string" ? error.type : undefined;
  return errorType === "request-timeout" || error.message.toLowerCase().includes("timed out");
}
