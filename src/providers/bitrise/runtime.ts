import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BitriseActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const bitriseApiBaseUrl = "https://api.bitrise.io/v0.1";

const bitriseDefaultRequestTimeoutMs = 30_000;

interface BitriseActionHandler {
  (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown>;
}

interface BitriseRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  query?: URLSearchParams;
  body?: unknown;
  signal?: AbortSignal;
}

export const bitriseActionHandlers: Record<BitriseActionName, BitriseActionHandler> = {
  list_apps(input, context) {
    return listApps(input, context);
  },
  list_builds(input, context) {
    return listBuilds(input, context);
  },
  get_build(input, context) {
    return getBuild(input, context);
  },
  trigger_build(input, context) {
    return triggerBuild(input, context);
  },
};

export async function validateBitriseCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const profilePayload = await requestBitriseJson<unknown>({
    apiKey,
    path: "/me",
    fetcher,
    signal,
    phase: "validate",
  });
  const profile = requireObjectPayload(profilePayload, "bitrise profile response");
  const data = requireObjectPayload(profile.data, "bitrise profile data");
  const dataId = typeof data.data_id === "number" ? String(data.data_id) : undefined;
  const slug = optionalString(data.slug);
  const username = optionalString(data.username);
  const email = optionalString(data.email);

  return {
    profile: {
      accountId: slug ?? dataId ?? email ?? "bitrise:api_key",
      displayName: username ?? email ?? slug ?? "Bitrise API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: bitriseApiBaseUrl,
      validationEndpoint: "/me",
      dataId,
      slug,
      username,
      email,
    },
  };
}

async function listApps(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestBitriseJson<unknown>({
    apiKey: context.apiKey,
    path: "/apps",
    query: buildQueryParams(input, [
      ["sortBy", "sort_by"],
      ["next", "next"],
      ["limit", "limit"],
      ["title", "title"],
      ["projectType", "project_type"],
    ]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const object = requireObjectPayload(payload, "bitrise apps response");

  return compactObject({
    apps: requireArrayPayload(object.data, "bitrise apps data"),
    paging: optionalRecord(object.paging),
  });
}

async function listBuilds(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const appSlug = requireInputString(input.appSlug, "appSlug");
  const payload = await requestBitriseJson<unknown>({
    apiKey: context.apiKey,
    path: `/apps/${encodeURIComponent(appSlug)}/builds`,
    query: buildQueryParams(input, [
      ["sortBy", "sort_by"],
      ["branch", "branch"],
      ["workflow", "workflow"],
      ["commitMessage", "commit_message"],
      ["triggerEventType", "trigger_event_type"],
      ["pullRequestId", "pull_request_id"],
      ["buildNumber", "build_number"],
      ["after", "after"],
      ["before", "before"],
      ["status", "status"],
      ["isPipelineBuild", "is_pipeline_build"],
      ["next", "next"],
      ["limit", "limit"],
    ]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const object = requireObjectPayload(payload, "bitrise builds response");

  return compactObject({
    builds: requireArrayPayload(object.data, "bitrise builds data"),
    paging: optionalRecord(object.paging),
  });
}

async function getBuild(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const appSlug = requireInputString(input.appSlug, "appSlug");
  const buildSlug = requireInputString(input.buildSlug, "buildSlug");
  const payload = await requestBitriseJson<unknown>({
    apiKey: context.apiKey,
    path: `/apps/${encodeURIComponent(appSlug)}/builds/${encodeURIComponent(buildSlug)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const object = requireObjectPayload(payload, "bitrise build response");

  return {
    build: requireObjectPayload(object.data, "bitrise build data"),
  };
}

async function triggerBuild(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const appSlug = requireInputString(input.appSlug, "appSlug");
  const body = buildTriggerBody(input);
  const payload = await requestBitriseJson<unknown>({
    apiKey: context.apiKey,
    path: `/apps/${encodeURIComponent(appSlug)}/builds`,
    method: "POST",
    body,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    trigger: requireObjectPayload(payload, "bitrise trigger response"),
  };
}

async function requestBitriseJson<T>(input: BitriseRequestInput) {
  const response = await bitriseFetch(input);
  const payload = await readBitrisePayload(response);

  if (!response.ok) {
    throw createBitriseError(response, payload, input.phase);
  }

  return payload as T;
}

async function bitriseFetch(input: BitriseRequestInput) {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(relativePath, `${bitriseApiBaseUrl}/`);
  if (input.query) {
    url.search = input.query.toString();
  }

  const timeout = createProviderTimeout(input.signal, bitriseDefaultRequestTimeoutMs);
  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildBitriseHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "bitrise request timed out");
    }
    throw new ProviderRequestError(
      502,
      `bitrise request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBitriseHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  let headers: Record<string, string> = {
    Authorization: apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readBitrisePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "bitrise returned invalid JSON");
  }
}

function createBitriseError(response: Response, payload: unknown, phase: BitriseRequestInput["phase"]) {
  const message = readBitriseErrorMessage(payload) ?? `bitrise request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status, message);
}

function readBitriseErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) ?? optionalString(object.error_msg) ?? optionalString(object.error);
}

function buildTriggerBody(input: Record<string, unknown>) {
  const buildParams = compactObject({
    branch: readInputString(input.branch),
    workflow_id: readInputString(input.workflowId),
    pipeline_id: readInputString(input.pipelineId),
    commit_hash: readInputString(input.commitHash),
    tag: readInputString(input.tag),
    branch_dest: readInputString(input.branchDest),
    pull_request_id: input.pullRequestId,
    skip_git_status_report: input.skipGitStatusReport,
    machine_type_id: readInputString(input.machineTypeId),
    stack: readInputString(input.stack),
    priority: input.priority,
    environments: mapEnvironments(input.environments),
  });

  if (
    buildParams.branch == null &&
    buildParams.tag == null &&
    buildParams.commit_hash == null &&
    buildParams.workflow_id == null &&
    buildParams.pipeline_id == null
  ) {
    throw new ProviderRequestError(
      400,
      "trigger_build requires at least one of branch, tag, commitHash, workflowId, or pipelineId",
    );
  }

  return {
    hook_info: {
      type: "bitrise",
    },
    build_params: buildParams,
  };
}

function mapEnvironments(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "environments must be an array");
  }

  return value.map((item) => {
    const object = requireObjectPayload(item, "bitrise environment input");
    return compactObject({
      mapped_to: requireInputString(object.key, "environments.key"),
      value: requireInputRawString(object.value, "environments.value"),
      is_expand: typeof object.isExpand === "boolean" ? object.isExpand : undefined,
    });
  });
}

function buildQueryParams(input: Record<string, unknown>, mappings: readonly [string, string][]) {
  const query = new URLSearchParams();
  for (const [inputKey, queryKey] of mappings) {
    const value = input[inputKey];
    if (value == null || value === "") {
      continue;
    }
    query.append(queryKey, String(value));
  }
  return query;
}

function requireInputString(value: unknown, fieldName: string) {
  const parsed = readInputString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requireInputRawString(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readInputString(value: unknown) {
  const parsed = optionalString(value)?.trim();
  return parsed || undefined;
}

function requireArrayPayload(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array`);
  }
  return value;
}

function requireObjectPayload(value: unknown, label: string) {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return parsed;
}
