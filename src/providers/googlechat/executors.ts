import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { GoogleChatRuntimeContext } from "./runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import {
  defineGoogleProviderExecutors,
  googleBearerProxyAuth,
  googleServiceAccountValidator,
} from "../googledrive/runtime-auth.ts";
import { googleJsonRequest } from "../googledrive/runtime-request.ts";
import { asObject } from "../googledrive/runtime-shared.ts";
import { defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import {
  attachSenderProfiles,
  listSpaceMembersPage,
  maxProfilesPerLookup,
  resolveDirectMessagePeer,
} from "./members.ts";
import { encodeResourceName, googleChatApiBaseUrl, googleChatJsonRequest, stripPrefix } from "./runtime.ts";
import { googleChatServiceAccountScopes } from "./scopes.ts";

const service = "googlechat";
const defaultMemberPageSize = 100;
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";
const spaceNamePattern = /^spaces\/[^/]+$/;
const messageNamePattern = /^spaces\/[^/]+\/messages\/[^/]+$/;
const threadNamePattern = /^spaces\/[^/]+\/threads\/[^/]+$/;
// findDirectMessage takes the user name as a query parameter, not a path segment,
// so it is deliberately NOT percent-encoded here: googleRequest already encodes it
// once through URLSearchParams.set(), and encoding it again would turn a@b.com into
// a%2540b.com, which Google reads as a literal rather than an email address.
//
// Both patterns are allowlists of the expected structure, not denylists, so
// zero-width and control characters, slashes, backslashes, and inner whitespace
// all fall outside them without being rejected one by one. Domains accept only
// ASCII or punycode.
const userIdPattern = /^[0-9]{1,64}$/;
// RFC 5322 allows "/" in the local part, but it is deliberately excluded here:
// otherwise "users/person@example.com" would pass as one valid address and be sent
// to Google as "users/users/person@example.com". A test pins this down.
const emailLocalPart = "[A-Za-z0-9!#$%&'*+=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+=?^_`{|}~-]+)*";
const emailDomainLabel = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const userEmailPattern = new RegExp(`^${emailLocalPart}@${emailDomainLabel}(?:\\.${emailDomainLabel})+$`);

type GoogleChatActionHandler = (input: Record<string, unknown>, context: GoogleChatRuntimeContext) => Promise<unknown>;

interface ListSpacesPayload {
  spaces?: unknown;
  nextPageToken?: string | null;
}

interface ListMessagesPayload {
  messages?: unknown;
  nextPageToken?: string | null;
}

export const googleChatActionHandlers: ProviderActionHandlers<"googlechat", GoogleChatActionHandler> = {
  list_spaces: listSpaces,
  get_space: getSpace,
  list_messages: listMessages,
  get_message: getMessage,
  create_message: createMessage,
  find_direct_message: findDirectMessage,
  get_direct_message_peer: getDirectMessagePeer,
  list_space_members: listSpaceMembers,
};

export const executors: ProviderExecutors = defineGoogleProviderExecutors(service, googleChatActionHandlers, {
  scopes: googleChatServiceAccountScopes,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: googleChatApiBaseUrl,
  auth: googleBearerProxyAuth(googleChatServiceAccountScopes),
  skipDnsValidation: true,
});

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
  customCredential: googleServiceAccountValidator(service, googleChatServiceAccountScopes),
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

/**
 * Locate the existing direct message space between the authenticated user and
 * another user. This is the only way to address a person by identity rather than
 * by an opaque space id: under user authentication a DIRECT_MESSAGE space carries
 * no displayName, and Membership only reports `users/{id}` with no name attached,
 * so `list_spaces` alone can never tell you who a DM is with.
 *
 * Needs nothing beyond chat.spaces.readonly, which the read actions already use.
 */
async function findDirectMessage(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const name = resolveUserName(input.user);
  let payload: unknown;
  try {
    payload = await googleChatJsonRequest<unknown>(`${googleChatApiBaseUrl}/spaces:findDirectMessage`, {
      context,
      query: { name },
    });
  } catch (error) {
    // Google answers 404 for "no such DM", but also for an address that does not
    // resolve or is not visible to this account. Don't collapse those into
    // "you haven't talked yet" — say what is actually known.
    if (error instanceof ProviderRequestError && error.status === 404) {
      throw new ProviderRequestError(
        404,
        `no existing direct message space with ${name}. Either the two of you have never started a conversation, or the identifier is invalid or not visible to this account.`,
        error.details,
      );
    }
    // An address Google cannot resolve to an account comes back as 400
    // "Missing or malformed user resource name ... must follow this format:
    // users/{user}". The format was not the problem — that is Google's wording
    // for "no such user", and taken at face value it sends the caller off to add
    // a users/ prefix, which this action deliberately rejects. So relabel it.
    //
    // Deliberately matched on that specific wording rather than on "any 400":
    // our own validation already ran, so a 400 almost always concerns the
    // address, but "almost always" is not "always", and mislabelling some other
    // 400 as a bad address would point debugging in the wrong direction. If
    // Google ever rewords this, the raw error comes through unchanged — the
    // status quo, not a regression.
    if (error instanceof ProviderRequestError && error.status === 400 && /user resource name/i.test(error.message)) {
      throw new ProviderRequestError(
        400,
        `Google did not accept ${name} as a user identifier. The value is well-formed here, so this usually means it does not resolve to a Google account that this connection can see — check the address. Google's own wording asks for users/{user}; do not add that prefix, this action takes the bare address or id.`,
        error.details,
      );
    }
    throw error;
  }

  const space = normalizeSpace(payload);
  const spaceName = requirePayloadString(space.name, "Google Chat returned a space without a resource name");
  try {
    return { ...space, peer: await resolveDirectMessagePeer(spaceName, context) };
  } catch (error) {
    // The space was found; failing to name its other member must not hide that.
    // Report why instead, so the caller knows the recipient is unconfirmed.
    if (!(error instanceof ProviderRequestError)) {
      throw error;
    }
    return { ...space, peer: null, peerError: { status: error.status, message: error.message } };
  }
}

/**
 * Name the other participant of a direct message space. Chat alone cannot: under
 * user authentication a member is only `users/{id}`, so the id is looked up in the
 * Workspace directory through the People API, where the same id names the person.
 */
async function getDirectMessagePeer(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const spaceName = resolveSpaceName(input.space, "space is required");
  const space = recordOrEmpty(
    await googleChatJsonRequest<unknown>(`${googleChatApiBaseUrl}/${encodeResourceName(spaceName)}`, { context }),
  );
  const spaceType = optionalString(space.spaceType);
  if (spaceType !== "DIRECT_MESSAGE") {
    // Every member of a named space would otherwise be a "peer" candidate, and
    // calling one of them the peer would be a guess presented as a fact.
    throw new ProviderRequestError(
      400,
      `${spaceName} is ${spaceType ?? "a space of unknown type"}, not a direct message`,
    );
  }

  return { space: spaceName, peer: await resolveDirectMessagePeer(spaceName, context) };
}

/**
 * List a space's members with their directory names, one page at a time. Works
 * for any space type; unlike get_direct_message_peer it names everyone and makes
 * no claim about who "the" other participant is.
 */
async function listSpaceMembers(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const spaceName = resolveSpaceName(input.space, "space is required");
  const pageSize = resolvePageSize(input.pageSize);
  const page = await listSpaceMembersPage(spaceName, { pageSize, pageToken: optionalString(input.pageToken) }, context);

  return { space: spaceName, ...page };
}

/**
 * Chat allows up to 1000 members per page, but every human on a page is named in
 * one People batch that takes at most 200, so larger pages are refused rather than
 * silently split into several lookups.
 */
function resolvePageSize(value: unknown): number {
  if (value === undefined || value === null) {
    return defaultMemberPageSize;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maxProfilesPerLookup) {
    throw new ProviderRequestError(400, `pageSize must be an integer from 1 to ${maxProfilesPerLookup}`);
  }

  return value;
}

/**
 * Accept a bare user id or a bare email address and build `users/{user}`.
 *
 * Deliberately narrow: no `users/` prefix (one input shape, no ambiguity), no
 * `me`/`app` aliases, nothing containing a path separator or whitespace. Case is
 * preserved and nothing is percent-decoded — the value is passed through as-is.
 */
function resolveUserName(value: unknown): string {
  const raw = requireString(value, "user is required");
  const trimmed = raw.trim();
  const wellFormed = userIdPattern.test(trimmed) || userEmailPattern.test(trimmed);
  if (trimmed.length > 320 || !wellFormed) {
    throw new ProviderRequestError(400, `user must be an email address or a numeric user id, received "${raw}"`);
  }

  return `users/${trimmed}`;
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
    messages: await attachSenderProfiles(
      Array.isArray(payload.messages) ? payload.messages.map((item) => normalizeMessage(item)) : [],
      context,
    ),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getMessage(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const messageName = resolveMessageName(input);
  const payload = await googleChatJsonRequest<unknown>(`${googleChatApiBaseUrl}/${encodeResourceName(messageName)}`, {
    context,
  });

  const [message] = await attachSenderProfiles([normalizeMessage(payload)], context);
  return message;
}

async function createMessage(input: Record<string, unknown>, context: GoogleChatRuntimeContext) {
  const spaceName = resolveSpaceName(input.space, "space is required");
  const text = requireRawText(input.text, "text is required");
  // Read the thread raw: optionalString() trims and then treats the result as
  // falsy, which would turn a whitespace-only thread into "no thread given" and
  // silently post a new message instead of the requested reply. Anything the
  // caller actually supplied has to reach resolveThreadName and fail loudly.
  const rawThread = optionalRawString(input.thread);
  const threadName = rawThread === undefined ? undefined : resolveThreadName(rawThread, spaceName);
  const replyOption = optionalString(input.messageReplyOption);
  if (replyOption && !threadName) {
    throw new ProviderRequestError(400, "messageReplyOption is only allowed together with thread");
  }

  const payload = await googleChatJsonRequest<unknown>(
    `${googleChatApiBaseUrl}/${encodeResourceName(spaceName)}/messages`,
    {
      context,
      method: "POST",
      query: compactObject({
        // Google's own default silently ignores `thread` and starts a new one, so a
        // caller that supplied a thread gets an explicit failure instead.
        messageReplyOption: replyOption ?? (threadName ? "REPLY_MESSAGE_OR_FAIL" : undefined),
        requestId: optionalString(input.requestId),
      }),
      body: compactObject({
        text,
        thread: threadName ? { name: threadName } : undefined,
      }),
    },
  );

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

/**
 * Accept only the full `spaces/{space}/threads/{thread}` resource name, and require
 * it to belong to the space being posted into. The thread travels in the request
 * body rather than the URL, so this is a contract check rather than traversal
 * defence: it turns a cross-space or malformed thread into a local 400 instead of
 * an opaque remote error.
 */
function resolveThreadName(value: string, parentSpaceName: string): string {
  const trimmed = trimSlashes(value);
  const [, spaceId, , threadId] = trimmed.split("/");
  if (
    !threadNamePattern.test(trimmed) ||
    spaceId === "." ||
    spaceId === ".." ||
    threadId === "." ||
    threadId === ".."
  ) {
    throw new ProviderRequestError(400, `thread must be spaces/{space}/threads/{thread}, received "${value}"`);
  }
  if (`spaces/${spaceId}` !== parentSpaceName) {
    throw new ProviderRequestError(400, `thread must belong to ${parentSpaceName}, received "${value}"`);
  }

  return trimmed;
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

/**
 * Like `requireString`, but keeps the value exactly as provided. Message bodies
 * carry meaningful indentation, so the outgoing text must not be trimmed — while a
 * body that is only whitespace is still rejected.
 */
function requireRawText(value: unknown, message: string): string {
  const resolved = optionalRawString(value);
  if (resolved === undefined || resolved.trim().length === 0) {
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
