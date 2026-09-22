import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cufinder" as const;

const trimmedNonEmptyString = (description: string) => s.nonEmptyString(description);
const countryCodeSchema = s.string(
  "An optional two-letter ISO country code used to disambiguate the company. CUFinder defaults to US.",
  {
    pattern: "^\\s*[A-Za-z]{2}\\s*$",
  },
);

const creditsSchema = s.object("Credit usage reported by CUFinder for the request.", {
  charged: s.number("The number of credits charged for the request."),
  remaining: s.number("The number of credits remaining after the request."),
});

const metadataSchema = s.object("Match and billing metadata returned by CUFinder.", {
  confidence: s.number("The confidence score assigned to the result."),
  query: s.looseObject("The normalized query processed by CUFinder."),
  credits: creditsSchema,
});

const companyResultSchema = s.looseObject(
  "The company profile returned by CUFinder, including firmographic and contact fields when available.",
);
const personResultSchema = s.looseObject(
  "The person profile returned by CUFinder, including job, company, contact, and professional fields when available.",
);

const findCompanyDomainAction = defineProviderAction(service, {
  name: "find_company_domain",
  description: "Find a company's official website domain from its name, with optional country and address hints.",
  operationType: "read",
  inputSchema: s.object(
    "The company details used to find its official domain.",
    {
      name: trimmedNonEmptyString("The company name to resolve, such as Stripe."),
      countryCode: countryCodeSchema,
      address: trimmedNonEmptyString("An optional company address used as an additional disambiguation hint."),
    },
    { optional: ["countryCode", "address"] },
  ),
  outputSchema: s.object("The resolved company domain and CUFinder request metadata.", {
    domain: s.string("The company's official website domain."),
    meta: metadataSchema,
  }),
});

const findCompanyNameAction = defineProviderAction(service, {
  name: "find_company_name",
  description: "Find a company's registered name from its website domain.",
  operationType: "read",
  inputSchema: s.object("The domain used to identify the company.", {
    domain: trimmedNonEmptyString("The company domain to resolve, such as stripe.com."),
  }),
  outputSchema: s.object("The resolved company name and CUFinder request metadata.", {
    name: s.string("The company name associated with the domain."),
    meta: metadataSchema,
  }),
});

const enrichCompanyAction = defineProviderAction(service, {
  name: "enrich_company",
  description: "Enrich a company name, domain, or LinkedIn company URL with firmographic and contact data.",
  operationType: "read",
  inputSchema: s.object("The company identifier to enrich.", {
    query: trimmedNonEmptyString("A company name, domain, or LinkedIn company URL."),
  }),
  outputSchema: s.object("The enriched company profile and CUFinder request metadata.", {
    company: companyResultSchema,
    meta: metadataSchema,
  }),
});

const enrichPersonAction = defineProviderAction(service, {
  name: "enrich_person",
  description: "Enrich a person's full name and company with professional and contact data.",
  operationType: "read",
  inputSchema: s.object("The person and company identifiers used for enrichment.", {
    fullName: trimmedNonEmptyString("The person's full name."),
    company: trimmedNonEmptyString("The person's company name, domain, or LinkedIn company URL."),
  }),
  outputSchema: s.object("The enriched person profile and CUFinder request metadata.", {
    person: personResultSchema,
    meta: metadataSchema,
  }),
});

const enrichPersonByEmailAction = defineProviderAction(service, {
  name: "enrich_person_by_email",
  description: "Enrich an email address with professional, company, and contact data.",
  operationType: "read",
  inputSchema: s.object("The email address used for enrichment.", {
    email: s.email("The person's email address."),
  }),
  outputSchema: s.object("The enriched person profile and CUFinder request metadata.", {
    person: personResultSchema,
    meta: metadataSchema,
  }),
});

export const cufinderActions: ActionDefinition[] = [
  findCompanyDomainAction,
  findCompanyNameAction,
  enrichCompanyAction,
  enrichPersonAction,
  enrichPersonByEmailAction,
];
