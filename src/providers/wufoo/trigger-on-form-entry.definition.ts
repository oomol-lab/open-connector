import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "wufoo.on_form_entry",
  provider: "wufoo",
  name: "on_form_entry",
  displayName: "Form Entry",
  description: "Triggers when a new entry is submitted to a Wufoo form.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["form", "json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [{ handle: "formHash", jsonSchema: s.string({ minLength: 1 }), nullable: false }],
  outputs: [
    { handle: "entryId", jsonSchema: s.string(), nullable: false },
    { handle: "formHash", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
