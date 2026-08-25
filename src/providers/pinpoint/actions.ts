import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pinpoint";

const queryValueSchema = s.anyOf("A filter value accepted by the Pinpoint API.", [
  s.string("A string filter value."),
  s.boolean("A boolean filter value."),
  s.integer("An integer filter value."),
  s.array("A list of string filter values.", s.string("A string filter value.")),
]);

const listInputSchema = s.object(
  "Pagination, inclusion, field selection, sorting, and filtering options for a Pinpoint collection.",
  {
    page: s.integer("The one-based page number to return.", { minimum: 1 }),
    pageSize: s.integer("The number of records to return per page.", { minimum: 1, maximum: 1000 }),
    include: s.array(
      "Related JSON:API resources to include in the response.",
      s.string("A documented Pinpoint relationship path."),
    ),
    fields: s.array(
      "Fields of the primary resource to include in the response.",
      s.string("A documented field name for the primary resource."),
    ),
    extraFields: s.array(
      "Optional or computationally expensive fields of the primary resource to include.",
      s.string("A documented extra field name for the primary resource."),
    ),
    sort: s.array(
      "Sort fields, using a leading minus sign for descending order.",
      s.string("A documented Pinpoint sort field."),
    ),
    filters: s.record("Filters keyed by the documented name without the filter brackets.", queryValueSchema),
    includeTotal: s.boolean("Whether to include the matched record count in the response metadata."),
  },
  {
    optional: ["page", "pageSize", "include", "fields", "extraFields", "sort", "filters", "includeTotal"],
  },
);

const getInputSchema = s.object(
  "The identifier and expansion options for one Pinpoint resource.",
  {
    id: s.string("The Pinpoint resource ID.", { minLength: 1 }),
    include: s.array(
      "Related JSON:API resources to include in the response.",
      s.string("A documented Pinpoint relationship path."),
    ),
    fields: s.array(
      "Fields of the primary resource to include in the response.",
      s.string("A documented field name for the primary resource."),
    ),
    extraFields: s.array(
      "Optional or computationally expensive fields of the primary resource to include.",
      s.string("A documented extra field name for the primary resource."),
    ),
  },
  { optional: ["include", "fields", "extraFields"] },
);

const resourceSchema = s.looseObject("A Pinpoint JSON:API resource object.", {
  id: s.string("The resource ID."),
  type: s.string("The JSON:API resource type."),
});

const collectionOutputSchema = s.object(
  "A Pinpoint JSON:API collection document.",
  {
    data: s.array("The resources returned by Pinpoint.", resourceSchema),
    included: s.array("Related resources included by Pinpoint.", resourceSchema),
    links: s.record("Pagination or related links returned by Pinpoint.", s.unknown("A link value.")),
    meta: s.record("Collection metadata returned by Pinpoint.", s.unknown("A metadata value.")),
  },
  { optional: ["included", "links", "meta"] },
);

const resourceOutputSchema = s.object(
  "A Pinpoint JSON:API resource document.",
  {
    data: resourceSchema,
    included: s.array("Related resources included by Pinpoint.", resourceSchema),
    links: s.record("Related links returned by Pinpoint.", s.unknown("A link value.")),
    meta: s.record("Resource metadata returned by Pinpoint.", s.unknown("A metadata value.")),
  },
  { optional: ["included", "links", "meta"] },
);

function defineListAction(resource: "jobs" | "candidates" | "applications", description: string) {
  return defineProviderAction(service, {
    name: `list_${resource}`,
    description,
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: collectionOutputSchema,
  });
}

function defineGetAction(resource: "job" | "candidate" | "application", description: string) {
  return defineProviderAction(service, {
    name: `get_${resource}`,
    description,
    requiredScopes: [],
    inputSchema: getInputSchema,
    outputSchema: resourceOutputSchema,
  });
}

export const pinpointActions: ActionDefinition[] = [
  defineListAction("jobs", "List jobs in a Pinpoint account with documented filters and pagination."),
  defineGetAction("job", "Get one Pinpoint job by its resource ID."),
  defineListAction("candidates", "List candidates in a Pinpoint account with documented filters and pagination."),
  defineGetAction("candidate", "Get one Pinpoint candidate by its resource ID."),
  defineListAction("applications", "List applications in a Pinpoint account with documented filters and pagination."),
  defineGetAction("application", "Get one Pinpoint application by its resource ID."),
];
