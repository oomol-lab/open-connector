import type { CredentialValidationResult } from "../../core/types.ts";
import type { GrafanaActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const defaultNamespace = "default";
const grafanaDefaultRequestTimeoutMs = 30_000;
const folderParentAnnotation = "grafana.app/folder";
const grafanaDefaultApiVersion = "v1";
const grafanaApiVersionCacheMaxEntries = 256;

type GrafanaAppResource = "folders" | "dashboards";

const grafanaAppApiGroups: Record<GrafanaAppResource, string> = {
  folders: "folder.grafana.app",
  dashboards: "dashboard.grafana.app",
};

// Grafana's App Platform API groups are versioned and the set of served versions
// differs per Grafana release, e.g.
//   Grafana 12.1  dashboard.grafana.app -> v1beta1, v0alpha1, v2alpha1
//   Grafana 12.4  dashboard.grafana.app -> v1beta1, v0alpha1, v2beta1, v2alpha1
//   Grafana 13.0  dashboard.grafana.app -> v1, ...
// Requesting a version the server does not serve returns a Kubernetes-style 404
// ("the server could not find the requested resource"), so the version has to be
// discovered instead of hardcoded. Only versions from the v1 lineage are listed:
// the v2 lineage uses a different resource schema and is not interchangeable here.
const grafanaApiVersionPreference: readonly string[] = [grafanaDefaultApiVersion, "v1beta1", "v0alpha1"];

const grafanaApiVersionCache = new Map<string, string>();
const grafanaApiMetadataUrl = "https://grafana.com/docs/grafana/latest/developers/http_api/auth/#service-account-token";

type GrafanaRequestPhase = "validate" | "execute";
type GrafanaActionHandler = (input: Record<string, unknown>, context: GrafanaContext) => Promise<unknown>;

export interface GrafanaContext {
  baseUrl: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const grafanaActionHandlers: Record<GrafanaActionName, GrafanaActionHandler> = {
  list_folders(input, context) {
    return executeListFolders(input, context);
  },
  get_folder(input, context) {
    return executeGetFolder(input, context);
  },
  create_folder(input, context) {
    return executeCreateFolder(input, context);
  },
  update_folder(input, context) {
    return executeUpdateFolder(input, context);
  },
  delete_folder(input, context) {
    return executeDeleteFolder(input, context);
  },
  search_dashboards(input, context) {
    return executeSearchDashboards(input, context);
  },
  get_dashboard(input, context) {
    return executeGetDashboard(input, context);
  },
  create_dashboard(input, context) {
    return executeCreateDashboard(input, context);
  },
  update_dashboard(input, context) {
    return executeUpdateDashboard(input, context);
  },
  delete_dashboard(input, context) {
    return executeDeleteDashboard(input, context);
  },
  list_data_sources(input, context) {
    return executeListDataSources(input, context);
  },
  get_data_source(input, context) {
    return executeGetDataSource(input, context);
  },
  create_data_source(input, context) {
    return executeCreateDataSource(input, context);
  },
  update_data_source(input, context) {
    return executeUpdateDataSource(input, context);
  },
  delete_data_source(input, context) {
    return executeDeleteDataSource(input, context);
  },
  list_alert_rules(input, context) {
    return executeListAlertRules(input, context);
  },
  get_alert_rule(input, context) {
    return executeGetAlertRule(input, context);
  },
  list_alert_instances(input, context) {
    return executeListAlertInstances(input, context);
  },
  list_contact_points(input, context) {
    return executeListContactPoints(input, context);
  },
};

export async function validateGrafanaCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeGrafanaBaseUrl(values.baseUrl);
  const payload = await grafanaRequestJson(
    "/api/org",
    { method: "GET" },
    {
      baseUrl,
      apiKey,
      fetcher,
      signal,
      phase: "validate",
    },
  );
  const org = optionalRecord(payload);

  return {
    profile: {
      accountId: optionalNumber(org?.id)?.toString(),
      displayName: optionalString(org?.name) ?? "Grafana",
    },
    grantedScopes: [],
    metadata: {
      baseUrl,
      validationPath: "/api/org",
      credentialHelpUrl: grafanaApiMetadataUrl,
    },
  };
}

export function normalizeGrafanaBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "Grafana baseUrl is required");
  }

  const url = assertPublicHttpUrl(value.trim(), {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Grafana baseUrl must use https");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function executeListFolders(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const query = compactObject({
    limit: optionalNumber(input.limit),
    continue: optionalString(input.continueToken),
  });

  const payload = await grafanaRequestJson(
    await apiPath(input, "folders", { ...context, phase: "execute" }),
    { method: "GET", query },
    {
      ...context,
      phase: "execute",
    },
  );
  const record = optionalRecord(payload) ?? {};
  const metadata = optionalRecord(record.metadata);
  const items = objectArrayOrEmpty(record.items);
  return {
    folders: items.map(normalizeFolder),
    continueToken: optionalString(metadata?.continue) ?? null,
    raw: record,
  };
}

