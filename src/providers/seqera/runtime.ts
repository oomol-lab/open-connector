import type {
  CredentialValidationResult,
  ExecutionContext,
  ProviderExecutors,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderExecutorDefinition, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "seqera";
const defaultSeqeraApiBaseUrl = "https://api.cloud.seqera.io";
const seqeraRequestTimeoutMs = 30_000;
const seqeraValidationEndpoint = "/user-info";

type SeqeraRequestPhase = "validate" | "execute";
type SeqeraQueryValue = string | number | boolean | Array<string> | undefined | null;

interface SeqeraActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type SeqeraActionHandler = ProviderRuntimeHandler<SeqeraActionContext>;

interface SeqeraUserInfoResponse {
  defaultWorkspaceId?: unknown;
  needConsent?: unknown;
  user?: unknown;
}

export const seqeraActionHandlers: ProviderActionHandlers<"seqera", SeqeraActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_user_workspaces(input, context) {
    return listUserWorkspaces(input, context);
  },
  get_workspace(input, context) {
    return getWorkspace(input, context);
  },
  list_pipelines(input, context) {
    return listPipelines(input, context);
  },
  get_pipeline(input, context) {
    return getPipeline(input, context);
  },
  list_workflows(input, context) {
    return listWorkflows(input, context);
  },
  get_workflow(input, context) {
    return getWorkflow(input, context);
  },
  launch_workflow(input, context) {
    return launchWorkflow(input, context);
  },
};

export const seqeraExecutorDefinition: ProviderExecutorDefinition<SeqeraActionContext> = {
  service: "seqera",
  handlers: seqeraActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<SeqeraActionContext> {
    return createSeqeraContext(await requireApiKeyCredential(context, service), fetcher, context.signal);
  },
};

export async function validateSeqeraCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = normalizeSeqeraApiBaseUrl(input.values.apiBaseUrl, "apiBaseUrl");
  const payload = await requestSeqeraJson<SeqeraUserInfoResponse>({
    apiKey: input.apiKey,
    apiBaseUrl,
    path: seqeraValidationEndpoint,
    fetcher,
    signal,
    phase: "validate",
  });

  const response = requiredResponseRecord(payload, "Seqera user info response");
  const user = requiredResponseRecord(response.user, "Seqera user profile");
  const userId = requirePositiveIntegerResponse(user.id, "user.id");
  const email = optionalString(user.email);
  const userName = optionalString(user.userName);
  const accountLabel = buildPersonName(user) ?? userName ?? email ?? `Seqera user ${String(userId)}`;

  return {
    profile: {
      accountId: String(userId),
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: seqeraValidationEndpoint,
      userId,
      userName,
      email,
      organization: optionalString(user.organization),
      defaultWorkspaceId: optionalInteger(response.defaultWorkspaceId),
      needConsent: optionalBoolean(response.needConsent),
    }),
  };
}

function createSeqeraContext(
  credential: Extract<ResolvedCredential, { authType: "api_key" }>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): SeqeraActionContext {
  return {
    apiKey: credential.apiKey,
    apiBaseUrl: normalizeSeqeraApiBaseUrl(
      optionalString(credential.metadata.apiBaseUrl) ?? credential.values.apiBaseUrl,
      "apiBaseUrl",
    ),
    fetcher,
    signal,
  };
}

async function getCurrentUser(context: SeqeraActionContext): Promise<unknown> {
  return readCurrentUserInfo(context);
}

async function listUserWorkspaces(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const userId = optionalPositiveInteger(input.userId, "userId") ?? (await fetchCurrentUserId(context));
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: `/user/${userId}/workspaces`,
    phase: "execute",
  });
  const response = requiredResponseRecord(payload, "Seqera user workspace list response");

  return {
    orgsAndWorkspaces: requireArrayPayload(response.orgsAndWorkspaces, "Seqera orgsAndWorkspaces response"),
  };
}

