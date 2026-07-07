import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MixpanelActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalScalarString,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "mixpanel";
const mixpanelDefaultBaseUrl = "https://mixpanel.com";
const mixpanelDefaultExportBaseUrl = "https://data.mixpanel.com";
const mixpanelDefaultRequestTimeoutMs = 30_000;
const mixpanelAllowedHostSuffix = ".mixpanel.com";

type MixpanelPhase = "validate" | "execute";
type MixpanelActionHandler = (input: Record<string, unknown>, context: MixpanelActionContext) => Promise<unknown>;

interface MixpanelActionContext {
  apiKey: string;
  serviceAccountUsername: string;
  projectId: string;
  baseUrl: string;
  exportBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MixpanelRequestInput {
  baseUrl: string;
  apiKey: string;
  serviceAccountUsername: string;
  path: string;
  fetcher: typeof fetch;
  phase: MixpanelPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  accept?: string;
  query?: Record<string, string | number | boolean | undefined>;
  form?: URLSearchParams;
  notFoundAsInvalidInput?: boolean;
}

export const mixpanelActionHandlers: Record<MixpanelActionName, MixpanelActionHandler> = {
  list_saved_cohorts(input, context) {
    return listSavedCohorts(input, context);
  },
  list_funnels(input, context) {
    return listFunnels(input, context);
  },
  query_funnel(input, context) {
    return queryFunnel(input, context);
  },
  query_retention_report(input, context) {
    return queryRetentionReport(input, context);
  },
  query_frequency_report(input, context) {
    return queryFrequencyReport(input, context);
  },
  query_numeric_sum(input, context) {
    return queryNumericSum(input, context);
  },
  query_numeric_average(input, context) {
    return queryNumericAverage(input, context);
  },
  query_top_events(input, context) {
    return queryTopEvents(input, context);
  },
  query_segmentation_report(input, context) {
    return querySegmentationReport(input, context);
  },
  query_saved_report(input, context) {
    return querySavedReport(input, context);
  },
  query_profiles(input, context) {
    return queryProfiles(input, context);
  },
  profile_event_activity(input, context) {
    return profileEventActivity(input, context);
  },
  export_events(input, context) {
    return exportEvents(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MixpanelActionContext>({
  service,
  handlers: mixpanelActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MixpanelActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      serviceAccountUsername: normalizeRequiredString(
        credential.values.serviceAccountUsername ?? credential.metadata.serviceAccountUsername,
        "Service account username",
      ),
      projectId: normalizeRequiredId(credential.values.projectId ?? credential.metadata.projectId, "Project ID"),
      baseUrl: normalizeMixpanelBaseUrl(
        optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
        mixpanelDefaultBaseUrl,
        "Base URL",
      ),
      exportBaseUrl: normalizeMixpanelBaseUrl(
        optionalString(credential.values.exportBaseUrl) ?? optionalString(credential.metadata.exportBaseUrl),
        mixpanelDefaultExportBaseUrl,
        "Export Base URL",
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = normalizeMixpanelBaseUrl(
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      mixpanelDefaultBaseUrl,
      "Base URL",
    );
    const serviceAccountUsername = normalizeRequiredString(
      credential.values.serviceAccountUsername ?? credential.metadata.serviceAccountUsername,
      "Service account username",
    );
    const url = createProviderProxyUrl(baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${serviceAccountUsername}:${credential.apiKey}`).toString("base64")}`,
    );
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `mixpanel request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "mixpanel request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMixpanelCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateMixpanelCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const serviceAccountUsername = normalizeRequiredString(values.serviceAccountUsername, "Service account username");
  const projectId = normalizeRequiredId(values.projectId, "Project ID");
  const baseUrl = normalizeMixpanelBaseUrl(values.baseUrl, mixpanelDefaultBaseUrl, "Base URL");
  const exportBaseUrl = normalizeMixpanelBaseUrl(values.exportBaseUrl, mixpanelDefaultExportBaseUrl, "Export Base URL");
  const validationPath = `/api/app/projects/${encodeURIComponent(projectId)}/service-accounts`;
  const payload = await requestMixpanelJson({
    baseUrl,
    apiKey,
    serviceAccountUsername,
    path: validationPath,
    fetcher,
    signal,
    phase: "validate",
  });
  const serviceAccounts = extractObjectArray(payload, "mixpanel service account list response");
  const matchedServiceAccount = serviceAccounts.find(
    (serviceAccount) => optionalString(serviceAccount.username) === serviceAccountUsername,
  );
  if (!matchedServiceAccount) {
    throw new ProviderRequestError(400, "Service account username does not belong to the selected Mixpanel project");
  }

  const serviceAccountId = normalizeRequiredProviderAccountId(matchedServiceAccount.id, serviceAccountUsername);
  return {
    profile: {
      accountId: serviceAccountId,
      displayName:
        optionalString(matchedServiceAccount.name) ??
        optionalString(matchedServiceAccount.username) ??
        serviceAccountUsername,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      exportBaseUrl,
      projectId,
      serviceAccountUsername,
      serviceAccountId,
      serviceAccountCount: serviceAccounts.length,
      validationEndpoint: validationPath,
    }),
  };
}

async function listSavedCohorts(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/cohorts/list",
    method: "POST",
    query: {
      project_id: resolveProjectId(input, context),
    },
  });
  const cohorts = extractObjectArray(payload, "mixpanel saved cohort list response");
  return { cohorts, raw: cohorts };
}

async function listFunnels(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/funnels/list",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      workspace_id: normalizeOptionalId(input.workspace_id),
    }),
  });
  const funnels = extractObjectArray(payload, "mixpanel saved funnel list response");
  return { funnels, raw: funnels };
}

async function queryFunnel(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/funnels",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      workspace_id: normalizeOptionalId(input.workspace_id),
      funnel_id: normalizeRequiredId(input.funnel_id, "funnel_id"),
      from_date: normalizeRequiredString(input.from_date, "from_date"),
      to_date: normalizeRequiredString(input.to_date, "to_date"),
      length: optionalInteger(input.length),
      length_unit: optionalString(input.length_unit),
      interval: optionalInteger(input.interval),
      unit: optionalString(input.unit),
      on: optionalString(input.on),
      where: optionalString(input.where),
      limit: optionalInteger(input.limit),
    }),
  });
  return { raw: requireObjectPayload(payload, "mixpanel funnel response") };
}

async function queryRetentionReport(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/retention",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      workspace_id: normalizeOptionalId(input.workspace_id),
      from_date: normalizeRequiredString(input.from_date, "from_date"),
      to_date: normalizeRequiredString(input.to_date, "to_date"),
      retention_type: optionalString(input.retention_type),
      born_event: optionalString(input.born_event),
      event: optionalString(input.event),
      born_where: optionalString(input.born_where),
      where: optionalString(input.where),
      interval: optionalInteger(input.interval),
      interval_count: optionalInteger(input.interval_count),
      unit: optionalString(input.unit),
      unbounded_retention: typeof input.unbounded_retention === "boolean" ? input.unbounded_retention : undefined,
      on: optionalString(input.on),
      limit: optionalInteger(input.limit),
    }),
  });
  return { raw: requireObjectPayload(payload, "mixpanel retention response") };
}

async function queryFrequencyReport(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/retention/addiction",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      workspace_id: normalizeOptionalId(input.workspace_id),
      from_date: normalizeRequiredString(input.from_date, "from_date"),
      to_date: normalizeRequiredString(input.to_date, "to_date"),
      unit: normalizeRequiredString(input.unit, "unit"),
      addiction_unit: normalizeRequiredString(input.addiction_unit, "addiction_unit"),
      event: optionalString(input.event),
      where: optionalString(input.where),
      on: optionalString(input.on),
      limit: optionalInteger(input.limit),
    }),
  });
  return { raw: requireObjectPayload(payload, "mixpanel frequency response") };
}

async function queryNumericSum(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const record = requireObjectPayload(
    await requestMixpanelJson({
      ...requestBase(context),
      path: "/api/query/segmentation/sum",
      query: numericQuery(input, context),
    }),
    "mixpanel numeric sum response",
  );
  return {
    status: optionalString(record.status),
    computed_at: optionalString(record.computed_at),
    results: requireObjectPayload(record.results, "mixpanel numeric sum results"),
    raw: record,
  };
}

async function queryNumericAverage(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const record = requireObjectPayload(
    await requestMixpanelJson({
      ...requestBase(context),
      path: "/api/query/segmentation/average",
      query: numericQuery(input, context),
    }),
    "mixpanel numeric average response",
  );
  return {
    status: optionalString(record.status),
    computed_at: optionalString(record.computed_at),
    results: requireObjectPayload(record.results, "mixpanel numeric average results"),
    raw: record,
  };
}

async function queryTopEvents(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const record = requireObjectPayload(
    await requestMixpanelJson({
      ...requestBase(context),
      path: "/api/query/events/top",
      query: compactObject({
        project_id: resolveProjectId(input, context),
        workspace_id: normalizeOptionalId(input.workspace_id),
        type: normalizeRequiredString(input.type, "type"),
        limit: optionalInteger(input.limit),
      }),
    }),
    "mixpanel top events response",
  );
  const rawEvents = Array.isArray(record.events) ? record.events : [];
  return {
    type: normalizeTopEventsType(record.type),
    events: rawEvents.map((item, index) => requireObjectPayload(item, `mixpanel top events response.events[${index}]`)),
    raw: record,
  };
}

async function querySegmentationReport(
  input: Record<string, unknown>,
  context: MixpanelActionContext,
): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/segmentation",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      event: JSON.stringify([normalizeRequiredString(input.event, "event")]),
      from_date: normalizeRequiredString(input.from_date, "from_date"),
      to_date: normalizeRequiredString(input.to_date, "to_date"),
      on: optionalString(input.on),
      unit: optionalString(input.unit),
      type: optionalString(input.type),
    }),
  });
  return { raw: requireObjectPayload(payload, "mixpanel segmentation response") };
}

async function querySavedReport(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const payload = await requestMixpanelJson({
    ...requestBase(context),
    path: "/api/query/insights",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      workspace_id: normalizeOptionalId(input.workspace_id),
      bookmark_id: normalizeRequiredId(input.bookmark_id, "bookmark_id"),
    }),
    notFoundAsInvalidInput: true,
  });
  return { raw: requireObjectPayload(payload, "mixpanel saved report response") };
}

async function queryProfiles(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const form = new URLSearchParams();
  const distinctIds = normalizeOptionalStringArray(input.distinct_ids);
  if (distinctIds) form.set("distinct_ids", JSON.stringify(distinctIds));
  const where = optionalString(input.where);
  if (where) form.set("where", where);
  const outputProperties = normalizeOptionalStringArray(input.output_properties);
  if (outputProperties) form.set("output_properties", JSON.stringify(outputProperties));
  const sessionId = optionalString(input.session_id);
  if (sessionId) form.set("session_id", sessionId);
  const page = optionalInteger(input.page);
  if (page !== undefined) form.set("page", String(page));

  const record = requireObjectPayload(
    await requestMixpanelJson({
      ...requestBase(context),
      path: "/api/query/engage",
      method: "POST",
      query: compactObject({
        project_id: resolveProjectId(input, context),
        workspace_id: normalizeOptionalId(input.workspace_id),
      }),
      form,
    }),
    "mixpanel profile query response",
  );

  return {
    page: optionalInteger(record.page),
    page_size: optionalInteger(record.page_size),
    session_id: optionalString(record.session_id),
    total: optionalInteger(record.total),
    results: extractObjectArray(record.results, "mixpanel profile query results"),
    raw: record,
  };
}

async function profileEventActivity(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const distinctIds = normalizeRequiredStringArray(input.distinct_ids, "distinct_ids");
  const record = requireObjectPayload(
    await requestMixpanelJson({
      ...requestBase(context),
      path: "/api/query/stream/query",
      query: compactObject({
        project_id: resolveProjectId(input, context),
        workspace_id: normalizeOptionalId(input.workspace_id),
        from_date: normalizeRequiredString(input.from_date, "from_date"),
        to_date: normalizeRequiredString(input.to_date, "to_date"),
        distinct_ids: JSON.stringify(distinctIds),
      }),
    }),
    "mixpanel profile event activity response",
  );
  const results = requireObjectPayload(record.results, "mixpanel profile event activity results");
  const rawEvents = Array.isArray(results.events) ? results.events : [];
  return {
    status: optionalString(record.status),
    events: rawEvents.map((item, index) =>
      requireObjectPayload(item, `mixpanel profile event activity events[${index}]`),
    ),
    raw: record,
  };
}

async function exportEvents(input: Record<string, unknown>, context: MixpanelActionContext): Promise<unknown> {
  const text = await requestMixpanelText({
    ...requestBase(context, context.exportBaseUrl),
    path: "/api/2.0/export",
    accept: "text/plain",
    query: compactObject({
      project_id: resolveProjectId(input, context),
      from_date: normalizeRequiredString(input.from_date, "from_date"),
      to_date: normalizeRequiredString(input.to_date, "to_date"),
      event: buildOptionalJsonArrayString(input.event),
      where: optionalString(input.where),
    }),
  });
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const events = lines.map((line, index) => {
    try {
      return requireObjectPayload(JSON.parse(line), `mixpanel export event line ${index + 1}`);
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      throw new ProviderRequestError(502, `mixpanel export returned invalid JSON on line ${index + 1}`);
    }
  });
  return {
    jsonl: text,
    event_count: events.length,
    events,
  };
}

function numericQuery(input: Record<string, unknown>, context: MixpanelActionContext) {
  return compactObject({
    project_id: resolveProjectId(input, context),
    workspace_id: normalizeOptionalId(input.workspace_id),
    event: JSON.stringify([normalizeRequiredString(input.event, "event")]),
    from_date: normalizeRequiredString(input.from_date, "from_date"),
    to_date: normalizeRequiredString(input.to_date, "to_date"),
    on: normalizeRequiredString(input.on, "on"),
    unit: optionalString(input.unit),
    where: optionalString(input.where),
  });
}

function requestBase(context: MixpanelActionContext, baseUrl = context.baseUrl): Omit<MixpanelRequestInput, "path"> {
  return {
    baseUrl,
    apiKey: context.apiKey,
    serviceAccountUsername: context.serviceAccountUsername,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  };
}

async function requestMixpanelJson(input: MixpanelRequestInput): Promise<unknown> {
  const { payload } = await requestMixpanel(input);
  if (payload == null) {
    throw new ProviderRequestError(502, "mixpanel returned an empty response body");
  }
  return payload;
}

async function requestMixpanelText(input: MixpanelRequestInput): Promise<string> {
  const { text } = await requestMixpanel({
    ...input,
    accept: input.accept ?? "text/plain",
  });
  return text;
}

async function requestMixpanel(input: MixpanelRequestInput): Promise<{ text: string; payload: unknown }> {
  const timeout = createProviderTimeout(input.signal, mixpanelDefaultRequestTimeoutMs);
  try {
    const url = buildMixpanelUrl(input.baseUrl, input.path);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      const headers: Record<string, string> = {
        Authorization: `Basic ${Buffer.from(`${input.serviceAccountUsername}:${input.apiKey}`).toString("base64")}`,
        Accept: input.accept ?? "application/json",
        "User-Agent": providerUserAgent,
      };
      if (input.form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      }

      response = await input.fetcher(url.toString(), {
        method: input.method ?? "GET",
        signal: timeout.signal,
        headers,
        body: input.form?.toString(),
      });
    } catch (error) {
      if (timeout.didTimeout() || isAbortLikeError(error)) {
        throw new ProviderRequestError(504, "mixpanel request timed out");
      }
      throw new ProviderRequestError(
        502,
        `mixpanel request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      );
    }

    const text = await response.text();
    const payload = parseMixpanelPayload(text);
    if (!response.ok) {
      throw createMixpanelError(response, payload, input.phase, input.notFoundAsInvalidInput);
    }
    return { text, payload };
  } finally {
    timeout.cleanup();
  }
}

function buildMixpanelUrl(baseUrl: string, path: string): URL {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  let normalizedPath = path;
  while (normalizedPath.startsWith("/")) {
    normalizedPath = normalizedPath.slice(1);
  }
  return new URL(normalizedPath, normalizedBaseUrl);
}

function parseMixpanelPayload(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createMixpanelError(
  response: Response,
  payload: unknown,
  phase: MixpanelPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error) ??
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    `mixpanel request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 404 && (phase === "validate" || notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function resolveProjectId(input: Record<string, unknown>, context: MixpanelActionContext): string {
  return normalizeOptionalId(input.project_id) ?? context.projectId;
}

function normalizeMixpanelBaseUrl(value: string | undefined, fallback: string, fieldLabel: string): string {
  if (!value) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, `${fieldLabel} must be a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, `${fieldLabel} must use https`);
  }
  if (!isAllowedMixpanelHost(url.hostname)) {
    throw new ProviderRequestError(400, `${fieldLabel} must use an allowed Mixpanel hostname`);
  }
  let pathname = url.pathname;
  while (pathname.endsWith("/") && pathname.length > 1) {
    pathname = pathname.slice(0, -1);
  }
  return `${url.origin}${pathname}`;
}

function normalizeRequiredString(value: unknown, fieldLabel: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldLabel} is required`);
  }
  return normalized;
}

function normalizeRequiredId(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalId(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return optionalScalarString(value)?.trim() || undefined;
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function buildOptionalJsonArrayString(value: unknown): string | undefined {
  const normalized = normalizeOptionalStringArray(value);
  return normalized ? JSON.stringify(normalized) : undefined;
}

function extractObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.map((item, index) => requireObjectPayload(item, `${label}[${index}]`));
  }
  const record = optionalRecord(value);
  if (Array.isArray(record?.results)) {
    return record.results.map((item, index) => requireObjectPayload(item, `${label}.results[${index}]`));
  }
  if (Array.isArray(record?.service_accounts)) {
    return record.service_accounts.map((item, index) =>
      requireObjectPayload(item, `${label}.service_accounts[${index}]`),
    );
  }
  if (Array.isArray(record?.data)) {
    return record.data.map((item, index) => requireObjectPayload(item, `${label}.data[${index}]`));
  }
  throw new ProviderRequestError(502, `${label} is missing an array payload`);
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return record;
}

function isAllowedMixpanelHost(hostname: string): boolean {
  return hostname === "mixpanel.com" || hostname.endsWith(mixpanelAllowedHostSuffix);
}

function normalizeRequiredStringArray(value: unknown, fieldName: string): string[] {
  const normalized = normalizeOptionalStringArray(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function normalizeTopEventsType(value: unknown): "general" | "unique" | "average" {
  const normalized = optionalString(value);
  if (normalized === "general" || normalized === "unique" || normalized === "average") {
    return normalized;
  }
  throw new ProviderRequestError(502, "mixpanel top events response is missing a valid type");
}

function normalizeRequiredProviderAccountId(value: unknown, serviceAccountUsername: string): string {
  const normalized = normalizeOptionalId(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `mixpanel service account ${serviceAccountUsername} is missing an id`);
  }
  return normalized;
}
