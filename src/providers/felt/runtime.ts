import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FeltActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const feltApiBaseUrl = "https://felt.com/api/v2";

type FeltRequestPhase = "validate" | "execute";
type FeltRequestMethod = "GET" | "POST" | "DELETE";

export const feltActionHandlers: Record<FeltActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  create_project(input, context) {
    return writeProject("/projects", buildProjectBody(input), context);
  },
  get_project(input, context) {
    return getProject(String(input.project_id), context);
  },
  update_project(input, context) {
    return writeProject(
      `/projects/${encodeURIComponent(String(input.project_id))}/update`,
      buildProjectBody(input),
      context,
    );
  },
  delete_project(input, context) {
    return deleteFeltObject("project", String(input.project_id), context);
  },
  create_map(input, context) {
    return writeMap("/maps", buildCreateMapBody(input), context);
  },
  get_map(input, context) {
    return getMap(String(input.map_id), context);
  },
  update_map(input, context) {
    return writeMap(`/maps/${encodeURIComponent(String(input.map_id))}/update`, buildUpdateMapBody(input), context);
  },
  duplicate_map(input, context) {
    return writeMap(
      `/maps/${encodeURIComponent(String(input.map_id))}/duplicate`,
      buildDuplicateMapBody(input),
      context,
    );
  },
  move_map(input, context) {
    return writeMap(`/maps/${encodeURIComponent(String(input.map_id))}/move`, buildMoveMapBody(input), context);
  },
  delete_map(input, context) {
    return deleteFeltObject("map", String(input.map_id), context);
  },
};

export async function validateFeltCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await fetchCurrentUser({ apiKey, fetcher, signal }, "validate");
  const userId = optionalString(user.id);
  const userName = optionalString(user.name);
  const userEmail = optionalString(user.email);

  return {
    profile: {
      accountId: userId ?? "felt",
      displayName: userName ?? userEmail ?? "Felt API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: feltApiBaseUrl,
      validationEndpoint: "/user",
      userId,
      userName,
      userEmail,
    }),
  };
}

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const user = await fetchCurrentUser(context, "execute");
  return { user };
}

async function fetchCurrentUser(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: FeltRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestFelt({ method: "GET", path: "/user" }, context, phase);
  return readObject(payload, "Felt returned invalid user payload");
}

async function listProjects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestFelt(
    {
      method: "GET",
      path: "/projects",
      query: compactObject({
        workspace_id: optionalString(input.workspace_id),
      }),
    },
    context,
    "execute",
  );

  return {
    projects: readArray(payload, "Felt returned invalid project list payload"),
  };
}

async function getProject(projectId: string, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestFelt(
    { method: "GET", path: `/projects/${encodeURIComponent(projectId)}` },
    context,
    "execute",
  );
  return {
    project: readObject(payload, "Felt returned invalid project payload"),
  };
}

async function writeProject(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await requestFelt({ method: "POST", path, body }, context, "execute");
  return {
    project: readObject(payload, "Felt returned invalid project payload"),
  };
}

async function getMap(mapId: string, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestFelt({ method: "GET", path: `/maps/${encodeURIComponent(mapId)}` }, context, "execute");
  return {
    map: readObject(payload, "Felt returned invalid map payload"),
  };
}

async function writeMap(path: string, body: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestFelt({ method: "POST", path, body }, context, "execute");
  return {
    map: readObject(payload, "Felt returned invalid map payload"),
  };
}

async function deleteFeltObject(
  object: "project" | "map",
  id: string,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const path = object === "project" ? `/projects/${encodeURIComponent(id)}` : `/maps/${encodeURIComponent(id)}`;
  await requestFelt({ method: "DELETE", path }, context, "execute");
  return {
    id,
    object,
    deleted: true,
  };
}

async function requestFelt(
  input: {
    method: FeltRequestMethod;
    path: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: FeltRequestPhase,
): Promise<unknown> {
  const url = new URL(`${feltApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: feltHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
    payload = await readFeltPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Felt request failed: ${error.message}` : "Felt request failed",
    );
  }

  if (!response.ok) {
    throw createFeltError(response, payload, phase);
  }
  return payload;
}

function buildProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    visibility: optionalString(input.visibility),
    max_inherited_permission: optionalString(input.max_inherited_permission),
  });
}

function buildCreateMapBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: optionalString(input.title),
    description: optionalString(input.description),
    public_access: optionalString(input.public_access),
    basemap: optionalString(input.basemap),
    lat: optionalNumber(input.lat),
    lon: optionalNumber(input.lon),
    zoom: optionalNumber(input.zoom),
    workspace_id: optionalString(input.workspace_id),
    layer_urls: Array.isArray(input.layer_urls) ? input.layer_urls : undefined,
  });
}

function buildUpdateMapBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: optionalString(input.title),
    description: optionalString(input.description),
    public_access: optionalString(input.public_access),
    basemap: optionalString(input.basemap),
    table_settings: optionalRecord(input.table_settings),
    viewer_permissions: optionalRecord(input.viewer_permissions),
  });
}

function buildDuplicateMapBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: optionalString(input.title),
    destination: optionalRecord(input.destination),
  });
}

function buildMoveMapBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    project_id: optionalString(input.project_id),
    folder_id: optionalString(input.folder_id),
  });
}

function feltHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readFeltPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Felt returned invalid JSON");
  }
}

function createFeltError(response: Response, payload: unknown, phase: FeltRequestPhase): ProviderRequestError {
  const message = readFeltErrorMessage(payload) ?? `Felt request failed with ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function readFeltErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return optionalString(firstError?.detail) ?? optionalString(firstError?.title) ?? optionalString(object?.message);
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message, value);
  }
  return object;
}

function readArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value;
}
