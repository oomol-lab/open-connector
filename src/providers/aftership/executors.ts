import type {
  ActionExecutor,
  CredentialValidators,
  ExecutionContext,
  ExecutionResult,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { AftershipActionName } from "./actions.ts";

import { CastError, compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "aftership";
const aftershipApiBaseUrl = "https://api.aftership.com/tracking/2026-01";
const aftershipFetch = createProviderFetch({ skipDnsValidation: true });

type AftershipHttpMethod = "DELETE" | "GET" | "POST" | "PUT";
type AftershipActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface AftershipRequest {
  method: AftershipHttpMethod;
  path: string;
  search?: URLSearchParams;
  body?: Record<string, unknown>;
}

export const aftershipActionHandlers: Record<AftershipActionName, AftershipActionHandler> = {
  async create_tracking(input, context) {
    const payload = await requestAftership(
      { method: "POST", path: "/trackings", body: compactObject(input) },
      context,
      "execute",
    );
    return normalizeTrackingResponse(payload);
  },
  async get_tracking(input, context) {
    const payload = await requestAftership(
      {
        method: "GET",
        path: `/trackings/${encodePathSegment(input.id)}`,
        search: buildSearch(input, ["id"]),
      },
      context,
      "execute",
    );
    return normalizeTrackingResponse(payload);
  },
  async update_tracking(input, context) {
    const { id, ...trackingInput } = input;
    const payload = await requestAftership(
      {
        method: "PUT",
        path: `/trackings/${encodePathSegment(id)}`,
        body: compactObject(trackingInput),
      },
      context,
      "execute",
    );
    return normalizeTrackingResponse(payload);
  },
  async delete_tracking(input, context) {
    const payload = await requestAftership(
      {
        method: "DELETE",
        path: `/trackings/${encodePathSegment(input.id)}`,
      },
      context,
      "execute",
    );
    return normalizeTrackingResponse(payload);
  },
  async list_trackings(input, context) {
    const payload = await requestAftership(
      {
        method: "GET",
        path: "/trackings",
        search: buildSearch(input, []),
      },
      context,
      "execute",
    );
    return normalizeTrackingsResponse(payload);
  },
  async retrack_tracking(input, context) {
    const payload = await requestAftership(
      {
        method: "POST",
        path: `/trackings/${encodePathSegment(input.id)}/retrack`,
      },
      context,
      "execute",
    );
    return normalizeTrackingResponse(payload);
  },
  async mark_tracking_completed(input, context) {
    const { id, ...body } = input;
    const payload = await requestAftership(
      {
        method: "POST",
        path: `/trackings/${encodePathSegment(id)}/mark-as-completed`,
        body: compactObject(body),
      },
      context,
      "execute",
    );
    return normalizeTrackingResponse(payload);
  },
  async list_couriers(input, context) {
    const payload = await requestAftership(
      {
        method: "GET",
        path: "/couriers",
        search: buildSearch(input, []),
      },
      context,
      "execute",
    );
    return normalizeCouriersResponse(payload);
  },
  async detect_couriers(input, context) {
    const payload = await requestAftership(
      { method: "POST", path: "/couriers/detect", body: compactObject(input) },
      context,
      "execute",
    );
    return normalizeCouriersResponse(payload);
  },
};

export const executors: ProviderExecutors = defineAftershipExecutors();

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: aftershipApiBaseUrl,
  auth: { type: "api_key_header", name: "as-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "aftership apiKey is required");
    }

    const payload = await requestAftership(
      {
        method: "GET",
        path: "/couriers",
        search: new URLSearchParams({ active: "true" }),
      },
      {
        apiKey,
        fetcher: options.fetcher,
        signal: options.signal,
      },
      "validate",
    );
    const response = normalizeCouriersResponse(payload);

    return {
      profile: {
        displayName: "AfterShip API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: aftershipApiBaseUrl,
        validationEndpoint: "/couriers?active=true",
        activeCourierCount: response.total,
      },
    };
  },
};

async function requestAftership(
  request: AftershipRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = new URL(normalizePath(request.path), `${aftershipApiBaseUrl}/`);
  if (request.search) {
    for (const [key, value] of request.search) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers: aftershipHeaders(context.apiKey, request.body !== undefined),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? error.message : "aftership request failed",
    );
  }

  const payload = await readAftershipPayload(response);
  if (!response.ok) {
    throw createAftershipError(response, payload, phase);
  }

  return payload;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function aftershipHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "as-api-key": apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readAftershipPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `AfterShip returned non-JSON response (${response.status})`);
    }
    return text;
  }
}

