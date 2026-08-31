import type { KadoaActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface KadoaCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const kadoaApiBaseUrl = "https://api.kadoa.com";

type KadoaRequestPhase = "validate" | "execute";

export async function validateKadoaCredential(apiKey: string, fetcher: typeof fetch): Promise<KadoaCredentialCheck> {
  await requestKadoaObject({
    apiKey,
    path: "/v4/workflows",
    query: { limit: 1 },
    fetcher,
    phase: "validate",
  });

  return {
    accountLabel: "Kadoa API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: kadoaApiBaseUrl,
      validationEndpoint: "/v4/workflows",
    },
  };
}

export async function executeKadoaAction(
  actionName: KadoaActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  input = normalizeKadoaInput(input);
  switch (actionName) {
    case "list_workflows":
      return requestKadoaObject({
        apiKey,
        path: "/v4/workflows",
        query: {
          search: input.search,
          skip: input.skip,
          limit: input.limit,
          state: input.state,
          runState: input.runState,
          displayState: input.displayState,
          monitoring: input.monitoring,
          updateInterval: input.updateInterval,
          scheduleType: input.scheduleType,
          includeDeleted: input.includeDeleted,
        },
        fetcher,
        phase: "execute",
      });
    case "get_workflow":
      return requestKadoaObject({
        apiKey,
        path: `/v4/workflows/${encodeURIComponent(String(input.workflowId))}`,
        fetcher,
        phase: "execute",
      });
    case "get_workflow_data":
      return requestKadoaObject({
        apiKey,
        path: `/v4/workflows/${encodeURIComponent(String(input.workflowId))}/data`,
        query: {
          format: "json",
          runId: input.runId,
          filters: encodeStructuredFilters(input.filters),
          sortBy: input.sortBy,
          order: input.order,
          page: input.page,
          limit: input.limit,
          rowIds: encodeRowIds(input.rowIds),
          includeAnomalies: input.includeAnomalies,
        },
        fetcher,
        phase: "execute",
      });
    case "export_workflow_data":
      return requestKadoaObject({
        apiKey,
        path: `/v4/workflows/${encodeURIComponent(String(input.workflowId))}/data/export`,
        query: {
          format: input.format,
          runId: input.runId,
          filters: encodeStructuredFilters(input.filters),
          sortBy: input.sortBy,
          order: input.order,
          rowIds: encodeRowIds(input.rowIds),
        },
        fetcher,
        phase: "execute",
      });
  }
}

function normalizeKadoaInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  for (const field of ["workflowId", "runId", "sortBy", "search"] as const) {
    if (typeof normalized[field] === "string") normalized[field] = normalized[field].trim();
  }
  if (Array.isArray(normalized.rowIds)) {
    normalized.rowIds = normalized.rowIds.map((value) => (typeof value === "string" ? value.trim() : value));
  }
  if (Array.isArray(normalized.filters)) {
    normalized.filters = normalized.filters.map((value) => {
      const filter = optionalRecord(value);
      if (!filter) return value;
      return {
        ...filter,
        ...(typeof filter.field === "string" ? { field: filter.field.trim() } : {}),
        ...(typeof filter.operator === "string" ? { operator: filter.operator.trim() } : {}),
      };
    });
  }
  return normalized;
}

function encodeStructuredFilters(value: unknown) {
  return Array.isArray(value) ? JSON.stringify(value) : undefined;
}

function encodeRowIds(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(",") : undefined;
}

async function requestKadoaObject(input: {
  apiKey: string;
  path: string;
  query?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: KadoaRequestPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined);

  try {
    const response = await input.fetcher(buildKadoaUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readKadoaPayload(response);
    if (!response.ok) {
      throw mapKadoaError(response, payload, input.phase);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Kadoa returned a non-object response");
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "Kadoa API request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kadoa API request failed: ${error.message}` : "Kadoa API request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildKadoaUrl(path: string, query?: Record<string, unknown>) {
  const url = new URL(path, kadoaApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readKadoaPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapKadoaError(response: Response, payload: unknown, phase: KadoaRequestPhase) {
  const message = extractKadoaErrorMessage(payload) ?? `Kadoa request failed with HTTP ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }

  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractKadoaErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(optionalRecord(record?.error)?.message)
  );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
