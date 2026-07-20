import type { CredentialValidationResult } from "../../core/types.ts";
import type { AliyunSlsActionName } from "./actions.ts";
import type { AliyunSlsCredential } from "./resources.ts";

import { Buffer } from "node:buffer";
import {
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalIntegerLike,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, readProviderTextBody } from "../provider-runtime.ts";
import {
  assertAliyunSlsEndpointAllowed,
  filterAliyunSlsLogstores,
  filterAliyunSlsProjects,
  normalizeAliyunSlsEndpoint,
  normalizeAliyunSlsEndpointList,
  normalizeAliyunSlsProjectName,
  parseAliyunSlsCredential,
  resolveAliyunSlsLogstoreTarget,
  resolveAliyunSlsProjectTarget,
} from "./resources.ts";
import { signAliyunSlsRequest } from "./signing.ts";

const listProjectDefaultSize = 100;
const listLogstoreDefaultSize = 200;
const maximumListSize = 500;
const maximumQueryLines = 100;
const maximumPaginationPages = 20;
const maximumPaginatedItems = maximumListSize * maximumPaginationPages;
const regionalConcurrency = 5;

export interface AliyunSlsActionContext {
  credential: AliyunSlsCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  now: () => Date;
}

export interface AliyunSlsRequestInput {
  operation: string;
  endpoint: string;
  method: string;
  path: string;
  query?: Record<string, string>;
  project?: string;
  headers?: HeadersInit;
  bodyBytes?: Uint8Array;
}

export interface AliyunSlsJsonResponse {
  data: unknown;
  headers: Headers;
}

interface AliyunSlsPage<T> {
  items: T[];
  total: number;
}

interface AliyunSlsRegionSuccess {
  endpoint: string;
  projects: Array<Record<string, unknown>>;
}

interface AliyunSlsRegionFailure {
  endpoint: string;
  error: ProviderRequestError;
}

interface AliyunSlsHistogram {
  from: number;
  to: number;
  count: number;
  progress: string;
}

type AliyunSlsActionHandler = (input: Record<string, unknown>, context: AliyunSlsActionContext) => Promise<unknown>;

export const aliyunSlsActionHandlers: Record<AliyunSlsActionName, AliyunSlsActionHandler> = {
  list_projects(input, context) {
    return listProjects(input, context);
  },
  list_projects_across_regions(input, context) {
    return listProjectsAcrossRegions(input, context);
  },
  list_logstores(input, context) {
    return listLogstores(input, context);
  },
  query_logs(input, context) {
    return queryLogs(input, context);
  },
  get_histograms(input, context) {
    return getHistograms(input, context);
  },
};

export function createAliyunSlsContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): AliyunSlsActionContext {
  return {
    credential: parseAliyunSlsCredential(values),
    fetcher,
    signal,
    now: () => new Date(),
  };
}

/** Validate local credential structure without requiring a provider-wide RAM permission. */
export function validateAliyunSlsCredential(values: Record<string, string>): CredentialValidationResult {
  const credential = parseAliyunSlsCredential(values);
  return {
    profile: {
      accountId: credential.accessKeyId,
      displayName: `${credential.accessKeyId}@${credential.endpoint}`,
    },
    grantedScopes: [],
  };
}

