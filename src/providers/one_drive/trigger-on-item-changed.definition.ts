import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const eventSchema: JsonSchema = s.object(
  {
    changeType: s.stringEnum(["created", "updated", "deleted"]),
    createdDateTime: { type: ["string", "null"] },
    driveId: { type: ["string", "null"] },
    eTag: { type: ["string", "null"] },
    itemId: s.string(),
    itemType: s.stringEnum(["file", "folder"]),
    lastModifiedDateTime: { type: ["string", "null"] },
    mimeType: { type: ["string", "null"] },
    name: s.string(),
    parentFolderId: { type: ["string", "null"] },
    size: { type: ["number", "null"] },
    webUrl: s.string(),
  },
  {
    additionalProperties: false,
    required: [
      "itemId",
      "name",
      "changeType",
      "itemType",
      "size",
      "mimeType",
      "webUrl",
      "parentFolderId",
      "driveId",
      "createdDateTime",
      "lastModifiedDateTime",
      "eTag",
    ],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "events",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          enum: ["created", "updated", "deleted"],
        },
        minItems: 1,
        uniqueItems: true,
      },
      nullable: false,
      value: ["created", "updated"],
    },
    {
      handle: "itemId",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
    },
    {
      handle: "itemTypes",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          enum: ["file", "folder"],
        },
        minItems: 1,
        uniqueItems: true,
      },
      nullable: false,
      value: ["file"],
    },
    {
      handle: "parentFolderId",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
    },
    {
      group: "Advanced settings",
      collapsed: true,
    },
    {
      handle: "maxItemsPerPoll",
      jsonSchema: {
        type: "integer",
        minimum: 1,
        maximum: 200,
      },
      nullable: false,
      value: 50,
    },
  ],
  definitionVersion: 3,
  description: "Polls the OneDrive change feed and triggers when a file or folder is created, updated or deleted.",
  displayName: "File or Folder Changed",
  key: "one_drive.on_item_changed",
  name: "on_item_changed",
  outputs: [{ handle: "event", jsonSchema: eventSchema, nullable: false }],
  provider: "one_drive",
  type: "poll",
};
