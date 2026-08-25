import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "interzoid";

const responseCodeSchema = s.string("The Interzoid response code, such as Success.");
const creditsSchema = s.nullable(s.integer("The remaining Interzoid API credits after the request when available."));
const messageSchema = s.nullable(s.string("The provider message when Interzoid returns one."));
const rawSchema = s.looseObject("The raw response object returned by Interzoid.");

const baseResponseProperties = {
  code: responseCodeSchema,
  credits: creditsSchema,
  message: messageSchema,
  raw: rawSchema,
};

const companyAlgorithmSchema = s.stringEnum(
  "The Interzoid company matching algorithm used to generate the similarity key.",
  ["wide", "narrow", "model-v4-wide", "model-v4-narrow"],
);

export const interzoidActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company_match_key",
    description: "Generate an Interzoid similarity key for a company or organization name.",
    inputSchema: s.object("The input payload for generating a company similarity key.", {
      company: s.nonEmptyString("The company or organization name to generate a similarity key for."),
      algorithm: companyAlgorithmSchema,
    }),
    outputSchema: s.object("The normalized Interzoid company match response.", {
      ...baseResponseProperties,
      simKey: s.nullable(s.string("The generated similarity key for the company name.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_full_name_match_key",
    description: "Generate an Interzoid similarity key for a person's full name.",
    inputSchema: s.object("The input payload for generating a full-name similarity key.", {
      fullName: s.nonEmptyString("The full name to generate a similarity key for."),
    }),
    outputSchema: s.object("The normalized Interzoid full-name match response.", {
      ...baseResponseProperties,
      simKey: s.nullable(s.string("The generated similarity key for the full name.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_full_name_match_score",
    description: "Score how closely two full names match according to Interzoid.",
    inputSchema: s.object("The input payload for scoring two full names.", {
      fullName1: s.nonEmptyString("The first full name to compare."),
      fullName2: s.nonEmptyString("The second full name to compare."),
    }),
    outputSchema: s.object("The normalized Interzoid full-name score response.", {
      ...baseResponseProperties,
      score: s.nullable(s.integer("The Interzoid similarity score for the two full names.")),
    }),
  }),
  defineProviderAction(service, {
    name: "standardize_organization_name",
    description: "Standardize an organization name using Interzoid.",
    inputSchema: s.object("The input payload for standardizing an organization name.", {
      organization: s.nonEmptyString("The organization name to standardize."),
    }),
    outputSchema: s.object("The normalized Interzoid organization standardization response.", {
      ...baseResponseProperties,
      standard: s.nullable(s.string("The standardized organization name returned by Interzoid.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_email_info",
    description: "Validate and enrich an email address with Interzoid.",
    inputSchema: s.object("The input payload for retrieving Interzoid email information.", {
      email: s.email("The email address to validate and enrich."),
    }),
    outputSchema: s.object("The normalized Interzoid email information response.", {
      ...baseResponseProperties,
      email: s.nullable(s.string("The email address returned by Interzoid.")),
      response: s.nullable(s.string("The Interzoid validation response for the email address.")),
      info: s.nullable(s.string("Additional Interzoid validation information.")),
      domain: s.nullable(s.string("The domain part of the email address.")),
      organization: s.nullable(s.string("The organization associated with the email domain.")),
      geolocation: s.nullable(s.string("The geolocation associated with the email domain.")),
      domainOwner: s.nullable(s.string("The domain owner returned by Interzoid.")),
      isDisposable: s.nullable(s.string("Whether Interzoid marks the email domain as disposable.")),
      isGeneric: s.nullable(s.string("Whether Interzoid marks the email address as generic.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_ip_profile",
    description: "Retrieve Interzoid profile and reputation information for an IP address.",
    inputSchema: s.object("The input payload for retrieving an Interzoid IP profile.", {
      ip: s.nonEmptyString("The IPv4 or IPv6 address to profile with Interzoid."),
    }),
    outputSchema: s.object("The normalized Interzoid IP profile response.", {
      ...baseResponseProperties,
      version: s.nullable(s.string("The IP protocol version returned by Interzoid.")),
      cidr: s.nullable(s.string("The CIDR block associated with the IP address.")),
      asn: s.nullable(s.string("The autonomous system number for the IP address.")),
      hostname: s.nullable(s.string("The reverse DNS hostname for the IP address.")),
      organization: s.nullable(s.string("The organization or ISP for the IP address.")),
      geolocation: s.nullable(s.string("The geolocation string returned by Interzoid.")),
      reputation: s.nullable(s.string("The reputation assessment returned by Interzoid.")),
      abuseContact: s.nullable(s.string("The abuse contact returned by Interzoid.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_remaining_credits",
    description: "Return the remaining credits for the connected Interzoid API license key.",
    inputSchema: s.object("The input payload for retrieving Interzoid remaining credits.", {}),
    outputSchema: s.object("The normalized Interzoid remaining credits response.", {
      code: responseCodeSchema,
      credits: creditsSchema,
      message: messageSchema,
      raw: rawSchema,
    }),
  }),
];
