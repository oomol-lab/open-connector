import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const additionalSnapshot0: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "feishu_app_bot.on_event",
  provider: "feishu_app_bot",
  name: "on_event",
  displayName: "Application Event",
  description: "Receives selected Feishu application events through a shared event source.",
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
      jsonSchema: { ...s.string({ pattern: "^source_[0-9a-f]{32}$" }), title: "Event source" },
      nullable: false,
    },
    {
      handle: "eventTypes",
      jsonSchema: {
        ...s.array(s.string({ pattern: "^[a-z][a-z0-9_.]{0,127}$" }), {
          minItems: 1,
          maxItems: 200,
          uniqueItems: true,
        }),
        title: "Event types",
      },
      nullable: false,
    },
    {
      handle: "chatIds",
      jsonSchema: {
        ...s.array(s.string({ minLength: 1, maxLength: 256 }), { maxItems: 100, uniqueItems: true }),
        title: "Chat IDs",
      },
      nullable: true,
      description: "Leave empty to receive events from all chats available to the source.",
    },
    {
      handle: "resource",
      jsonSchema: {
        ...s.object(
          {
            kind: s.stringEnum(["document", "calendar", "approval"]),
            id: s.string({ minLength: 1, maxLength: 256 }),
            documentType: s.stringEnum(["doc", "docx", "sheet", "bitable", "file", "folder"]),
          },
          { additionalProperties: false, required: ["kind", "id"] },
        ),
        title: "Resource subscription",
      },
      nullable: true,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "appId", jsonSchema: s.string(), nullable: false },
    { handle: "tenantKey", jsonSchema: s.string(), nullable: false },
    { handle: "occurredAt", jsonSchema: s.string(), nullable: true },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
