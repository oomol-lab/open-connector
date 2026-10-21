import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "jira.on_issue_event",
  provider: "jira",
  name: "on_issue_event",
  displayName: "Issue or Comment Event",
  description:
    "Receives Jira Cloud issue creation, issue updates and new comments through a shared project webhook with automatic renewal.",
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
        items: {
          type: "string",
          enum: ["jira:issue_created", "jira:issue_updated", "comment_created"],
        },
        minItems: 1,
        maxItems: 3,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: ["jira:issue_created", "jira:issue_updated", "comment_created"],
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string" }, nullable: false },
    { handle: "deliveryId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "cloudId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "issueId", jsonSchema: { type: "string" }, nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
