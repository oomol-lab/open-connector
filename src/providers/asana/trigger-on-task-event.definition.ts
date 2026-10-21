import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "asana.on_task_event",
  provider: "asana",
  name: "on_task_event",
  displayName: "Project Task Event",
  description:
    "Receives tasks added to a project, completion changes, and selected custom field changes. Task details represent current state, not historical state.",
  definitionVersion: 2,
  type: "integration",
  endpoint: { methods: ["POST"], body: { formats: ["json"], allowArray: false, allowEmpty: true }, successStatus: 200 },
  configInputs: [
    { handle: "projectId", jsonSchema: { type: "string", minLength: 1, title: "Project ID" }, nullable: false },
    {
      handle: "eventTypes",
      jsonSchema: {
        type: "array",
        items: { type: "string", enum: ["task.added", "task.completed", "task.field_changed"] },
        minItems: 1,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["task.added", "task.completed"],
    },
    { handle: "customFieldId", jsonSchema: { type: "string", minLength: 1, title: "Custom field ID" }, nullable: true },
  ],
  outputs: [
    { handle: "projectId", jsonSchema: s.string(), nullable: false },
    {
      handle: "events",
      jsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: { event: s.string(), task: { type: "object" }, change: { type: "object" } },
          required: ["event", "task", "change"],
        },
      },
      nullable: false,
    },
  ],
};
