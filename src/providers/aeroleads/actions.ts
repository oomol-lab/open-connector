import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aeroleads";

const profileDetailsSchema = s.looseObject(
  {},
  {
    description:
      "The raw LinkedIn profile enrichment details returned by AeroLeads, including prospect, email, phone, company, education, experience, skill, and social fields when available.",
  },
);

const getDetailsFromLinkedinUrlInputSchema = s.object(
  "Request parameters for retrieving prospect details from a LinkedIn profile URL.",
  {
    linkedin_url: s.string(
      "Public LinkedIn profile URL for the prospect, such as https://www.linkedin.com/in/example.",
      { minLength: 1 },
    ),
  },
  { required: ["linkedin_url"] },
);

const getDetailsFromLinkedinUrlOutputSchema = s.object(
  "The normalized AeroLeads LinkedIn profile enrichment result.",
  {
    data: profileDetailsSchema,
    successful: s.boolean("Whether AeroLeads returned a successful enrichment result."),
    message: s.string("A status or error message returned by AeroLeads."),
  },
  { required: ["data", "successful"] },
);

export const aeroleadsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_details_from_linkedin_url",
    operationType: "read",
    description:
      "Retrieve prospect details, emails, phone numbers, company, education, skills, and related profile data from a public LinkedIn profile URL using AeroLeads.",
    inputSchema: getDetailsFromLinkedinUrlInputSchema,
    outputSchema: getDetailsFromLinkedinUrlOutputSchema,
  }),
];
