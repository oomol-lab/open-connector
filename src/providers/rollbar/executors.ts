import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "rollbar";
const rollbarApiBaseUrl = "https://api.rollbar.com/api/1";

type RollbarRequestPhase = "validate" | "execute";
type RollbarRecord = Record<string, unknown>;
type RollbarActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const rollbarActionHandlers: ProviderActionHandlers<"rollbar", RollbarActionHandler> = {
  async get_project(input, context) {
    const projectId = requirePositiveInteger(input.projectId, "projectId", 400);
    const payload = await requestRollbarJson({ path: `/project/${projectId}`, context, phase: "execute" });
    return { project: normalizeProject(requireResultRecord(payload, "rollbar project response")) };
  },
  async list_items(input, context) {
    const payload = await requestRollbarJson({
      path: "/items",
      query: buildListItemsQuery(input),
      context,
      phase: "execute",
    });
    const result = requireResultRecord(payload, "rollbar items response");
    return {
      page: requirePositiveInteger(result.page, "page"),
      totalCount: optionalInteger(result.total_count) ?? null,
      items: readArray(result.items).map((item) => normalizeItem(requireRecord(item, "rollbar item"))),
    };
  },
  async get_item(input, context) {
    const itemId = requirePositiveInteger(input.itemId, "itemId", 400);
    const payload = await requestRollbarJson({ path: `/item/${itemId}`, context, phase: "execute" });
    return { item: normalizeItem(requireResultRecord(payload, "rollbar item response")) };
  },
  async list_item_occurrences(input, context) {
    const itemId = requirePositiveInteger(input.itemId, "itemId", 400);
    const payload = await requestRollbarJson({
      path: `/item/${itemId}/instances`,
      query: buildOccurrenceQuery(input),
      context,
      phase: "execute",
    });
    const result = requireResultRecord(payload, "rollbar occurrence list response");
    return {
      page: requirePositiveInteger(result.page, "page"),
      occurrences: readArray(result.instances).map((item) =>
        normalizeOccurrence(requireRecord(item, "rollbar occurrence")),
      ),
    };
  },
  async get_occurrence(input, context) {
    const occurrenceId = requirePositiveInteger(input.occurrenceId, "occurrenceId", 400);
    const payload = await requestRollbarJson({ path: `/instance/${occurrenceId}`, context, phase: "execute" });
    return { occurrence: normalizeOccurrence(requireResultRecord(payload, "rollbar occurrence response")) };
  },
  async list_environments(input, context) {
    const payload = await requestRollbarJson({
      path: "/environments",
      query: buildPageLimitQuery(input),
      context,
      phase: "execute",
    });
    const result = requireResultRecord(payload, "rollbar environments response");
    return {
      page: requirePositiveInteger(result.page, "page"),
      environments: readArray(result.environments).map((item) =>
        normalizeEnvironment(requireRecord(item, "rollbar environment")),
      ),
    };
  },
  async list_deploys(input, context) {
    const payload = await requestRollbarJson({
      path: "/deploys",
      query: buildPageLimitQuery(input),
      context,
      phase: "execute",
    });
    const result = requireResultRecord(payload, "rollbar deploy list response");
    return {
      page: requirePositiveInteger(result.page, "page"),
      deploys: readArray(result.deploys).map((item) => normalizeDeploy(requireRecord(item, "rollbar deploy"))),
    };
  },
  async get_deploy(input, context) {
    const deployId = requirePositiveInteger(input.deployId, "deployId", 400);
    const payload = await requestRollbarJson({ path: `/deploy/${deployId}`, context, phase: "execute" });
    return { deploy: normalizeDeploy(requireResultRecord(payload, "rollbar deploy response")) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rollbarActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const payload = await requestRollbarJson({
      path: "/environments",
      query: { page: "1", limit: "1" },
      context: { apiKey, fetcher, signal },
      phase: "validate",
    });
    const result = requireResultRecord(payload, "rollbar validation response");
    const environments = readArray(result.environments).map((item) =>
      normalizeEnvironment(requireRecord(item, "rollbar environment")),
    );
    const firstEnvironment = environments[0];
    const projectId = firstEnvironment?.projectId;
    const tokenFingerprint = buildTokenFingerprint(apiKey);
    return {
      profile: {
        accountId: projectId ? `rollbar-project-${projectId}` : `rollbar-project-token-${tokenFingerprint}`,
        displayName: projectId ? `Rollbar project ${projectId}` : `Rollbar project token ${tokenFingerprint}`,
      },
      grantedScopes: ["rollbar.project.read"],
      metadata: compactObject({
        apiBaseUrl: rollbarApiBaseUrl,
        validationEndpoint: "/environments",
        credentialKind: "project_access_token",
        tokenScope: "read",
        environmentCount: environments.length,
        projectId,
        defaultEnvironment: firstEnvironment?.environment,
      }),
    };
  },
};

async function requestRollbarJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: RollbarRequestPhase;
  query?: Record<string, string | string[] | undefined>;
}): Promise<RollbarRecord> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildRollbarUrl(input.path, input.query), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": providerUserAgent,
        "X-Rollbar-Access-Token": input.context.apiKey,
      },
      signal: input.context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      `rollbar request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }
  if (!response.ok) throw createRollbarError(response.status, payload, input.phase);
  return requireRecord(payload, "rollbar response");
}

function buildRollbarUrl(path: string, query?: Record<string, string | string[] | undefined>): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${rollbarApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "rollbar returned invalid JSON");
  }
}

function createRollbarError(status: number, payload: unknown, phase: RollbarRequestPhase): ProviderRequestError {
  const message = extractRollbarErrorMessage(payload) ?? `rollbar request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 401 || status === 403 || status === 422)) {
    return new ProviderRequestError(status === 401 ? 401 : status, message, payload);
  }
  if (phase === "execute" && status === 401) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && (status === 400 || status === 403 || status === 404 || status === 422)) {
    return new ProviderRequestError(status === 403 ? 403 : 400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function extractRollbarErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  return record ? (optionalString(record.message) ?? optionalString(record.error)) : undefined;
}

function buildPageLimitQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    page: readOptionalPositiveIntegerString(input.page),
    limit: readOptionalPositiveIntegerString(input.limit),
  });
}

function buildOccurrenceQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    lastId: readOptionalPositiveIntegerString(input.lastId),
    page: readOptionalPositiveIntegerString(input.page),
    limit: readOptionalPositiveIntegerString(input.limit),
  });
}

function buildListItemsQuery(input: Record<string, unknown>): Record<string, string | string[] | undefined> {
  const isSnoozed = optionalBoolean(input.isSnoozed);
  return compactObject({
    assigned_user: readOptionalString(input.assignedUser),
    assigned_team: readOptionalStringArray(input.assignedTeam),
    environment: readOptionalStringArray(input.environment),
    framework: readOptionalStringArray(input.framework),
    ids: readOptionalIntegerArray(input.itemIds),
    level: readOptionalStringArray(input.level),
    page: readOptionalPositiveIntegerString(input.page),
    query: readOptionalString(input.query),
    status: readOptionalStringArray(input.status),
    is_snoozed: isSnoozed === undefined ? undefined : String(isSnoozed),
  });
}

function normalizeItem(input: RollbarRecord): Record<string, unknown> {
  return {
    id: requirePositiveInteger(input.id, "rollbar item id"),
    counter: requirePositiveInteger(input.counter, "rollbar item counter"),
    projectId: requirePositiveInteger(input.project_id, "rollbar project id"),
    title: requireString(input.title, "rollbar item title"),
    environment: requireString(input.environment, "rollbar item environment"),
    platform: optionalString(input.platform) ?? null,
    framework: optionalString(input.framework) ?? null,
    level: optionalString(input.level) ?? null,
    status: optionalString(input.status) ?? null,
    totalOccurrences: requirePositiveInteger(input.total_occurrences, "rollbar item total occurrences"),
    uniqueOccurrences: optionalInteger(input.unique_occurrences) ?? null,
    assignedUserId: optionalInteger(input.assigned_user_id) ?? null,
    assignedTeamId: optionalInteger(input.assigned_team_id) ?? null,
    groupItemId: optionalInteger(input.group_item_id) ?? null,
    lastOccurrenceId: requirePositiveInteger(input.last_occurrence_id, "rollbar item last occurrence id"),
    lastOccurrenceTimestamp: requirePositiveInteger(
      input.last_occurrence_timestamp,
      "rollbar item last occurrence timestamp",
    ),
    firstOccurrenceTimestamp: requirePositiveInteger(
      input.first_occurrence_timestamp,
      "rollbar item first occurrence timestamp",
    ),
    raw: input,
  };
}

