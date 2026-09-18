import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "anymail_finder";

const nonEmptyString = (description: string) => s.nonEmptyString(description);

const emptyInputSchema = s.object("No input parameters are required for this action.", {});
const rawPayloadSchema = s.unknown("The raw JSON payload returned by Anymail Finder.");
const emailStatusSchema = s.stringEnum("Email status returned by Anymail Finder.", [
  "valid",
  "risky",
  "not_found",
  "blacklisted",
]);
const verificationStatusSchema = s.stringEnum("Email verification status returned by Anymail Finder.", [
  "valid",
  "risky",
  "invalid",
]);

const emailResultFields = {
  credits_charged: s.number("Number of credits charged for the request."),
  email: s.nullable(s.email("Email address found by Anymail Finder, if any.")),
  email_status: emailStatusSchema,
  mx_domain: s.nullable(s.string("Root domain of the primary MX host, if available.")),
  mx_host: s.nullable(s.string("Primary MX host for the email domain, if available.")),
  valid_email: s.nullable(s.email("Verified deliverable email address, if one was found.")),
};

const personResultSchema = s.looseRequiredObject(
  "A person email discovery result from Anymail Finder.",
  {
    ...emailResultFields,
    person_company_name: s.nullable(s.string("Company name sourced from the person's profile.")),
    person_full_name: s.nullable(s.string("Full name sourced from the person's profile.")),
    person_job_title: s.nullable(s.string("Job title sourced from the person's profile.")),
    person_linkedin_url: s.nullable(s.string("LinkedIn profile URL returned for the person.")),
  },
  {
    optional: [
      "credits_charged",
      "email",
      "mx_domain",
      "mx_host",
      "valid_email",
      "person_company_name",
      "person_full_name",
      "person_job_title",
      "person_linkedin_url",
    ],
  },
);

const companyInputFields = {
  domain: nonEmptyString("Company domain, such as example.com. Preferred over companyName."),
  companyName: nonEmptyString("Company name to resolve when the domain is unavailable."),
};

const findPersonInputSchema = s.object(
  "Input for finding a person's work email.",
  {
    ...companyInputFields,
    firstName: nonEmptyString("Person's first name. Use together with lastName."),
    lastName: nonEmptyString("Person's last name. Use together with firstName."),
    fullName: nonEmptyString("Person's full name as an alternative to firstName and lastName."),
    linkedinUrl: nonEmptyString("Person's LinkedIn profile URL."),
  },
  { optional: ["domain", "companyName", "firstName", "lastName", "fullName", "linkedinUrl"] },
);
findPersonInputSchema.anyOf = [
  { required: ["linkedinUrl"] },
  { required: ["fullName", "domain"] },
  { required: ["fullName", "companyName"] },
  { required: ["firstName", "lastName", "domain"] },
  { required: ["firstName", "lastName", "companyName"] },
];

const companyInputSchema = s.object(
  "Input for finding company email addresses.",
  {
    ...companyInputFields,
    emailType: s.stringEnum("Type of company email addresses to return.", ["any", "generic", "personal"]),
  },
  { optional: ["domain", "companyName", "emailType"] },
);
companyInputSchema.anyOf = [{ required: ["domain"] }, { required: ["companyName"] }];

const decisionMakerInputSchema = s.object(
  "Input for finding a company decision maker.",
  {
    ...companyInputFields,
    categories: s.array(
      "Decision-maker categories in priority order.",
      nonEmptyString("A built-in or account-defined decision-maker category."),
      { minItems: 1 },
    ),
  },
  { optional: ["domain", "companyName"] },
);
decisionMakerInputSchema.anyOf = [{ required: ["domain"] }, { required: ["companyName"] }];

const personOutputSchema = s.object("A normalized Anymail Finder person result.", {
  result: personResultSchema,
  raw: rawPayloadSchema,
});

export const anymailFinderActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get the Anymail Finder account email and remaining credits.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Anymail Finder account details.", {
      email: s.email("Email address associated with the Anymail Finder account."),
      creditsLeft: s.integer("Number of credits remaining in the account."),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_person_email",
    operationType: "read",
    description: "Find a person's work email from their name and company or LinkedIn profile.",
    requiredScopes: [],
    inputSchema: findPersonInputSchema,
    outputSchema: personOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_company_emails",
    operationType: "read",
    description: "Find up to 20 verified email addresses for a company.",
    requiredScopes: [],
    inputSchema: companyInputSchema,
    outputSchema: s.object("A normalized Anymail Finder company result.", {
      result: s.looseRequiredObject(
        "Company email discovery result from Anymail Finder.",
        {
          credits_charged: s.number("Number of credits charged for the request."),
          email_status: emailStatusSchema,
          emails: s.array("Email addresses found for the company.", s.email("A found email address.")),
          mx_domain: s.nullable(s.string("Root domain of the primary MX host, if available.")),
          mx_host: s.nullable(s.string("Primary MX host for the company domain, if available.")),
          valid_emails: s.array(
            "Verified deliverable email addresses found for the company.",
            s.email("A verified deliverable email address."),
          ),
        },
        {
          optional: ["credits_charged", "emails", "mx_domain", "mx_host", "valid_emails"],
        },
      ),
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "find_decision_maker_email",
    operationType: "read",
    description: "Find a verified email for a decision maker at a company.",
    requiredScopes: [],
    inputSchema: decisionMakerInputSchema,
    outputSchema: personOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_email",
    operationType: "read",
    description: "Verify the deliverability status of an email address.",
    requiredScopes: [],
    inputSchema: s.object("Input for verifying an email address.", {
      email: s.email("Email address to verify."),
    }),
    outputSchema: s.object("A normalized Anymail Finder verification result.", {
      result: s.looseRequiredObject(
        "An email verification result from Anymail Finder.",
        {
          credits_charged: s.number("Number of credits charged for the request."),
          email_status: verificationStatusSchema,
          mx_domain: s.nullable(s.string("Root domain of the primary MX host, if available.")),
          mx_host: s.nullable(s.string("Primary MX host for the email domain, if available.")),
        },
        { optional: ["credits_charged", "mx_domain", "mx_host"] },
      ),
      raw: rawPayloadSchema,
    }),
  }),
];
