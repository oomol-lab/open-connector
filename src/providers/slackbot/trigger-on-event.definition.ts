import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "slackbot.on_event",
  provider: "slackbot",
  name: "on_event",
  displayName: "Mention, Direct Message or Interaction",
  description:
    "Receives user mentions, new direct messages and interactive component payloads (button clicks, menu selections and modal submissions or closes) through a shared Slack application event source. Slack Connect message events are excluded.",
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
          enum: ["app_mention", "message.im", "block_actions", "view_submission", "view_closed"],
        },
        minItems: 1,
        maxItems: 5,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["app_mention", "message.im"],
    },
    {
      handle: "channelIds",
      jsonSchema: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 100,
        uniqueItems: true,
        title: "Channel IDs",
      },
      nullable: true,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "appId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "teamId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "channel", jsonSchema: { type: "string" }, nullable: true },
    { handle: "user", jsonSchema: { type: "string" }, nullable: false },
    { handle: "text", jsonSchema: { type: "string" }, nullable: true },
    { handle: "ts", jsonSchema: { type: "string" }, nullable: true },
    { handle: "threadTs", jsonSchema: { type: "string" }, nullable: true },
    { handle: "responseUrl", jsonSchema: { type: "string" }, nullable: true },
    {
      handle: "actions",
      jsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            actionId: { type: ["string", "null"] },
            blockId: { type: ["string", "null"] },
            type: { type: ["string", "null"] },
            value: { type: ["string", "null"] },
            selectedOption: {
              type: ["object", "null"],
              properties: { value: { type: ["string", "null"] }, text: { type: ["string", "null"] } },
            },
            actionTs: { type: ["string", "null"] },
          },
        },
      },
      nullable: true,
    },
    {
      handle: "view",
      jsonSchema: {
        type: "object",
        properties: {
          id: { type: ["string", "null"] },
          callbackId: { type: ["string", "null"] },
          privateMetadata: { type: ["string", "null"] },
          state: { type: "object" },
          isCleared: { type: "boolean" },
        },
      },
      nullable: true,
    },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
