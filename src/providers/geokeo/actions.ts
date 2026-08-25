import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "geokeo";

const coordinatesSchema = s.looseRequiredObject("A latitude and longitude point returned by Geokeo.", {
  lat: s.nonEmptyString("Latitude in WGS 84 format returned by Geokeo."),
  lng: s.nonEmptyString("Longitude in WGS 84 format returned by Geokeo."),
});

const viewportSchema = s.looseRequiredObject("The viewport bounding box returned by Geokeo.", {
  northeast: { ...coordinatesSchema, description: "The northeast corner of the bounding box." },
  southwest: { ...coordinatesSchema, description: "The southwest corner of the bounding box." },
});

const geometrySchema = s.looseRequiredObject("Geometry metadata returned by Geokeo.", {
  location: { ...coordinatesSchema, description: "The centroid coordinates of the matched place." },
  viewport: { ...viewportSchema, description: "The bounding box of the matched place." },
});

const geokeoResultSchema = s.looseObject("A single Geokeo forward or reverse geocoding result.", {
  class: s.nonEmptyString("The OpenStreetMap class of the matched place."),
  type: s.nonEmptyString("The OpenStreetMap type of the matched place."),
  address_components: s.record(
    "Structured address components keyed by upstream field name.",
    s.unknown("One upstream address component value."),
  ),
  formatted_address: s.nonEmptyString("The formatted postal-style address returned by Geokeo."),
  geometry: { ...geometrySchema, description: "Geometry details for the matched place." },
  osmurl: s.nonEmptyString("OpenStreetMap URL for the matched coordinates."),
  distance: s.nonEmptyString("Distance from the reverse query coordinates in kilometers."),
});

const geokeoResponseSchema = s.object(
  "The JSON response payload returned by Geokeo geocoding endpoints.",
  {
    results: s.array("The ordered geocoding results returned by Geokeo.", {
      ...geokeoResultSchema,
      description: "One Geokeo result item.",
    }),
    credits: s.nonEmptyString("Credits URL returned by Geokeo."),
    status: s.nonEmptyString("Geokeo status string such as ok or ZERO_RESULTS."),
  },
  { required: ["status"] },
);

export const geokeoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "geocode_forward",
    description: "Convert an address or place query into Geokeo geocoding results.",
    inputSchema: s.actionInput(
      {
        q: s.nonEmptyString("Address or place query string to geocode."),
        country: s.string({
          description: "Optional ISO 3166-1 alpha-2 country code used to narrow the search.",
          minLength: 2,
          maxLength: 2,
        }),
      },
      ["q"],
      "Input parameters for forward geocoding an address or place with Geokeo.",
    ),
    outputSchema: geokeoResponseSchema,
  }),
  defineProviderAction(service, {
    name: "geocode_reverse",
    description: "Convert coordinates into Geokeo reverse geocoding results.",
    inputSchema: s.actionInput(
      {
        lat: s.number("Latitude to reverse geocode.", { minimum: -90, maximum: 90 }),
        lng: s.number("Longitude to reverse geocode.", { minimum: -180, maximum: 180 }),
      },
      ["lat", "lng"],
      "Input parameters for reverse geocoding coordinates with Geokeo.",
    ),
    outputSchema: geokeoResponseSchema,
  }),
];
