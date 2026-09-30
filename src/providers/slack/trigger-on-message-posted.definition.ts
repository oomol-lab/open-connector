import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const defaultPageSize: number = 15;
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "channelId",
      jsonSchema: s.string({ pattern: "^[CDG][A-Z0-9]{2,31}$" }),
      nullable: false,
      description: "Slack conversation ID to watch, e.g. C0122KQ70S7E.",
    },
    {
      handle: "fromUserIds",
      jsonSchema: s.array(s.string({ pattern: "^[UW][A-Z0-9]{2,31}$" })),
      nullable: false,
      value: [],
      description: "Only trigger on messages written by these Slack user IDs. Empty means any author.",
    },
    {
      handle: "ignoreUserIds",
      jsonSchema: s.array(s.string({ pattern: "^[UW][A-Z0-9]{2,31}$" })),
      nullable: false,
      value: [],
      description: "Never trigger on messages written by these Slack user IDs.",
    },
    {
      handle: "includeBotMessages",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
      description: "Also trigger on messages posted by bots and apps.",
    },
    {
      handle: "includeSystemMessages",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
      description: "Also trigger on Slack system notices.",
    },
    {
      handle: "maxMessagesPerPoll",
      jsonSchema: s.integer({ maximum: 100, minimum: 1 }),
      nullable: false,
      value: defaultPageSize,
      description: "Maximum number of messages processed per poll.",
    },
    {
      handle: "textContains",
      jsonSchema: s.string(),
      nullable: false,
      value: "",
      description: "Only trigger when message text contains this string, case-insensitively.",
    },
  ],
  definitionVersion: 2,
  description: "Polls one Slack conversation and triggers when a new message is posted to it.",
  displayName: "New Channel Message",
  key: "slack.on_message_posted",
  name: "on_message_posted",
  outputs: [
    {
      handle: "events",
      jsonSchema: s.array(
        s.object(
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
      ),
      nullable: false,
    },
  ],
  provider: "slack",
  type: "poll",
};
