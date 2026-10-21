import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "fireflies.on_meeting_ready",
  provider: "fireflies",
  name: "on_meeting_ready",
  displayName: "Meeting Transcript or Summary Ready",
  description:
    "Receives separate transcript and summary readiness events through Fireflies Webhooks V2 after checking meeting access.",
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
          enum: ["meeting.transcribed", "meeting.summarized"],
        },
        minItems: 1,
        maxItems: 2,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["meeting.transcribed", "meeting.summarized"],
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "accountId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "meetingId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