function normalizeOccurrence(input: RollbarRecord): Record<string, unknown> {
  return {
    id: requirePositiveInteger(input.id, "rollbar occurrence id"),
    projectId: requirePositiveInteger(input.project_id, "rollbar occurrence project id"),
    itemId: requirePositiveInteger(input.item_id, "rollbar occurrence item id"),
    timestamp: requirePositiveInteger(input.timestamp, "rollbar occurrence timestamp"),
    version: requirePositiveInteger(input.version, "rollbar occurrence version"),
    billable: optionalInteger(input.billable) ?? null,
    data: requireRecord(input.data, "rollbar occurrence data"),
    raw: input,
  };
}

function normalizeEnvironment(
  input: RollbarRecord,
): { projectId: number; environment: string } & Record<string, unknown> {
  return {
    id: requirePositiveInteger(input.id, "rollbar environment id"),
    projectId: requirePositiveInteger(input.project_id, "rollbar environment project id"),
    environment: requireString(input.environment, "rollbar environment"),
    visible: requireBooleanLike(input.visible, "rollbar environment visible"),
    raw: input,
  };
}

function normalizeDeploy(input: RollbarRecord): Record<string, unknown> {
  return {
    id: requirePositiveInteger(input.id, "rollbar deploy id"),
    projectId: requirePositiveInteger(input.project_id, "rollbar deploy project id"),
    environment: requireString(input.environment, "rollbar deploy environment"),
    revision: requireString(input.revision, "rollbar deploy revision"),
    localUsername: optionalString(input.local_username) ?? null,
    comment: optionalString(input.comment) ?? null,
    status: optionalString(input.status) ?? null,
    userId: optionalInteger(input.user_id) ?? null,
    startTime: optionalInteger(input.start_time) ?? null,
    finishTime: optionalInteger(input.finish_time) ?? null,
    raw: input,
  };
}

function normalizeProject(input: RollbarRecord): Record<string, unknown> {
  const settings = optionalRecord(input.settings_data);
  const encryptionAtRest = optionalRecord(settings?.encryption_at_rest);
  const grouping = optionalRecord(settings?.grouping);
  const autoUpgrade = optionalBoolean(grouping?.auto_upgrade);
  return {
    id: requirePositiveInteger(input.id, "rollbar project id"),
    accountId: requirePositiveInteger(input.account_id, "rollbar project account id"),
    status: requireString(input.status, "rollbar project status"),
    name: requireString(input.name, "rollbar project name"),
    dateCreated: requirePositiveInteger(input.date_created, "rollbar project creation timestamp"),
    dateModified: requirePositiveInteger(input.date_modified, "rollbar project modification timestamp"),
    settings: {
      timeFormat: optionalString(settings?.time_format) ?? null,
      timezone: optionalString(settings?.timezone) ?? null,
      integrations: optionalRecord(settings?.integrations) ?? null,
      encryptionAtRest: encryptionAtRest
        ? {
            enabled: requireBooleanLike(encryptionAtRest.enabled, "rollbar encryption_at_rest enabled"),
            enabledAt: optionalInteger(encryptionAtRest.enabled_at) ?? null,
          }
        : null,
      grouping: grouping
        ? {
            autoUpgrade: autoUpgrade ?? null,
            recentVersions: Array.isArray(grouping.recent_versions)
              ? grouping.recent_versions.filter((item): item is string => typeof item === "string" && item !== "")
              : [],
          }
        : null,
    },
    raw: input,
  };
}

function buildTokenFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function requireResultRecord(payload: RollbarRecord, label: string): RollbarRecord {
  return requireRecord(payload.result, label);
}

function requireRecord(value: unknown, label: string): RollbarRecord {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} is invalid`);
  return record;
}

function requirePositiveInteger(value: unknown, fieldName: string, status = 502): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) throw new ProviderRequestError(status, `${fieldName} is missing`);
  return parsed;
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new ProviderRequestError(502, `${fieldName} is missing`);
  return parsed;
}

function requireBooleanLike(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed !== undefined) return parsed;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  throw new ProviderRequestError(502, `${fieldName} is missing`);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readOptionalPositiveIntegerString(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed == null || parsed <= 0 ? undefined : String(parsed);
}

function readOptionalString(value: unknown): string | undefined {
  return optionalString(value);
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return values.length > 0 ? values : undefined;
}

function readOptionalIntegerArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map((item) => optionalInteger(item))
    .filter((item): item is number => item != null && item > 0)
    .map((item) => String(item));
  return values.length > 0 ? values : undefined;
}
