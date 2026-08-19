import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ProjectmanagerActionName } from "./actions.ts";

import { optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const projectmanagerApiBaseUrl = "https://api.projectmanager.com";
const integrationName = "Oomol Connector";

type ProjectmanagerActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
};

type ProjectmanagerActionHandler = (
  input: Record<string, unknown>,
  context: ProjectmanagerActionContext,
) => Promise<unknown>;

export const projectmanagerActionHandlers: ProviderActionHandlers<"projectmanager", ProjectmanagerActionHandler> = {
  list_projects(input, context) {
    return requestProjectmanagerList({
      path: "/api/data/projects",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildOdataQuery(input),
    });
  },
  get_project(input, context) {
    return requestProjectmanagerObject({
      path: `/api/data/projects/${encodeURIComponent(String(input.projectId))}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
    });
  },
  list_tasks(input, context) {
    return requestProjectmanagerList({
      path: "/api/data/tasks",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildOdataQuery(input),
    });
  },
};

export async function validateProjectmanagerCredential(input: {
  apiKey: string;
  fetcher: typeof fetch;
}): Promise<CredentialValidationResult> {
  await requestProjectmanagerList({
    path: "/api/data/projects",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    query: [["$top", 1]],
  });

  return {
    profile: {
      accountId: "projectmanager-api-key",
      displayName: "ProjectManager API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: projectmanagerApiBaseUrl,
      validationEndpoint: "/api/data/projects",
    },
  };
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "projectmanager",
  projectmanagerActionHandlers as Record<
    string,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
  >,
);

export function executeProjectmanagerAction(input: {
  actionName: ProjectmanagerActionName;
  input: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
}): Promise<unknown> {
  const handler = projectmanagerActionHandlers[input.actionName];
  return handler(input.input, {
    apiKey: input.apiKey,
    fetcher: input.fetcher,
  });
}

function buildOdataQuery(input: Record<string, unknown>) {
  return [
    ["$top", input.top],
    ["$skip", input.skip],
    ["$filter", input.filter],
    ["$orderby", input.orderby],
    ["$expand", input.expand],
  ] satisfies Array<[string, unknown]>;
}

async function requestProjectmanagerList(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  query: Array<[string, unknown]>;
}) {
  const raw = await requestProjectmanager({
    path: input.path,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    query: input.query,
  });

  return {
    items: readProjectmanagerItems(raw),
    raw,
  };
}

async function requestProjectmanagerObject(input: { path: string; apiKey: string; fetcher: typeof fetch }) {
  const raw = await requestProjectmanager({
    path: input.path,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    query: [],
  });

  return {
    item: readProjectmanagerItem(raw),
    raw,
  };
}

async function requestProjectmanager(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  query: Array<[string, unknown]>;
}) {
  const url = new URL(input.path, projectmanagerApiBaseUrl);
  for (const [key, value] of input.query) {
    appendQueryValue(url, key, value);
  }

  const response = await input.fetcher(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
      "x-integration-name": integrationName,
    },
  });

  const rawBody = await response.text();
  const payload = parseProjectmanagerPayload(rawBody, response.status);

  if (!response.ok) {
    throw mapProjectmanagerError(response.status, payload, rawBody);
  }

  return payload;
}

function appendQueryValue(url: URL, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.set(key, String(value));
}

function parseProjectmanagerPayload(rawBody: string, status: number) {
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      buildProjectmanagerHttpErrorMessage(status, rawBody, error instanceof Error ? error.message : undefined),
    );
  }
}

function readProjectmanagerItems(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const values = payload.value ?? payload.data ?? payload.results ?? payload.items;
  return Array.isArray(values) ? values : [];
}

function readProjectmanagerItem(payload: unknown) {
  if (!isRecord(payload)) {
    return {};
  }

  const value = payload.value ?? payload.data ?? payload.result ?? payload.item;
  return isRecord(value) ? value : payload;
}

function mapProjectmanagerError(status: number, payload: unknown, rawBody: string) {
  const message = readProjectmanagerErrorMessage(payload);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message ?? "ProjectManager rejected the API key", payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message ?? "ProjectManager rate limit exceeded", payload);
  }

  return new ProviderRequestError(
    status >= 400 && status < 500 ? 400 : 502,
    message ?? buildProjectmanagerHttpErrorMessage(status, rawBody),
    payload,
  );
}

function readProjectmanagerErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const message = payload.message ?? payload.error_description ?? payload.error;
  return optionalString(message) ?? null;
}

function buildProjectmanagerHttpErrorMessage(status: number, rawBody: string, parseErrorMessage?: string) {
  const bodySnippet = rawBody.trim().slice(0, 200);
  const parts = [`ProjectManager request failed with ${status}`];

  if (parseErrorMessage) {
    parts.push(`invalid JSON response: ${parseErrorMessage}`);
  }
  if (bodySnippet) {
    parts.push(`body: ${bodySnippet}`);
  }

  return parts.join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
