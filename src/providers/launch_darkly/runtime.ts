import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const launchDarklyApiBaseUrl = "https://app.launchdarkly.com/api/v2";
export const launchDarklyApiVersion = "20240415";

type LaunchDarklyRequestPhase = "validate" | "execute";
type LaunchDarklyRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type LaunchDarklyQueryValue = string | number | boolean | Array<string | number | boolean> | undefined;
type LaunchDarklyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface LaunchDarklyRequestInput {
  method?: LaunchDarklyRequestMethod;
  path: string;
  query?: Record<string, LaunchDarklyQueryValue>;
  body?: unknown;
  contentType?: string;
  expectEmpty?: boolean;
}

export const launchDarklyActionHandlers: ProviderActionHandlers<"launch_darkly", LaunchDarklyActionHandler> = {
  get_caller_identity(_input, context) {
    return fetchCallerIdentity(context.apiKey, context.fetcher, "execute", context.signal);
  },
  list_projects(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: "/projects", query: listQuery(input, { expand: optionalString(input.expand) }) },
      context,
    );
  },
  get_project(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: `/projects/${path(input, "projectKey")}`,
        query: compactObject({ expand: optionalString(input.expand) }),
      },
      context,
    );
  },
  create_project(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "POST", path: "/projects", body: buildProjectBody(input), contentType: "application/json" },
      context,
    );
  },
  patch_project(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: `/projects/${path(input, "projectKey")}`,
        body: objectArray(input.patch, "patch"),
        contentType: "application/json",
      },
      context,
    );
  },
  delete_project(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "DELETE", path: `/projects/${path(input, "projectKey")}`, expectEmpty: true },
      context,
    );
  },
  get_environments(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: `/projects/${path(input, "projectKey")}/environments` },
      context,
    );
  },
  get_environment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}` },
      context,
    );
  },
  create_environment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "POST",
        path: `/projects/${path(input, "projectKey")}/environments`,
        body: buildEnvironmentBody(input),
        contentType: "application/json",
      },
      context,
    );
  },
  patch_environment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}`,
        body: objectArray(input.patch, "patch"),
        contentType: "application/json",
      },
      context,
    );
  },
  delete_environment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "DELETE",
        path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}`,
        expectEmpty: true,
      },
      context,
    );
  },
  get_feature_flags(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: `/flags/${path(input, "projectKey")}`,
        query: listQuery(input, {
          summary: optionalBoolean(input.summary),
          env: optionalString(input.env),
          tag: optionalString(input.tag),
          archived: optionalBoolean(input.archived),
        }),
      },
      context,
    );
  },
  get_feature_flag(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: `/flags/${path(input, "projectKey")}/${path(input, "featureFlagKey")}`,
        query: compactObject({
          env: optionalString(input.env),
          summary: optionalBoolean(input.summary),
        }),
      },
      context,
    );
  },
  create_feature_flag(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "POST",
        path: `/flags/${path(input, "projectKey")}`,
        body: buildFeatureFlagBody(input),
        contentType: "application/json",
      },
      context,
    );
  },
  patch_feature_flag(input, context) {
    return patchFeatureFlag(input, context);
  },
  delete_feature_flag(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "DELETE",
        path: `/flags/${path(input, "projectKey")}/${path(input, "featureFlagKey")}`,
        expectEmpty: true,
      },
      context,
    );
  },
  get_segments(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: `/segments/${path(input, "projectKey")}/${path(input, "environmentKey")}`, query: listQuery(input) },
      context,
    );
  },
  get_segment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: `/segments/${path(input, "projectKey")}/${path(input, "environmentKey")}/${path(input, "segmentKey")}` },
      context,
    );
  },
  create_segment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "POST",
        path: `/segments/${path(input, "projectKey")}/${path(input, "environmentKey")}`,
        body: buildSegmentBody(input),
        contentType: "application/json",
      },
      context,
    );
  },
  patch_segment(input, context) {
    return patchSegment(input, context);
  },
  delete_segment(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "DELETE",
        path: `/segments/${path(input, "projectKey")}/${path(input, "environmentKey")}/${path(input, "segmentKey")}`,
        expectEmpty: true,
      },
      context,
    );
  },
  search_contexts(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "POST",
        path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}/contexts/search`,
        body: contextPage(input),
        contentType: "application/json",
      },
      context,
    );
  },
  get_contexts(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}/contexts/${path(input, "kind")}/${path(input, "key")}`,
        query: contextPage(input),
      },
      context,
    );
  },
  search_context_instances(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "POST",
        path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}/context-instances/search`,
        body: contextPage(input),
        contentType: "application/json",
      },
      context,
    );
  },
  get_context_instances(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: `/projects/${path(input, "projectKey")}/environments/${path(input, "environmentKey")}/context-instances/${path(input, "contextInstanceId")}`,
        query: contextPage(input),
      },
      context,
    );
  },
  get_members(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: "/members", query: listQuery(input, { expand: optionalString(input.expand) }) },
      context,
    );
  },
  get_member(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: `/members/${path(input, "memberId")}`, query: compactObject({ expand: optionalString(input.expand) }) },
      context,
    );
  },
  list_teams(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: "/teams", query: listQuery(input, { expand: optionalString(input.expand) }) },
      context,
    );
  },
  get_team(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { path: `/teams/${path(input, "teamKey")}`, query: compactObject({ expand: optionalString(input.expand) }) },
      context,
    );
  },
  create_team(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "POST", path: "/teams", body: buildTeamBody(input), contentType: "application/json" },
      context,
    );
  },
  patch_team(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: `/teams/${path(input, "teamKey")}`,
        query: compactObject({ expand: optionalString(input.expand) }),
        body: compactObject({
          comment: optionalString(input.comment),
          instructions: objectArray(input.instructions, "instructions"),
        }),
        contentType: "application/json; domain-model=launchdarkly.semanticpatch",
      },
      context,
    );
  },
  delete_team(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "DELETE", path: `/teams/${path(input, "teamKey")}`, expectEmpty: true },
      context,
    );
  },
  add_member_to_teams(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: "/teams",
        body: compactObject({
          comment: optionalString(input.comment),
          instructions: [
            {
              kind: "addMembersToTeams",
              memberIDs: stringArray(input.memberIds, "memberIds"),
              teamKeys: stringArray(input.teamKeys, "teamKeys"),
            },
          ],
        }),
        contentType: "application/json; domain-model=launchdarkly.semanticpatch",
      },
      context,
    );
  },
  get_tags(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: "/tags",
        query: compactObject({
          limit: optionalInteger(input.limit),
          offset: optionalInteger(input.offset),
          pre: optionalString(input.pre),
          kind: readOptionalQueryStringArray(input.kind),
        }),
      },
      context,
    );
  },
  get_tokens(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        path: "/tokens",
        query: compactObject({
          limit: optionalInteger(input.limit),
          offset: optionalInteger(input.offset),
          showAll: optionalBoolean(input.showAll),
        }),
      },
      context,
    );
  },
  get_token(input, context) {
    return launchDarklyRequest(context.apiKey, { path: `/tokens/${path(input, "tokenId")}` }, context);
  },
  create_token(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "POST", path: "/tokens", body: buildTokenBody(input), contentType: "application/json" },
      context,
    );
  },
  patch_token(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: `/tokens/${path(input, "tokenId")}`,
        body: objectArray(input.patch, "patch"),
        contentType: "application/json",
      },
      context,
    );
  },
  delete_token(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "DELETE", path: `/tokens/${path(input, "tokenId")}`, expectEmpty: true },
      context,
    );
  },
  reset_token(input, context) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "POST",
        path: `/tokens/${path(input, "tokenId")}/reset`,
        query: compactObject({ expiry: optionalInteger(input.expiry) }),
      },
      context,
    );
  },
};

