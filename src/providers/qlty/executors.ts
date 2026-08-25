import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "qlty";
const qltyApiBaseUrl = "https://api.qlty.sh";
const qltyPathParameterMinLength = 3;

type JsonObject = Record<string, unknown>;

interface QltyActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type QltyActionHandler = (input: Record<string, unknown>, context: QltyActionContext) => Promise<unknown>;

export const qltyActionHandlers: ProviderActionHandlers<"qlty", QltyActionHandler> = {
  async get_authenticated_user(_input, context): Promise<unknown> {
    const user = await requestQlty({ path: "/user" }, context);
    return { user, raw: user };
  },
  async list_workspaces(input, context): Promise<unknown> {
    const payload = await requestQlty(
      {
        path: "/workspaces",
        search: buildSearchParams({
          "page[limit]": input.limit,
          "page[offset]": input.offset,
        }),
      },
      context,
    );
    return normalizeListPayload(payload, "workspaces");
  },
  async get_workspace(input, context): Promise<unknown> {
    const workspace = await requestQlty(
      {
        path: `/workspaces/${encodeURIComponent(requireQltyPathParameter(input.keyOrId, "keyOrId"))}`,
      },
      context,
    );
    return { workspace, raw: workspace };
  },
  async list_projects(input, context): Promise<unknown> {
    const payload = await requestQlty(
      {
        path: `/gh/${encodeURIComponent(requireQltyPathParameter(input.ownerKeyOrId, "ownerKeyOrId"))}/projects`,
        search: buildSearchParams({
          "page[limit]": input.limit,
          "page[offset]": input.offset,
        }),
      },
      context,
    );
    return normalizeListPayload(payload, "projects");
  },
  async get_project(input, context): Promise<unknown> {
    const project = await requestQlty(
      {
        path: `/gh/${encodeURIComponent(requireQltyPathParameter(input.ownerKeyOrId, "ownerKeyOrId"))}/projects/${encodeURIComponent(requireQltyPathParameter(input.keyOrId, "keyOrId"))}`,
      },
      context,
    );
    return { project, raw: project };
  },
  async list_issues(input, context): Promise<unknown> {
    const payload = await requestQlty(
      {
        path: `/gh/${encodeURIComponent(requireQltyPathParameter(input.ownerKeyOrId, "ownerKeyOrId"))}/projects/${encodeURIComponent(requireQltyPathParameter(input.projectKeyOrId, "projectKeyOrId"))}/issues`,
        search: buildSearchParams({
          "page[limit]": input.limit,
          "page[offset]": input.offset,
          category: input.category,
          level: input.level,
          status: input.status,
          tool: trimSearchValue(input.tool),
        }),
      },
      context,
    );
    return normalizeListPayload(payload, "issues");
  },
  async get_project_metrics(input, context): Promise<unknown> {
    const payload = await requestQlty(
      {
        path: `/gh/${encodeURIComponent(requireQltyPathParameter(input.ownerKeyOrId, "ownerKeyOrId"))}/projects/${encodeURIComponent(requireQltyPathParameter(input.projectKeyOrId, "projectKeyOrId"))}/metrics`,
      },
      context,
    );
    return {
      metrics: readArray(payload.data, "data"),
      raw: payload,
    };
  },
  async get_rate_limit_status(_input, context): Promise<unknown> {
    const payload = await requestQlty({ path: "/rate_limit" }, context);
    return {
      resources: readObject(payload.resources, "resources"),
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<QltyActionContext>({
  service,
  handlers: qltyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<QltyActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await requestQlty(
      { path: "/user" },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const userId = requiredString(user.id, "id", (message) => new ProviderRequestError(502, message));
    const login = optionalString(user.login);
    const email = optionalString(user.email);
    const providerUrl = optionalString(user.providerUrl);

    return {
      profile: {
        accountId: `qlty:${userId}`,
        displayName: optionalString(user.name) ?? login ?? email ?? "Qlty API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: qltyApiBaseUrl,
        validationEndpoint: "/user",
        userId,
        login,
        email,
        providerUrl,
      }),
    };
  },
};

async function requestQlty(
  request: {
    path: string;
    search?: URLSearchParams;
  },
  context: QltyActionContext,
): Promise<JsonObject> {
  const url = new URL(`${qltyApiBaseUrl}${request.path}`);
  if (request.search) {
    for (const [key, value] of request.search) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Qlty request failed: ${error.message}` : "Qlty request failed",
    );
  }

  const payload = await readJsonObject(response, { tolerant: !response.ok });
  if (!response.ok) {
    throw mapQltyError(response, payload);
  }

  return payload;
}

async function readJsonObject(
  response: Response,
  options: { tolerant: boolean } = { tolerant: false },
): Promise<JsonObject> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (options.tolerant) {
      return {};
    }
    throw new ProviderRequestError(502, "Qlty returned invalid JSON");
  }

  return readObject(payload, "response");
}

function mapQltyError(response: Response, payload: JsonObject): ProviderRequestError {
  const firstError = Array.isArray(payload.errors) ? optionalRecord(payload.errors[0]) : undefined;
  const message =
    optionalString(firstError?.detail) ??
    optionalString(firstError?.title) ??
    optionalString(payload.message) ??
    `Qlty API request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403 || response.status === 410) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function buildSearchParams(input: Record<string, unknown>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendSearchValue(search, key, value);
  }
  return search;
}

function appendSearchValue(search: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendSearchValue(search, key, item);
    }
    return;
  }

  if (value !== undefined && value !== null && value !== "") {
    search.append(key, String(value));
  }
}

function normalizeListPayload(payload: JsonObject, outputKey: "issues" | "projects" | "workspaces"): JsonObject {
  const meta = readObject(payload.meta, "meta");
  return {
    [outputKey]: readArray(payload.data, "data"),
    hasMore: optionalBoolean(meta.hasMore) ?? false,
    raw: payload,
  };
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Qlty returned invalid ${fieldName}`);
  }
  return value;
}

function readObject(value: unknown, fieldName: string): JsonObject {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Qlty returned invalid ${fieldName}`);
  }
  return object;
}

function requireQltyPathParameter(value: unknown, fieldName: string): string {
  const stringValue = requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (stringValue.length < qltyPathParameterMinLength) {
    throw new ProviderRequestError(400, `${fieldName} must be at least ${qltyPathParameterMinLength} characters`);
  }
  return stringValue;
}

function trimSearchValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : item));
  }
  return value;
}
