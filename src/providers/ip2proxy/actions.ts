import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ip2proxy";

const proxyPackages = ["PX1", "PX2", "PX3", "PX4", "PX5", "PX6", "PX7", "PX8", "PX9", "PX10", "PX11"];

const lookupIpInputSchema = s.object("The input payload for one proxy detection lookup.", {
  ip: s.anyOf("The IPv4 or IPv6 address to look up.", [
    s.string({ format: "ipv4", description: "The IPv4 address to look up." }),
    s.string({ format: "ipv6", description: "The IPv6 address to look up." }),
  ]),
  package: {
    ...s.stringEnum(
      "The IP2Proxy package code to query. The official API defaults to PX1 when omitted.",
      proxyPackages,
    ),
    default: "PX1",
  },
});

const lookupIpOutputSchema = s.looseRequiredObject(
  "The proxy detection payload returned by IP2Proxy.",
  {
    response: s.nonEmptyString("The response status string returned by IP2Proxy."),
    countryCode: s.string("The two-character ISO 3166 country code."),
    countryName: s.string("The country name."),
    regionName: s.string("The region or state name."),
    cityName: s.string("The city name."),
    isp: s.string("The ISP or company name."),
    domain: s.string("The internet domain associated with the IP range."),
    usageType: s.string("The usage type classification returned by IP2Proxy."),
    asn: s.string("The autonomous system number."),
    as: s.string("The autonomous system name."),
    lastSeen: s.integer("How many days ago the proxy was last seen."),
    proxyType: s.string("The proxy type returned by IP2Proxy."),
    isProxy: s.string("Whether the IP address is identified as a proxy."),
    threat: s.string("The security threat classification returned by IP2Proxy."),
    provider: s.string("The VPN provider name when IP2Proxy has one."),
    creditsConsumed: s.integer("The credit count consumed by the query."),
  },
  {
    optional: [
      "countryCode",
      "countryName",
      "regionName",
      "cityName",
      "isp",
      "domain",
      "usageType",
      "asn",
      "as",
      "lastSeen",
      "proxyType",
      "isProxy",
      "threat",
      "provider",
      "creditsConsumed",
    ],
  },
);

export const ip2proxyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ip",
    description: "Detect whether one IPv4 or IPv6 address is a proxy and return the official IP2Proxy lookup payload.",
    inputSchema: lookupIpInputSchema,
    outputSchema: lookupIpOutputSchema,
  }),
];
