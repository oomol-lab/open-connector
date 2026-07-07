import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ConductorActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "conductor";
const conductorApiBaseUrl = "https://api.cm.conductor.com";
const conductorWebsitesPath = "/v2/entities/websites";

type ConductorRequestPhase = "validate" | "execute";
type ConductorContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ConductorActionHandler = (input: Record<string, unknown>, context: ConductorContext) => Promise<unknown>;

export const conductorActionHandlers: Record<ConductorActionName, ConductorActionHandler> = {
  list_websites(_input, context) {
    return requestWrappedConductorJson({
      path: conductorWebsitesPath,
      context,
      phase: "execute",
      wrapper: "array",
    });
  },
  list_segments(input, context) {
    return requestWrappedConductorJson({
      path: "/v2/entities/segments",
      context,
      phase: "execute",
      query: {
        website_id: readRequiredString(input.website_id, "website_id"),
      },
      wrapper: "array",
    });
  },
  get_statistics(input, context) {
    return requestWrappedConductorJson({
      path: "/v2/data/statistics",
      context,
      phase: "execute",
      query: compactObject({
        website_id: readRequiredString(input.website_id, "website_id"),
        scope: readRequiredString(input.scope, "scope"),
        captured_at: optionalString(input.captured_at),
      }),
      wrapper: "object",
    });
  },
  list_pages(input, context) {
    const page = optionalNumber(input.page);
    const pageCursor = optionalString(input.page_cursor);
    if (page !== undefined && pageCursor !== undefined) {
      throw new ProviderRequestError(400, "page and page_cursor cannot be used together");
    }

    return requestWrappedConductorJson({
      path: "/v2/data/pages",
      context,
      phase: "execute",
      query: compactObject({
        website_id: readRequiredString(input.website_id, "website_id"),
        per_page: readRequiredNumber(input.per_page, "per_page"),
        page,
        page_cursor: pageCursor,
        sort: optionalString(input.sort),
        direction: optionalString(input.direction),
      }),
      wrapper: "object",
    });
  },
  get_page(input, context) {
    return requestWrappedConductorJson({
      path: "/v2/data/page",
      context,
      phase: "execute",
      query: {
        website_id: readRequiredString(input.website_id, "website_id"),
        url: readRequiredString(input.url, "url"),
      },
      wrapper: "object",
    });
  },
  list_issues(input, context) {
    return requestWrappedConductorJson({
      path: "/v2/data/issues",
      context,
      phase: "execute",
      query: compactObject({
        website_id: readRequiredString(input.website_id, "website_id"),
        scope: readRequiredString(input.scope, "scope"),
        captured_at: optionalString(input.captured_at),
      }),
      wrapper: "array",
    });
  },
  list_affected_pages(input, context) {
    return requestWrappedConductorJson({
      path: "/v2/data/affected_pages",
      context,
      phase: "execute",
      query: compactObject({
        website_id: readRequiredString(input.website_id, "website_id"),
        issue: readRequiredString(input.issue, "issue"),
        page: optionalNumber(input.page),
        per_page: optionalNumber(input.per_page),
      }),
      wrapper: "object",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, conductorActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: conductorApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "token " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestConductorJson({
      path: conductorWebsitesPath,
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const websites = readDataArray(payload, "Conductor website list");
    const firstWebsite = optionalRecord(websites[0]);
    const firstWebsiteName = optionalString(firstWebsite?.name);
    const firstWebsiteDomain = optionalString(firstWebsite?.domain);
    const firstWebsiteId = optionalString(firstWebsite?.id);
    const labelDetail = firstWebsiteName || firstWebsiteDomain;

    return {
      profile: {
        accountId: firstWebsiteId ?? "api_key",
        displayName: labelDetail ? `Conductor ${labelDetail}` : "Conductor API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: conductorApiBaseUrl,
        validationEndpoint: conductorWebsitesPath,
        firstWebsiteDomain,
        firstWebsiteId,
        firstWebsiteName,
        websiteCount: websites.length,
      }),
    };
  },
};

async function requestWrappedConductorJson(input: {
  path: string;
  context: ConductorContext;
  phase: ConductorRequestPhase;
  query?: Record<string, unknown>;
  wrapper: "array" | "object";
}): Promise<Record<string, unknown>> {
  const payload = await requestConductorJson(input);
  if (input.wrapper === "array") {
    readDataArray(payload, `Conductor ${input.path}`);
  } else {
    readDataObject(payload, `Conductor ${input.path}`);
  }
  const record = requireObjectPayload(payload, `Conductor ${input.path}`);
  const output: Record<string, unknown> = {
    data: record.data,
    raw: record,
  };
  if (record.data_captured_at !== undefined) {
    output.data_captured_at = record.data_captured_at ?? null;
  }
  if (record.is_data_golden !== undefined) {
    output.is_data_golden = record.is_data_golden;
  }
  return output;
}

async function requestConductorJson(input: {
  path: string;
  context: ConductorContext;
  phase: ConductorRequestPhase;
  query?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, conductorApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        Authorization: `token ${input.context.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readConductorPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `conductor request failed: ${error.message}` : "conductor request failed",
      error,
    );
  }

  if (!response.ok) {
    throw mapConductorError(response.status, extractConductorErrorMessage(payload), input.phase, payload);
  }

  return payload;
}

async function readConductorPayload(response: Response): Promise<unknown> {
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

function mapConductorError(
  status: number,
  message: string | undefined,
  phase: ConductorRequestPhase,
  payload: unknown,
): ProviderRequestError {
  const normalizedMessage = message ?? `conductor request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, normalizedMessage, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, normalizedMessage, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 422 ? 400 : status, normalizedMessage, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, normalizedMessage, payload);
}

function extractConductorErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 300);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstMessage = errors.find((value) => typeof value === "string");
    if (typeof firstMessage === "string" && firstMessage.trim()) {
      return firstMessage.trim();
    }
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.code);
}

function readDataArray(payload: unknown, label: string): unknown[] {
  const record = requireObjectPayload(payload, label);
  if (!Array.isArray(record.data)) {
    throw new ProviderRequestError(502, `${label} response data must be an array`, payload);
  }
  return record.data;
}

function readDataObject(payload: unknown, label: string): Record<string, unknown> {
  const record = requireObjectPayload(payload, label);
  const data = optionalRecord(record.data);
  if (!data) {
    throw new ProviderRequestError(502, `${label} response data must be an object`, payload);
  }
  return data;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be a JSON object`, payload);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a number`);
  }
  return value;
}
