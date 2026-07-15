import type { CredentialValidationResult } from "../../core/types.ts";
import type { DatalustActionName } from "./actions.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const seqAcceptHeader = "application/vnd.datalust.seq.v14+json";
const clefBatchContentType = "application/vnd.serilog.clef";
export const seqApiKeyHeader = "X-Seq-ApiKey";
const defaultTimeoutMs = 20_000;
const validationEndpoint = "/api/events/signal?count=1";
const signalGroupingValues = new Set(["Inferred", "Explicit", "None"]);

type DatalustRequestPhase = "validate" | "execute";
type DatalustQueryValue = string | number | boolean | undefined;
type DatalustActionHandler = (input: Record<string, unknown>, context: DatalustContext) => Promise<unknown>;

export interface DatalustContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface DatalustRequestOptions {
  context: DatalustContext;
  path: string;
  method: "DELETE" | "GET" | "POST" | "PUT";
  query?: Record<string, DatalustQueryValue>;
  jsonBody?: Record<string, unknown>;
  bodyText?: string;
  contentType?: string;
  phase?: DatalustRequestPhase;
  timeoutMs?: number;
}

interface WriteEntityOptions {
  context: DatalustContext;
  path: string;
  method: "DELETE" | "PUT";
  entity: Record<string, unknown>;
}

export const datalustActionHandlers: Record<DatalustActionName, DatalustActionHandler> = {
  search_events: searchEvents,
  get_event: getEvent,
  execute_query: executeQuery,
  ingest_event: ingestEvent,
  ingest_events: ingestEvents,
  list_signals: listSignals,
  get_signal: getSignal,
  create_signal: createSignal,
  update_signal: updateSignal,
  delete_signal: deleteSignal,
  list_saved_queries: listSavedQueries,
  get_saved_query: getSavedQuery,
  create_saved_query: createSavedQuery,
  update_saved_query: updateSavedQuery,
  delete_saved_query: deleteSavedQuery,
};

export function createDatalustContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): DatalustContext {
  return {
    apiKey: requiredString(apiKey, "apiKey", credentialError),
    baseUrl: normalizeDatalustBaseUrl(values.baseUrl),
    fetcher,
    signal,
  };
}

export async function validateDatalustCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createDatalustContext(values, apiKey, fetcher, signal);
  const payload = requireResponseObject(
    await requestSeqJson({
      context,
      path: "/api/events/signal",
      method: "POST",
      query: { count: 1 },
      jsonBody: {},
      phase: "validate",
    }),
    "Seq credential validation response",
  );
  if (!Array.isArray(readValue(payload, "Events", "events"))) {
    throw new ProviderRequestError(400, "Seq credential validation returned an unexpected response");
  }

  const host = new URL(context.baseUrl).host;
  return {
    profile: {
      accountId: `datalust:${host}`,
      displayName: `Seq ${host}`,
    },
    grantedScopes: [],
    metadata: {
      baseUrl: context.baseUrl,
      validationEndpoint,
    },
  };
}

/**
 * Validate and normalize the user-configured Seq instance root URL.
 * Private-network instances require the deployment-level opt-in used by the
 * shared provider egress guard.
 */
export function normalizeDatalustBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = requiredString(value, "baseUrl", credentialError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: credentialError,
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:") {
    throw credentialError("baseUrl must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw credentialError("baseUrl must not include credentials, query parameters, or a fragment");
  }
  if (url.pathname !== "/") {
    throw credentialError("baseUrl must be the Seq instance root URL");
  }
  return url.toString().replace(/\/$/u, "");
}

async function searchEvents(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const payload = requireResponseObject(
    await requestSeqJson({
      context,
      path: "/api/events/signal",
      method: "POST",
      query: {
        count: optionalInteger(input.count),
        filter: optionalString(input.filter),
        signal: optionalString(input.signal),
        startAtId: optionalString(input.startAtId),
        afterId: optionalString(input.afterId),
        render: optionalBoolean(input.render),
        fromDateUtc: optionalString(input.fromDateUtc),
        toDateUtc: optionalString(input.toDateUtc),
      },
      jsonBody: { Variables: optionalRecord(input.variables) },
    }),
    "Seq event search response",
  );
  const events = readArray(payload, "Events", "events").map((event) =>
    normalizeEvent(requireResponseObject(event, "Seq event")),
  );
  return {
    events,
    statistics: readObject(payload, "Statistics", "statistics"),
    raw: payload,
  };
}

