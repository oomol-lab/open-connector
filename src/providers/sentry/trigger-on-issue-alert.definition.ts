import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "sentry.on_issue_alert",
  provider: "sentry",
  name: "on_issue_alert",
  displayName: "Issue Alert",
  description: "Receives Issue Alert Rule notifications from a verified Sentry Custom Integration installation.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "projectIds",
      jsonSchema: {
        type: "array",
        items: { type: "string", pattern: "^[0-9]+$" },
        uniqueItems: true,
        title: "Project IDs",
      },
      nullable: true,
    },
    {
      handle: "ruleNames",
      jsonSchema: {
        type: "array",
        items: { type: "string", minLength: 1 },
        uniqueItems: true,
        title: "Alert rule names",
      },
      nullable: true,
    },
    {
      handle: "sourceId",
      jsonSchema: { type: "string", pattern: "^source_[0-9a-f]{32}$", title: "Event source" },
      nullable: false,
    },
    {
      handle: "eventTypes",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          enum: ["issue.alert"],
        },
        minItems: 1,
        maxItems: 1,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["issue.alert"],
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "organizationId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "issueId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
