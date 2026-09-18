import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleChatMessagesReadonlyScope, googleChatSpacesReadonlyScope } from "./scopes.ts";

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

const space = s.object(
  "A normalized Google Chat space.",
  {
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
  },
  { required: ["name", "spaceId"] },
);

const messageSender = s.object("The user who created the message.", {
  name: s.string("The resource name of the sender, in the form users/{user}."),
  displayName: s.string("The display name of the sender. Only populated for app authentication."),
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
    "list_messages",
    "read",
    "List the message history of a Google Chat space, with optional filtering, ordering, and pagination.",
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
    "Retrieve a single Google Chat message by its resource name, or by space and message ID.",
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
