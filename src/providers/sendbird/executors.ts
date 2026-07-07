import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { SendbirdActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRawString, pickOptionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const sendbirdUserAgent = providerUserAgent;
const sendbirdValidationPath = "/applications/settings_global";

type SendbirdQueryPrimitive = string | number | boolean;
type SendbirdQueryValue = SendbirdQueryPrimitive | SendbirdQueryPrimitive[] | undefined;
type SendbirdActionContext = {
  apiKey: string;
  applicationId: string;
  fetcher: typeof fetch;
};
type SendbirdRequestPhase = "validate" | "execute";
type SendbirdActionHandler = (input: Record<string, unknown>, context: SendbirdActionContext) => Promise<unknown>;

interface SendbirdRequestOptions {
  applicationId: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: SendbirdRequestPhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, SendbirdQueryValue>;
  body?: unknown;
  allowEmptyResponse?: boolean;
}

export const sendbirdActionHandlers: Record<SendbirdActionName, SendbirdActionHandler> = {
  list_users(input, context) {
    return sendbirdListUsers(input, context);
  },
  view_user(input, context) {
    return sendbirdViewUser(input, context);
  },
  create_user(input, context) {
    return sendbirdCreateUser(input, context);
  },
  update_user(input, context) {
    return sendbirdUpdateUser(input, context);
  },
  delete_user(input, context) {
    return sendbirdDeleteUser(input, context);
  },
  issue_session_token(input, context) {
    return sendbirdIssueSessionToken(input, context);
  },
  revoke_all_session_tokens(input, context) {
    return sendbirdRevokeAllSessionTokens(input, context);
  },
  get_number_of_unread_items(input, context) {
    return sendbirdGetNumberOfUnreadItems(input, context);
  },
  get_number_of_channels_by_join_status(input, context) {
    return sendbirdGetNumberOfChannelsByJoinStatus(input, context);
  },
  mark_all_user_messages_as_read(input, context) {
    return sendbirdMarkAllUserMessagesAsRead(input, context);
  },
  leave_group_channels(input, context) {
    return sendbirdLeaveGroupChannels(input, context);
  },
  list_group_channels(input, context) {
    return sendbirdListGroupChannels(input, context);
  },
  view_group_channel(input, context) {
    return sendbirdViewGroupChannel(input, context);
  },
  create_channel(input, context) {
    return sendbirdCreateChannel(input, context);
  },
  update_group_channel(input, context) {
    return sendbirdUpdateGroupChannel(input, context);
  },
  delete_channel(input, context) {
    return sendbirdDeleteChannel(input, context);
  },
  list_members_group_channel(input, context) {
    return sendbirdListMembersGroupChannel(input, context);
  },
  add_members_group_channel(input, context) {
    return sendbirdAddMembersGroupChannel(input, context);
  },
  list_group_channel_messages(input, context) {
    return sendbirdListGroupChannelMessages(input, context);
  },
  view_message(input, context) {
    return sendbirdViewMessage(input, context);
  },
  send_message(input, context) {
    return sendbirdSendMessage(input, context);
  },
  update_message(input, context) {
    return sendbirdUpdateMessage(input, context);
  },
  delete_message(input, context) {
    return sendbirdDeleteMessage(input, context);
  },
  list_banned_members(input, context) {
    return sendbirdListBannedMembers(input, context);
  },
  ban_user_from_group_channel(input, context) {
    return sendbirdBanUserFromGroupChannel(input, context);
  },
  unban_user(input, context) {
    return sendbirdUnbanUser(input, context);
  },
  mute_user(input, context) {
    return sendbirdMuteUser(input, context);
  },
  unmute_user(input, context) {
    return sendbirdUnmuteUser(input, context);
  },
} satisfies Record<SendbirdActionName, SendbirdActionHandler>;

export const executors: ProviderExecutors = defineProviderExecutors<SendbirdActionContext>({
  service: "sendbird",
  handlers: sendbirdActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SendbirdActionContext> {
    const credential = await requireApiKeyCredential(context, "sendbird");
    return {
      apiKey: credential.apiKey,
      applicationId: requireSendbirdApplicationId(credential.values),
      fetcher,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sendbird",
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, "sendbird");
    return buildSendbirdApiBaseUrl(requireSendbirdApplicationId(credential.values));
  },
  auth: { type: "api_key_header", name: "Api-Token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const apiKey = input.apiKey;
    const applicationId = requireSendbirdApplicationId(input.values);
    const payload = await requestSendbirdJson<Record<string, unknown>>({
      applicationId,
      apiKey,
      fetcher,
      phase: "validate",
      path: sendbirdValidationPath,
    });

    return {
      profile: {
        accountId: applicationId,
        displayName: `Sendbird ${applicationId}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        applicationId,
        apiBaseUrl: buildSendbirdApiBaseUrl(applicationId),
        validationEndpoint: sendbirdValidationPath,
        app_name: optionalRawString(payload.app_name),
        do_not_disturb: payload.do_not_disturb,
        display_past_message: payload.display_past_message,
        max_message_length: payload.max_message_length,
      }),
    };
  },
};

async function sendbirdListUsers(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: "/users",
    phase: "execute",
    query: buildSendbirdQuery(input),
  });
}

async function sendbirdViewUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}`,
    phase: "execute",
  });
}

async function sendbirdCreateUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: "/users",
    phase: "execute",
    body: buildSendbirdBody(input),
  });
}

