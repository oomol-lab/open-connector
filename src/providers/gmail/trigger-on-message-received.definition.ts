import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const defaultPageSize: number = 25;
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
      handle: "includeDrafts",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
      description: "Also trigger on draft messages.",
    },
    {
      handle: "includeSpamAndTrash",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
      description: "Also trigger on messages in SPAM and TRASH.",
    },
    {
      handle: "labelNamesOrIds",
      jsonSchema: s.array(s.string({ minLength: 1 })),
      nullable: false,
      description: "Only trigger on messages carrying all of these labels, referenced by name or ID.",
      value: [],
    },
    {
      handle: "maxMessagesPerPoll",
      jsonSchema: s.integer({ maximum: 100, minimum: 1 }),
      nullable: false,
      value: defaultPageSize,
    },
    {
      handle: "readStatus",
      jsonSchema: s.stringEnum(["Read", "Unread", "All"]),
      nullable: false,
      value: "All",
    },
    {
      handle: "search",
      jsonSchema: s.string(),
      nullable: false,
      description: "Gmail search-syntax query the message must match.",
      value: "",
    },
    {
      handle: "sender",
      jsonSchema: s.string(),
      nullable: false,
      description: "Only trigger on messages whose sender matches this address or name.",
      value: "",
    },
  ],
  definitionVersion: 2,
  description: "Polls the Gmail mailbox and triggers when a new message is received.",
  displayName: "New Message Received",
  key: "gmail.on_message_received",
  name: "on_message_received",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "gmail",
  type: "poll",
};
