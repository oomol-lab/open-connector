import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "lokalise";
const lokaliseApiBaseUrl = "https://api.lokalise.com/api2";

type LokaliseRequestMode = "validate" | "execute";
type LokaliseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lokaliseActionHandlers: ProviderActionHandlers<"lokalise", LokaliseActionHandler> = {
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  list_project_languages(input, context) {
    return listProjectLanguages(input, context);
  },
  list_keys(input, context) {
    return listKeys(input, context);
  },
  create_keys(input, context) {
    return createKeys(input, context);
  },
  get_key(input, context) {
    return getKey(input, context);
  },
  update_key(input, context) {
    return updateKey(input, context);
  },
  delete_key(input, context) {
    return deleteKey(input, context);
  },
  list_translations(input, context) {
    return listTranslations(input, context);
  },
  get_translation(input, context) {
    return getTranslation(input, context);
  },
  update_translation(input, context) {
    return updateTranslation(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lokaliseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = requireLokaliseApiKey(input.apiKey);
    const response = await requestLokalise(
      "projects",
      {
        query: {
          limit: 1,
        },
      },
      { apiKey, fetcher, signal },
      "validate",
    );
    const payload = readObject(response.payload, "Lokalise returned invalid projects payload");
    const projects = readArray(payload.projects, "Lokalise returned invalid projects list");
    const firstProject = optionalRecord(projects[0]);
    const firstProjectId = optionalString(firstProject?.project_id);
    const firstProjectName = optionalString(firstProject?.name);

    return {
      profile: {
        accountId: firstProjectId ?? service,
        displayName: firstProjectName ?? "Lokalise API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: lokaliseApiBaseUrl,
        validationEndpoint: "/projects",
        firstProjectId,
        firstProjectName,
        totalProjects: response.totalCount,
      }),
    };
  },
};

