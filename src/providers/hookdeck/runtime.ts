import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const hookdeckApiBaseUrl = "https://api.hookdeck.com";
export const hookdeckApiVersion = "2025-07-01";
export const hookdeckApiPrefix: string = `/${hookdeckApiVersion}`;
export const hookdeckValidationPath = "/sources";

type HookdeckActionContext = ApiKeyProviderContext;
type HookdeckActionHandler = (input: Record<string, unknown>, context: HookdeckActionContext) => Promise<unknown>;

export const hookdeckActionHandlers: ProviderActionHandlers<"hookdeck", HookdeckActionHandler> = {
  async list_connections(input, context) {
    return normalizeListOutput(
      "connections",
      await hookdeckGetJson("/connections", context, buildConnectionListQuery(input)),
      normalizeConnection,
    );
  },
  async get_connection(input, context) {
    const raw = asHookdeckObject(
      await hookdeckGetJson(`/connections/${readPathSegment(input.connectionId, "connectionId")}`, context),
      "Hookdeck connection response",
    );
    return { connection: normalizeConnection(raw), raw };
  },
  async create_connection(input, context) {
    const raw = asHookdeckObject(
      await hookdeckRequestJson("POST", "/connections", context, buildConnectionBody(input)),
      "Hookdeck connection response",
    );
    return { connection: normalizeConnection(raw), raw };
  },
  async update_connection(input, context) {
    const connectionId = readPathSegment(input.connectionId, "connectionId");
    const raw = asHookdeckObject(
      await hookdeckRequestJson("PUT", `/connections/${connectionId}`, context, buildConnectionBody(input)),
      "Hookdeck connection response",
    );
    return { connection: normalizeConnection(raw), raw };
  },
  async delete_connection(input, context) {
    return normalizeDeleteOutput(
      await hookdeckRequestJson(
        "DELETE",
        `/connections/${readPathSegment(input.connectionId, "connectionId")}`,
        context,
      ),
    );
  },
  async list_sources(input, context) {
    return normalizeListOutput(
      "sources",
      await hookdeckGetJson("/sources", context, buildListQuery(input)),
      normalizeSource,
    );
  },
  async get_source(input, context) {
    const raw = asHookdeckObject(
      await hookdeckGetJson(`/sources/${readPathSegment(input.sourceId, "sourceId")}`, context),
      "Hookdeck source response",
    );
    return { source: normalizeSource(raw), raw };
  },
  async create_source(input, context) {
    const raw = asHookdeckObject(
      await hookdeckRequestJson("POST", "/sources", context, buildSourceBody(input)),
      "Hookdeck source response",
    );
    return { source: normalizeSource(raw), raw };
  },
  async update_source(input, context) {
    const sourceId = readPathSegment(input.sourceId, "sourceId");
    const raw = asHookdeckObject(
      await hookdeckRequestJson("PUT", `/sources/${sourceId}`, context, buildSourceBody(input)),
      "Hookdeck source response",
    );
    return { source: normalizeSource(raw), raw };
  },
  async delete_source(input, context) {
    return normalizeDeleteOutput(
      await hookdeckRequestJson("DELETE", `/sources/${readPathSegment(input.sourceId, "sourceId")}`, context),
    );
  },
  async list_destinations(input, context) {
    return normalizeListOutput(
      "destinations",
      await hookdeckGetJson("/destinations", context, buildListQuery(input)),
      normalizeDestination,
    );
  },
  async get_destination(input, context) {
    const raw = asHookdeckObject(
      await hookdeckGetJson(`/destinations/${readPathSegment(input.destinationId, "destinationId")}`, context),
      "Hookdeck destination response",
    );
    return { destination: normalizeDestination(raw), raw };
  },
  async create_destination(input, context) {
    const raw = asHookdeckObject(
      await hookdeckRequestJson("POST", "/destinations", context, buildDestinationBody(input)),
      "Hookdeck destination response",
    );
    return { destination: normalizeDestination(raw), raw };
  },
  async update_destination(input, context) {
    const destinationId = readPathSegment(input.destinationId, "destinationId");
    const raw = asHookdeckObject(
      await hookdeckRequestJson("PUT", `/destinations/${destinationId}`, context, buildDestinationBody(input)),
      "Hookdeck destination response",
    );
    return { destination: normalizeDestination(raw), raw };
  },
  async delete_destination(input, context) {
    return normalizeDeleteOutput(
      await hookdeckRequestJson(
        "DELETE",
        `/destinations/${readPathSegment(input.destinationId, "destinationId")}`,
        context,
      ),
    );
  },
};

