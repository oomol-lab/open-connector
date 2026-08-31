import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ClickhelpActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  basicAuthorizationHeader,
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
}

import { createHash } from "node:crypto";

export interface ClickhelpCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ClickhelpActionInput extends ApiKeyProviderActionInput {
  readonly actionName: ClickhelpActionName;
  readonly input: Record<string, unknown>;
}

interface ClickhelpCredential {
  readonly apiKey: string;
  readonly login: string;
  readonly apiBaseUrl: string;
}

interface ClickhelpRequest {
  readonly credential: ClickhelpCredential;
  readonly path: string;
  readonly fetcher: typeof fetch;
  readonly phase: "execute" | "validate";
  readonly method?: "GET" | "PATCH" | "POST";
  readonly query?: Record<string, unknown>;
  readonly jsonBody?: Record<string, unknown>;
}

type ClickhelpActionHandler = (input: ClickhelpActionInput, fetcher: typeof fetch) => Promise<unknown>;

const clickhelpRequestTimeoutMs = 60_000;

export const clickhelpActionHandlers: ProviderActionHandlers<"clickhelp", ClickhelpActionHandler> = {
  async list_projects(input, fetcher) {
    const projects = requireObjectArray(
      await requestActionJson(input, fetcher, "projects", {
        query: compactObject({
          types: input.input.type,
          parentId: input.input.parentId,
        }),
      }),
      "project list",
    );
    return { projects };
  },

  async get_project(input, fetcher) {
    const projectId = requireString(input.input.projectId, "projectId");
    const project = requireObject(
      await requestActionJson(input, fetcher, entityPath("projects", projectId)),
      "project",
    );
    return { project };
  },

  async list_topics(input, fetcher) {
    const projectId = requireString(input.input.projectId, "projectId");
    const topics = requireObjectArray(
      await requestActionJson(input, fetcher, `${entityPath("projects", projectId)}/articles`, {
        query: compactObject({
          q: input.input.query,
          isReturnSnippets: input.input.returnSnippets,
          count: input.input.count,
          format: input.input.format,
        }),
      }),
      "topic list",
    );
    return { topics };
  },

  async get_topic(input, fetcher) {
    const projectId = requireString(input.input.projectId, "projectId");
    const topicId = requireString(input.input.topicId, "topicId");
    const topic = requireObject(
      await requestActionJson(
        input,
        fetcher,
        `${entityPath("projects", projectId)}/${entityPath("articles", topicId)}`,
        { query: compactObject({ format: input.input.format }) },
      ),
      "topic",
    );
    return { topic };
  },

  async create_topic(input, fetcher) {
    const projectId = requireString(input.input.projectId, "projectId");
    const topic = requireObject(
      await requestActionJson(input, fetcher, `${entityPath("projects", projectId)}/articles`, {
        method: "POST",
        jsonBody: compactObject({
          id: input.input.topicId,
          title: input.input.title,
          body: input.input.body,
          assigneeUserName: input.input.assigneeUserName,
          ownerUserName: input.input.ownerUserName,
          statusName: input.input.statusName,
          isShowInToc: input.input.showInToc,
          parentTocNodeId: input.input.parentTocNodeId,
          tocNodeCaption: input.input.tocNodeCaption,
          tocNodeOrdinalNo: input.input.tocNodeOrdinalNo,
          indexKeywords: input.input.indexKeywords,
        }),
      }),
      "created topic",
    );
    return { topic };
  },

  async update_topic(input, fetcher) {
    const projectId = requireString(input.input.projectId, "projectId");
    const topicId = requireString(input.input.topicId, "topicId");
    const fields = ["assigneeUserName", "body", "ownerUserName", "statusName", "title", "indexKeywords"].filter(
      (field) => input.input[field] !== undefined,
    );
    if (fields.length === 0) {
      throw new ProviderRequestError(400, "provide at least one topic field to update");
    }
    const topic = requireObject(
      await requestActionJson(
        input,
        fetcher,
        `${entityPath("projects", projectId)}/${entityPath("articles", topicId)}`,
        {
          method: "PATCH",
          jsonBody: compactObject({
            updatedFields: fields.join(","),
            title: input.input.title,
            body: input.input.body,
            assigneeUserName: input.input.assigneeUserName,
            ownerUserName: input.input.ownerUserName,
            statusName: input.input.statusName,
            indexKeywords: input.input.indexKeywords,
          }),
        },
      ),
      "updated topic",
    );
    return { topic };
  },

  async search_portal(input, fetcher) {
    const topics = requireObjectArray(
      await requestActionJson(input, fetcher, "search", {
        query: compactObject({
          q: input.input.query,
          count: input.input.count,
          projectIds: Array.isArray(input.input.projectIds) ? input.input.projectIds.join(",") : undefined,
          lang: input.input.language,
          isReturnSnippets: input.input.returnSnippets,
          format: input.input.format,
        }),
      }),
      "portal search",
    );
    return { topics };
  },
};

