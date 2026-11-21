import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const triggerEvents = [
  "taskStarted",
  "taskEta",
  "taskArrival",
  "taskCompleted",
  "taskFailed",
  "workerDuty",
  "taskCreated",
  "taskUpdated",
  "taskDeleted",
  "taskAssigned",
  "taskUnassigned",
  "taskDelayed",
  "taskCloned",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "onfleet.on_task_event",
  provider: "onfleet",
  name: "on_task_event",
  displayName: "Task or Worker Event",
  description: "Triggers when selected Onfleet delivery task or worker webhook events occur.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["GET", "POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: true },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "trigger",
      jsonSchema: { type: "string", enum: triggerEvents, title: "Event" },
      nullable: false,
      value: "taskCompleted",
    },
  ],
  outputs: [
    { handle: "triggerName", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "taskId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
