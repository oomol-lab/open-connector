import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const targetTypes = ["file", "folder"] as const;
const triggers = [
  "FILE.UPLOADED",
  "FILE.PREVIEWED",
  "FILE.DOWNLOADED",
  "FILE.TRASHED",
  "FILE.DELETED",
  "FILE.RESTORED",
  "FILE.COPIED",
  "FILE.MOVED",
  "FILE.LOCKED",
  "FILE.UNLOCKED",
  "FILE.RENAMED",
  "COMMENT.CREATED",
  "COMMENT.UPDATED",
  "COMMENT.DELETED",
  "TASK_ASSIGNMENT.CREATED",
  "TASK_ASSIGNMENT.UPDATED",
  "FOLDER.CREATED",
  "FOLDER.RENAMED",
  "FOLDER.DOWNLOADED",
  "FOLDER.RESTORED",
  "FOLDER.DELETED",
  "FOLDER.COPIED",
  "FOLDER.MOVED",
  "FOLDER.TRASHED",
  "SHARED_LINK.CREATED",
  "SHARED_LINK.UPDATED",
  "SHARED_LINK.DELETED",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "box.on_item_event",
  provider: "box",
  name: "on_item_event",
  displayName: "File or Folder Event",
  description: "Triggers when selected Box webhook events occur on a file or folder.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "targetType",
      jsonSchema: { type: "string", enum: targetTypes, title: "Target Type" },
      nullable: false,
      value: "folder",
    },
    {
      handle: "targetId",
      jsonSchema: s.string({ minLength: 1 }),
      nullable: false,
    },
    {
      handle: "triggers",
      jsonSchema: s.array(s.stringEnum(triggers), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "targetId", jsonSchema: s.string(), nullable: false },
    { handle: "targetType", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