export async function validateClickhelpCredential(
  input: { apiKey?: string; login?: unknown; portalUrl?: unknown },
  fetcher: typeof fetch,
): Promise<ClickhelpCredentialCheck> {
  const credential = resolveClickhelpCredential(input.apiKey, input.login, input.portalUrl);
  const user = requireObject(
    await requestClickhelpJson({
      credential,
      path: entityPath("users", credential.login),
      phase: "validate",
      fetcher,
    }),
    "user profile",
  );
  const userName = optionalString(user.userName) ?? credential.login;
  const portalHost = new URL(credential.apiBaseUrl).hostname;

  return {
    providerAccountId: `clickhelp:${createHash("sha256").update(`${portalHost}:${userName}`).digest("hex").slice(0, 24)}`,
    accountLabel: `${userName} @ ${portalHost}`,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: credential.apiBaseUrl,
      portalUrl: new URL("/", credential.apiBaseUrl).origin,
      login: credential.login,
      userType: optionalString(user.userType),
      validationEndpoint: `/users/${encodeURIComponent(credential.login)}`,
    },
  };
}

export async function executeClickhelpAction(input: ClickhelpActionInput, fetcher: typeof fetch): Promise<unknown> {
  return clickhelpActionHandlers[input.actionName](input, fetcher);
}

async function requestActionJson(
  input: ClickhelpActionInput,
  fetcher: typeof fetch,
  path: string,
  options: Pick<ClickhelpRequest, "method" | "query" | "jsonBody"> = {},
) {
  const credential = resolveActionCredential(input);
  return requestClickhelpJson({
    credential,
    path,
    fetcher,
    phase: "execute",
    ...options,
  });
}

async function requestClickhelpJson(input: ClickhelpRequest) {
  const url = new URL(trimLeadingSlash(input.path), input.credential.apiBaseUrl);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }
  const timeout = createProviderTimeout(undefined, clickhelpRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: basicAuthorizationHeader(`${input.credential.login}:${input.credential.apiKey}`),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.jsonBody ? JSON.stringify(input.jsonBody) : undefined,
      signal: timeout.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw mapClickhelpError(response.status, readErrorMessage(payload), input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ClickHelp request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "ClickHelp request failed");
  } finally {
    timeout.cleanup();
  }
}

export function normalizeClickhelpApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "portalUrl is required");
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") {
      throw new ProviderRequestError(400, "portalUrl must use HTTPS");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new ProviderRequestError(400, "portalUrl must not include credentials, query parameters, or a fragment");
    }
    url.pathname = "/api/v2/";
    return url.toString();
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(400, "portalUrl must be a valid HTTPS URL");
  }
}

function resolveActionCredential(input: ClickhelpActionInput) {
  return resolveClickhelpCredential(
    requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    input.providerMetadata?.login ?? input.values?.login,
    input.providerMetadata?.apiBaseUrl ?? input.values?.portalUrl,
  );
}

function resolveClickhelpCredential(apiKeyInput: string | undefined, loginInput: unknown, portalUrlInput: unknown) {
  const apiKey = requiredString(apiKeyInput, "apiKey", (message) => new ProviderRequestError(400, message)).trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  const login = requireString(loginInput, "login");
  const credential: ClickhelpCredential = {
    apiKey,
    login,
    apiBaseUrl: normalizeClickhelpApiBaseUrl(portalUrlInput),
  };
  return credential;
}

function mapClickhelpError(status: number, message: string, phase: ClickhelpRequest["phase"]) {
  if (phase === "validate" && (status === 401 || status === 403 || status === 404)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if ([400, 403, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ClickHelp returned invalid JSON");
  }
}

function readErrorMessage(payload: unknown) {
  const object = optionalRecord(payload);
  return (
    optionalString(object?.Message)?.trim() || optionalString(object?.message)?.trim() || "ClickHelp request failed"
  );
}

function requireObject(value: unknown, label: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `ClickHelp returned an invalid ${label}`);
  }
  return object;
}

function requireObjectArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item))) {
    throw new ProviderRequestError(502, `ClickHelp returned an invalid ${label}`);
  }
  return value as Record<string, unknown>[];
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function entityPath(collection: "articles" | "projects" | "users", id: string) {
  return `${collection}/${encodeURIComponent(id)}`;
}

function trimLeadingSlash(value: string) {
  return value.startsWith("/") ? value.slice(1) : value;
}