/** Send one signed SLS request and return its parsed JSON and response headers. */
export async function requestAliyunSlsJson(
  context: AliyunSlsActionContext,
  input: AliyunSlsRequestInput,
): Promise<AliyunSlsJsonResponse> {
  const endpoint = normalizeAliyunSlsEndpoint(input.endpoint);
  const project =
    input.project === undefined ? undefined : normalizeAliyunSlsProjectName(input.project, "request project");
  const url = buildAliyunSlsRequestUrl(endpoint, project, input.path, input.query);
  const signed = signAliyunSlsRequest({
    method: input.method,
    path: input.path,
    query: input.query,
    credential: context.credential,
    date: context.now(),
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
      ...headersToRecord(input.headers),
    },
    bodyBytes: input.bodyBytes,
  });

  const requestInit: RequestInit = {
    method: input.method,
    headers: signed.headers,
    redirect: "error",
    signal: context.signal,
  };
  if (signed.bodyBytes.byteLength > 0) {
    requestInit.body = Buffer.from(signed.bodyBytes);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, requestInit);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (context.signal?.aborted) {
      throw new ProviderRequestError(499, `${input.operation} request was aborted`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `${input.operation} request failed: ${error.message}`
        : `${input.operation} request failed`,
    );
  }

  const text = await readProviderTextBody(response, `${input.operation} response`);
  if (!response.ok) {
    throw createAliyunSlsResponseError(input.operation, response, text);
  }
  if (!text.trim()) {
    throw new ProviderRequestError(502, `${input.operation} returned an empty response`);
  }

  try {
    return {
      data: JSON.parse(text) as unknown,
      headers: response.headers,
    };
  } catch (error) {
    throw new ProviderRequestError(502, `${input.operation} returned invalid JSON`, error);
  }
}

