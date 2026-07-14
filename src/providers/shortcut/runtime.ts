import type { CredentialValidationResult } from "../../core/types.ts";
import type { ShortcutActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const shortcutApiBaseUrl = "https://api.app.shortcut.com/api/v3/";
const shortcutValidatePath = "member";

type ShortcutRequestPhase = "validate" | "execute";
type ShortcutActionHandler = (
  input: Record<string, unknown>,
  context: { apiKey: string; fetcher: typeof fetch },
) => Promise<unknown>;

export const shortcutActionHandlers: Record<ShortcutActionName, ShortcutActionHandler> = {
  list_members(input, context) {
    return listMembers(input, context);
  },
  get_member(input, context) {
    return getMember(input, context);
  },
  list_workflows(_input, context) {
    return listWorkflows(context);
  },
  get_workflow(input, context) {
    return getWorkflow(input, context);
  },
  list_projects(_input, context) {
    return listProjects(context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  list_epics(input, context) {
    return listEpics(input, context);
  },
  get_epic(input, context) {
    return getEpic(input, context);
  },
  create_epic(input, context) {
    return createEpic(input, context);
  },
  update_epic(input, context) {
    return updateEpic(input, context);
  },
  list_stories(input, context) {
    return listStories(input, context);
  },
  get_story(input, context) {
    return getStory(input, context);
  },
  create_story(input, context) {
    return createStory(input, context);
  },
  update_story(input, context) {
    return updateStory(input, context);
  },
  search_stories(input, context) {
    return searchStories(input, context);
  },
};

export async function validateShortcutCredential(
  input: { apiKey?: string },
  fetcher: typeof fetch = providerFetch,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredApiKey(input.apiKey);
  const payload = await shortcutGetJson(shortcutValidatePath, apiKey, fetcher, "validate");
  const member = normalizeShortcutMember(payload);
  const profile = requireRecord(member.profile, "member.profile");

  return {
    profile: {
      accountId: member.id,
      displayName:
        readOptionalString(profile.name) ??
        readOptionalString(profile.mention_name) ??
        readOptionalString(profile.email_address) ??
        member.id,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: "https://api.app.shortcut.com/api/v3",
      validationEndpoint: "/member",
      memberId: member.id,
      memberName: readOptionalString(profile.name),
      memberMentionName: readOptionalString(profile.mention_name),
      memberEmail: readOptionalString(profile.email_address),
    }),
  };
}

export async function executeShortcutAction(
  input: {
    actionName: ShortcutActionName;
    input: Record<string, unknown>;
    apiKey?: string;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const apiKey = readRequiredApiKey(input.apiKey);
  return shortcutActionHandlers[input.actionName](input.input, {
    apiKey,
    fetcher,
  });
}

async function listMembers(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutGetJson(
    buildPathWithQuery("members", {
      org_public_id: readOptionalIntegerValue(input.orgId),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    members: readArray(payload, "members").map((item) => normalizeShortcutMember(item)),
  };
}

async function getMember(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const memberId = readRequiredString(input.memberId, "memberId");
  const payload = await shortcutGetJson(
    buildPathWithQuery(`members/${encodeURIComponent(memberId)}`, {
      org_public_id: readOptionalIntegerValue(input.orgId),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    member: normalizeShortcutMember(payload),
  };
}

async function listWorkflows(context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutGetJson("workflows", context.apiKey, context.fetcher, "execute");
  return {
    workflows: readArray(payload, "workflows").map((item) => normalizeShortcutWorkflow(item)),
  };
}

async function getWorkflow(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const workflowId = readRequiredPositiveInteger(input.workflowId, "workflowId");
  const payload = await shortcutGetJson(`workflows/${workflowId}`, context.apiKey, context.fetcher, "execute");
  return {
    workflow: normalizeShortcutWorkflow(payload),
  };
}

async function listProjects(context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutGetJson("projects", context.apiKey, context.fetcher, "execute");
  return {
    projects: readArray(payload, "projects").map((item) => normalizeShortcutProject(item)),
  };
}

async function getProject(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
  const payload = await shortcutGetJson(`projects/${projectId}`, context.apiKey, context.fetcher, "execute");
  return {
    project: normalizeShortcutProject(payload),
  };
}

async function listEpics(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutGetJson(
    buildPathWithQuery("epics", {
      includes_description: readOptionalBoolean(input.includesDescription),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    epics: readArray(payload, "epics").map((item) => normalizeShortcutEpic(item)),
  };
}

async function getEpic(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const epicId = readRequiredPositiveInteger(input.epicId, "epicId");
  const payload = await shortcutGetJson(`epics/${epicId}`, context.apiKey, context.fetcher, "execute");
  return {
    epic: normalizeShortcutEpic(payload),
  };
}

async function createEpic(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutPostJson(
    "epics",
    buildShortcutEpicBody(input),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    epic: normalizeShortcutEpic(payload),
  };
}

async function updateEpic(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const epicId = readRequiredPositiveInteger(input.epicId, "epicId");
  const payload = await shortcutPutJson(
    `epics/${epicId}`,
    buildShortcutEpicBody(input),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    epic: normalizeShortcutEpic(payload),
  };
}

async function listStories(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const projectId = readRequiredPositiveInteger(input.projectId, "projectId");
  const payload = await shortcutGetJson(
    buildPathWithQuery(`projects/${projectId}/stories`, {
      includes_description: readOptionalBoolean(input.includesDescription),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    stories: readArray(payload, "stories").map((item) => normalizeShortcutStory(item)),
  };
}

async function getStory(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const storyId = readRequiredPositiveInteger(input.storyId, "storyId");
  const payload = await shortcutGetJson(`stories/${storyId}`, context.apiKey, context.fetcher, "execute");
  return {
    story: normalizeShortcutStory(payload),
  };
}

async function createStory(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutPostJson(
    "stories",
    buildShortcutStoryBody(input),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    story: normalizeShortcutStory(payload),
  };
}

async function updateStory(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const storyId = readRequiredPositiveInteger(input.storyId, "storyId");
  const payload = await shortcutPutJson(
    `stories/${storyId}`,
    buildShortcutStoryBody(input),
    context.apiKey,
    context.fetcher,
    "execute",
  );
  return {
    story: normalizeShortcutStory(payload),
  };
}

async function searchStories(input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await shortcutGetJson(
    buildPathWithQuery("search/stories", {
      query: readRequiredString(input.query, "query"),
      next: readOptionalString(input.next),
      detail: readOptionalString(input.detail),
      page_size: readOptionalIntegerValue(input.pageSize),
      entity_types: readOptionalStringArray(input.entityTypes)?.join(","),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );

  const record = requireRecord(payload, "search stories response");
  return {
    stories: readArray(record.data, "searchStories.data").map((item) => normalizeShortcutStory(item)),
    next: readOptionalString(record.next) ?? null,
    total: readOptionalIntegerValue(record.total) ?? null,
  };
}

function buildShortcutEpicBody(input: Record<string, unknown>) {
  return compactObject({
    name: readOptionalString(input.name),
    description: readOptionalNullableString(input.description),
    owner_ids: readOptionalStringArray(input.ownerIds),
    follower_ids: readOptionalStringArray(input.followerIds),
    requested_by_id: readOptionalString(input.requestedById),
    group_ids: readOptionalStringArray(input.groupIds),
    project_ids: readOptionalIntegerArray(input.projectIds),
    labels: readOptionalShortcutLabels(input.labels),
    planned_start_date: readOptionalString(input.plannedStartDate),
    deadline: readOptionalString(input.deadline),
    external_id: readOptionalNullableString(input.externalId),
    archived: readOptionalBoolean(input.archived),
  });
}

function buildShortcutStoryBody(input: Record<string, unknown>) {
  return compactObject({
    name: readOptionalString(input.name),
    description: readOptionalNullableString(input.description),
    workflow_state_id: readOptionalIntegerValue(input.workflowStateId),
    project_id: readOptionalIntegerValue(input.projectId),
    story_type: readOptionalString(input.storyType),
    epic_id: readOptionalIntegerValue(input.epicId),
    owner_ids: readOptionalStringArray(input.ownerIds),
    follower_ids: readOptionalStringArray(input.followerIds),
    requested_by_id: readOptionalString(input.requestedById),
    estimate: readOptionalNullableInteger(input.estimate),
    due_date: readOptionalString(input.dueDate),
    external_id: readOptionalNullableString(input.externalId),
    iteration_id: readOptionalIntegerValue(input.iterationId),
    archived: readOptionalBoolean(input.archived),
  });
}

async function shortcutGetJson(path: string, apiKey: string, fetcher: typeof fetch, phase: ShortcutRequestPhase) {
  return shortcutRequest({
    path,
    method: "GET",
    apiKey,
    fetcher,
    phase,
  });
}

async function shortcutPostJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: ShortcutRequestPhase,
) {
  return shortcutRequest({
    path,
    method: "POST",
    apiKey,
    fetcher,
    phase,
    body,
  });
}

async function shortcutPutJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: ShortcutRequestPhase,
) {
  return shortcutRequest({
    path,
    method: "PUT",
    apiKey,
    fetcher,
    phase,
    body,
  });
}

async function shortcutRequest(input: {
  path: string;
  method: "GET" | "POST" | "PUT";
  apiKey: string;
  fetcher: typeof fetch;
  phase: ShortcutRequestPhase;
  body?: Record<string, unknown>;
}) {
  const url = new URL(input.path, shortcutApiBaseUrl);

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: shortcutHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `shortcut request failed: ${error.message}` : "shortcut request failed",
    );
  }

  const payload = await readShortcutPayload(response);
  if (!response.ok) {
    throw createShortcutError(response.status, payload, input.phase);
  }

  return payload;
}

function shortcutHeaders(apiKey: string, extraHeaders: Record<string, string>) {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "Shortcut-Token": apiKey,
    ...extraHeaders,
  };
}

async function readShortcutPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createShortcutError(status: number, payload: unknown, phase: ShortcutRequestPhase) {
  const message = extractShortcutErrorMessage(payload) ?? "Shortcut request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && [400, 401, 403, 404].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractShortcutErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelMessage =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (Array.isArray(record.errors)) {
    const messages = record.errors
      .map((item) => {
        const itemRecord = optionalRecord(item);
        return (
          optionalString(itemRecord?.message) ?? optionalString(itemRecord?.error) ?? optionalString(itemRecord?.detail)
        );
      })
      .filter((value): value is string => Boolean(value));
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return undefined;
}

function buildPathWithQuery(path: string, query: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, shortcutApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

function normalizeShortcutMember(value: unknown) {
  const record = requireRecord(value, "member");
  return compactObject({
    id: readRequiredString(record.id, "member.id"),
    role: readOptionalNullableString(record.role),
    disabled: readRequiredBoolean(record.disabled, "member.disabled"),
    global_id: readOptionalNullableString(record.global_id),
    entity_type: readRequiredString(record.entity_type, "member.entity_type"),
    group_ids: readStringArray(record.group_ids),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
    state: record.state,
    profile: normalizeShortcutMemberProfile(record.profile),
  });
}

function normalizeShortcutMemberProfile(value: unknown) {
  const record = requireRecord(value, "member.profile");
  return compactObject({
    id: readOptionalString(record.id),
    name: readOptionalString(record.name),
    mention_name: readOptionalNullableString(record.mention_name),
    email_address: readOptionalNullableString(record.email_address),
    deactivated: readOptionalBoolean(record.deactivated),
    two_factor_auth_activated: readOptionalBoolean(record.two_factor_auth_activated),
    is_owner: readOptionalBoolean(record.is_owner),
    disabled: readOptionalBoolean(record.disabled),
    entity_type: readOptionalString(record.entity_type),
    gravatar_hash: readOptionalNullableString(record.gravatar_hash),
    icon: normalizeOptionalShortcutIcon(record.icon),
  });
}

function normalizeOptionalShortcutIcon(value: unknown) {
  if (value == null) {
    return null;
  }
  const record = requireRecord(value, "icon");
  return compactObject({
    id: readOptionalIntegerValue(record.id),
    url: readOptionalString(record.url),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
    entity_type: readOptionalString(record.entity_type),
  });
}

function normalizeShortcutWorkflow(value: unknown) {
  const record = requireRecord(value, "workflow");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "workflow.id"),
    name: readRequiredString(record.name, "workflow.name"),
    description: readOptionalNullableString(record.description),
    team_id: readRequiredPositiveInteger(record.team_id, "workflow.team_id"),
    default_state_id: readRequiredPositiveInteger(record.default_state_id, "workflow.default_state_id"),
    auto_assign_owner: readRequiredBoolean(record.auto_assign_owner, "workflow.auto_assign_owner"),
    project_ids: readIntegerArray(record.project_ids),
    states: readArray(record.states, "workflow.states").map((item) => normalizeShortcutWorkflowState(item)),
    entity_type: readRequiredString(record.entity_type, "workflow.entity_type"),
    global_id: readOptionalNullableString(record.global_id),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
  });
}

function normalizeShortcutWorkflowState(value: unknown) {
  const record = requireRecord(value, "workflow state");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "workflowState.id"),
    name: readRequiredString(record.name, "workflowState.name"),
    type: readOptionalNullableString(record.type),
    color: readOptionalNullableString(record.color),
    description: readOptionalNullableString(record.description),
    verb: readOptionalNullableString(record.verb),
    position: readOptionalIntegerValue(record.position),
    num_stories: readOptionalIntegerValue(record.num_stories),
    num_story_templates: readOptionalIntegerValue(record.num_story_templates),
    entity_type: readOptionalString(record.entity_type),
    global_id: readOptionalNullableString(record.global_id),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
  });
}

function normalizeShortcutProject(value: unknown) {
  const record = requireRecord(value, "project");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "project.id"),
    name: readRequiredString(record.name, "project.name"),
    description: readOptionalNullableString(record.description),
    abbreviation: readOptionalNullableString(record.abbreviation),
    color: readOptionalNullableString(record.color),
    archived: readRequiredBoolean(record.archived, "project.archived"),
    team_id: readRequiredPositiveInteger(record.team_id, "project.team_id"),
    workflow_id: readRequiredPositiveInteger(record.workflow_id, "project.workflow_id"),
    iteration_length: readRequiredInteger(record.iteration_length, "project.iteration_length"),
    start_time: readOptionalNullableString(record.start_time),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
    entity_type: readRequiredString(record.entity_type, "project.entity_type"),
    global_id: readOptionalNullableString(record.global_id),
    app_url: readRequiredString(record.app_url, "project.app_url"),
    follower_ids: readStringArray(record.follower_ids),
    show_thermometer: readRequiredBoolean(record.show_thermometer, "project.show_thermometer"),
    days_to_thermometer: readRequiredInteger(record.days_to_thermometer, "project.days_to_thermometer"),
    stats: normalizeShortcutProjectStats(record.stats),
  });
}

