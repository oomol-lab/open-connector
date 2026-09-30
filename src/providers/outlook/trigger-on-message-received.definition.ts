import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const defaultFolder: string = "inbox";
const defaultPageSize: number = 25;
const eventSchema: JsonSchema = s.object(
  {
    bodyPreview: s.string(),
    categories: s.array(s.string()),
    conversationId: s.string(),
    from: s.string(),
    fromName: s.string(),
    hasAttachments: s.boolean(),
    importance: s.string(),
    internetMessageId: s.string(),
    isDraft: s.boolean(),
    isRead: s.boolean(),
    messageId: s.string(),
    parentFolderId: s.string(),
    receivedDateTime: s.string(),
    subject: s.string(),
    to: s.array(s.string()),
    webLink: s.string(),
  },
  {
    additionalProperties: false,
    required: [
      "messageId",
      "internetMessageId",
      "conversationId",
      "subject",
      "bodyPreview",
      "from",
      "fromName",
      "to",
      "receivedDateTime",
      "hasAttachments",
      "isRead",
      "isDraft",
      "importance",
      "categories",
      "parentFolderId",
      "webLink",
    ],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "folder",
      jsonSchema: s.string({ pattern: "^[A-Za-z0-9_=-]*$" }),
      nullable: false,
      value: defaultFolder,
      description: "A well-known mail folder name, folder ID, or an empty string for the whole mailbox.",
    },
    { handle: "includeDrafts", jsonSchema: s.boolean(), nullable: false, value: false },
    {
      handle: "maxMessagesPerPoll",
      jsonSchema: s.integer({ maximum: 100, minimum: 1 }),
      nullable: false,
      value: defaultPageSize,
    },
    {
      handle: "readStatus",
      jsonSchema: s.stringEnum(["All", "Read", "Unread"]),
      nullable: false,
      value: "All",
    },
    {
      handle: "senderAddress",
      jsonSchema: s.string(),
      nullable: false,
      value: "",
      description: "Exact sender address, or empty for any sender.",
    },
    {
      handle: "subjectContains",
      jsonSchema: s.string(),
      nullable: false,
      value: "",
      description: "Case-insensitive subject text.",
    },
    {
      handle: "withAttachmentsOnly",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
    },
  ],
  definitionVersion: 2,
  description: "Polls a Microsoft Outlook mail folder and triggers when a new message arrives.",
  displayName: "New Message Received",
  key: "outlook.on_message_received",
  name: "on_message_received",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "outlook",
  type: "poll",
};
