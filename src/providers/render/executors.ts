import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "render";
const renderApiBaseUrl = "https://api.render.com/v1";

type RenderRequestPhase = "validate" | "execute";
type RenderQueryValue = string | number | boolean | string[] | undefined;
type RenderActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const renderActionHandlers: ProviderActionHandlers<"render", RenderActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_workspaces(input, context) {
    return listWorkspaces(input, context);
  },
  list_services(input, context) {
    return listServices(input, context);
  },
  get_service(input, context) {
    return getService(input, context);
  },
  list_deploys(input, context) {
    return listDeploys(input, context);
  },
  trigger_deploy(input, context) {
    return triggerDeploy(input, context);
  },
  rollback_deploy(input, context) {
    return rollbackDeploy(input, context);
  },
  restart_service(input, context) {
    return restartService(input, context);
  },
  suspend_service(input, context) {
    return suspendService(input, context);
  },
  resume_service(input, context) {
    return resumeService(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, renderActionHandlers);

export const credentialValidators = {
  async apiKey(
    input: { apiKey: string; values: Record<string, string> },
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    const user = await requestRenderJson<Record<string, unknown>>({
      context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
      path: "/users",
      phase: "validate",
    });
    const email = requireResponseString(user.email, "email");
    const name = optionalString(user.name);
    return {
      profile: {
        accountId: email,
        displayName: name || email,
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/users",
        email,
        name,
      }),
    };
  },
};

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  return requestRenderJson({ context, path: "/users", phase: "execute" });
}

