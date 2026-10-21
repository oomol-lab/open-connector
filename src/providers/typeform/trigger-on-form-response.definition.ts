import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "typeform.on_form_response",
  provider: "typeform",
  name: "on_form_response",
  displayName: "Completed Form Response",
  description: "Receives complete Typeform submissions through an automatically managed signed webhook.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "formId",
      jsonSchema: { type: "string", minLength: 1, maxLength: 128, title: "Form ID" },
      nullable: false,
    },
  ],
  outputs: [
    {
      handle: "response",
      nullable: false,
      jsonSchema: {
        type: "object",
        properties: {
          eventId: s.string(),
          form_id: s.string(),
          token: s.string(),
          submitted_at: s.string(),
          answers: { type: "array", items: { type: "object" } },
          definition: { type: "object" },
        },
        required: ["eventId", "form_id", "token", "submitted_at", "answers"],
      },
    },
  ],
};
