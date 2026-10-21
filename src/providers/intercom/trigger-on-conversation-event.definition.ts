import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { s } from "../../core/json-schema.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "intercom.on_conversation_event",
  provider: "intercom",
  name: "on_conversation_event",
  displayName: "Customer Conversation or Ticket",
  description:
    "Receives customer conversations, customer replies and new tickets from a verified Intercom application event source. Administrator replies are excluded.",
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
        items: { type: "string", enum: ["conversation.user.created", "conversation.user.replied", "ticket.created"] },
        minItems: 1,
        maxItems: 3,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["conversation.user.created", "conversation.user.replied", "ticket.created"],
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "workspaceId", jsonSchema: s.string(), nullable: false },
    { handle: "objectId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: s.object({}, { additionalProperties: true }), nullable: false },
  ],
};
