import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const bugHerdApiBaseUrl = "https://www.bugherd.com";

type BugHerdPhase = "validate" | "execute";
type BugHerdQuery = Record<string, string | number | boolean | undefined>;
type BugHerdActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BugHerdActionHandler = (input: Record<string, unknown>, context: BugHerdActionContext) => Promise<unknown>;

export const bugHerdActionHandlers: ProviderActionHandlers<"bug_herd", BugHerdActionHandler> = {
  show_organization(_input, context) {
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: "/api_v2/organization.json",
      phase: "execute",
    });
  },
  list_projects(input, context) {
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: "/api_v2/projects.json",
      query: {
        page: readOptionalPositiveInteger(input.page, "page"),
      },
      phase: "execute",
    });
  },
  list_active_projects(input, context) {
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: "/api_v2/projects/active.json",
      query: {
        page: readOptionalPositiveInteger(input.page, "page"),
      },
      phase: "execute",
    });
  },
  get_project(input, context) {
    const projectId = readRequiredPositiveInteger(input.project_id, "project_id");
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: `/api_v2/projects/${projectId}.json`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_project(input, context) {
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: "/api_v2/projects.json",
      body: {
        project: compactObject({
          name: readRequiredString(input.name, "name"),
          devurl: readRequiredString(input.devurl, "devurl"),
          is_active: readOptionalBoolean(input.is_active),
          is_public: readOptionalBoolean(input.is_public),
          guests_see_guests: readOptionalBoolean(input.guests_see_guests),
        }),
      },
      phase: "execute",
    });
  },
  update_project(input, context) {
    const projectId = readRequiredPositiveInteger(input.project_id, "project_id");
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "PUT",
      path: `/api_v2/projects/${projectId}.json`,
      body: {
        project: compactObject({
          name: readOptionalString(input.name),
          devurl: readOptionalString(input.devurl),
          is_active: readOptionalBoolean(input.is_active),
          is_public: readOptionalBoolean(input.is_public),
          has_custom_columns: readOptionalBoolean(input.has_custom_columns),
          guests_see_guests: readOptionalBoolean(input.guests_see_guests),
        }),
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_project_tasks(input, context) {
    const projectId = readRequiredPositiveInteger(input.project_id, "project_id");
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: `/api_v2/projects/${projectId}/tasks.json`,
      query: compactObject({
        updated_since: readOptionalString(input.updated_since),
        created_since: readOptionalString(input.created_since),
        status: readOptionalString(input.status),
        priority: readOptionalString(input.priority),
        tag: readOptionalString(input.tag),
        assigned_to_id: readOptionalPositiveInteger(input.assigned_to_id, "assigned_to_id"),
        external_id: readOptionalString(input.external_id),
        page: readOptionalPositiveInteger(input.page, "page"),
      }),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_task(input, context) {
    const { projectId, taskId } = readProjectTaskIds(input);
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: `/api_v2/projects/${projectId}/tasks/${taskId}.json`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_task(input, context) {
    const projectId = readRequiredPositiveInteger(input.project_id, "project_id");
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/api_v2/projects/${projectId}/tasks.json`,
      body: {
        task: buildTaskBody(input, { requireDescription: true }),
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  update_task(input, context) {
    const { projectId, taskId } = readProjectTaskIds(input);
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "PUT",
      path: `/api_v2/projects/${projectId}/tasks/${taskId}.json`,
      body: {
        task: buildTaskBody(input, { requireDescription: false }),
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_comments(input, context) {
    const { projectId, taskId } = readProjectTaskIds(input);
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: `/api_v2/projects/${projectId}/tasks/${taskId}/comments.json`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_comment(input, context) {
    const { projectId, taskId } = readProjectTaskIds(input);
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/api_v2/projects/${projectId}/tasks/${taskId}/comments.json`,
      body: {
        comment: compactObject({
          text: readRequiredString(input.text, "text"),
          user_id: readOptionalPositiveInteger(input.user_id, "user_id"),
          email: readOptionalString(input.email),
          is_private: readOptionalBoolean(input.is_private),
        }),
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_attachments(input, context) {
    const { projectId, taskId } = readProjectTaskIds(input);
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: `/api_v2/projects/${projectId}/tasks/${taskId}/attachments.json`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_attachment_from_url(input, context) {
    const { projectId, taskId } = readProjectTaskIds(input);
    const url = assertPublicHttpUrl(readRequiredString(input.url, "url"), {
      fieldName: "url",
      createError: (message) => new ProviderRequestError(400, message),
    }).toString();
    return requestBugHerdJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: `/api_v2/projects/${projectId}/tasks/${taskId}/attachments.json`,
      body: {
        attachment: {
          file_name: readRequiredString(input.file_name, "file_name"),
          url,
        },
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
  },
};

export async function validateBugHerdCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBugHerdJson({
    apiKey: readRequiredString(apiKey, "apiKey"),
    fetcher,
    signal,
    method: "GET",
    path: "/api_v2/organization.json",
    phase: "validate",
  });
  const organization = optionalRecord(payload.organization);
  const organizationId = readResponseId(organization?.id);
  const organizationName = optionalString(organization?.name);

  return {
    profile: {
      accountId: organizationId,
      displayName: organizationName ?? "BugHerd Organization",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: bugHerdApiBaseUrl,
      validationEndpoint: "/api_v2/organization.json",
      organization_id: organizationId,
      organization_name: organizationName,
    }),
  };
}

async function requestBugHerdJson(input: {
  apiKey: string;
  fetcher: ProviderFetch;
  method: "GET" | "POST" | "PUT";
  path: string;
  phase: BugHerdPhase;
  query?: BugHerdQuery;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(buildBugHerdUrl(input.path, input.query), {
      method: input.method,
      headers: buildBugHerdHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readBugHerdPayload(response);

    if (!response.ok) {
      throw createBugHerdError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
    }

    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "BugHerd returned an invalid payload", payload);
    }
    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "BugHerd request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BugHerd request failed: ${error.message}` : "BugHerd request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBugHerdUrl(path: string, query: BugHerdQuery = {}): string {
  const url = new URL(path, bugHerdApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildBugHerdHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
    "User-Agent": providerUserAgent,
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readBugHerdPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "BugHerd returned invalid JSON", text);
  }
}

function createBugHerdError(
  status: number,
  payload: unknown,
  phase: BugHerdPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractBugHerdErrorMessage(payload) ?? `BugHerd request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractBugHerdErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const candidates = [
    object.error,
    object.message,
    object.errors,
    optionalRecord(object.meta)?.error,
    optionalRecord(object.meta)?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.map(String).join(", ");
    }
  }
  return undefined;
}

function buildTaskBody(
  input: Record<string, unknown>,
  options: { requireDescription: boolean },
): Record<string, unknown> {
  return compactObject({
    description: options.requireDescription
      ? readRequiredString(input.description, "description")
      : readOptionalString(input.description),
    priority: readOptionalString(input.priority),
    status: readOptionalString(input.status),
    requester_id: readOptionalPositiveInteger(input.requester_id, "requester_id"),
    requester_email: readOptionalString(input.requester_email),
    assigned_to_id: readOptionalNullablePositiveInteger(input.assigned_to_id, "assigned_to_id"),
    assigned_to_email: readOptionalString(input.assigned_to_email),
    unassign_user: readOptionalPositiveInteger(input.unassign_user, "unassign_user"),
    tag_names: readOptionalStringArray(input.tag_names, "tag_names"),
    external_id: readOptionalString(input.external_id),
    site: readOptionalString(input.site),
    url: readOptionalString(input.url),
    updater_email: readOptionalString(input.updater_email),
  });
}

function readProjectTaskIds(input: Record<string, unknown>): { projectId: number; taskId: number } {
  return {
    projectId: readRequiredPositiveInteger(input.project_id, "project_id"),
    taskId: readRequiredPositiveInteger(input.task_id, "task_id"),
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return readRequiredPositiveInteger(value, fieldName);
}

function readOptionalNullablePositiveInteger(value: unknown, fieldName: string): number | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalPositiveInteger(value, fieldName);
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`, value);
  }
  return value;
}

function readResponseId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}
