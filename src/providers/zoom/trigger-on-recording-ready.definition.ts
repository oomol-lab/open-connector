import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "zoom.on_recording_ready",
  provider: "zoom",
  name: "on_recording_ready",
  displayName: "Cloud Recording Ready",
  description:
    "Receives completed cloud recordings hosted by the connected Zoom user through a verified application event source.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "sourceId",
      jsonSchema: { type: "string", pattern: "^source_[0-9a-f]{32}$", title: "Event source" },
      nullable: false,
    },
    {
      handle: "eventTypes",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          enum: ["recording.completed"],
        },
        minItems: 1,
        maxItems: 1,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["recording.completed"],
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "accountId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "meetingUuid", jsonSchema: { type: "string" }, nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
