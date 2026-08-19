import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "label_studio";
const labelStudioValidationPath = "/api/current-user/whoami";
const labelStudioDefaultRequestTimeoutMs = 30_000;

type LabelStudioPhase = "validate" | "execute";
type LabelStudioMethod = "GET" | "POST";

interface LabelStudioContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type LabelStudioActionHandler = (input: Record<string, unknown>, context: LabelStudioContext) => Promise<unknown>;

export const labelStudioActionHandlers: ProviderActionHandlers<"label_studio", LabelStudioActionHandler> = {
  async get_current_user(_input, context) {
    const user = requiredRecord(
      await requestLabelStudioJson({
        ...context,
        path: labelStudioValidationPath,
        phase: "execute",
      }),
      "Label Studio user",
      providerResponseError,
    );

    return { user };
  },
  async list_projects(input, context) {
    const payload = requiredRecord(
      await requestLabelStudioJson({
        ...context,
        path: "/api/projects/",
        query: compactObject({
          page: optionalInteger(input.page),
          page_size: optionalInteger(input.pageSize),
          archived: optionalBoolean(input.archived),
          filter: optionalString(input.filter),
          ids: optionalString(input.ids),
          include: optionalString(input.include),
          members_limit: optionalInteger(input.membersLimit),
          ordering: optionalString(input.ordering),
          search: optionalString(input.search),
          state: optionalString(input.state),
          title: optionalString(input.title),
          workspaces: optionalInteger(input.workspace),
        }),
        phase: "execute",
      }),
      "Label Studio project list",
      providerResponseError,
    );

    return normalizePaginatedList(payload, "projects");
  },
  async get_project(input, context) {
    const project = requiredRecord(
      await requestLabelStudioJson({
        ...context,
        path: `/api/projects/${requireInteger(input.projectId, "projectId")}/`,
        query: compactObject({
          members_limit: optionalInteger(input.membersLimit),
        }),
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
      "Label Studio project",
      providerResponseError,
    );

    return { project };
  },
  async create_project(input, context) {
    const project = requiredRecord(
      await requestLabelStudioJson({
        ...context,
        path: "/api/projects/",
        method: "POST",
        body: compactObject({
          title: requiredString(input.title, "title", providerInputError),
          label_config: optionalString(input.labelConfig),
          description: input.description,
          workspace: optionalInteger(input.workspace),
          color: input.color,
        }),
        phase: "execute",
      }),
      "Label Studio project",
      providerResponseError,
    );

    return { project };
  },
  async list_tasks(input, context) {
    const payload = requiredRecord(
      await requestLabelStudioJson({
        ...context,
        path: "/api/tasks/",
        query: compactObject({
          page: optionalInteger(input.page),
          page_size: optionalInteger(input.pageSize),
          fields: optionalString(input.fields),
          include: optionalString(input.include),
          only_annotated: optionalBoolean(input.onlyAnnotated),
          project: optionalInteger(input.project),
          query: optionalString(input.query),
          resolve_uri: optionalBoolean(input.resolveUri),
          review: optionalBoolean(input.review),
          selectedItems: optionalString(input.selectedItems),
          view: optionalInteger(input.view),
        }),
        phase: "execute",
      }),
      "Label Studio task list",
      providerResponseError,
    );

    return normalizePaginatedList(payload, "tasks");
  },
  async create_task(input, context) {
    const task = requiredRecord(
      await requestLabelStudioJson({
        ...context,
        path: "/api/tasks/",
        method: "POST",
        body: compactObject({
          project: optionalInteger(input.project),
          data: requiredRecord(input.data, "data", providerInputError),
          meta: input.meta,
        }),
        phase: "execute",
      }),
      "Label Studio task",
      providerResponseError,
    );

    return { task };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LabelStudioContext>({
  service,
  handlers: labelStudioActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LabelStudioContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: requireStoredBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: labelStudioProxyBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = requiredString(input.apiKey, "apiKey", providerInputError);
    const baseUrl = normalizeLabelStudioBaseUrl(input.values.baseUrl);
    const user = requiredRecord(
      await requestLabelStudioJson({
        baseUrl,
        apiKey,
        path: labelStudioValidationPath,
        phase: "validate",
        fetcher,
        signal,
      }),
      "Label Studio user",
      providerResponseError,
    );

    const userId = optionalInteger(user.id);
    const email = optionalString(user.email);
    const displayName = email ?? optionalString(user.username) ?? optionalString(user.name) ?? "Label Studio API Key";

    return {
      profile: {
        accountId: userId !== undefined ? `label_studio:user:${userId}` : `label_studio:${new URL(baseUrl).host}`,
        displayName,
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        apiBaseUrl: baseUrl,
        validationEndpoint: labelStudioValidationPath,
        userId,
        email,
        username: optionalString(user.username),
      }),
    };
  },
};

async function labelStudioProxyBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, service);
  return requireStoredBaseUrl(credential.values, credential.metadata);
}

export function normalizeLabelStudioBaseUrl(value: unknown): string {
  const input = requiredString(value, "baseUrl", providerInputError);
  const url = assertPublicHttpUrl(input, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.pathname !== "/") {
    throw new ProviderRequestError(400, "baseUrl must be the Label Studio instance root URL without any path");
  }

  url.hash = "";
  url.search = "";
  return trimTrailingSlash(url.toString());
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function requireStoredBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  return normalizeLabelStudioBaseUrl(
    optionalString(values.baseUrl) ?? optionalString(metadata.baseUrl) ?? metadata.apiBaseUrl,
  );
}

async function requestLabelStudioJson(input: {
  baseUrl: string;
  apiKey: string;
  path: string;
  phase: LabelStudioPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: LabelStudioMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, labelStudioDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildLabelStudioUrl(input.baseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildLabelStudioHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readLabelStudioPayload(response);

    if (!response.ok) {
      throw createLabelStudioError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Label Studio request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Label Studio request failed: ${error.message}` : "Label Studio request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLabelStudioUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
): URL {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildLabelStudioHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readLabelStudioPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

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
    throw new ProviderRequestError(502, "Label Studio returned invalid JSON");
  }
}

function createLabelStudioError(
  status: number,
  payload: unknown,
  phase: LabelStudioPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readLabelStudioErrorMessage(payload);
  if (status === 401 || status === 403 || (status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(400, message ?? "Label Studio request was rejected", payload);
  }

  if (phase === "validate" && status < 500) {
    return new ProviderRequestError(400, message ?? "Label Studio credential could not be validated", payload);
  }

  return new ProviderRequestError(
    status >= 500 ? 502 : 400,
    message ?? `Label Studio request failed with HTTP ${status}`,
    payload,
  );
}

function readLabelStudioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return (
    optionalString(object.detail) ??
    optionalString(object.error) ??
    optionalString(object.message) ??
    optionalString(object.non_field_errors)
  );
}

function normalizePaginatedList(payload: Record<string, unknown>, key: "projects" | "tasks"): Record<string, unknown> {
  const results = Array.isArray(payload.results)
    ? objectArray(payload.results, key, providerResponseError)
    : objectArray(payload[key], key, providerResponseError);
  return {
    count: optionalInteger(payload.count) ?? results.length,
    next: optionalString(payload.next) ?? null,
    previous: optionalString(payload.previous) ?? null,
    [key]: results,
  };
}

function requireInteger(value: unknown, key: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return integer;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