export async function validateLaunchDarklyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await fetchCallerIdentity(apiKey, fetcher, "validate", signal);
  const accountId = firstString(
    optionalString(payload.tokenId),
    optionalString(payload.memberId),
    optionalString(payload.accountId),
    optionalString(payload.projectId),
    optionalString(payload.environmentId),
  );
  if (!accountId) {
    throw new ProviderRequestError(502, "LaunchDarkly caller identity did not include a stable account identifier");
  }

  return {
    profile: {
      accountId,
      displayName:
        firstString(
          optionalString(payload.tokenName),
          optionalString(payload.accountName),
          scopedTokenLabel(payload),
          optionalString(payload.memberId),
        ) ?? "LaunchDarkly Access Token",
    },
    grantedScopes: Array.isArray(payload.scopes) ? payload.scopes.map((scope) => String(scope)) : [],
    metadata: {
      apiBaseUrl: launchDarklyApiBaseUrl,
      apiVersion: launchDarklyApiVersion,
      validationEndpoint: "/caller-identity",
      callerIdentity: payload,
    },
  };
}

async function fetchCallerIdentity(
  apiKey: string,
  fetcher: typeof fetch,
  phase: LaunchDarklyRequestPhase,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return launchDarklyRequest(apiKey, { path: "/caller-identity" }, { fetcher, signal }, phase);
}

