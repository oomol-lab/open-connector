import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "pandadoc.on_document_event",
  provider: "pandadoc",
  name: "on_document_event",
  displayName: "Document Status Changed",
  description:
    "Receives document status changes in the connected workspace, optionally only when the entire document is completed.",
  definitionVersion: 2,
  type: "integration",
  endpoint: { methods: ["POST"], body: { formats: ["json"], allowArray: true, allowEmpty: false }, successStatus: 200 },
  configInputs: [
    {
      handle: "completedOnly",
      jsonSchema: { type: "boolean", title: "Completed documents only" },
      nullable: false,
      value: true,
    },
  ],
  outputs: [
    {
      handle: "events",
      nullable: false,
      jsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: { event: s.string(), data: { type: "object" } },
          required: ["event", "data"],
        },
      },
    },
  ],
};
