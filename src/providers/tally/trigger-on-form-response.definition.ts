import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  configInputs: [
    {
      handle: "formId",
      jsonSchema: { ...s.string({ minLength: 1, maxLength: 128 }), title: "Form" },
      nullable: false,
      description: "Choose a form accessible to this Connection.",
    },
  ],
  definitionVersion: 2,
  description: "Receives new Tally form submissions through a signed, automatically managed webhook.",
  displayName: "Form Response",
  endpoint: {
    body: { allowArray: false, allowEmpty: false, formats: ["json"] },
    methods: ["POST"],
    successStatus: 200,
  },
  key: "tally.on_form_response",
  name: "on_form_response",
  outputs: [
    {
      handle: "response",
      nullable: false,
      jsonSchema: {
        type: "object",
        properties: {
          eventId: s.string(),
          createdAt: s.string(),
          formId: s.string(),
          submissionId: s.string(),
          responseId: s.string(),
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: s.string(),
                type: s.string(),
                label: { type: ["string", "null"] },
                value: {},
                options: { type: "array", items: { type: "object" } },
              },
              required: ["key", "type", "label", "value"],
            },
          },
        },
        required: ["eventId", "createdAt", "formId", "submissionId", "responseId", "fields"],
      },
    },
  ],
  provider: "tally",
  type: "integration",
};