async function executeGetFolder(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `${await apiPath(input, "folders", { ...context, phase: "execute" })}/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "GET" },
    { ...context, phase: "execute" },
  );
  return { folder: normalizeFolder(payload) };
}

async function executeCreateFolder(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    await apiPath(input, "folders", { ...context, phase: "execute" }),
    { method: "POST", body: folderRequestBody(input) },
    { ...context, phase: "execute" },
  );
  return { folder: normalizeFolder(payload) };
}

async function executeUpdateFolder(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const uid = requireString(input.uid, "uid");
  const payload = await grafanaRequestJson(
    `${await apiPath(input, "folders", { ...context, phase: "execute" })}/${encodePathSegment(uid)}`,
    { method: "PUT", body: folderRequestBody(input, uid) },
    { ...context, phase: "execute" },
  );
  return { folder: normalizeFolder(payload) };
}

async function executeDeleteFolder(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `${await apiPath(input, "folders", { ...context, phase: "execute" })}/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "DELETE" },
    { ...context, phase: "execute" },
  );
  return {
    deleted: true,
    raw: optionalRecord(payload) ?? null,
  };
}

async function executeSearchDashboards(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const query = compactObject<Record<string, string | number | boolean | undefined>>({
    query: optionalString(input.query),
    type: optionalString(input.type),
    starred: optionalBoolean(input.starred),
    limit: optionalNumber(input.limit),
    page: optionalNumber(input.page),
  });

  const payload = await grafanaRequestJson(
    "/api/search",
    {
      method: "GET",
      query,
      multiValueQuery: {
        tag: stringArray(input.tags),
        dashboardUIDs: stringArray(input.dashboardUids),
        folderUIDs: stringArray(input.folderUids),
      },
    },
    { ...context, phase: "execute" },
  );
  const results = objectArrayOrEmpty(payload);
  return {
    results: results.map(normalizeSearchItem),
    raw: results,
  };
}

async function executeGetDashboard(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `${await apiPath(input, "dashboards", { ...context, phase: "execute" })}/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "GET" },
    { ...context, phase: "execute" },
  );
  return { dashboard: normalizeDashboard(payload) };
}

async function executeCreateDashboard(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    await apiPath(input, "dashboards", { ...context, phase: "execute" }),
    { method: "POST", body: dashboardRequestBody(input) },
    { ...context, phase: "execute" },
  );
  return { dashboard: normalizeDashboard(payload) };
}

async function executeUpdateDashboard(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const uid = requireString(input.uid, "uid");
  const payload = await grafanaRequestJson(
    `${await apiPath(input, "dashboards", { ...context, phase: "execute" })}/${encodePathSegment(uid)}`,
    { method: "PUT", body: dashboardRequestBody(input, uid) },
    { ...context, phase: "execute" },
  );
  return { dashboard: normalizeDashboard(payload) };
}

async function executeDeleteDashboard(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `${await apiPath(input, "dashboards", { ...context, phase: "execute" })}/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "DELETE" },
    { ...context, phase: "execute" },
  );
  return {
    deleted: true,
    raw: optionalRecord(payload) ?? null,
  };
}

async function executeListDataSources(_input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson("/api/datasources", { method: "GET" }, { ...context, phase: "execute" });
  const records = objectArrayOrEmpty(payload);
  return {
    dataSources: records.map(normalizeDataSource),
    raw: records,
  };
}

