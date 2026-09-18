import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "amilia";

const pageSchema = s.positiveInteger("The Amilia result page number to request.");
const perPageSchema = s.positiveInteger("The number of Amilia records to request per page.");
const programIdSchema = s.positiveInteger("The Amilia program identifier.");
const activityIdSchema = s.positiveInteger("The Amilia activity identifier.");
const programSchema = s.unknownObject("An Amilia program object using the fields returned by the organization API.");
const activitySchema = s.unknownObject("An Amilia activity object using the fields returned by the organization API.");
const pagingSchema = s.actionOutput(
  {
    totalCount: s.nullableInteger("The total number of available records when Amilia returns it.", { minimum: 0 }),
    next: s.nullableString("The URL for the next page when Amilia returns one."),
  },
  "Normalized Amilia v3 pagination metadata.",
);

export const amiliaActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_programs",
    operationType: "read",
    description:
      "List programs for the connected Amilia organization with visibility, archive, and pagination filters.",
    inputSchema: s.actionInput(
      {
        showHidden: s.boolean("Whether hidden programs should be included."),
        showArchived: s.boolean("Whether archived programs should be included."),
        page: pageSchema,
        perPage: perPageSchema,
      },
      [],
      "Filters and pagination for listing Amilia programs.",
    ),
    outputSchema: s.actionOutput(
      {
        programs: s.array("Programs returned by Amilia.", programSchema),
        paging: pagingSchema,
      },
      "The normalized Amilia program list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_program",
    operationType: "read",
    description: "Retrieve one program from the connected Amilia organization.",
    inputSchema: s.actionInput(
      {
        programId: programIdSchema,
      },
      ["programId"],
      "The Amilia program to retrieve.",
    ),
    outputSchema: s.actionOutput(
      {
        program: programSchema,
      },
      "The Amilia program response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_program_activities",
    operationType: "read",
    description:
      "List activities in one Amilia program with visibility, cancellation, occurrence, tax, and pagination options.",
    inputSchema: s.actionInput(
      {
        programId: programIdSchema,
        showHidden: s.boolean("Whether hidden activities should be included."),
        showCancelled: s.boolean("Whether cancelled activities should be included."),
        showOccurrences: s.boolean("Whether each activity should include its full occurrence list."),
        showTaxes: s.boolean("Whether activity tax details should be included."),
        page: pageSchema,
        perPage: perPageSchema,
      },
      ["programId"],
      "Program identifier, filters, and pagination for listing Amilia activities.",
    ),
    outputSchema: s.actionOutput(
      {
        activities: s.array("Activities returned by Amilia.", activitySchema),
        paging: pagingSchema,
      },
      "The normalized Amilia program activity list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_activity",
    operationType: "read",
    description: "Retrieve one activity from the connected Amilia organization.",
    inputSchema: s.actionInput(
      {
        activityId: activityIdSchema,
        showTaxes: s.boolean("Whether activity tax details should be included."),
      },
      ["activityId"],
      "The Amilia activity to retrieve.",
    ),
    outputSchema: s.actionOutput(
      {
        activity: activitySchema,
      },
      "The Amilia activity response.",
    ),
  }),
];
