import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "contactout";

const linkedInProfileUrl = s.nonEmptyString(
  "The full LinkedIn profile URL, such as https://www.linkedin.com/in/example-person.",
);
const linkedInCompanyUrl = s.nonEmptyString(
  "The full LinkedIn company URL, such as https://www.linkedin.com/company/contactout.",
);
const emailAddress = s.email("The email address to look up or verify.");
const rawProfile = s.looseObject("The raw ContactOut profile object.");
const rawCompany = s.looseObject("The raw ContactOut company object.");
const rawUsage = s.looseObject("The raw ContactOut usage object.");
const statusCode = s.integer("The ContactOut status_code value returned by the API.");
const stringArray = (description: string, maxItems?: number) =>
  s.array(description, s.nonEmptyString("One string value."), maxItems === undefined ? {} : { maxItems });

const profileOutputSchema = s.looseRequiredObject("ContactOut profile response.", {
  status_code: statusCode,
  profile: rawProfile,
});

const companiesByDomainOutputSchema = s.looseRequiredObject("ContactOut domain enrichment response.", {
  status_code: statusCode,
  companies: s.record("Company records keyed by input domain.", rawCompany),
});

const searchPeopleOutputSchema = s.looseRequiredObject("ContactOut people search response.", {
  status_code: statusCode,
  profiles: s.array("Profiles matched by the ContactOut people search.", rawProfile),
  total_results: s.integer("The total number of matching ContactOut profiles."),
});

const searchCompanyOutputSchema = s.looseRequiredObject("ContactOut company search response.", {
  status_code: statusCode,
  companies: s.array("Companies matched by the ContactOut company search.", rawCompany),
});

const availabilityOutputSchema = s.looseRequiredObject("ContactOut contact availability response.", {
  status_code: statusCode,
  profile: s.looseObject("The raw ContactOut availability profile object."),
});

const filtersSchema = s.looseObject("Official ContactOut search filters to send in the request body.");