export function buildAliyunSlsRequestUrl(
  endpoint: string,
  project: string | undefined,
  path: string,
  query?: Record<string, string>,
): string {
  const authority = project ? `${project}.${endpoint}` : endpoint;
  const url = new URL(`https://${authority}`);
  url.pathname = path;
  for (const [key, value] of Object.entries(query ?? {}).sort(([left], [right]) => compareAscii(left, right))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function listProjects(
  input: Record<string, unknown>,
  context: AliyunSlsActionContext,
): Promise<Record<string, unknown>> {
  const endpointInput = optionalString(input.endpoint);
  const endpoint = endpointInput ? normalizeAliyunSlsEndpoint(endpointInput) : context.credential.endpoint;
  const scopeEntries = assertAliyunSlsEndpointAllowed(context.credential.resourceScope, endpoint);
  const offset = readBoundedInteger(input.offset, "offset", 0, 0);
  const size = readBoundedInteger(input.size, "size", listProjectDefaultSize, 1, maximumListSize);
  const queryOptions: AliyunSlsProjectQueryOptions = {
    endpoint,
    projectName: optionalString(input.projectName),
    resourceGroupId: optionalString(input.resourceGroupId),
  };
  let projects: Array<Record<string, unknown>>;
  let total: number;
  if (scopeEntries) {
    const scopedProjects = filterAliyunSlsProjects(
      await collectAllProjectsForEndpoint(context, queryOptions),
      scopeEntries,
    );
    projects = scopedProjects.slice(offset, offset + size);
    total = scopedProjects.length;
  } else {
    const page = await requestProjectPage(context, { ...queryOptions, offset, size });
    projects = page.items;
    total = page.total;
  }
  return {
    endpoint,
    count: projects.length,
    total,
    projects,
  };
}

async function listProjectsAcrossRegions(
  input: Record<string, unknown>,
  context: AliyunSlsActionContext,
): Promise<Record<string, unknown>> {
  const endpoints = normalizeAliyunSlsEndpointList(input.endpoints);
  for (const endpoint of endpoints) {
    assertAliyunSlsEndpointAllowed(context.credential.resourceScope, endpoint);
  }
  const projectName = optionalString(input.projectName);
  const resourceGroupId = optionalString(input.resourceGroupId);
  const outcomes = await mapWithConcurrency(endpoints, regionalConcurrency, async (endpoint) => {
    try {
      return await listAllProjectsForEndpoint(context, endpoint, projectName, resourceGroupId);
    } catch (error) {
      return {
        endpoint,
        error: normalizeAliyunSlsRuntimeError(error, `list_projects failed for endpoint ${endpoint}`),
      } satisfies AliyunSlsRegionFailure;
    }
  });
  const failures = outcomes.filter((outcome): outcome is AliyunSlsRegionFailure => "error" in outcome);
  if (failures.length > 0 && input.allowPartial !== true) {
    throw failures[0]!.error;
  }

  const successes = outcomes.filter((outcome): outcome is AliyunSlsRegionSuccess => "projects" in outcome);
  const uniqueProjects = new Map<string, Record<string, unknown>>();
  for (const success of successes) {
    for (const project of success.projects) {
      const region = requiredString(project.region, "Project region", badGateway);
      const projectNameValue = requiredString(project.projectName, "Project name", badGateway);
      const key = `${region}\u0000${projectNameValue}`;
      if (!uniqueProjects.has(key)) uniqueProjects.set(key, project);
    }
  }

  const projects = [...uniqueProjects.values()];
  return {
    projects,
    total: projects.length,
    regions: successes.map((success) => ({ endpoint: success.endpoint, count: success.projects.length })),
    failures: failures.map((failure) => ({
      endpoint: failure.endpoint,
      status: failure.error.status,
      message: failure.error.message,
    })),
    complete: failures.length === 0,
  };
}

async function listAllProjectsForEndpoint(
  context: AliyunSlsActionContext,
  endpoint: string,
  projectName?: string,
  resourceGroupId?: string,
): Promise<AliyunSlsRegionSuccess> {
  const scopeEntries = assertAliyunSlsEndpointAllowed(context.credential.resourceScope, endpoint);
  const projects = filterAliyunSlsProjects(
    await collectAllProjectsForEndpoint(context, { endpoint, projectName, resourceGroupId }),
    scopeEntries,
  );
  return { endpoint, projects };
}

interface AliyunSlsProjectQueryOptions {
  endpoint: string;
  projectName?: string;
  resourceGroupId?: string;
}

interface RequestProjectPageOptions extends AliyunSlsProjectQueryOptions {
  offset: number;
  size: number;
}

async function collectAllProjectsForEndpoint(
  context: AliyunSlsActionContext,
  options: AliyunSlsProjectQueryOptions,
): Promise<Array<Record<string, unknown>>> {
  return collectAllAliyunSlsPages("ListProject", (offset, size) =>
    requestProjectPage(context, { ...options, offset, size }),
  );
}

async function requestProjectPage(
  context: AliyunSlsActionContext,
  options: RequestProjectPageOptions,
): Promise<AliyunSlsPage<Record<string, unknown>>> {
  const query: Record<string, string> = {
    offset: String(options.offset),
    size: String(options.size),
  };
  if (options.projectName) query.projectName = options.projectName;
  if (options.resourceGroupId) query.resourceGroupId = options.resourceGroupId;
  const response = await requestAliyunSlsJson(context, {
    operation: "Alibaba Cloud SLS ListProject",
    endpoint: options.endpoint,
    method: "GET",
    path: "/",
    query,
  });
  const payload = requiredRecord(response.data, "ListProject response", badGateway);
  const rawProjects = objectArray(payload.projects, "ListProject projects", badGateway);
  const page = validateAliyunSlsPage(
    rawProjects,
    payload.count,
    payload.total,
    "ListProject",
    options.offset,
    options.size,
  );
  return {
    items: page.items.map((project) => normalizeProject(project, options.endpoint)),
    total: page.total,
  };
}

async function listLogstores(
  input: Record<string, unknown>,
  context: AliyunSlsActionContext,
): Promise<Record<string, unknown>> {
  const target = resolveAliyunSlsProjectTarget(context.credential, input.endpoint, input.project);
  const offset = readBoundedInteger(input.offset, "offset", 0, 0);
  const size = readBoundedInteger(input.size, "size", listLogstoreDefaultSize, 1, maximumListSize);
  const queryOptions: AliyunSlsLogstoreQueryOptions = {
    endpoint: target.endpoint,
    project: target.project,
    logstoreName: optionalString(input.logstoreName),
  };
  let logstores: string[];
  let total: number;
  if (target.scopeEntry?.logstores) {
    const scopedLogstores = filterAliyunSlsLogstores(
      await collectAllLogstoresForProject(context, queryOptions),
      target.scopeEntry,
    );
    logstores = scopedLogstores.slice(offset, offset + size);
    total = scopedLogstores.length;
  } else {
    const page = await requestLogstorePage(context, { ...queryOptions, offset, size });
    logstores = page.items;
    total = page.total;
  }
  return {
    endpoint: target.endpoint,
    project: target.project,
    count: logstores.length,
    total,
    logstores,
  };
}

interface AliyunSlsLogstoreQueryOptions {
  endpoint: string;
  project: string;
  logstoreName?: string;
}

interface RequestLogstorePageOptions extends AliyunSlsLogstoreQueryOptions {
  offset: number;
  size: number;
}

async function collectAllLogstoresForProject(
  context: AliyunSlsActionContext,
  options: AliyunSlsLogstoreQueryOptions,
): Promise<string[]> {
  return collectAllAliyunSlsPages("ListLogStores", (offset, size) =>
    requestLogstorePage(context, { ...options, offset, size }),
  );
}

async function requestLogstorePage(
  context: AliyunSlsActionContext,
  options: RequestLogstorePageOptions,
): Promise<AliyunSlsPage<string>> {
  const query: Record<string, string> = {
    offset: String(options.offset),
    size: String(options.size),
  };
  if (options.logstoreName) query.logstoreName = options.logstoreName;
  const response = await requestAliyunSlsJson(context, {
    operation: "Alibaba Cloud SLS ListLogStores",
    endpoint: options.endpoint,
    project: options.project,
    method: "GET",
    path: "/logstores",
    query,
  });
  const payload = requiredRecord(response.data, "ListLogStores response", badGateway);
  const logstores = requiredStringArray(payload.logstores, "ListLogStores logstores", badGateway);
  return validateAliyunSlsPage(logstores, payload.count, payload.total, "ListLogStores", options.offset, options.size);
}

async function queryLogs(
  input: Record<string, unknown>,
  context: AliyunSlsActionContext,
): Promise<Record<string, unknown>> {
  const target = resolveAliyunSlsLogstoreTarget(context.credential, input.endpoint, input.project, input.logstore);
  const { from, to } = readQueryTimeRange(input);
  const query: Record<string, string> = {
    type: "log",
    from: String(from),
    to: String(to),
    offset: String(readBoundedInteger(input.offset, "offset", 0, 0)),
    line: String(readBoundedInteger(input.line, "line", maximumQueryLines, 0, maximumQueryLines)),
    reverse: String(input.reverse === true),
    powerSql: String(input.powerSql === true),
  };
  const queryStatement = optionalRawString(input.query);
  if (queryStatement) query.query = queryStatement;
  const response = await requestAliyunSlsJson(context, {
    operation: "Alibaba Cloud SLS GetLogs",
    endpoint: target.endpoint,
    project: target.project,
    method: "GET",
    path: `/logstores/${encodeURIComponent(target.logstore)}`,
    query,
  });
  const normalized = normalizeLogsResponse(response);
  return {
    endpoint: target.endpoint,
    project: target.project,
    logstore: target.logstore,
    ...normalized,
  };
}

async function getHistograms(
  input: Record<string, unknown>,
  context: AliyunSlsActionContext,
): Promise<Record<string, unknown>> {
  const target = resolveAliyunSlsLogstoreTarget(context.credential, input.endpoint, input.project, input.logstore);
  const { from, to } = readQueryTimeRange(input);
  const query: Record<string, string> = {
    type: "histogram",
    from: String(from),
    to: String(to),
  };
  const queryStatement = optionalRawString(input.query);
  if (queryStatement) query.query = queryStatement;
  const response = await requestAliyunSlsJson(context, {
    operation: "Alibaba Cloud SLS GetHistograms",
    endpoint: target.endpoint,
    project: target.project,
    method: "GET",
    path: `/logstores/${encodeURIComponent(target.logstore)}`,
    query,
  });
  const histograms = normalizeHistograms(response.data);
  return {
    endpoint: target.endpoint,
    project: target.project,
    logstore: target.logstore,
    progress: requiredResponseHeader(response.headers, "x-log-progress", "GetHistograms progress"),
    count: histograms.reduce((total, histogram) => total + histogram.count, 0),
    histograms,
  };
}

function normalizeProject(project: Record<string, unknown>, endpoint: string): Record<string, unknown> {
  return {
    endpoint,
    projectName: requiredString(project.projectName, "Project projectName", badGateway),
    region: requiredString(project.region, "Project region", badGateway),
    description: responseString(project.description),
    status: responseString(project.status),
    createTime: responseString(project.createTime),
    lastModifyTime: responseString(project.lastModifyTime),
    resourceGroupId: responseNullableString(project.resourceGroupId),
    dataRedundancyType: responseNullableString(project.dataRedundancyType),
    recycleBinEnabled: optionalBoolean(project.recycleBinEnabled) ?? null,
    internetEndpoint: responseNullableString(project.internetEndpoint),
    internalEndpoint: responseNullableString(project.internalEndpoint),
  };
}

function normalizeLogsResponse(response: AliyunSlsJsonResponse): Record<string, unknown> {
  let logsValue = response.data;
  let meta: Record<string, unknown> | undefined;
  const record = optionalRecord(response.data);
  if (record) {
    logsValue = record.data;
    meta = optionalRecord(record.meta);
  }
  const logs = objectArray(logsValue, "GetLogs data", badGateway);
  const progress =
    optionalString(meta?.progress) ?? requiredResponseHeader(response.headers, "x-log-progress", "GetLogs progress");
  return {
    progress,
    count: readResponseInteger(meta?.count, logs.length, "GetLogs count"),
    processedRows: readOptionalResponseInteger(meta?.processedRows ?? response.headers.get("x-log-processed-rows")),
    elapsedMilliseconds: readOptionalResponseInteger(
      meta?.elapsedMillisecond ?? response.headers.get("x-log-elapsed-millisecond"),
    ),
    hasSql: optionalBoolean(meta?.hasSQL) ?? readOptionalResponseBoolean(response.headers.get("x-log-has-sql")),
    logs,
  };
}

function normalizeHistograms(value: unknown): AliyunSlsHistogram[] {
  return objectArray(value, "GetHistograms histogram data", badGateway).map((record, index) => {
    return {
      from: readRequiredResponseInteger(record.from, `histogram[${index}].from`),
      to: readRequiredResponseInteger(record.to, `histogram[${index}].to`),
      count: readRequiredResponseInteger(record.count, `histogram[${index}].count`),
      progress: requiredString(record.progress, `histogram[${index}].progress`, badGateway),
    };
  });
}

function readQueryTimeRange(input: Record<string, unknown>): { from: number; to: number } {
  const from = readRequiredInputInteger(input.from, "from");
  const to = readRequiredInputInteger(input.to, "to");
  if (from < 0 || to < 0) {
    throw new ProviderRequestError(400, "from and to must be non-negative Unix timestamps in seconds");
  }
  if (from >= to) {
    throw new ProviderRequestError(400, "to must be greater than from for the [from, to) query interval");
  }
  return { from, to };
}

function readBoundedInteger(
  value: unknown,
  fieldName: string,
  defaultValue: number,
  minimum: number,
  maximum?: number,
): number {
  const resolved = value === undefined ? defaultValue : readRequiredInputInteger(value, fieldName);
  if (resolved < minimum || (maximum !== undefined && resolved > maximum)) {
    const range = maximum === undefined ? `at least ${minimum}` : `between ${minimum} and ${maximum}`;
    throw new ProviderRequestError(400, `${fieldName} must be ${range}`);
  }
  return resolved;
}

function readRequiredInputInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return integer;
}

function readResponseInteger(value: unknown, fallback: number, fieldName: string): number {
  if (value == null) return fallback;
  return readRequiredResponseInteger(value, fieldName);
}

function readRequiredResponseInteger(value: unknown, fieldName: string): number {
  try {
    const resolved = optionalIntegerLike(value, fieldName);
    if (resolved !== undefined && resolved >= 0) return resolved;
  } catch {
    // Normalize every malformed provider integer to the same protocol error.
  }
  throw new ProviderRequestError(502, `${fieldName} is not a non-negative integer`);
}

function readOptionalResponseInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  try {
    const resolved = optionalIntegerLike(value, "response integer");
    return resolved !== undefined && resolved >= 0 ? resolved : null;
  } catch {
    return null;
  }
}

function readOptionalResponseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

function responseString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function responseNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requiredResponseHeader(headers: Headers, name: string, fieldName: string): string {
  return requiredString(headers.get(name), `${fieldName} response header`, badGateway);
}

function validateAliyunSlsPage<T>(
  items: T[],
  countValue: unknown,
  totalValue: unknown,
  operation: string,
  offset: number,
  requestedSize: number,
): AliyunSlsPage<T> {
  const count = readRequiredResponseInteger(countValue, `${operation} count`);
  const total = readRequiredResponseInteger(totalValue, `${operation} total`);
  if (count > requestedSize) {
    throw badGateway(`${operation} count ${count} exceeds requested size ${requestedSize}`);
  }
  if (count !== items.length) {
    throw badGateway(`${operation} count ${count} does not match the ${items.length} returned items`);
  }
  if (count > 0 && offset + count > total) {
    throw badGateway(`${operation} page exceeds its reported total ${total}`);
  }
  if (count === 0 && offset < total) {
    throw badGateway(`${operation} returned an empty page before its reported total ${total} was reached`);
  }
  return { items, total };
}

async function collectAllAliyunSlsPages<T>(
  operation: string,
  requestPage: (offset: number, size: number) => Promise<AliyunSlsPage<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let expectedTotal: number | undefined;
  for (let pageNumber = 0; pageNumber < maximumPaginationPages; pageNumber += 1) {
    const page = await requestPage(items.length, maximumListSize);
    if (expectedTotal === undefined) {
      expectedTotal = page.total;
      if (expectedTotal > maximumPaginatedItems) {
        throw badGateway(`${operation} total ${expectedTotal} exceeds the ${maximumPaginatedItems} item limit`);
      }
    } else if (page.total !== expectedTotal) {
      throw badGateway(`${operation} total changed from ${expectedTotal} to ${page.total} during pagination`);
    }
    items.push(...page.items);
    if (items.length === expectedTotal) {
      return items;
    }
  }
  throw badGateway(`${operation} exceeded the ${maximumPaginationPages} page pagination limit`);
}

