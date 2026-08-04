import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { SlackNormalizedConversationType } from "./constants.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineOAuthProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
import { slackConversationTypes } from "./constants.ts";

const service = "slack";
const slackApiBaseUrl = "https://slack.com/api";
const slackFileUrlMaxBytes = 100 * 1024 * 1024;
const slackFileUrlFetchTimeoutMs = 30_000;

type SlackActionContext = OAuthProviderContext;

interface SlackPayloadError {
  ok?: boolean;
  error?: string;
  response_metadata?: Record<string, unknown>;
}

type SlackActionHandler = (input: Record<string, unknown>, context: SlackActionContext) => Promise<unknown>;

export const slackActionHandlers: Record<string, SlackActionHandler> = {
  list_channels(input, context) {
    return slackListChannels(input, context);
  },
  get_channel_messages(input, context) {
    return slackGetChannelMessages(input, context);
  },
  post_message(input, context) {
    return slackPostMessage(input, context);
  },
  reply_message(input, context) {
    return slackReplyMessage(input, context);
  },
  get_thread(input, context) {
    return slackGetThread(input, context);
  },
  list_conversations(input, context) {
    return slackListConversations(input, context);
  },
  get_conversation(input, context) {
    return slackGetConversation(input, context);
  },
  open_conversation(input, context) {
    return slackOpenConversation(input, context);
  },
  list_users(input, context) {
    return slackListUsers(input, context);
  },
  get_user(input, context) {
    return slackGetUser(input, context);
  },
  post_ephemeral_message(input, context) {
    return slackPostEphemeralMessage(input, context);
  },
  get_message_permalink(input, context) {
    return slackGetMessagePermalink(input, context);
  },
  update_message(input, context) {
    return slackUpdateMessage(input, context);
  },
  delete_message(input, context) {
    return slackDeleteMessage(input, context);
  },
  schedule_message(input, context) {
    return slackScheduleMessage(input, context);
  },
  add_reaction(input, context) {
    return slackAddReaction(input, context);
  },
  remove_reaction(input, context) {
    return slackRemoveReaction(input, context);
  },
  get_reactions(input, context) {
    return slackGetReactions(input, context);
  },
  upload_file(input, context) {
    return slackUploadFile(input, context);
  },
  list_files(input, context) {
    return slackListFiles(input, context);
  },
  get_file(input, context) {
    return slackGetFile(input, context);
  },
  delete_file(input, context) {
    return slackDeleteFile(input, context);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, slackActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = await slackRequestJson<{
      ok: boolean;
      team?: string;
      team_id?: string;
      user_id?: string;
      error?: string;
    }>({
      accessToken: input.accessToken,
      fetcher,
      signal,
      method: "auth.test",
    });

    return {
      profile: {
        accountId: payload.user_id ?? payload.team_id ?? "slack:oauth2",
        displayName: payload.team ?? payload.team_id ?? payload.user_id ?? "Slack Workspace",
      },
      metadata: {
        currentAccount: payload,
      },
    };
  },
};

async function slackListChannels(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("conversations.list");
  if (input.limit != null) {
    url.searchParams.set("limit", String(input.limit));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    channels?: Array<{ id: string; name: string }>;
    error?: string;
  }>(url, context);

  return {
    channels: (payload.channels ?? []).map((channel) => ({
      channelId: channel.id,
      name: channel.name,
    })),
  };
}

async function slackGetChannelMessages(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("conversations.history");
  url.searchParams.set("channel", String(input.channelId));
  if (input.limit != null) {
    url.searchParams.set("limit", String(input.limit));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    messages?: Array<{ ts: string; user?: string; text?: string }>;
    has_more?: boolean;
    error?: string;
  }>(url, context);

  return {
    messages: (payload.messages ?? []).map((message) => ({
      ts: message.ts,
      userId: message.user ?? "",
      text: message.text ?? "",
    })),
    hasMore: payload.has_more ?? false,
  };
}

async function slackPostMessage(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const payload = await slackRequestJson<{
    ok: boolean;
    ts?: string;
    channel?: string;
    error?: string;
  }>({
    ...context,
    method: "chat.postMessage",
    body: buildSlackMessagePayload(input),
  });

  return {
    ts: payload.ts ?? "",
    channelId: payload.channel ?? String(input.channelId),
  };
}

