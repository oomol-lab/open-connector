import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, definedBody, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";

const service = "pivotal_tracker";
const apiBaseUrl = "https://www.pivotaltracker.com/services/v5";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const pivotalTrackerActionHandlers: ProviderActionHandlers<"pivotal_tracker", Handler> = {
  async get_current_user(_input, context) {
    return { user: await trackerRequest("/me", context) };
  },
  async list_projects(input, context) {
    return {
      projects: arrayPayload(await trackerRequest("/projects", context, { query: paginationQuery(input) }), "projects"),
    };
  },
  async get_project(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    return { project: await trackerRequest(`/projects/${projectId}`, context, { query: fieldsQuery(input) }) };
  },
  async list_project_stories(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    const stories = await trackerRequest(`/projects/${projectId}/stories`, context, {
      query: compactObject({
        filter: optionalString(input.filter),
        with_state: optionalString(input.withState),
        with_story_type: optionalString(input.withStoryType),
        ...paginationQuery(input),
      }),
    });
    return { stories: arrayPayload(stories, "stories") };
  },
  async get_story(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    const storyId = pathId(input.storyId, "storyId");
    return {
      story: await trackerRequest(`/projects/${projectId}/stories/${storyId}`, context, { query: fieldsQuery(input) }),
    };
  },
  async create_story(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    return {
      story: await trackerRequest(`/projects/${projectId}/stories`, context, {
        method: "POST",
        body: definedBody({
          name: requiredString(input.name, "name"),
          story_type: optionalString(input.storyType),
          current_state: optionalString(input.currentState),
          description: optionalString(input.description),
          estimate: input.estimate,
          requested_by_id: input.requestedById,
          owner_ids: input.ownerIds,
          labels: Array.isArray(input.labelNames)
            ? input.labelNames.map((name) => ({ name: String(name) }))
            : undefined,
        }),
      }),
    };
  },
  async update_story_state(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    const storyId = pathId(input.storyId, "storyId");
    return {
      story: await trackerRequest(`/projects/${projectId}/stories/${storyId}`, context, {
        method: "PUT",
        body: { current_state: requiredString(input.currentState, "currentState") },
      }),
    };
  },
  async list_story_comments(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    const storyId = pathId(input.storyId, "storyId");
    const comments = await trackerRequest(`/projects/${projectId}/stories/${storyId}/comments`, context, {
      query: paginationQuery(input),
    });
    return { comments: arrayPayload(comments, "comments") };
  },
  async create_story_comment(input, context) {
    const projectId = pathId(input.projectId, "projectId");
    const storyId = pathId(input.storyId, "storyId");
    return {
      comment: await trackerRequest(`/projects/${projectId}/stories/${storyId}/comments`, context, {
        method: "POST",
        body: { text: requiredString(input.text, "text") },
      }),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, pivotalTrackerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = objectPayload(
      await trackerRequest("/me", { apiKey: input.apiKey, fetcher, signal }, "validate"),
      "Pivotal Tracker /me",
    );
    const id = typeof user.id === "number" ? String(user.id) : optionalString(user.id);
    return {
      profile: {
        accountId: id,
        displayName: firstString(user, ["name", "username", "email"]) ?? "Pivotal Tracker API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/me",
        username: optionalString(user.username),
        email: optionalString(user.email),
      },
    };
  },
};

function trackerRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options:
    | "validate"
    | {
        method?: string;
        query?: Record<string, string | number | undefined>;
        body?: unknown;
      } = {},
): Promise<unknown> {
  const phase = options === "validate" ? "validate" : "execute";
  const requestOptions = typeof options === "object" ? options : {};
  return requestJson({
    providerName: "Pivotal Tracker",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    method: requestOptions.method,
    query: requestOptions.query,
    body: requestOptions.body,
    phase,
    headers: {
      "X-TrackerToken": context.apiKey,
    },
  });
}

function paginationQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    fields: optionalString(input.fields),
  });
}

function fieldsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return { fields: optionalString(input.fields) };
}

function pathId(value: unknown, fieldName: string): string {
  return encodePathSegment(requiredString(value, fieldName));
}