async function sendbirdUpdateUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "PUT",
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}`,
    phase: "execute",
    body: buildSendbirdBody(input, ["user_id"]),
  });
}

async function sendbirdDeleteUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  await requestSendbirdJson({
    ...context,
    method: "DELETE",
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}`,
    phase: "execute",
    query: compactObject({
      hard_delete: optionalBoolean(input.hard_delete),
    }),
    allowEmptyResponse: true,
  });

  return { success: true as const };
}

async function sendbirdIssueSessionToken(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}/token`,
    phase: "execute",
    body: buildSendbirdBody(input, ["user_id"]),
  });
}

async function sendbirdRevokeAllSessionTokens(input: Record<string, unknown>, context: SendbirdActionContext) {
  await requestSendbirdJson({
    ...context,
    method: "DELETE",
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}/token`,
    phase: "execute",
    allowEmptyResponse: true,
  });

  return { success: true as const };
}

async function sendbirdGetNumberOfUnreadItems(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}/unread_item_count`,
    phase: "execute",
    query: compactObject({
      item_keys: pickStringList(input, "item_keys"),
      custom_types: pickStringList(input, "custom_types"),
    }),
  });
}

async function sendbirdGetNumberOfChannelsByJoinStatus(input: Record<string, unknown>, context: SendbirdActionContext) {
  const userId = requireString(input.user_id, "user_id");
  const states = ["joined_only", "invited_only", "invited_by_friend", "invited_by_non_friend"] as const;
  const requestedState = pickOptionalString(input, "state");

  if (requestedState) {
    const count = await requestGroupChannelCount(userId, requestedState, input, context);
    const isInvitedState =
      requestedState === "invited_only" ||
      requestedState === "invited_by_friend" ||
      requestedState === "invited_by_non_friend";
    return {
      total: count,
      joined: requestedState === "joined_only" ? count : 0,
      invited: isInvitedState ? count : 0,
      invited_by_friend: requestedState === "invited_by_friend" ? count : 0,
      invited_by_non_friend: requestedState === "invited_by_non_friend" ? count : 0,
    };
  }

  const counts = await Promise.all(states.map((state) => requestGroupChannelCount(userId, state, input, context)));
  const joined = counts[0] ?? 0;
  const invited = counts[1] ?? 0;
  const invitedByFriend = counts[2] ?? 0;
  const invitedByNonFriend = counts[3] ?? 0;

  return {
    total: joined + invited,
    joined,
    invited,
    invited_by_friend: invitedByFriend,
    invited_by_non_friend: invitedByNonFriend,
  };
}

async function requestGroupChannelCount(
  userId: string,
  state: string,
  input: Record<string, unknown>,
  context: SendbirdActionContext,
) {
  const payload = await requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/users/${encodeURIComponent(userId)}/group_channel_count`,
    phase: "execute",
    query: compactObject({
      state,
      super_mode: pickOptionalString(input, "super_mode"),
      public_mode: pickOptionalString(input, "public_mode"),
      hidden_mode: pickOptionalString(input, "hidden_mode"),
      unread_filter: pickOptionalString(input, "unread_filter"),
      distinct_mode: pickOptionalString(input, "distinct_mode"),
      custom_types: pickStringArray(input, "custom_types"),
    }),
  });

  const count = Number(payload.group_channel_count);
  if (!Number.isFinite(count) || count < 0) {
    throw new ProviderRequestError(502, "sendbird response missing group_channel_count");
  }
  return Math.trunc(count);
}

