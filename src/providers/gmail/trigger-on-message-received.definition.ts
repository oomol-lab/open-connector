import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const eventSchema: JsonSchema = s.object(
  {
    historyId: { type: ["string", "null"] },
    labelIds: s.array(s.string()),
    messageId: s.string(),
    messageTimestamp: s.string(),
    sender: s.string(),
    subject: s.string(),
    threadId: s.string(),
    to: s.string(),
  },
  {
    additionalProperties: false,
    required: ["messageId", "threadId", "historyId", "labelIds", "subject", "sender", "to", "messageTimestamp"],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "labelNamesOrIds",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
        },
      },
      nullable: false,
      description: "Only trigger on messages carrying all of these labels, referenced by name or ID.",
      value: [],
    },
    {
      handle: "readStatus",
      jsonSchema: {
        type: "string",
        enum: ["Read", "Unread", "All"],
      },
      nullable: false,
      value: "All",
    },
    {
      handle: "search",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      description: "Gmail search-syntax query the message must match.",
      value: "",
    },
    {
      handle: "sender",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      description: "Only trigger on messages whose sender matches this address or name.",
      value: "",
    },
    {
      group: "Advanced settings",
      collapsed: true,
    },
    {
      handle: "includeDrafts",
      jsonSchema: {
        type: "boolean",
      },
      nullable: false,
      value: false,
      description: "Also trigger on draft messages.",
    },
    {
      handle: "includeSpamAndTrash",
      jsonSchema: {
        type: "boolean",
      },
      nullable: false,
      value: false,
      description: "Also trigger on messages in SPAM and TRASH.",
    },
    {
      handle: "maxMessagesPerPoll",
      jsonSchema: {
        type: "integer",
        minimum: 1,
        maximum: 100,
      },
      nullable: false,
      value: 25,
    },
  ],
  definitionVersion: 3,
  description: "Polls the Gmail mailbox and triggers when a new message is received.",
  displayName: "New Message Received",
  key: "gmail.on_message_received",
  name: "on_message_received",
  outputs: [{ handle: "event", jsonSchema: eventSchema, nullable: false }],
  provider: "gmail",
  type: "poll",
};
