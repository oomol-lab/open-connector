import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ipinfo_io";

const emptyInputSchema = s.object("This action does not require any input.", {});
const getIpInfoInputSchema = s.object(
  "The input payload for retrieving lite IP information.",
  {
    ip: s.string("The IPv4 or IPv6 address to look up. Omit this field to use the caller's current IP.", {
      minLength: 1,
    }),
  },
  { optional: ["ip"] },
);
const ipInputSchema = s.object("The input payload for this action.", {
  ip: s.nonEmptyString("The IPv4 or IPv6 address to look up."),
});
const scalarValueSchema = s.union([
  s.string("A string field value."),
  s.number("A numeric field value."),
  s.boolean("A boolean field value."),
  { type: "null" },
  s.record(
    "An object field value.",
    s.union([
      s.string("A string property value."),
      s.number("A numeric property value."),
      s.boolean("A boolean property value."),
      { type: "null" },
    ]),
  ),
]);

const looseObjectSchema = s.unknownObject("Additional object fields returned by IPinfo.");
const looseObjectArraySchema = s.array("A list of objects returned by IPinfo.", looseObjectSchema);
const companySchema = s.looseObject(
  "Company data returned by IPinfo when the token has access to business enrichment.",
  {
    name: s.string("The company or organization name."),
    domain: s.string("The primary domain associated with the company."),
    type: s.string("The organization type, such as business, ISP, education, or hosting."),
  },
);
const carrierSchema = s.looseObject("Carrier data returned by IPinfo for mobile network IP addresses.", {
  name: s.string("The mobile carrier or network organization name."),
  mcc: s.string("The mobile country code."),
  mnc: s.string("The mobile network code."),
});
const privacySchema = s.looseObject("Privacy detection data returned by IPinfo when the token has access to it.", {
  vpn: s.boolean("Whether the IP address is identified as a VPN exit node."),
  proxy: s.boolean("Whether the IP address is identified as a proxy."),
  tor: s.boolean("Whether the IP address is identified as a Tor exit node."),
  relay: s.boolean("Whether the IP address is identified as a relay service such as iCloud Private Relay."),
  hosting: s.boolean("Whether the IP address is identified as a hosting or datacenter network."),
  service: s.string("The detected privacy service provider name."),
});
const abuseSchema = s.looseObject("Abuse contact data returned by IPinfo when the token has access to it.", {
  address: s.string("The postal address of the abuse contact."),
  country: s.string("The country code of the abuse contact."),
  email: s.string("The abuse contact email address."),
  name: s.string("The abuse contact name."),
  network: s.string("The network range in CIDR notation."),
  phone: s.string("The abuse contact phone number."),
});
const domainsSchema = s.looseObject("Hosted domain data returned by IPinfo when the token has access to it.", {
  ip: s.string("The IP address used for the hosted domains lookup."),
  total: s.integer("The total number of hosted domains returned by IPinfo."),
  domains: s.stringArray("A sample of hosted domains associated with the IP address."),
});
const detailedAsnSchema = s.looseObject(
  "ASN data returned by IPinfo, enriched with the standalone ASN endpoint when available.",
  {
    asn: s.string("The autonomous system number."),
    name: s.string("The autonomous system organization name."),
    domain: s.string("The autonomous system organization domain."),
    route: s.string("The route associated with the IP-specific ASN summary."),
    type: s.string("The autonomous system organization type, such as ISP, hosting, or business."),
    country: s.string("The country code registered for the autonomous system."),
    allocated: s.string("The allocation date for the autonomous system."),
    registry: s.string("The regional internet registry for the autonomous system."),
    num_ips: s.integer("The number of IP addresses announced by the autonomous system."),
    prefixes: looseObjectArraySchema,
    prefixes6: looseObjectArraySchema,
    peers: s.stringArray("The peer ASNs."),
    upstreams: s.stringArray("The upstream ASNs."),
    downstreams: s.stringArray("The downstream ASNs."),
  },
);
const liteInfoSchema = s.looseObject("Lite IP data returned by IPinfo with an optional hostname enrichment.", {
  ip: s.string("The IP address that was looked up."),
  bogon: s.boolean("Whether the IP address is a bogon or private address."),
  asn: s.string("The autonomous system number."),
  as_name: s.string("The autonomous system organization name."),
  as_domain: s.string("The autonomous system organization domain."),
  country: s.string("The country name."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code."),
  continent: s.string("The continent name."),
  continent_code: s.string("The two-letter continent code."),
  hostname: s.string("The reverse DNS hostname when available."),
});
const geoSchema = s.looseObject("Geolocation data returned by the IPinfo Lookup API.", {
  city: s.string("The city name."),
  region: s.string("The region or state name."),
  region_code: s.string("The region or state code."),
  country: s.string("The country name."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code."),
  continent: s.string("The continent name."),
  continent_code: s.string("The two-letter continent code."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
  timezone: s.string("The IANA timezone name."),
  postal_code: s.string("The postal or ZIP code."),
  dma_code: s.string("The designated market area code."),
  geoname_id: s.integer("The GeoNames identifier."),
  radius: s.integer("The estimated location radius in kilometers."),
  last_changed: s.string("The date when the geolocation data last changed."),
});
const comprehensiveInfoSchema = s.looseObject(
  "The full legacy IPinfo response, enriched with standalone ASN details when the response includes an ASN.",
  {
    ip: s.string("The IP address that was looked up."),
    hostname: s.string("The reverse DNS hostname when available."),
    bogon: s.boolean("Whether the IP address is a bogon or private address."),
    anycast: s.boolean("Whether the IP address is identified as anycast."),
    city: s.string("The city name."),
    region: s.string("The region or state name."),
    country: s.string("The ISO 3166-1 alpha-2 country code returned by the legacy API."),
    loc: s.string("The latitude and longitude pair in latitude,longitude format."),
    org: s.string("The organization summary returned by the legacy API."),
    postal: s.string("The postal or ZIP code."),
    timezone: s.string("The IANA timezone name."),
    asn: detailedAsnSchema,
    company: companySchema,
    carrier: carrierSchema,
    privacy: privacySchema,
    abuse: abuseSchema,
    domains: domainsSchema,
  },
);
const fieldOutputSchema = s.object("The returned value for a specific IPinfo field lookup.", {
  value: scalarValueSchema,
});
const tokenRequestsSchema = s.looseObject("Usage counters returned for the IPinfo token.", {
  day: s.integer("The number of requests used today."),
  month: s.integer("The number of requests used this month."),
  limit: s.integer("The request limit associated with the token."),
  remaining: s.integer("The remaining request budget."),
});
const tokenInfoSchema = s.looseObject("Account and usage metadata returned for the current IPinfo token.", {
  token: s.string("The token echoed by the token information endpoint."),
  name: s.string("The account or token label when available."),
  email: s.string("The account email when available."),
  requests: tokenRequestsSchema,
  features: s.unknownObject("The feature access map returned for the token."),
});
const mapIpsInputSchema = s.object(
  "The input payload for creating an IPinfo map report.",
  {
    ipAddresses: s.stringArray("The IP addresses to upload to the IPinfo map tool.", {
      minItems: 1,
      maxItems: 500_000,
      itemDescription: "An IP address to include in the map upload.",
    }),
    cli: s.integer("The optional CLI mode flag accepted by the IPinfo map tool."),
  },
  { optional: ["cli"] },
);
const mapIpsOutputSchema = s.object("The generated map report metadata returned by IPinfo.", {
  status: s.string("The status returned by the IPinfo map endpoint."),
  reportUrl: s.url("The generated IPinfo map report URL."),
});
const batchLookupInputSchema = s.object(
  "The input payload for the legacy batch lookup endpoint.",
  {
    ips: s.stringArray("The IP addresses or field paths to send to the batch lookup endpoint.", {
      minItems: 1,
      maxItems: 1000,
      itemDescription: "An IP address or batch lookup path item.",
    }),
    filter: s.boolean("Whether null results should be omitted from the returned map."),
  },
  { optional: ["filter"] },
);
const batchLiteLookupInputSchema = s.object("The input payload for the Lite batch lookup endpoint.", {
  queries: s.stringArray("The Lite API queries to send to the batch lookup endpoint.", {
    minItems: 1,
    maxItems: 1000,
    itemDescription: "An IP address or field path item for the Lite batch endpoint.",
  }),
});

const liteFieldNames = ["ip", "asn", "as_name", "as_domain", "country_code", "country", "continent_code", "continent"];
const coreFieldNames = [
  "ip",
  "hostname",
  "geo",
  "geo/city",
  "geo/region",
  "geo/region_code",
  "geo/country",
  "geo/country_code",
  "geo/continent",
  "geo/continent_code",
  "geo/latitude",
  "geo/longitude",
  "geo/timezone",
  "geo/postal_code",
  "as",
  "as/asn",
  "as/name",
  "as/domain",
  "as/type",
  "is_anonymous",
  "is_anycast",
  "is_hosting",
  "is_mobile",
  "is_satellite",
];
const plusFieldNames = [
  "ip",
  "geo",
  "geo/city",
  "geo/region",
  "geo/region_code",
  "geo/country",
  "geo/country_code",
  "geo/continent",
  "geo/continent_code",
  "geo/latitude",
  "geo/longitude",
  "geo/timezone",
  "geo/postal_code",
  "geo/dma_code",
  "geo/geoname_id",
  "geo/radius",
  "geo/last_changed",
  "as",
  "as/asn",
  "as/name",
  "as/domain",
  "as/type",
  "as/last_changed",
  "mobile",
  "mobile/name",
  "mobile/mcc",
  "mobile/mnc",
  "anonymous",
  "anonymous/name",
  "anonymous/is_proxy",
  "anonymous/is_relay",
  "anonymous/is_tor",
  "anonymous/is_vpn",
  "is_anonymous",
  "is_anycast",
  "is_hosting",
  "is_mobile",
  "is_satellite",
];

function stringFieldOutput(outputKey: string, outputDescription: string): JsonSchema {
  return s.object("The output payload for this action.", {
    [outputKey]: s.string(outputDescription),
  });
}

export const ipinfoIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_ip_info",
    description:
      "Retrieve Lite IP information for a specific IP address or for the caller's current IP when no IP is provided.",
    inputSchema: getIpInfoInputSchema,
    outputSchema: liteInfoSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_ip",
    description: "Retrieve the caller's current public IP address as plain text.",
    inputSchema: emptyInputSchema,
    outputSchema: stringFieldOutput("ip", "The caller's current public IP address."),
  }),
  defineProviderAction(service, {
    name: "get_current_ip_info",
    description:
      "Retrieve the full legacy IPinfo profile for the caller's current IP address, including location, ASN, company, privacy, carrier, abuse, and hosted domain data when available.",
    inputSchema: emptyInputSchema,
    outputSchema: comprehensiveInfoSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_loc",
    description: "Retrieve the caller's current coordinates in latitude,longitude format.",
    inputSchema: emptyInputSchema,
    outputSchema: stringFieldOutput("location", "The coordinates returned by IPinfo in latitude,longitude format."),
  }),
  defineProviderAction(service, {
    name: "get_current_region",
    description: "Retrieve the caller's current region or state name.",
    inputSchema: emptyInputSchema,
    outputSchema: stringFieldOutput("region", "The current region or state name."),
  }),
  defineProviderAction(service, {
    name: "get_ip_by_ip",
    description: "Retrieve the requested IP address as plain text through the field filtering endpoint.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("ip", "The requested IP address as returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_ip_info_by_ip",
    description:
      "Retrieve the full legacy IPinfo profile for a specific IP address, including location, ASN, company, privacy, carrier, abuse, and hosted domain data when available.",
    inputSchema: ipInputSchema,
    outputSchema: comprehensiveInfoSchema,
  }),
  defineProviderAction(service, {
    name: "get_location_by_ip",
    description: "Retrieve coordinates for a specific IP address in latitude,longitude format.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("location", "The coordinates returned by IPinfo in latitude,longitude format."),
  }),
  defineProviderAction(service, {
    name: "get_geo_by_ip",
    description:
      "Retrieve Lookup API geolocation data for a specific IP address, including city, region, country, coordinates, timezone, and postal metadata.",
    inputSchema: ipInputSchema,
    outputSchema: geoSchema,
  }),
  defineProviderAction(service, {
    name: "get_city_by_ip",
    description: "Retrieve the city name for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("city", "The city name returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_region_by_ip",
    description: "Retrieve the region or state name for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("region", "The region or state name returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_country_by_ip",
    description: "Retrieve the ISO 3166-1 alpha-2 country code for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("country_code", "The ISO 3166-1 alpha-2 country code returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_postal_by_ip",
    description: "Retrieve the postal or ZIP code for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("postal", "The postal or ZIP code returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_timezone_by_ip",
    description: "Retrieve the IANA timezone name for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("timezone", "The IANA timezone name returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_hostname_by_ip",
    description: "Retrieve the reverse DNS hostname for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("hostname", "The reverse DNS hostname returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_org_by_ip",
    description: "Retrieve the organization summary for a specific IP address.",
    inputSchema: ipInputSchema,
    outputSchema: stringFieldOutput("org", "The organization summary returned by IPinfo."),
  }),
  defineProviderAction(service, {
    name: "get_company_info",
    description: "Retrieve company enrichment data for a specific IP address when the token includes that dataset.",
    inputSchema: ipInputSchema,
    outputSchema: companySchema,
  }),
  defineProviderAction(service, {
    name: "get_carrier_info",
    description: "Retrieve carrier enrichment data for a specific IP address when the token includes that dataset.",
    inputSchema: ipInputSchema,
    outputSchema: s.object("The carrier enrichment payload for the requested IP address.", {
      carrier: carrierSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_privacy_details",
    description:
      "Retrieve privacy detection flags for a specific IP address when the token includes privacy enrichment.",
    inputSchema: ipInputSchema,
    outputSchema: privacySchema,
  }),
  defineProviderAction(service, {
    name: "get_abuse_contact",
    description: "Retrieve abuse contact data for a specific IP address when the token includes that dataset.",
    inputSchema: ipInputSchema,
    outputSchema: s.object("The abuse contact payload for the requested IP address.", {
      abuse: abuseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_lite_field_by_ip",
    description: "Retrieve a single field from the Lite API for a specific IP address.",
    inputSchema: s.object("The input payload for retrieving a specific Lite API field.", {
      ip: s.nonEmptyString("The IPv4 or IPv6 address to look up."),
      field: s.stringEnum("The Lite API field path to retrieve for the requested IP address.", liteFieldNames),
    }),
    outputSchema: fieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_core_field_by_me",
    description: "Retrieve a single Lookup API core field for the caller's current IP address.",
    inputSchema: s.object("The input payload for retrieving a specific Lookup API core field.", {
      field: s.stringEnum("The Lookup API field path to retrieve for the caller's current IP.", coreFieldNames),
    }),
    outputSchema: fieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_plus_field_by_me",
    description: "Retrieve a single Lookup API plus field for the caller's current IP address.",
    inputSchema: s.object("The input payload for retrieving a specific Lookup API plus field.", {
      field: s.stringEnum("The Lookup API field path to retrieve for the caller's current IP.", plusFieldNames),
    }),
    outputSchema: fieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_lookup",
    description:
      "Look up multiple IPinfo legacy or Lite-compatible paths in a single batch request through the legacy batch endpoint.",
    inputSchema: batchLookupInputSchema,
    outputSchema: s.unknownObject("A map from each batch query string to the corresponding IPinfo batch result."),
  }),
  defineProviderAction(service, {
    name: "batch_lite_lookup",
    description: "Look up multiple Lite API IPs or field paths in a single batch request.",
    inputSchema: batchLiteLookupInputSchema,
    outputSchema: s.unknownObject("A map from each Lite batch query string to the corresponding IPinfo result."),
  }),
  defineProviderAction(service, {
    name: "map_ips",
    description: "Upload up to 500,000 IP addresses to the IPinfo map tool and return the generated report URL.",
    inputSchema: mapIpsInputSchema,
    outputSchema: mapIpsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_token_info",
    description: "Retrieve account and usage metadata for the current IPinfo token.",
    inputSchema: emptyInputSchema,
    outputSchema: tokenInfoSchema,
  }),
];