function normalizeShortcutProjectStats(value: unknown) {
  const record = requireRecord(value, "project.stats");
  return compactObject({
    num_points: readOptionalIntegerValue(record.num_points),
    num_stories: readOptionalIntegerValue(record.num_stories),
    num_related_documents: readOptionalIntegerValue(record.num_related_documents),
  });
}

function normalizeShortcutEpic(value: unknown) {
  const record = requireRecord(value, "epic");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "epic.id"),
    name: readRequiredString(record.name, "epic.name"),
    description: readOptionalNullableString(record.description),
    app_url: readRequiredString(record.app_url, "epic.app_url"),
    archived: readRequiredBoolean(record.archived, "epic.archived"),
    completed: readRequiredBoolean(record.completed, "epic.completed"),
    started: readRequiredBoolean(record.started, "epic.started"),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
    started_at: readOptionalNullableString(record.started_at),
    completed_at: readOptionalNullableString(record.completed_at),
    deadline: readOptionalNullableString(record.deadline),
    planned_start_date: readOptionalNullableString(record.planned_start_date),
    position: readOptionalIntegerValue(record.position),
    state: readOptionalNullableString(record.state),
    owner_ids: readStringArray(record.owner_ids),
    follower_ids: readStringArray(record.follower_ids),
    group_ids: readStringArray(record.group_ids),
    label_ids: readIntegerArray(record.label_ids),
    project_ids: readIntegerArray(record.project_ids),
    objective_ids: readIntegerArray(record.objective_ids),
    labels: readArray(record.labels, "epic.labels").map((item) => normalizeShortcutLabel(item)),
    stats: normalizeShortcutEpicStats(record.stats),
    requested_by_id: readOptionalNullableString(record.requested_by_id),
    entity_type: readRequiredString(record.entity_type, "epic.entity_type"),
    external_id: readOptionalNullableString(record.external_id),
    workflow_state_id: readOptionalNullableInteger(record.workflow_state_id),
  });
}

