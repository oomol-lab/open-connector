import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vatlayer";

const countrySelectorInput = {
  countryCode: s.string("Two-letter ISO country code to select country VAT rates.", { minLength: 2, maxLength: 2 }),
  ipAddress: s.nonEmptyString("Custom IP address to use to geolocate a country for VAT rate lookup."),
  useClientIp: s.boolean("Whether vatlayer should use the requester's IP address to determine the country."),
};

const reducedRatesSchema = s.record(
  "Mapping of reduced VAT rate type names to VAT percentages.",
  s.number("VAT rate percentage for the reduced rate type."),
);

const rateInfoSchema = s.looseObject("VAT rate details for one country.", {
  country_name: s.string("Full country name."),
  standard_rate: s.number("Standard VAT rate in percent."),
  reduced_rates: reducedRatesSchema,
});

const getRateInputSchema = s.actionInput(
  countrySelectorInput,
  [],
  "Input parameters for retrieving VAT rates for one country with vatlayer.",
);

export const vatlayerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_vat_number",
    description: "Validate a VAT number and return company information when vatlayer finds it.",
    inputSchema: s.actionInput(
      {
        vatNumber: s.nonEmptyString("VAT number to validate, including the country prefix when available."),
      },
      ["vatNumber"],
      "Input parameters for validating a VAT number with vatlayer.",
    ),
    outputSchema: s.looseRequiredObject("VAT number validation response returned by vatlayer.", {
      valid: s.boolean("Whether the VAT number is valid and active according to official member state records."),
      database: s.string("Whether the member state's VAT database was reachable."),
      format_valid: s.boolean("Whether the supplied VAT number has a syntactically valid format."),
      query: s.string("The original VAT number string passed to vatlayer."),
      country_code: s.string("Two-letter country code parsed from the VAT number."),
      vat_number: s.string("VAT number without the two-letter country prefix."),
      company_name: s.nullableString("Company name associated with the VAT number."),
      company_address: s.nullableString("Company address associated with the VAT number."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_rate",
    description: "Retrieve VAT rates for one country selected by country code, IP address, or client IP.",
    inputSchema: getRateInputSchema,
    outputSchema: s.looseRequiredObject("Single-country VAT rate response returned by vatlayer.", {
      success: s.boolean("Whether the VAT rate lookup succeeded."),
      country_code: s.string("Two-letter country code for which rates are returned."),
      country_name: s.string("Full country name."),
      standard_rate: s.number("Standard VAT rate in percent."),
      reduced_rates: reducedRatesSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_rates",
    description: "Retrieve VAT rates for all EU member states from vatlayer.",
    inputSchema: s.actionInput(
      {},
      [],
      "Input parameters for retrieving VAT rates for all EU member states with vatlayer.",
    ),
    outputSchema: s.looseRequiredObject("VAT rates for all EU member states returned by vatlayer.", {
      success: s.boolean("Whether the VAT rate list lookup succeeded."),
      rates: s.record("Mapping of two-letter country codes to VAT rate details.", rateInfoSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "calculate_price",
    description: "Calculate VAT-compliant inclusive and exclusive prices with vatlayer.",
    inputSchema: s.actionInput(
      {
        amount: s.number("Monetary amount to convert.", { exclusiveMinimum: 0 }),
        type: s.nonEmptyString("Reduced VAT type to apply, such as medical or books."),
        incl: s.boolean("Whether the amount already includes VAT and should be reverse-calculated."),
        ...countrySelectorInput,
      },
      ["amount"],
      "Input parameters for calculating VAT-compliant prices with vatlayer.",
    ),
    outputSchema: s.looseRequiredObject("VAT-compliant price calculation result returned by vatlayer.", {
      success: s.boolean("Whether the VAT price calculation succeeded."),
      country_code: s.string("Country code used for the calculation."),
      country_name: s.string("Country name used for the calculation."),
      price_excl_vat: s.number("Price excluding VAT."),
      price_incl_vat: s.number("Price including VAT."),
      vat_rate: s.number("VAT rate in percent applied during the calculation."),
      type: s.nullableString("Reduced VAT type used for the calculation."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_types",
    description: "List vatlayer reduced VAT rate type identifiers for price calculations.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing vatlayer reduced VAT rate types."),
    outputSchema: s.looseRequiredObject("Reduced VAT rate types returned by vatlayer.", {
      success: s.boolean("Whether the reduced VAT type list lookup succeeded."),
      types: s.array("Available reduced VAT rate type identifiers.", s.string("Reduced VAT rate type identifier.")),
    }),
  }),
];
