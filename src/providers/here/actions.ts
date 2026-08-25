import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "here";

const commonQueryFields = {
  lang: s.nonEmptyString("The optional BCP 47 language tag for the response."),
  limit: s.integer("The maximum number of result items to return.", { minimum: 1, maximum: 100 }),
  in: s.nonEmptyString("The optional HERE spatial or country filter, such as countryCode:USA."),
  at: s.nonEmptyString("The optional HERE location context formatted as latitude,longitude."),
  types: s.nonEmptyString("The optional comma-separated HERE result type filter."),
  politicalView: s.nonEmptyString("The optional political view country code used by HERE."),
  show: s.nonEmptyString("The optional comma-separated HERE response enrichment selector."),
};

const autocompleteLimit = s.integer("The maximum number of autocomplete result items to return.", {
  minimum: 1,
  maximum: 20,
});

const discoverAutosuggestIn = s.nonEmptyString(
  "The optional HERE filter. Use circle:... or bbox:... as spatial context, or countryCode:... together with at.",
);

const spatialInPattern = "^(circle|bbox):";
const discoverAutosuggestSpatialContext = [
  {
    required: ["at"],
    not: {
      required: ["in"],
      properties: {
        in: { type: "string", pattern: spatialInPattern },
      },
    },
  },
  {
    required: ["in"],
    properties: {
      in: { type: "string", pattern: spatialInPattern },
    },
    not: { required: ["at"] },
  },
];

const itemsOutputSchema = s.object("The HERE response containing ordered result items.", {
  items: s.array("The ordered HERE result items.", s.looseObject("A HERE result item.")),
});

const geocodeInputSchema = s.object(
  "The input payload for geocoding a HERE address, place, locality, or administrative area query.",
  {
    q: s.nonEmptyString("The free-form HERE geocode query."),
    lang: commonQueryFields.lang,
    limit: commonQueryFields.limit,
    in: commonQueryFields.in,
    at: commonQueryFields.at,
    types: commonQueryFields.types,
    politicalView: commonQueryFields.politicalView,
    show: commonQueryFields.show,
  },
  { optional: ["lang", "limit", "in", "at", "types", "politicalView", "show"] },
);

const reverseGeocodeInputSchema = s.object(
  "The input payload for reverse geocoding a HERE latitude,longitude location.",
  {
    at: s.nonEmptyString("The HERE location to reverse geocode, formatted as latitude,longitude."),
    lang: commonQueryFields.lang,
    limit: commonQueryFields.limit,
    types: commonQueryFields.types,
    politicalView: commonQueryFields.politicalView,
    show: commonQueryFields.show,
  },
  { optional: ["lang", "limit", "types", "politicalView", "show"] },
);

const discoverInputSchema = s.object(
  "The input payload for HERE Discover free-form place or address search with required spatial context.",
  {
    q: s.nonEmptyString("The free-form HERE Discover query."),
    at: commonQueryFields.at,
    in: discoverAutosuggestIn,
    lang: commonQueryFields.lang,
    limit: commonQueryFields.limit,
    types: commonQueryFields.types,
    politicalView: commonQueryFields.politicalView,
    show: commonQueryFields.show,
  },
  { optional: ["at", "in", "lang", "limit", "types", "politicalView", "show"] },
);
discoverInputSchema.anyOf = discoverAutosuggestSpatialContext;

const autosuggestInputSchema = s.object(
  "The input payload for HERE Autosuggest query suggestions with required spatial context.",
  {
    q: s.nonEmptyString("The partial HERE Autosuggest query."),
    at: commonQueryFields.at,
    in: discoverAutosuggestIn,
    lang: commonQueryFields.lang,
    limit: commonQueryFields.limit,
    politicalView: commonQueryFields.politicalView,
  },
  { optional: ["at", "in", "lang", "limit", "politicalView"] },
);
autosuggestInputSchema.anyOf = discoverAutosuggestSpatialContext;

const autosuggestOutputSchema = s.object(
  "The HERE Autosuggest response containing query or entity suggestions.",
  {
    items: s.array("The ordered HERE Autosuggest items.", s.looseObject("A HERE suggestion item.")),
    queryTerms: s.array(
      "The optional HERE completed query terms returned when term completion is requested.",
      s.looseObject("A HERE query term suggestion."),
    ),
  },
  { optional: ["queryTerms"] },
);

const autocompleteInputSchema = s.object(
  "The input payload for HERE address autocomplete suggestions.",
  {
    q: s.nonEmptyString("The partial address or administrative-area text to complete."),
    at: commonQueryFields.at,
    in: commonQueryFields.in,
    lang: commonQueryFields.lang,
    limit: autocompleteLimit,
    politicalView: commonQueryFields.politicalView,
  },
  { optional: ["at", "in", "lang", "limit", "politicalView"] },
);

const lookupInputSchema = s.object(
  "The input payload for looking up a HERE place or location object by identifier.",
  {
    id: s.nonEmptyString("The HERE result identifier returned by geocode, reverse geocode, discover, or autocomplete."),
    lang: commonQueryFields.lang,
    show: commonQueryFields.show,
  },
  { optional: ["lang", "show"] },
);

const lookupOutputSchema = s.looseRequiredObject(
  "The HERE lookup result object.",
  {
    title: s.string("The representative title for the HERE object."),
    id: s.string("The HERE identifier for the returned object."),
    address: s.looseObject("The detailed HERE address object."),
    resultType: s.string("The HERE result type for the returned object, when present."),
    position: s.looseObject("The HERE WGS84 position object, when present."),
  },
  { optional: ["resultType", "position"] },
);

export const hereActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "geocode",
    description:
      "Geocode a free-form address, place, locality, or administrative-area query with HERE Geocoding and Search API v7.",
    inputSchema: geocodeInputSchema,
    outputSchema: itemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Find the nearest HERE address or place result for a latitude,longitude location.",
    inputSchema: reverseGeocodeInputSchema,
    outputSchema: itemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "discover",
    description: "Search HERE places or addresses with a free-form Discover query and required spatial context.",
    inputSchema: discoverInputSchema,
    outputSchema: itemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "autosuggest",
    description:
      "Get HERE query and entity suggestions for incomplete or misspelled address and place text with required spatial context.",
    inputSchema: autosuggestInputSchema,
    outputSchema: autosuggestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "autocomplete",
    description: "Get HERE address and administrative-area completions for entered text.",
    inputSchema: autocompleteInputSchema,
    outputSchema: itemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup",
    description: "Look up a HERE place or location object by an identifier returned from another HERE search result.",
    inputSchema: lookupInputSchema,
    outputSchema: lookupOutputSchema,
  }),
];
