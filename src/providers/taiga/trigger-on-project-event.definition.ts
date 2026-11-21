import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const entityTypes = ["epic", "userstory", "task", "issue", "wikipage", "milestone"] as const;
const actions = ["create", "change", "delete"] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "taiga.on_project_event",
  provider: "taiga",
  name: "on_project_event",
  displayName: "Project Event",
  description: "Triggers when selected Taiga project webhook events occur.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    { handle: "projectId", jsonSchema: s.integer({ minimum: 1 }), nullable: false },
    {
      handle: "types",
      jsonSchema: s.array(s.stringEnum(entityTypes), { uniqueItems: true }),
      nullable: true,
    },
    {
      handle: "actions",
      jsonSchema: s.array(s.stringEnum(actions), { uniqueItems: true }),
      nullable: true,
    },
  ],
  outputs: [
    { handle: "entityType", jsonSchema: s.string(), nullable: false },
    { handle: "action", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
