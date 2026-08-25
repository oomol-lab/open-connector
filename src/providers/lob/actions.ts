import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lob";

const primaryLineField = s.nonEmptyString("The primary street address line.");
const secondaryLineField = s.nonEmptyString("The secondary address line, such as an apartment, suite, or unit.");
const cityField = s.nonEmptyString("The city name for the address.");
const stateField = s.nonEmptyString("The US state or region for the address.");
const zipCodeField = s.nonEmptyString("The US ZIP or ZIP+4 code for the address.");
const postalCodeField = s.nonEmptyString("The postal code for an international address.");
const recipientField = s.nonEmptyString("The recipient name associated with the address.");
const countryField = s.nonEmptyString("The destination country code or country name.");

const usVerificationInputSchema = s.object(
  "Input for verifying one US address with Lob.",
  {
    primary_line: primaryLineField,
    secondary_line: secondaryLineField,
    city: cityField,
    state: stateField,
    zip_code: zipCodeField,
    recipient: recipientField,
  },
  { required: ["primary_line"], optional: ["secondary_line", "city", "state", "zip_code", "recipient"] },
);

const internationalVerificationInputSchema = s.object(
  "Input for verifying one international address with Lob.",
  {
    primary_line: primaryLineField,
    secondary_line: secondaryLineField,
    city: cityField,
    state: stateField,
    postal_code: postalCodeField,
    country: countryField,
    recipient: recipientField,
  },
  { required: ["primary_line", "country"], optional: ["secondary_line", "city", "state", "postal_code", "recipient"] },
);

const autocompleteInputSchema = s.object(
  "Input for retrieving Lob US address autocompletion suggestions.",
  {
    address_prefix: s.nonEmptyString("The beginning of the US address to autocomplete."),
    city: cityField,
    state: stateField,
    zip_code: zipCodeField,
    geo_ip_sort: s.boolean("Whether Lob should sort suggestions based on the request origin's IP geolocation."),
  },
  { required: ["address_prefix"], optional: ["city", "state", "zip_code", "geo_ip_sort"] },
);

const verificationSchema = s.looseObject("A Lob address verification object.");
const suggestionSchema = s.looseObject("A Lob US address autocomplete suggestion.");

export const lobActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_us_address",
    description: "Verify and standardize one US address with Lob Address Verification.",
    inputSchema: usVerificationInputSchema,
    outputSchema: s.object("The normalized Lob US address verification result.", {
      verification: verificationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "bulk_verify_us_addresses",
    description: "Verify and standardize multiple US addresses with Lob Address Verification.",
    inputSchema: s.object("Input for verifying multiple US addresses with Lob.", {
      addresses: s.array("The US addresses to verify.", usVerificationInputSchema, { minItems: 1, maxItems: 100 }),
    }),
    outputSchema: s.object("The normalized Lob bulk US address verification result.", {
      verifications: s.array("The Lob US address verification objects.", verificationSchema),
      raw: s.looseObject("The raw Lob bulk verification response metadata."),
    }),
  }),
  defineProviderAction(service, {
    name: "autocomplete_us_addresses",
    description: "Return Lob US address autocomplete suggestions for a partial address.",
    inputSchema: autocompleteInputSchema,
    outputSchema: s.object("The normalized Lob US address autocomplete result.", {
      suggestions: s.array("The Lob US address autocomplete suggestions.", suggestionSchema),
      raw: s.looseObject("The raw Lob autocomplete response metadata."),
    }),
  }),
  defineProviderAction(service, {
    name: "verify_international_address",
    description: "Verify and standardize one international address with Lob Address Verification.",
    inputSchema: internationalVerificationInputSchema,
    outputSchema: s.object("The normalized Lob international address verification result.", {
      verification: verificationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "bulk_verify_international_addresses",
    description: "Verify and standardize multiple international addresses with Lob Address Verification.",
    inputSchema: s.object("Input for verifying multiple international addresses with Lob.", {
      addresses: s.array("The international addresses to verify.", internationalVerificationInputSchema, {
        minItems: 1,
        maxItems: 100,
      }),
    }),
    outputSchema: s.object("The normalized Lob bulk international verification result.", {
      verifications: s.array("The Lob international address verification objects.", verificationSchema),
      raw: s.looseObject("The raw Lob bulk international verification response metadata."),
    }),
  }),
];
