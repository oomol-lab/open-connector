import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ipdata_co";

const optionalIpInputSchema = s.object(
  "The input payload for an ipdata field lookup.",
  {
    ip: s.nonEmptyString("The IPv4 or IPv6 address to look up. Omit this field to use the caller's current IP."),
  },
  { optional: ["ip"] },
);
const requiredIpInputSchema = s.object("The input payload for looking up a specific IP address.", {
  ip: s.nonEmptyString("The IPv4 or IPv6 address to look up."),
});
const emptyInputSchema = s.object("The input payload for this ipdata action.", {});
const bulkLookupInputSchema = s.object("The input payload for performing a bulk IP lookup.", {
  ips: s.stringArray("The list of IP addresses to submit to the ipdata bulk lookup endpoint.", {
    minItems: 1,
    maxItems: 100,
    itemDescription: "An IPv4 or IPv6 address to include in the bulk lookup.",
  }),
});
const advancedAsnInputSchema = s.object("The input payload for looking up an autonomous system by ASN number.", {
  asn: s.positiveInteger("The autonomous system number as a positive integer."),
});

const languageSchema = s.looseObject("A language entry returned by ipdata.", {
  name: s.string("The language name."),
  native: s.string("The native language name."),
  code: s.string("The IETF or ISO language code."),
});
const asnSchema = s.looseObject("Autonomous system data returned by ipdata.", {
  asn: s.string("The autonomous system number in AS-prefixed format."),
  name: s.string("The autonomous system organization name."),
  domain: s.string("The autonomous system organization domain."),
  route: s.string("The route announced by the autonomous system."),
  type: s.string("The autonomous system organization type."),
});
const advancedAsnSchema = s.looseObject("Advanced autonomous system data returned by ipdata.", {
  asn: s.string("The autonomous system number in AS-prefixed format."),
  name: s.string("The autonomous system organization name."),
  domain: s.string("The autonomous system organization domain."),
  route: s.string("The route announced by the autonomous system."),
  type: s.string("The autonomous system organization type."),
  usage: s.string("The usage classification for the autonomous system."),
  ipv4_prefixes: s.array("The IPv4 prefixes announced by the autonomous system.", s.string("An IPv4 prefix.")),
  ipv6_prefixes: s.array("The IPv6 prefixes announced by the autonomous system.", s.string("An IPv6 prefix.")),
  num_ips: s.string("The number of IP addresses associated with the autonomous system."),
  registry: s.string("The regional internet registry that manages the autonomous system."),
  country: s.string("The ISO 3166-1 alpha-2 country code for the autonomous system."),
  date: s.string("The registration date for the autonomous system."),
  status: s.string("The allocation status for the autonomous system."),
  upstream: s.array(
    "The upstream autonomous systems associated with the autonomous system.",
    s.integer("An upstream ASN."),
  ),
  downstream: s.array(
    "The downstream autonomous systems associated with the autonomous system.",
    s.integer("A downstream ASN."),
  ),
  peers: s.array("The peer autonomous systems associated with the autonomous system.", s.integer("A peer ASN.")),
});
const threatSchema = s.looseObject("Threat intelligence data returned by ipdata.", {
  is_tor: s.boolean("Whether the IP address is identified as Tor."),
  is_icloud_relay: s.boolean("Whether the IP address is identified as iCloud Private Relay."),
  is_proxy: s.boolean("Whether the IP address is identified as a proxy."),
  is_anonymous: s.boolean("Whether the IP address is identified as anonymous."),
  is_known_attacker: s.boolean("Whether the IP address is identified as a known attacker."),
  is_known_abuser: s.boolean("Whether the IP address is identified as a known abuser."),
  is_threat: s.boolean("Whether the IP address is identified as a threat."),
  is_bogon: s.boolean("Whether the IP address is identified as a bogon."),
});
const companySchema = s.looseObject("Company data returned by ipdata.", {
  name: s.string("The company or organization name."),
  domain: s.string("The primary company domain name."),
  type: s.string("The organization type returned by ipdata."),
  network: s.string("The network associated with the company."),
});
const carrierSchema = s.looseObject("Carrier data returned by ipdata.", {
  name: s.string("The carrier or network operator name."),
  mcc: s.string("The mobile country code."),
  mnc: s.string("The mobile network code."),
});
const currencySchema = s.looseObject("Currency data returned by ipdata.", {
  code: s.string("The ISO currency code."),
  name: s.string("The currency name."),
  symbol: s.string("The currency symbol."),
  native: s.string("The native currency symbol."),
  plural: s.string("The plural currency name."),
});
const timeZoneSchema = s.looseObject("Time zone data returned by ipdata.", {
  name: s.string("The IANA timezone name."),
  abbr: s.string("The timezone abbreviation."),
  offset: s.string('The UTC offset string such as "-0700".'),
  is_dst: s.boolean("Whether daylight saving time is currently in effect."),
  current_time: s.string("The current local time in ISO 8601 format."),
});
const fullLookupOutputSchema = s.looseObject("The full IP intelligence payload returned by ipdata.", {
  ip: s.string("The IP address that was looked up."),
  is_eu: s.boolean("Whether the IP address is located in the European Union."),
  city: s.string("The city name."),
  region: s.string("The region or state name."),
  region_code: s.string("The region or state code."),
  country_name: s.string("The country name."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code."),
  continent_name: s.string("The continent name."),
  continent_code: s.string("The continent code."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
  postal: s.string("The postal or ZIP code."),
  calling_code: s.string("The international calling code."),
  flag: s.string("The flag asset returned by ipdata."),
  emoji_flag: s.string("The country flag emoji."),
  emoji_unicode: s.string("The Unicode codepoints for the country flag emoji."),
  languages: s.array("The languages associated with the IP location.", languageSchema),
  currency: currencySchema,
  time_zone: timeZoneSchema,
  threat: threatSchema,
  company: companySchema,
  carrier: carrierSchema,
  asn: asnSchema,
  count: s.integer("The request usage count returned by ipdata."),
});
const bulkLookupOutputSchema = s.array(
  "The array of IP intelligence payloads returned by the ipdata bulk lookup.",
  fullLookupOutputSchema,
);

function scalarStringOutput(fieldName: string, description: string): JsonSchema {
  return s.object(`The ${fieldName} value returned by ipdata.`, {
    [fieldName]: s.string(description),
  });
}

function scalarNumberOutput(fieldName: string, description: string): JsonSchema {
  return s.object(`The ${fieldName} value returned by ipdata.`, {
    [fieldName]: s.number(description),
  });
}

function scalarBooleanOutput(fieldName: string, description: string): JsonSchema {
  return s.object(`The ${fieldName} value returned by ipdata.`, {
    [fieldName]: s.boolean(description),
  });
}

const ipdataCoActionDefinitions = [
  defineProviderAction(service, {
    name: "lookup_current_ip",
    description: "Look up the caller's current IP address with the ipdata main API endpoint.",
    inputSchema: emptyInputSchema,
    outputSchema: fullLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_ip",
    description: "Look up a specific IP address with the ipdata main API endpoint.",
    inputSchema: requiredIpInputSchema,
    outputSchema: fullLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_current_ip_eu",
    description: "Look up the caller's current IP address with the ipdata EU API endpoint.",
    inputSchema: s.object("The input payload for looking up the caller's current IP address with the EU endpoint.", {}),
    outputSchema: fullLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_ip_eu",
    description: "Look up a specific IP address with the ipdata EU API endpoint.",
    inputSchema: requiredIpInputSchema,
    outputSchema: fullLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "bulk_lookup",
    description: "Look up up to 100 IP addresses in a single ipdata bulk API request.",
    inputSchema: bulkLookupInputSchema,
    outputSchema: bulkLookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_basic_asn_by_ip",
    description: "Look up a specific IP address and return only the ASN object from the ipdata response.",
    inputSchema: requiredIpInputSchema,
    outputSchema: asnSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_advanced_asn",
    description: "Look up advanced autonomous system details by ASN number with the ipdata ASN endpoint.",
    inputSchema: advancedAsnInputSchema,
    outputSchema: advancedAsnSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_by_ip",
    description: "Look up company data for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: companySchema,
  }),
  defineProviderAction(service, {
    name: "get_threat_by_ip",
    description: "Look up threat intelligence data for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: threatSchema,
  }),
  defineProviderAction(service, {
    name: "get_carrier_by_ip",
    description: "Look up carrier data for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: carrierSchema,
  }),
  defineProviderAction(service, {
    name: "get_currency_by_ip",
    description: "Look up currency data for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: currencySchema,
  }),
  defineProviderAction(service, {
    name: "get_time_zone_by_ip",
    description: "Look up time zone data for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: timeZoneSchema,
  }),
  defineProviderAction(service, {
    name: "get_languages_by_ip",
    description: "Look up language data for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: s.array("The language list returned by ipdata.", languageSchema),
  }),
  defineProviderAction(service, {
    name: "get_ip",
    description: "Look up the IP field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("ip", "The IP address that was looked up."),
  }),
  defineProviderAction(service, {
    name: "get_is_eu",
    description: "Look up the is_eu field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarBooleanOutput("is_eu", "Whether the IP address is located in the European Union."),
  }),
  defineProviderAction(service, {
    name: "get_city",
    description: "Look up the city field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("city", "The city name."),
  }),
  defineProviderAction(service, {
    name: "get_region",
    description: "Look up the region field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("region", "The region or state name."),
  }),
  defineProviderAction(service, {
    name: "get_region_code",
    description: "Look up the region_code field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("region_code", "The region or state code."),
  }),
  defineProviderAction(service, {
    name: "get_country_name",
    description: "Look up the country_name field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("country_name", "The country name."),
  }),
  defineProviderAction(service, {
    name: "get_country_code",
    description: "Look up the country_code field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("country_code", "The ISO 3166-1 alpha-2 country code."),
  }),
  defineProviderAction(service, {
    name: "get_continent_name",
    description: "Look up the continent_name field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("continent_name", "The continent name."),
  }),
  defineProviderAction(service, {
    name: "get_continent_code",
    description: "Look up the continent_code field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("continent_code", "The continent code."),
  }),
  defineProviderAction(service, {
    name: "get_latitude",
    description: "Look up the latitude field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarNumberOutput("latitude", "The latitude coordinate."),
  }),
  defineProviderAction(service, {
    name: "get_longitude",
    description: "Look up the longitude field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarNumberOutput("longitude", "The longitude coordinate."),
  }),
  defineProviderAction(service, {
    name: "get_postal",
    description: "Look up the postal field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("postal", "The postal or ZIP code."),
  }),
  defineProviderAction(service, {
    name: "get_calling_code",
    description: "Look up the calling_code field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("calling_code", "The international calling code."),
  }),
  defineProviderAction(service, {
    name: "get_flag",
    description: "Look up the flag field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("flag", "The flag asset returned by ipdata."),
  }),
  defineProviderAction(service, {
    name: "get_emoji_flag",
    description: "Look up the emoji_flag field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("emoji_flag", "The country flag emoji."),
  }),
  defineProviderAction(service, {
    name: "get_emoji_unicode",
    description: "Look up the emoji_unicode field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: scalarStringOutput("emoji_unicode", "The Unicode codepoints for the country flag emoji."),
  }),
  defineProviderAction(service, {
    name: "get_count",
    description: "Look up the count field for a specific IP address or the caller's current IP address.",
    inputSchema: optionalIpInputSchema,
    outputSchema: s.object("The count value returned by ipdata.", {
      count: s.integer("The request usage count returned by ipdata."),
    }),
  }),
];

export const ipdataCoActions: ActionDefinition[] = ipdataCoActionDefinitions;
