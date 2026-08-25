import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pushbullet";
const raw = s.looseObject("Pushbullet object returned by the API with upstream fields preserved.");
const iden = s.nonEmptyString("Pushbullet identifier for the resource.");
const deleteOutput = s.object("Response returned after deleting a Pushbullet resource.", {
  deleted: s.boolean("Whether the delete request completed successfully."),
});

export const pushbulletActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the currently authenticated Pushbullet user profile.",
    inputSchema: s.object("Input parameters for getting the current user.", {}),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "list_devices",
    description: "List all registered devices for the current Pushbullet user.",
    inputSchema: s.object("Input parameters for listing Pushbullet devices.", {}),
    outputSchema: s.looseObject("Response returned when listing Pushbullet devices.", {
      devices: s.array("Devices ordered with most recently modified first.", raw),
    }),
  }),
  defineProviderAction(service, {
    name: "create_device",
    description: "Create a new Pushbullet device for the current user.",
    inputSchema: s.looseObject("Input parameters for creating a device."),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "update_device",
    description: "Update metadata for an existing Pushbullet device.",
    inputSchema: s.looseObject("Input parameters for updating a Pushbullet device.", { iden }),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "delete_device",
    description: "Delete one Pushbullet device by identifier.",
    inputSchema: s.object("Input parameters for deleting a Pushbullet device.", { iden }),
    outputSchema: deleteOutput,
  }),
  defineProviderAction(service, {
    name: "list_pushes",
    description: "List Pushbullet pushes with optional active, modified-after, and cursor filters.",
    inputSchema: s.object(
      "Input parameters for listing Pushbullet pushes.",
      {
        active: s.boolean("When true, only return active pushes."),
        modified_after: s.number("Only return pushes modified after this Unix timestamp."),
        cursor: s.nonEmptyString("Cursor returned by a previous list_pushes response."),
        limit: s.integer("Maximum number of pushes to return, up to 500.", { minimum: 1, maximum: 500 }),
      },
      { optional: ["active", "modified_after", "cursor", "limit"] },
    ),
    outputSchema: s.looseObject("Response returned when listing Pushbullet pushes.", {
      pushes: s.array("Pushes ordered with most recently modified first.", raw),
      cursor: s.string("Cursor for fetching the next page of pushes."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_push",
    description: "Send a Pushbullet note, link, file, or list push to the current user or a selected target.",
    inputSchema: s.looseObject("Input parameters for creating a Pushbullet push."),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "update_push",
    description: "Update an existing Pushbullet push by identifier.",
    inputSchema: s.looseObject("Input parameters for updating a Pushbullet push.", { iden }),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "delete_push",
    description: "Delete one Pushbullet push by identifier.",
    inputSchema: s.object("Input parameters for deleting a Pushbullet push.", { iden }),
    outputSchema: deleteOutput,
  }),
  defineProviderAction(service, {
    name: "delete_all_pushes",
    description: "Delete all Pushbullet pushes for the current account.",
    inputSchema: s.object("Input parameters for deleting all Pushbullet pushes.", {}),
    outputSchema: deleteOutput,
  }),
  defineProviderAction(service, {
    name: "list_chats",
    description: "List Pushbullet chats for the current account.",
    inputSchema: s.object("Input parameters for listing Pushbullet chats.", {}),
    outputSchema: s.looseObject("Response returned when listing Pushbullet chats.", {
      chats: s.array("Chats returned by Pushbullet.", raw),
    }),
  }),
  defineProviderAction(service, {
    name: "create_chat",
    description: "Create a Pushbullet chat with another user by email address.",
    inputSchema: s.object("Input parameters for creating a Pushbullet chat.", {
      email: s.email("Email address for the chat participant."),
    }),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "update_chat",
    description: "Update an existing Pushbullet chat by identifier.",
    inputSchema: s.object(
      "Input parameters for updating a Pushbullet chat.",
      {
        iden,
        muted: s.boolean("Whether the chat should be muted."),
      },
      { optional: ["muted"] },
    ),
    outputSchema: raw,
  }),
  defineProviderAction(service, {
    name: "delete_chat",
    description: "Delete one Pushbullet chat by identifier.",
    inputSchema: s.object("Input parameters for deleting a Pushbullet chat.", { iden }),
    outputSchema: deleteOutput,
  }),
];
