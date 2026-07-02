import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "veriphone";

const uppercaseCountryCodeSchema = s.string(
  "The optional ISO 3166-1 alpha-2 country code used to interpret local numbers.",
  { minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$" },
);

const getCreditsOutputSchema = s.object(
  "The current credit summary returned by Veriphone.",
  {
    status: s.string("The response status returned by Veriphone."),
    credits: s.integer("The remaining verification credits on the account."),
    total_verified_phone_numbers: s.integer("The cumulative number of verified phone numbers on the account."),
    active: s.boolean("Whether the Veriphone account is active."),
    email: s.string("The account email returned by Veriphone."),
    country: s.string("The account country returned by Veriphone."),
    counter: s.integer("The account counter value returned by Veriphone."),
  },
  { optional: ["total_verified_phone_numbers", "active", "email", "country", "counter"] },
);

const verifyPhoneNumberInputSchema = s.object(
  "The input payload for verifying a phone number with Veriphone.",
  {
    phone: s.nonEmptyString("The phone number to verify in E.164 or another commonly used format."),
    default_country: uppercaseCountryCodeSchema,
  },
  { optional: ["default_country"] },
);

const verifyPhoneNumberOutputSchema = s.object(
  "The phone verification result returned by Veriphone.",
  {
    status: s.string("The response status returned by Veriphone."),
    phone: s.string("The phone number echoed back by Veriphone."),
    phone_valid: s.boolean("Whether Veriphone considers the phone number valid."),
    phone_type: s.string("The detected line type, such as mobile or landline."),
    phone_region: s.string("The detected region or area associated with the phone number."),
    country: s.string("The detected country name."),
    country_code: s.string("The detected ISO 3166-1 alpha-2 country code."),
    country_prefix: s.string("The detected country calling prefix."),
    international_number: s.string("The international presentation of the phone number."),
    local_number: s.string("The local significant number."),
    e164: s.string("The E.164 representation of the phone number."),
    carrier: s.string("The detected carrier name, when available."),
  },
  {
    optional: [
      "phone_type",
      "phone_region",
      "country",
      "country_code",
      "country_prefix",
      "international_number",
      "local_number",
      "e164",
      "carrier",
    ],
  },
);

export type VeriphoneActionName = "get_credits" | "verify_phone_number";

export const veriphoneActions: ProviderActionDefinition<VeriphoneActionName>[] = [
  defineProviderAction(service, {
    name: "get_credits",
    description: "Retrieve the current Veriphone verification credit summary for the account.",
    inputSchema: s.object("The input payload for retrieving the current Veriphone credit summary.", {}),
    outputSchema: getCreditsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_phone_number",
    description: "Verify whether a phone number is valid and return its carrier and region data.",
    inputSchema: verifyPhoneNumberInputSchema,
    outputSchema: verifyPhoneNumberOutputSchema,
  }),
];
