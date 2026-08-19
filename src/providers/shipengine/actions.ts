import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shipengine";

const seIdSchema = s.string("The ShipEngine resource identifier.", {
  minLength: 1,
  pattern: "\\S",
});
const countryCodeSchema = s.string("The ISO 3166-1 alpha-2 country code for the address.", {
  minLength: 2,
  maxLength: 2,
});
const addressResidentialIndicatorSchema = s.stringEnum("Whether ShipEngine should treat the address as residential.", [
  "unknown",
  "yes",
  "no",
]);

const addressSchema = s.object(
  "A ShipEngine address object.",
  {
    name: s.nonEmptyString("The recipient or contact name for the address."),
    phone: s.nonEmptyString("The phone number associated with the address."),
    companyName: s.nonEmptyString("The company name associated with the address."),
    addressLine1: s.nonEmptyString("The first address line."),
    addressLine2: s.nonEmptyString("The second address line."),
    addressLine3: s.nonEmptyString("The third address line."),
    cityLocality: s.nonEmptyString("The city or locality for the address."),
    stateProvince: s.nonEmptyString("The state, province, or region for the address."),
    postalCode: s.nonEmptyString("The postal or ZIP code for the address."),
    countryCode: countryCodeSchema,
    addressResidentialIndicator: addressResidentialIndicatorSchema,
  },
  {
    optional: ["name", "phone", "companyName", "addressLine2", "addressLine3", "addressResidentialIndicator"],
  },
);

const partialAddressSchema = s.object(
  "Optional known ShipEngine address fields to help parse unstructured text.",
  {
    name: s.nonEmptyString("The known recipient or contact name for the address."),
    phone: s.nonEmptyString("The known phone number associated with the address."),
    companyName: s.nonEmptyString("The known company name associated with the address."),
    addressLine1: s.nonEmptyString("The known first address line."),
    addressLine2: s.nonEmptyString("The known second address line."),
    addressLine3: s.nonEmptyString("The known third address line."),
    cityLocality: s.nonEmptyString("The known city or locality for the address."),
    stateProvince: s.nonEmptyString("The known state, province, or region for the address."),
    postalCode: s.nonEmptyString("The known postal or ZIP code for the address."),
    countryCode: countryCodeSchema,
    addressResidentialIndicator: addressResidentialIndicatorSchema,
  },
  {
    optional: [
      "name",
      "phone",
      "companyName",
      "addressLine1",
      "addressLine2",
      "addressLine3",
      "cityLocality",
      "stateProvince",
      "postalCode",
      "countryCode",
      "addressResidentialIndicator",
    ],
  },
);

const rawObjectSchema = s.looseObject("The raw object returned by ShipEngine.");

export const shipengineActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_addresses",
    description: "Validate one or more mailing addresses with ShipEngine and return deliverability details.",
    inputSchema: s.object("The input payload for validating ShipEngine addresses.", {
      addresses: s.array("The addresses to validate.", addressSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("The response returned when validating ShipEngine addresses.", {
      addresses: s.array("The validated address results returned by ShipEngine.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "parse_address",
    description: "Parse unstructured text into a structured ShipEngine address.",
    inputSchema: s.object(
      "The input payload for parsing a ShipEngine address.",
      {
        text: s.nonEmptyString("The unstructured text that contains address information."),
        address: partialAddressSchema,
      },
      { optional: ["address"] },
    ),
    outputSchema: s.object("The response returned when parsing a ShipEngine address.", {
      parsedAddress: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_carriers",
    description: "List carrier accounts connected to the ShipEngine account.",
    inputSchema: s.object("The input payload for listing ShipEngine carriers.", {}),
    outputSchema: s.object("The response returned when listing ShipEngine carriers.", {
      carriers: s.array("The carrier accounts returned by ShipEngine.", rawObjectSchema),
      errors: s.array("Partial-success errors returned by ShipEngine when present.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_rate",
    description: "Retrieve a previously queried ShipEngine rate by ID.",
    inputSchema: s.object("The input payload for retrieving a ShipEngine rate.", {
      rateId: seIdSchema,
    }),
    outputSchema: s.object("The response returned when retrieving a ShipEngine rate.", {
      rate: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "calculate_rates",
    description: "Calculate shipping rates for a shipment request using connected ShipEngine carriers.",
    inputSchema: s.looseRequiredObject("The ShipEngine calculate rates request body.", {
      rateOptions: s.looseObject("The rate_options object passed to ShipEngine."),
      shipment: s.looseObject("The shipment object passed to ShipEngine."),
    }),
    outputSchema: s.object("The response returned when calculating ShipEngine rates.", {
      rateResponse: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "estimate_rates",
    description: "Estimate shipping rates with basic address and package information.",
    inputSchema: s.looseRequiredObject("The ShipEngine estimate rates request body.", {
      carrierIds: s.array("The ShipEngine carrier IDs to use for the estimate.", seIdSchema, { minItems: 1 }),
      fromCountryCode: countryCodeSchema,
      fromPostalCode: s.nonEmptyString("The origin postal code for the estimate."),
      toCountryCode: countryCodeSchema,
      toPostalCode: s.nonEmptyString("The destination postal code for the estimate."),
      weight: s.looseObject("The package weight object passed to ShipEngine."),
    }),
    outputSchema: s.object("The response returned when estimating ShipEngine rates.", {
      rates: s.array("The estimated rates returned by ShipEngine.", rawObjectSchema),
    }),
  }),
];
