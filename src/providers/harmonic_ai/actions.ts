import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "harmonic_ai";

const rawObjectSchema = s.unknownObject("Raw object returned by the Harmonic API.");
const includeFieldsSchema = s.stringArray("Optional output fields to include for better upstream performance.", {
  minItems: 1,
  itemDescription: "A Harmonic output field name.",
});
const entityIdOrUrnSchema = s.anyOf("A Harmonic numeric ID or full entity URN.", [
  s.positiveInteger("A Harmonic numeric ID."),
  s.nonEmptyString("A full Harmonic entity URN."),
]);
const pageInfoSchema = s.looseObject("Pagination metadata returned by Harmonic.", {
  current: s.string("The current cursor value."),
  next: s.string("The cursor value for the next page."),
  has_next: s.boolean("Whether another page is available."),
});

const companyIdentifierProperties = {
  website_url: s.url("Company website URL."),
  website_domain: s.nonEmptyString("Company website domain."),
  linkedin_url: s.url("Company LinkedIn URL."),
  crunchbase_url: s.url("Company Crunchbase URL."),
  pitchbook_url: s.url("Company PitchBook URL."),
  twitter_url: s.url("Company X or Twitter URL."),
  instagram_url: s.url("Company Instagram URL."),
  facebook_url: s.url("Company Facebook URL."),
  angellist_url: s.url("Company AngelList URL."),
  monster_url: s.url("Company Monster URL."),
  indeed_url: s.url("Company Indeed URL."),
  stackoverflow_url: s.url("Company Stack Overflow URL."),
};

const companyIdentifierInputSchema = atLeastOneInput(
  "Company identifiers accepted by the Harmonic company enrichment endpoint. Provide identifiers for one company only.",
  companyIdentifierProperties,
);

const personIdentifierInputSchema = atLeastOneInput(
  "Person identifiers accepted by the Harmonic person enrichment endpoint.",
  {
    linkedin_url: s.url("Person LinkedIn URL."),
    email: s.email("Person email address."),
  },
);

const enrichmentStatusInputSchema = atLeastOneInput("Enrichment IDs or URNs to check with Harmonic.", {
  ids: s.stringArray("Enrichment UUIDs to check.", {
    minItems: 1,
    itemDescription: "An enrichment UUID.",
  }),
  urns: s.stringArray("Enrichment URNs to check.", {
    minItems: 1,
    itemDescription: "A full Harmonic enrichment URN.",
  }),
});

const getEntityInputSchema = s.actionInput(
  {
    id_or_urn: entityIdOrUrnSchema,
    include_fields: includeFieldsSchema,
  },
  ["id_or_urn"],
  "Entity lookup input for a single Harmonic entity.",
);

const employeesInputSchema = s.actionInput(
  {
    id_or_urn: entityIdOrUrnSchema,
    employee_group_type: s.stringEnum("Employee group to retrieve.", [
      "ALL",
      "FOUNDERS_AND_CEO",
      "EXECUTIVES",
      "FOUNDERS",
      "LEADERSHIP",
      "NON_LEADERSHIP",
      "ADVISORS",
      "NON_PARTNERS",
    ]),
    size: s.positiveInteger("Number of employees to return."),
    page: s.nonNegativeInteger("Starting page index."),
    user_connection_status: s.stringEnum("Team connection filter.", ["TEAM_CONNECTION", "NO_CONNECTION"]),
    employee_status: s.stringEnum("Employment status filter.", ["ACTIVE", "ACTIVE_AND_NOT_ACTIVE", "NOT_ACTIVE"]),
  },
  ["id_or_urn"],
  "Input for retrieving employee person URNs from a Harmonic company.",
);

const entityOutputSchema = s.looseObject("A Harmonic company or person profile.", {
  entity_urn: s.string("The Harmonic entity URN."),
  id: s.integer("The Harmonic numeric ID."),
});

const enrichmentTriggeredOutputSchema = s.looseObject(
  "Metadata returned when Harmonic starts or reports an enrichment job instead of returning a fresh entity.",
  {
    enrichment_urn: s.string("The Harmonic enrichment URN."),
    enrichment_id: s.string("The Harmonic enrichment ID."),
    message: s.string("Human-readable enrichment status message."),
  },
);

const enrichmentResultOutputSchema = s.actionOutput(
  {
    status: s.integer("HTTP status returned by Harmonic for the enrichment request."),
    entity: entityOutputSchema,
    enrichment: enrichmentTriggeredOutputSchema,
    raw: rawObjectSchema,
  },
  "Result from a Harmonic enrichment request.",
  ["status", "raw"],
);

const enrichmentStatusSchema = s.looseObject("A single Harmonic enrichment status.", {
  entity_urn: s.string("The Harmonic enrichment URN."),
  status: s.stringEnum("The enrichment job status.", ["QUEUED", "IN_PROGRESS", "COMPLETE", "FAILED", "NOT_FOUND"]),
  message: s.string("Status message returned by Harmonic."),
  enriched_entity_urn: s.nullableString("The resulting company or person URN."),
});

const enrichmentStatusesOutputSchema = s.actionOutput(
  {
    statuses: s.array("Enrichment statuses returned by Harmonic.", enrichmentStatusSchema),
  },
  "Harmonic enrichment status results.",
);

const employeesOutputSchema = s.actionOutput(
  {
    count: s.integer("Total number of matching employees."),
    page_info: s.nullable(pageInfoSchema),
    results: s.array(
      "Harmonic person URNs returned for the requested employee page.",
      s.string("A Harmonic person URN."),
    ),
  },
  "Employee person URNs returned for a company.",
);

export const harmonicAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "enrich_company",
    description: "Enrich one company by website, social, or business profile identifier with Harmonic.",
    inputSchema: companyIdentifierInputSchema,
    outputSchema: enrichmentResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_person",
    description: "Enrich one person by LinkedIn URL or email address with Harmonic.",
    inputSchema: personIdentifierInputSchema,
    outputSchema: enrichmentResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_enrichment_status",
    description: "Check Harmonic enrichment job statuses by enrichment IDs or URNs.",
    inputSchema: enrichmentStatusInputSchema,
    outputSchema: enrichmentStatusesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Retrieve a Harmonic company profile by numeric ID or full company URN.",
    inputSchema: getEntityInputSchema,
    outputSchema: entityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_employees",
    description: "Retrieve employee person URNs for a Harmonic company with optional filters.",
    inputSchema: employeesInputSchema,
    outputSchema: employeesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_person",
    description: "Retrieve a Harmonic person profile by numeric ID or full person URN.",
    inputSchema: getEntityInputSchema,
    outputSchema: entityOutputSchema,
  }),
];

function atLeastOneInput(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return {
    ...s.actionInput(properties, [], description),
    anyOf: Object.keys(properties).map((key) => ({ required: [key] })),
  };
}
