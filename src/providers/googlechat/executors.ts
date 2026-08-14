import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { googleJsonRequest } from "../google-runtime.ts";
import { asObject } from "../googledrive/runtime-shared.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

export const googleChatApiBaseUrl = "https://chat.googleapis.com/v1";

const service = "googlechat";
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
const spaceNamePattern = /^spaces\/[^/]+$/;
const messageNamePattern = /^spaces\/[^/]+\/messages\/[^/]+$/;

type GoogleChatRuntimeContext = OAuthProviderContext;
type GoogleChatActionHandler = (input: Record<string, unknown>, context: GoogleChatRuntimeContext) => Promise<unknown>;

interface ListSpacesPayload {
  spaces?: unknown;
  nextPageToken?: string | null;
}

interface ListMessagesPayload {
  messages?: unknown;
  nextPageToken?: string | null;
}

export const googleChatActionHandlers: Record<string, GoogleChatActionHandler> = {
  list_spaces: listSpaces,
  get_space: getSpace,
  list_messages: listMessages,
  get_message: getMessage,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleChatActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>(googleUserInfoUrl, {
      accessToken: input.accessToken,
      fetcher,
      signal,
      service,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googlechat:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Chat User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function listSpaces(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const payload = await googleChatJsonRequest<ListSpacesPayload>(`${googleChatApiBaseUrl}/spaces`, {
    context,
    query: compactObject({
      filter: optionalString(input.filter),
      pageSize: integerQuery(input.pageSize),
      pageToken: optionalString(input.pageToken),
    }),
  });

  return {
    spaces: Array.isArray(payload.spaces) ? payload.spaces.map((item) => normalizeSpace(item)) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getSpace(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const spaceName = resolveSpaceName(input.space, "space is required");
  const payload = await googleChatJsonRequest<unknown>(`${googleChatApiBaseUrl}/${encodeResourceName(spaceName)}`, {
    context,
  });

  return normalizeSpace(payload);
}

async function listMessages(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const spaceName = resolveSpaceName(input.space, "space is required");
  const payload = await googleChatJsonRequest<ListMessagesPayload>(
    `${googleChatApiBaseUrl}/${encodeResourceName(spaceName)}/messages`,
    {
      context,
      query: compactObject({
        filter: optionalString(input.filter),
        orderBy: optionalString(input.orderBy),
        showDeleted: booleanQuery(input.showDeleted),
        pageSize: integerQuery(input.pageSize),
        pageToken: optionalString(input.pageToken),
      }),
    },
  );

  return {
    messages: Array.isArray(payload.messages) ? payload.messages.map((item) => normalizeMessage(item)) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getMessage(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const messageName = resolveMessageName(input);
  const payload = await googleChatJsonRequest<unknown>(`${googleChatApiBaseUrl}/${encodeResourceName(messageName)}`, {
    context,
  });

  return normalizeMessage(payload);
}

function normalizeSpace(value: unknown): Record<string, unknown> {
  const payload = asObject(value);
  const name = requirePayloadString(payload.name, "Google Chat returned a space without a resource name");
  const membership = optionalRecord(payload.membershipCount);

  return compactObject({
    name,
    spaceId: stripPrefix(name, "spaces/"),
    displayName: optionalString(payload.displayName),
    spaceType: optionalString(payload.spaceType),
    spaceHistoryState: optionalString(payload.spaceHistoryState),
    externalUserAllowed: optionalBoolean(payload.externalUserAllowed),
    spaceUri: optionalString(payload.spaceUri),
    createTime: optionalString(payload.createTime),
    lastActiveTime: optionalString(payload.lastActiveTime),
    spaceDetails: optionalRecord(payload.spaceDetails),
    membershipCount: membership
      ? compactObject({
          joinedDirectHumanUserCount: optionalInteger(membership.joinedDirectHumanUserCount),
          joinedGroupCount: optionalInteger(membership.joinedGroupCount),
        })
      : undefined,
  });
}

function normalizeMessage(value: unknown): Record<string, unknown> {
  const payload = asObject(value);
  const name = requirePayloadString(payload.name, "Google Chat returned a message without a resource name");
  const segments = name.split("/");
  const sender = optionalRecord(payload.sender);
  const thread = optionalRecord(payload.thread);
  const space = optionalRecord(payload.space);

  return compactObject({
    name,
    messageId: segments.length >= 4 ? segments.slice(3).join("/") : name,
    spaceName: optionalString(space?.name) ?? (segments.length >= 2 ? segments.slice(0, 2).join("/") : undefined),
    text: optionalRawString(payload.text),
    formattedText: optionalRawString(payload.formattedText),
    argumentText: optionalRawString(payload.argumentText),
    createTime: optionalString(payload.createTime),
    lastUpdateTime: optionalString(payload.lastUpdateTime),
    deleteTime: optionalString(payload.deleteTime),
    threadReply: optionalBoolean(payload.threadReply),
    sender: sender
      ? compactObject({
          name: optionalString(sender.name),
          displayName: optionalString(sender.displayName),
          type: optionalString(sender.type),
          domainId: optionalString(sender.domainId),
          isAnonymous: optionalBoolean(sender.isAnonymous),
        })
      : undefined,
    thread: thread
      ? compactObject({
          name: optionalString(thread.name),
          threadKey: optionalString(thread.threadKey),
        })
      : undefined,
  });
}

/**
 * Accept either the `spaces/{space}` resource name or the bare `{space}` id so
 * agents can pass whichever form a previous action returned.
 */
function resolveSpaceName(value: unknown, message: string): string {
  const raw = requireString(value, message);
  const trimmed = trimSlashes(raw);
  const name = trimmed.startsWith("spaces/") ? trimmed : `spaces/${trimmed}`;
  const spaceId = name.slice("spaces/".length);
  if (!spaceNamePattern.test(name) || spaceId === "." || spaceId === "..") {
    throw new ProviderRequestError(400, `space must be spaces/{space} or a bare space id, received "${raw}"`);
  }

  return name;
}

/**
 * Accept either the full `spaces/{space}/messages/{message}` resource name, or a
 * bare message id paired with a `space` input.
 */
function resolveMessageName(input: Record<string, unknown>): string {
  const raw = requireString(input.message, "message is required");
  const trimmed = trimSlashes(raw);
  if (trimmed.startsWith("spaces/")) {
    const [, spaceId, , messageId] = trimmed.split("/");
    if (
      !messageNamePattern.test(trimmed) ||
      spaceId === "." ||
      spaceId === ".." ||
      messageId === "." ||
      messageId === ".."
    ) {
      throw new ProviderRequestError(
        400,
        `message must be spaces/{space}/messages/{message} when it starts with spaces/, received "${raw}"`,
      );
    }

    return trimmed;
  }

  const spaceName = resolveSpaceName(input.space, "space is required when message is a bare message id");
  const name = `${spaceName}/messages/${trimmed}`;
  if (!messageNamePattern.test(name) || trimmed === "." || trimmed === "..") {
    throw new ProviderRequestError(400, `message must be a bare message id, received "${raw}"`);
  }

  return name;
}

function googleChatJsonRequest<T>(
  url: string,
  input: {
    context: Pick<GoogleChatRuntimeContext, "accessToken" | "fetcher" | "signal">;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<T> {
  return googleJsonRequest<T>(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
    service,
  });
}

function encodeResourceName(name: string): string {
  return name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function integerQuery(value: unknown): string | undefined {
  const resolved = optionalInteger(value);
  return resolved === undefined ? undefined : String(resolved);
}

function booleanQuery(value: unknown): string | undefined {
  const resolved = optionalBoolean(value);
  return resolved === undefined ? undefined : String(resolved);
}

function requireString(value: unknown, message: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, message);
  }

  return resolved;
}

function requirePayloadString(value: unknown, message: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(502, message);
  }

  return resolved;
}
