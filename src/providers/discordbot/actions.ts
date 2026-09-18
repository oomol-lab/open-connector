import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "discordbot";

const noInputSchema = s.object({}, { description: "No input parameters are required." });
const rawObjectSchema = s.looseObject({}, { description: "A raw Discord API object." });
const snowflakeSchema = s.string("A Discord snowflake identifier.", { minLength: 1 });
const successSchema = s.requiredObject("The success response returned by the action.", {
  success: s.literal(true, { description: "The success flag." }),
});
const binaryFileSchema = s.requiredObject("A binary file payload encoded for transport.", {
  filename: s.string("The file name."),
  mimeType: s.string("The MIME type."),
  sizeBytes: s.integer("The file size in bytes."),
  dataBase64: s.string("The file contents encoded as base64."),
});

export const discordbotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "test_auth",
    operationType: "read",
    description: "Check whether the configured Discord bot token can call the current application endpoint.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The authentication test result.", {
      auth_ok: s.boolean("Whether authentication succeeded."),
      status_code: s.integer("The HTTP status code returned by the test request."),
      error_body: s.string("The error body returned by the test request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_my_application",
    operationType: "read",
    description: "Get the Discord application associated with the configured bot token.",
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_application",
    operationType: "read",
    description: "Get a Discord application by ID.",
    inputSchema: applicationInputSchema("Input parameters containing an application id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_public_keys",
    operationType: "read",
    description: "Get Discord OAuth2 public keys.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The public key response payload.", {
      keys: s.array("The public keys returned by the API.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_gateway",
    operationType: "read",
    description: "Get the public Discord Gateway URL.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The gateway URL response.", {
      url: s.string("The public gateway URL."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_bot_gateway",
    operationType: "read",
    description: "Get the recommended Discord Gateway URL and sharding metadata for the bot.",
    inputSchema: noInputSchema,
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get a Discord user by ID.",
    inputSchema: s.requiredObject("Input parameters containing a user id.", { user_id: snowflakeSchema }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild",
    operationType: "read",
    description: "Get a Discord guild by ID.",
    inputSchema: guildInputSchema("Input parameters containing a guild id."),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_guild_channels",
    operationType: "read",
    description: "List channels in a Discord guild.",
    inputSchema: guildInputSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The guild channels response.", {
      channels: s.array("The channels returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_guild_roles",
    operationType: "read",
    description: "List roles in a Discord guild.",
    inputSchema: guildInputSchema("Input parameters containing a guild id."),
    outputSchema: s.requiredObject("The guild roles response.", {
      roles: s.array("The roles returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_channel",
    operationType: "read",
    description: "Get a Discord channel by ID.",
    inputSchema: s.requiredObject("Input parameters containing a channel id.", { channel_id: snowflakeSchema }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_messages",
    operationType: "read",
    description: "List messages from a Discord channel.",
    inputSchema: s.object(
      "Input parameters for listing channel messages.",
      {
        channel_id: snowflakeSchema,
        around: snowflakeSchema,
        before: snowflakeSchema,
        after: snowflakeSchema,
        limit: s.integer("The maximum number of messages to return.", { minimum: 1, maximum: 100 }),
      },
      { required: ["channel_id"], optional: ["around", "before", "after", "limit"] },
    ),
    outputSchema: s.requiredObject("The messages response.", {
      messages: s.array("The messages returned by Discord.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_message",
    operationType: "write",
    description: "Create a Discord message in a channel.",
    inputSchema: s.object(
      "Input parameters for creating a message.",
      {
        channel_id: snowflakeSchema,
        content: s.string("The message content.", { maxLength: 2000 }),
        embeds: s.array("The embeds to include.", rawObjectSchema, { maxItems: 10 }),
        components: s.array("The components to include.", rawObjectSchema, { maxItems: 5 }),
        allowed_mentions: rawObjectSchema,
        message_reference: rawObjectSchema,
        tts: s.boolean("Whether the message is a text-to-speech message."),
        flags: s.integer("The message flags."),
      },
      {
        required: ["channel_id"],
        optional: ["content", "embeds", "components", "allowed_mentions", "message_reference", "tts", "flags"],
      },
    ),
    outputSchema: s.requiredObject("The created message response.", { message: rawObjectSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_message",
    operationType: "destructive",
    description: "Delete a Discord message from a channel.",
    inputSchema: s.requiredObject("Input parameters containing a channel id and message id.", {
      channel_id: snowflakeSchema,
      message_id: snowflakeSchema,
    }),
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "get_guild_widget_png",
    operationType: "read",
    description: "Get a Discord guild widget PNG.",
    inputSchema: s.object(
      "Input for retrieving a Discord guild widget PNG.",
      {
        guild_id: snowflakeSchema,
        style: s.stringEnum(["shield", "banner1", "banner2", "banner3", "banner4"], {
          description: "The visual style to use for the guild widget PNG.",
        }),
      },
      { required: ["guild_id"], optional: ["style"] },
    ),
    outputSchema: binaryFileSchema,
  }),
];

function applicationInputSchema(description: string) {
  return s.requiredObject(description, { application_id: snowflakeSchema });
}

function guildInputSchema(description: string) {
  return s.requiredObject(description, { guild_id: snowflakeSchema });
}
