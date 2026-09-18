import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "iplocate";

const ipAddressSchema = s.nonEmptyString("The IPv4 or IPv6 address to look up.");
const includeSchema = s.array(
  "The IPLocate response fields to include, such as country_code, asn, or privacy.is_vpn.",
  s.nonEmptyString("One IPLocate response field name."),
  { minItems: 1 },
);

const asnSchema = s.looseObject("The autonomous system details returned by IPLocate.", {
  asn: s.string("The autonomous system number, such as AS15169."),
  route: s.string("The announced network route."),
  netname: s.string("The network name."),
  name: s.string("The autonomous system organization name."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code registered for the ASN."),
  domain: s.string("The organization domain."),
  type: s.string("The ASN type, such as isp, hosting, business, education, or government."),
  rir: s.string("The regional internet registry."),
});

const privacySchema = s.looseObject("The privacy and threat flags returned by IPLocate.", {
  is_abuser: s.boolean("Whether the IP is on a known spam or abuse blocklist."),
  is_anonymous: s.boolean("Whether the IP is anonymous."),
  is_bogon: s.boolean("Whether the IP is a bogon or reserved address."),
  is_hosting: s.boolean("Whether the IP belongs to a hosting provider."),
  is_icloud_relay: s.boolean("Whether the IP is using iCloud Private Relay."),
  is_proxy: s.boolean("Whether the IP is using a proxy service."),
  is_tor: s.boolean("Whether the IP is using Tor."),
  is_vpn: s.boolean("Whether the IP is using a VPN service."),
});

const lookupResultSchema = s.looseObject("The IPLocate lookup result.", {
  ip: s.string("The IP address returned by IPLocate."),
  country: s.string("The country name."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code."),
  is_eu: s.boolean("Whether the country is a member of the European Union."),
  city: s.string("The city name."),
  continent: s.string("The continent name."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
  time_zone: s.string("The IANA timezone name."),
  postal_code: s.string("The postal or ZIP code."),
  subdivision: s.string("The state, region, or subdivision name."),
  currency_code: s.string("The ISO 4217 currency code."),
  calling_code: s.string("The international calling code."),
  network: s.string("The network range in CIDR notation."),
  is_anycast: s.boolean("Whether the IP address is identified as anycast."),
  is_satellite: s.boolean("Whether the IP address is identified as satellite internet."),
  asn: asnSchema,
  privacy: privacySchema,
  company: s.looseObject("The company information associated with the IP address."),
  hosting: s.looseObject("The hosting provider information returned by IPLocate."),
  abuse: s.looseObject("The abuse contact information returned by IPLocate."),
});

const lookupOutputSchema = s.actionOutput(
  {
    result: lookupResultSchema,
  },
  "The wrapped IPLocate lookup output.",
);

export const iplocateActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ip",
    operationType: "read",
    description: "Look up IPLocate geolocation, ASN, privacy, hosting, company, and abuse data for one IP address.",
    inputSchema: s.actionInput(
      {
        ip: ipAddressSchema,
        include: includeSchema,
      },
      ["ip"],
      "Input parameters for an IPLocate IP lookup.",
    ),
    outputSchema: lookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_self",
    operationType: "read",
    description:
      "Look up IPLocate geolocation and threat intelligence data for the connector server's outgoing IP address.",
    inputSchema: s.actionInput(
      {
        include: includeSchema,
      },
      [],
      "Input parameters for looking up the caller IP seen by IPLocate.",
    ),
    outputSchema: lookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_lookup",
    operationType: "read",
    description:
      "Look up IPLocate data for multiple IP addresses in one JSON request and preserve per-IP inline errors.",
    inputSchema: s.actionInput(
      {
        ipAddresses: s.array(
          "The IPv4 or IPv6 addresses to look up. IPLocate allows up to 1,000 IPs per batch request.",
          ipAddressSchema,
          { minItems: 1, maxItems: 1000 },
        ),
      },
      ["ipAddresses"],
      "Input parameters for an IPLocate batch lookup.",
    ),
    outputSchema: s.actionOutput(
      {
        requestedCount: s.integer("The number of IP addresses submitted to IPLocate."),
        resultsByIp: s.record(
          "IPLocate batch results keyed by the original input IP address.",
          s.anyOf("A lookup result or inline error returned for one IP address.", [
            lookupResultSchema,
            s.looseObject("An inline IPLocate batch error for one input IP."),
          ]),
        ),
      },
      "The wrapped IPLocate batch lookup output.",
    ),
  }),
];
