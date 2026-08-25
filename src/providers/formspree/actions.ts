import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formspree";

const rawObjectSchema = s.looseObject("The raw Formspree API object for advanced fields.");

const pageInfoSchema = s.object("Pagination metadata returned by Formspree when available.", {
  count: s.nullableInteger("The total number of matching submissions when returned."),
  limit: s.nullableInteger("The requested page size when returned."),
  offset: s.nullableInteger("The requested result offset when returned."),
});

const submissionDataSchema = s.looseObject("The submitted form fields exactly as Formspree returned them.");

const submissionSchema = s.looseRequiredObject(
  "A Formspree submission.",
  {
    email: s.nullableString("The submitter email address when Formspree extracted one."),
    name: s.nullableString("The submitter name when Formspree extracted one."),
    message: s.nullableString("The submitter message when Formspree extracted one."),
    status: s.nullableString("The Formspree submission status when returned."),
    submitted_at: s.nullableString("The datetime when Formspree received the submission."),
    data: submissionDataSchema,
    raw: rawObjectSchema,
  },
  {
    optional: ["email", "name", "message", "status", "submitted_at", "data"],
  },
);

export const formspreeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_submissions",
    description: "List submissions for a Formspree form with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination controls for listing Formspree submissions.",
      {
        form_id: s.nonEmptyString(
          "The Formspree form hashid. When omitted, the hashid saved during connection is used.",
        ),
        limit: s.integer("The maximum number of submissions to return.", { minimum: 1, maximum: 100 }),
        offset: s.integer("The pagination offset to return.", { minimum: 0 }),
        since: s.dateTime("Only return submissions received after this datetime."),
        order: s.stringEnum("The sort order for returned submissions.", ["asc", "desc"]),
        spam: s.boolean("Whether to return spam or non-spam submissions."),
      },
      { optional: ["form_id", "limit", "offset", "since", "order", "spam"] },
    ),
    outputSchema: s.object("A Formspree submission list response.", {
      fields: s.array("The form field names returned by Formspree.", s.string("A form field name.")),
      submissions: s.array("The submissions returned for this page.", submissionSchema),
      page: pageInfoSchema,
      raw: rawObjectSchema,
    }),
  }),
];
