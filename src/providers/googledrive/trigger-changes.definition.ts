import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const defaultPageSize: number = 100;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  configInputs: [
    {
      handle: "driveId",
      jsonSchema: s.string({ maxLength: 256, minLength: 1 }),
      nullable: true,
      description: "Optional shared drive ID. Omit it to monitor the connected account.",
    },
    {
      handle: "includeCorpusRemovals",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
      description: "Include the accessible file resource when an item leaves the change corpus.",
    },
    {
      handle: "includeItemsFromAllDrives",
      jsonSchema: s.boolean(),
      nullable: false,
      value: true,
      description: "Include items from My Drive and shared drives.",
    },
    {
      handle: "includeRemoved",
      jsonSchema: s.boolean(),
      nullable: false,
      value: true,
      description: "Include changes caused by deletion or loss of access.",
    },
    {
      handle: "pageSize",
      jsonSchema: s.integer({ maximum: 100, minimum: 1 }),
      nullable: false,
      value: defaultPageSize,
      description: "Maximum changes included in one Flow Run.",
    },
    {
      handle: "restrictToMyDrive",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
      description: "Restrict changes to the My Drive hierarchy.",
    },
  ],
  definitionVersion: 2,
  description: "Uses a Google Drive changes.watch channel and triggers when Drive changes are available.",
  displayName: "Changes Detected",
  endpoint: {
    body: { allowArray: false, allowEmpty: true, formats: ["json"] },
    methods: ["POST"],
    successStatus: 204,
  },
  key: "googledrive.changes_detected",
  name: "changes_detected",
  outputs: [
    {
      handle: "events",
      jsonSchema: s.array(
        s.object(
          {
            changeId: s.string(),
            changeType: { type: ["string", "null"] },
            driveId: { type: ["string", "null"] },
            file: { type: ["object", "null"] },
            fileId: { type: ["string", "null"] },
            notification: s.object(
              {
                changedTypes: s.array(s.string()),
                messageNumber: { type: ["string", "null"] },
                resourceState: s.string(),
                resourceUri: { type: ["string", "null"] },
              },
              {
                additionalProperties: false,
                required: ["resourceState", "changedTypes", "messageNumber", "resourceUri"],
              },
            ),
            removed: s.boolean(),
            time: { type: ["string", "null"] },
          },
          {
            additionalProperties: false,
            required: ["changeId", "changeType", "removed", "time", "fileId", "driveId", "file", "notification"],
          },
        ),
      ),
      nullable: false,
    },
  ],
  provider: "googledrive",
  type: "integration",
};
export const additionalSnapshot0: TriggerKeySnapshot & { readonly type: "integration" } = {
  ...snapshot,
  configInputs: snapshot.configInputs,
  key: "googledrive.watch_changes",
  name: "watch_changes",
  displayName: "Watch Changes",
  description: "Monitors Drive changes using notifications and periodic scans of the same change stream.",
  outputs: [
    {
      handle: "events",
      jsonSchema: s.array({ type: "object" }),
      nullable: false,
    },
  ],
};
