import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const apiPathPrefix = "/api/v4";
const validationPath = "/users/me";

interface MattermostContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type MattermostPhase = "validate" | "execute";
type MattermostActionHandler = ProviderRuntimeHandler<MattermostContext>;

export const mattermostActionHandlers: ProviderActionHandlers<"mattermost", MattermostActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestMattermostJson({ path: validationPath, context, phase: "execute" });
    return { user: requireObject(payload, "Mattermost user"), raw: payload };
  },
  async list_user_teams(_input, context) {
    const payload = await requestMattermostJson({ path: "/users/me/teams", context, phase: "execute" });
    return { teams: readObjectArray(payload, "Mattermost teams"), raw: payload };
  },
  async get_team(input, context) {
    const payload = await requestMattermostJson({
      path: `/teams/${toPathSegment(input.teamId, "teamId")}`,
      context,
      phase: "execute",
    });
    return { team: requireObject(payload, "Mattermost team"), raw: payload };
  },
  async list_team_channels(input, context) {
    const payload = await requestMattermostJson({
      path: `/teams/${toPathSegment(input.teamId, "teamId")}/channels`,
      context,
      phase: "execute",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      }),
    });
    return { channels: readObjectArray(payload, "Mattermost channels"), raw: payload };
  },
  async get_channel(input, context) {
    const payload = await requestMattermostJson({
      path: `/channels/${toPathSegment(input.channelId, "channelId")}`,
      context,
      phase: "execute",
    });
    return { channel: requireObject(payload, "Mattermost channel"), raw: payload };
  },
  async list_channel_posts(input, context) {
    assertSinceQuery(input);
    const payload = await requestMattermostJson({
      path: `/channels/${toPathSegment(input.channelId, "channelId")}/posts`,
      context,
      phase: "execute",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        since: optionalInteger(input.since),
        before: optionalString(input.beforePostId),
        after: optionalString(input.afterPostId),
      }),
    });
    return normalizePostListPayload(payload);
  },
  async create_post(input, context) {
    const payload = await requestMattermostJson({
      path: "/posts",
      method: "POST",
      context,
      phase: "execute",
      body: compactObject({
        channel_id: requiredString(input.channelId, "channelId", providerInputError),
        message: requiredString(input.message, "message", providerInputError),
        root_id: optionalString(input.rootId),
        props: optionalRecord(input.props),
      }),
    });
    return { post: requireObject(payload, "Mattermost post"), raw: payload };
  },
};

export async function validateMattermostCredential(
  input: { apiKey: string; instanceUrl: unknown },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const urls = normalizeMattermostUrls(input.instanceUrl);
  const context = { apiKey: input.apiKey, apiBaseUrl: urls.apiBaseUrl, fetcher, signal };
  const payload = await requestMattermostJson({ path: validationPath, context, phase: "validate" });
  const user = requireObject(payload, "Mattermost user");
  const profileId = optionalString(user.id) ?? urls.instanceUrl;
  return {
    profile: {
      accountId: profileId,
      displayName: buildAccountLabel(user, urls.instanceUrl),
    },
    grantedScopes: [],
    metadata: compactObject({
      instanceUrl: urls.instanceUrl,
      apiBaseUrl: urls.apiBaseUrl,
      validationEndpoint: validationPath,
      userId: optionalString(user.id),
      username: optionalString(user.username),
      email: optionalString(user.email),
    }),
  };
}

export function normalizeMattermostUrls(input: unknown): { instanceUrl: string; apiBaseUrl: string } {
  const raw = optionalString(input);
  if (!raw) {
    throw new ProviderRequestError(400, "instanceUrl is required");
  }
  const url = assertPublicHttpUrl(hasUrlScheme(raw) ? raw : `https://${raw}`, {
    fieldName: "instanceUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "instanceUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "instanceUrl must not include credentials");
  }
  url.search = "";
  url.hash = "";
  url.pathname = trimTrailingSlashes(url.pathname === "/" ? "" : url.pathname);
  if (url.pathname.endsWith(apiPathPrefix)) {
    url.pathname = url.pathname.slice(0, -apiPathPrefix.length);
  }
  const serialized = url.toString();
  const instanceUrl = serialized.endsWith("/") ? serialized.slice(0, -1) : serialized;
  return { instanceUrl, apiBaseUrl: `${instanceUrl}${apiPathPrefix}` };
}

async function requestMattermostJson(options: {
  path: string;
  context: MattermostContext;
  phase: MattermostPhase;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${options.context.apiBaseUrl}${options.path}`);
  appendQuery(url, options.query);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${options.context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mattermost request failed: ${error.message}` : "Mattermost request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createMattermostError(response.status, payload, options.phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Mattermost returned malformed JSON");
    }
    return { message: text };
  }
}

function createMattermostError(status: number, payload: unknown, phase: MattermostPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Mattermost request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
}

function toPathSegment(value: unknown, fieldName: string): string {
  const segment = requiredString(value, fieldName, providerInputError);
  if (segment.includes("/") || segment.includes("?") || segment.includes("#")) {
    throw new ProviderRequestError(400, `${fieldName} must be a Mattermost path segment`);
  }
  return encodeURIComponent(segment);
}

function requireObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} response was not an object`);
  }
  return object;
}

function readObjectArray(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} response was not an array`);
  }
  return payload.map((item, index) => {
    const object = optionalRecord(item);
    if (!object) {
      throw new ProviderRequestError(502, `${label} response item ${index} was not an object`);
    }
    return object;
  });
}

function normalizePostListPayload(payload: unknown): Record<string, unknown> {
  const raw = requireObject(payload, "Mattermost post list");
  const order = Array.isArray(raw.order) ? raw.order.filter((item): item is string => typeof item === "string") : [];
  const postsById = optionalRecord(raw.posts);
  const posts =
    postsById && order.length > 0
      ? order.map((id) => optionalRecord(postsById[id]) ?? { id })
      : Object.values(postsById ?? {}).map((item) => optionalRecord(item) ?? { value: item });
  return { posts, order, raw };
}

function assertSinceQuery(input: Record<string, unknown>): void {
  if (input.since === undefined) {
    return;
  }
  for (const field of ["page", "perPage", "beforePostId", "afterPostId"]) {
    if (input[field] !== undefined) {
      throw new ProviderRequestError(400, "since cannot be used with page, perPage, beforePostId, or afterPostId.");
    }
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }
  return (
    optionalString(body.message) ??
    optionalString(body.error) ??
    optionalString(body.details) ??
    optionalString(body.id)
  );
}

function buildAccountLabel(user: Record<string, unknown>, instanceUrl: string): string {
  const username = optionalString(user.username);
  if (username) {
    return username;
  }
  const email = optionalString(user.email);
  if (email) {
    return email;
  }
  const fullName = [optionalString(user.first_name), optionalString(user.last_name)].filter(Boolean).join(" ");
  return fullName || `Mattermost ${new URL(instanceUrl).host}`;
}

function hasUrlScheme(value: string): boolean {
  return value.includes("://");
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}