function badGateway(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function createAliyunSlsResponseError(operation: string, response: Response, text: string): ProviderRequestError {
  let details: unknown = text || undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  if (text.trim()) {
    try {
      const payload = optionalRecord(JSON.parse(text) as unknown);
      if (payload) {
        details = payload;
        errorCode = optionalString(payload.errorCode) ?? optionalString(payload.code);
        errorMessage = optionalString(payload.errorMessage) ?? optionalString(payload.message);
      }
    } catch {
      // The HTTP status remains authoritative when SLS returns a non-JSON error body.
    }
  }
  const status = normalizeAliyunSlsErrorStatus(response.status, errorCode);
  const providerMessage = [errorCode, errorMessage].filter(Boolean).join(": ");
  return new ProviderRequestError(
    status,
    providerMessage ? `${operation} failed: ${providerMessage}` : `${operation} failed with HTTP ${response.status}`,
    details,
  );
}

function normalizeAliyunSlsErrorStatus(httpStatus: number, errorCode: string | undefined): number {
  const code = errorCode?.toLowerCase() ?? "";
  if (httpStatus === 429 || /throttl|too.?many|exceed.*quota|flow.?control/.test(code)) return 429;
  if (/invalidaccesskey|signature.*match|missingaccesskey/.test(code)) return 401;
  if (httpStatus === 401) return 401;
  if (httpStatus === 403 || /unauthorized|permission|accessdenied|forbidden/.test(code)) return 403;
  return httpStatus || 502;
}

function normalizeAliyunSlsRuntimeError(error: unknown, fallbackMessage: string): ProviderRequestError {
  if (error instanceof ProviderRequestError) return error;
  return new ProviderRequestError(502, error instanceof Error ? error.message : fallbackMessage);
}

function headersToRecord(value: HeadersInit | undefined): Record<string, string> {
  return value ? Object.fromEntries(new Headers(value).entries()) : {};
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function mapWithConcurrency<TInput, TOutput>(
  inputs: TInput[],
  concurrency: number,
  worker: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const output = new Array<TOutput>(inputs.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= inputs.length) return;
      output[index] = await worker(inputs[index]!);
    }
  });
  await Promise.all(workers);
  return output;
}