async function getEvent(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const eventId = requiredString(input.eventId, "eventId", inputError);
  const payload = requireResponseObject(
    await requestSeqJson({
      context,
      path: `/api/events/${encodeURIComponent(eventId)}`,
      method: "GET",
      query: { render: optionalBoolean(input.render) },
    }),
    "Seq event response",
  );
  return { event: normalizeEvent(payload) };
}

async function executeQuery(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const serverTimeoutMs = optionalInteger(input.timeoutMs);
  const payload = requireResponseObject(
    await requestSeqJson({
      context,
      path: "/api/data",
      method: "POST",
      query: {
        q: requiredString(input.query, "query", inputError),
        rangeStartUtc: optionalString(input.rangeStartUtc),
        rangeEndUtc: optionalString(input.rangeEndUtc),
        signal: optionalString(input.signal),
        timeoutMS: serverTimeoutMs,
      },
      jsonBody: { Variables: optionalRecord(input.variables) },
      timeoutMs: serverTimeoutMs === undefined ? undefined : Math.max(defaultTimeoutMs, serverTimeoutMs + 5_000),
    }),
    "Seq query response",
  );
  return {
    columns: readStringArray(payload, "Columns", "columns"),
    rows: readRows(payload, "Rows", "rows"),
    slices: readArray(payload, "Slices", "slices"),
    series: readArray(payload, "Series", "series"),
    variables: readObject(payload, "Variables", "variables"),
    error: readOptionalString(payload, "Error", "error") ?? null,
    reasons: readStringArray(payload, "Reasons", "reasons"),
    suggestion: readOptionalString(payload, "Suggestion", "suggestion") ?? null,
    statistics: readObject(payload, "Statistics", "statistics"),
    raw: payload,
  };
}

async function ingestEvent(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const status = await requestSeqStatus({
    context,
    path: "/ingest/clef",
    method: "POST",
    jsonBody: buildClefEvent(input),
  });
  return { accepted: true, status };
}

async function ingestEvents(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const events = requireInputArray(input.events, "events");
  if (events.length === 0) {
    throw inputError("events must contain at least one event");
  }
  const clefEvents = events.map((event, index) =>
    buildClefEvent(requiredRecord(event, `events[${index}]`, inputError), `events[${index}]`),
  );
  const status = await requestSeqStatus({
    context,
    path: "/ingest/clef",
    method: "POST",
    bodyText: clefEvents.map((event) => JSON.stringify(event)).join("\n"),
    contentType: clefBatchContentType,
  });
  return { accepted: true, status, eventCount: clefEvents.length };
}

async function listSignals(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const payload = await requestSeqJson({
    context,
    path: "/api/signals",
    method: "GET",
    query: {
      ownerId: optionalString(input.ownerId),
      shared: optionalBoolean(input.shared),
      partial: optionalBoolean(input.partial),
    },
  });
  const raw = requireResponseArray(payload, "Seq signal list").map((signal) =>
    requireResponseObject(signal, "Seq signal"),
  );
  return { signals: raw.map(normalizeSignal), raw };
}

async function getSignal(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const signalId = requiredString(input.signalId, "signalId", inputError);
  const payload = requireResponseObject(
    await requestSeqJson({
      context,
      path: `/api/signals/${encodeURIComponent(signalId)}`,
      method: "GET",
      query: { partial: optionalBoolean(input.partial) },
    }),
    "Seq signal response",
  );
  return { signal: normalizeSignal(payload) };
}

async function createSignal(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const template = await readEntity(context, "/api/signals/template", "Seq signal template response");
  const entity = applySignalChanges(template, input);
  const created = requireResponseObject(
    await requestSeqJson({ context, path: "/api/signals", method: "POST", jsonBody: entity }),
    "Seq signal create response",
  );
  return { signal: normalizeSignal(created) };
}

async function updateSignal(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const signalId = requiredString(input.signalId, "signalId", inputError);
  const path = `/api/signals/${encodeURIComponent(signalId)}`;
  const entity = applySignalChanges(await readEntity(context, path), input);
  const status = await writeEntity({ context, path, method: "PUT", entity });
  return { updated: true, status };
}

async function deleteSignal(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const signalId = requiredString(input.signalId, "signalId", inputError);
  const path = `/api/signals/${encodeURIComponent(signalId)}`;
  const status = await writeEntity({ context, path, method: "DELETE", entity: await readEntity(context, path) });
  return { deleted: true, status };
}