async function patchFeatureFlag(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const requestPath = `/flags/${path(input, "projectKey")}/${path(input, "featureFlagKey")}`;
  const query = compactObject({
    dryRun: optionalBoolean(input.dryRun),
    ignoreConflicts: optionalBoolean(input.ignoreConflicts),
  });
  const instructions = optionalObjectArray(input.instructions, "instructions");
  if (instructions) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: requestPath,
        query,
        body: compactObject({
          comment: optionalString(input.comment),
          environmentKey: optionalString(input.environmentKey),
          instructions,
        }),
        contentType: "application/json; domain-model=launchdarkly.semanticpatch",
      },
      context,
    );
  }

  const merge = optionalRecord(input.merge);
  if (merge) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "PATCH", path: requestPath, query, body: merge, contentType: "application/merge-patch+json" },
      context,
    );
  }

  return launchDarklyRequest(
    context.apiKey,
    {
      method: "PATCH",
      path: requestPath,
      query,
      body: compactObject({
        comment: optionalString(input.comment),
        patch: optionalObjectArray(input.patch, "patch") ?? [],
      }),
      contentType: "application/json",
    },
    context,
  );
}

async function patchSegment(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const environmentKey = string(input, "environmentKey");
  const requestPath = `/segments/${path(input, "projectKey")}/${encodeURIComponent(environmentKey)}/${path(input, "segmentKey")}`;
  const instructions = optionalObjectArray(input.instructions, "instructions");
  if (instructions) {
    return launchDarklyRequest(
      context.apiKey,
      {
        method: "PATCH",
        path: requestPath,
        body: compactObject({
          comment: optionalString(input.comment),
          environmentKey,
          instructions,
        }),
        contentType: "application/json; domain-model=launchdarkly.semanticpatch",
      },
      context,
    );
  }

  const merge = optionalRecord(input.merge);
  if (merge) {
    return launchDarklyRequest(
      context.apiKey,
      { method: "PATCH", path: requestPath, body: merge, contentType: "application/merge-patch+json" },
      context,
    );
  }

  return launchDarklyRequest(
    context.apiKey,
    {
      method: "PATCH",
      path: requestPath,
      body: compactObject({
        comment: optionalString(input.comment),
        patch: optionalObjectArray(input.patch, "patch") ?? [],
      }),
      contentType: "application/json",
    },
    context,
  );
}

function buildProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(input.body) ??
    compactObject({
      key: string(input, "key"),
      name: string(input, "name"),
      description: optionalString(input.description),
      includeInSnippetByDefault: optionalBoolean(input.includeInSnippetByDefault),
      tags: readOptionalStringArray(input.tags),
      defaultClientSideAvailability: optionalRecord(input.defaultClientSideAvailability),
    })
  );
}

function buildEnvironmentBody(input: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(input.body) ??
    compactObject({
      key: string(input, "key"),
      name: string(input, "name"),
      color: optionalString(input.color),
      defaultTtl: optionalInteger(input.defaultTtl),
      secureMode: optionalBoolean(input.secureMode),
      defaultTrackEvents: optionalBoolean(input.defaultTrackEvents),
      confirmChanges: optionalBoolean(input.confirmChanges),
      requireComments: optionalBoolean(input.requireComments),
      tags: readOptionalStringArray(input.tags),
      approvalSettings: optionalRecord(input.approvalSettings),
      defaults: optionalRecord(input.defaults),
    })
  );
}

function buildFeatureFlagBody(input: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(input.body) ??
    compactObject({
      key: string(input, "key"),
      name: string(input, "name"),
      kind: string(input, "kind"),
      description: optionalString(input.description),
      temporary: optionalBoolean(input.temporary),
      tags: readOptionalStringArray(input.tags),
      clientSideAvailability: optionalRecord(input.clientSideAvailability),
      variations: optionalObjectArray(input.variations, "variations"),
      defaults: optionalRecord(input.defaults),
    })
  );
}

function buildSegmentBody(input: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(input.body) ??
    compactObject({
      key: string(input, "key"),
      name: string(input, "name"),
      description: optionalString(input.description),
      tags: readOptionalStringArray(input.tags),
      included: readOptionalStringArray(input.included),
      excluded: readOptionalStringArray(input.excluded),
      rules: optionalObjectArray(input.rules, "rules"),
      unbounded: optionalBoolean(input.unbounded),
      unboundedContextKind: optionalString(input.unboundedContextKind),
    })
  );
}

