import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "radar";

const radarLayerValues = ["place", "address", "postalCode", "locality", "county", "state", "country", "coarse", "fine"];
const radarLanguageValues = ["ar", "de", "en", "es", "fr", "ja", "ko", "pt", "ru", "zh"];

const nonEmptyString = (description: string) => s.string({ minLength: 1, description });
const countryCodeSchema = s.string({
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Za-z]{2}$",
  description: "A two-letter ISO 3166-1 alpha-2 country code.",
});
const countryCodeListSchema = s.array(
  "Country filters sent to Radar as a comma-separated list of two-letter country codes.",
  countryCodeSchema,
  { minItems: 1 },
);
const radarLayerSchema = s.stringEnum("One Radar result layer filter.", radarLayerValues);
const radarLayersSchema = s.array(
  "Radar result layer filters sent to Radar as a comma-separated list.",
  radarLayerSchema,
  { minItems: 1, maxItems: radarLayerValues.length },
);
const radarLanguageSchema = s.stringEnum("The language code used to localize Radar results.", radarLanguageValues);
const latitudeSchema = s.number("The latitude coordinate in WGS84 decimal degrees.", {
  minimum: -90,
  maximum: 90,
});
const longitudeSchema = s.number("The longitude coordinate in WGS84 decimal degrees.", {
  minimum: -180,
  maximum: 180,
});
const limit100Schema = s.integer("The maximum number of results to return.", {
  minimum: 1,
  maximum: 100,
});
const radiusMetersSchema = s.integer("The search radius in meters.", {
  minimum: 1,
  maximum: 10000,
});
const responseMetaSchema = s.looseObject("Radar response metadata.", {
  code: s.integer("The HTTP-like status code reported by Radar."),
  param: s.string("The parameter name associated with a Radar error when present."),
  message: s.string("The Radar status or error message when present."),
});
const geometrySchema = s.looseObject("A GeoJSON-like geometry object returned by Radar.", {
  type: s.string("The geometry type returned by Radar."),
  coordinates: s.array(
    "The longitude and latitude coordinate pair returned by Radar.",
    s.number("One coordinate value."),
    {
      minItems: 2,
    },
  ),
});
const timeZoneSchema = s.looseObject("A Radar timezone object.", {
  id: s.string("The IANA timezone identifier."),
  name: s.string("The human-readable timezone name."),
  code: s.string("The timezone abbreviation."),
  currentTime: s.string("The current local time returned by Radar."),
  utcOffset: s.integer("The timezone UTC offset in seconds."),
  dstOffset: s.integer("The daylight saving offset in seconds."),
});
const rawObjectSchema = s.looseObject("The raw object returned by Radar.");
const addressSchema = s.object(
  "A normalized Radar address result with the raw upstream object preserved.",
  {
    latitude: s.number("The result latitude coordinate."),
    longitude: s.number("The result longitude coordinate."),
    geometry: geometrySchema,
    country: s.string("The country name returned by Radar."),
    countryCode: s.string("The two-letter country code returned by Radar."),
    countryFlag: s.string("The country flag emoji returned by Radar."),
    county: s.string("The county name returned by Radar."),
    confidence: s.string("The Radar confidence value for a geocode result."),
    distance: s.number("The distance from the requested location in meters when returned."),
    borough: s.string("The borough name returned by Radar."),
    city: s.string("The city name returned by Radar."),
    number: s.string("The building number returned by Radar."),
    neighborhood: s.string("The neighborhood name returned by Radar."),
    postalCode: s.string("The postal code returned by Radar."),
    stateCode: s.string("The state or region code returned by Radar."),
    state: s.string("The state or region name returned by Radar."),
    street: s.string("The street name returned by Radar."),
    layer: s.string("The Radar result layer."),
    formattedAddress: s.string("The formatted address returned by Radar."),
    addressLabel: s.string("The short address label returned by Radar."),
    placeLabel: s.string("The place label returned by Radar."),
    timeZone: timeZoneSchema,
    raw: rawObjectSchema,
  },
  {
    optional: [
      "latitude",
      "longitude",
      "geometry",
      "country",
      "countryCode",
      "countryFlag",
      "county",
      "confidence",
      "distance",
      "borough",
      "city",
      "number",
      "neighborhood",
      "postalCode",
      "stateCode",
      "state",
      "street",
      "layer",
      "formattedAddress",
      "addressLabel",
      "placeLabel",
      "timeZone",
    ],
  },
);
const placeSchema = s.object(
  "A normalized Radar place result with the raw upstream object preserved.",
  {
    name: s.string("The place name returned by Radar."),
    categories: s.array("The Radar place categories.", s.string("One Radar place category.")),
    chain: s.looseObject("The Radar chain object for the place when present.", {
      name: s.string("The chain name."),
      slug: s.string("The chain slug."),
      externalId: s.string("The chain external identifier."),
      metadata: s.looseObject("The chain metadata returned by Radar."),
    }),
    location: geometrySchema,
    raw: rawObjectSchema,
  },
  { optional: ["name", "categories", "chain", "location"] },
);
const addressesOutputSchema = s.object(
  "The response returned by a Radar address list action.",
  {
    meta: responseMetaSchema,
    addresses: s.array("The address results returned by Radar.", addressSchema),
  },
  { required: ["meta", "addresses"] },
);

