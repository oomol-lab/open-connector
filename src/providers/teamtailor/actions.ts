import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "teamtailor";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const stackSchema = s.stringEnum("The Teamtailor stack that stores the account data.", ["eu", "na"]);
const pageSizeSchema = s.integer("The number of resources to return. Teamtailor allows at most 30.", {
  minimum: 1,
  maximum: 30,
});
const includeSchema = s.array(
  "JSON:API relationship names to include in the Teamtailor response.",
  nonEmptyString("A Teamtailor relationship name."),
);
const resourceSchema = s.looseObject("A Teamtailor JSON:API resource object.");
const includedSchema = s.array("Included JSON:API resources returned by Teamtailor.", resourceSchema);
const linksSchema = s.nullable(s.looseObject("Teamtailor JSON:API pagination links."));
const metaSchema = s.nullable(s.looseObject("Teamtailor JSON:API response metadata."));

const paginationInputProperties = {
  stack: stackSchema,
  pageSize: pageSizeSchema,
  pageAfter: nonEmptyString("The cursor for the next page returned by Teamtailor links."),
  pageBefore: nonEmptyString("The cursor for the previous page returned by Teamtailor links."),
  include: includeSchema,
};

const listOutputSchema = (description: string, resourceDescription: string) =>
  s.actionOutput(
    {
      data: s.array(resourceDescription, resourceSchema),
      included: includedSchema,
      links: linksSchema,
      meta: metaSchema,
      raw: s.looseObject("The raw Teamtailor JSON:API response."),
    },
    description,
  );

const resourceOutputSchema = s.actionOutput(
  {
    data: resourceSchema,
    included: includedSchema,
    links: linksSchema,
    meta: metaSchema,
    raw: s.looseObject("The raw Teamtailor JSON:API response."),
  },
  "A Teamtailor JSON:API single-resource response.",
);

export const teamtailorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    description:
      "List Teamtailor jobs with optional department, location, status, include, and cursor pagination parameters.",
    inputSchema: s.actionInput({
      ...paginationInputProperties,
      departmentId: nonEmptyString("Only return jobs for this Teamtailor department ID."),
      locationId: nonEmptyString("Only return jobs for this Teamtailor location ID."),
      status: nonEmptyString("Only return jobs matching this Teamtailor status."),
      sort: nonEmptyString("Teamtailor sort expression, such as id or -created-at."),
    }),
    outputSchema: listOutputSchema("Teamtailor jobs list response.", "Teamtailor job resource objects."),
  }),
  defineProviderAction(service, {
    name: "retrieve_job",
    description: "Retrieve one Teamtailor job by ID with optional included relationships.",
    inputSchema: s.actionInput(
      {
        stack: stackSchema,
        jobId: nonEmptyString("The Teamtailor job ID to retrieve."),
        include: includeSchema,
      },
      ["jobId"],
    ),
    outputSchema: resourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_departments",
    description: "List Teamtailor departments with optional include and cursor pagination.",
    inputSchema: s.actionInput({
      ...paginationInputProperties,
      sort: nonEmptyString("Teamtailor sort expression, such as id or name."),
    }),
    outputSchema: listOutputSchema("Teamtailor departments list response.", "Teamtailor department resource objects."),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List Teamtailor locations with optional include and cursor pagination.",
    inputSchema: s.actionInput({
      ...paginationInputProperties,
      sort: nonEmptyString("Teamtailor sort expression, such as id or name."),
    }),
    outputSchema: listOutputSchema("Teamtailor locations list response.", "Teamtailor location resource objects."),
  }),
];