async function getWorkspace(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const orgId = requirePositiveIntegerInput(input.orgId, "orgId");
  const workspaceId = requirePositiveIntegerInput(input.workspaceId, "workspaceId");
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: `/orgs/${orgId}/workspaces/${workspaceId}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  const response = requiredResponseRecord(payload, "Seqera workspace response");
  return {
    workspace: requiredResponseRecord(response.workspace, "Seqera workspace"),
  };
}

async function listPipelines(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: "/pipelines",
    query: compactObject({
      workspaceId: optionalPositiveInteger(input.workspaceId, "workspaceId"),
      max: readOptionalNonNegativeInteger(input.max, "max"),
      offset: readOptionalNonNegativeInteger(input.offset, "offset"),
      sortBy: optionalString(input.sortBy),
      sortDir: optionalString(input.sortDir),
      search: optionalString(input.search),
      visibility: optionalString(input.visibility),
      attributes: readStringArray(input.attributes, "attributes"),
    }),
    phase: "execute",
  });

  const response = requiredResponseRecord(payload, "Seqera pipeline list response");
  return {
    pipelines: requireArrayPayload(response.pipelines, "Seqera pipelines response"),
    totalSize: optionalInteger(response.totalSize),
  };
}

async function getPipeline(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const pipelineId = requirePositiveIntegerInput(input.pipelineId, "pipelineId");
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: `/pipelines/${pipelineId}`,
    query: compactObject({
      workspaceId: optionalPositiveInteger(input.workspaceId, "workspaceId"),
      sourceWorkspaceId: optionalPositiveInteger(input.sourceWorkspaceId, "sourceWorkspaceId"),
      attributes: readStringArray(input.attributes, "attributes"),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  const response = requiredResponseRecord(payload, "Seqera pipeline response");
  return {
    pipeline: requiredResponseRecord(response.pipeline, "Seqera pipeline"),
  };
}

async function listWorkflows(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: "/workflow",
    query: compactObject({
      workspaceId: optionalPositiveInteger(input.workspaceId, "workspaceId"),
      max: readOptionalNonNegativeInteger(input.max, "max"),
      offset: readOptionalNonNegativeInteger(input.offset, "offset"),
      search: optionalString(input.search),
      includeTotalSize: optionalBoolean(input.includeTotalSize),
      attributes: readStringArray(input.attributes, "attributes"),
    }),
    phase: "execute",
  });

  const response = requiredResponseRecord(payload, "Seqera workflow list response");
  return {
    workflows: requireArrayPayload(response.workflows, "Seqera workflows response"),
    totalSize: optionalInteger(response.totalSize),
    hasMore: optionalBoolean(response.hasMore),
  };
}

async function getWorkflow(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const workflowId = requiredString(
    input.workflowId,
    "workflowId",
    (message) => new ProviderRequestError(400, message),
  );
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: `/workflow/${encodeURIComponent(workflowId)}`,
    query: compactObject({
      workspaceId: optionalPositiveInteger(input.workspaceId, "workspaceId"),
      attributes: readStringArray(input.attributes, "attributes"),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return requiredResponseRecord(payload, "Seqera workflow response");
}

async function launchWorkflow(input: Record<string, unknown>, context: SeqeraActionContext): Promise<unknown> {
  const payload = await requestSeqeraJson<Record<string, unknown>>({
    ...context,
    path: "/workflow/launch",
    method: "POST",
    query: compactObject({
      workspaceId: optionalPositiveInteger(input.workspaceId, "workspaceId"),
      sourceWorkspaceId: optionalPositiveInteger(input.sourceWorkspaceId, "sourceWorkspaceId"),
    }),
    body: {
      launch: compactObject({
        pipeline: requiredString(input.pipeline, "pipeline", (message) => new ProviderRequestError(400, message)),
        computeEnvId: optionalString(input.computeEnvId),
        workDir: optionalString(input.workDir),
        revision: optionalString(input.revision),
        runName: optionalString(input.runName),
        configProfiles: readStringArray(input.configProfiles, "configProfiles"),
        paramsText: optionalString(input.paramsText),
        configText: optionalString(input.configText),
        mainScript: optionalString(input.mainScript),
        entryName: optionalString(input.entryName),
        pullLatest: optionalBoolean(input.pullLatest),
        resume: optionalBoolean(input.resume),
        stubRun: optionalBoolean(input.stubRun),
        userSecrets: readStringArray(input.userSecrets, "userSecrets"),
        workspaceSecrets: readStringArray(input.workspaceSecrets, "workspaceSecrets"),
      }),
    },
    phase: "execute",
  });

  const response = requiredResponseRecord(payload, "Seqera workflow launch response");
  return {
    workflowId: requireResponseString(response.workflowId, "workflowId"),
  };
}

async function fetchCurrentUserId(context: SeqeraActionContext): Promise<number> {
  const currentUser = await readCurrentUserInfo(context);
  const user = requiredResponseRecord(currentUser.user, "Seqera user profile");
  return requirePositiveIntegerInput(user.id, "user.id");
}

async function readCurrentUserInfo(context: SeqeraActionContext): Promise<Record<string, unknown>> {
  const payload = await requestSeqeraJson<SeqeraUserInfoResponse>({
    ...context,
    path: seqeraValidationEndpoint,
    phase: "execute",
  });

  const response = requiredResponseRecord(payload, "Seqera user info response");
  const user = requiredResponseRecord(response.user, "Seqera user profile");
  return compactObject({
    user,
    defaultWorkspaceId: optionalInteger(response.defaultWorkspaceId),
    needConsent: optionalBoolean(response.needConsent),
  });
}

async function requestSeqeraJson<T>(input: {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  fetcher: ProviderFetch;
  phase: SeqeraRequestPhase;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, SeqeraQueryValue>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const response = await seqeraFetch(input);
  if (!response.ok) {
    throw await toSeqeraError(response, input.phase, input.notFoundAsInvalidInput);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "Seqera returned invalid JSON");
  }
}

async function seqeraFetch(input: {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, SeqeraQueryValue>;
  body?: unknown;
}): Promise<Response> {
  const url = buildSeqeraUrl(input.apiBaseUrl, input.path, input.query);
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${input.apiKey}`,
    "User-Agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.body);
  }

  const timeout = createProviderTimeout(input.signal, seqeraRequestTimeoutMs);
  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `seqera ${input.path} request timed out after ${Math.max(1, Math.ceil(seqeraRequestTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Seqera request failed");
  } finally {
    timeout.cleanup();
  }
}

async function toSeqeraError(
  response: Response,
  phase: SeqeraRequestPhase,
  notFoundAsInvalidInput?: boolean,
): Promise<ProviderRequestError> {
  const message = await extractSeqeraErrorMessage(response);

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 400 || response.status === 409 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

async function extractSeqeraErrorMessage(response: Response): Promise<string> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return `Seqera request failed with status ${response.status}`;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return `Seqera request failed with status ${response.status}`;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    `Seqera request failed with status ${response.status}`
  );
}

function buildSeqeraUrl(apiBaseUrl: string, path: string, query?: Record<string, SeqeraQueryValue>): URL {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.join(","));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function normalizeSeqeraApiBaseUrl(value: string | undefined, fieldName: string): string {
  const raw = value?.trim() || defaultSeqeraApiBaseUrl;
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be a valid absolute URL`);
  }

  if (parsed.protocol !== "https:" && !isLocalhostHostname(parsed.hostname)) {
    throw new ProviderRequestError(400, "seqera apiBaseUrl must use https unless connecting to localhost");
  }

  return parsed.toString().replace(/\/$/, "");
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function requireArrayPayload(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`, value);
  }
  return value;
}

function requirePositiveIntegerInput(value: unknown, fieldName: string): number {
  const parsed = optionalPositiveInteger(value, fieldName);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requirePositiveIntegerResponse(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(502, `Seqera response missing ${fieldName}`);
  }
  return parsed;
}

function requireResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Seqera response missing ${fieldName}`);
  }
  return parsed;
}

function readOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function readStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  const parsed = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  if (parsed.length !== value.length) {
    throw new ProviderRequestError(400, `${fieldName} must only contain non-empty strings`);
  }
  return parsed;
}

function buildPersonName(user: Record<string, unknown>): string | undefined {
  const firstName = optionalString(user.firstName);
  const lastName = optionalString(user.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || undefined;
}

export function defineSeqeraExecutors(): ProviderExecutors {
  return defineProviderExecutors(seqeraExecutorDefinition);
}
