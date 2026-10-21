import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const events = ["taskCreated", "taskStatusUpdated", "taskCommentPosted"] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "clickup.on_task_event",
  provider: "clickup",
  name: "on_task_event",
  displayName: "Task Event",
  description: "Receives task creation, status changes, and new comments in a ClickUp Workspace or List.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "workspaceId",
      jsonSchema: { type: "string", pattern: "^[0-9]+$", title: "Workspace ID" },
      nullable: false,
    },
    { handle: "listId", jsonSchema: { type: "string", pattern: "^[0-9]+$", title: "List ID" }, nullable: true },
    {
      handle: "eventTypes",
      jsonSchema: {
        type: "array",
        items: { type: "string", enum: events },
        minItems: 1,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: events,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string", enum: events }, nullable: false },
    { handle: "taskId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
