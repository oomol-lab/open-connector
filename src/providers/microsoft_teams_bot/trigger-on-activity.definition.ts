import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "microsoft_teams_bot.on_activity",
  provider: "microsoft_teams_bot",
  name: "on_activity",
  displayName: "Bot Activity",
  description:
    "Receives Microsoft Teams activities sent to the bot's messaging endpoint through a shared event source: messages that mention the bot or reach it in a personal chat, conversation updates, reactions and invokes.",
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
        items: { type: "string", enum: ["message", "conversationUpdate", "messageReaction", "invoke"] },
        minItems: 1,
        maxItems: 4,
        uniqueItems: true,
        title: "Activity types",
      },
      nullable: false,
      value: ["message"],
    },
    {
      handle: "conversationIds",
      jsonSchema: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 100,
        uniqueItems: true,
        title: "Conversation IDs",
      },
      nullable: true,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "activityId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "text", jsonSchema: { type: "string" }, nullable: true },
    { handle: "rawText", jsonSchema: { type: "string" }, nullable: true },
    {
      handle: "mentions",
      jsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: ["string", "null"] },
            name: { type: ["string", "null"] },
            isBot: { type: "boolean" },
          },
        },
      },
      nullable: false,
    },
    {
      handle: "from",
      jsonSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          aadObjectId: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
        },
      },
      nullable: false,
    },
    {
      handle: "conversation",
      jsonSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          conversationType: { type: ["string", "null"] },
          tenantId: { type: ["string", "null"] },
        },
      },
      nullable: false,
    },
    { handle: "channelData", jsonSchema: { type: "object" }, nullable: true },
    { handle: "replyToId", jsonSchema: { type: "string" }, nullable: true },
    { handle: "serviceUrl", jsonSchema: { type: "string" }, nullable: false },
    { handle: "timestamp", jsonSchema: { type: "string" }, nullable: true },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
