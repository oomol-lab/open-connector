import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "geocodio";

const looseObjectSchema = s.record(
  "A JSON-like object with arbitrary string keys.",
  s.unknown("A property value in a JSON-like object."),
);

const locationSchema = s.looseRequiredObject("Latitude and longitude returned by Geocodio.", {
  lat: s.number("The latitude coordinate."),
  lng: s.number("The longitude coordinate."),
});

const geocodeResultSchema = s.looseObject("A single Geocodio geocoding result.", {
  formatted_address: s.string("The full formatted address."),
  location: locationSchema,
  accuracy: s.number("The match accuracy score from 0.0 to 1.0."),
  accuracy_type: s.string("The Geocodio accuracy type for the match."),
  source: s.string("The source dataset for the match."),
  address_components: looseObjectSchema,
  address_lines: s.array("Formatted address lines.", s.string("One formatted address line.")),
  fields: looseObjectSchema,
});

const singleResponseSchema = s.looseObject("The Geocodio response for a single geocode or reverse geocode request.", {
  input: looseObjectSchema,
  results: s.array("The ordered geocoding match results.", geocodeResultSchema),
  lat: s.number("The latitude returned by Geocodio simple format."),
  lng: s.number("The longitude returned by Geocodio simple format."),
  address: s.string("The address returned by Geocodio simple format."),
  source: s.string("The source returned by Geocodio simple format."),
});

const batchResultSchema = s.looseRequiredObject("One batch geocoding or reverse geocoding result.", {
  query: s.string("The original query string from the batch request."),
  response: looseObjectSchema,
});

const batchResponseSchema = s.requiredObject("The Geocodio response for a batch geocoding request.", {
  results: s.array("The ordered batch response items.", batchResultSchema),
});

const optionalAddressString = (description: string): JsonSchema => s.nonEmptyString(description);
const nonNegativeInteger = (description: string): JsonSchema => s.nonNegativeInteger(description);

export const geocodioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "single_geocode",
    description: "Geocode a single address and return the official Geocodio response payload.",
    inputSchema: s.actionInput(
      {
        q: optionalAddressString("The full address string to geocode."),
        street: optionalAddressString("The street address component."),
        street2: optionalAddressString("The secondary street address component."),
        city: optionalAddressString("The city name used for the lookup."),
        state: optionalAddressString("The state or province code used for the lookup."),
        postal_code: optionalAddressString("The postal or ZIP code used for the lookup."),
        country: optionalAddressString("The country context for the lookup."),
        county: optionalAddressString("The county name used for the lookup."),
        fields: optionalAddressString("A comma-separated list of Geocodio data append codes."),
        limit: nonNegativeInteger("The maximum number of results to return."),
        format: s.literal("simple", { description: "Return Geocodio's simplified single-result response format." }),
      },
      [],
      "The input payload for geocoding a single address with Geocodio.",
    ),
    outputSchema: singleResponseSchema,
  }),
  defineProviderAction(service, {
    name: "geocode_batch",
    description: "Geocode multiple addresses in one batch request and return Geocodio batch results.",
    inputSchema: s.actionInput(
      {
        addresses: s.array(
          "The address strings to geocode in one batch request.",
          optionalAddressString("One address string to geocode."),
          {
            minItems: 1,
            maxItems: 10_000,
          },
        ),
        fields: optionalAddressString("A comma-separated list of Geocodio data append codes."),
        limit: nonNegativeInteger("The maximum number of results per address."),
      },
      ["addresses"],
      "The input payload for batch geocoding addresses with Geocodio.",
    ),
    outputSchema: batchResponseSchema,
  }),
  defineProviderAction(service, {
    name: "single_reverse_geocode",
    description:
      "Reverse geocode a single latitude and longitude pair and return the official Geocodio response payload.",
    inputSchema: s.actionInput(
      {
        lat: s.number("The latitude to reverse geocode.", { minimum: -90, maximum: 90 }),
        lng: s.number("The longitude to reverse geocode.", { minimum: -180, maximum: 180 }),
        fields: optionalAddressString("A comma-separated list of Geocodio data append codes."),
        limit: nonNegativeInteger("The maximum number of results to return."),
        format: s.literal("simple", { description: "Return Geocodio's simplified single-result response format." }),
      },
      ["lat", "lng"],
      "The input payload for reverse geocoding a single latitude and longitude pair.",
    ),
    outputSchema: singleResponseSchema,
  }),
  defineProviderAction(service, {
    name: "batch_reverse_geocode",
    description: "Reverse geocode multiple coordinate pairs in one batch request and return Geocodio batch results.",
    inputSchema: s.actionInput(
      {
        coordinates: s.array(
          "The coordinate strings to reverse geocode in one batch request.",
          optionalAddressString("One `latitude,longitude` coordinate string."),
          {
            minItems: 1,
            maxItems: 10_000,
          },
        ),
        fields: optionalAddressString("A comma-separated list of Geocodio data append codes."),
        limit: nonNegativeInteger("The maximum number of results per coordinate."),
      },
      ["coordinates"],
      "The input payload for batch reverse geocoding coordinate pairs with Geocodio.",
    ),
    outputSchema: batchResponseSchema,
  }),
];
