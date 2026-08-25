import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "positionstack";

const fieldsSchema = s.stringArray(
  "Optional response field paths to include, such as results.latitude or results.longitude.",
  {
    minItems: 1,
    itemDescription: "A Positionstack response field path.",
  },
);

const commonGeocodeInput = {
  query: s.nonEmptyString("The address, place, latitude/longitude pair, or IP address to geocode."),
  country: s.nonEmptyString("Comma-separated 2- or 3-letter country codes used to restrict results."),
  region: s.nonEmptyString("Region filter such as a state, county, or city name."),
  language: s.nonEmptyString("Preferred response language code, such as en or de."),
  limit: s.integer("Maximum number of results to return, from 1 to 80.", {
    minimum: 1,
    maximum: 80,
  }),
  fields: fieldsSchema,
  country_module: s.boolean("Whether to include extended country metadata in each result."),
  sun_module: s.boolean("Whether to include sunrise, sunset, and solar metadata in each result."),
  timezone_module: s.boolean("Whether to include timezone metadata in each result."),
  bbox_module: s.boolean("Whether to include bounding box coordinates in each result."),
};

const commonOptionalInputFields = [
  "country",
  "region",
  "language",
  "limit",
  "fields",
  "country_module",
  "sun_module",
  "timezone_module",
  "bbox_module",
];

const forwardGeocodeInputSchema = s.object(
  "Input parameters for converting an address or place into Positionstack geocoding results.",
  commonGeocodeInput,
  { optional: commonOptionalInputFields },
);

const reverseGeocodeInputSchema = s.object(
  "Input parameters for converting coordinates or an IP address into Positionstack geocoding results.",
  {
    ...commonGeocodeInput,
    query: s.nonEmptyString(
      "Latitude and longitude formatted as latitude,longitude, or an IP address to reverse geocode.",
    ),
  },
  { optional: commonOptionalInputFields },
);

const looseObjectSchema = s.record(
  "A JSON object returned by Positionstack with provider-defined fields.",
  s.unknown("A provider-defined JSON value."),
);

const resultSchema = s.looseObject("A single Positionstack geocoding result.", {
  latitude: s.number("Latitude in decimal degrees."),
  longitude: s.number("Longitude in decimal degrees."),
  label: s.string("Formatted address or place label."),
  name: s.string("Name portion of the result."),
  type: s.string("Result classification, such as address, venue, street, region, or country."),
  number: s.nullableString("House or street number when available."),
  street: s.nullableString("Street name when available."),
  postal_code: s.nullableString("Postal or ZIP code when available."),
  confidence: s.number("Confidence score from 0 to 1."),
  region: s.nullableString("Region, state, or province name."),
  region_code: s.nullableString("Short region code when available."),
  administrative_area: s.nullableString("Administrative area such as county or district."),
  neighbourhood: s.nullableString("Neighbourhood name when available."),
  country: s.nullableString("Country name."),
  country_code: s.nullableString("ISO 3166 alpha-2 country code."),
  map_url: s.nullable(s.url("Embeddable Positionstack map URL for this location.")),
  distance: s.nullableNumber("Distance in meters from the requested coordinate."),
  bbox_module: looseObjectSchema,
  country_module: looseObjectSchema,
  timezone_module: looseObjectSchema,
  sun_module: looseObjectSchema,
});

const dataObjectSchema = s.looseRequiredObject(
  "Positionstack geocoding data wrapper.",
  {
    request: s.looseObject("Echoed request parameters returned by Positionstack.", {
      query: s.string("The original query string."),
      limit: s.integer("The requested result limit."),
    }),
    results: s.array("The ordered geocoding results returned by Positionstack.", resultSchema),
  },
  { optional: ["request"] },
);

const geocodeResponseSchema = s.looseRequiredObject(
  "The Positionstack response payload for a single geocoding request.",
  {
    data: dataObjectSchema,
  },
);

export const positionstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "forward_geocode",
    description: "Convert an address or place query into Positionstack geocoding results.",
    inputSchema: forwardGeocodeInputSchema,
    outputSchema: geocodeResponseSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Convert coordinates or an IP address into Positionstack reverse geocoding results.",
    inputSchema: reverseGeocodeInputSchema,
    outputSchema: geocodeResponseSchema,
  }),
];