async function listSavedQueries(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const payload = await requestSeqJson({
    context,
    path: "/api/sqlqueries",
    method: "GET",
    query: { ownerId: optionalString(input.ownerId), shared: optionalBoolean(input.shared) },
  });
  const raw = requireResponseArray(payload, "Seq saved query list").map((query) =>
    requireResponseObject(query, "Seq saved query"),
  );
  return { savedQueries: raw.map(normalizeSavedQuery), raw };
}

async function getSavedQuery(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const queryId = requiredString(input.queryId, "queryId", inputError);
  const payload = await readEntity(context, `/api/sqlqueries/${encodeURIComponent(queryId)}`);
  return { savedQuery: normalizeSavedQuery(payload) };
}

async function createSavedQuery(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const template = await readEntity(context, "/api/sqlqueries/template", "Seq saved query template response");
  const entity = applySavedQueryChanges(template, input);
  const created = requireResponseObject(
    await requestSeqJson({ context, path: "/api/sqlqueries", method: "POST", jsonBody: entity }),
    "Seq saved query create response",
  );
  return { savedQuery: normalizeSavedQuery(created) };
}

async function updateSavedQuery(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const queryId = requiredString(input.queryId, "queryId", inputError);
  const path = `/api/sqlqueries/${encodeURIComponent(queryId)}`;
  const entity = applySavedQueryChanges(await readEntity(context, path), input);
  const status = await writeEntity({ context, path, method: "PUT", entity });
  return { updated: true, status };
}

async function deleteSavedQuery(input: Record<string, unknown>, context: DatalustContext): Promise<unknown> {
  const queryId = requiredString(input.queryId, "queryId", inputError);
  const path = `/api/sqlqueries/${encodeURIComponent(queryId)}`;
  const status = await writeEntity({ context, path, method: "DELETE", entity: await readEntity(context, path) });
  return { deleted: true, status };
}

function normalizeEvent(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(raw, "Id", "id"),
    timestamp: requireResponseString(raw, "Timestamp", "timestamp"),
    start: readOptionalString(raw, "Start", "start") ?? null,
    properties: readArray(raw, "Properties", "properties").map((property) => {
      const value = requireResponseObject(property, "Seq event property");
      return { name: requireResponseString(value, "Name", "name"), value: readValue(value, "Value", "value") };
    }),
    eventType: readOptionalString(raw, "EventType", "eventType") ?? null,
    level: readOptionalString(raw, "Level", "level") ?? null,
    exception: readOptionalString(raw, "Exception", "exception") ?? null,
    renderedMessage: readOptionalString(raw, "RenderedMessage", "renderedMessage") ?? null,
    traceId: readOptionalString(raw, "TraceId", "traceId") ?? null,
    spanId: readOptionalString(raw, "SpanId", "spanId") ?? null,
    parentId: readOptionalString(raw, "ParentId", "parentId") ?? null,
    spanKind: readOptionalString(raw, "SpanKind", "spanKind") ?? null,
    raw,
  };
}

function normalizeSignal(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(raw, "Id", "id"),
    title: requireResponseString(raw, "Title", "title"),
    description: readOptionalString(raw, "Description", "description") ?? null,
    filters: readObjectArray(raw, "Filters", "filters"),
    columns: readObjectArray(raw, "Columns", "columns"),
    isProtected: readBoolean(raw, "IsProtected", "isProtected"),
    isIndexSuppressed: readBoolean(raw, "IsIndexSuppressed", "isIndexSuppressed"),
    grouping: readValue(raw, "Grouping", "grouping") ?? null,
    explicitGroupName: readOptionalString(raw, "ExplicitGroupName", "explicitGroupName") ?? null,
    ownerId: readOptionalString(raw, "OwnerId", "ownerId") ?? null,
    raw,
  };
}

function normalizeSavedQuery(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requireResponseString(raw, "Id", "id"),
    title: requireResponseString(raw, "Title", "title"),
    description: readOptionalString(raw, "Description", "description") ?? null,
    sql: requireResponseStringValue(raw, "Sql", "sql"),
    isProtected: readBoolean(raw, "IsProtected", "isProtected"),
    ownerId: readOptionalString(raw, "OwnerId", "ownerId") ?? null,
    raw,
  };
}

