import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { snapshot as githubRepoEventSnapshot } from "./trigger-on-repo-event.definition.ts";
const pullRequestSchema: JsonSchema = s.object(
  {
    id: s.integer(),
    number: s.integer(),
    title: s.string(),
    url: s.string(),
    state: s.stringEnum(["open", "closed"]),
    draft: s.boolean(),
    merged: s.boolean(),
    updatedAt: s.string(),
    headSha: s.string(),
    baseSha: s.string(),
  },
  {
    additionalProperties: false,
    required: ["id", "number", "title", "url", "state", "draft", "merged", "updatedAt", "headSha", "baseSha"],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  configInputs: [
    {
      handle: "owner",
      jsonSchema: s.string({ pattern: "^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$" }),
      nullable: false,
    },
    {
      handle: "repo",
      jsonSchema: s.string({ pattern: "^(?!\\.{1,2}$)[a-zA-Z0-9._-]{1,100}$" }),
      nullable: false,
    },
    {
      handle: "number",
      jsonSchema: s.integer({ minimum: 1 }),
      nullable: false,
      description: "Number of the pull request to watch.",
    },
  ],
  definitionVersion: 2,
  description:
    "Watches one pull request using notifications and periodic checks. Starts from its current state; reports observed changes, not every intermediate transition or review event.",
  displayName: "Watch Pull Request",
  endpoint: githubRepoEventSnapshot.endpoint,
  key: "github.watch_pull_request",
  name: "watch_pull_request",
  provider: "github",
  type: "integration",
  outputs: [
    { handle: "pullRequest", jsonSchema: pullRequestSchema, nullable: false },
    { handle: "version", jsonSchema: s.string(), nullable: false },
  ],
};
