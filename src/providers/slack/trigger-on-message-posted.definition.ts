import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "channelId",
      jsonSchema: {
        type: "string",
        pattern: "^[CDG][A-Z0-9]{2,31}$",
      },
      nullable: false,
      description: "Slack conversation ID to watch, e.g. C0122KQ70S7E.",
    },
    {
      handle: "fromUserIds",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          pattern: "^[UW][A-Z0-9]{2,31}$",
        },
      },
      nullable: false,
      value: [],
      description: "Only trigger on messages written by these Slack user IDs. Empty means any author.",
    },
    {
      handle: "ignoreUserIds",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          pattern: "^[UW][A-Z0-9]{2,31}$",
        },
      },
      nullable: false,
      value: [],
      description: "Never trigger on messages written by these Slack user IDs.",
    },
    {
      handle: "textContains",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
      description: "Only trigger when message text contains this string, case-insensitively.",
    },
    {
      group: "Advanced settings",
      collapsed: true,
    },
    {
      handle: "includeBotMessages",
      jsonSchema: {
        type: "boolean",
      },
      nullable: false,
      value: false,
      description: "Also trigger on messages posted by bots and apps.",
    },
    {
      handle: "includeSystemMessages",
      jsonSchema: {
        type: "boolean",
      },
      nullable: false,
      value: false,
      description: "Also trigger on Slack system notices.",
    },
    {
      handle: "maxMessagesPerPoll",
      jsonSchema: {
        type: "integer",
        minimum: 1,
        maximum: 100,
      },
      nullable: false,
      value: 15,
      description: "Maximum number of messages processed per poll.",
    },
  ],
  definitionVersion: 3,
  description: "Polls one Slack conversation and triggers when a new message is posted to it.",
  displayName: "New Channel Message",
  key: "slack.on_message_posted",
  name: "on_message_posted",
  outputs: [
    {
      handle: "event",
      jsonSchema: s.object(
        {
          botId: { type: ["string", "null"] },
          channelId: s.string(),
          files: s.array(
            s.object(
              { id: s.string(), mimetype: s.string(), name: s.string() },
              { additionalProperties: false, required: ["id", "name", "mimetype"] },
            ),
          ),
          messageTs: s.string(),
          subtype: { type: ["string", "null"] },
          text: s.string(),
          threadTs: { type: ["string", "null"] },
          userId: { type: ["string", "null"] },
        },
        {
          additionalProperties: false,
          required: ["channelId", "messageTs", "threadTs", "userId", "botId", "subtype", "text", "files"],
        },
      ),
      nullable: false,
    },
  ],
  provider: "slack",
  type: "poll",
};
