import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wiza";

const wizaStatusSchema = s.looseObject("The Wiza response status object.", {
  code: s.integer("The Wiza response status code."),
  message: s.string("The Wiza response status message."),
});
const wizaDataSchema = s.looseObject("The Wiza response data object returned by the upstream endpoint.");
const wizaGenericResponseSchema = s.looseObject(
  "The raw Wiza API response payload returned by the upstream endpoint.",
  {
    status: wizaStatusSchema,
    type: s.string("The Wiza response resource type."),
    data: wizaDataSchema,
  },
);
const wizaCreditsResponseSchema = s.looseObject("The Wiza API credits response payload.", {
  status: wizaStatusSchema,
  credits: s.looseObject("The Wiza credit balances grouped by credit type."),
  data: wizaDataSchema,
});

function getByIdInputSchema(description: string) {
  return s.actionInput(
    {
      id: s.nonEmptyString("The Wiza resource ID."),
    },
    ["id"],
    description,
  );
}

export const wizaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    description: "Get the remaining Wiza API credit balances for the connected account.",
    inputSchema: s.actionInput({}, [], "This Wiza action does not require any input."),
    outputSchema: wizaCreditsResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_individual_reveal",
    description: "Get the status and results of a Wiza individual reveal by ID.",
    inputSchema: getByIdInputSchema("Request parameters for retrieving a Wiza individual reveal."),
    outputSchema: wizaGenericResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Get the status and details of a Wiza list by ID.",
    inputSchema: getByIdInputSchema("Request parameters for retrieving a Wiza list."),
    outputSchema: wizaGenericResponseSchema,
  }),
  defineProviderAction(service, {
    name: "prospect_search",
    description: "Search Wiza prospects with a filters object.",
    inputSchema: s.actionInput(
      {
        filters: s.looseObject(
          "The Wiza prospect search filters object, such as job title, location, company, industry, headcount, or other filters supported by Wiza.",
        ),
        size: s.integer("The optional number of prospect results to request from Wiza.", {
          minimum: 0,
          maximum: 30,
        }),
      },
      ["filters"],
      "Request parameters for Wiza prospect search.",
    ),
    outputSchema: wizaGenericResponseSchema,
  }),
  defineProviderAction(service, {
    name: "start_individual_reveal",
    description: "Start a Wiza individual reveal for real-time single contact enrichment.",
    inputSchema: s.actionInput(
      {
        individual_reveal: s.looseObject(
          "The Wiza individual reveal contact input. Provide an email, a LinkedIn profile URL, or a name with company or domain.",
          {
            email: s.nonEmptyString("The contact email address to enrich."),
            full_name: s.nonEmptyString("The contact full name to enrich."),
            company: s.nonEmptyString("The contact company name used with full_name."),
            domain: s.nonEmptyString("The contact company domain used with full_name."),
            profile_url: s.nonEmptyString("The LinkedIn, Sales Navigator, or Recruiter profile URL to enrich."),
            linkedin_profile_url: s.nonEmptyString(
              "Alias for the LinkedIn, Sales Navigator, or Recruiter profile URL to enrich.",
            ),
          },
        ),
        enrichment_level: s.stringEnum("The Wiza enrichment level to request.", ["none", "partial", "phone", "full"]),
        email_options: s.looseObject("Email type preferences sent to Wiza when starting an individual reveal.", {
          accept_work: s.boolean("Whether Wiza should return work email addresses when available."),
          accept_personal: s.boolean("Whether Wiza should return personal email addresses when available."),
          accept_generic: s.boolean("Whether Wiza should return generic email addresses when available."),
        }),
        callback_url: s.nonEmptyString(
          "Optional webhook URL that Wiza should call when the individual reveal updates.",
        ),
      },
      ["individual_reveal", "enrichment_level"],
      "Request parameters for starting a Wiza individual reveal.",
    ),
    outputSchema: wizaGenericResponseSchema,
  }),
];
