import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zipcodebase";

const postalCodeSchema = s.nonEmptyString("The postal code to query.");
const postalCodesSchema = s.array(
  "The postal codes to query.",
  s.nonEmptyString("A postal code to include in the request."),
  {
    minItems: 1,
  },
);
const countrySchema = s.string("The ISO 3166-1 alpha-2 country code, such as us or nl.", {
  minLength: 2,
  maxLength: 2,
});
const optionalCountrySchema = s.string("Optional ISO 3166-1 alpha-2 country code used to narrow the request.", {
  minLength: 2,
  maxLength: 2,
});
const distanceUnitSchema = s.stringEnum("Optional distance unit returned by Zipcodebase.", ["km", "mile"]);
const positiveNumberSchema = s.number("The positive distance or radius value.", {
  exclusiveMinimum: 0,
});
const citySchema = s.nonEmptyString("The city name to search for.");
const stateNameSchema = s.nonEmptyString("The state or province name to search for.");

const postalCodeRecordSchema = s.looseObject("A postal code record returned by Zipcodebase.", {
  code: s.string("The postal code."),
  city: s.nullableString("The city name associated with the postal code."),
  state: s.nullableString("The state or region associated with the postal code."),
  country: s.string("The country code associated with the postal code."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
});

const distanceRecordSchema = s.looseObject("A distance result returned by Zipcodebase.", {
  code: s.string("The compared postal code."),
  distance: s.number("The distance from the origin postal code."),
});

export const zipcodebaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_status",
    description: "Return Zipcodebase account status and remaining request credits.",
    inputSchema: s.object("The input payload for checking Zipcodebase account status.", {}),
    outputSchema: s.looseObject("The status payload returned by Zipcodebase.", {
      requests_remaining: s.integer("The number of remaining requests reported by Zipcodebase."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_postal_codes",
    description: "Look up location information for one or more postal codes.",
    inputSchema: s.object(
      "The input payload for looking up postal code location information.",
      {
        codes: postalCodesSchema,
        country: optionalCountrySchema,
      },
      { optional: ["country"] },
    ),
    outputSchema: s.looseObject("The postal code search payload returned by Zipcodebase.", {
      results: s.record("Postal code records keyed by submitted code.", postalCodeRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "calculate_distance",
    description: "Calculate distance from one postal code to one or more comparison postal codes.",
    inputSchema: s.object(
      "The input payload for calculating postal code distances.",
      {
        code: postalCodeSchema,
        compare: postalCodesSchema,
        country: countrySchema,
        unit: distanceUnitSchema,
      },
      { optional: ["unit"] },
    ),
    outputSchema: s.looseObject("The distance payload returned by Zipcodebase.", {
      results: s.array("The distance results returned by Zipcodebase.", distanceRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_postal_codes_within_radius",
    description: "List postal codes located within a radius of a postal code.",
    inputSchema: s.object(
      "The input payload for finding postal codes within a radius.",
      {
        code: postalCodeSchema,
        radius: positiveNumberSchema,
        country: countrySchema,
        unit: distanceUnitSchema,
      },
      { optional: ["unit"] },
    ),
    outputSchema: s.looseObject("The radius search payload returned by Zipcodebase.", {
      results: s.array("The postal codes found within the requested radius.", postalCodeRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "match_postal_codes_by_distance",
    description: "Find submitted postal code pairs that are within a given distance.",
    inputSchema: s.object(
      "The input payload for matching postal codes by distance.",
      {
        codes: postalCodesSchema,
        distance: positiveNumberSchema,
        country: countrySchema,
        unit: distanceUnitSchema,
      },
      { optional: ["unit"] },
    ),
    outputSchema: s.looseObject("The postal code match payload returned by Zipcodebase.", {
      results: s.array(
        "The postal code pairs within the requested distance.",
        s.looseObject("A postal code match result."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_postal_codes_by_city",
    description: "List postal codes associated with a city and optional state or province.",
    inputSchema: s.object(
      "The input payload for listing postal codes by city.",
      {
        city: citySchema,
        country: countrySchema,
        state_name: stateNameSchema,
      },
      { optional: ["state_name"] },
    ),
    outputSchema: s.looseObject("The city lookup payload returned by Zipcodebase.", {
      results: s.array("The postal codes returned for the city.", postalCodeRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_postal_codes_by_state",
    description: "List postal codes associated with a state or province.",
    inputSchema: s.object("The input payload for listing postal codes by state.", {
      state_name: stateNameSchema,
      country: countrySchema,
    }),
    outputSchema: s.looseObject("The state lookup payload returned by Zipcodebase.", {
      results: s.array("The postal codes returned for the state.", postalCodeRecordSchema),
    }),
  }),
];