function buildTeamBody(input: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(input.body) ??
    compactObject({
      key: string(input, "key"),
      name: string(input, "name"),
      description: optionalString(input.description),
      customRoleKeys: readOptionalStringArray(input.customRoleKeys),
      memberIDs: readOptionalStringArray(input.memberIds),
      maintainerIds: readOptionalStringArray(input.maintainerIds),
      roleAttributes: optionalRecord(input.roleAttributes),
    })
  );
}

function buildTokenBody(input: Record<string, unknown>): Record<string, unknown> {
  return (
    optionalRecord(input.body) ??
    compactObject({
      name: string(input, "name"),
      description: optionalString(input.description),
      role: optionalString(input.role),
      customRoleIds: readOptionalStringArray(input.customRoleIds),
      inlineRole: optionalRecord(input.inlineRole),
      serviceToken: optionalBoolean(input.serviceToken),
      defaultApiVersion: optionalInteger(input.defaultApiVersion),
    })
  );
}

function listQuery(
  input: Record<string, unknown>,
  extra: Record<string, LaunchDarklyQueryValue> = {},
): Record<string, LaunchDarklyQueryValue> {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    filter: optionalString(input.filter),
    sort: optionalString(input.sort),
    ...extra,
  });
}

function contextPage(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    filter: optionalString(input.filter),
    sort: optionalString(input.sort),
    limit: optionalInteger(input.limit),
    continuationToken: optionalString(input.continuationToken),
  });
}

async function launchDarklyRequest<T = unknown>(
  apiKey: string,
  input: LaunchDarklyRequestInput,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  phase: LaunchDarklyRequestPhase = "execute",
): Promise<T> {
  const url = new URL(`${launchDarklyApiBaseUrl}${input.path}`);
  appendQuery(url, input.query);

  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: headers(apiKey, input.contentType),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `LaunchDarkly ${phase} request failed: ${error instanceof Error ? error.message : "network error"}`,
    );
  }

  if (!response.ok) {
    throw await launchDarklyError(response, phase);
  }
  if (input.expectEmpty || response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, "LaunchDarkly returned a non-JSON response");
  }
}

function headers(apiKey: string, contentType?: string): Record<string, string> {
  return compactObject({
    authorization: apiKey,
    accept: "application/json",
    "ld-api-version": launchDarklyApiVersion,
    "content-type": contentType,
  }) as Record<string, string>;
}

function appendQuery(url: URL, query?: Record<string, LaunchDarklyQueryValue>): void {
  if (!query) {
    return;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

async function launchDarklyError(response: Response, phase: LaunchDarklyRequestPhase): Promise<ProviderRequestError> {
  const text = await response.text().catch(() => "");
  const payload = parseObject(text);
  return new ProviderRequestError(
    response.status,
    readErrorMessage(payload) ?? `LaunchDarkly ${phase} request failed with status ${response.status}`,
    payload,
  );
}

function parseObject(text: string): Record<string, unknown> | undefined {
  if (!text) {
    return undefined;
  }
  try {
    return optionalRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function readErrorMessage(payload?: Record<string, unknown>): string | undefined {
  if (!payload) {
    return undefined;
  }
  const direct = firstString(optionalString(payload.message), optionalString(payload.error));
  if (direct) {
    return direct;
  }
  if (!Array.isArray(payload.errors)) {
    return undefined;
  }

  const messages = payload.errors
    .map((entry) => {
      const record = optionalRecord(entry);
      return record ? firstString(optionalString(record.message), optionalString(record.error)) : undefined;
    })
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function readOptionalQueryStringArray(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "string" ? [value] : stringArray(value, "kind");
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  return value == null ? undefined : stringArray(value, "string array");
}

function optionalObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  return value == null ? undefined : objectArray(value, fieldName);
}

function path(input: Record<string, unknown>, key: string): string {
  return encodeURIComponent(string(input, key));
}

function string(input: Record<string, unknown>, key: string): string {
  return requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
}

function scopedTokenLabel(payload: Record<string, unknown>): string | undefined {
  const projectName = optionalString(payload.projectName);
  const environmentName = optionalString(payload.environmentName);
  if (projectName && environmentName) {
    return `${projectName} / ${environmentName}`;
  }
  return projectName ?? environmentName;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => Boolean(value));
}
