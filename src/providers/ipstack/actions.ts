import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ipstack";

const fieldsSchema = s.array(
  "Optional ipstack response fields to include, such as country_code or location.country_flag.",
  s.nonEmptyString("A response field path accepted by ipstack."),
  { minItems: 1 },
);
const currentIpInputSchema = s.object(
  "Input parameters for looking up the requester IP address with ipstack.",
  {
    fields: fieldsSchema,
  },
  { optional: ["fields"] },
);
const ipLookupInputSchema = s.object(
  "Input parameters for looking up a single IP address with ipstack.",
  {
    ip: s.nonEmptyString("The IPv4 or IPv6 address to look up."),
    fields: fieldsSchema,
  },
  { optional: ["fields"] },
);
const bulkLookupInputSchema = s.object(
  "Input parameters for looking up multiple IP addresses with ipstack.",
  {
    ips: s.stringArray("The IPv4 or IPv6 addresses to look up.", {
      minItems: 1,
      maxItems: 50,
      itemDescription: "An IPv4 or IPv6 address to include in the bulk lookup.",
    }),
    fields: fieldsSchema,
  },
  { optional: ["fields"] },
);
const currencySchema = s.looseObject("Currency details returned by ipstack.", {
  code: s.string("The ISO currency code."),
  name: s.string("The currency name."),
  plural: s.string("The plural currency name."),
  symbol: s.string("The currency symbol."),
  symbol_native: s.string("The native currency symbol."),
});
const languageSchema = s.looseObject("Language details returned by ipstack.", {
  code: s.string("The language code."),
  name: s.string("The language name."),
  native: s.string("The native language name."),
});
const locationSchema = s.looseObject("Location details returned by ipstack.", {
  geoname_id: s.integer("The GeoNames location identifier."),
  capital: s.string("The country capital."),
  languages: s.array("The languages associated with the country.", languageSchema),
  country_flag: s.url("The URL of the country flag image."),
  country_flag_emoji: s.string("The country flag emoji."),
  country_flag_emoji_unicode: s.string("The Unicode codepoints for the country flag emoji."),
  calling_code: s.string("The international calling code."),
  is_eu: s.boolean("Whether the location is in the European Union."),
});
const timeZoneSchema = s.looseObject("Time zone details returned by ipstack.", {
  id: s.string("The IANA time zone identifier."),
  current_time: s.dateTime("The current local time in the time zone."),
  gmt_offset: s.integer("The GMT offset in seconds."),
  code: s.string("The time zone abbreviation."),
  is_daylight_saving: s.boolean("Whether daylight saving time is active."),
});
const connectionSchema = s.looseObject("Connection details returned by ipstack.", {
  asn: s.integer("The autonomous system number."),
  isp: s.string("The internet service provider name."),
});
const securitySchema = s.looseObject("Security details returned by ipstack.", {
  is_proxy: s.boolean("Whether the IP address is identified as a proxy."),
  proxy_type: s.string("The detected proxy type."),
  is_crawler: s.boolean("Whether the IP address is identified as a crawler."),
  crawler_name: s.string("The detected crawler name."),
  crawler_type: s.string("The detected crawler type."),
  is_tor: s.boolean("Whether the IP address is identified as Tor."),
  threat_level: s.string("The detected threat level."),
  threat_types: s.array("The detected threat type labels.", s.string("A threat type label.")),
});
const ipstackLookupOutputSchema = s.looseObject("The IP geolocation payload returned by ipstack.", {
  ip: s.string("The IP address that was looked up."),
  type: s.string("The IP address type, such as ipv4 or ipv6."),
  continent_code: s.string("The continent code."),
  continent_name: s.string("The continent name."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code."),
  country_name: s.string("The country name."),
  region_code: s.string("The region or state code."),
  region_name: s.string("The region or state name."),
  city: s.string("The city name."),
  zip: s.string("The postal or ZIP code."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
  location: locationSchema,
  time_zone: timeZoneSchema,
  currency: currencySchema,
  connection: connectionSchema,
  security: securitySchema,
});

export const ipstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_current_ip",
    description: "Look up the requester IP address and return ipstack geolocation data.",
    inputSchema: currentIpInputSchema,
    outputSchema: ipstackLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_ip",
    description: "Look up a single IPv4 or IPv6 address and return ipstack geolocation data.",
    inputSchema: ipLookupInputSchema,
    outputSchema: ipstackLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "bulk_lookup",
    description: "Look up multiple IPv4 or IPv6 addresses in one ipstack request.",
    inputSchema: bulkLookupInputSchema,
    outputSchema: s.array(
      "The ipstack geolocation payloads returned for the submitted IPs.",
      ipstackLookupOutputSchema,
    ),
  }),
];
