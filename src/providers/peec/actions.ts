import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "peec";

const paginationProperties = {
  limit: s.integer("Maximum number of rows to return.", { minimum: 1, maximum: 10_000 }),
  offset: s.integer("Number of rows to skip before returning results.", {
    minimum: 0,
    maximum: 500_000,
  }),
};

const projectIdSchema = s.nonEmptyString(
  "Peec project ID. Required by upstream when the connection uses a company-scoped API key.",
);

const projectSchema = s.looseObject("A Peec project available to the connected API key.", {
  id: s.nonEmptyString("The Peec project ID."),
  name: s.nonEmptyString("The project display name."),
  status: s.string("The current project status."),
  countryCode: s.string("The project's ISO 3166-1 alpha-2 country code."),
  languageCode: s.string("The project's ISO 639-1 prompt language code."),
  externalId: s.string("The caller-defined external project ID."),
  createdAt: s.date("The project creation date."),
});

const listProjectsOutputSchema = s.object("The projects visible to the connected API key.", {
  projects: s.array("The returned Peec projects.", projectSchema),
});

const reportDimensionSchema = s.stringEnum("A dimension used to split report rows.", [
  "prompt_id",
  "model_channel_id",
  "tag_id",
  "topic_id",
  "date",
  "week",
  "month",
  "country_code",
  "chat_id",
]);

const reportSetPredicateSchema = s.looseRequiredObject(
  "A Peec report predicate that compares a field with a set of values.",
  {
    field: s.nonEmptyString("The Peec field to filter."),
    operator: s.nonEmptyString("The comparison operator accepted for the selected field."),
    values: s.array("Values for a set predicate.", s.unknown("A predicate value."), {
      minItems: 1,
    }),
  },
);

const reportScalarPredicateSchema = s.looseRequiredObject(
  "A Peec report predicate that compares a metric with one scalar value.",
  {
    field: s.nonEmptyString("The Peec metric field to filter."),
    operator: s.nonEmptyString("The comparison operator accepted for the selected metric."),
    value: s.number("The scalar metric value to compare."),
  },
);

const reportHavingPredicateSchema = s.oneOf([reportSetPredicateSchema, reportScalarPredicateSchema], {
  description: "A documented Peec having predicate.",
});

const reportOrderSchema = s.object(
  "A Peec report sort instruction.",
  {
    field: s.nonEmptyString("The report field to sort by."),
    direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
  },
  { optional: ["direction"] },
);

const reportInputProperties = {
  projectId: projectIdSchema,
  ...paginationProperties,
  startDate: s.date("First date included in the report window, in YYYY-MM-DD format."),
  endDate: s.date("Last date included in the report window, in YYYY-MM-DD format."),
  dimensions: s.array("Dimensions used to split report rows.", reportDimensionSchema, {
    uniqueItems: true,
  }),
  filters: s.array(
    "Pre-aggregation filters. These change both numerator and denominator values for ratio metrics.",
    reportSetPredicateSchema,
  ),
  having: s.array(
    "Post-aggregation predicates. Use these to select rows without changing ratio-metric denominators.",
    reportHavingPredicateSchema,
  ),
  orderBy: s.array("Sort instructions applied in order.", reportOrderSchema),
};

const reportInputOptions = {
  optional: ["projectId", "limit", "offset", "startDate", "endDate", "dimensions", "filters", "having", "orderBy"],
};

const reportOutputSchema = s.object("A Peec analytics report response.", {
  rows: s.array(
    "The report rows returned by Peec. Row fields depend on the report and requested dimensions.",
    s.looseObject("One Peec report row."),
  ),
});

export const peecActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Peec projects available to a company-scoped API key.",
    inputSchema: s.object(
      "Filters for listing Peec projects.",
      {
        ...paginationProperties,
        externalId: s.nonEmptyString("Only return the project with this external ID."),
        startDate: s.date("Only return projects created on or after this date."),
        endDate: s.date("Only return projects created on or before this date."),
      },
      { optional: ["limit", "offset", "externalId", "startDate", "endDate"] },
    ),
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_brands_report",
    operationType: "read",
    description: "Get Peec brand visibility, sentiment, position, and share-of-voice report rows.",
    inputSchema: s.object(
      "Parameters for a Peec brands report.",
      {
        ...reportInputProperties,
        previousStartDate: s.date("First date of an explicit comparison window; provide it with previousEndDate."),
        previousEndDate: s.date("Last date of an explicit comparison window; provide it with previousStartDate."),
        includePreviousPeriod: s.boolean("Whether to include metrics for the adjacent equal-length comparison window."),
      },
      {
        optional: [...reportInputOptions.optional, "previousStartDate", "previousEndDate", "includePreviousPeriod"],
      },
    ),
    outputSchema: reportOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_domains_report",
    operationType: "read",
    description: "Get Peec source-domain retrieval and citation report rows.",
    inputSchema: s.object("Parameters for a Peec domains report.", reportInputProperties, reportInputOptions),
    outputSchema: reportOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_urls_report",
    operationType: "read",
    description: "Get Peec source-URL retrieval and citation report rows.",
    inputSchema: s.object("Parameters for a Peec URLs report.", reportInputProperties, reportInputOptions),
    outputSchema: reportOutputSchema,
  }),
];
