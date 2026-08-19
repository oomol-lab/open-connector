import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ipgeolocation_io";

const ipAddressSchema = s.string("The IPv4 or IPv6 address to look up.", { minLength: 1, pattern: "\\S" });
const includeHostnameSchema = s.boolean("Whether to include hostname data in the geolocation response.");
const includeSecuritySchema = s.boolean("Whether to include security threat intelligence fields.");
const includeUserAgentSchema = s.boolean("Whether to include user-agent derived fields when supported.");
const fieldsSchema = s.array(
  "Specific response fields to request from IPGeolocation.io.",
  s.nonEmptyString("One IPGeolocation.io field name."),
  { minItems: 1 },
);
const excludesSchema = s.array(
  "Specific response fields to exclude from the IPGeolocation.io response.",
  s.nonEmptyString("One IPGeolocation.io field name."),
  { minItems: 1 },
);
const includeGeoAccuracySchema = s.boolean("Whether to include geo accuracy fields in the geolocation response.");
const includeDmaCodeSchema = s.boolean("Whether to include DMA code fields in the geolocation response.");
const includeAbuseSchema = s.boolean("Whether to include abuse contact fields.");
const latitudeSchema = s.number("The latitude coordinate.", { minimum: -90, maximum: 90 });
const longitudeSchema = s.number("The longitude coordinate.", { minimum: -180, maximum: 180 });
const locationSchema = s.string("The location string accepted by IPGeolocation.io.", { minLength: 1, pattern: "\\S" });
const timeZoneNameSchema = s.string("The IANA time zone name.", { minLength: 1, pattern: "\\S" });

const rawSchema = s.looseObject("The raw object returned by IPGeolocation.io.");
const ipGeolocationSchema = s.object("The normalized IP geolocation result.", {
  ip: s.nullable(s.string("The queried IP address.")),
  hostname: s.nullable(s.string("The hostname associated with the IP address when returned.")),
  continentCode: s.nullable(s.string("The continent code.")),
  continentName: s.nullable(s.string("The continent name.")),
  countryCode2: s.nullable(s.string("The ISO 3166-1 alpha-2 country code.")),
  countryCode3: s.nullable(s.string("The ISO 3166-1 alpha-3 country code.")),
  countryName: s.nullable(s.string("The country name.")),
  stateProvince: s.nullable(s.string("The state or province name.")),
  district: s.nullable(s.string("The district name.")),
  city: s.nullable(s.string("The city name.")),
  zipcode: s.nullable(s.string("The postal code.")),
  latitude: s.nullable(s.number("The latitude returned by IPGeolocation.io.")),
  longitude: s.nullable(s.number("The longitude returned by IPGeolocation.io.")),
  callingCode: s.nullable(s.string("The international calling code.")),
  countryFlag: s.nullable(s.string("The country flag URL or emoji field returned by IPGeolocation.io.")),
  countryMetadata: s.nullable(rawSchema),
  network: s.nullable(rawSchema),
  asn: s.nullable(rawSchema),
  company: s.nullable(rawSchema),
  timeZone: s.nullable(rawSchema),
  currency: s.nullable(rawSchema),
  security: s.nullable(rawSchema),
  abuse: s.nullable(rawSchema),
  userAgent: s.nullable(rawSchema),
  raw: rawSchema,
});
const timeZoneSchema = s.object("The normalized IPGeolocation.io time zone result.", {
  timeZone: s.nullable(s.string("The IANA time zone name.")),
  date: s.nullable(s.string("The date returned by IPGeolocation.io.")),
  dateTime: s.nullable(s.string("The local date and time string.")),
  dateTimeTxt: s.nullable(s.string("The formatted local date and time text.")),
  dateTimeWti: s.nullable(s.string("The local date and time with time zone information.")),
  dateTimeYmd: s.nullable(s.string("The local date in YYYY-MM-DD format.")),
  dateTimeUnix: s.nullable(s.number("The local date and time as a Unix timestamp when returned.")),
  time24: s.nullable(s.string("The 24-hour local time string.")),
  time12: s.nullable(s.string("The 12-hour local time string.")),
  week: s.nullable(s.integer("The week number.")),
  month: s.nullable(s.integer("The month number.")),
  year: s.nullable(s.integer("The year.")),
  yearAbbr: s.nullable(s.string("The abbreviated year.")),
  isDst: s.nullable(s.boolean("Whether daylight saving time is active.")),
  dstSavings: s.nullable(s.integer("The daylight saving time offset in seconds.")),
  geo: s.nullable(rawSchema),
  raw: rawSchema,
});
const astronomySchema = s.object("The normalized IPGeolocation.io astronomy result.", {
  location: s.nullable(rawSchema),
  date: s.nullable(s.string("The date used for the astronomy result.")),
  currentTime: s.nullable(s.string("The current local time returned by IPGeolocation.io.")),
  sunrise: s.nullable(s.string("The sunrise time.")),
  sunset: s.nullable(s.string("The sunset time.")),
  sunStatus: s.nullable(s.string("The current sun status when returned.")),
  solarNoon: s.nullable(s.string("The solar noon time.")),
  dayLength: s.nullable(s.string("The day length.")),
  moonrise: s.nullable(s.string("The moonrise time.")),
  moonset: s.nullable(s.string("The moonset time.")),
  moonStatus: s.nullable(s.string("The current moon status when returned.")),
  moonPhase: s.nullable(s.string("The moon phase name.")),
  moonIlluminationPercentage: s.nullable(s.number("The moon illumination percentage when returned.")),
  moonAngle: s.nullable(s.number("The moon angle when returned.")),
  raw: rawSchema,
});