async function sendbirdMarkAllUserMessagesAsRead(input: Record<string, unknown>, context: SendbirdActionContext) {
  await requestSendbirdJson({
    ...context,
    method: "PUT",
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}/mark_as_read_all`,
    phase: "execute",
    body: buildSendbirdBody(input, ["user_id"]),
    allowEmptyResponse: true,
  });

  return { success: true as const };
}

async function sendbirdLeaveGroupChannels(input: Record<string, unknown>, context: SendbirdActionContext) {
  await requestSendbirdJson({
    ...context,
    method: "PUT",
    path: `/users/${encodeURIComponent(requireString(input.user_id, "user_id"))}/my_group_channels/leave`,
    phase: "execute",
    body: buildSendbirdBody(input, ["user_id"]),
    allowEmptyResponse: true,
  });

  return { success: true as const };
}

async function sendbirdListGroupChannels(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: "/group_channels",
    phase: "execute",
    query: buildSendbirdQuery(input),
  });
}

async function sendbirdViewGroupChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}`,
    phase: "execute",
    query: buildSendbirdQuery(input, ["channel_url"]),
  });
}

async function sendbirdCreateChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: "/group_channels",
    phase: "execute",
    body: buildSendbirdBody(input),
  });
}

async function sendbirdUpdateGroupChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "PUT",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}`,
    phase: "execute",
    body: buildSendbirdBody(input, ["channel_url"]),
  });
}

async function sendbirdDeleteChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  await requestSendbirdJson({
    ...context,
    method: "DELETE",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}`,
    phase: "execute",
    allowEmptyResponse: true,
  });

  return { success: true as const };
}

async function sendbirdListMembersGroupChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/members`,
    phase: "execute",
    query: buildSendbirdQuery(input, ["channel_url"]),
  });
}

async function sendbirdAddMembersGroupChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/invite`,
    phase: "execute",
    body: buildSendbirdBody(input, ["channel_url"]),
  });
}

async function sendbirdListGroupChannelMessages(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/messages`,
    phase: "execute",
    query: compactObject({
      ...buildSendbirdQuery(input, ["channel_url"]),
      with_sorted_metaarray: resolveSortedMetaarrayFlag(input),
      sender_ids: pickStringList(input, "sender_ids"),
      custom_types: pickStringList(input, "custom_types"),
    }),
  });
}

async function sendbirdViewMessage(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/messages/${encodeURIComponent(String(input.message_id))}`,
    phase: "execute",
    query: compactObject({
      with_sorted_metaarray: resolveSortedMetaarrayFlag(input),
    }),
  });
}

async function sendbirdSendMessage(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "POST",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/messages`,
    phase: "execute",
    body: buildSendbirdBody(input, ["channel_url"]),
  });
}

async function sendbirdUpdateMessage(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    method: "PUT",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/messages/${encodeURIComponent(String(input.message_id))}`,
    phase: "execute",
    body: compactObject({
      ...buildSendbirdBody(input, ["channel_url", "message_id"]),
      message: pickOptionalString(input, "message"),
    }),
  });
}

async function sendbirdDeleteMessage(input: Record<string, unknown>, context: SendbirdActionContext) {
  await requestSendbirdJson({
    ...context,
    method: "DELETE",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/messages/${encodeURIComponent(String(input.message_id))}`,
    phase: "execute",
    allowEmptyResponse: true,
  });

  return { success: true as const };
}

async function sendbirdListBannedMembers(input: Record<string, unknown>, context: SendbirdActionContext) {
  return requestSendbirdJson<Record<string, unknown>>({
    ...context,
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/ban`,
    phase: "execute",
    query: buildSendbirdQuery(input, ["channel_url"]),
  });
}

async function sendbirdBanUserFromGroupChannel(input: Record<string, unknown>, context: SendbirdActionContext) {
  const payload = await requestSendbirdJson<Record<string, unknown> | null>({
    ...context,
    method: "POST",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/ban`,
    phase: "execute",
    body: buildSendbirdBody(input, ["channel_url"]),
    allowEmptyResponse: true,
  });

  return payload ?? { success: true as const };
}

async function sendbirdUnbanUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  const payload = await requestSendbirdJson<Record<string, unknown> | null>({
    ...context,
    method: "DELETE",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/ban/${encodeURIComponent(requireString(input.banned_user_id, "banned_user_id"))}`,
    phase: "execute",
    allowEmptyResponse: true,
  });

  return payload ?? { success: true as const };
}