function normalizeShortcutEpicStats(value: unknown) {
  const record = requireRecord(value, "epic.stats");
  return compactObject({
    num_points: readOptionalIntegerValue(record.num_points),
    num_points_done: readOptionalIntegerValue(record.num_points_done),
    num_points_started: readOptionalIntegerValue(record.num_points_started),
    num_points_unstarted: readOptionalIntegerValue(record.num_points_unstarted),
    num_points_backlog: readOptionalIntegerValue(record.num_points_backlog),
    num_stories_total: readOptionalIntegerValue(record.num_stories_total),
    num_stories_done: readOptionalIntegerValue(record.num_stories_done),
    num_stories_started: readOptionalIntegerValue(record.num_stories_started),
    num_stories_unstarted: readOptionalIntegerValue(record.num_stories_unstarted),
    num_stories_backlog: readOptionalIntegerValue(record.num_stories_backlog),
    num_related_documents: readOptionalIntegerValue(record.num_related_documents),
  });
}

function normalizeShortcutStory(value: unknown) {
  const record = requireRecord(value, "story");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "story.id"),
    name: readRequiredString(record.name, "story.name"),
    description: readOptionalNullableString(record.description),
    app_url: readRequiredString(record.app_url, "story.app_url"),
    story_type: readOptionalNullableString(record.story_type),
    archived: readRequiredBoolean(record.archived, "story.archived"),
    blocked: readRequiredBoolean(record.blocked, "story.blocked"),
    blocker: readRequiredBoolean(record.blocker, "story.blocker"),
    completed: readRequiredBoolean(record.completed, "story.completed"),
    started: readRequiredBoolean(record.started, "story.started"),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
    started_at: readOptionalNullableString(record.started_at),
    completed_at: readOptionalNullableString(record.completed_at),
    moved_at: readOptionalNullableString(record.moved_at),
    due_date: readOptionalNullableString(record.due_date),
    estimate: readOptionalNullableInteger(record.estimate),
    position: readOptionalIntegerValue(record.position),
    workflow_id: readRequiredPositiveInteger(record.workflow_id, "story.workflow_id"),
    workflow_state_id: readRequiredPositiveInteger(record.workflow_state_id, "story.workflow_state_id"),
    project_id: readOptionalNullableInteger(record.project_id),
    epic_id: readOptionalNullableInteger(record.epic_id),
    iteration_id: readOptionalNullableInteger(record.iteration_id),
    owner_ids: readStringArray(record.owner_ids),
    follower_ids: readStringArray(record.follower_ids),
    requested_by_id: readOptionalNullableString(record.requested_by_id),
    labels: readArray(record.labels, "story.labels").map((item) => normalizeShortcutLabel(item)),
    tasks: readArray(record.tasks, "story.tasks").map((item) => normalizeShortcutStoryTask(item)),
    entity_type: readRequiredString(record.entity_type, "story.entity_type"),
    external_id: readOptionalNullableString(record.external_id),
  });
}

