import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
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
      jsonSchema: {
        type: "string",
        pattern: "^[A-Za-z0-9_=-]*$",
      },
      nullable: false,
      value: "inbox",
      description: "A well-known mail folder name, folder ID, or an empty string for the whole mailbox.",
    },
    {
      handle: "readStatus",
      jsonSchema: {
        type: "string",
        enum: ["All", "Read", "Unread"],
      },
      nullable: false,
      value: "All",
    },
    {
      handle: "senderAddress",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
      description: "Exact sender address, or empty for any sender.",
    },
    {
      handle: "subjectContains",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
      description: "Case-insensitive subject text.",
    },
    {
      handle: "withAttachmentsOnly",
      jsonSchema: {
        type: "boolean",
      },
      nullable: false,
      value: false,
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
  definitionVersion: 2,
  description: "Polls a Microsoft Outlook mail folder and triggers when a new message arrives.",
  displayName: "New Message Received",
  key: "outlook.on_message_received",
  name: "on_message_received",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "outlook",
  type: "poll",
};