async function executeGetDataSource(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `/api/datasources/uid/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "GET" },
    { ...context, phase: "execute" },
  );
  return { dataSource: normalizeDataSource(payload) };
}

async function executeCreateDataSource(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    "/api/datasources",
    { method: "POST", body: requireObject(input.dataSource, "dataSource") },
    { ...context, phase: "execute" },
  );
  return {
    dataSource: normalizeDataSource(optionalRecord(payload)?.datasource ?? payload),
    raw: optionalRecord(payload) ?? {},
  };
}

async function executeUpdateDataSource(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `/api/datasources/uid/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "PUT", body: requireObject(input.dataSource, "dataSource") },
    { ...context, phase: "execute" },
  );
  return {
    dataSource: normalizeDataSource(optionalRecord(payload)?.datasource ?? payload),
    raw: optionalRecord(payload) ?? {},
  };
}

async function executeDeleteDataSource(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `/api/datasources/uid/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "DELETE" },
    { ...context, phase: "execute" },
  );
  return {
    deleted: true,
    raw: optionalRecord(payload) ?? null,
  };
}

// Alerting actions use Grafana's legacy REST API (/api/...), which is not versioned
// per release, so they are unaffected by App Platform version negotiation.
async function executeListAlertRules(_input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    "/api/v1/provisioning/alert-rules",
    { method: "GET" },
    { ...context, phase: "execute" },
  );
  return { alertRules: objectArrayOrEmpty(payload) };
}

async function executeGetAlertRule(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    `/api/v1/provisioning/alert-rules/${encodePathSegment(requireString(input.uid, "uid"))}`,
    { method: "GET" },
    { ...context, phase: "execute" },
  );
  return { alertRule: optionalRecord(payload) ?? {} };
}

async function executeListAlertInstances(input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const query = compactObject({
    active: optionalBoolean(input.active),
    silenced: optionalBoolean(input.silenced),
    inhibited: optionalBoolean(input.inhibited),
  });
  const payload = await grafanaRequestJson(
    "/api/alertmanager/grafana/api/v2/alerts",
    { method: "GET", query },
    { ...context, phase: "execute" },
  );
  return { alertInstances: objectArrayOrEmpty(payload) };
}

async function executeListContactPoints(_input: Record<string, unknown>, context: GrafanaContext): Promise<unknown> {
  const payload = await grafanaRequestJson(
    "/api/v1/provisioning/contact-points",
    { method: "GET" },
    { ...context, phase: "execute" },
  );
  return { contactPoints: objectArrayOrEmpty(payload) };
}

async function grafanaRequestJson(
  path: string,
  request: {
    method: string;
    query?: Record<string, string | number | boolean | undefined>;
    multiValueQuery?: Record<string, string[] | undefined>;
    body?: Record<string, unknown>;
  },
  context: GrafanaContext & { phase: GrafanaRequestPhase },
): Promise<unknown> {
  const url = buildGrafanaUrl(context.baseUrl, path);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  for (const [key, values] of Object.entries(request.multiValueQuery ?? {})) {
    for (const value of values ?? []) {
      url.searchParams.append(key, value);
    }
  }

  const timeout = createProviderTimeout(context.signal, grafanaDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: request.method,
      headers: grafanaHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
    const payload = await readGrafanaPayload(response);
    if (!response.ok) {
      throw createGrafanaError(response, payload, context.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Grafana request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Grafana request failed: ${error.message}` : "Grafana request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function grafanaHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
  };
}

function buildGrafanaUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  return new URL(path.replace(/^\/+/, ""), base);
}