function buildClefEvent(input: Record<string, unknown>, fieldPrefix = ""): Record<string, unknown> {
  const fieldName = (name: string): string => (fieldPrefix ? `${fieldPrefix}.${name}` : name);
  const properties = optionalRecord(input.properties) ?? {};
  const reservedProperty = Object.keys(properties).find((key) => key.startsWith("@") && !key.startsWith("@@"));
  if (reservedProperty) {
    throw inputError(`${fieldName("properties")} must not contain reserved CLEF property ${reservedProperty}`);
  }
  const eventType = readClefEventType(input.eventType, fieldName("eventType"));
  return {
    ...properties,
    "@t": requiredString(input.timestamp, fieldName("timestamp"), inputError),
    ...(typeof input.message === "string" ? { "@m": input.message } : {}),
    ...(typeof input.messageTemplate === "string" ? { "@mt": input.messageTemplate } : {}),
    ...(typeof input.level === "string" ? { "@l": input.level } : {}),
    ...(typeof input.exception === "string" ? { "@x": input.exception } : {}),
    ...(eventType !== undefined ? { "@i": eventType } : {}),
  };
}

function applySignalChanges(entity: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  const updated = { ...entity };
  if (Object.hasOwn(input, "title")) updated.Title = requiredString(input.title, "title", inputError);
  assignNullableString(updated, "Description", input, "description");
  if (Object.hasOwn(input, "filters")) {
    updated.Filters = requireInputArray(input.filters, "filters").map((value, index) => {
      const filter = requiredRecord(value, `filters[${index}]`, inputError);
      const mapped: Record<string, unknown> = {
        Filter: requiredString(filter.filter, `filters[${index}].filter`, inputError),
      };
      assignNullableString(mapped, "Description", filter, "description");
      assignBoolean(mapped, "DescriptionIsExcluded", filter, "descriptionIsExcluded");
      assignNullableString(mapped, "FilterNonStrict", filter, "filterNonStrict");
      return mapped;
    });
  }
  if (Object.hasOwn(input, "columns")) {
    updated.Columns = requireInputArray(input.columns, "columns").map((value, index) => {
      const column = requiredRecord(value, `columns[${index}]`, inputError);
      return { Expression: requiredString(column.expression, `columns[${index}].expression`, inputError) };
    });
  }
  assignBoolean(updated, "IsProtected", input, "isProtected");
  assignBoolean(updated, "IsIndexSuppressed", input, "isIndexSuppressed");
  if (Object.hasOwn(input, "grouping")) {
    const grouping = requiredString(input.grouping, "grouping", inputError);
    if (!signalGroupingValues.has(grouping)) {
      throw inputError("grouping must be one of Inferred, Explicit, None");
    }
    updated.Grouping = grouping;
  }
  assignNullableString(updated, "ExplicitGroupName", input, "explicitGroupName");
  assignNullableNonEmptyString(updated, "OwnerId", input, "ownerId");
  return updated;
}

function applySavedQueryChanges(
  entity: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const updated = { ...entity };
  if (Object.hasOwn(input, "title")) updated.Title = requiredString(input.title, "title", inputError);
  assignNullableString(updated, "Description", input, "description");
  if (Object.hasOwn(input, "sql")) {
    if (typeof input.sql !== "string") throw inputError("sql must be a string");
    updated.Sql = input.sql;
  }
  assignBoolean(updated, "IsProtected", input, "isProtected");
  assignNullableNonEmptyString(updated, "OwnerId", input, "ownerId");
  return updated;
}

async function readEntity(
  context: DatalustContext,
  path: string,
  label = "Seq entity response",
): Promise<Record<string, unknown>> {
  return requireResponseObject(await requestSeqJson({ context, path, method: "GET" }), label);
}

async function writeEntity(input: WriteEntityOptions): Promise<number> {
  return requestSeqStatus({
    context: input.context,
    path: input.path,
    method: input.method,
    jsonBody: input.entity,
  });
}

async function requestSeqJson(input: DatalustRequestOptions): Promise<unknown> {
  const response = await requestSeq(input);
  const payload = parsePayload(await readProviderTextBody(response, "Seq response"));
  if (!response.ok) throw createDatalustError(response.status, payload, input.phase ?? "execute");
  if (payload === null) throw new ProviderRequestError(502, "Seq returned an empty response");
  return payload;
}

async function requestSeqStatus(input: DatalustRequestOptions): Promise<number> {
  const response = await requestSeq(input);
  if (!response.ok) {
    const payload = parsePayload(await readProviderTextBody(response, "Seq error response"));
    throw createDatalustError(response.status, payload, input.phase ?? "execute");
  }
  return response.status;
}

