import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shodan";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const nonNegativeInteger = (description: string) => s.nonNegativeInteger(description);
const looseObjectSchema = s.looseObject("Raw JSON object returned by Shodan.");
const looseObjectArraySchema = s.array("List of raw JSON objects returned by Shodan.", looseObjectSchema);
const nonEmptyStringArray = (itemDescription: string, description: string) =>
  s.array(description, nonEmptyString(itemDescription), { minItems: 1 });

export const shodanActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_info",
    description: "Get API account information and remaining credits from Shodan.",
    inputSchema: s.object("Input parameters for retrieving Shodan API account information.", {}),
    outputSchema: s.object(
      "API account information returned by Shodan.",
      {
        plan: nonEmptyString("Subscription plan name returned by Shodan."),
        https: s.boolean("Whether HTTPS scanning access is enabled for the API key."),
        monitored_ips: nonNegativeInteger("Number of monitored IP addresses currently tracked by the account."),
        query_credits: nonNegativeInteger("Remaining query credits available to the API key."),
        scan_credits: nonNegativeInteger("Remaining scan credits available to the API key."),
        telnet: s.boolean("Whether telnet access is enabled for the API key."),
        unlocked: s.boolean("Whether unlocked search filters are enabled for the API key."),
        unlocked_left: nonNegativeInteger("Remaining unlocked query credits available to the API key."),
        usage_limits: looseObjectSchema,
      },
      { optional: ["https", "telnet", "unlocked", "unlocked_left", "usage_limits"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_hosts",
    description: "Search Shodan hosts with a query string and optional facet aggregation.",
    inputSchema: s.object(
      "Input parameters for searching hosts in Shodan.",
      {
        query: nonEmptyString("Search query string passed to the Shodan host search endpoint."),
        facets: nonEmptyString("Facet aggregation string such as org:5,country:3."),
        page: s.integer("1-based results page to request from Shodan.", { minimum: 1 }),
        minify: s.boolean("Whether to request minified banner results from Shodan."),
      },
      { optional: ["facets", "page", "minify"] },
    ),
    outputSchema: s.object(
      "Normalized host search results returned by Shodan.",
      {
        matches: looseObjectArraySchema,
        total: nonNegativeInteger("Total number of matching hosts."),
        facets: looseObjectSchema,
      },
      { optional: ["facets"] },
    ),
  }),
  defineProviderAction(service, {
    name: "count_search_results",
    description: "Count Shodan hosts matching a query and optionally return facet aggregations.",
    inputSchema: s.object(
      "Input parameters for counting Shodan host search results.",
      {
        query: nonEmptyString("Search query string passed to the Shodan host count endpoint."),
        facets: nonEmptyString("Facet aggregation string such as org:5,country:3."),
      },
      { optional: ["facets"] },
    ),
    outputSchema: s.object(
      "Normalized host count results returned by Shodan.",
      {
        total: nonNegativeInteger("Total number of matching hosts."),
        facets: looseObjectSchema,
      },
      { optional: ["facets"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_host",
    description: "Get Shodan host details for one IP address.",
    inputSchema: s.object(
      "Input parameters for retrieving Shodan host details.",
      {
        ip: nonEmptyString("IPv4 or IPv6 address to inspect in Shodan."),
        history: s.boolean("Whether to include historical banners for the host."),
        minify: s.boolean("Whether to request a minified host payload from Shodan."),
      },
      { optional: ["history", "minify"] },
    ),
    outputSchema: s.object("Normalized host details returned by Shodan.", {
      host: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_domain_info",
    description: "Get DNS domain information and known subdomains from Shodan.",
    inputSchema: s.object("Input parameters for retrieving Shodan domain information.", {
      domain: nonEmptyString("Domain name to inspect in the Shodan DNS endpoint."),
    }),
    outputSchema: s.object("Normalized domain information returned by Shodan.", {
      domain: nonEmptyString("Domain name returned by Shodan."),
      tags: s.array(
        "Tags returned by Shodan for the requested domain.",
        nonEmptyString("One tag returned by Shodan for the requested domain."),
      ),
      data: looseObjectArraySchema,
      subdomains: s.array(
        "Known subdomain labels returned by Shodan.",
        nonEmptyString("One subdomain label returned by Shodan."),
      ),
      more: s.boolean("Whether Shodan has additional subdomain data beyond the current payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "resolve_hostnames",
    description: "Resolve hostnames to IP addresses with the Shodan DNS resolve endpoint.",
    inputSchema: s.object("Input parameters for resolving hostnames with Shodan.", {
      hostnames: nonEmptyStringArray("One hostname to resolve in Shodan.", "Hostnames to resolve with Shodan."),
    }),
    outputSchema: s.object("Normalized hostname resolution results returned by Shodan.", {
      results: s.record(
        "Mapping of hostname to resolved IP address returned by Shodan.",
        nonEmptyString("Resolved IP address returned by Shodan."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "reverse_dns_lookup",
    description: "Reverse-resolve IP addresses to hostnames with the Shodan DNS reverse endpoint.",
    inputSchema: s.object("Input parameters for reverse-resolving IP addresses with Shodan.", {
      ips: nonEmptyStringArray(
        "One IP address to reverse-resolve in Shodan.",
        "IP addresses to reverse-resolve with Shodan.",
      ),
    }),
    outputSchema: s.object("Normalized reverse DNS results returned by Shodan.", {
      results: s.record(
        "Mapping of IP address to hostnames returned by Shodan.",
        s.array(
          "Hostnames returned by Shodan for one IP address.",
          nonEmptyString("One hostname returned by Shodan for the IP address."),
        ),
      ),
    }),
  }),
];
