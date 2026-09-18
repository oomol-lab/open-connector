import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "arcgis_online";

const coordinateSchema = s.requiredObject("A WGS84 coordinate used by ArcGIS geocoding.", {
  longitude: s.number("Longitude in decimal degrees.", {
    minimum: -180,
    maximum: 180,
  }),
  latitude: s.number("Latitude in decimal degrees.", {
    minimum: -90,
    maximum: 90,
  }),
});

const spatialReferenceSchema = s.looseRequiredObject(
  "ArcGIS spatial reference metadata.",
  {
    wkid: s.integer("Well-known ID for the spatial reference."),
    latestWkid: s.integer("Latest well-known ID for the spatial reference."),
  },
  { optional: ["wkid", "latestWkid"] },
);

const responsePointSchema = s.looseRequiredObject(
  "Point geometry returned by ArcGIS.",
  {
    x: s.number("X coordinate returned by ArcGIS."),
    y: s.number("Y coordinate returned by ArcGIS."),
    spatialReference: spatialReferenceSchema,
  },
  { optional: ["spatialReference"] },
);

const extentSchema = s.looseRequiredObject(
  "Bounding extent returned by ArcGIS.",
  {
    xmin: s.number("Minimum X coordinate of the extent."),
    ymin: s.number("Minimum Y coordinate of the extent."),
    xmax: s.number("Maximum X coordinate of the extent."),
    ymax: s.number("Maximum Y coordinate of the extent."),
    spatialReference: spatialReferenceSchema,
  },
  { optional: ["xmin", "ymin", "xmax", "ymax", "spatialReference"] },
);

const addressAttributesSchema = s.record(
  "Address attributes returned by ArcGIS, keyed by upstream field name.",
  s.unknown("An ArcGIS address attribute value."),
);

const candidateSchema = s.looseRequiredObject(
  "One ArcGIS address candidate.",
  {
    address: s.nonEmptyString("Formatted address for the candidate."),
    location: responsePointSchema,
    score: s.number("Match score for the candidate."),
    attributes: addressAttributesSchema,
    extent: extentSchema,
  },
  { optional: ["attributes", "extent"] },
);

const findAddressCandidatesOutputSchema = s.looseRequiredObject(
  "ArcGIS findAddressCandidates response.",
  {
    spatialReference: spatialReferenceSchema,
    candidates: s.array("Address candidates returned by ArcGIS.", candidateSchema),
  },
  { optional: ["spatialReference"] },
);

const reverseGeocodeOutputSchema = s.looseRequiredObject(
  "ArcGIS reverseGeocode response.",
  {
    address: addressAttributesSchema,
    location: responsePointSchema,
  },
  { optional: [] },
);

const suggestionSchema = s.looseRequiredObject(
  "One ArcGIS geocoding suggestion.",
  {
    text: s.nonEmptyString("Suggestion text returned by ArcGIS."),
    magicKey: s.nonEmptyString("ArcGIS magic key that can be sent to find_address_candidates."),
    isCollection: s.boolean("Whether the suggestion represents a collection."),
  },
  { optional: ["isCollection"] },
);

const suggestOutputSchema = s.looseRequiredObject(
  "ArcGIS suggest response.",
  {
    suggestions: s.array("Autocomplete suggestions returned by ArcGIS.", suggestionSchema),
  },
  { optional: [] },
);

const commonSearchFilters = {
  location: coordinateSchema,
  searchExtent: s.nonEmptyString("Bounding box that limits search results, formatted as xmin,ymin,xmax,ymax."),
  category: s.nonEmptyString("Place or address category filter supported by ArcGIS."),
  sourceCountry: s.nonEmptyString("Country code or comma-separated country codes used to restrict results."),
  preferredLabelValues: s.nonEmptyString(
    "Preferred label values returned by ArcGIS, such as postal city or local city.",
  ),
};

export const arcgisOnlineActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "suggest",
    operationType: "read",
    description: "Return ArcGIS address and place autocomplete suggestions.",
    inputSchema: s.object(
      "Input parameters for ArcGIS geocoding suggestions.",
      {
        text: s.nonEmptyString("Input text to autocomplete."),
        ...commonSearchFilters,
        countryCode: s.nonEmptyString("Country code used to restrict suggestions."),
        maxSuggestions: s.integer("Maximum number of suggestions to return, from 1 to 15.", {
          minimum: 1,
          maximum: 15,
        }),
        returnCollections: s.boolean("Whether collection suggestions should be returned."),
      },
      {
        optional: [
          "location",
          "searchExtent",
          "category",
          "sourceCountry",
          "preferredLabelValues",
          "countryCode",
          "maxSuggestions",
          "returnCollections",
        ],
      },
    ),
    outputSchema: suggestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_address_candidates",
    operationType: "read",
    description: "Convert an address or place query into ArcGIS geocoding candidates.",
    inputSchema: s.object(
      "Input parameters for ArcGIS findAddressCandidates.",
      {
        singleLine: s.nonEmptyString("Street address, place name, postal code, or POI query."),
        ...commonSearchFilters,
        magicKey: s.nonEmptyString("Magic key returned by the suggest action."),
        outFields: s.nonEmptyString("Comma-separated output fields to include, or * for all fields."),
        outSr: s.integer("Spatial reference WKID for returned coordinates."),
        maxLocations: s.integer("Maximum number of candidates to return, from 1 to 50.", {
          minimum: 1,
          maximum: 50,
        }),
        forStorage: s.boolean("Whether the geocoding results will be stored persistently."),
        locationType: s.stringEnum("Preferred output geometry location type.", ["rooftop", "street"]),
      },
      {
        optional: [
          "location",
          "searchExtent",
          "category",
          "sourceCountry",
          "preferredLabelValues",
          "magicKey",
          "outFields",
          "outSr",
          "maxLocations",
          "forStorage",
          "locationType",
        ],
      },
    ),
    outputSchema: findAddressCandidatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    operationType: "read",
    description: "Convert longitude and latitude into an ArcGIS address result.",
    inputSchema: s.object(
      "Input parameters for ArcGIS reverseGeocode.",
      {
        longitude: s.number("Longitude in decimal degrees.", {
          minimum: -180,
          maximum: 180,
        }),
        latitude: s.number("Latitude in decimal degrees.", {
          minimum: -90,
          maximum: 90,
        }),
        outSr: s.integer("Spatial reference WKID for returned coordinates."),
        langCode: s.nonEmptyString("Language code for returned addresses."),
        forStorage: s.boolean("Whether the reverse geocoding result will be stored persistently."),
        featureTypes: s.nonEmptyString("Comma-separated feature types to limit possible matches."),
        locationType: s.stringEnum("Preferred output geometry location type.", ["rooftop", "street"]),
        preferredLabelValues: s.nonEmptyString("Preferred label values returned by ArcGIS."),
        outFields: s.nonEmptyString("Comma-separated address fields to include, or * for all fields."),
        returnInputLocation: s.boolean("Whether the input coordinates should be returned in the location object."),
      },
      {
        optional: [
          "outSr",
          "langCode",
          "forStorage",
          "featureTypes",
          "locationType",
          "preferredLabelValues",
          "outFields",
          "returnInputLocation",
        ],
      },
    ),
    outputSchema: reverseGeocodeOutputSchema,
  }),
];
