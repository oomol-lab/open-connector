import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "internetdata";

function ipv4OrIpv6(description: string) {
  return s.anyOf(description, [s.string({ format: "ipv4", description }), s.string({ format: "ipv6", description })]);
}

const ipInputSchema = s.object(
  "The input payload for one IP lookup.",
  {
    ip: ipv4OrIpv6("The IPv4 or IPv6 address to query."),
  },
  { required: ["ip"] },
);

const ipLookupOutputSchema = s.looseObject("The IP data payload returned by InternetData.", {
  ip: s.string("The queried IP address."),
  hostname: s.string("The reverse DNS hostname of the IP address."),
  is_bogon: s.boolean("Whether the IP address is a bogon (private, reserved, or unallocated)."),
  is_tor: s.boolean("Whether the IP address is a Tor exit node."),
  is_relay: s.boolean("Whether the IP address is a privacy relay egress, such as iCloud Private Relay."),
  is_anycast: s.boolean("Whether the IP address is anycast."),
  is_carrier: s.boolean("Whether the IP address belongs to a mobile carrier."),
  is_satellite: s.boolean("Whether the IP address belongs to a satellite network."),
  location: s.looseObject("The country-level location of the IP address.", {
    continent: s.string("The continent code."),
    continent_name: s.string("The continent name."),
    country: s.string("The ISO 3166-1 alpha-2 country code."),
    country_name: s.string("The country name."),
    timezone: s.string("The IANA time zone of the country."),
  }),
  asn: s.looseObject("The autonomous system that announces the IP address.", {
    asn: s.integer("The autonomous system number."),
    name: s.string("The autonomous system name."),
    domain: s.string("The autonomous system's domain."),
    type: s.string("The autonomous system type, such as isp, hosting, business, or education."),
    prefix: s.string("The announced prefix that contains the IP address."),
  }),
  company: s.looseObject("The company that operates the IP address.", {
    name: s.string("The company name."),
    domain: s.string("The company domain."),
  }),
  abuse: s.looseObject("The abuse contact for the IP address.", {
    email: s.string("The abuse contact email address."),
  }),
});

export const actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ip",
    operationType: "read",
    description:
      "Retrieve the country, ASN, company, abuse contact, hostname, and Tor, relay, and network flags for one IPv4 or IPv6 address.",
    inputSchema: ipInputSchema,
    outputSchema: ipLookupOutputSchema,
  }),
];