async function slackReplyMessage(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const payload = await slackRequestJson<{
    ok: boolean;
    ts?: string;
    channel?: string;
    error?: string;
  }>({
    ...context,
    method: "chat.postMessage",
    body: buildSlackMessagePayload(input, {
      thread_ts: String(input.threadTs),
      reply_broadcast: optionalBoolean(input.replyBroadcast),
    }),
  });

  return {
    ts: payload.ts ?? "",
    channelId: payload.channel ?? String(input.channelId),
  };
}

async function slackGetThread(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("conversations.replies");
  url.searchParams.set("channel", String(input.channelId));
  url.searchParams.set("ts", String(input.threadTs));

  const payload = await slackGetJson<{
    ok: boolean;
    messages?: Array<{ ts: string; user?: string; text?: string }>;
    has_more?: boolean;
    error?: string;
  }>(url, context);

  return {
    messages: (payload.messages ?? []).map((message) => ({
      ts: message.ts,
      userId: message.user ?? "",
      text: message.text ?? "",
    })),
    hasMore: payload.has_more ?? false,
  };
}

async function slackListConversations(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("conversations.list");
  url.searchParams.set("limit", String(input.limit ?? 200));
  url.searchParams.set(
    "types",
    Array.isArray(input.types) ? input.types.map((value) => String(value)).join(",") : slackConversationTypes.join(","),
  );
  if (input.cursor != null) {
    url.searchParams.set("cursor", String(input.cursor));
  }
  if (input.excludeArchived != null) {
    url.searchParams.set("exclude_archived", String(input.excludeArchived));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    channels?: Array<Record<string, unknown>>;
    response_metadata?: { next_cursor?: string };
    error?: string;
  }>(url, context);

  return {
    conversations: (payload.channels ?? []).map((channel) => normalizeConversation(channel)),
    nextCursor: normalizeNextCursor(payload.response_metadata?.next_cursor),
  };
}

async function slackGetConversation(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("conversations.info");
  url.searchParams.set("channel", String(input.channelId));
  if (input.includeLocale != null) {
    url.searchParams.set("include_locale", String(input.includeLocale));
  }
  if (input.includeNumMembers != null) {
    url.searchParams.set("include_num_members", String(input.includeNumMembers));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    channel?: Record<string, unknown>;
    error?: string;
  }>(url, context);

  return {
    conversation: normalizeConversation(payload.channel ?? {}),
  };
}

async function slackOpenConversation(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const userIds = Array.isArray(input.userIds) ? input.userIds.map(String) : [];
  if (userIds.length !== 1) {
    throw new ProviderRequestError(400, "open_conversation only supports one userId for bot-token DM conversations");
  }

  const payload = await slackRequestJson<{
    ok: boolean;
    channel?: Record<string, unknown>;
    error?: string;
  }>({
    ...context,
    method: "conversations.open",
    body: {
      users: userIds[0],
      return_im: true,
      prevent_creation: optionalBoolean(input.preventCreation),
    },
  });

  const conversation = normalizeConversation(payload.channel ?? {});
  return {
    channelId: conversation.channelId,
    conversation,
  };
}

async function slackListUsers(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("users.list");
  url.searchParams.set("limit", String(input.limit ?? 200));
  if (input.cursor != null) {
    url.searchParams.set("cursor", String(input.cursor));
  }
  if (input.includeLocale != null) {
    url.searchParams.set("include_locale", String(input.includeLocale));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    members?: Array<Record<string, unknown>>;
    response_metadata?: { next_cursor?: string };
    error?: string;
  }>(url, context);

  return {
    users: (payload.members ?? []).map((member) => normalizeUser(member)),
    nextCursor: normalizeNextCursor(payload.response_metadata?.next_cursor),
  };
}

async function slackGetUser(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("users.info");
  url.searchParams.set("user", String(input.userId));
  if (input.includeLocale != null) {
    url.searchParams.set("include_locale", String(input.includeLocale));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    user?: Record<string, unknown>;
    error?: string;
  }>(url, context);

  return {
    user: normalizeUser(payload.user ?? {}),
  };
}

async function slackPostEphemeralMessage(
  input: Record<string, unknown>,
  context: SlackActionContext,
): Promise<unknown> {
  const payload = await slackRequestJson<{
    ok: boolean;
    channel?: string;
    message_ts?: string;
    error?: string;
  }>({
    ...context,
    method: "chat.postEphemeral",
    body: buildSlackMessagePayload(input, { user: String(input.userId) }),
  });

  return {
    channelId: payload.channel ?? String(input.channelId),
    messageTs: payload.message_ts ?? "",
  };
}

