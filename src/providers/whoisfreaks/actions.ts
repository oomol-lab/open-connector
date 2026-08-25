import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "whoisfreaks";

const domainSchema = s.nonEmptyString("The domain name to query.");
const looseObjectSchema = s.unknownObject("A raw JSON object returned by WhoisFreaks.");
const paginationSchema = s.object("Normalized pagination metadata for WhoisFreaks list results.", {
  currentPage: s.integer("The current result page.", { minimum: 1 }),
  totalPages: s.integer("The total number of available pages.", { minimum: 1 }),
  totalRecords: s.integer("The total number of available records.", { minimum: 0 }),
});

export const whoisfreaksActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "check_domain_availability",
    description: "Check whether one domain is available for registration and optionally request suggestions.",
    inputSchema: s.actionInput(
      {
        domain: domainSchema,
        sug: s.boolean("Whether WhoisFreaks should return suggested alternatives."),
        count: s.integer("The number of suggestions to return when suggestions are enabled.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      ["domain"],
      "Input for checking domain availability.",
    ),
    outputSchema: s.actionOutput({
      availability: s.array(
        "The availability results returned by WhoisFreaks.",
        s.object("One domain availability result returned by WhoisFreaks.", {
          domain: s.nonEmptyString("The domain name returned in one availability result."),
          domainAvailability: s.boolean("Whether the returned domain is available for registration."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain_whois",
    description: "Retrieve the live WHOIS record for one domain.",
    inputSchema: s.actionInput(
      {
        domainName: s.nonEmptyString("The domain name used for live WHOIS lookup."),
      },
      ["domainName"],
      "Input for live domain WHOIS lookup.",
    ),
    outputSchema: s.actionOutput({
      whois: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_subdomains",
    description: "List known subdomains for one domain with optional paging and status filters.",
    inputSchema: s.actionInput(
      {
        domain: domainSchema,
        page: s.integer("The 1-based page number to fetch.", { minimum: 1 }),
        status: s.stringEnum("The subdomain status filter returned by WhoisFreaks.", ["active", "inactive"]),
        after: s.date("Return subdomain records created after this YYYY-MM-DD date."),
        before: s.date("Return subdomain records created before this YYYY-MM-DD date."),
      },
      ["domain"],
      "Input for subdomain discovery.",
    ),
    outputSchema: s.actionOutput({
      domain: domainSchema,
      subdomains: s.array(
        "The subdomain records returned by WhoisFreaks.",
        s.object("One subdomain record returned by WhoisFreaks.", {
          subdomain: s.nonEmptyString("The fully qualified subdomain name."),
          first_seen: s.nonEmptyString("The first date when the subdomain was observed."),
          last_seen: s.nonEmptyString("The last date when the subdomain was observed."),
          inactive_from: s.nonEmptyString("The date when the subdomain became inactive, or N/A."),
        }),
      ),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_ip_whois",
    description: "Retrieve the IP WHOIS record for one IP address.",
    inputSchema: s.actionInput(
      {
        ip: s.anyOf("The IPv4 or IPv6 address to query.", [
          s.string({ format: "ipv4", description: "The IPv4 address to query." }),
          s.string({ format: "ipv6", description: "The IPv6 address to query." }),
        ]),
      },
      ["ip"],
      "Input for IP WHOIS lookup.",
    ),
    outputSchema: s.actionOutput({
      ipWhois: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_asn_whois",
    description: "Retrieve the ASN WHOIS record for one autonomous system number.",
    inputSchema: s.actionInput(
      {
        asn: s.nonEmptyString("The ASN identifier with or without the AS prefix."),
      },
      ["asn"],
      "Input for ASN WHOIS lookup.",
    ),
    outputSchema: s.actionOutput({
      asnWhois: looseObjectSchema,
    }),
  }),
];
