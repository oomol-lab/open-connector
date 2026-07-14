import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "a_leads";

const nonEmptyString = (description: string) =>
  s.stringPattern("\\S", {
    description,
  });

const requestUuid = nonEmptyString("A unique ID linked to the search request for tracking in A-Leads.");

const message = s.looseObject(
  {
    status: s.string({ description: "A-Leads operation status." }),
    statusCode: s.integer({ description: "HTTP-like status code returned by A-Leads." }),
    description: s.string({ description: "Human-readable response description returned by A-Leads." }),
  },
  { description: "A-Leads response message metadata." },
);

const emailFinderResponse = s.looseObject(
  {
    email: s.nullable(s.string({ description: "Business email address found by A-Leads." })),
    quality: s.nullable(s.string({ description: "Email quality rating returned by A-Leads." })),
    result: s.nullable(s.string({ description: "Email finder result code returned by A-Leads." })),
    first_name: s.nullable(s.string({ description: "First name returned by A-Leads." })),
    last_name: s.nullable(s.string({ description: "Last name returned by A-Leads." })),
    catch_all_status: s.nullable(s.boolean({ description: "Whether the company email domain is catch-all." })),
  },
  { description: "A-Leads email finder result." },
);

const verificationResponse = s.looseObject(
  {
    is_valid: s.nullable(s.boolean({ description: "Whether A-Leads considers the email deliverable." })),
    quality: s.nullable(s.string({ description: "Email quality rating returned by A-Leads." })),
    result: s.nullable(s.string({ description: "Email verification result code returned by A-Leads." })),
    catch_all_status: s.nullable(s.boolean({ description: "Whether the email domain is catch-all." })),
    esp: s.nullable(s.string({ description: "Email service provider detected by A-Leads." })),
  },
  { description: "A-Leads email verification result." },
);

const rawPayload = s.looseObject({}, { description: "Raw A-Leads response payload." });

const findEmailInputSchema = {
  ...s.object(
    {
      first_name: nonEmptyString("First name of the person."),
      last_name: nonEmptyString("Last name of the person."),
      website: nonEmptyString("Company website or domain."),
      document_id: nonEmptyString("Unique document ID from A-Leads advanced search results."),
      request_uuid: requestUuid,
    },
    {
      description: "Input parameters for finding a business email with A-Leads.",
    },
  ),
  anyOf: [{ required: ["document_id"] }, { required: ["first_name", "last_name", "website"] }],
} satisfies JsonSchema;

export const aLeadsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "find_email",
    description: "Find a business email address from a person's name and company website or A-Leads document ID.",
    inputSchema: findEmailInputSchema,
    outputSchema: s.object(
      {
        message,
        response: emailFinderResponse,
        raw: rawPayload,
      },
      {
        required: ["message", "response", "raw"],
        description: "A-Leads business email lookup response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "find_personal_email",
    description: "Find a personal email address from a LinkedIn username or profile URL.",
    inputSchema: s.object(
      {
        linkedin_username: nonEmptyString("LinkedIn profile URL or username of the person."),
        request_uuid: requestUuid,
      },
      {
        required: ["linkedin_username"],
        description: "Input parameters for finding a personal email with A-Leads.",
      },
    ),
    outputSchema: s.object(
      {
        message,
        personal_email: s.nullable(s.string({ description: "Personal email address found by A-Leads." })),
        raw: rawPayload,
      },
      {
        required: ["message", "personal_email", "raw"],
        description: "A-Leads personal email lookup response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "find_phone",
    description: "Find a phone number from a LinkedIn username or profile URL.",
    inputSchema: s.object(
      {
        linkedin_username: nonEmptyString("LinkedIn profile URL or username of the person."),
        request_uuid: requestUuid,
      },
      {
        required: ["linkedin_username"],
        description: "Input parameters for finding a phone number with A-Leads.",
      },
    ),
    outputSchema: s.object(
      {
        message,
        phone_number: s.nullable(s.string({ description: "Phone number found by A-Leads." })),
        raw: rawPayload,
      },
      {
        required: ["message", "phone_number", "raw"],
        description: "A-Leads phone lookup response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify an email address and return deliverability signals from A-Leads.",
    inputSchema: s.object(
      {
        email: s.email("Email address to verify."),
      },
      {
        required: ["email"],
        description: "Input parameters for verifying an email address with A-Leads.",
      },
    ),
    outputSchema: s.object(
      {
        message,
        response: verificationResponse,
        raw: rawPayload,
      },
      {
        required: ["message", "response", "raw"],
        description: "A-Leads email verification response.",
      },
    ),
  }),
];
