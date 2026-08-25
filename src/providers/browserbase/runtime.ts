import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { isAbortLikeError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const browserbaseApiBaseUrl = "https://api.browserbase.com";

type BrowserbaseRequestPhase = "validate" | "execute";
type BrowserbaseRequestMethod = "DELETE" | "GET" | "POST" | "PUT";
type BrowserbaseActionHandler = (input: Record<string, unknown>, context: BrowserbaseContext) => Promise<unknown>;

export interface BrowserbaseContext {
  apiKey: string;
  projectId?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const browserbaseActionHandlers: ProviderActionHandlers<"browserbase", BrowserbaseActionHandler> = {
  list_projects(_input, context) {
    return listBrowserbaseProjects(context);
  },
  get_project(input, context) {
    return getBrowserbaseProject(input, context);
  },
  get_project_usage(input, context) {
    return getBrowserbaseProjectUsage(input, context);
  },
  create_context(input, context) {
    return createBrowserbaseContext(input, context);
  },
  get_context(input, context) {
    return getBrowserbaseContext(input, context);
  },
  refresh_context_upload_credentials(input, context) {
    return refreshBrowserbaseContextUploadCredentials(input, context);
  },
  delete_context(input, context) {
    return deleteBrowserbaseContext(input, context);
  },
  create_session(input, context) {
    return createBrowserbaseSession(input, context);
  },
  list_sessions(input, context) {
    return listBrowserbaseSessions(input, context);
  },
  get_session(input, context) {
    return getBrowserbaseSession(input, context);
  },
  request_session_release(input, context) {
    return requestBrowserbaseSessionRelease(input, context);
  },
};

export async function validateBrowserbaseCredential(
  input: { apiKey: string; projectId?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireInputString(input.apiKey, "apiKey");
  const projectId = requireInputString(input.projectId, "projectId");

  await requestBrowserbaseJson<unknown[]>({
    apiKey,
    path: "/v1/projects",
    fetcher,
    signal,
    phase: "validate",
  });

  const projectPayload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey,
    path: `/v1/projects/${encodeURIComponent(projectId)}`,
    fetcher,
    signal,
    phase: "validate",
    notFoundAsInvalidInput: true,
  });
  const project = normalizeBrowserbaseProject(projectPayload);
  const projectName = optionalString(project.name);

  return {
    profile: {
      accountId: `browserbase:project:${projectId}`,
      displayName: projectName ?? `Browserbase ${projectId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      projectId,
      projectName,
      defaultTimeout: project.defaultTimeout,
      concurrency: project.concurrency,
      validationEndpoint: "/v1/projects/{projectId}",
      apiBaseUrl: browserbaseApiBaseUrl,
    }),
  };
}

async function listBrowserbaseProjects(
  context: BrowserbaseContext,
): Promise<{ projects: Array<Record<string, unknown>> }> {
  const payload = await requestBrowserbaseJson<unknown[]>({
    apiKey: context.apiKey,
    path: "/v1/projects",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    projects: Array.isArray(payload) ? payload.map((project) => normalizeBrowserbaseProject(project)) : [],
  };
}

async function getBrowserbaseProject(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ project: Record<string, unknown> }> {
  const id = requireInputString(input.id, "id");
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/v1/projects/${encodeURIComponent(id)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    project: normalizeBrowserbaseProject(payload),
  };
}

async function getBrowserbaseProjectUsage(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<Record<string, unknown>> {
  const projectId = requireProjectIdFromInputOrContext(input, "id", context);
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/v1/projects/${encodeURIComponent(projectId)}/usage`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return normalizeBrowserbaseProjectUsage(payload);
}

async function createBrowserbaseContext(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<Record<string, unknown>> {
  const projectId = requireProjectIdFromInputOrContext(input, "projectId", context);
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/v1/contexts",
    method: "POST",
    body: { projectId },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return normalizeBrowserbaseContextUpload(payload);
}

async function getBrowserbaseContext(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ context: Record<string, unknown> }> {
  const id = requireInputString(input.id, "id");
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/v1/contexts/${encodeURIComponent(id)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    context: normalizeBrowserbaseContext(payload),
  };
}

async function refreshBrowserbaseContextUploadCredentials(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<Record<string, unknown>> {
  const id = requireInputString(input.id, "id");
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/v1/contexts/${encodeURIComponent(id)}`,
    method: "PUT",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return normalizeBrowserbaseContextUpload(payload);
}

async function deleteBrowserbaseContext(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ success: boolean }> {
  const id = requireInputString(input.id, "id");
  await requestBrowserbaseJson<unknown>({
    apiKey: context.apiKey,
    path: `/v1/contexts/${encodeURIComponent(id)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return { success: true };
}

async function createBrowserbaseSession(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ session: Record<string, unknown> }> {
  const projectId = requireProjectIdFromInputOrContext(input, "projectId", context);
  const contextId = optionalString(input.contextId);
  const persist = optionalBoolean(input.persist);
  if (persist && !contextId) {
    throw new ProviderRequestError(400, "persist requires contextId");
  }

  const browserSettings = compactObject({
    timeout: optionalInteger(input.timeout),
    keepAlive: optionalBoolean(input.keepAlive),
    region: optionalString(input.region),
    context: contextId
      ? compactObject({
          id: contextId,
          persist,
        })
      : undefined,
  });

  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/v1/sessions",
    method: "POST",
    body: compactObject({
      projectId,
      browserSettings: Object.keys(browserSettings).length > 0 ? browserSettings : undefined,
      userMetadata: optionalRecord(input.userMetadata),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    session: normalizeBrowserbaseSession(payload),
  };
}

async function listBrowserbaseSessions(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ sessions: Array<Record<string, unknown>> }> {
  const payload = await requestBrowserbaseJson<unknown[]>({
    apiKey: context.apiKey,
    path: "/v1/sessions",
    query: compactObject({
      status: optionalString(input.status),
      q: optionalString(input.q),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    sessions: Array.isArray(payload) ? payload.map((session) => normalizeBrowserbaseSession(session)) : [],
  };
}

async function getBrowserbaseSession(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ session: Record<string, unknown> }> {
  const id = requireInputString(input.id, "id");
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/v1/sessions/${encodeURIComponent(id)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    session: normalizeBrowserbaseSession(payload),
  };
}

async function requestBrowserbaseSessionRelease(
  input: Record<string, unknown>,
  context: BrowserbaseContext,
): Promise<{ session: Record<string, unknown> }> {
  const id = requireInputString(input.id, "id");
  const projectId = requireProjectIdFromInputOrContext(input, "projectId", context);
  const payload = await requestBrowserbaseJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/v1/sessions/${encodeURIComponent(id)}`,
    method: "POST",
    body: {
      status: "REQUEST_RELEASE",
      projectId,
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    session: normalizeBrowserbaseSession(payload),
  };
}

async function requestBrowserbaseJson<T>(input: {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: BrowserbaseRequestPhase;
  method?: BrowserbaseRequestMethod;
  query?: Record<string, string | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const url = new URL(input.path, browserbaseApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: browserbaseHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw wrapBrowserbaseTransportError(error, input.phase);
  }

  const payload = await readBrowserbasePayload(response);
  if (!response.ok) {
    throw createBrowserbaseError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload as T;
}

function browserbaseHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    "user-agent": providerUserAgent,
    "x-bb-api-key": apiKey,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readBrowserbasePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function wrapBrowserbaseTransportError(error: unknown, phase: BrowserbaseRequestPhase): ProviderRequestError {
  if (isAbortLikeError(error)) {
    return new ProviderRequestError(504, `browserbase ${phase} request aborted`, error);
  }
  return new ProviderRequestError(
    502,
    error instanceof Error
      ? `browserbase ${phase} request failed: ${error.message}`
      : `browserbase ${phase} request failed`,
    error,
  );
}

function createBrowserbaseError(
  response: Response,
  payload: unknown,
  phase: BrowserbaseRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractBrowserbaseErrorMessage(payload) ?? `browserbase request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput !== false) {
    return new ProviderRequestError(400, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractBrowserbaseErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_description);
}

function requireProjectIdFromInputOrContext(
  input: Record<string, unknown>,
  key: string,
  context: BrowserbaseContext,
): string {
  const value = optionalString(input[key]);
  if (value) {
    return value;
  }
  if (context.projectId) {
    return context.projectId;
  }
  throw new ProviderRequestError(400, "projectId is required");
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function normalizeBrowserbaseProject(payload: unknown): Record<string, unknown> {
  const record = requirePayloadObject(payload, "browserbase project");
  return compactObject({
    id: requirePayloadString(record, "id", "browserbase project"),
    createdAt: requirePayloadString(record, "createdAt", "browserbase project"),
    updatedAt: requirePayloadString(record, "updatedAt", "browserbase project"),
    name: requirePayloadString(record, "name", "browserbase project"),
    ownerId: requirePayloadString(record, "ownerId", "browserbase project"),
    defaultTimeout: requirePayloadInteger(record, "defaultTimeout", "browserbase project"),
    concurrency: optionalInteger(record.concurrency),
  });
}

function normalizeBrowserbaseProjectUsage(payload: unknown): Record<string, unknown> {
  const record = requirePayloadObject(payload, "browserbase project usage");
  return {
    browserMinutes: requirePayloadInteger(record, "browserMinutes", "browserbase project usage"),
    proxyBytes: requirePayloadInteger(record, "proxyBytes", "browserbase project usage"),
  };
}

function normalizeBrowserbaseContext(payload: unknown): Record<string, unknown> {
  const record = requirePayloadObject(payload, "browserbase context");
  return {
    id: requirePayloadString(record, "id", "browserbase context"),
    createdAt: requirePayloadString(record, "createdAt", "browserbase context"),
    updatedAt: requirePayloadString(record, "updatedAt", "browserbase context"),
    projectId: requirePayloadString(record, "projectId", "browserbase context"),
  };
}

function normalizeBrowserbaseContextUpload(payload: unknown): Record<string, unknown> {
  const record = requirePayloadObject(payload, "browserbase context upload credentials");
  return {
    id: requirePayloadString(record, "id", "browserbase context upload credentials"),
    uploadUrl: requirePayloadString(record, "uploadUrl", "browserbase context upload credentials"),
    publicKey: requirePayloadString(record, "publicKey", "browserbase context upload credentials"),
    cipherAlgorithm: requirePayloadString(record, "cipherAlgorithm", "browserbase context upload credentials"),
    initializationVectorSize: requirePayloadInteger(
      record,
      "initializationVectorSize",
      "browserbase context upload credentials",
    ),
  };
}

function normalizeBrowserbaseSession(payload: unknown): Record<string, unknown> {
  const record = requirePayloadObject(payload, "browserbase session");
  return compactObject({
    id: requirePayloadString(record, "id", "browserbase session"),
    createdAt: requirePayloadString(record, "createdAt", "browserbase session"),
    updatedAt: requirePayloadString(record, "updatedAt", "browserbase session"),
    projectId: requirePayloadString(record, "projectId", "browserbase session"),
    startedAt: requirePayloadString(record, "startedAt", "browserbase session"),
    expiresAt: requirePayloadString(record, "expiresAt", "browserbase session"),
    status: requirePayloadString(record, "status", "browserbase session"),
    proxyBytes: requirePayloadInteger(record, "proxyBytes", "browserbase session"),
    keepAlive: requirePayloadBoolean(record, "keepAlive", "browserbase session"),
    region: requirePayloadString(record, "region", "browserbase session"),
    endedAt: optionalString(record.endedAt),
    contextId: optionalString(record.contextId),
    connectUrl: optionalString(record.connectUrl),
    seleniumRemoteUrl: optionalString(record.seleniumRemoteUrl),
    signingKey: optionalString(record.signingKey),
    userMetadata: optionalRecord(record.userMetadata),
  });
}

function requirePayloadObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response is invalid`, payload);
  }
  return record;
}

function requirePayloadString(record: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(record[key]);
  if (!value) {
    throw new ProviderRequestError(502, `${label} is missing ${key}`, record);
  }
  return value;
}

function requirePayloadInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = optionalInteger(record[key]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `${label} is missing ${key}`, record);
  }
  return value;
}

function requirePayloadBoolean(record: Record<string, unknown>, key: string, label: string): boolean {
  const value = optionalBoolean(record[key]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `${label} is missing ${key}`, record);
  }
  return value;
}
