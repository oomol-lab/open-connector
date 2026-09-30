import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const eventSchema: JsonSchema = s.object(
  {
    createdTime: { type: ["string", "null"] },
    driveId: { type: ["string", "null"] },
    eventType: s.stringEnum(["file_created", "file_updated", "folder_created", "folder_updated"]),
    fileId: s.string(),
    itemType: s.stringEnum(["file", "folder"]),
    lastModifyingUser: { type: ["object", "null"] },
    mimeType: s.string(),
    modifiedTime: { type: ["string", "null"] },
    name: s.string(),
    parents: s.array(s.string()),
    size: s.string(),
    webViewLink: { type: ["string", "null"] },
  },
  {
    additionalProperties: false,
    required: [
      "eventType",
      "itemType",
      "fileId",
      "name",
      "mimeType",
      "createdTime",
      "modifiedTime",
      "parents",
      "webViewLink",
      "driveId",
      "lastModifyingUser",
    ],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "changeType",
      jsonSchema: s.stringEnum(["created", "updated"]),
      nullable: false,
    },
    {
      handle: "driveId",
      jsonSchema: s.string({ pattern: "^[A-Za-z0-9_-]{0,512}$" }),
      nullable: false,
      value: "",
    },
    {
      handle: "folderId",
      jsonSchema: s.string({ pattern: "^[A-Za-z0-9_-]{2,512}$" }),
      nullable: false,
    },
    {
      handle: "itemTypes",
      jsonSchema: s.array(s.stringEnum(["file", "folder"]), { minItems: 1, uniqueItems: true }),
      nullable: false,
      value: ["file"],
    },
    {
      handle: "maxFilesPerPoll",
      jsonSchema: s.integer({ maximum: 200, minimum: 1 }),
      nullable: false,
      value: 50,
    },
    {
      handle: "mimeTypes",
      jsonSchema: s.array(s.string({ minLength: 1 })),
      nullable: false,
      value: [],
    },
    { handle: "namePrefix", jsonSchema: s.string(), nullable: false, value: "" },
  ],
  definitionVersion: 2,
  description:
    "Polls one Google Drive folder and triggers when a file or folder directly inside it is created or updated.",
  displayName: "File or Folder Change in a Folder",
  key: "googledrive.on_file_change",
  name: "on_file_change",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "googledrive",
  type: "poll",
};
