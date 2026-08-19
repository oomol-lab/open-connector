import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const planeCloudApiBaseUrl = "https://api.plane.so";

interface PlaneContext {
  apiKey: string;
  apiBaseUrl?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type PlaneHandler = (input: Record<string, unknown>, context: PlaneContext) => Promise<unknown>;

export const planeActionHandlers: ProviderActionHandlers<"plane", PlaneHandler> = {
  get_current_user(input, context) {
    return requestSingleItem(input, context, "/api/v1/users/me/");
  },
  list_projects(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    return requestPlane(
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/`,
      readPaginationQuery(input),
    );
  },
  get_project(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    const projectId = requiredString(input.project_id, "project_id");
    return requestSingleItem(
      input,
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/`,
    );
  },
  list_work_items(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    const projectId = requiredString(input.project_id, "project_id");
    return requestPlane(
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/work-items/`,
      {
        ...readPaginationQuery(input),
        external_id: optionalString(input.external_id),
        external_source: optionalString(input.external_source),
      },
    );
  },
  get_work_item(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    const projectId = requiredString(input.project_id, "project_id");
    const workItemId = requiredString(input.work_item_id, "work_item_id");
    return requestSingleItem(
      input,
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/work-items/${encodePath(workItemId)}/`,
      {
        fields: optionalString(input.fields),
        expand: optionalString(input.expand),
        order_by: optionalString(input.order_by),
        external_id: optionalString(input.external_id),
        external_source: optionalString(input.external_source),
      },
    );
  },
  create_work_item(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    const projectId = requiredString(input.project_id, "project_id");
    return requestSingleItem(
      input,
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/work-items/`,
      undefined,
      "POST",
      buildWorkItemBody(input),
    );
  },
  update_work_item(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    const projectId = requiredString(input.project_id, "project_id");
    const workItemId = requiredString(input.work_item_id, "work_item_id");
    return requestSingleItem(
      input,
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/work-items/${encodePath(workItemId)}/`,
      undefined,
      "PATCH",
      buildWorkItemBody(input),
    );
  },
  async delete_work_item(input, context) {
    const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
    const projectId = requiredString(input.project_id, "project_id");
    const workItemId = requiredString(input.work_item_id, "work_item_id");
    await requestPlane(
      context,
      `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/work-items/${encodePath(workItemId)}/`,
      undefined,
      "DELETE",
    );
    return { deleted: true };
  },
  list_states(input, context) {
    return requestProjectScopedList(input, context, "states");
  },
  list_labels(input, context) {
    return requestProjectScopedList(input, context, "labels");
  },
  async list_project_members(input, context) {
    const payload = await requestProjectScopedList(input, context, "project-members");
    if (Array.isArray(payload)) {
      return { members: payload.flatMap((item) => (Array.isArray(item) ? item : [item])) };
    }
    if (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).results)) {
      return { members: (payload as Record<string, unknown>).results };
    }
    return { members: [] };
  },
};

export async function validatePlaneCredential(
  apiKey: string,
  apiBaseUrl: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const baseUrl = normalizePlaneApiBaseUrl(apiBaseUrl);
  const payload = await requestPlane(
    { apiKey, apiBaseUrl: baseUrl, fetcher, signal },
    "/api/v1/users/me/",
    undefined,
    "GET",
    undefined,
    "validate",
  );
  const user = readObject(payload);
  const accountId = optionalString(user.id) ?? "api_key";
  const fullName = [optionalString(user.first_name), optionalString(user.last_name)].filter(Boolean).join(" ");
  const displayName = optionalString(user.display_name) ?? optionalString(user.email) ?? fullName;
  return {
    profile: { accountId, displayName: displayName || "Plane API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: baseUrl,
      userId: optionalString(user.id),
      email: optionalString(user.email),
    }),
  };
}

function requestProjectScopedList(
  input: Record<string, unknown>,
  context: PlaneContext,
  resource: string,
): Promise<unknown> {
  const workspaceSlug = requiredString(input.workspace_slug, "workspace_slug");
  const projectId = requiredString(input.project_id, "project_id");
  return requestPlane(
    context,
    `/api/v1/workspaces/${encodePath(workspaceSlug)}/projects/${encodePath(projectId)}/${resource}/`,
    readPaginationQuery(input),
  );
}

async function requestSingleItem(
  _input: Record<string, unknown>,
  context: PlaneContext,
  path: string,
  query?: Record<string, string | undefined>,
  method = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  return { item: readObject(await requestPlane(context, path, query, method, body)) };
}

async function requestPlane(
  context: PlaneContext,
  path: string,
  query?: Record<string, string | undefined>,
  method = "GET",
  body?: Record<string, unknown>,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildPlaneUrl(normalizePlaneApiBaseUrl(context.apiBaseUrl), path, query), {
      method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": context.apiKey,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `plane request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }
  const payload = await readPlanePayload(response);
  if (!response.ok) {
    throw mapPlaneError(response.status, readPlaneErrorMessage(payload), phase);
  }
  return payload;
}

async function readPlanePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "plane returned malformed JSON");
    }
    return { detail: text };
  }
}

function mapPlaneError(status: number, message: string, phase: "validate" | "execute"): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 400 && status < 500 ? 400 : 502, message);
}

function buildPlaneUrl(baseUrl: string, path: string, query: Record<string, string | undefined> = {}): string {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function readPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    cursor: optionalString(input.cursor),
    per_page:
      typeof input.per_page === "number" && Number.isInteger(input.per_page) ? String(input.per_page) : undefined,
    fields: optionalString(input.fields),
    expand: optionalString(input.expand),
    order_by: optionalString(input.order_by),
  };
}

function buildWorkItemBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    assignees: input.assignees,
    labels: input.labels,
    type_id: input.type_id,
    parent: input.parent,
    deleted_at: input.deleted_at,
    point: input.point,
    name: input.name,
    description_html: input.description_html,
    description_stripped: input.description_stripped,
    priority: input.priority,
    start_date: input.start_date,
    target_date: input.target_date,
    sequence_id: input.sequence_id,
    sort_order: input.sort_order,
    completed_at: input.completed_at,
    archived_at: input.archived_at,
    last_activity_at: input.last_activity_at,
    is_draft: input.is_draft,
    external_source: input.external_source,
    external_id: input.external_id,
    created_by: input.created_by,
    state: input.state,
    estimate_point: input.estimate_point,
    type: input.type,
  });
}

function normalizePlaneApiBaseUrl(value: unknown): string {
  const input = typeof value === "string" && value.trim() ? value.trim() : planeCloudApiBaseUrl;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid http(s) URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid http(s) URL");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new ProviderRequestError(400, "apiBaseUrl must be an origin without a path");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, "plane returned an unexpected response");
  }
  return value as Record<string, unknown>;
}

function readPlaneErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    return (
      optionalString(record.detail) ??
      optionalString(record.error) ??
      optionalString(record.message) ??
      "Plane API request failed"
    );
  }
  return "Plane API request failed";
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}
