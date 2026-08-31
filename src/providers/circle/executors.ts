import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "circle";
const apiBaseUrl = "https://app.circle.so/api/admin/v2";
const requestTimeoutMs = 30_000;

type CirclePhase = "validate" | "execute";
interface CircleContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CircleHandler = (input: Record<string, unknown>, context: CircleContext) => Promise<unknown>;

export const circleActionHandlers: ProviderActionHandlers<"circle", CircleHandler> = {
  async get_community(_input, context) {
    return {
      community: normalizeCommunity(await requestCircleJson({ context, path: "/community", phase: "execute" })),
    };
  },
  async list_community_members(input, context) {
    const payload = await requestCircleJson({
      context,
      path: "/community_members",
      phase: "execute",
      query: compactObject({
        page: optionalPositiveIntegerString(input.page, "page"),
        per_page: optionalPositiveIntegerString(input.per_page, "per_page"),
        status: optionalString(input.status),
        member_tag_ids: optionalIntegerListString(input.member_tag_ids),
      }),
    });
    return { pagination: normalizePagination(payload), members: readRecords(payload).map(normalizeCommunityMember) };
  },
  async get_community_member(input, context) {
    const id = positiveInteger(input.id, "id");
    return {
      member: normalizeCommunityMember(
        await requestCircleJson({ context, path: `/community_members/${id}`, phase: "execute" }),
      ),
    };
  },
  async list_posts(input, context) {
    const payload = await requestCircleJson({
      context,
      path: "/posts",
      phase: "execute",
      query: compactObject({
        page: optionalPositiveIntegerString(input.page, "page"),
        per_page: optionalPositiveIntegerString(input.per_page, "per_page"),
        space_id: optionalPositiveIntegerString(input.space_id, "space_id"),
        space_group_id: optionalPositiveIntegerString(input.space_group_id, "space_group_id"),
        status: optionalString(input.status),
        search_text: optionalString(input.search_text),
        sort: optionalString(input.sort),
      }),
    });
    return { pagination: normalizePagination(payload), posts: readRecords(payload).map(normalizePost) };
  },
  async get_post(input, context) {
    const id = positiveInteger(input.id, "id");
    return { post: normalizePost(await requestCircleJson({ context, path: `/posts/${id}`, phase: "execute" })) };
  },
  async list_space_groups(input, context) {
    const payload = await requestCircleJson({
      context,
      path: "/space_groups",
      phase: "execute",
      query: compactObject({
        page: optionalPositiveIntegerString(input.page, "page"),
        per_page: optionalPositiveIntegerString(input.per_page, "per_page"),
        name: optionalString(input.name),
      }),
    });
    return { pagination: normalizePagination(payload), space_groups: readRecords(payload).map(normalizeSpaceGroup) };
  },
  async get_space_group(input, context) {
    const id = positiveInteger(input.id, "id");
    return {
      space_group: normalizeSpaceGroup(
        await requestCircleJson({ context, path: `/space_groups/${id}`, phase: "execute" }),
      ),
    };
  },
  async list_space_members(input, context) {
    const payload = await requestCircleJson({
      context,
      path: "/space_members",
      phase: "execute",
      query: compactObject({
        page: optionalPositiveIntegerString(input.page, "page"),
        per_page: optionalPositiveIntegerString(input.per_page, "per_page"),
        space_id: String(positiveInteger(input.space_id, "space_id")),
        status: optionalString(input.status),
      }),
    });
    return { pagination: normalizePagination(payload), space_members: readRecords(payload).map(normalizeSpaceMember) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, circleActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const community = normalizeCommunity(
      await requestCircleJson({
        context: { apiKey: input.apiKey, fetcher, signal },
        path: "/community",
        phase: "validate",
      }),
    );
    return {
      profile: {
        accountId: String(community.id),
        displayName: optionalString(community.name) ?? optionalString(community.slug) ?? "Circle Community",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/community",
        communityId: community.id,
        communityName: optionalString(community.name),
        communitySlug: optionalString(community.slug),
      }),
    };
  },
};

