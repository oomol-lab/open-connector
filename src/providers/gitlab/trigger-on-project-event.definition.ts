import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const events: readonly string[] = [
  "push",
  "tag_push",
  "issues",
  "confidential_issues",
  "note",
  "confidential_note",
  "merge_requests",
  "job",
  "pipeline",
  "wiki_page",
  "deployment",
  "feature_flag",
  "releases",
  "milestone",
  "emoji",
  "resource_access_token",
  "resource_deploy_token",
] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  configInputs: [
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(events), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
    { handle: "insecureSsl", jsonSchema: s.boolean(), nullable: false, value: false },
    {
      handle: "project",
      jsonSchema: s.string({
        maxLength: 255,
        minLength: 1,
        pattern:
          "^(?:[0-9]+|(?!\\.{1,2}(?:/|$))[A-Za-z0-9_.][A-Za-z0-9_.-]*(?:/(?!\\.{1,2}(?:/|$))[A-Za-z0-9_.][A-Za-z0-9_.-]*)*)$",
      }),
      nullable: false,
    },
    {
      handle: "pushBranchFilter",
      jsonSchema: s.string({ maxLength: 255 }),
      nullable: false,
      value: "",
    },
  ],
  definitionVersion: 2,
  description: "Triggers when selected GitLab webhook events occur in a project.",
  displayName: "Project Event",
  endpoint: {
    body: { allowArray: false, allowEmpty: false, formats: ["json"] },
    methods: ["POST"],
    successStatus: 202,
  },
  key: "gitlab.on_project_event",
  name: "on_project_event",
  outputs: [
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "gitlabEvent", jsonSchema: s.string(), nullable: false },
  ],
  provider: "gitlab",
  type: "integration",
};