function normalizeShortcutStoryTask(value: unknown) {
  const record = requireRecord(value, "story task");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "storyTask.id"),
    description: readRequiredString(record.description, "storyTask.description"),
    complete: readRequiredBoolean(record.complete, "storyTask.complete"),
    owner_ids: readStringArray(record.owner_ids),
    created_at: readOptionalNullableString(record.created_at),
    updated_at: readOptionalNullableString(record.updated_at),
    external_id: readOptionalNullableString(record.external_id),
  });
}

function normalizeShortcutLabel(value: unknown) {
  const record = requireRecord(value, "label");
  return compactObject({
    id: readRequiredPositiveInteger(record.id, "label.id"),
    name: readRequiredString(record.name, "label.name"),
    color: readOptionalNullableString(record.color),
    description: readOptionalNullableString(record.description),
    app_url: readOptionalNullableString(record.app_url),
    archived: readRequiredBoolean(record.archived, "label.archived"),
    entity_type: readRequiredString(record.entity_type, "label.entity_type"),
    created_at: readOptionalString(record.created_at),
    updated_at: readOptionalString(record.updated_at),
    external_id: readOptionalNullableString(record.external_id),
  });
}

function readArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item.trim() : String(item))).filter((item) => item.length > 0);
}

function readIntegerArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalInteger(item)).filter((item): item is number => item !== undefined);
}