async function slackGetMessagePermalink(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("chat.getPermalink");
  url.searchParams.set("channel", String(input.channelId));
  url.searchParams.set("message_ts", String(input.messageTs));

  const payload = await slackGetJson<{
    ok: boolean;
    channel?: string;
    permalink?: string;
    error?: string;
  }>(url, context);

  return {
    channelId: payload.channel ?? String(input.channelId),
    messageTs: String(input.messageTs),
    permalink: payload.permalink ?? "",
  };
}

async function slackUpdateMessage(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const payload = await slackRequestJson<{
    ok: boolean;
    channel?: string;
    ts?: string;
    error?: string;
  }>({
    ...context,
    method: "chat.update",
    body: buildSlackMessagePayload(input, { ts: String(input.messageTs) }),
  });

  return {
    channelId: payload.channel ?? String(input.channelId),
    messageTs: payload.ts ?? String(input.messageTs),
  };
}

async function slackDeleteMessage(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const payload = await slackRequestJson<{
    ok: boolean;
    channel?: string;
    ts?: string;
    error?: string;
  }>({
    ...context,
    method: "chat.delete",
    body: {
      channel: String(input.channelId),
      ts: String(input.messageTs),
    },
  });

  return {
    channelId: payload.channel ?? String(input.channelId),
    messageTs: payload.ts ?? String(input.messageTs),
  };
}

async function slackScheduleMessage(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const postAt = Number(input.postAt);
  if (postAt <= Math.floor(Date.now() / 1000)) {
    throw new ProviderRequestError(400, "postAt must be in the future");
  }

  const payload = await slackRequestJson<{
    ok: boolean;
    channel?: string;
    scheduled_message_id?: string;
    post_at?: number | string;
    error?: string;
  }>({
    ...context,
    method: "chat.scheduleMessage",
    body: buildSlackMessagePayload(input, { post_at: postAt }),
  });

  return {
    channelId: payload.channel ?? String(input.channelId),
    scheduledMessageId: payload.scheduled_message_id ?? "",
    postAt: normalizeScheduledPostAt(payload.post_at, postAt),
  };
}

async function slackAddReaction(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  await slackRequestJson({
    ...context,
    method: "reactions.add",
    body: buildReactionPayload(input),
  });

  return { success: true };
}

async function slackRemoveReaction(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  await slackRequestJson({
    ...context,
    method: "reactions.remove",
    body: buildReactionPayload(input),
  });

  return { success: true };
}

async function slackGetReactions(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("reactions.get");
  url.searchParams.set("channel", String(input.channelId));
  url.searchParams.set("timestamp", String(input.messageTs));
  if (typeof input.full === "boolean") {
    url.searchParams.set("full", String(input.full));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    message?: Record<string, unknown>;
    error?: string;
  }>(url, context);

  return {
    item: payload.message ?? {},
  };
}

async function slackUploadFile(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const content = await resolveSlackFileContent(input, context);
  const filename = String(input.filename);
  const uploadUrlPayload = await slackFormRequestJson<{
    ok: boolean;
    upload_url?: string;
    file_id?: string;
    error?: string;
  }>(context, "files.getUploadURLExternal", {
    filename,
    length: content.byteLength,
    alt_txt: optionalString(input.altText),
    snippet_type: optionalString(input.snippetType),
  });

  const uploadUrl = requiredString(uploadUrlPayload.upload_url, "file.upload_url", slackResponseError);
  const fileId = requiredString(uploadUrlPayload.file_id, "file.file_id", slackResponseError);
  await uploadSlackFileContent(uploadUrl, filename, content, optionalString(input.mimeType), context);

  const completePayload = await slackFormRequestJson<{
    ok: boolean;
    files?: Array<Record<string, unknown>>;
    error?: string;
  }>(context, "files.completeUploadExternal", {
    files: JSON.stringify([
      compactObject({
        id: fileId,
        title: optionalString(input.title),
      }),
    ]),
    channel_id: optionalString(input.channelId),
    initial_comment: optionalString(input.initialComment),
    thread_ts: optionalString(input.threadTs),
  });

  return {
    fileId,
    files: (completePayload.files ?? []).map((file) => normalizeFile(file)),
  };
}

