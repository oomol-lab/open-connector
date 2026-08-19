import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fairing";

const sortSchema = s.stringEnum("The Fairing response ordering direction.", [
  "inserted_at_desc",
  "inserted_at_asc",
  "updated_at_desc",
  "updated_at_asc",
]);

const fairingResponseSchema = s.looseObject("A Fairing response object.", {
  id: s.nonEmptyString("The unique Fairing response ID."),
  email: s.nullableString("The customer email address associated with the response."),
  question: s.nullableString("The question text associated with the response."),
  question_id: s.nullableInteger("The Fairing question ID associated with the response."),
  question_type: s.nullableString("The Fairing question type associated with the response."),
  response: s.nullableString("The selected response text, or null for free-form responses."),
  other_response: s.nullableString("The free-form response text when the answer is other."),
  inserted_at: s.nullableString("The ISO 8601 timestamp when Fairing stored the response."),
  updated_at: s.nullableString("The ISO 8601 timestamp when Fairing last updated the response."),
  response_provided_at: s.nullableString("The ISO 8601 timestamp when the customer provided the response."),
});

export const fairingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_responses",
    description: "List paginated Fairing survey responses with optional time, cursor, and question filters.",
    inputSchema: s.object(
      "The query filters for listing Fairing responses. starting_after and ending_before are mutually exclusive.",
      {
        starting_after: s.nonEmptyString(
          "Response ID cursor used to fetch the page after this response in the active sort direction.",
        ),
        ending_before: s.nonEmptyString(
          "Response ID cursor used to fetch the page before this response in the active sort direction.",
        ),
        inserted_at_min: s.dateTime("Return responses inserted at or after this UTC timestamp."),
        inserted_at_max: s.dateTime("Return responses inserted at or before this UTC timestamp."),
        updated_at_min: s.dateTime("Return responses last updated at or after this UTC timestamp."),
        updated_at_max: s.dateTime("Return responses last updated at or before this UTC timestamp."),
        sort: sortSchema,
        limit: s.integer("The number of responses to fetch per request. Fairing allows up to 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
        question_id: s.positiveInteger("Only return responses for this Fairing question ID."),
      },
      {
        optional: [
          "starting_after",
          "ending_before",
          "inserted_at_min",
          "inserted_at_max",
          "updated_at_min",
          "updated_at_max",
          "sort",
          "limit",
          "question_id",
        ],
      },
    ),
    outputSchema: s.object("A paginated Fairing responses result.", {
      responses: s.array("The Fairing responses returned for this page.", fairingResponseSchema),
      next: s.nullableString("The full URL for the next page of Fairing responses."),
      prev: s.nullableString("The full URL for the previous page of Fairing responses."),
    }),
  }),
];