async function sendbirdMuteUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  const payload = await requestSendbirdJson<Record<string, unknown> | null>({
    ...context,
    method: "POST",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/mute`,
    phase: "execute",
    body: buildSendbirdBody(input, ["channel_url"]),
    allowEmptyResponse: true,
  });

  return payload ?? { success: true as const };
}

async function sendbirdUnmuteUser(input: Record<string, unknown>, context: SendbirdActionContext) {
  const payload = await requestSendbirdJson<Record<string, unknown> | null>({
    ...context,
    method: "DELETE",
    path: `/group_channels/${encodeURIComponent(requireString(input.channel_url, "channel_url"))}/mute/${encodeURIComponent(requireString(input.muted_user_id, "muted_user_id"))}`,
    phase: "execute",
    allowEmptyResponse: true,
  });

  return payload ?? { success: true as const };
}

async function requestSendbirdJson<T>(input: SendbirdRequestOptions): Promise<T> {
  const url = new URL(trimLeadingSlash(input.path), `${buildSendbirdApiBaseUrl(input.applicationId)}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      url.searchParams.set(key, value.map((item) => String(item)).join(","));
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildSendbirdHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    payload = await readSendbirdPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `sendbird ${input.phase} request failed: ${error.message}`
        : `sendbird ${input.phase} request failed`,
    );
  }

  if (!response.ok) {
    throw createSendbirdError(response, payload, input.phase);
  }

  if (payload === null && input.allowEmptyResponse) {
    return null as T;
  }

  if (payload === null) {
    throw new ProviderRequestError(502, "sendbird response body is empty");
  }

  return payload as T;
}

async function readSendbirdPayload(response: Response) {
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

function createSendbirdError(response: Response, payload: unknown, phase: SendbirdRequestPhase) {
  const message = extractSendbirdErrorMessage(payload) ?? response.statusText ?? "sendbird request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractSendbirdErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "code", "detail"] as const) {
    const value = optionalRawString(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildSendbirdApiBaseUrl(applicationId: string) {
  return `https://api-${applicationId}.sendbird.com/v3`;
}

function buildSendbirdHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "Api-Token": apiKey,
    "User-Agent": sendbirdUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function requireSendbirdApplicationId(source?: Record<string, unknown>) {
  const applicationId = source ? pickOptionalString(source, "applicationId") : undefined;
  if (!applicationId) {
    throw new ProviderRequestError(400, "Application ID is required");
  }
  if (!isSafeSendbirdApplicationId(applicationId)) {
    throw new ProviderRequestError(400, "Application ID is invalid");
  }
  return applicationId;
}

function isSafeSendbirdApplicationId(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isDigit && !isUpper && !isLower && char !== "-") {
      return false;
    }
  }
  return value.length > 0;
}

function trimLeadingSlash(value: string) {
  return value.startsWith("/") ? value.slice(1) : value;
}

function buildSendbirdQuery(input: Record<string, unknown>, omitKeys: string[] = []) {
  const omitted = new Set(omitKeys);
  const query: Record<string, SendbirdQueryValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (omitted.has(key) || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      const normalized = value.filter(isQueryPrimitive) as SendbirdQueryPrimitive[];
      if (normalized.length > 0) {
        query[key] = normalized;
      }
      continue;
    }

    if (isQueryPrimitive(value)) {
      query[key] = value;
    }
  }
  return query;
}

function buildSendbirdBody(input: Record<string, unknown>, omitKeys: string[] = []) {
  const omitted = new Set(omitKeys);
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (omitted.has(key) || value === undefined) {
      continue;
    }
    body[key] = value;
  }
  return body;
}

function resolveSortedMetaarrayFlag(input: Record<string, unknown>) {
  return optionalBoolean(input.with_sorted_metaarray);
}

function pickStringArray(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) {
      const items = value
        .map((item) => (typeof item === "string" ? item : String(item)))
        .filter((item) => item.trim() !== "");
      if (items.length > 0) {
        return items;
      }
      continue;
    }

    const stringValue = optionalRawString(value);
    if (stringValue) {
      return [stringValue];
    }
  }
  return undefined;
}

function pickStringList(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    if (Array.isArray(value)) {
      const items = value
        .map((item) => (typeof item === "string" ? item : String(item)))
        .filter((item) => item.trim() !== "");
      if (items.length > 0) {
        return items;
      }
    }
  }
  return undefined;
}

function requireString(value: unknown, fieldName: string) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function isQueryPrimitive(value: unknown): value is SendbirdQueryPrimitive {
  return (
    typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean"
  );
}
