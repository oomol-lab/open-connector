import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "findymail";

const emptyInputSchema = s.object("No input parameters are required for this action.", {});
const looseContactSchema = s.looseObject({}, { description: "A contact object returned by Findymail." });
const rawPayloadSchema = s.unknown("The raw JSON payload returned by Findymail.");
const creditsSchema = s.looseRequiredObject(
  "Findymail account credit and usage information.",
  {
    credits: s.number("The remaining credit count reported by Findymail."),
    remaining: s.number("The remaining credits reported by Findymail."),
    used: s.number("The used credits reported by Findymail."),
    plan: s.string("The plan name reported by Findymail."),
  },
  { optional: ["credits", "remaining", "used", "plan"] },
);
const verificationSchema = s.looseRequiredObject(
  "Findymail email verification result.",
  {
    email: s.email("The email address that was verified."),
    verified: s.boolean("Whether Findymail considers the email address verified."),
    provider: s.string("The detected email provider or verification source."),
    status: s.string("The verification status returned by Findymail."),
  },
  { optional: ["email", "verified", "provider", "status"] },
);
const searchByNameInputSchema = s.object(
  "Input payload for finding an email by person name and company domain.",
  {
    name: s.nonEmptyString("The person's full name. Use this or firstName and lastName."),
    firstName: s.nonEmptyString("The person's first name."),
    lastName: s.nonEmptyString("The person's last name."),
    domain: s.nonEmptyString("The company domain, such as example.com."),
  },
  { required: ["domain"], optional: ["name", "firstName", "lastName"] },
);
const verifyEmailInputSchema = s.requiredObject("Input payload for verifying an email address.", {
  email: s.email("The email address to verify."),
});
const searchDomainInputSchema = s.requiredObject("Input payload for finding contacts by company domain.", {
  domain: s.nonEmptyString("The company domain to search, such as example.com."),
});
const searchEmployeesInputSchema = s.object(
  "Input payload for finding employees at a company.",
  {
    domain: s.nonEmptyString("The company domain to search, such as example.com."),
    companyName: s.nonEmptyString("The company name to search when no domain is available."),
    limit: s.integer("The maximum number of employees to request.", { minimum: 1, maximum: 100 }),
  },
  { optional: ["domain", "companyName", "limit"] },
);

export const findymailActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    description: "Get remaining Findymail credits and usage information for the API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.requiredObject("The normalized Findymail credits response.", {
      credits: creditsSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify a professional email address with Findymail.",
    inputSchema: verifyEmailInputSchema,
    outputSchema: s.requiredObject("The normalized Findymail email verification response.", {
      verification: verificationSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_by_name",
    description: "Find a verified professional email from a person's name and company domain.",
    inputSchema: searchByNameInputSchema,
    outputSchema: s.requiredObject("The normalized Findymail name-search response.", {
      contact: s.nullable(looseContactSchema),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_domain",
    description: "Find professional email contacts associated with a company domain.",
    inputSchema: searchDomainInputSchema,
    outputSchema: s.requiredObject("The normalized Findymail domain-search response.", {
      contacts: s.array("The contacts returned by Findymail.", looseContactSchema),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_employees",
    description: "Find employees at a company using Findymail's company search endpoint.",
    inputSchema: searchEmployeesInputSchema,
    outputSchema: s.requiredObject("The normalized Findymail employee-search response.", {
      employees: s.array("The employees returned by Findymail.", looseContactSchema),
      raw: rawPayloadSchema,
    }),
  }),
];

export type FindymailActionName =
  | "get_credits"
  | "verify_email"
  | "search_by_name"
  | "search_domain"
  | "search_employees";
