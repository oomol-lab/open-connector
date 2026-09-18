import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "otter_ai";

export type OtterAiActionName =
  | "get_workspace"
  | "list_channels"
  | "list_channel_members"
  | "list_conversations"
  | "get_conversation"
  | "get_conversation_audio";

interface OtterAiActionDefinition {
  name: OtterAiActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const noInputSchema = s.object("No input is required for this action.", {});
const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const cursorSchema = nonEmptyString("Cursor token returned by a previous Otter.ai page.");
const limitSchema = s.integer("Maximum number of records to return. Otter.ai allows 1 to 100.", {
  minimum: 1,
  maximum: 100,
});

const metaSchema = s.looseObject("Metadata returned by Otter.ai.", {
  retrieved_at: s.string("The timestamp when Otter.ai generated the response metadata."),
  has_more: s.boolean("Whether Otter.ai has another page of results."),
  next_cursor: s.nullableString("Cursor to pass into the next request, when one is available."),
});
const userIdSchema = s.anyOf("The Otter.ai user ID.", [
  s.string("The Otter.ai user ID as a string."),
  s.integer("The Otter.ai user ID as a number."),
]);
const resourceIdSchema = (resourceName: string): JsonSchema =>
  s.anyOf(`The Otter.ai ${resourceName} ID.`, [
    s.string(`The Otter.ai ${resourceName} ID as a string.`),
    s.integer(`The Otter.ai ${resourceName} ID as a number.`),
  ]);
const userSchema = s.looseObject("An Otter.ai user object.", {
  id: userIdSchema,
  name: s.string("The display name of the user."),
  first_name: s.string("The first name of the user."),
  last_name: s.string("The last name of the user."),
  email: s.email("The email address of the user."),
});
const workspaceSchema = s.looseObject("An Otter.ai workspace object.", {
  id: resourceIdSchema("workspace"),
  name: s.string("The workspace name."),
  owner: userSchema,
  member_count: s.integer("The number of members in the workspace."),
  handle: s.string("The workspace handle."),
  type: s.string("The workspace type."),
});
const channelSchema = s.looseObject("An Otter.ai channel object.", {
  id: resourceIdSchema("channel"),
  name: s.string("The channel name."),
  owner: userSchema,
  member_count: s.integer("The number of members in the channel."),
  discoverability: s.string("The channel discoverability setting."),
});
const processStatusSchema = s.looseObject("Otter.ai processing status fields.", {
  abstract_summary: s.nullableString("Processing status for the abstract summary."),
  action_item: s.nullableString("Processing status for action items."),
  outline: s.nullableString("Processing status for the outline."),
});
const conversationSchema = s.looseObject("An Otter.ai conversation object.", {
  id: resourceIdSchema("conversation"),
  title: s.string("The conversation title."),
  url: s.url("The Otter.ai web URL for the conversation."),
  owner: userSchema,
  created_at: s.string("The conversation creation timestamp."),
  process_status: processStatusSchema,
});
const relationshipsSchema = s.looseObject("Related Otter.ai resources requested with include.");
const audioSchema = s.looseObject("Otter.ai conversation audio response data.", {
  url: s.url("The URL for downloading the conversation audio."),
});
const includeSchema = s.array(
  "Related Otter.ai conversation data to include.",
  s.stringEnum("A related conversation data family.", ["action_items", "insights", "outline", "transcript", "all"]),
  { minItems: 1 },
);

const actions: OtterAiActionDefinition[] = [
  {
    name: "get_workspace",
    operationType: "read",
    description: "Get the current Otter.ai workspace for the connected API key.",
    inputSchema: noInputSchema,
    outputSchema: s.object("The current Otter.ai workspace response.", {
      workspace: workspaceSchema,
      meta: metaSchema,
    }),
  },
  {
    name: "list_channels",
    operationType: "read",
    description: "List Otter.ai channels available to the connected workspace.",
    inputSchema: noInputSchema,
    outputSchema: s.object("The Otter.ai channels response.", {
      channels: s.array("Channels returned by Otter.ai.", channelSchema),
      meta: metaSchema,
    }),
  },
  {
    name: "list_channel_members",
    operationType: "read",
    description: "List members of an Otter.ai channel.",
    inputSchema: s.object(
      "Input parameters for listing Otter.ai channel members.",
      {
        channelId: nonEmptyString("The Otter.ai channel ID."),
      },
      { required: ["channelId"] },
    ),
    outputSchema: s.object("The Otter.ai channel members response.", {
      members: s.array("Members returned by Otter.ai.", userSchema),
      meta: metaSchema,
    }),
  },
  {
    name: "list_conversations",
    operationType: "read",
    description: "List Otter.ai conversations with optional channel and pagination filters.",
    inputSchema: s.object(
      "Query parameters for listing Otter.ai conversations.",
      {
        includeShared: s.boolean("Whether to include conversations shared with the workspace."),
        channelId: nonEmptyString("Filter conversations to a specific Otter.ai channel ID."),
        limit: limitSchema,
        cursor: cursorSchema,
      },
      { optional: ["includeShared", "channelId", "limit", "cursor"] },
    ),
    outputSchema: s.object("The paginated Otter.ai conversations response.", {
      conversations: s.array("Conversations returned by Otter.ai.", conversationSchema),
      hasMore: s.boolean("Whether Otter.ai has another page of conversations."),
      nextCursor: s.nullableString("Cursor to pass into the next request, when available."),
      meta: metaSchema,
    }),
  },
  {
    name: "get_conversation",
    operationType: "read",
    description: "Get one Otter.ai conversation by ID with requested related data.",
    inputSchema: s.object(
      "Input parameters for getting an Otter.ai conversation.",
      {
        conversationId: nonEmptyString("The Otter.ai conversation ID."),
        include: includeSchema,
      },
      { required: ["conversationId", "include"] },
    ),
    outputSchema: s.object("The Otter.ai conversation response.", {
      conversation: conversationSchema,
      relationships: relationshipsSchema,
      meta: metaSchema,
    }),
  },
  {
    name: "get_conversation_audio",
    operationType: "read",
    description: "Get the temporary Otter.ai audio download URL for a conversation.",
    inputSchema: s.object(
      "Input parameters for getting Otter.ai conversation audio.",
      {
        conversationId: nonEmptyString("The Otter.ai conversation ID."),
      },
      { required: ["conversationId"] },
    ),
    outputSchema: s.object("The Otter.ai conversation audio response.", {
      audioUrl: s.url("The temporary URL for downloading the conversation audio."),
      audio: audioSchema,
      meta: metaSchema,
      raw: s.looseObject("The raw Otter.ai audio response."),
    }),
  },
];

export const otterAiActions: ActionDefinition[] = actions.map((definition) =>
  defineProviderAction(service, definition),
);
