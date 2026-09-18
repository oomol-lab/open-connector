import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "datagma";

const rawResultSchema = s.requiredObject("The Datagma response payload.", {
  result: s.unknown(
    "The raw JSON result returned by Datagma; available enrichment fields vary by lookup type and enabled options.",
  ),
});

const getCreditAction = defineProviderAction(service, {
  name: "get_credit",
  operationType: "read",
  description: "Get the remaining API credit balance for the connected Datagma account.",
  inputSchema: s.object(
    "The input payload for reading the connected Datagma account's credit balance.",
    {
      email: s.email("The account email to include when Datagma requires it for credit lookup."),
    },
    { optional: ["email"] },
  ),
  outputSchema: rawResultSchema,
});

const enrichPersonOrCompanyInputSchema = s.object(
  "The input payload for enriching a person or company with Datagma.",
  {
    data: s.string({
      minLength: 1,
      pattern: "\\S",
      description:
        "A professional email address, LinkedIn profile URL, company domain, company name, or French SIREN number.",
    }),
    firstName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The person's first name; use it with lastName and company when data is not provided.",
    }),
    lastName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The person's last name; use it with firstName and company when data is not provided.",
    }),
    fullName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The person's full name; use it with company when data is not provided.",
    }),
    company: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The person's company name or domain when enriching by name instead of the data field.",
    }),
    companyKeyword: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "A disambiguating keyword such as an industry, founder, or location for company-name enrichment.",
    }),
    countryCode: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "A country code that narrows the Datagma search and reduces namesake matches.",
    }),
    companyPremium: s.boolean(
      "Whether to include LinkedIn-derived company details such as employees, industry, and locations.",
    ),
    companyFull: s.boolean("Whether to include extended company financial, funding, technology, and traffic details."),
    companyFrench: s.boolean("Whether to include French SIREN directory information for the matched company."),
    personFull: s.boolean(
      "Whether to include the person's extended profile, education, experience, skills, and posts.",
    ),
    phoneFull: s.boolean("Whether to search for a mobile phone number when enriching from a name and company."),
    deepTraffic: s.boolean("Whether to include detailed website traffic sources, countries, and similar-site data."),
    debug: s.boolean("Whether to include lower-confidence matches and additional scoring details."),
    whatsappCheck: s.boolean("Whether Datagma should check if returned phone numbers are associated with WhatsApp."),
  },
  {
    optional: [
      "data",
      "firstName",
      "lastName",
      "fullName",
      "company",
      "companyKeyword",
      "countryCode",
      "companyPremium",
      "companyFull",
      "companyFrench",
      "personFull",
      "phoneFull",
      "deepTraffic",
      "debug",
      "whatsappCheck",
    ],
  },
);

const enrichPersonOrCompanyAction = defineProviderAction(service, {
  name: "enrich_person_or_company",
  operationType: "read",
  description:
    "Enrich a person or company from an email, LinkedIn URL, domain, company identifier, or name-and-company combination.",
  inputSchema: enrichPersonOrCompanyInputSchema,
  outputSchema: rawResultSchema,
});

const findWorkEmailInputSchema = s.object(
  "The input payload for finding a verified work email with Datagma.",
  {
    firstName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The person's first name when fullName is not supplied.",
    }),
    lastName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The person's last name when fullName is not supplied.",
    }),
    fullName: s.string({ minLength: 1, pattern: "\\S", description: "The person's full name." }),
    company: s.string({ minLength: 1, pattern: "\\S", description: "The company domain or company name." }),
    linkedInSlug: s.url("The LinkedIn company URL used to resolve the employer when a company domain is unavailable."),
  },
  { optional: ["firstName", "lastName", "fullName", "company", "linkedInSlug"] },
);

const findWorkEmailAction = defineProviderAction(service, {
  name: "find_work_email",
  operationType: "read",
  description:
    "Find and verify a person's work email from their name plus a company domain, company name, or LinkedIn company URL.",
  inputSchema: findWorkEmailInputSchema,
  outputSchema: rawResultSchema,
});

const searchPhoneNumbersInputSchema = s.object(
  "The input payload for finding mobile phone numbers with Datagma.",
  {
    email: s.email("The person's email address used to search for mobile phone numbers."),
    username: s.url("The person's LinkedIn or other supported social-profile URL used for phone lookup."),
    minimumMatch: s.integer("The minimum match threshold passed to Datagma."),
    whatsappCheck: s.boolean("Whether Datagma should check if returned phone numbers are associated with WhatsApp."),
  },
  { optional: ["email", "username", "minimumMatch", "whatsappCheck"] },
);

const searchPhoneNumbersAction = defineProviderAction(service, {
  name: "search_phone_numbers",
  operationType: "read",
  description:
    "Find mobile phone numbers from an email address, a social-profile URL, or both, with optional confidence and WhatsApp checks.",
  inputSchema: searchPhoneNumbersInputSchema,
  outputSchema: rawResultSchema,
});

const detectJobChangeInputSchema = s.object(
  "The input payload for checking whether a contact changed jobs with Datagma.",
  {
    firstName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The contact's first name when fullName is not supplied.",
    }),
    lastName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The contact's last name when fullName is not supplied.",
    }),
    fullName: s.string({ minLength: 1, pattern: "\\S", description: "The contact's full name." }),
    companyName: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The contact's last-known company name.",
    }),
    jobTitle: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The contact's last-known job title, used to disambiguate people with similar names.",
    }),
  },
  { optional: ["firstName", "lastName", "fullName", "companyName", "jobTitle"] },
);

const detectJobChangeAction = defineProviderAction(service, {
  name: "detect_job_change",
  operationType: "read",
  description: "Check whether a contact still works at their last-known company or appears to have changed jobs.",
  inputSchema: detectJobChangeInputSchema,
  outputSchema: rawResultSchema,
});

export const datagmaActions: ActionDefinition[] = [
  getCreditAction,
  enrichPersonOrCompanyAction,
  findWorkEmailAction,
  searchPhoneNumbersAction,
  detectJobChangeAction,
];
