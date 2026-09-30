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
      jsonSchema: s.array(s.stringEnum(["created", "updated", "deleted"]), { minItems: 1, uniqueItems: true }),
      nullable: false,
      value: ["created", "updated"],
    },
    { handle: "itemId", jsonSchema: s.string(), nullable: false, value: "" },
    {
      handle: "itemTypes",
      jsonSchema: s.array(s.stringEnum(["file", "folder"]), { minItems: 1, uniqueItems: true }),
      nullable: false,
      value: ["file"],
    },
    {
      handle: "maxItemsPerPoll",
      jsonSchema: s.integer({ maximum: 200, minimum: 1 }),
      nullable: false,
      value: 50,
    },
    { handle: "parentFolderId", jsonSchema: s.string(), nullable: false, value: "" },
  ],
  definitionVersion: 2,
  description: "Polls the OneDrive change feed and triggers when a file or folder is created, updated or deleted.",
  displayName: "File or Folder Changed",
  key: "one_drive.on_item_changed",
  name: "on_item_changed",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "one_drive",
  type: "poll",
};
