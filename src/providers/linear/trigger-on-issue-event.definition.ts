import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "linear.on_issue_event",
  provider: "linear",
  name: "on_issue_event",
  displayName: "Issue Event",
  definitionVersion: 1,
  type: "integration",
  description:
    "Receives issue creation, updates and removal through a managed Linear webhook. Requires a workspace admin API key or OAuth admin permission.",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "teamId",
      jsonSchema: { type: "string", minLength: 1, maxLength: 256 },
      nullable: true,
      value: null,
      description: "Team UUID or key. Leave null only when allPublicTeams is true.",
    },
    {
      handle: "allPublicTeams",
      jsonSchema: { type: "boolean" },
      nullable: false,
      value: false,
      description: "Subscribe to every public team instead of one team.",
    },
    {
      handle: "actions",
      jsonSchema: {
        type: "array",
        items: { type: "string", enum: ["create", "update", "remove"] },
        minItems: 1,
        uniqueItems: true,
      },
      nullable: false,
      value: ["create", "update", "remove"],
      description: "Issue changes to deliver.",
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
