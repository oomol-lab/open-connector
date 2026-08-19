import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "reversecontact" as const;

const trimmedNonEmptyString = (description: string) => s.nonEmptyString(description);
const trimmedEmail = (description: string) => s.email(description);

const personSchema = s.looseRequiredObject(
  "A Reverse Contact person profile. Light fields are stable, while fullProfile adds documented fetch-profile fields.",
  {
    id: s.string("The Reverse Contact person identifier."),
    publicId: s.string("The public professional-profile slug."),
    linkedinUrl: s.string("The full professional-profile URL."),
    firstName: s.string("The person's first name."),
    lastName: s.string("The person's last name."),
  },
  { optional: ["publicId", "linkedinUrl", "firstName", "lastName"] },
);

const companySchema = s.looseRequiredObject(
  "A Reverse Contact company profile. Light fields are stable, while fullProfile adds documented fetch-profile fields.",
  {
    id: s.string("The Reverse Contact company identifier."),
    name: s.string("The company name in the light enrichment response."),
    publicId: s.string("The public company-profile slug."),
    linkedinId: s.string("The social-network company identifier."),
    linkedinUrl: s.string("The full social-network company URL."),
    websiteUrl: s.string("The official company website URL."),
  },
  { optional: ["name", "publicId", "linkedinId", "linkedinUrl", "websiteUrl"] },
);

const quotasSchema = s.looseRequiredObject("Credit and rate-limit usage after the request.", {
  creditsConsumed: s.number("The credits consumed by this request."),
});

const metadataSchema = s.looseRequiredObject("Request tracking metadata returned by Reverse Contact.", {
  requestId: s.string("The unique request identifier."),
  executionTimeMs: s.number("The total execution time in milliseconds."),
});

const enrichPersonInputSchema = s.object(
  "Details used to match and enrich one professional profile.",
  {
    email: trimmedEmail("A professional email address used to identify the person."),
    firstName: trimmedNonEmptyString("The person's first name."),
    lastName: trimmedNonEmptyString("The person's last name."),
    companyDomain: trimmedNonEmptyString("A company domain or full company URL used to disambiguate the person."),
    companyName: trimmedNonEmptyString("A company name used to disambiguate the person."),
    fullProfile: s.boolean("Whether to request the expanded person profile for one additional credit when matched."),
  },
  {
    optional: ["email", "firstName", "lastName", "companyDomain", "companyName", "fullProfile"],
  },
);

const enrichPersonOutputSchema = s.object(
  "The Reverse Contact person enrichment response.",
  {
    success: s.boolean("Whether Reverse Contact processed the request successfully."),
    data: s.requiredObject("The person enrichment payload.", {
      person: personSchema,
      alternativePersons: s.array("Other matching people ranked best first.", personSchema),
    }),
    error: s.nullable(s.unknown("The upstream error payload, or null on success.")),
    quotas: quotasSchema,
    metadata: metadataSchema,
  },
  { optional: ["quotas", "metadata"] },
);

const enrichCompanyInputSchema = s.object(
  "Details used to match and enrich one company profile.",
  {
    domain: trimmedNonEmptyString("The company domain or full company URL to enrich, such as acme.com."),
    fullProfile: s.boolean("Whether to request the expanded company profile for one additional credit when matched."),
  },
  { optional: ["fullProfile"] },
);

const enrichCompanyOutputSchema = s.object(
  "The Reverse Contact company enrichment response.",
  {
    success: s.boolean("Whether Reverse Contact processed the request successfully."),
    data: s.requiredObject("The company enrichment payload.", { company: companySchema }),
    error: s.nullable(s.unknown("The upstream error payload, or null on success.")),
    quotas: quotasSchema,
    metadata: metadataSchema,
  },
  { optional: ["quotas", "metadata"] },
);

export const reversecontactActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "enrich_person",
    description:
      "Enrich one professional profile synchronously from an email, name, or company context using Reverse Contact V2.",
    inputSchema: enrichPersonInputSchema,
    outputSchema: enrichPersonOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    description: "Enrich one company profile synchronously from its domain using Reverse Contact V2.",
    inputSchema: enrichCompanyInputSchema,
    outputSchema: enrichCompanyOutputSchema,
  }),
];
