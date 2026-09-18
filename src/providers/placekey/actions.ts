import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "placekey";

const additionalFieldSchema = s.stringEnum("An optional response field exposed by the Placekey API.", [
  "address_placekey",
  "building_placekey",
  "confidence_score",
  "normalized_address",
  "geocode",
  "upi",
  "parcel",
  "geoid",
  "gers",
]);
const lookupOptionsSchema = s.object(
  "Options that customize the Placekey lookup response.",
  {
    fields: s.array("Optional Placekey response fields to include in the lookup result.", additionalFieldSchema, {
      minItems: 1,
    }),
    strict_name_match: s.boolean("Whether Placekey should require an exact point-of-interest name match."),
    strict_address_match: s.boolean("Whether Placekey should require an exact address match."),
  },
  { optional: ["fields", "strict_name_match", "strict_address_match"] },
);
const placeMetadataSchema = s.object(
  "Additional metadata used by Placekey to improve point-of-interest matching.",
  {
    website: s.url("The business website URL used to improve point-of-interest matching."),
    mcc_code: s.string("The merchant category code associated with the point of interest."),
    store_id: s.string("A brand-specific store identifier used to improve matching accuracy."),
    naics_code: s.string("The 4-digit or 6-digit NAICS code associated with the business."),
    phone_number: s.string("The phone number of the point of interest used to improve matching."),
  },
  { optional: ["website", "mcc_code", "store_id", "naics_code", "phone_number"] },
);
const baseLookupFields = {
  query_id: s.string("A custom identifier echoed back in the Placekey response."),
  street_address: s.string("The street address of the location to resolve."),
  city: s.string("The city of the queried location."),
  region: s.string("The second-level administrative region, such as a US state code."),
  postal_code: s.string("The postal code of the queried location."),
  iso_country_code: s.string("The ISO 3166-1 alpha-2 country code for the queried location.", {
    minLength: 2,
    maxLength: 2,
  }),
  latitude: s.number("The WGS-84 latitude of the queried location.", { minimum: -90, maximum: 90 }),
  longitude: s.number("The WGS-84 longitude of the queried location.", { minimum: -180, maximum: 180 }),
  location_name: s.string("The point-of-interest name used to improve Placekey matching."),
};
const singleLookupQuerySchema = s.object(
  "The input payload for a single Placekey lookup.",
  {
    ...baseLookupFields,
    place_metadata: placeMetadataSchema,
    options: lookupOptionsSchema,
  },
  {
    optional: [
      "query_id",
      "street_address",
      "city",
      "region",
      "postal_code",
      "iso_country_code",
      "latitude",
      "longitude",
      "location_name",
      "place_metadata",
      "options",
    ],
  },
);
const addressInputSchema = s.object(
  "The input payload for converting an address with Placekey.",
  {
    street_address: s.string("The street address of the location to resolve into a Placekey."),
    city: s.string("The city of the location."),
    region: s.string("The region or state of the location."),
    postal_code: s.string("The postal code of the location."),
    iso_country_code: s.string("The ISO 3166-1 alpha-2 country code for the queried location.", {
      minLength: 2,
      maxLength: 2,
    }),
    location_name: s.string("The point-of-interest name used to improve Placekey matching."),
  },
  { optional: ["city", "postal_code", "location_name"] },
);
const geocodeSchema = s.object("Geocode data returned by the Placekey geocoder.", {
  location: s.object("The geocoded latitude and longitude for the matched location.", {
    lat: s.number("The latitude returned by Placekey geocoding."),
    lng: s.number("The longitude returned by Placekey geocoding."),
  }),
  location_type: s.string("The Placekey geocode precision level for the matched location."),
});
const lookupResultSchema = s.object(
  "The response payload for a successful or failed Placekey lookup.",
  {
    query_id: s.string("The query identifier echoed back by Placekey."),
    placekey: s.string("The Placekey identifier returned for the matched location."),
    error: s.string("The lookup error returned by Placekey."),
    address_placekey: s.string("The Placekey for the address without the point-of-interest component."),
    building_placekey: s.string("The building-level Placekey returned by Placekey."),
    confidence_score: s.stringEnum("The confidence score returned by Placekey for the match.", [
      "HIGH",
      "MEDIUM",
      "LOW",
    ]),
    normalized_address: s.looseObject("The normalized address returned by Placekey for a successful lookup."),
    geocode: geocodeSchema,
    upi: s.string("The universal parcel identifier returned by Placekey."),
    parcel: s.string("The parcel identifier returned by Placekey when available."),
    geoid: s.string("The census geography identifier returned by Placekey when available."),
    gers: s.string("The Overture Maps identifier returned by Placekey when available."),
  },
  {
    optional: [
      "placekey",
      "error",
      "address_placekey",
      "building_placekey",
      "confidence_score",
      "normalized_address",
      "geocode",
      "upi",
      "parcel",
      "geoid",
      "gers",
    ],
  },
);

export const placekeyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_placekey",
    operationType: "read",
    description:
      "Look up a single location with Placekey and return its Placekey identifier plus optional enrichment fields.",
    requiredScopes: [],
    inputSchema: singleLookupQuerySchema,
    outputSchema: lookupResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_placekeys_bulk",
    operationType: "read",
    description: "Look up up to 100 locations in one Placekey bulk request and return the result for each query item.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for a Placekey bulk lookup.",
      {
        queries: s.array("The list of location queries to resolve with Placekey.", singleLookupQuerySchema, {
          minItems: 1,
          maxItems: 100,
        }),
        options: lookupOptionsSchema,
      },
      { optional: ["options"] },
    ),
    outputSchema: s.array("The list of results returned by the Placekey bulk API.", lookupResultSchema),
  }),
  defineProviderAction(service, {
    name: "get_placekey_from_address",
    operationType: "read",
    description: "Resolve a postal address into a Placekey identifier using the Placekey single-lookup API.",
    requiredScopes: [],
    inputSchema: addressInputSchema,
    outputSchema: s.object(
      "The response payload for converting an address into a Placekey.",
      {
        query_id: s.string("The query identifier echoed back by Placekey."),
        placekey: s.string("The Placekey identifier returned for the matched address."),
        error: s.string("The lookup error returned by Placekey."),
      },
      { optional: ["placekey", "error"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_geocode_from_address",
    operationType: "read",
    description: "Resolve a postal address with Placekey and return the matched geocode response for the location.",
    requiredScopes: [],
    inputSchema: addressInputSchema,
    outputSchema: s.object("The response payload for converting an address into geocode data.", {
      query_id: s.string("The query identifier echoed back by Placekey."),
      placekey: s.string("The Placekey identifier returned for the matched address."),
      geocode: geocodeSchema,
    }),
  }),
];