export async function validateHookdeckCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await hookdeckGetJson(
    hookdeckValidationPath,
    {
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    { limit: 1 },
  );
  const raw = asHookdeckObject(payload, "Hookdeck sources list response");
  const firstSource = readModels(raw)
    .map((item) => asHookdeckObject(item))
    .find((source) => optionalString(source.name));

  return {
    profile: {
      accountId: optionalString(firstSource?.id) ?? "api_key",
      displayName: firstSource ? `Hookdeck: ${String(firstSource.name)}` : "Hookdeck API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: `${hookdeckApiBaseUrl}${hookdeckApiPrefix}`,
      apiVersion: hookdeckApiVersion,
      validationEndpoint: hookdeckValidationPath,
      firstSourceId: firstSource ? optionalString(firstSource.id) : undefined,
      firstSourceName: firstSource ? optionalString(firstSource.name) : undefined,
    }),
  };
}

async function hookdeckGetJson(
  path: string,
  context: HookdeckActionContext,
  query?: Record<string, unknown>,
): Promise<unknown> {
  return hookdeckRequestJson("GET", path, context, undefined, query);
}

async function hookdeckRequestJson(
  method: string,
  path: string,
  context: HookdeckActionContext,
  body?: Record<string, unknown>,
  query?: Record<string, unknown>,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  try {
    response = await context.fetcher(buildHookdeckUrl(path, query), {
      method,
      headers: hookdeckHeaders(context.apiKey, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Hookdeck request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hookdeck request failed: ${error.message}` : "Hookdeck request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readHookdeckPayload(response);
  if (!response.ok) {
    throw createHookdeckError(response, payload);
  }
  return payload;
}

function buildHookdeckUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(`${hookdeckApiPrefix}${path}`, hookdeckApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function hookdeckHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${apiKey}`);
  headers.set("accept", "application/json");
  headers.set("user-agent", providerUserAgent);
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readHookdeckPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createHookdeckError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractHookdeckErrorMessage(payload) ?? `Hookdeck request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function extractHookdeckErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.detail);
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: input.id,
    name: input.name,
    disabled: optionalBoolean(input.disabled),
    limit: input.limit,
    next: input.next,
    prev: input.prev,
    order_by: input.orderBy,
    dir: input.dir,
  });
}

function buildConnectionListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...buildListQuery(input),
    source_id: input.sourceId,
    destination_id: input.destinationId,
    full_name: input.fullName,
  });
}

function buildConnectionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    description: input.description,
    source_id: input.sourceId,
    destination_id: input.destinationId,
    source: input.source,
    destination: input.destination,
    rules: input.rules,
  });
}

function buildSourceBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    description: input.description,
    type: input.type,
    config: input.config,
  });
}

function buildDestinationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    description: input.description,
    type: input.type,
    config: input.config,
  });
}

function normalizeListOutput(
  key: "connections" | "sources" | "destinations",
  payload: unknown,
  normalizeItem: (input: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  const raw = asHookdeckObject(payload, `Hookdeck ${key} list response`);
  const models = readModels(raw).map((item) => normalizeItem(asHookdeckObject(item)));
  return {
    [key]: models,
    count: typeof raw.count === "number" ? raw.count : models.length,
    pagination: optionalRecord(raw.pagination) ?? {},
    raw,
  };
}

function normalizeDeleteOutput(payload: unknown): Record<string, unknown> {
  const raw = optionalRecord(payload) ?? {};
  return {
    deleted: true,
    raw,
  };
}

function normalizeConnection(input: Record<string, unknown>): Record<string, unknown> {
  const source = optionalRecord(input.source);
  const destination = optionalRecord(input.destination);
  return compactObject({
    id: optionalString(input.id) ?? "",
    name: optionalString(input.name) ?? "",
    fullName: readNullableString(input.full_name),
    description: readNullableString(input.description),
    source: source ? normalizeSource(source) : undefined,
    destination: destination ? normalizeDestination(destination) : undefined,
    disabledAt: readNullableString(input.disabled_at),
    pausedAt: readNullableString(input.paused_at),
    createdAt: readNullableString(input.created_at),
    updatedAt: readNullableString(input.updated_at),
    raw: input,
  });
}

function normalizeSource(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? "",
    name: optionalString(input.name) ?? "",
    type: readNullableString(input.type),
    url: readNullableString(input.url),
    authenticated: readNullableBoolean(input.authenticated),
    disabledAt: readNullableString(input.disabled_at),
    createdAt: readNullableString(input.created_at),
    updatedAt: readNullableString(input.updated_at),
    raw: input,
  };
}

function normalizeDestination(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? "",
    name: optionalString(input.name) ?? "",
    type: readNullableString(input.type),
    config: optionalRecord(input.config) ?? {},
    disabledAt: readNullableString(input.disabled_at),
    createdAt: readNullableString(input.created_at),
    updatedAt: readNullableString(input.updated_at),
    raw: input,
  };
}

function readModels(input: Record<string, unknown>): unknown[] {
  return Array.isArray(input.models) ? input.models : [];
}

function asHookdeckObject(value: unknown, message = "Hookdeck response"): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${message} did not include an object`, value);
  }
  return object;
}

function readPathSegment(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(text);
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return optionalString(value) ?? null;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}
