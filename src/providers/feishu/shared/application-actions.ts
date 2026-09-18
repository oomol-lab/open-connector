import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuApplicationProviderPermissions = {
  read: "application:app_slash_command:read",
  write: "application:app_slash_command:write",
};
const commandIdSchema = s.string("The slash command ID returned by Feishu.", { minLength: 1 });
const commandNameSchema = s.string("The slash command name without the leading slash.", {
  minLength: 1,
});
const descriptionI18nSchema = s.record(
  "Localized descriptions keyed by Feishu language code, such as `zh_cn` or `en_us`.",
  s.string("The localized command description.", { minLength: 1 }),
);
const commandSchema = s.looseRequiredObject(
  "A Feishu app slash command.",
  {
    command_id: commandIdSchema,
    command: commandNameSchema,
    description: s.looseObject("The command description and localized values."),
    icon: s.looseObject("The command icon configuration."),
  },
  {
    optional: ["command_id", "command", "description", "icon"],
  },
);
const writeOutputSchema = s.object(
  "The slash command write result.",
  {
    action: s.stringEnum("Whether the command was created or updated.", ["created", "updated"]),
    item: commandSchema,
  },
  {
    optional: [],
  },
);
const targetFields = {
  commandId: s.string("The command ID; mutually exclusive with command.", { minLength: 1 }),
  command: s.string("The command name without the leading slash; mutually exclusive with commandId.", { minLength: 1 }),
};
export function createFeishuApplicationActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_app_slash_commands",
      operationType: "read",
      description: "List every slash command registered on the currently connected Feishu app.",
      requiredScopes: [feishuApplicationProviderPermissions.read],
      providerPermissions: [feishuApplicationProviderPermissions.read],
      inputSchema: s.object(
        "No input is required.",
        {},
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The registered slash commands.",
        {
          items: s.array("The slash commands registered on the app.", commandSchema),
          count: s.nonNegativeInteger("The number of registered slash commands."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_app_slash_command",
      operationType: "write",
      description: "Register a slash command, optionally updating the existing command when its name already exists.",
      requiredScopes: [feishuApplicationProviderPermissions.write, feishuApplicationProviderPermissions.read],
      providerPermissions: [feishuApplicationProviderPermissions.write, feishuApplicationProviderPermissions.read],
      inputSchema: s.object(
        "Describe the slash command to register.",
        {
          command: commandNameSchema,
          description: s.string("The default command description shown by Feishu.", {
            minLength: 1,
          }),
          descriptionI18n: descriptionI18nSchema,
          iconKey: s.string("The Feishu icon key shown beside the command.", { minLength: 1 }),
          force: s.boolean("Whether a command-name collision should update the existing command in place."),
        },
        {
          optional: ["descriptionI18n", "iconKey", "force"],
        },
      ),
      outputSchema: writeOutputSchema,
    }),
    defineProviderAction(service, {
      name: "update_app_slash_command",
      operationType: "write",
      description: "Update the description, localized descriptions, or icon of a slash command selected by ID or name.",
      requiredScopes: [feishuApplicationProviderPermissions.write, feishuApplicationProviderPermissions.read],
      providerPermissions: [feishuApplicationProviderPermissions.write, feishuApplicationProviderPermissions.read],
      inputSchema: {
        ...s.object(
          "Identify one slash command and provide at least one field to update.",
          {
            ...targetFields,
            description: s.string("The new default command description.", { minLength: 1 }),
            descriptionI18n: descriptionI18nSchema,
            iconKey: s.string("The new Feishu icon key.", { minLength: 1 }),
          },
          {
            optional: ["commandId", "command", "description", "descriptionI18n", "iconKey"],
          },
        ),
        allOf: [
          {
            oneOf: [
              { required: ["commandId"], not: { required: ["command"] } },
              { required: ["command"], not: { required: ["commandId"] } },
            ],
          },
          { anyOf: [{ required: ["description"] }, { required: ["descriptionI18n"] }, { required: ["iconKey"] }] },
          { anyOf: [{ required: ["description"] }, { not: { required: ["descriptionI18n"] } }] },
        ],
      },
      outputSchema: writeOutputSchema,
    }),
    defineProviderAction(service, {
      name: "delete_app_slash_command",
      operationType: "destructive",
      description: "Permanently delete a slash command selected by command ID or exact command name.",
      requiredScopes: [feishuApplicationProviderPermissions.write, feishuApplicationProviderPermissions.read],
      providerPermissions: [feishuApplicationProviderPermissions.write, feishuApplicationProviderPermissions.read],
      inputSchema: {
        ...s.object("Identify the slash command to delete.", targetFields, {
          optional: ["commandId", "command"],
        }),
        oneOf: [
          { required: ["commandId"], not: { required: ["command"] } },
          { required: ["command"], not: { required: ["commandId"] } },
        ],
      },
      outputSchema: s.object(
        "The deleted slash command reference.",
        {
          deleted: s.boolean("Whether the command was deleted."),
          commandId: commandIdSchema,
          command: commandNameSchema,
        },
        {
          optional: ["command"],
        },
      ),
    }),
  ];
}