export const contactoutActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "enrich_linkedin_profile",
    description: "Enrich a ContactOut profile from a LinkedIn profile URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for enriching a ContactOut profile from a LinkedIn profile URL.",
      {
        profile: linkedInProfileUrl,
        profile_only: s.boolean("Whether to return profile data without contact information."),
      },
      { optional: ["profile_only"] },
    ),
    outputSchema: profileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_email_profile",
    description: "Enrich a ContactOut profile from an email address.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for enriching a ContactOut profile from an email address.",
      {
        email: emailAddress,
        include: s.stringEnum("Additional data to include in the response.", ["work_email"]),
      },
      { optional: ["include"] },
    ),
    outputSchema: profileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_person",
    description: "Enrich a ContactOut profile from identifiers or name plus context.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for ContactOut person enrichment using one primary identifier or name plus context.",
      {
        linkedin_url: s.nonEmptyString("LinkedIn profile URL for the person."),
        email: emailAddress,
        phone: s.nonEmptyString("Phone number for the person."),
        full_name: s.nonEmptyString("Full name of the person."),
        first_name: s.nonEmptyString("First name of the person."),
        last_name: s.nonEmptyString("Last name of the person."),
        company: stringArray("Company names to use as secondary matching context.", 10),
        company_domain: stringArray("Company domains to use as secondary matching context.", 10),
        education: stringArray("Educational institutions to use as secondary matching context.", 10),
        location: s.nonEmptyString("Location or city to use as secondary matching context."),
        job_title: s.nonEmptyString("Job title to use as secondary matching context."),
        include: s.array(
          "Contact data fields to include in the enrichment response.",
          s.stringEnum("A ContactOut contact data type.", ["work_email", "personal_email", "phone"]),
        ),
      },
      {
        optional: [
          "linkedin_url",
          "email",
          "phone",
          "full_name",
          "first_name",
          "last_name",
          "company",
          "company_domain",
          "education",
          "location",
          "job_title",
          "include",
        ],
      },
    ),
    outputSchema: profileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_linkedin_contact_info",
    description: "Get ContactOut contact information for a LinkedIn profile.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for reading ContactOut contact details from a LinkedIn profile URL.",
      {
        profile: linkedInProfileUrl,
        include_phone: s.boolean("Whether ContactOut should include phone data and deduct phone credits."),
        email_type: s.stringEnum("Which email types ContactOut should return.", [
          "personal",
          "work",
          "personal,work",
          "none",
        ]),
      },
      { optional: ["include_phone", "email_type"] },
    ),
    outputSchema: profileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_companies_by_domain",
    description: "Enrich companies from domain names with ContactOut.",
    requiredScopes: [],
    inputSchema: s.object("Input for enriching companies by domain.", {
      domains: stringArray("Domain names to enrich with ContactOut.", 30),
    }),
    outputSchema: companiesByDomainOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Search ContactOut people records with official search filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for searching ContactOut people records.",
      {
        filters: filtersSchema,
        page: s.integer("The ContactOut result page to request.", { minimum: 1 }),
        data_types: s.array(
          "Contact data types ContactOut should reveal when reveal_info is true.",
          s.stringEnum("A ContactOut reveal data type.", ["work_email", "personal_email", "phone"]),
        ),
        reveal_info: s.boolean("Whether ContactOut should reveal contact information in results."),
      },
      { optional: ["page", "data_types", "reveal_info"] },
    ),
    outputSchema: searchPeopleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "count_people",
    description: "Count ContactOut people records matching official search filters.",
    requiredScopes: [],
    inputSchema: s.object("Input for counting ContactOut people records.", {
      filters: filtersSchema,
    }),
    outputSchema: s.looseRequiredObject("ContactOut people count response.", {
      status_code: statusCode,
      total_results: s.integer("The total number of ContactOut profiles matching the filters."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_decision_makers",
    description: "Find decision makers for a company with ContactOut.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for finding ContactOut decision makers for a company.",
      {
        linkedin_url: linkedInCompanyUrl,
        domain: s.nonEmptyString("The company website domain, such as example.com."),
        name: s.nonEmptyString("The company name."),
        reveal_info: s.boolean("Whether ContactOut should reveal contact information."),
      },
      { optional: ["linkedin_url", "domain", "name", "reveal_info"] },
    ),
    outputSchema: s.looseRequiredObject("ContactOut decision makers response.", {
      status_code: statusCode,
      profiles: s.array("Decision-maker profiles returned by ContactOut.", rawProfile),
    }),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search ContactOut company records with official search filters.",
    requiredScopes: [],
    inputSchema: s.object("Input for searching ContactOut company records.", {
      filters: filtersSchema,
    }),
    outputSchema: searchCompanyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_linkedin_profile_by_email",
    description: "Resolve a LinkedIn profile URL from an email address with ContactOut.",
    requiredScopes: [],
    inputSchema: s.object("Input for resolving a LinkedIn profile from an email address.", {
      email: emailAddress,
    }),
    outputSchema: profileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_personal_email_available",
    description: "Check whether ContactOut has a personal email for a LinkedIn profile.",
    requiredScopes: [],
    inputSchema: s.object("Input for checking whether a LinkedIn profile has ContactOut contact data.", {
      profile: linkedInProfileUrl,
    }),
    outputSchema: availabilityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_work_email_available",
    description: "Check whether ContactOut has a work email for a LinkedIn profile.",
    requiredScopes: [],
    inputSchema: s.object("Input for checking whether a LinkedIn profile has ContactOut contact data.", {
      profile: linkedInProfileUrl,
    }),
    outputSchema: availabilityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_phone_available",
    description: "Check whether ContactOut has a phone number for a LinkedIn profile.",
    requiredScopes: [],
    inputSchema: s.object("Input for checking whether a LinkedIn profile has ContactOut contact data.", {
      profile: linkedInProfileUrl,
    }),
    outputSchema: availabilityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify an email address with ContactOut.",
    requiredScopes: [],
    inputSchema: s.object("Input for verifying an email address with ContactOut.", {
      email: emailAddress,
    }),
    outputSchema: s.looseRequiredObject("ContactOut email verification response.", {
      status: s.stringEnum("The ContactOut email verification status.", [
        "valid",
        "invalid",
        "accept_all",
        "disposable",
        "unknown",
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage_stats",
    description: "Read ContactOut API usage statistics.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for reading ContactOut API usage statistics.",
      {
        period: s.nonEmptyString("Usage month in YYYY-MM format. Defaults to the current month."),
      },
      { optional: ["period"] },
    ),
    outputSchema: s.looseRequiredObject("ContactOut usage statistics response.", {
      status_code: statusCode,
      period: s.looseObject("The ContactOut usage period object."),
      usage: rawUsage,
    }),
  }),
];