async function slackListFiles(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("files.list");
  if (input.channelId != null) {
    url.searchParams.set("channel", String(input.channelId));
  }
  if (input.userId != null) {
    url.searchParams.set("user", String(input.userId));
  }
  if (input.types != null) {
    url.searchParams.set("types", String(input.types));
  }
  if (input.page != null) {
    url.searchParams.set("page", String(input.page));
  }
  if (input.count != null) {
    url.searchParams.set("count", String(input.count));
  }

  const payload = await slackGetJson<{
    ok: boolean;
    files?: Array<Record<string, unknown>>;
    paging?: Record<string, unknown>;
    error?: string;
  }>(url, context);

  return {
    files: (payload.files ?? []).map((file) => normalizeFile(file)),
    paging: payload.paging ?? {},
  };
}

async function slackGetFile(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  const url = slackApiUrl("files.info");
  url.searchParams.set("file", String(input.fileId));

  const payload = await slackGetJson<{
    ok: boolean;
    file?: Record<string, unknown>;
    error?: string;
  }>(url, context);

  return {
    file: normalizeFile(payload.file ?? {}),
  };
}

async function slackDeleteFile(input: Record<string, unknown>, context: SlackActionContext): Promise<unknown> {
  await slackRequestJson({
    ...context,
    method: "files.delete",
    body: {
      file: String(input.fileId),
    },
  });

  return {
    success: true,
    fileId: String(input.fileId),
  };
}

async function slackGetJson<T extends SlackPayloadError>(url: URL, context: SlackActionContext): Promise<T> {
  const response = await context.fetcher(url.toString(), {
    headers: slackHeaders(context.accessToken),
    signal: context.signal,
  });
  return readSlackResponseJson<T>(response);
}

async function slackRequestJson<T extends SlackPayloadError>(input: {
  method: string;
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await input.fetcher(slackApiUrl(input.method).toString(), {
    method: "POST",
    headers: slackHeaders(input.accessToken),
    body: input.body === undefined ? undefined : JSON.stringify(compactObject(input.body)),
    signal: input.signal,
  });
  return readSlackResponseJson<T>(response);
}

async function slackFormRequestJson<T extends SlackPayloadError>(
  context: SlackActionContext,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(compactObject(body))) {
    params.set(key, String(value));
  }

  const response = await context.fetcher(slackApiUrl(method).toString(), {
    method: "POST",
    headers: {
      ...slackHeaders(context.accessToken),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: context.signal,
  });
  return readSlackResponseJson<T>(response);
}

async function readSlackResponseJson<T extends SlackPayloadError>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw slackHttpError(response.status, payload);
  }
  assertSlackPayload(payload);
  return payload;
}

function buildSlackMessagePayload(
  input: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const payload = compactObject({
    channel: String(input.channelId),
    text: optionalString(input.text),
    blocks: Array.isArray(input.blocks) ? input.blocks : undefined,
    attachments: Array.isArray(input.attachments) ? input.attachments : undefined,
    unfurl_links: optionalBoolean(input.unfurlLinks),
    unfurl_media: optionalBoolean(input.unfurlMedia),
    metadata: optionalRecord(input.metadata),
    ...extra,
  });

  if (!payload.text && !payload.blocks && !payload.attachments) {
    throw new ProviderRequestError(400, "Provide at least one message content field: text, blocks, or attachments.");
  }

  return payload;
}

function buildReactionPayload(input: Record<string, unknown>): Record<string, unknown> {
  return {
    channel: String(input.channelId),
    timestamp: String(input.messageTs),
    name: String(input.name),
  };
}

