import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fullenrich";

const rawObjectSchema = s.unknownObject("A JSON object returned by FullEnrich.");
const lookupMetadataSchema = s.object(
  "The lookup metadata returned by FullEnrich.",
  {
    credits: s.number("The number of credits consumed by the lookup."),
  },
  { optional: ["credits"] },
);
const personProfileSchema = s.unknownObject("A person profile returned by FullEnrich.");
const companyProfileSchema = s.unknownObject("A company profile returned by FullEnrich.");

const personLookupInputSchema = s.object(
  "The input payload for looking up one FullEnrich person. Provide a person professional-network identifier, or person_name with a company identifier.",
  {
    person_name: s.nonEmptyString("The full name of the person to look up."),
    person_professional_network_url: s.url("The professional network profile URL of the person."),
    person_professional_network_id: s.integer("The professional network profile ID of the person."),
    company_professional_network_url: s.url(
      "The professional network URL of the company used to disambiguate a person-name lookup.",
    ),
    company_professional_network_id: s.integer(
      "The professional network ID of the company used to disambiguate a person-name lookup.",
    ),
    company_domain: s.nonEmptyString("The domain of the company used to disambiguate a person-name lookup."),
  },
  {
    optional: [
      "person_name",
      "person_professional_network_url",
      "person_professional_network_id",
      "company_professional_network_url",
      "company_professional_network_id",
      "company_domain",
    ],
  },
);

const companyLookupInputSchema = s.object(
  "The input payload for looking up one FullEnrich company. Provide domain, professional_network_url, or professional_network_id.",
  {
    domain: s.nonEmptyString("The company domain to look up."),
    professional_network_url: s.url("The professional network URL of the company."),
    professional_network_id: s.integer("The professional network ID of the company."),
  },
  { optional: ["domain", "professional_network_url", "professional_network_id"] },
);

export const fullenrichActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credit_balance",
    description: "Get the current FullEnrich credit balance for the workspace.",
    inputSchema: s.object("The input payload for getting the FullEnrich credit balance.", {}),
    outputSchema: s.object("The FullEnrich credit balance response.", {
      balance: s.number("The number of credits available in the workspace."),
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_person",
    description: "Look up one FullEnrich person by professional-network identifier or name.",
    inputSchema: personLookupInputSchema,
    outputSchema: s.object("The FullEnrich person lookup response.", {
      people: s.array("The matching people returned by FullEnrich.", personProfileSchema),
      metadata: s.nullable(lookupMetadataSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_company",
    description: "Look up one FullEnrich company by domain or professional-network identifier.",
    inputSchema: companyLookupInputSchema,
    outputSchema: s.object("The FullEnrich company lookup response.", {
      companies: s.array("The matching companies returned by FullEnrich.", companyProfileSchema),
      metadata: s.nullable(lookupMetadataSchema),
      raw: rawObjectSchema,
    }),
  }),
];
