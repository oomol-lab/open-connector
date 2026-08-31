import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { deviceSortColumns, sensorSortColumns } from "./constants.ts";

export const prtgClassicTablePath = "/table.json";

const prtgClassicApiPathPrefix = "/api";

type PrtgClassicRequestMode = "validate" | "execute";
type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;

interface PrtgClassicActionContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}

interface PrtgClassicRequestOptions {
  apiKey: string;
  apiBaseUrl: string;
  content: "sensors" | "devices";
  columns: readonly string[];
  context: Pick<PrtgClassicActionContext, "fetcher" | "signal">;
  mode: PrtgClassicRequestMode;
  query?: Record<string, QueryValue>;
}

type PrtgClassicActionHandler = (input: Record<string, unknown>, context: PrtgClassicActionContext) => Promise<unknown>;

export const prtgClassicActionHandlers: ProviderActionHandlers<"prtg_classic", PrtgClassicActionHandler> = {
  async list_sensors(input, context) {
    const payload = await requestPrtgClassicTableJson({
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      content: "sensors",
      columns: sensorSortColumns,
      query: buildSensorQuery(input),
      context,
      mode: "execute",
    });
    return normalizeTableResponse(payload, "sensors");
  },

  async list_devices(input, context) {
    const payload = await requestPrtgClassicTableJson({
      apiKey: context.apiKey,
      apiBaseUrl: context.apiBaseUrl,
      content: "devices",
      columns: deviceSortColumns,
      query: buildDeviceQuery(input),
      context,
      mode: "execute",
    });
    return normalizeTableResponse(payload, "devices");
  },
};

export async function validatePrtgClassicCredential(input: {
  apiKey: string;
  values: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const urls = resolvePrtgClassicUrls(input.values.instanceUrl);
  const payload = await requestPrtgClassicTableJson({
    apiKey: input.apiKey,
    apiBaseUrl: urls.apiBaseUrl,
    content: "sensors",
    columns: ["objid"],
    query: {
      count: 1,
      start: 0,
    },
    context: {
      fetcher: input.fetcher,
      signal: input.signal,
    },
    mode: "validate",
  });
  const table = normalizeTableResponse(payload, "sensors");

  return {
    profile: {
      accountId: `prtg_classic:${urls.instanceUrl}`,
      displayName: `PRTG ${new URL(urls.instanceUrl).hostname}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      instanceUrl: urls.instanceUrl,
      apiBaseUrl: urls.apiBaseUrl,
      validationEndpoint: `${prtgClassicApiPathPrefix}${prtgClassicTablePath}`,
      prtgVersion: optionalString(table.prtgVersion),
      treeSize: optionalInteger(table.treeSize),
    }),
  };
}

export function createPrtgClassicActionContext(input: {
  apiKey: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): PrtgClassicActionContext {
  return {
    apiKey: input.apiKey,
    apiBaseUrl: resolvePrtgClassicProxyBaseUrl(input.metadata),
    fetcher: input.fetcher,
    signal: input.signal,
  };
}

function resolvePrtgClassicUrls(rawInstanceUrl: unknown): { instanceUrl: string; apiBaseUrl: string } {
  const instanceUrl = normalizePrtgClassicInstanceUrl(rawInstanceUrl);
  assertPublicHttpUrl(instanceUrl, {
    fieldName: "instanceUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  return {
    instanceUrl,
    apiBaseUrl: `${instanceUrl}${prtgClassicApiPathPrefix}`,
  };
}

function resolvePrtgClassicProxyBaseUrl(metadata: Record<string, unknown> | undefined): string {
  const apiBaseUrl = optionalString(metadata?.apiBaseUrl);
  if (!apiBaseUrl) {
    throw new ProviderRequestError(500, "prtg_classic connection is missing apiBaseUrl metadata");
  }
  return apiBaseUrl;
}

function normalizePrtgClassicInstanceUrl(rawInstanceUrl: unknown): string {
  if (typeof rawInstanceUrl !== "string" || rawInstanceUrl.trim() === "") {
    throw new ProviderRequestError(400, "instanceUrl is required");
  }

  const trimmed = rawInstanceUrl.trim();
  const withScheme = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ProviderRequestError(400, "instanceUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "instanceUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "instanceUrl must not include URL credentials");
  }

  url.search = "";
  url.hash = "";
  url.pathname = normalizeInstancePath(url.pathname);
  return trimTrailingSlash(url.toString());
}

function normalizeInstancePath(pathname: string): string {
  const withoutTrailingSlash = trimTrailingSlash(pathname);
  if (!withoutTrailingSlash || withoutTrailingSlash === "/") {
    return "";
  }
  if (withoutTrailingSlash.endsWith(prtgClassicApiPathPrefix)) {
    return trimTrailingSlash(withoutTrailingSlash.slice(0, -prtgClassicApiPathPrefix.length));
  }
  return withoutTrailingSlash;
}

async function requestPrtgClassicTableJson(options: PrtgClassicRequestOptions): Promise<unknown> {
  const url = new URL(`${options.apiBaseUrl}${prtgClassicTablePath}`);
  appendQuery(url, {
    content: options.content,
    columns: options.columns.join(","),
    ...options.query,
    apitoken: options.apiKey,
  });
  assertPrtgClassicRequestUrl(url);

  const timeout = createProviderTimeout(options.context.signal);
  try {
    const response = await options.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readPrtgClassicPayload(response);

    if (!response.ok) {
      throw mapPrtgClassicHttpError(response.status, payload, options.mode);
    }
    throwIfPrtgClassicPayloadError(payload, options.mode);

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "PRTG Classic request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PRTG Classic request failed: ${error.message}` : "PRTG Classic request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function assertPrtgClassicRequestUrl(url: URL): void {
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "instanceUrl must use https");
  }
  assertPublicHttpUrl(url.toString(), {
    fieldName: "instanceUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
}

function appendQuery(url: URL, query: Record<string, QueryValue>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readPrtgClassicPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "PRTG Classic returned malformed JSON");
    }
    return {
      error: text,
    };
  }
}