function readOptionalShortcutLabels(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = requireRecord(item, "label");
    return compactObject({
      name: readOptionalString(record.name),
      color: readOptionalString(record.color),
      description: readOptionalNullableString(record.description),
      external_id: readOptionalNullableString(record.externalId),
    });
  });
}

function requireRecord(value: unknown, fieldName: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function readRequiredApiKey(apiKey: string | undefined) {
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return apiKey;
}

function readRequiredString(value: unknown, fieldName: string) {
  const stringValue = readOptionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return stringValue;
}

function readOptionalString(value: unknown) {
  const stringValue = optionalString(value);
  return stringValue?.trim() || undefined;
}

function readOptionalIntegerValue(value: unknown) {
  return optionalInteger(value);
}

function readOptionalNullableString(value: unknown) {
  return value === null ? null : readOptionalString(value);
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const integerValue = readOptionalIntegerValue(value);
  if (integerValue === undefined) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return integerValue;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string) {
  const integerValue = readRequiredInteger(value, fieldName);
  if (integerValue <= 0) {
    throw new ProviderRequestError(502, `${fieldName} must be a positive integer`);
  }
  return integerValue;
}

function readOptionalNullableInteger(value: unknown) {
  return value === null ? null : readOptionalIntegerValue(value);
}

function readOptionalBoolean(value: unknown) {
  return optionalBoolean(value);
}

function readRequiredBoolean(value: unknown, fieldName: string) {
  const booleanValue = readOptionalBoolean(value);
  if (booleanValue === undefined) {
    throw new ProviderRequestError(502, `${fieldName} must be a boolean`);
  }
  return booleanValue;
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = readStringArray(value);
  return items.length > 0 ? items : [];
}

function readOptionalIntegerArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return readIntegerArray(value);
}