async function resolveSlackFileContent(
  input: Record<string, unknown>,
  context: SlackActionContext,
): Promise<Uint8Array> {
  const fileUrl = requiredString(input.fileUrl, "fileUrl", (message) => new ProviderRequestError(400, message));
  assertFetchableFileUrl(fileUrl);
  const timeout = createProviderTimeout(context.signal, slackFileUrlFetchTimeoutMs);
  try {
    const response = await context.fetcher(fileUrl, { signal: timeout.signal });
    if (!response.ok) {
      throw new ProviderRequestError(400, `failed to fetch fileUrl: ${response.status}`);
    }
    return readBoundedResponseBytes(response, {
      maxBytes: slackFileUrlMaxBytes,
      fieldName: "fileUrl",
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "failed to fetch fileUrl: request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `failed to fetch fileUrl: ${error.message}` : "failed to fetch fileUrl",
    );
  } finally {
    timeout.cleanup();
  }
}

async function uploadSlackFileContent(
  uploadUrl: string,
  filename: string,
  content: Uint8Array,
  mimeType: string | undefined,
  context: SlackActionContext,
): Promise<void> {
  const bytes = new Uint8Array(content);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const response = await context.fetcher(uploadUrl, {
    method: "POST",
    headers: {
      "content-type": mimeType ?? "application/octet-stream",
    },
    body,
    signal: context.signal,
  });
  if (response.ok) {
    return;
  }

  const message =
    (await response.text().catch(() => "")) || `slack file upload failed with ${response.status}: ${filename}`;
  throw new ProviderRequestError(response.status, message);
}

function normalizeNextCursor(cursor: string | undefined): string | null {
  return cursor ? cursor : null;
}

function normalizeScheduledPostAt(value: number | string | undefined, fallback: number): number {
  if (value == null) {
    return fallback;
  }
  const postAt = Number(value);
  if (!Number.isInteger(postAt)) {
    throw new ProviderRequestError(502, "slack schedule_message response is invalid: post_at");
  }
  return postAt;
}

function normalizeConversationType(conversation: Record<string, unknown>): SlackNormalizedConversationType {
  if (conversation.is_im === true) {
    return "im";
  }
  if (conversation.is_mpim === true) {
    return "mpim";
  }
  if (conversation.is_private === true || conversation.is_group === true) {
    return "private_channel";
  }
  if (conversation.is_channel === true) {
    return "public_channel";
  }
  return "unknown";
}

function normalizeConversation(conversation: Record<string, unknown>): Record<string, unknown> {
  const topic = optionalRecord(conversation.topic);
  const purpose = optionalRecord(conversation.purpose);

  return compactObject({
    channelId: String(conversation.id ?? ""),
    name: typeof conversation.name === "string" ? conversation.name : null,
    type: normalizeConversationType(conversation),
    isArchived: typeof conversation.is_archived === "boolean" ? conversation.is_archived : null,
    isPrivate: typeof conversation.is_private === "boolean" ? conversation.is_private : null,
    isMember: typeof conversation.is_member === "boolean" ? conversation.is_member : null,
    memberCount: typeof conversation.num_members === "number" ? conversation.num_members : undefined,
    topic: typeof topic?.value === "string" ? topic.value : null,
    purpose: typeof purpose?.value === "string" ? purpose.value : null,
    userId: optionalString(conversation.user),
    locale: optionalString(conversation.locale),
  });
}

function normalizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const profile = optionalRecord(user.profile) ?? {};

  return compactObject({
    userId: String(user.id ?? ""),
    username: typeof user.name === "string" ? user.name : null,
    realName: typeof profile.real_name === "string" ? profile.real_name : null,
    displayName: typeof profile.display_name === "string" ? profile.display_name : null,
    isBot: typeof user.is_bot === "boolean" ? user.is_bot : null,
    isDeleted: typeof user.deleted === "boolean" ? user.deleted : null,
    isAdmin: typeof user.is_admin === "boolean" ? user.is_admin : null,
    isOwner: typeof user.is_owner === "boolean" ? user.is_owner : null,
    locale: optionalString(user.locale),
  });
}

function normalizeFile(file: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...file,
    fileId: optionalString(file.id),
    name: optionalString(file.name),
    title: optionalString(file.title),
    mimetype: optionalString(file.mimetype),
    urlPrivate: optionalString(file.url_private),
  });
}

function slackApiUrl(method: string): URL {
  return new URL(`${slackApiBaseUrl}/${method}`);
}

function slackHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function assertSlackPayload(payload: SlackPayloadError): void {
  if (payload.ok !== false) {
    return;
  }

  const message = formatSlackPayloadError(payload);
  switch (payload.error) {
    case "not_authed":
    case "invalid_auth":
    case "token_revoked":
      throw new ProviderRequestError(401, message, payload);
    case "ratelimited":
      throw new ProviderRequestError(429, message, payload);
    default:
      throw new ProviderRequestError(400, message, payload);
  }
}

function formatSlackPayloadError(payload: SlackPayloadError): string {
  const error = payload.error ?? "unknown slack error";
  const messages = payload.response_metadata?.messages;
  if (!Array.isArray(messages)) {
    return error;
  }

  const details = messages.filter((message) => typeof message === "string");
  if (details.length === 0) {
    return error;
  }

  return `${error}: ${details.join("; ")}`;
}

function slackHttpError(status: number, payload: SlackPayloadError): ProviderRequestError {
  const message = payload.error ? formatSlackPayloadError(payload) : `slack request failed with ${status}`;
  return new ProviderRequestError(status, message, payload);
}

function slackResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `slack response is invalid: ${message}`);
}

function assertFetchableFileUrl(value: string): void {
  assertPublicHttpUrl(value, {
    fieldName: "fileUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
}