async function listWorkspaces(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestRenderJson<unknown[]>({
    context,
    path: "/owners",
    query: compactObject({
      name: readOptionalStringArray(input.name, "name"),
      email: readOptionalStringArray(input.email, "email"),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
    phase: "execute",
  });
  const { items, nextCursor } = mapCursorCollection(payload, "owner");
  return { workspaces: items, nextCursor };
}

async function listServices(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestRenderJson<unknown[]>({
    context,
    path: "/services",
    query: compactObject({
      name: readOptionalStringArray(input.name, "name"),
      type: readOptionalStringArray(input.type, "type"),
      ownerId: readOptionalStringArray(input.ownerId, "ownerId"),
      suspended: readOptionalStringArray(input.suspended, "suspended"),
      includePreviews: optionalBoolean(input.includePreviews),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
    phase: "execute",
  });
  const { items, nextCursor } = mapCursorCollection(payload, "service");
  return { services: items, nextCursor };
}

async function getService(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  return requestRenderJson({
    context,
    path: `/services/${encodeURIComponent(serviceId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function listDeploys(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  const payload = await requestRenderJson<unknown[]>({
    context,
    path: `/services/${encodeURIComponent(serviceId)}/deploys`,
    query: compactObject({
      status: readOptionalStringArray(input.status, "status"),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const { items, nextCursor } = mapCursorCollection(payload, "deploy");
  return { deploys: items, nextCursor };
}

async function triggerDeploy(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  if (
    input.deployMode &&
    (input.commitId !== undefined || input.imageUrl !== undefined || input.clearCache !== undefined)
  ) {
    throw new ProviderRequestError(400, "deployMode cannot be combined with commitId, imageUrl, or clearCache");
  }
  const clearCache = optionalBoolean(input.clearCache);
  const response = await renderFetch({
    context,
    path: `/services/${encodeURIComponent(serviceId)}/deploys`,
    method: "POST",
    body: compactObject({
      clearCache: clearCache === true ? "clear" : "do_not_clear",
      commitId: optionalString(input.commitId),
      imageUrl: optionalString(input.imageUrl),
      deployMode: optionalString(input.deployMode),
    }),
  });
  if (!response.ok) {
    throw await toRenderError(response, "execute", true);
  }
  if (response.status === 202) {
    return { queued: true, serviceId };
  }
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError(502, "Render returned invalid JSON");
  }
}

async function rollbackDeploy(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  const deployId = requireInputString(input.deployId, "deployId");
  return requestRenderJson({
    context,
    path: `/services/${encodeURIComponent(serviceId)}/rollback`,
    method: "POST",
    body: { deployId },
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function restartService(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  await requestRenderAck({
    context,
    path: `/services/${encodeURIComponent(serviceId)}/restart`,
    method: "POST",
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { ok: true, serviceId, action: "restart" };
}

async function suspendService(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  await requestRenderAck({
    context,
    path: `/services/${encodeURIComponent(serviceId)}/suspend`,
    method: "POST",
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { ok: true, serviceId, action: "suspend" };
}

async function resumeService(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const serviceId = requireInputString(input.serviceId, "serviceId");
  await requestRenderAck({
    context,
    path: `/services/${encodeURIComponent(serviceId)}/resume`,
    method: "POST",
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { ok: true, serviceId, action: "resume" };
}

async function requestRenderJson<T>(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: RenderRequestPhase;
  method?: string;
  query?: Record<string, RenderQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const response = await renderFetch(input);
  if (!response.ok) {
    throw await toRenderError(response, input.phase, input.notFoundAsInvalidInput);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "Render returned invalid JSON");
  }
}

async function requestRenderAck(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: RenderRequestPhase;
  method?: string;
  query?: Record<string, RenderQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<void> {
  const response = await renderFetch(input);
  if (!response.ok) {
    throw await toRenderError(response, input.phase, input.notFoundAsInvalidInput);
  }
}

async function renderFetch(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method?: string;
  query?: Record<string, RenderQueryValue>;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const url = new URL(`${renderApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }
  try {
    return await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: renderHeaders(input.context.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Render request failed: ${error.message}` : "Render request failed",
    );
  }
}

function appendQueryValue(url: URL, key: string, value: RenderQueryValue): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return;
    }
    url.searchParams.set(key, value.join(","));
    return;
  }
  url.searchParams.set(key, String(value));
}

function renderHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": providerUserAgent,
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function toRenderError(
  response: Response,
  phase: RenderRequestPhase,
  notFoundAsInvalidInput = false,
): Promise<ProviderRequestError> {
  const message = await readRenderErrorMessage(response);
  if (response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(phase === "validate" ? 401 : response.status >= 500 ? 502 : 400, message);
}

async function readRenderErrorMessage(response: Response): Promise<string> {
  let jsonParsed = false;
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    jsonParsed = true;
    const message =
      firstString(payload.message, payload.error, payload.detail, payload.title) ??
      readErrorsArrayMessage(payload.errors);
    if (message) {
      return message;
    }
  } catch {}
  if (!jsonParsed) {
    try {
      const text = await response.text();
      if (text) {
        return text;
      }
    } catch {}
  }
  return `Render request failed with ${response.status}`;
}

function readErrorsArrayMessage(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const first = value[0];
  if (typeof first === "string" && first.length > 0) {
    return first;
  }
  const record = optionalRecord(first);
  return record ? firstString(record.message, record.error, record.detail) : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function mapCursorCollection(
  payload: unknown,
  key: "owner" | "service" | "deploy",
): { items: Record<string, unknown>[]; nextCursor: string | null } {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Render list response must be an array");
  }
  const items: Record<string, unknown>[] = [];
  let nextCursor: string | null = null;
  for (const entry of payload) {
    const record = optionalRecord(entry);
    if (!record) {
      throw new ProviderRequestError(502, "Render list entry must be an object");
    }
    const value = record[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ProviderRequestError(502, `Render response missing ${key}`);
    }
    items.push(value as Record<string, unknown>);
    nextCursor = optionalString(record.cursor) ?? nextCursor;
  }
  return { items, nextCursor };
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a string array`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new ProviderRequestError(400, `${fieldName} must be a string array`);
    }
    return item;
  });
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requireResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `Render response missing ${fieldName}`);
  }
  return value;
}
