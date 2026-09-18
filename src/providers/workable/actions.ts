import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "workable";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const timestampFilter = (description: string) => s.nonEmptyString(description);
const limitSchema = s.integer("The number of records to retrieve per page. Workable allows up to 100.", {
  minimum: 1,
  maximum: 100,
});
const pagingSchema = s.object(
  "The pagination object returned by Workable.",
  {
    next: s.nullableString("The URL for the next page when Workable returns one."),
  },
  { optional: ["next"] },
);
const rawObjectSchema = s.looseObject("The raw object returned by Workable.");
const jobSchema = s.looseRequiredObject(
  "A Workable job object.",
  {
    id: s.string("The Workable job identifier."),
    title: s.string("The short title of the job."),
    shortcode: s.string("The system-generated job code."),
    state: s.string("The current job state, such as draft, published, closed, or archived."),
    raw: rawObjectSchema,
  },
  { optional: ["id", "title", "shortcode", "state"] },
);
const candidateSchema = s.looseRequiredObject(
  "A Workable candidate object.",
  {
    id: s.string("The Workable candidate identifier."),
    name: s.string("The candidate full name."),
    firstname: s.string("The candidate first name."),
    lastname: s.string("The candidate last name."),
    headline: s.string("The candidate headline."),
    email: s.string("The candidate email address."),
    stage: s.string("The candidate stage name or slug."),
    profile_url: s.string("The URL for the candidate profile in Workable."),
    raw: rawObjectSchema,
  },
  {
    optional: ["id", "name", "firstname", "lastname", "headline", "email", "stage", "profile_url"],
  },
);

export const workableActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List jobs from a Workable account with optional state and timestamp filters.",
    inputSchema: s.actionInput(
      {
        state: s.stringEnum("The current job state to filter by.", ["draft", "published", "closed", "archived"]),
        limit: limitSchema,
        since_id: nonEmptyString("Return jobs with an ID greater than or equal to this value."),
        max_id: nonEmptyString("Return jobs with an ID less than or equal to this value."),
        created_after: timestampFilter("Return jobs created after this ISO 8601 or Unix timestamp."),
        updated_after: timestampFilter("Return jobs updated after this ISO 8601 or Unix timestamp."),
        include_fields: s.array(
          "Additional job fields to include in each result.",
          s.stringEnum("One additional field such as description, full_description, requirements, or benefits.", [
            "description",
            "full_description",
            "requirements",
            "benefits",
          ]),
          { minItems: 1 },
        ),
      },
      [],
      "The input payload for listing Workable jobs.",
    ),
    outputSchema: s.actionOutput(
      {
        jobs: s.array("The jobs returned by Workable.", jobSchema),
        paging: pagingSchema,
      },
      "The Workable jobs list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Get full details for a Workable job by shortcode.",
    inputSchema: s.actionInput(
      {
        shortcode: nonEmptyString("The Workable system-generated job shortcode."),
      },
      ["shortcode"],
      "The input payload for retrieving a Workable job.",
    ),
    outputSchema: s.actionOutput(
      {
        job: jobSchema,
      },
      "The Workable job response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_candidates",
    operationType: "read",
    description: "List candidates from a Workable account with optional job, stage, and timestamp filters.",
    inputSchema: s.actionInput(
      {
        email: nonEmptyString("The candidate email address to filter by."),
        shortcode: nonEmptyString("The Workable system-generated job shortcode to filter by."),
        stage: nonEmptyString("The Workable stage slug to filter by."),
        limit: limitSchema,
        since_id: nonEmptyString("Return candidates with an ID greater than or equal to this value."),
        max_id: nonEmptyString("Return candidates with an ID less than or equal to this value."),
        created_after: timestampFilter("Return candidates created after this ISO 8601 or Unix timestamp."),
        updated_after: timestampFilter("Return candidates updated after this ISO 8601 or Unix timestamp."),
      },
      [],
      "The input payload for listing Workable candidates.",
    ),
    outputSchema: s.actionOutput(
      {
        candidates: s.array("The candidates returned by Workable.", candidateSchema),
        paging: pagingSchema,
      },
      "The Workable candidates list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_candidate",
    operationType: "read",
    description: "Get full details for a Workable candidate by candidate ID.",
    inputSchema: s.actionInput(
      {
        id: nonEmptyString("The Workable candidate identifier."),
      },
      ["id"],
      "The input payload for retrieving a Workable candidate.",
    ),
    outputSchema: s.actionOutput(
      {
        candidate: candidateSchema,
      },
      "The Workable candidate response.",
    ),
  }),
];
