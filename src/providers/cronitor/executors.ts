import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CronitorActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "cronitor";
const cronitorApiBaseUrl = "https://cronitor.io/api";
const cronitorApiVersion = "2025-11-28";
const cronitorDefaultRequestTimeoutMs = 30_000;

type CronitorPhase = "validate" | "execute";
type CronitorMethod = "GET" | "POST" | "DELETE";
type CronitorActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cronitorActionHandlers: Record<CronitorActionName, CronitorActionHandler> = {
  async list_monitors(_input, context) {
    const payload = await requestCronitorJson({ context, path: "/monitors", phase: "execute" });
    return { monitors: readMonitorsPayload(payload) };
  },
  async get_monitor(input, context) {
    const key = requiredString(input.key, "key", providerInputError);
    const payload = await requestCronitorJson({
      context,
      path: `/monitors/${encodeURIComponent(key)}`,
      phase: "execute",
    });
    return { monitor: requireObject(payload, "Cronitor monitor response") };
  },
  async create_monitor(input, context) {
    const payload = await requestCronitorJson({
      context,
      path: "/monitors",
      method: "POST",
      body: buildMonitorMutationBody(input),
      phase: "execute",
    });
    return { monitor: requireObject(payload, "Cronitor create monitor response") };
  },
  async update_monitor(input, context) {
    const key = requiredString(input.key, "key", providerInputError);
    const body = buildMonitorMutationBody(input, { skipKey: true });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "At least one monitor update field must be provided.");
    }
    const payload = await requestCronitorJson({
      context,
      path: `/monitors/${encodeURIComponent(key)}`,
      method: "POST",
      body,
      phase: "execute",
    });
    return { monitor: requireObject(payload, "Cronitor update monitor response") };
  },
  async delete_monitor(input, context) {
    const key = requiredString(input.key, "key", providerInputError);
    const payload = await requestCronitorJson({
      context,
      path: `/monitors/${encodeURIComponent(key)}`,
      method: "DELETE",
      phase: "execute",
    });
    return { deleted: true, ...compactObject({ monitor: optionalRecord(payload) }) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, cronitorActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(cronitorApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${credential.apiKey}:`, "utf8").toString("base64")}`);
    headers.set("cronitor-version", cronitorApiVersion);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestCronitorJson({ context, path: "/monitors", phase: "validate" });
    const monitors = readMonitorsPayload(payload);
    const firstMonitor = optionalRecord(monitors[0]);
    return {
      profile: {
        accountId: "cronitor",
        displayName: "Cronitor API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: cronitorApiBaseUrl,
        apiVersion: cronitorApiVersion,
        validationEndpoint: "/monitors",
        monitorCount: monitors.length,
        firstMonitorKey: optionalString(firstMonitor?.key),
        firstMonitorName: optionalString(firstMonitor?.name),
      }),
    };
  },
};

async function requestCronitorJson(input: {
  context: ApiKeyProviderContext;
  path: string;
  phase: CronitorPhase;
  method?: CronitorMethod;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, cronitorDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildCronitorUrl(input.path), {
      method: input.method ?? "GET",
      headers: buildCronitorHeaders(input.context.apiKey, input.body !== undefined),
      signal: timeout.signal,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const payload = await readCronitorPayload(response);
    if (!response.ok) {
      throw createCronitorError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Cronitor request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cronitor request failed: ${error.message}` : "Cronitor request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCronitorUrl(path: string): URL {
  return new URL(path.replace(/^\/+/, ""), `${cronitorApiBaseUrl}/`);
}

function buildCronitorHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`,
    "cronitor-version": cronitorApiVersion,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readCronitorPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Cronitor returned invalid JSON");
  }
}

function createCronitorError(status: number, payload: unknown, phase: CronitorPhase): ProviderRequestError {
  const message = extractCronitorErrorMessage(payload) ?? `Cronitor request failed with status ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status, message, payload);
}

function extractCronitorErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload.trim();
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalString(error?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.message) ??
    firstStringArrayValue(record)
  );
}

function firstStringArrayValue(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const value of Object.values(record)) {
    if (Array.isArray(value) && optionalString(value[0])) {
      return optionalString(value[0]);
    }
  }
  return undefined;
}

function buildMonitorMutationBody(
  input: Record<string, unknown>,
  options: { skipKey?: boolean } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = compactObject({
    type: optionalString(input.type),
    name: optionalString(input.name),
    schedules: Array.isArray(input.schedules) ? input.schedules : undefined,
    timezone: optionalString(input.timezone),
    assertions: Array.isArray(input.assertions) ? input.assertions : undefined,
    notify: Array.isArray(input.notify) ? input.notify : optionalRecord(input.notify),
    note: typeof input.note === "string" ? input.note : undefined,
    platform: optionalString(input.platform),
    group: optionalString(input.group),
    request: optionalRecord(input.request),
    grace_seconds: typeof input.grace_seconds === "number" ? input.grace_seconds : undefined,
    failure_tolerance: typeof input.failure_tolerance === "number" ? input.failure_tolerance : undefined,
  });
  if (!options.skipKey) {
    body.key = requiredString(input.key, "key", providerInputError);
  }
  return body;
}

function readMonitorsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = requireObject(payload, "Cronitor monitors response");
  if (!Array.isArray(record.monitors)) {
    throw new ProviderRequestError(502, "Cronitor monitors response is missing monitors");
  }
  return record.monitors;
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  return requiredRecord(value, context, (message) => new ProviderRequestError(502, message));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
