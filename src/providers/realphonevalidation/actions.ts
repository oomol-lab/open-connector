import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "realphonevalidation";

const tenDigitPhoneSchema = s.string({
  description: "The 10-digit US phone number to validate, using numeric digits only.",
  pattern: "^\\d{10}$",
});
const validationStatusSchema = s.string(
  "The line status returned by RealPhoneValidation, such as connected, disconnected, busy, or pending.",
);
const errorTextSchema = s.nullableString(
  "The upstream error text returned by RealPhoneValidation when the request was not a normal validation success.",
);
const phoneTypeSchema = s.nullableString(
  "The detected phone type returned by RealPhoneValidation, such as Mobile, Landline, or VoIP.",
);

export const realPhoneValidationActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_phone_standard",
    description: "Validate one 10-digit phone number with the RealPhoneValidation Turbo Standard endpoint.",
    inputSchema: s.object("The input payload for the Turbo Standard phone validation request.", {
      phone: tenDigitPhoneSchema,
    }),
    outputSchema: s.object("The normalized Turbo Standard validation result returned by RealPhoneValidation.", {
      status: validationStatusSchema,
      error_text: errorTextSchema,
      phone_type: phoneTypeSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "validate_phone_v3",
    description:
      "Validate one 10-digit phone number with the RealPhoneValidation Turbo v3 endpoint and return caller enrichment fields when available.",
    inputSchema: s.object("The input payload for the Turbo v3 phone validation request.", {
      phone: tenDigitPhoneSchema,
    }),
    outputSchema: s.object("The normalized Turbo v3 validation result returned by RealPhoneValidation.", {
      status: validationStatusSchema,
      error_text: errorTextSchema,
      phone_type: phoneTypeSchema,
      caller_name: s.nullableString("The subscriber name returned by RealPhoneValidation when available."),
      carrier: s.nullableString("The carrier or service provider returned by RealPhoneValidation when available."),
      caller_type: s.nullableString("The caller type returned by RealPhoneValidation, such as Consumer or Business."),
    }),
  }),
];
