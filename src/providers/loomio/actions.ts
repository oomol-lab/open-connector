import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "loomio";

const rawObjectSchema = s.looseObject("Raw Loomio API object.");
const pollOptionSchema = s.object(
  "One Loomio poll option returned by the poll detail endpoint.",
  {
    id: s.positiveInteger("Unique option identifier returned by Loomio."),
    name: s.nullableString("Display name of the poll option when Loomio returns it."),
    priority: s.nullableInteger("Display order priority of the poll option when Loomio returns it."),
    icon: s.nullableString("Icon identifier returned by Loomio for the poll option."),
    color: s.nullableString("Color value returned by Loomio for the poll option."),
    prompt: s.nullableString("Prompt text returned by Loomio for the poll option."),
    meaning: s.nullableString("Meaning text returned by Loomio for the poll option."),
    raw: rawObjectSchema,
  },
  {
    optional: ["name", "priority", "icon", "color", "prompt", "meaning", "raw"],
    additionalProperties: true,
  },
);

const pollBaseProperties = {
  id: s.positiveInteger("Unique poll identifier returned by Loomio."),
  key: s.nullableString("Poll key returned by Loomio when available."),
  title: s.nullableString("Poll title returned by Loomio when available."),
  pollType: s.nullableString("Poll type returned by Loomio when available."),
  groupId: s.nullableInteger("Group identifier attached to the poll when available."),
  authorId: s.nullableInteger("Author identifier attached to the poll when available."),
  discussionId: s.nullableInteger("Discussion identifier attached to the poll when available."),
  createdAt: s.nullableString("Poll creation timestamp returned by Loomio when available."),
  closingAt: s.nullableString("Poll closing timestamp returned by Loomio when available."),
  closedAt: s.nullableString("Poll closed timestamp returned by Loomio when available."),
  currentOutcome: s.nullable(rawObjectSchema),
  raw: rawObjectSchema,
};

const optionalPollBaseFields = [
  "key",
  "title",
  "pollType",
  "groupId",
  "authorId",
  "discussionId",
  "createdAt",
  "closingAt",
  "closedAt",
  "currentOutcome",
  "raw",
];

const pollSummarySchema = s.object("Summary of one Loomio poll returned by the list endpoint.", pollBaseProperties, {
  optional: optionalPollBaseFields,
  additionalProperties: true,
});

const pollDetailSchema = s.object(
  "Detailed Loomio poll payload returned by the show endpoint.",
  {
    ...pollBaseProperties,
    status: s.nullableString("Poll status returned by Loomio when available."),
    details: s.nullableString("Poll details body returned by Loomio when available."),
    options: s.array("Poll options returned by Loomio.", pollOptionSchema),
  },
  {
    optional: [...optionalPollBaseFields, "status", "details", "options"],
    additionalProperties: true,
  },
);

export const loomioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_polls",
    description: "List Loomio polls in one group with optional status filtering and offset pagination.",
    inputSchema: s.object(
      "Input parameters for listing Loomio polls in one group.",
      {
        groupId: s.positiveInteger("Group identifier to list polls from."),
        status: s.stringEnum("Poll status filter accepted by Loomio.", ["active", "closed", "all"]),
        limit: s.positiveInteger("Maximum number of polls to return.", { maximum: 200 }),
        offset: s.nonNegativeInteger("Zero-based offset for poll pagination."),
      },
      { optional: ["status", "limit", "offset"] },
    ),
    outputSchema: s.object("Loomio poll list response.", {
      polls: s.array("Polls returned by Loomio.", pollSummarySchema),
      total: s.nonNegativeInteger("Total number of polls matching the filter."),
      rawMeta: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_poll",
    description: "Get one Loomio poll by numeric ID or poll key.",
    inputSchema: s.object("Input parameters for getting one Loomio poll.", {
      pollIdOrKey: s.nonEmptyString("Numeric poll ID or poll key to retrieve."),
    }),
    outputSchema: s.object("Single Loomio poll response.", {
      poll: pollDetailSchema,
    }),
  }),
];
