import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  normalizeProviderProxyQuery,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "uptimerobot";
const uptimerobotApiBaseUrl = "https://api.uptimerobot.com/v2";
const uptimerobotDefaultRequestTimeoutMs = 30_000;

// Fixed-host proxy egress (uptimerobotApiBaseUrl); DNS-rebinding check is redundant here.
const uptimerobotProxyFetch = createProviderFetch({ skipDnsValidation: true });

type UptimerobotRequestPhase = "validate" | "execute";
type UptimerobotActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const uptimerobotActionHandlers: Record<string, UptimerobotActionHandler> = {
  async get_account_details(_input, context) {
    const payload = await requestUptimerobotJson({ context, endpoint: "getAccountDetails", phase: "execute" });
    return { account: requireObjectPayload(payload.account, "uptimerobot account details response") };
  },
  async list_alert_contacts(_input, context) {
    const payload = await requestUptimerobotJson({ context, endpoint: "getAlertContacts", phase: "execute" });
    return {
      alert_contacts: requireArrayPayload(payload.alert_contacts, "uptimerobot alert contacts response"),
      pagination: readPagination(payload),
    };
  },
  async list_monitors(input, context) {
    const payload = await requestUptimerobotJson({
      context,
      endpoint: "getMonitors",
      body: buildListMonitorsBody(input),
      phase: "execute",
    });
    return {
      monitors: requireArrayPayload(payload.monitors, "uptimerobot monitors response"),
      pagination: readPagination(payload),
    };
  },
  async get_monitor(input, context) {
    const monitorId = requireMonitorId(input.monitor_id, "monitor_id");
    const payload = await requestUptimerobotJson({
      context,
      endpoint: "getMonitors",
      body: buildSingleMonitorBody(monitorId, input),
      phase: "execute",
    });
    const monitors = requireArrayPayload(payload.monitors, "uptimerobot single monitor response");
    const monitor = optionalRecord(monitors[0]);
    if (!monitor) {
      throw new ProviderRequestError(404, `monitor ${monitorId} was not found`);
    }
    return { monitor };
  },
  async create_monitor(input, context) {
    const payload = await requestUptimerobotJson({
      context,
      endpoint: "newMonitor",
      body: buildMonitorMutationBody(input),
      phase: "execute",
    });
    return { monitor: requireObjectPayload(payload.monitor, "uptimerobot create monitor response") };
  },
  async update_monitor(input, context) {
    const payload = await requestUptimerobotJson({
      context,
      endpoint: "editMonitor",
      body: buildMonitorMutationBody(input, { includeMonitorId: true }),
      phase: "execute",
    });
    return { monitor: requireObjectPayload(payload.monitor, "uptimerobot update monitor response") };
  },
  async delete_monitor(input, context) {
    const payload = await requestUptimerobotJson({
      context,
      endpoint: "deleteMonitor",
      body: buildDeleteMonitorBody(input),
      phase: "execute",
    });
    requireObjectPayload(payload.monitor, "uptimerobot delete monitor response");
    return { deleted: true };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, uptimerobotActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(uptimerobotApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/x-www-form-urlencoded");
    headers.set("user-agent", providerUserAgent);

    const body =
      typeof input.body === "string"
        ? new URLSearchParams(input.body)
        : new URLSearchParams(normalizeProviderProxyQuery(input.body));
    body.set("api_key", credential.apiKey);
    body.set("format", "json");

    const response = await uptimerobotProxyFetch(url, {
      method: input.method,
      headers,
      body,
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `uptimerobot request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "uptimerobot request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestUptimerobotJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      endpoint: "getAccountDetails",
      phase: "validate",
    });
    const account = requireObjectPayload(payload.account, "uptimerobot account details response");
    const email = optionalString(account.email);
    const firstName = optionalString(account.firstname);
    const userId = readUnknownAsString(account.user_id);
    const accountId = email ?? userId ?? "UptimeRobot Account";

    return {
      profile: {
        accountId,
        displayName: firstName ?? email ?? accountId,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: uptimerobotApiBaseUrl,
        validationEndpoint: "/getAccountDetails",
        email,
        user_id: userId,
        monitor_limit: readUnknownAsInteger(account.monitor_limit),
        monitor_interval: readUnknownAsInteger(account.monitor_interval),
      }),
    };
  },
};

async function requestUptimerobotJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  endpoint: string;
  phase: UptimerobotRequestPhase;
  body?: URLSearchParams;
}): Promise<Record<string, unknown>> {
  const response = await uptimerobotFetch(input);
  const payload = await readUptimerobotPayload(response);
  if (!response.ok) throw createUptimerobotError(response.status, payload, input.phase);
  const body = optionalRecord(payload);
  if (!body) throw new ProviderRequestError(502, "uptimerobot returned an invalid response payload");
  if (body.stat !== "ok") throw createUptimerobotError(response.status, body, input.phase);
  return body;
}

async function uptimerobotFetch(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  endpoint: string;
  body?: URLSearchParams;
}): Promise<Response> {
  const timeout = createProviderTimeout(input.context.signal, uptimerobotDefaultRequestTimeoutMs);
  const body = new URLSearchParams(input.body);
  body.set("api_key", input.context.apiKey);
  body.set("format", "json");
  try {
    return await input.context.fetcher(new URL(input.endpoint, `${uptimerobotApiBaseUrl}/`), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `uptimerobot ${input.endpoint} request timed out after ${Math.ceil(uptimerobotDefaultRequestTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `uptimerobot request failed: ${error.message}` : "uptimerobot request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readUptimerobotPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "uptimerobot returned invalid JSON");
  }
}

function createUptimerobotError(
  status: number,
  payload: unknown,
  phase: UptimerobotRequestPhase,
): ProviderRequestError {
  const message = readUptimerobotErrorMessage(payload) ?? buildDefaultErrorMessage(status);
  const errorType = readUptimerobotErrorType(payload);
  const mappedHttpStatus = status >= 400 ? status : undefined;
  if (mappedHttpStatus === 429 || errorType?.includes("rate_limit"))
    return new ProviderRequestError(429, message, payload);
  if (mappedHttpStatus === 401 || mappedHttpStatus === 403 || errorType === "invalid_api_key") {
    return new ProviderRequestError(
      mappedHttpStatus === 401 || mappedHttpStatus === 403 ? mappedHttpStatus : 401,
      message,
      payload,
    );
  }
  if ([400, 404, 422].includes(mappedHttpStatus ?? 0) || errorType === "invalid_parameter") {
    return new ProviderRequestError(
      [400, 404, 422].includes(mappedHttpStatus ?? 0) ? (mappedHttpStatus ?? 400) : 400,
      message,
      payload,
    );
  }
  if (mappedHttpStatus !== undefined && mappedHttpStatus >= 500) return new ProviderRequestError(502, message, payload);
  if (phase === "validate") return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(mappedHttpStatus ?? 502, message, payload);
}

function buildDefaultErrorMessage(status: number): string {
  return !status || status === 200 ? "uptimerobot request failed" : `uptimerobot request failed with status ${status}`;
}

function readUptimerobotErrorMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(optionalRecord(payload)?.error)?.message);
}

function readUptimerobotErrorType(payload: unknown): string | undefined {
  return optionalString(optionalRecord(optionalRecord(payload)?.error)?.type);
}

function readPagination(payload: Record<string, unknown>): Record<string, unknown> | null {
  const limit = readUnknownAsInteger(payload.limit);
  const offset = readUnknownAsInteger(payload.offset);
  const total = readUnknownAsInteger(payload.total);
  if (limit === undefined && offset === undefined && total === undefined) return null;
  return compactObject({ limit, offset, total });
}

function buildListMonitorsBody(input: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  setOptionalNonNegativeInteger(body, "offset", input.offset, "offset");
  setOptionalPositiveInteger(body, "limit", input.limit, "limit");
  setOptionalString(body, "search", input.search);
  setOptionalString(body, "sort", input.sort);
  setHyphenSeparatedIntegerArray(body, "monitors", input.monitor_ids, "monitor_ids");
  setHyphenSeparatedIntegerArray(body, "types", input.types, "types");
  setHyphenSeparatedNonNegativeIntegerArray(body, "statuses", input.statuses, "statuses");
  setOptionalBoolean(body, "logs", input.logs);
  setOptionalBoolean(body, "alert_contacts", input.alert_contacts);
  return body;
}

function buildSingleMonitorBody(monitorId: number, input: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  body.set("monitors", String(monitorId));
  setOptionalBoolean(body, "logs", input.logs);
  setOptionalBoolean(body, "alert_contacts", input.alert_contacts);
  return body;
}

function buildMonitorMutationBody(
  input: Record<string, unknown>,
  options?: { includeMonitorId?: boolean },
): URLSearchParams {
  const body = new URLSearchParams();
  if (options?.includeMonitorId) body.set("id", String(requireMonitorId(input.monitor_id, "monitor_id")));
  setOptionalString(body, "friendly_name", input.friendly_name);
  setOptionalString(body, "url", input.url);
  setOptionalPositiveInteger(body, "type", input.type, "type");
  setOptionalPositiveInteger(body, "sub_type", input.sub_type, "sub_type");
  setOptionalPositiveInteger(body, "port", input.port, "port");
  setOptionalPositiveInteger(body, "interval", input.interval, "interval");
  setOptionalPositiveInteger(body, "timeout", input.timeout, "timeout");
  setOptionalPositiveInteger(body, "keyword_type", input.keyword_type, "keyword_type");
  setOptionalString(body, "keyword_value", input.keyword_value);
  setOptionalString(body, "http_username", input.http_username);
  setOptionalString(body, "http_password", input.http_password);
  setOptionalBoolean(body, "ssl", input.ssl);
  if (input.alert_contacts !== undefined) body.set("alert_contacts", encodeAlertContacts(input.alert_contacts));
  return body;
}

function buildDeleteMonitorBody(input: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  body.set("id", String(requireMonitorId(input.monitor_id, "monitor_id")));
  return body;
}

function encodeAlertContacts(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "alert_contacts must be a non-empty string or array");
  }
  return value
    .map((item) => {
      if (typeof item === "number") return `${item}_0_0`;
      const record = optionalRecord(item);
      if (!record) throw new ProviderRequestError(400, "alert_contacts contains an invalid entry");
      const id = requireMonitorId(record.id, "alert_contacts.id");
      const threshold = optionalInteger(record.threshold) ?? 0;
      const recurrence = optionalInteger(record.recurrence) ?? 0;
      return `${id}_${threshold}_${recurrence}`;
    })
    .join("-");
}

function setOptionalString(body: URLSearchParams, key: string, value: unknown): void {
  const parsed = optionalString(value);
  if (parsed) body.set(key, parsed);
}

function setOptionalBoolean(body: URLSearchParams, key: string, value: unknown): void {
  if (typeof value === "boolean") body.set(key, value ? "1" : "0");
}

function setOptionalPositiveInteger(body: URLSearchParams, key: string, value: unknown, fieldName: string): void {
  if (value == null) return;
  body.set(key, String(requirePositiveInteger(value, fieldName)));
}

function setOptionalNonNegativeInteger(body: URLSearchParams, key: string, value: unknown, fieldName: string): void {
  if (value == null) return;
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed < 0)
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  body.set(key, String(parsed));
}

function setHyphenSeparatedIntegerArray(body: URLSearchParams, key: string, value: unknown, fieldName: string): void {
  if (value == null) return;
  if (!Array.isArray(value) || value.length === 0)
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty integer array`);
  body.set(key, value.map((item) => String(requirePositiveInteger(item, `${fieldName}[]`))).join("-"));
}

function setHyphenSeparatedNonNegativeIntegerArray(
  body: URLSearchParams,
  key: string,
  value: unknown,
  fieldName: string,
): void {
  if (value == null) return;
  if (!Array.isArray(value) || value.length === 0)
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty integer array`);
  body.set(
    key,
    value
      .map((item) => {
        const parsed = optionalInteger(item);
        if (parsed === undefined || parsed < 0)
          throw new ProviderRequestError(400, `${fieldName}[] must be a non-negative integer`);
        return String(parsed);
      })
      .join("-"),
  );
}

function requireMonitorId(value: unknown, fieldName: string): number {
  return requirePositiveInteger(value, fieldName);
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0)
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}

function requireArrayPayload(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} must be an array`);
  return value;
}

function readUnknownAsString(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readUnknownAsInteger(value: unknown): number | undefined {
  if (Number.isInteger(value)) return value as number;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}
