import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const events = [
  "repo:push",
  "repo:fork",
  "repo:updated",
  "repo:commit_comment_created",
  "repo:commit_status_created",
  "repo:commit_status_updated",
  "issue:created",
  "issue:updated",
  "issue:comment_created",
  "pullrequest:created",
  "pullrequest:updated",
  "pullrequest:approved",
  "pullrequest:unapproved",
  "pullrequest:changes_request_created",
  "pullrequest:changes_request_removed",
  "pullrequest:fulfilled",
  "pullrequest:rejected",
  "pullrequest:comment_created",
  "pullrequest:comment_updated",
  "pullrequest:comment_deleted",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "bitbucket.on_repo_event",
  provider: "bitbucket",
  name: "on_repo_event",
  displayName: "Repository Event",
  description: "Triggers when selected Bitbucket Cloud webhook events occur in a repository.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    { handle: "workspace", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    { handle: "repoSlug", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(events), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "hookUuid", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
