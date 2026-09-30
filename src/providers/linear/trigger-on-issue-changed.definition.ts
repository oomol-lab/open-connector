import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const uuidPattern: string = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const issueSchema: JsonSchema = s.object(
  {
    id: s.string(),
    identifier: s.string(),
    title: s.string(),
    url: s.string(),
    teamId: s.string(),
    createdAt: s.string(),
    updatedAt: s.string(),
    state: s.object(
      { id: s.string(), name: s.string(), type: s.string() },
      { additionalProperties: false, required: ["id", "name", "type"] },
    ),
  },
  {
    additionalProperties: false,
    required: ["id", "identifier", "title", "url", "teamId", "createdAt", "updatedAt", "state"],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "teamId",
      jsonSchema: { ...s.string({ pattern: uuidPattern }), title: "Team ID" },
      nullable: false,
      description: "Linear Team UUID. Use Copy model UUID in Linear to find it.",
    },
    {
      handle: "stateIds",
      jsonSchema: {
        ...s.array(s.string({ pattern: uuidPattern }), { uniqueItems: true, maxItems: 50 }),
        title: "Issue statuses",
      },
      nullable: false,
      value: [],
      description:
        "Choose statuses from the selected Team. Empty means all statuses. Matches the current status, not every transition into it.",
    },
  ],
  definitionVersion: 2,
  description:
    "Watches new and updated issues in a Linear team with periodic checks. Starts from now without running existing issues. Reports observed current states, not deletions or every intermediate status change.",
  displayName: "Issue Created or Updated",
  key: "linear.on_issue_changed",
  name: "on_issue_changed",
  outputs: [{ handle: "events", jsonSchema: s.array(issueSchema), nullable: false }],
  provider: "linear",
  type: "poll",
};
