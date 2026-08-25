import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zigpoll";

const idField = (resource: string): JsonSchema => s.nonEmptyString(`The Zigpoll ${resource} ID.`);
const rawObjectSchema = s.unknownObject("Raw Zigpoll object fields returned by the API.");
const rawObjectListSchema = (description: string): JsonSchema => s.array(description, rawObjectSchema);
const emptyInputSchema = s.object("No input is required for this Zigpoll action.", {});
const paginationFields = {
  startCursor: s.nonEmptyString("Cursor returned by Zigpoll for the next page."),
  limit: s.integer("Maximum number of objects to return. Zigpoll documents a maximum of 5000.", {
    minimum: 1,
    maximum: 5000,
  }),
};
const responseDateFields = {
  createdAfter: s.nonEmptyString("JavaScript timestamp string for returning objects created on or after this time."),
  createdBefore: s.nonEmptyString("JavaScript timestamp string for returning objects created on or before this time."),
};

function oneFilterInput(
  description: string,
  extraFields: Record<string, JsonSchema> = {},
  extraOptionalFields: string[] = [],
): JsonSchema {
  const baseOptionalFields = ["startCursor", "limit", ...extraOptionalFields];
  const variants = [
    { field: "accountId", schema: idField("account") },
    { field: "pollId", schema: idField("poll") },
    { field: "slideId", schema: idField("slide") },
  ].map(({ field, schema }) =>
    s.object(
      `${description} Filter by ${field}.`,
      {
        [field]: schema,
        ...paginationFields,
        ...extraFields,
      },
      { optional: baseOptionalFields },
    ),
  );

  return s.oneOf(variants, {
    description: `${description} Provide exactly one of accountId, pollId, or slideId.`,
  });
}

const userSchema = s.looseRequiredObject("The authenticated Zigpoll user.", {
  _id: s.string("The Zigpoll user ID."),
  email: s.email("The Zigpoll user's email address."),
  name: s.string("The Zigpoll user's display name."),
  accounts: s.array("Account IDs associated with the user.", s.string("A Zigpoll account ID.")),
  createdAt: s.dateTime("Timestamp when the user was created."),
  lastModified: s.dateTime("Timestamp when the user was last modified."),
});

const cursorPageSchema = s.looseRequiredObject("A Zigpoll cursor-paginated response.", {
  data: rawObjectListSchema("Objects returned by Zigpoll."),
  hasNextPage: s.boolean("Whether another page is available."),
  endCursor: s.string("Cursor for fetching the next page."),
});

const surveyLinkSchema = s.object("A generated Zigpoll survey link.", {
  url: s.url("The unique survey URL to distribute to a respondent."),
  activityId: s.string("The unique Zigpoll activity ID associated with the survey link."),
});

export const zigpollActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Fetch the authenticated Zigpoll user object.",
    inputSchema: emptyInputSchema,
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Zigpoll account objects available to the authenticated user.",
    inputSchema: emptyInputSchema,
    outputSchema: rawObjectListSchema("Zigpoll account objects returned by the API."),
  }),
  defineProviderAction(service, {
    name: "list_polls",
    description: "List Zigpoll polls for an account.",
    inputSchema: s.object("Input for listing Zigpoll polls.", {
      accountId: idField("account"),
    }),
    outputSchema: rawObjectListSchema("Zigpoll poll objects returned by the API."),
  }),
  defineProviderAction(service, {
    name: "get_poll",
    description: "Fetch a Zigpoll poll by ID.",
    inputSchema: s.object("Input for fetching a Zigpoll poll.", {
      pollId: idField("poll"),
    }),
    outputSchema: rawObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_slides",
    description: "List Zigpoll slides for a poll.",
    inputSchema: s.object("Input for listing Zigpoll slides.", {
      pollId: idField("poll"),
    }),
    outputSchema: rawObjectListSchema("Zigpoll slide objects returned by the API."),
  }),
  defineProviderAction(service, {
    name: "list_participants",
    description: "List Zigpoll participants by account, poll, or slide with cursor pagination.",
    inputSchema: oneFilterInput("Input for listing paginated Zigpoll participants by account, poll, or slide."),
    outputSchema: cursorPageSchema,
  }),
  defineProviderAction(service, {
    name: "list_responses",
    description: "List Zigpoll responses by account, poll, or slide with cursor pagination.",
    inputSchema: oneFilterInput(
      "Input for listing paginated Zigpoll responses by account, poll, or slide.",
      responseDateFields,
      ["createdAfter", "createdBefore"],
    ),
    outputSchema: cursorPageSchema,
  }),
  defineProviderAction(service, {
    name: "generate_survey_link",
    description: "Generate a unique trackable Zigpoll survey link for a poll.",
    inputSchema: s.object(
      "Input for generating a unique Zigpoll survey link.",
      {
        pollId: idField("poll"),
        metadata: s.record(
          "Optional key-value metadata to attach to the generated survey activity.",
          s.unknown("A metadata value accepted by Zigpoll."),
        ),
        expiresAt: s.dateTime("ISO 8601 datetime after which the survey link expires."),
      },
      { optional: ["metadata", "expiresAt"] },
    ),
    outputSchema: surveyLinkSchema,
  }),
];