class AftershipExecutionError extends ProviderRequestError {
  readonly code: string;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(status, message, details);
    this.code = code;
  }
}

function createAftershipError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readAftershipErrorMessage(payload) ?? `AfterShip API request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new AftershipExecutionError(response.status, "credential_expired", message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return phase === "validate"
      ? new ProviderRequestError(response.status, message)
      : new AftershipExecutionError(response.status, "invalid_input", message, payload);
  }

  return phase === "validate"
    ? new ProviderRequestError(response.status || 502, message)
    : new AftershipExecutionError(response.status || 502, "provider_error", message, payload);
}

function readAftershipErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const meta = optionalRecord(object?.meta);
  const errors = Array.isArray(object?.errors) ? object.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(meta?.message) ??
    optionalString(firstError?.info) ??
    optionalString(firstError?.message) ??
    optionalString(meta?.type) ??
    optionalString(object?.message) ??
    optionalString(object?.error)
  );
}

function buildSearch(input: Record<string, unknown>, omittedKeys: readonly string[]): URLSearchParams {
  const omitted = new Set(omittedKeys);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (omitted.has(key) || value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      search.set(key, value.map((item) => String(item)).join(","));
      continue;
    }

    search.set(key, String(value));
  }
  return search;
}

function normalizeTrackingResponse(payload: unknown): Record<string, unknown> {
  const raw = readObject(payload, "tracking response");
  return {
    tracking: readObject(raw.data, "data"),
    meta: readObject(raw.meta, "meta"),
    raw,
  };
}

function normalizeTrackingsResponse(payload: unknown): Record<string, unknown> {
  const raw = readObject(payload, "trackings response");
  const data = readObject(raw.data, "data");
  return {
    trackings: readArray(data.trackings, "trackings"),
    pagination: readObject(data.pagination ?? {}, "pagination"),
    meta: readObject(raw.meta, "meta"),
    raw,
  };
}

function normalizeCouriersResponse(payload: unknown): Record<string, unknown> & { total: number } {
  const raw = readObject(payload, "couriers response");
  const data = readObject(raw.data, "data");
  const couriers = readArray(data.couriers, "couriers");
  return {
    couriers,
    total: typeof data.total == "number" ? data.total : couriers.length,
    meta: readObject(raw.meta, "meta"),
    raw,
  };
}

function defineAftershipExecutors(): ProviderExecutors {
  const output: ProviderExecutors = {};
  for (const [name, handler] of Object.entries(aftershipActionHandlers)) {
    output[`${service}.${name}`] = createAftershipExecutor(handler);
  }
  return output;
}

function createAftershipExecutor(handler: AftershipActionHandler): ActionExecutor {
  return async (input, executionContext): Promise<ExecutionResult> => {
    try {
      const credential = await requireApiKeyCredential(executionContext, service);
      return {
        ok: true,
        output: await handler(
          input as Record<string, unknown>,
          createAftershipContext(credential.apiKey, executionContext),
        ),
      };
    } catch (error) {
      return toAftershipExecutionResult(error);
    }
  };
}

function createAftershipContext(apiKey: string, executionContext: ExecutionContext): ApiKeyProviderContext {
  const context: ApiKeyProviderContext = {
    apiKey,
    fetcher: aftershipFetch,
    signal: executionContext.signal,
  };
  if (executionContext.transitFiles) {
    context.transitFiles = executionContext.transitFiles;
  }
  return context;
}

function toAftershipExecutionResult(error: unknown): ExecutionResult {
  if (error instanceof AftershipExecutionError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: {
          status: error.status,
          details: error.details,
        },
      },
    };
  }

  if (error instanceof ProviderRequestError) {
    return {
      ok: false,
      error: {
        code:
          error.status === 401 || error.status === 403
            ? "authorization_failed"
            : error.status < 500
              ? "invalid_input"
              : "provider_error",
        message: error.message,
        details: {
          status: error.status,
          details: error.details,
        },
      },
    };
  }

  if (error instanceof CastError) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "provider_error",
      message: error instanceof Error ? error.message : "aftership request failed",
    },
  };
}

function readArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `AfterShip response field ${fieldName} is not an array`);
  }

  return value.map((item) => readObject(item, `${fieldName} item`));
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `AfterShip response field ${fieldName} is not an object`);
  }

  return object;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
