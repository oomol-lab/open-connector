import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "slackbot.on_event",
  provider: "slackbot",
  name: "on_event",
  displayName: "Mention or Direct Message",
  description:
    "Receives user mentions and new direct messages through a shared Slack application event source. Slack Connect events are excluded.",
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
        items: { type: "string", enum: ["app_mention", "message.im"] },
        minItems: 1,
        maxItems: 2,
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
    { handle: "channel", jsonSchema: { type: "string" }, nullable: false },
    { handle: "user", jsonSchema: { type: "string" }, nullable: false },
    { handle: "text", jsonSchema: { type: "string" }, nullable: false },
    { handle: "ts", jsonSchema: { type: "string" }, nullable: false },
    { handle: "threadTs", jsonSchema: { type: "string" }, nullable: true },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
