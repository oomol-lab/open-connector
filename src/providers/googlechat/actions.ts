import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  googleChatMembershipsReadonlyScope,
  googleChatMessagesCreateScope,
  googleChatMessagesReadonlyScope,
  googleChatSpacesReadonlyScope,
  googleDirectoryReadonlyScope,
} from "./scopes.ts";

const service = "googlechat";

interface GoogleChatActionSource {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const membershipCount = s.object("Counts of members that have directly joined the space.", {
  joinedDirectHumanUserCount: s.integer("The number of human users that have directly joined the space."),
  joinedGroupCount: s.integer("The number of groups that have directly joined the space."),
});

const spaceProperties = {
  name: s.string("The resource name of the space, in the form spaces/{space}."),
  spaceId: s.string("The bare space ID with the spaces/ prefix removed."),
  displayName: s.string("The display name of the space. Empty for direct messages."),
  spaceType: s.string("The space type, such as SPACE, GROUP_CHAT, or DIRECT_MESSAGE."),
  spaceHistoryState: s.string("Whether message history is turned on or off for the space."),
  externalUserAllowed: s.boolean("Whether the space allows users outside the Google Workspace organization."),
  spaceUri: s.string("The URI that opens the space in the Google Chat client."),
  createTime: s.string("The time the space was created."),
  lastActiveTime: s.string("The time of the most recent message in the space."),
  spaceDetails: s.looseObject("Space description and guidelines shown to members."),
  membershipCount,
};

const space = s.object("A normalized Google Chat space.", spaceProperties, { required: ["name", "spaceId"] });

const directMessagePeer = s.object(
  "The other participant of a direct message, named through the Workspace directory.",
  {
    kind: s.stringEnum(
      "HUMAN for another person, BOT for a Chat app, SELF for a direct message with only yourself, AMBIGUOUS when the members do not single out one peer.",
      ["HUMAN", "BOT", "SELF", "AMBIGUOUS"],
    ),
    user: s.nullableString("The peer's resource name, in the form users/{user}. Null when the peer is AMBIGUOUS."),
    displayName: s.nullableString(
      "The peer's name from the Workspace directory. Null for BOT, SELF, AMBIGUOUS, or when the directory does not reveal it; profileUnavailableReason then says why.",
    ),
    email: s.nullableString("The peer's primary email address from the Workspace directory, when visible."),
    profileUnavailableReason: s.stringEnum(
      "Why displayName is null for a HUMAN peer: profile_name_missing when the directory returned no name (profile sharing may be off), people_forbidden or people_not_found for a 403 or 404 from the People API, people_request_failed for any other failure.",
      ["profile_name_missing", "people_forbidden", "people_not_found", "people_request_failed"],
    ),
    candidates: s.stringArray("For an AMBIGUOUS peer, the users/{user} names of the members that could be the peer."),
  },
  { required: ["kind", "user", "displayName", "email"] },
);

const spaceMember = s.object(
  "A member of a Google Chat space, named through the Workspace directory.",
  {
    user: s.string("The member's resource name, in the form users/{user}."),
    kind: s.string("HUMAN for a person, BOT for a Chat app."),
    role: s.string("The member's role in the space, such as ROLE_MEMBER or ROLE_MANAGER."),
    isSelf: s.boolean("Whether this member is the authenticated user."),
    displayName: s.nullableString(
      "The member's name from the Workspace directory. Null for bots, or when the directory does not reveal it; profileUnavailableReason then says why.",
    ),
    email: s.nullableString("The member's primary email address from the Workspace directory, when visible."),
    profileUnavailableReason: s.stringEnum(
      "Why displayName is null for a human member: profile_name_missing when the directory returned no name (profile sharing may be off), people_forbidden or people_not_found when the People API refused or could not find the profile, people_request_failed for any other failure.",
      ["profile_name_missing", "people_forbidden", "people_not_found", "people_request_failed"],
    ),
  },
  { required: ["user", "isSelf", "displayName", "email"] },
);

const messageSender = s.object("The user who created the message.", {
  name: s.string("The resource name of the sender, in the form users/{user}."),
  displayName: s.nullableString(
    "The sender's name. Google Chat omits it under user authentication, so for human senders it is filled in from the Workspace directory; null when the directory does not reveal it, with profileUnavailableReason saying why. Not set for bots.",
  ),
  email: s.nullableString("The human sender's primary email address from the Workspace directory, when visible."),
  profileUnavailableReason: s.stringEnum(
    "Why displayName is null for a human sender: profile_name_missing, people_forbidden, people_not_found, or people_request_failed. Names need the directory.readonly scope and the People API.",
    ["profile_name_missing", "people_forbidden", "people_not_found", "people_request_failed"],
  ),
  type: s.string("The sender type, either HUMAN or BOT."),
  domainId: s.string("The Google Workspace domain ID of the sender."),
  isAnonymous: s.boolean("Whether the sender is an anonymous user."),
});

const messageThread = s.object("The thread the message belongs to.", {
  name: s.string("The resource name of the thread, in the form spaces/{space}/threads/{thread}."),
  threadKey: s.string("The client-assigned ID for the thread."),
});

const message = s.object(
  "A normalized Google Chat message.",
  {
    name: s.string("The resource name of the message, in the form spaces/{space}/messages/{message}."),
    messageId: s.string("The bare message ID with the spaces/{space}/messages/ prefix removed."),
    spaceName: s.string("The resource name of the space that owns the message."),
    text: s.string("The plain-text body of the message."),
    formattedText: s.string("The message body with Google Chat formatting markup preserved."),
    argumentText: s.string("The plain-text body with all Chat app mentions stripped out."),
    createTime: s.string("The time the message was created."),
    lastUpdateTime: s.string("The time the message was last edited by a user."),
    deleteTime: s.string("The time the message was deleted, when it has been deleted."),
    threadReply: s.boolean("Whether the message is a reply inside an existing thread."),
    sender: messageSender,
    thread: messageThread,
  },
  { required: ["name", "messageId"] },
);

const actions: GoogleChatActionSource[] = [
  action(
    "list_spaces",
    "read",
    "List the Google Chat spaces the authenticated user is a member of, with optional filtering and pagination.",
    [googleChatSpacesReadonlyScope],
    s.actionInput({
      filter: s.nonEmptyString('A Google Chat filter expression, such as spaceType = "SPACE".'),
      pageSize: s.integer("The maximum number of spaces to return.", { minimum: 1, maximum: 1000 }),
      pageToken: s.nonEmptyString("A pagination token returned by a previous list_spaces call."),
    }),
    s.requiredObject("The normalized result of listing spaces.", {
      spaces: s.array("The spaces the authenticated user belongs to.", space),
      nextPageToken: s.nullableString("A pagination token for fetching the next page of spaces."),
    }),
  ),
  action(
    "get_space",
    "read",
    "Retrieve the details of a single Google Chat space.",
    [googleChatSpacesReadonlyScope],
    s.actionInput(
      {
        space: s.nonEmptyString("The space to retrieve, either spaces/{space} or the bare {space} ID."),
      },
      ["space"],
    ),
    space,
  ),
  action(
    "find_direct_message",
    "read",
    "Find the existing direct message space between the authenticated user and one other user, identified by email address or numeric user id. Use this to address a person by identity instead of by an opaque space id: under user authentication a direct message space has no displayName and its membership reports only users/{id}, so list_spaces can never tell you who a DM is with. Only finds conversations that already exist; it never creates one. Caution when the result is fed to create_message: if the identifier is mistyped but still resolves to another real user this account already has a DM with, this action succeeds and returns that person's space, and the returned space id is opaque, so it cannot be eyeballed to confirm the recipient. The result therefore carries peer, the person the space actually belongs to, named through the Workspace directory: read it back to the user and confirm the name before sending. Nothing enforces that check. Naming the peer needs the chat.memberships.readonly and directory.readonly scopes plus the People API on top of the scope below. When the peer cannot be named, peer is null and peerError says why, while the space itself is still returned.",
    [googleChatSpacesReadonlyScope],
    s.actionInput(
      {
        user: s.nonEmptyString(
          "The other participant, as a bare email address such as person@example.com or a bare numeric user id. Do not include the users/ prefix, and aliases such as me or app are not accepted.",
        ),
      },
      ["user"],
    ),
    s.object(
      "The direct message space, with its other participant.",
      {
        ...spaceProperties,
        peer: s.nullable(directMessagePeer),
        peerError: s.object("Why peer is null. Absent when the peer was resolved.", {
          status: s.integer("The HTTP status of the failed lookup."),
          message: s.string("What went wrong."),
        }),
      },
      { required: ["name", "spaceId", "peer"] },
    ),
  ),
  action(
    "get_direct_message_peer",
    "read",
    "Name the other participant of a direct message space. Under user authentication Google Chat reports a member only as users/{id}, so this looks the id up in the Workspace directory through the People API. Use it to tell who a direct message from list_spaces is with. Rejects spaces that are not direct messages. A peer that cannot be named still comes back with its users/{id} and a profileUnavailableReason.",
    [googleChatSpacesReadonlyScope, googleChatMembershipsReadonlyScope, googleDirectoryReadonlyScope],
    s.actionInput(
      {
        space: s.nonEmptyString("The direct message space, either spaces/{space} or the bare {space} ID."),
      },
      ["space"],
    ),
    s.object(
      "The direct message space and its other participant.",
      {
        space: s.string("The resource name of the space, in the form spaces/{space}."),
        peer: directMessagePeer,
      },
      { required: ["space", "peer"] },
    ),
  ),
  action(
    "list_space_members",
    "read",
    "List the members of any Google Chat space, including group spaces, with each person's name and email from the Workspace directory. Under user authentication Google Chat reports members only as users/{id}, so every human on a page is looked up through the People API in one batch. Returns one page at a time; pass nextPageToken back as pageToken for the next page. Members whose profile cannot be read keep their users/{id} with a null displayName and a profileUnavailableReason.",
    [googleChatMembershipsReadonlyScope, googleDirectoryReadonlyScope],
    s.actionInput(
      {
        space: s.nonEmptyString("The space whose members to list, either spaces/{space} or the bare {space} ID."),
        pageSize: s.integer(
          "The maximum number of members to return, at most 200 so that one directory lookup covers the page. Defaults to 100.",
          { minimum: 1, maximum: 200 },
        ),
        pageToken: s.nonEmptyString("The nextPageToken from a previous call, to fetch the next page."),
      },
      ["space"],
    ),
    s.object(
      "One page of the space's members.",
      {
        space: s.string("The resource name of the space, in the form spaces/{space}."),
        members: s.array(spaceMember, {
          description: "The members on this page, in the order Google Chat returned them.",
        }),
        nextPageToken: s.nullableString("The token for the next page, or null when this is the last page."),
      },
      { required: ["space", "members", "nextPageToken"] },
    ),
  ),
  action(
    "list_messages",
    "read",
    "List the message history of a Google Chat space, with optional filtering, ordering, and pagination. Human senders are named from the Workspace directory, which needs the directory.readonly scope and the People API on top of the scope below; without them each keeps its users/{id} with a null displayName and a profileUnavailableReason, and the messages are still returned.",
    [googleChatMessagesReadonlyScope],
    s.actionInput(
      {
        space: s.nonEmptyString("The space whose messages to list, either spaces/{space} or the bare {space} ID."),
        filter: s.nonEmptyString(
          'A Google Chat filter expression over createTime or thread.name, such as createTime > "2026-01-01T00:00:00+00:00".',
        ),
        orderBy: s.nonEmptyString(
          'How to order the messages, as a createTime ordering such as "createTime ASC" or "createTime DESC".',
        ),
        showDeleted: s.boolean("Whether to include deleted messages in the result."),
        pageSize: s.integer("The maximum number of messages to return.", { minimum: 1, maximum: 1000 }),
        pageToken: s.nonEmptyString("A pagination token returned by a previous list_messages call."),
      },
      ["space"],
    ),
    s.requiredObject("The normalized result of listing space messages.", {
      messages: s.array("The messages in the requested page of space history.", message),
      nextPageToken: s.nullableString("A pagination token for fetching the next page of messages."),
    }),
  ),
  action(
    "get_message",
    "read",
    "Retrieve a single Google Chat message by its resource name, or by space and message ID. Human senders are named from the Workspace directory, which needs the directory.readonly scope and the People API on top of the scope below; without them each keeps its users/{id} with a null displayName and a profileUnavailableReason, and the messages are still returned.",
    [googleChatMessagesReadonlyScope],
    s.actionInput(
      {
        message: s.nonEmptyString(
          "The message to retrieve, either the full spaces/{space}/messages/{message} name or the bare {message} ID.",
        ),
        space: s.nonEmptyString("The space that owns the message. Required when message is a bare ID."),
      },
      ["message"],
    ),
    message,
  ),
  action(
    "create_message",
    "write",
    [
      "Send a plain-text message to a Google Chat space, optionally as a reply inside an existing thread.",
      "Under user authentication the Chat API only accepts plain text, so cards and attachments are not supported.",
      "When thread is provided but messageReplyOption is omitted, this action sends REPLY_MESSAGE_OR_FAIL rather than",
      "the Google default, which would silently ignore the thread and start a new one.",
      "messageReplyOption only applies to named spaces (spaceType=SPACE).",
      "Reusing a requestId returns the message that was already created instead of sending a new one.",
    ].join(" "),
    [googleChatMessagesCreateScope],
    {
      ...s.actionInput(
        {
          space: s.nonEmptyString("The space to post into, either spaces/{space} or the bare {space} ID."),
          text: s.nonWhitespaceString(
            "The plain-text body of the message. Leading and trailing whitespace is preserved, so indentation inside the message survives.",
          ),
          thread: s.nonWhitespaceString(
            "The thread to reply into, as the full spaces/{space}/threads/{thread} name. Its space must match the space input.",
          ),
          messageReplyOption: s.stringEnum(
            "How to handle the target thread. Only allowed together with thread; defaults to REPLY_MESSAGE_OR_FAIL when thread is set.",
            ["REPLY_MESSAGE_OR_FAIL", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"],
          ),
          requestId: s.nonWhitespaceString(
            "An idempotency key. Only reuse it to retry the same intended message: reusing it with different content returns the original message instead of sending or updating anything.",
          ),
        },
        ["space", "text"],
      ),
      dependentRequired: { messageReplyOption: ["thread"] },
    },
    message,
  ),
];

export const googleChatActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

function action(
  name: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogleChatActionSource {
  return {
    name,
    operationType,
    description,
    requiredScopes,
    inputSchema,
    outputSchema,
  };
}