export const radarActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "forward_geocode",
    description: "Convert a complete address into coordinates with Radar.",
    inputSchema: s.object(
      "Input parameters for Radar forward geocoding.",
      {
        query: nonEmptyString("The complete address to geocode."),
        layers: radarLayersSchema,
        country: countryCodeListSchema,
        lang: radarLanguageSchema,
      },
      { optional: ["layers", "country", "lang"] },
    ),
    outputSchema: addressesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Convert coordinates into nearby addresses with Radar.",
    inputSchema: s.object(
      "Input parameters for Radar reverse geocoding.",
      {
        latitude: latitudeSchema,
        longitude: longitudeSchema,
        layers: radarLayersSchema,
      },
      { optional: ["layers"] },
    ),
    outputSchema: addressesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ip_geocode",
    description: "Geocode the connector request IP with Radar.",
    inputSchema: s.object("The input payload for Radar IP geocoding.", {}, { required: [] }),
    outputSchema: s.object(
      "The response returned by Radar IP geocoding.",
      {
        meta: responseMetaSchema,
        address: addressSchema,
        proxy: s.boolean("Whether Radar detected a proxy IP."),
        ip: s.string("The IP address geocoded by Radar."),
      },
      { optional: ["proxy", "ip"] },
    ),
  }),
  defineProviderAction(service, {
    name: "autocomplete",
    description: "Autocomplete a partial address or place name with Radar.",
    inputSchema: s.object(
      "Input parameters for Radar address autocomplete.",
      {
        query: nonEmptyString("The partial address or place name to autocomplete."),
        latitude: {
          ...latitudeSchema,
          description: "Optional latitude used with longitude to prefer nearby autocomplete results.",
        },
        longitude: {
          ...longitudeSchema,
          description: "Optional longitude used with latitude to prefer nearby autocomplete results.",
        },
        layers: radarLayersSchema,
        limit: limit100Schema,
        countryCode: countryCodeListSchema,
      },
      { optional: ["latitude", "longitude", "layers", "limit", "countryCode"] },
    ),
    outputSchema: addressesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_places",
    description: "Search Radar places near coordinates by chain or category.",
    inputSchema: s.object(
      "Input parameters for Radar nearby place search.",
      {
        latitude: latitudeSchema,
        longitude: longitudeSchema,
        chains: s.array(
          "Radar chain slug filters sent as a comma-separated list.",
          nonEmptyString("One Radar chain slug."),
          {
            minItems: 1,
          },
        ),
        categories: s.array(
          "Radar category filters sent as a comma-separated list.",
          nonEmptyString("One Radar place category."),
          { minItems: 1 },
        ),
        radius: radiusMetersSchema,
        limit: limit100Schema,
      },
      { optional: ["chains", "categories", "radius", "limit"] },
    ),
    outputSchema: s.object(
      "The response returned by Radar place search.",
      {
        meta: responseMetaSchema,
        places: s.array("The places returned by Radar.", placeSchema),
      },
      { required: ["meta", "places"] },
    ),
  }),
];