async function listProjects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestLokalise(
    "projects",
    {
      query: pickQuery(input, [
        "filter_team_id",
        "filter_names",
        "include_statistics",
        "include_settings",
        "limit",
        "page",
      ]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid projects payload");
  return compactObject({
    projects: readArray(payload.projects, "Lokalise returned invalid projects list"),
    totalCount: response.totalCount,
  });
}

async function getProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const response = await requestLokalise(`projects/${encodeURIComponent(projectId)}`, {}, context, "execute");
  return {
    project: readObject(response.payload, "Lokalise returned invalid project payload"),
  };
}

async function listProjectLanguages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/languages`,
    {
      query: pickQuery(input, ["limit", "page"]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid languages payload");
  return compactObject({
    projectId: optionalString(payload.project_id) ?? projectId,
    languages: readArray(payload.languages, "Lokalise returned invalid languages list"),
    totalCount: response.totalCount,
  });
}

async function listKeys(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/keys`,
    {
      query: pickQuery(input, [
        "disable_references",
        "include_comments",
        "include_screenshots",
        "include_translations",
        "filter_translation_lang_ids",
        "filter_tags",
        "filter_filenames",
        "filter_keys",
        "filter_key_ids",
        "filter_platforms",
        "filter_untranslated",
        "filter_qa_issues",
        "filter_archived",
        "limit",
        "page",
      ]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid keys payload");
  return compactObject({
    projectId: optionalString(payload.project_id) ?? projectId,
    keys: readArray(payload.keys, "Lokalise returned invalid keys list"),
    totalCount: response.totalCount,
  });
}

async function createKeys(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/keys`,
    {
      method: "POST",
      body: pickBody(input, ["keys", "use_automations"]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid created keys payload");
  return {
    projectId: optionalString(payload.project_id) ?? projectId,
    keys: readArray(payload.keys, "Lokalise returned invalid created keys list"),
  };
}

async function getKey(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const keyId = readRequiredInteger(input.key_id, "key_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/keys/${keyId}`,
    {
      query: pickQuery(input, ["disable_references"]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid key payload");
  return {
    projectId: optionalString(payload.project_id) ?? projectId,
    key: readObject(payload.key, "Lokalise returned invalid key object"),
  };
}

async function updateKey(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const keyId = readRequiredInteger(input.key_id, "key_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/keys/${keyId}`,
    {
      method: "PUT",
      body: pickBody(input, [
        "key_name",
        "description",
        "platforms",
        "filenames",
        "tags",
        "merge_tags",
        "is_plural",
        "plural_name",
        "is_hidden",
        "is_archived",
        "context",
        "char_limit",
        "custom_attributes",
      ]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid updated key payload");
  return {
    projectId: optionalString(payload.project_id) ?? projectId,
    key: readObject(payload.key, "Lokalise returned invalid updated key object"),
  };
}

async function deleteKey(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const keyId = readRequiredInteger(input.key_id, "key_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/keys/${keyId}`,
    {
      method: "DELETE",
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid delete key payload");
  return {
    projectId: optionalString(payload.project_id) ?? projectId,
    keyRemoved: payload.key_removed === true,
    keysLocked: optionalInteger(payload.keys_locked) ?? 0,
  };
}

async function listTranslations(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/translations`,
    {
      query: pickQuery(input, [
        "disable_references",
        "filter_lang_id",
        "filter_is_reviewed",
        "filter_unverified",
        "filter_untranslated",
        "filter_qa_issues",
        "filter_active_task_id",
        "limit",
        "page",
      ]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid translations payload");
  return compactObject({
    projectId: optionalString(payload.project_id) ?? projectId,
    translations: readArray(payload.translations, "Lokalise returned invalid translations list"),
    totalCount: response.totalCount,
  });
}

async function getTranslation(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const translationId = readRequiredInteger(input.translation_id, "translation_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/translations/${translationId}`,
    {
      query: pickQuery(input, ["disable_references"]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid translation payload");
  return {
    projectId: optionalString(payload.project_id) ?? projectId,
    translation: readObject(payload.translation, "Lokalise returned invalid translation object"),
  };
}

async function updateTranslation(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const projectId = readRequiredString(input.project_id, "project_id is required");
  const translationId = readRequiredInteger(input.translation_id, "translation_id is required");
  const response = await requestLokalise(
    `projects/${encodeURIComponent(projectId)}/translations/${translationId}`,
    {
      method: "PUT",
      body: pickBody(input, ["translation", "is_unverified", "is_reviewed", "custom_translation_status_ids"]),
    },
    context,
    "execute",
  );
  const payload = readObject(response.payload, "Lokalise returned invalid updated translation payload");
  return {
    projectId: optionalString(payload.project_id) ?? projectId,
    translation: readObject(payload.translation, "Lokalise returned invalid updated translation object"),
  };
}

async function requestLokalise(
  path: string,
  input: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  mode: LokaliseRequestMode,
): Promise<{ payload: unknown; totalCount?: number }> {
  const url = new URL(path, `${lokaliseApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, formatQueryValue(value));
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-token": context.apiKey,
  };
  const method = input.method ?? "GET";
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
    payload = await readLokalisePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lokalise request failed: ${error.message}` : "Lokalise request failed.",
    );
  }

  if (!response.ok) {
    throw createLokaliseError(response, payload, mode);
  }

  return {
    payload,
    totalCount: readTotalCount(response.headers),
  };
}

async function readLokalisePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return undefined;
  }

  if (!response.headers.get("content-type")?.includes("json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, input[key]]));
}

function pickBody(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, input[key]] as const).filter(([, value]) => value !== undefined));
}

function formatQueryValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

function readTotalCount(headers: Headers): number | undefined {
  const header = headers.get("x-total-count") ?? headers.get("x-pagination-total-count");
  if (!header) {
    return undefined;
  }

  const parsed = Number(header);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function requireLokaliseApiKey(value: string): string {
  const apiKey = value.trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "Lokalise API token is required.");
  }
  return apiKey;
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

function readRequiredInteger(value: unknown, message: string): number {
  const integerValue = optionalInteger(value);
  if (integerValue === undefined) {
    throw new ProviderRequestError(400, message, value);
  }
  return integerValue;
}

function readRequiredString(value: unknown, message: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, message, value);
  }
  return stringValue;
}

function createLokaliseError(response: Response, payload: unknown, mode: LokaliseRequestMode): ProviderRequestError {
  const status = response.status;
  const message = extractLokaliseErrorMessage(payload) ?? `Lokalise request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractLokaliseErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload || undefined;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  for (const key of ["message", "error_description", "error"]) {
    const value = object[key];
    if (typeof value === "string" && value) {
      return value;
    }
    const nested = optionalRecord(value);
    const nestedMessage = optionalString(nested?.message);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return undefined;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.lokalise.com/api2",
  auth: { type: "api_key_header", name: "x-api-token" },
});