export const ipgeolocationIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ip",
    description: "Look up IP geolocation data with optional field controls.",
    inputSchema: s.object(
      "The input payload for looking up an IP address.",
      {
        ip: ipAddressSchema,
        fields: fieldsSchema,
        excludes: excludesSchema,
        includeHostname: includeHostnameSchema,
        includeGeoAccuracy: includeGeoAccuracySchema,
        includeDmaCode: includeDmaCodeSchema,
        includeSecurity: includeSecuritySchema,
        includeAbuse: includeAbuseSchema,
        includeUserAgent: includeUserAgentSchema,
      },
      {
        optional: [
          "ip",
          "fields",
          "excludes",
          "includeHostname",
          "includeGeoAccuracy",
          "includeDmaCode",
          "includeSecurity",
          "includeAbuse",
          "includeUserAgent",
        ],
      },
    ),
    outputSchema: s.object("The response returned when looking up an IP address.", {
      geolocation: ipGeolocationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_timezone",
    description: "Get time zone information by IP address, coordinates, location, or time zone name.",
    inputSchema: s.object(
      "The input payload for getting IPGeolocation.io time zone data.",
      {
        ip: ipAddressSchema,
        lat: latitudeSchema,
        long: longitudeSchema,
        location: locationSchema,
        timeZone: timeZoneNameSchema,
      },
      { optional: ["ip", "lat", "long", "location", "timeZone"] },
    ),
    outputSchema: s.object("The response returned when getting time zone data.", {
      timeZone: timeZoneSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_astronomy",
    description: "Get sunrise, sunset, moonrise, moonset, and moon phase data for a location.",
    inputSchema: s.object(
      "The input payload for getting IPGeolocation.io astronomy data.",
      {
        ip: ipAddressSchema,
        lat: latitudeSchema,
        long: longitudeSchema,
        location: locationSchema,
        date: s.date("The date to use for astronomy data in YYYY-MM-DD format."),
      },
      { optional: ["ip", "lat", "long", "location", "date"] },
    ),
    outputSchema: s.object("The response returned when getting astronomy data.", {
      astronomy: astronomySchema,
    }),
  }),
];
