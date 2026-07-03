import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "big_data_cloud";

const optionalIpInputSchema = s.anyOf(
  "Optional IPv4 or IPv6 address to query. If omitted, BigDataCloud uses the connector server IP.",
  [
    s.string({ description: "An IPv4 address.", format: "ipv4" }),
    s.string({ description: "An IPv6 address.", format: "ipv6" }),
  ],
);
const localityLanguageInputSchema = s.string({
  description:
    "Optional ISO 639-1 language code used to localize locality names, or `default` for the first administrative language.",
  pattern: "^([A-Za-z]{2}|default)$",
});
const utcReferenceInputSchema = s.integer(
  "Optional Unix time reference in seconds used to evaluate timezone and DST state.",
  { minimum: 0 },
);
const timezoneSchema = s.object(
  "BigDataCloud timezone payload.",
  {
    ianaTimeId: s.string("The IANA timezone identifier."),
    displayName: s.string("The human-readable timezone display name."),
    effectiveTimeZoneFull: s.string("The full timezone name adjusted for daylight saving time."),
    effectiveTimeZoneShort: s.string("The abbreviated timezone name adjusted for daylight saving time."),
    utcOffsetSeconds: s.integer("The timezone offset from UTC in seconds."),
    utcOffset: s.string("The timezone offset from UTC as a string."),
    isDaylightSavingTime: s.boolean("Whether daylight saving time is currently in effect."),
    localTime: s.string("The local time in ISO 8601 format."),
    utcTime: s.string("The UTC time in ISO 8601 format when a valid UTC reference is supplied."),
  },
  { optional: ["utcTime"], additionalProperties: true },
);
const countrySchema = s.object(
  "BigDataCloud country payload.",
  {
    isoAlpha2: s.string("The ISO 3166-1 alpha-2 country code."),
    isoAlpha3: s.string("The ISO 3166-1 alpha-3 country code."),
    name: s.string("The localized country name."),
    countryFlagEmoji: s.string("The Unicode flag emoji for the country."),
  },
  { optional: ["countryFlagEmoji"], additionalProperties: true },
);
const carrierSchema = s.object(
  "One autonomous system entry returned by BigDataCloud.",
  {
    asn: s.string("The autonomous system number in prefixed string form."),
    asnNumeric: s.integer("The autonomous system number as an integer."),
    organisation: s.string("The organization registered for the autonomous system."),
    name: s.string("The short network name of the autonomous system."),
    rank: s.integer("The global rank of the autonomous system."),
  },
  { optional: ["rank"], additionalProperties: true },
);
const countryByIpInputSchema = s.object(
  "Input parameters for BigDataCloud country lookup by IP address.",
  {
    ip: optionalIpInputSchema,
    localityLanguage: localityLanguageInputSchema,
  },
  { optional: ["ip", "localityLanguage"] },
);
const countryByIpOutputSchema = s.object(
  "Country-level geolocation payload returned by BigDataCloud.",
  {
    ip: s.string("The resolved IP address."),
    localityLanguageRequested: s.string("The locality language that BigDataCloud applied to this response."),
    isReachableGlobally: s.boolean("Whether the IP address is globally routable on the public Internet."),
    country: withDescription(countrySchema, "The country details returned for the IP address."),
    lastUpdated: s.string("The UTC timestamp when BigDataCloud last updated this IP."),
  },
  { additionalProperties: true },
);
const networkByIpInputSchema = s.object(
  "Input parameters for BigDataCloud network lookup by IP address.",
  {
    ip: optionalIpInputSchema,
    localityLanguage: localityLanguageInputSchema,
  },
  { optional: ["ip", "localityLanguage"] },
);
const networkByIpOutputSchema = s.object(
  "Network intelligence payload returned by BigDataCloud.",
  {
    ip: s.string("The resolved IP address."),
    registry: s.string("The regional internet registry that manages the network block."),
    registryStatus: s.string("The allocation status of the network block."),
    registeredCountry: s.string("The ISO 3166-1 alpha-2 country code registered for the network."),
    registeredCountryName: s.string("The localized country name registered for the network."),
    organisation: s.string("The organization that the network block is registered to."),
    isReachableGlobally: s.boolean("Whether the network is reachable on the public Internet."),
    isBogon: s.boolean("Whether the IP belongs to a bogon range announced on the global table."),
    bgpPrefix: s.string("The detected BGP prefix for the network."),
    carriers: s.array("The autonomous systems announcing the network.", carrierSchema),
  },
  { optional: ["organisation", "bgpPrefix", "carriers"], additionalProperties: true },
);
const timezoneByIpInputSchema = s.object(
  "Input parameters for BigDataCloud timezone lookup by IP address.",
  {
    ip: optionalIpInputSchema,
    utcReference: utcReferenceInputSchema,
  },
  { optional: ["ip", "utcReference"] },
);
const reverseGeocodeWithTimezoneInputSchema = s.object(
  "Input parameters for BigDataCloud reverse geocoding with timezone.",
  {
    latitude: s.number("The latitude coordinate in WGS84 decimal degrees.", {
      minimum: -90,
      maximum: 90,
    }),
    longitude: s.number("The longitude coordinate in WGS84 decimal degrees.", {
      minimum: -180,
      maximum: 180,
    }),
    localityLanguage: localityLanguageInputSchema,
  },
  { optional: ["localityLanguage"] },
);
const reverseGeocodeWithTimezoneOutputSchema = s.object(
  "Reverse geocoding payload with embedded timezone returned by BigDataCloud.",
  {
    latitude: s.number("The requested latitude."),
    longitude: s.number("The requested longitude."),
    localityLanguageRequested: s.string("The locality language that BigDataCloud applied to this response."),
    continent: s.string("The localized continent name."),
    continentCode: s.string("The ISO continent code."),
    countryName: s.string("The localized country name."),
    countryCode: s.string("The ISO 3166-1 alpha-2 country code."),
    principalSubdivision: s.string("The localized principal subdivision name."),
    principalSubdivisionCode: s.string("The ISO 3166-2 principal subdivision code."),
    city: s.string("The most significant populated place for the coordinates."),
    locality: s.string("The most granular named locality for the coordinates."),
    postcode: s.string("The postcode for the coordinates when available."),
    plusCode: s.string("The Open Location Code for the coordinates."),
    localityInfo: s.looseObject("The locality hierarchy returned by BigDataCloud."),
    timeZone: withDescription(timezoneSchema, "The timezone object returned for the coordinates."),
  },
  { optional: ["postcode"], additionalProperties: true },
);

export type BigDataCloudActionName =
  | "get_country_by_ip"
  | "get_network_by_ip"
  | "get_timezone_by_ip"
  | "reverse_geocode_with_timezone";

export const bigDataCloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_country_by_ip",
    description: "Get country-level BigDataCloud geolocation data for an IP address.",
    requiredScopes: [],
    inputSchema: countryByIpInputSchema,
    outputSchema: countryByIpOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_network_by_ip",
    description: "Get BigDataCloud network and ASN details for an IP address.",
    requiredScopes: [],
    inputSchema: networkByIpInputSchema,
    outputSchema: networkByIpOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_timezone_by_ip",
    description: "Get BigDataCloud timezone data for an IP address.",
    requiredScopes: [],
    inputSchema: timezoneByIpInputSchema,
    outputSchema: timezoneSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode_with_timezone",
    description: "Reverse geocode coordinates and return timezone data from BigDataCloud.",
    requiredScopes: [],
    inputSchema: reverseGeocodeWithTimezoneInputSchema,
    outputSchema: reverseGeocodeWithTimezoneOutputSchema,
  }),
];

function withDescription(schema: JsonSchema, description: string): JsonSchema {
  return { ...schema, description };
}