async function requestSeq(input: DatalustRequestOptions): Promise<Response> {
  const url = buildDatalustUrl(input.context.baseUrl, input.path, input.query);
  const headers = new Headers({
    accept: seqAcceptHeader,
    [seqApiKeyHeader]: input.context.apiKey,
    "user-agent": providerUserAgent,
  });
  if (input.jsonBody !== undefined || input.bodyText !== undefined) {
    headers.set("content-type", input.contentType ?? "application/json");
  }
  const timeout = createProviderTimeout(input.context.signal, input.timeoutMs ?? defaultTimeoutMs);
  try {
    return await input.context.fetcher(url, {
      method: input.method,
      headers,
      body: input.bodyText ?? (input.jsonBody === undefined ? undefined : JSON.stringify(input.jsonBody)),
      signal: timeout.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Seq request timed out");
    }
    throw new ProviderRequestError(
      input.phase === "validate" ? 400 : 502,
      error instanceof Error ? `Seq request failed: ${error.message}` : "Seq request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildDatalustUrl(baseUrl: string, path: string, query: Record<string, DatalustQueryValue> = {}): URL {
  const url = new URL(path.replace(/^\/+/, ""), `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function parsePayload(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createDatalustError(status: number, payload: unknown, phase: DatalustRequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Seq request failed with HTTP ${status}`;
  if (phase === "validate") return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const object = optionalRecord(payload);
  return object ? readOptionalString(object, "Error", "error", "Message", "message") : undefined;
}

function readClefEventType(value: unknown, fieldName: string): string | number | undefined {
  if (value === undefined || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw inputError(`${fieldName} must be a string or number`);
}

function readValue(object: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (key in object) return object[key];
  return undefined;
}

function readOptionalString(object: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = optionalRawString(readValue(object, ...keys));
  return value ? value : undefined;
}

function requireResponseString(object: Record<string, unknown>, ...keys: string[]): string {
  const value = readOptionalString(object, ...keys);
  if (!value) throw new ProviderRequestError(502, `Seq response is missing ${keys[0]}`);
  return value;
}

function requireResponseStringValue(object: Record<string, unknown>, ...keys: string[]): string {
  const value = readValue(object, ...keys);
  if (typeof value !== "string") throw new ProviderRequestError(502, `Seq response is missing ${keys[0]}`);
  return value;
}

function readArray(object: Record<string, unknown>, ...keys: string[]): unknown[] {
  const value = readValue(object, ...keys);
  return Array.isArray(value) ? value : [];
}

function readStringArray(object: Record<string, unknown>, ...keys: string[]): string[] {
  return readArray(object, ...keys).filter((value): value is string => typeof value === "string");
}

function readObjectArray(object: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  return readArray(object, ...keys).flatMap((value) => {
    const record = optionalRecord(value);
    return record ? [record] : [];
  });
}

function readRows(object: Record<string, unknown>, ...keys: string[]): unknown[][] {
  return readArray(object, ...keys).flatMap((value) => (Array.isArray(value) ? [value] : []));
}

function readObject(object: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return optionalRecord(readValue(object, ...keys)) ?? {};
}

function readBoolean(object: Record<string, unknown>, ...keys: string[]): boolean {
  return optionalBoolean(readValue(object, ...keys)) ?? false;
}

function requireResponseObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `${label} is not an object`);
  return object;
}

function requireResponseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} is not an array`);
  return value;
}

function requireInputArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw inputError(`${fieldName} must be an array`);
  return value;
}

function assignBoolean(
  target: Record<string, unknown>,
  targetKey: string,
  input: Record<string, unknown>,
  inputKey: string,
): void {
  if (!Object.hasOwn(input, inputKey)) return;
  if (typeof input[inputKey] !== "boolean") throw inputError(`${inputKey} must be a boolean`);
  target[targetKey] = input[inputKey];
}

function assignNullableString(
  target: Record<string, unknown>,
  targetKey: string,
  input: Record<string, unknown>,
  inputKey: string,
): void {
  if (!Object.hasOwn(input, inputKey)) return;
  const value = input[inputKey];
  if (value !== null && typeof value !== "string") throw inputError(`${inputKey} must be a string or null`);
  target[targetKey] = value;
}

function assignNullableNonEmptyString(
  target: Record<string, unknown>,
  targetKey: string,
  input: Record<string, unknown>,
  inputKey: string,
): void {
  if (!Object.hasOwn(input, inputKey)) return;
  target[targetKey] = input[inputKey] === null ? null : requiredString(input[inputKey], inputKey, inputError);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function credentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