async function requestCircleJson(input: {
  context: CircleContext;
  path: string;
  phase: CirclePhase;
  query?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>> {
  const signal = input.context.signal
    ? AbortSignal.any([input.context.signal, AbortSignal.timeout(requestTimeoutMs)])
    : AbortSignal.timeout(requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildUrl(input.path, input.query ?? {}), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    payload = await readJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (isAbortLikeError(error)) throw new ProviderRequestError(504, "Circle request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Circle request failed: ${error.message}` : "Circle request failed",
    );
  }
  if (!response.ok) throw createError(response.status, payload, input.phase);
  return requiredRecord(payload, "Circle payload", providerError);
}

function buildUrl(path: string, query: Record<string, string | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Circle returned invalid JSON");
  }
}

function createError(status: number, payload: unknown, phase: CirclePhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Circle request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  const details = optionalRecord(record?.error_details);
  return optionalString(details?.message) ?? optionalString(record?.message);
}

function normalizePagination(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    page: optionalInteger(payload.page) ?? 1,
    per_page: optionalInteger(payload.per_page) ?? readRecords(payload).length,
    has_next_page: optionalBoolean(payload.has_next_page) ?? false,
    count: optionalInteger(payload.count) ?? readRecords(payload).length,
    page_count: optionalInteger(payload.page_count) ?? 1,
  };
}

function readRecords(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(payload.records)
    ? payload.records.map((item) => requiredRecord(item, "Circle record", providerError))
    : [];
}

function normalizeCommunity(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredInteger(payload.id, "community.id"),
    name: nullableString(payload.name),
    slug: nullableString(payload.slug),
    locale: nullableString(payload.locale),
    is_private: nullableBoolean(payload.is_private),
    created_at: nullableString(payload.created_at),
    updated_at: nullableString(payload.updated_at),
    raw: payload,
  };
}

function normalizeCommunityMember(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredInteger(payload.id, "community_member.id"),
    user_id: nullableInteger(payload.user_id),
    name: nullableString(payload.name),
    first_name: nullableString(payload.first_name),
    last_name: nullableString(payload.last_name),
    email: nullableString(payload.email),
    headline: nullableString(payload.headline),
    status: nullableString(payload.status),
    profile_url: nullableString(payload.profile_url),
    public_uid: nullableString(payload.public_uid),
    avatar_url: nullableString(payload.avatar_url),
    community_id: nullableInteger(payload.community_id),
    created_at: nullableString(payload.created_at),
    updated_at: nullableString(payload.updated_at),
    raw: payload,
  };
}

function normalizePost(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredInteger(payload.id, "post.id"),
    status: nullableString(payload.status),
    name: nullableString(payload.name),
    slug: nullableString(payload.slug),
    url: nullableString(payload.url),
    space_id: nullableInteger(payload.space_id),
    space_group_id: nullableInteger(payload.space_group_id),
    user_id: nullableInteger(payload.user_id),
    user_email: nullableString(payload.user_email),
    user_name: nullableString(payload.user_name),
    comments_count: nullableInteger(payload.comments_count),
    likes_count: nullableInteger(payload.likes_count),
    published_at: nullableString(payload.published_at),
    created_at: nullableString(payload.created_at),
    updated_at: nullableString(payload.updated_at),
    raw: payload,
  };
}

function normalizeSpaceGroup(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredInteger(payload.id, "space_group.id"),
    name: nullableString(payload.name),
    slug: nullableString(payload.slug),
    community_id: nullableInteger(payload.community_id),
    spaces_count: nullableInteger(payload.spaces_count),
    space_group_members_count: nullableInteger(payload.space_group_members_count),
    is_hidden_from_non_members: nullableBoolean(payload.is_hidden_from_non_members),
    hide_members_count: nullableBoolean(payload.hide_members_count),
    created_at: nullableString(payload.created_at),
    updated_at: nullableString(payload.updated_at),
    raw: payload,
  };
}

function normalizeSpaceMember(payload: Record<string, unknown>): Record<string, unknown> {
  const communityMember = optionalRecord(payload.community_member);
  return {
    id: requiredInteger(payload.id, "space_member.id"),
    user_id: nullableInteger(payload.user_id),
    space_id: nullableInteger(payload.space_id),
    community_member_id: nullableInteger(payload.community_member_id),
    status: nullableString(payload.status),
    access_type: nullableString(payload.access_type),
    moderator: nullableBoolean(payload.moderator),
    notification_type: nullableString(payload.notification_type),
    community_member: communityMember ? { ...communityMember, raw: communityMember } : null,
    created_at: nullableString(payload.created_at),
    updated_at: nullableString(payload.updated_at),
    raw: payload,
  };
}

function nullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function nullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function nullableBoolean(value: unknown): boolean | null {
  return optionalBoolean(value) ?? null;
}

function requiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) throw new ProviderRequestError(502, `Circle returned invalid ${fieldName}`);
  return parsed;
}

function positiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0)
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  return parsed;
}

function optionalPositiveIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value == null || value === "") return undefined;
  return String(positiveInteger(value, fieldName));
}

function optionalIntegerListString(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.map((item) => String(positiveInteger(item, "member_tag_ids"))).join(",");
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
