import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DialpadWfmActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const dialpadWfmApiBaseUrl = "https://api.teamsurfboard.com/api/v1";
const dialpadWfmRequestTimeoutMs = 30_000;
const validationScheduleQuery = {
  start: "2024-06-25T00:00:00.000Z",
  end: "2024-06-25T00:01:00.000Z",
  pageSize: 1,
};

type DialpadWfmPhase = "validate" | "execute";
type DialpadWfmHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface DialpadWfmRequestInput {
  path: string;
  context: ApiKeyProviderContext;
  phase: DialpadWfmPhase;
  query: URLSearchParams;
}

export const dialpadWfmActionHandlers: Record<DialpadWfmActionName, DialpadWfmHandler> = {
  async get_schedule(input, context) {
    const payload = await requestDialpadWfmJson({
      path: "/schedule",
      query: buildScheduleQuery(input),
      phase: "execute",
      context,
    });
    return normalizeScheduleResponse(payload);
  },
  async list_agent_metrics(input, context) {
    const payload = await requestDialpadWfmJson({
      path: "/metrics/agent",
      query: buildMetricsQuery(input),
      phase: "execute",
      context,
    });
    return normalizeMetricsResponse(payload, "Dialpad WFM agent metrics response");
  },
  async list_activity_metrics(input, context) {
    const payload = await requestDialpadWfmJson({
      path: "/metrics/activity",
      query: buildMetricsQuery(input),
      phase: "execute",
      context,
    });
    return normalizeMetricsResponse(payload, "Dialpad WFM activity metrics response");
  },
};

export async function validateDialpadWfmCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
  const payload = await requestDialpadWfmJson({
    path: "/schedule",
    query: buildScheduleQuery(validationScheduleQuery),
    phase: "validate",
    context,
  });
  normalizeScheduleResponse(payload);

  return {
    profile: {
      accountId: "access_token",
      displayName: "Dialpad WFM Access Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: dialpadWfmApiBaseUrl,
      validationEndpoint:
        "/schedule?start=2024-06-25T00%3A00%3A00.000Z&end=2024-06-25T00%3A01%3A00.000Z&page%5Bsize%5D=1",
      credentialHelpUrl: "https://help.dialpad.com/docs/wfm-apis",
    },
  };
}

async function requestDialpadWfmJson(input: DialpadWfmRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, dialpadWfmRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.context.fetcher(buildDialpadWfmUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Dialpad WFM request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dialpad WFM request failed: ${error.message}` : "Dialpad WFM request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readDialpadWfmPayload(response);
  if (!response.ok) {
    throw createDialpadWfmError(response.status, payload, input.phase);
  }
  return payload;
}

function buildDialpadWfmUrl(input: { path: string; query: URLSearchParams }): URL {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${dialpadWfmApiBaseUrl}/`);
  url.search = input.query.toString();
  return url;
}

function buildScheduleQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  query.set("start", requiredString(input.start, "start", badInput));
  query.set("end", requiredString(input.end, "end", badInput));
  setOptionalQueryParam(query, "include_deleted_agents", input.includeDeletedAgents);
  setOptionalQueryParam(query, "page[size]", input.pageSize);
  setOptionalQueryParam(query, "page[after]", input.pageAfter);
  return query;
}

function buildMetricsQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  query.set("start", requiredString(input.start, "start", badInput));
  query.set("end", requiredString(input.end, "end", badInput));
  setOptionalQueryParam(query, "emails", input.emails);
  setOptionalQueryParam(query, "include_deleted_agents", input.includeDeletedAgents);
  setOptionalQueryParam(query, "limit", input.limit);
  setOptionalQueryParam(query, "cursor", input.cursor);
  return query;
}

function setOptionalQueryParam(query: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  query.set(name, String(value));
}

async function readDialpadWfmPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Dialpad WFM JSON response");
  }
}

function normalizeScheduleResponse(payload: unknown): Record<string, unknown> {
  const body = requireProviderObject(payload, "Dialpad WFM schedule response");
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, "Dialpad WFM schedule data is invalid");
  }
  const links = requireProviderObject(body.links, "Dialpad WFM schedule links");

  return {
    data: body.data.map((item) => requireProviderObject(item, "Dialpad WFM schedule item")),
    links: {
      self: readRequiredPayloadString(links.self, "Dialpad WFM schedule links.self"),
      next: readNullablePayloadString(links.next, "Dialpad WFM schedule links.next"),
    },
  };
}

function normalizeMetricsResponse(payload: unknown, label: string): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  if (!Array.isArray(body.items)) {
    throw new ProviderRequestError(502, `${label} items is invalid`);
  }
  return {
    items: body.items.map((item) => requireProviderObject(item, `${label} item`)),
    cursor: readNullablePayloadString(body.cursor, `${label} cursor`),
  };
}

function createDialpadWfmError(status: number, payload: unknown, phase: DialpadWfmPhase): ProviderRequestError {
  const message = extractDialpadWfmErrorMessage(payload) ?? `Dialpad WFM request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractDialpadWfmErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors) ? record.errors : [];
  const firstError = errors.map((error) => optionalRecord(error)).find((error) => error !== undefined);
  if (firstError) {
    return optionalString(firstError.detail) ?? optionalString(firstError.title) ?? optionalString(firstError.status);
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function requireProviderObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return object;
}

function readRequiredPayloadString(value: unknown, label: string): string {
  const stringValue = optionalString(value);
  if (stringValue === undefined) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return stringValue;
}

function readNullablePayloadString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  const stringValue = optionalString(value);
  if (stringValue === undefined) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return stringValue;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