function mapPrtgClassicHttpError(status: number, payload: unknown, mode: PrtgClassicRequestMode): ProviderRequestError {
  const message = readPrtgClassicErrorMessage(payload) ?? `PRTG Classic request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function throwIfPrtgClassicPayloadError(payload: unknown, mode: PrtgClassicRequestMode): void {
  const body = optionalRecord(payload);
  if (!body) {
    return;
  }
  const message = readPrtgClassicErrorMessage(body);
  if (!message) {
    return;
  }

  const errorCode = optionalInteger(body.errorcode);
  if (errorCode === 401 || errorCode === 403) {
    throw new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  throw new ProviderRequestError(400, message, payload);
}

function readPrtgClassicErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  return readNonEmptyString(body.error) ?? readNonEmptyString(body.message) ?? readNonEmptyString(body.messages);
}

function normalizeTableResponse(payload: unknown, outputKey: "sensors" | "devices"): Record<string, unknown> {
  const body = optionalRecord(payload);
  const rows = body?.[outputKey];
  if (!body || !Array.isArray(rows)) {
    throw new ProviderRequestError(502, `PRTG Classic returned an invalid ${outputKey} table payload`, payload);
  }

  const output: Record<string, unknown> = {
    [outputKey]: rows,
    raw: body,
  };
  const treeSize = optionalInteger(body.treesize);
  if (treeSize !== undefined) {
    output.treeSize = treeSize;
  }
  const prtgVersion = readNonEmptyString(body["prtg-version"]);
  if (prtgVersion) {
    output.prtgVersion = prtgVersion;
  }
  return output;
}

function buildSensorQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    ...buildCommonTableQuery(input, sensorSortColumns),
    filter_tags: formatFilterTag(input.filterTags),
    filter_type: readNonEmptyString(input.filterType),
    filter_device: readNonEmptyString(input.filterDevice),
    filter_sensor: readNonEmptyString(input.filterSensor),
  });
}

function buildDeviceQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    ...buildCommonTableQuery(input, deviceSortColumns),
    filter_host: readNonEmptyString(input.filterHost),
    filter_device: readNonEmptyString(input.filterDevice),
  });
}

function buildCommonTableQuery(
  input: Record<string, unknown>,
  allowedSortColumns: readonly string[],
): Record<string, QueryValue> {
  return compactObject({
    count: optionalInteger(input.count),
    start: optionalInteger(input.start),
    id: optionalInteger(input.objectId),
    filter_status: readStatusFilters(input.filterStatus),
    sortby: buildSortBy(input, allowedSortColumns),
  });
}

function buildSortBy(input: Record<string, unknown>, allowedSortColumns: readonly string[]): string | undefined {
  const sortBy = readNonEmptyString(input.sortBy);
  const descending = optionalBoolean(input.sortDescending) ?? false;
  if (!sortBy) {
    if (descending) {
      throw new ProviderRequestError(400, "sortDescending requires sortBy");
    }
    return undefined;
  }
  if (!allowedSortColumns.includes(sortBy)) {
    throw new ProviderRequestError(400, "sortBy is not a supported PRTG column");
  }
  return descending ? `-${sortBy}` : sortBy;
}

function readStatusFilters(value: unknown): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "filterStatus must be a non-empty array");
  }

  return value.map((item) => {
    const status = optionalInteger(item);
    if (status === undefined || status < 1 || status > 14) {
      throw new ProviderRequestError(400, "filterStatus values must be between 1 and 14");
    }
    return status;
  });
}

function formatFilterTag(value: unknown): string | undefined {
  const tag = readNonEmptyString(value);
  if (!tag) {
    return undefined;
  }
  return tag.startsWith("@tag(") ? tag : `@tag(${tag})`;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}