async function readGrafanaPayload(response: Response): Promise<unknown> {
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

function createGrafanaError(response: Response, payload: unknown, phase: GrafanaRequestPhase): ProviderRequestError {
  const message = extractGrafanaErrorMessage(payload) ?? response.statusText ?? "Grafana request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && [400, 404, 409, 412, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractGrafanaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

async function resolveGrafanaApiVersion(
  group: string,
  context: GrafanaContext & { phase: GrafanaRequestPhase },
): Promise<string> {
  const cacheKey = `${context.baseUrl}|${group}`;
  const cached = grafanaApiVersionCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const payload = await grafanaRequestJson(`/apis/${group}`, { method: "GET" }, context);
    const record = optionalRecord(payload) ?? {};
    const served = new Set(
      objectArrayOrEmpty(record.versions)
        .map((entry) => optionalString(entry.version))
        .filter((version): version is string => version !== undefined),
    );
    const match = grafanaApiVersionPreference.find((version) => served.has(version));
    if (match !== undefined) {
      cacheGrafanaApiVersion(cacheKey, match);
      return match;
    }
  } catch {
    // Discovery is best-effort. Falling back to the newest known version keeps the
    // previous behaviour for servers that do not expose the discovery endpoint.
  }

  return grafanaDefaultApiVersion;
}

function cacheGrafanaApiVersion(cacheKey: string, version: string): void {
  grafanaApiVersionCache.delete(cacheKey);
  if (grafanaApiVersionCache.size >= grafanaApiVersionCacheMaxEntries) {
    const oldestKey = grafanaApiVersionCache.keys().next().value;
    if (oldestKey !== undefined) {
      grafanaApiVersionCache.delete(oldestKey);
    }
  }
  grafanaApiVersionCache.set(cacheKey, version);
}

async function apiPath(
  input: Record<string, unknown>,
  resource: GrafanaAppResource,
  context: GrafanaContext & { phase: GrafanaRequestPhase },
): Promise<string> {
  const namespace = optionalString(input.namespace) ?? defaultNamespace;
  const group = grafanaAppApiGroups[resource];
  const version = await resolveGrafanaApiVersion(group, context);
  return `/apis/${group}/${version}/namespaces/${encodePathSegment(namespace)}/${resource}`;
}

function folderRequestBody(input: Record<string, unknown>, fallbackUid?: string): Record<string, unknown> {
  const uid = optionalString(input.uid) ?? fallbackUid;
  const parentUid = optionalString(input.parentUid);
  return {
    metadata: compactObject({
      name: uid,
      generateName: optionalString(input.generateName),
      resourceVersion: optionalString(input.resourceVersion),
      annotations: parentUid ? { [folderParentAnnotation]: parentUid } : undefined,
    }),
    spec: {
      title: requireString(input.title, "title"),
    },
  };
}

function dashboardRequestBody(input: Record<string, unknown>, fallbackUid?: string): Record<string, unknown> {
  const uid = optionalString(input.uid) ?? fallbackUid;
  const folderUid = optionalString(input.folderUid);
  return {
    metadata: compactObject({
      name: uid,
      generateName: optionalString(input.generateName),
      resourceVersion: optionalString(input.resourceVersion),
      annotations: folderUid ? { [folderParentAnnotation]: folderUid } : undefined,
    }),
    spec: requireObject(input.spec, "spec"),
  };
}

function normalizeFolder(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const metadata = optionalRecord(record.metadata) ?? {};
  const spec = optionalRecord(record.spec) ?? {};
  const annotations = optionalRecord(metadata.annotations) ?? {};

  return {
    uid: optionalString(metadata.name) ?? optionalString(metadata.uid) ?? null,
    title: optionalString(spec.title) ?? null,
    namespace: optionalString(metadata.namespace) ?? null,
    resourceVersion: optionalString(metadata.resourceVersion) ?? null,
    parentUid: optionalString(annotations[folderParentAnnotation]) ?? null,
    raw: record,
  };
}

function normalizeDashboard(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const metadata = optionalRecord(record.metadata) ?? {};
  const spec = optionalRecord(record.spec) ?? {};
  const annotations = optionalRecord(metadata.annotations) ?? {};

  return {
    uid: optionalString(metadata.name) ?? optionalString(metadata.uid) ?? null,
    title: optionalString(spec.title) ?? null,
    namespace: optionalString(metadata.namespace) ?? null,
    resourceVersion: optionalString(metadata.resourceVersion) ?? null,
    folderUid: optionalString(annotations[folderParentAnnotation]) ?? null,
    raw: record,
  };
}

function normalizeSearchItem(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    id: optionalNumber(value.id) ?? null,
    uid: optionalString(value.uid) ?? null,
    title: optionalString(value.title) ?? null,
    type: optionalString(value.type) ?? null,
    url: optionalString(value.url) ?? null,
    isStarred: optionalBoolean(value.isStarred) ?? null,
  };
}

function normalizeDataSource(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    ...record,
    id: optionalNumber(record.id) ?? null,
    uid: optionalString(record.uid) ?? null,
    name: optionalString(record.name) ?? null,
    type: optionalString(record.type) ?? null,
    access: optionalString(record.access) ?? null,
    url: optionalString(record.url) ?? null,
    isDefault: optionalBoolean(record.isDefault) ?? null,
    readOnly: optionalBoolean(record.readOnly) ?? null,
  };
}

function objectArrayOrEmpty(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} object is required`);
  }
  return object;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}
