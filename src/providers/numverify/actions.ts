import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
export const numverifyActions: ActionDefinition[] = [
  defineProviderAction("numverify", {
    name: "validate_phone_number",
    operationType: "read",
    description: "Validate a phone number and look up its country, carrier and line type.",
    requiredScopes: [],
    inputSchema: s.object(
      "Phone number validation parameters.",
      {
        number: s.string("Phone number in international or national format.", { minLength: 1 }),
        country_code: s.string(
          "Two-letter country code required for national numbers; omit for international numbers.",
          { minLength: 2, maxLength: 2 },
        ),
      },
      {
        optional: ["country_code"],
      },
    ),
    outputSchema: s.object(
      "Phone number validation result; enrichment may be absent for invalid numbers.",
      {
        valid: s.boolean("Whether the phone number is valid."),
        number: s.string("Phone number returned by Numverify."),
        local_format: s.string("National representation of the phone number."),
        international_format: s.string("International representation of the phone number."),
        country_prefix: s.string("International country dialing prefix."),
        country_code: s.string("Two-letter country code."),
        country_name: s.string("Full country name."),
        location: s.nullable(s.string("City, state or county, when available.")),
        carrier: s.nullable(s.string("Carrier name, when available.")),
        line_type: s.nullable(s.string("Phone line type, such as mobile or landline.")),
      },
      {
        additionalProperties: true,
        required: ["valid"],
      },
    ),
  }),
  defineProviderAction("numverify", {
    name: "list_countries",
    operationType: "read",
    description: "List supported countries and their international dialing codes.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Supported country lookup parameters.", {}),
    outputSchema: s.requiredObject("Supported country lookup result.", {
      countries: s.record(
        "Supported countries keyed by country code.",
        s.looseObject("Country name and dialing code.", {
          country_name: s.string("Full country name."),
          dialling_code: s.string("International dialing code."),
        }),
      ),
    }),
  }),
];
