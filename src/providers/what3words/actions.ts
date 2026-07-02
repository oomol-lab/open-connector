import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "what3words";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const coordinatesSchema = s.object("A latitude and longitude coordinate pair.", {
  lat: s.number("The latitude in decimal degrees.", { minimum: -90, maximum: 90 }),
  lng: s.number("The longitude in decimal degrees.", { minimum: -180, maximum: 180 }),
});
const squareSchema = s.object("A what3words square geometry.", {
  southwest: coordinatesSchema,
  northeast: coordinatesSchema,
});
const commonAddressResponseSchema = s.looseRequiredObject(
  "The response returned by a what3words address conversion endpoint.",
  {
    country: s.string("The ISO 3166-1 alpha-2 country code for the address."),
    square: squareSchema,
    nearestPlace: s.string("The nearest named place for the what3words address."),
    coordinates: coordinatesSchema,
    words: s.string("The three word address."),
    language: s.string("The language code for the words."),
    map: s.string("A what3words map URL for the address."),
  },
);
const autosuggestSuggestionSchema = s.looseRequiredObject("A what3words autosuggest result.", {
  country: s.string("The ISO 3166-1 alpha-2 country code for the suggested address."),
  nearestPlace: s.string("The nearest named place for the suggested address."),
  words: s.string("The suggested three word address."),
  distanceToFocusKm: s.number("The distance in kilometers from the focus point when available."),
  rank: s.integer("The suggestion rank returned by what3words."),
  language: s.string("The language code for the suggested words."),
});
const autosuggestResponseSchema = s.looseRequiredObject(
  "The response returned by the what3words autosuggest endpoint.",
  {
    suggestions: s.array("The ranked autosuggest results.", autosuggestSuggestionSchema),
  },
);
const gridSectionResponseSchema = s.looseRequiredObject(
  "The response returned by the what3words grid section endpoint.",
  {
    lines: s.array(
      "The grid lines covering the requested bounding box.",
      s.looseRequiredObject("One grid line segment.", {
        start: coordinatesSchema,
        end: coordinatesSchema,
      }),
    ),
  },
);
const languageSchema = s.looseRequiredObject("A language supported by what3words.", {
  code: s.string("The language code."),
  name: s.string("The localized language name."),
  nativeName: s.string("The native language name."),
});
const availableLanguagesResponseSchema = s.looseRequiredObject(
  "The response returned by the what3words available languages endpoint.",
  {
    languages: s.array("The supported what3words languages.", languageSchema),
  },
);

export const what3wordsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "convert_to_coordinates",
    description: "Convert a three word address into coordinates and square metadata.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        words: nonEmptyString("The three word address to convert, such as filled.count.soap."),
        format: s.stringEnum("The response format requested from what3words.", ["json", "geojson"]),
        locale: nonEmptyString("A supported language code used to localize the response."),
      },
      ["words"],
      "Input for converting words to coordinates.",
    ),
    outputSchema: commonAddressResponseSchema,
  }),
  defineProviderAction(service, {
    name: "convert_to_3wa",
    description: "Convert coordinates into a three word address.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        lat: s.number("The latitude in decimal degrees.", { minimum: -90, maximum: 90 }),
        lng: s.number("The longitude in decimal degrees.", { minimum: -180, maximum: 180 }),
        language: nonEmptyString("The language code for the returned three word address."),
        format: s.stringEnum("The response format requested from what3words.", ["json", "geojson"]),
      },
      ["lat", "lng"],
      "Input for converting coordinates to a three word address.",
    ),
    outputSchema: commonAddressResponseSchema,
  }),
  defineProviderAction(service, {
    name: "autosuggest",
    description: "Return ranked three word address suggestions for partial or mistyped input.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        input: nonEmptyString("The partial or mistyped three word address."),
        nResults: s.integer("The maximum number of suggestions to return.", { minimum: 1 }),
        focusLat: s.number("The latitude used to bias suggestions.", { minimum: -90, maximum: 90 }),
        focusLng: s.number("The longitude used to bias suggestions.", { minimum: -180, maximum: 180 }),
        nFocusResults: s.integer("The number of results to prioritize around the focus point.", { minimum: 1 }),
        clipToCountry: nonEmptyString(
          "A comma-separated list of ISO 3166-1 alpha-2 country codes used to restrict suggestions.",
        ),
        clipToCircle: nonEmptyString("A circle restriction formatted as latitude,longitude,kilometers."),
        clipToBoundingBox: nonEmptyString(
          "A bounding box restriction formatted as southwest-lat,southwest-lng,northeast-lat,northeast-lng.",
        ),
        clipToPolygon: nonEmptyString(
          "A polygon restriction formatted as comma-separated latitude,longitude coordinate pairs.",
        ),
        inputType: s.stringEnum("The autosuggest input type.", ["text", "vocon-hybrid"]),
        language: nonEmptyString("The language code for autosuggest matching."),
        preferLand: s.boolean("Whether suggestions should prefer land locations."),
        locale: nonEmptyString("A supported language code used to localize place names."),
      },
      ["input"],
      "Input for requesting three word address suggestions.",
    ),
    outputSchema: autosuggestResponseSchema,
  }),
  defineProviderAction(service, {
    name: "grid_section",
    description: "Return what3words grid line segments for a bounding box.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        southwestLat: s.number("The southwest latitude of the bounding box.", { minimum: -90, maximum: 90 }),
        southwestLng: s.number("The southwest longitude of the bounding box.", { minimum: -180, maximum: 180 }),
        northeastLat: s.number("The northeast latitude of the bounding box.", { minimum: -90, maximum: 90 }),
        northeastLng: s.number("The northeast longitude of the bounding box.", { minimum: -180, maximum: 180 }),
        format: s.stringEnum("The response format requested from what3words.", ["json", "geojson"]),
      },
      ["southwestLat", "southwestLng", "northeastLat", "northeastLng"],
      "Input for requesting what3words grid lines.",
    ),
    outputSchema: gridSectionResponseSchema,
  }),
  defineProviderAction(service, {
    name: "available_languages",
    description: "List the languages supported by the what3words API.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "Input for listing available what3words languages."),
    outputSchema: availableLanguagesResponseSchema,
  }),
];

export type What3wordsActionName =
  | "convert_to_coordinates"
  | "convert_to_3wa"
  | "autosuggest"
  | "grid_section"
  | "available_languages";
