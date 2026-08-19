import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ipregistry";

const ipAddressSchema = s.nonEmptyString("The IPv4 or IPv6 address to look up.");
const asnSchema = s.nonEmptyString("The Autonomous System Number to look up, such as AS15169 or 15169.");
const userAgentSchema = s.nonEmptyString("A user-agent string to parse.");
const fieldsSchema = s.nonEmptyString(
  "Optional Ipregistry field selection expression used to limit the returned payload.",
);
const ipDataOutputSchema = s.object("Ipregistry lookup response wrapper.", {
  data: s.looseObject("The Ipregistry response payload."),
});
const batchOutputSchema = s.object("Ipregistry batch response wrapper.", {
  results: s.array(
    "The Ipregistry result payloads in request order.",
    s.looseObject("One result payload returned by Ipregistry."),
  ),
});

export const ipregistryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_ip",
    description: "Look up geolocation, connection, company, currency, time zone, and security data for one IP address.",
    inputSchema: s.object(
      "Input parameters for looking up one IP address with Ipregistry.",
      {
        ipAddress: ipAddressSchema,
        includeHostname: s.boolean("Whether Ipregistry should resolve and include hostname data."),
        fields: fieldsSchema,
      },
      { optional: ["includeHostname", "fields"] },
    ),
    outputSchema: ipDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_lookup_ips",
    description: "Look up Ipregistry data for multiple IPv4 or IPv6 addresses in one request.",
    inputSchema: s.object(
      "Input parameters for batch IP lookup with Ipregistry.",
      {
        ipAddresses: s.array("The IPv4 or IPv6 addresses to look up.", ipAddressSchema, {
          minItems: 1,
          maxItems: 1024,
        }),
        includeHostname: s.boolean("Whether Ipregistry should resolve and include hostname data."),
        fields: fieldsSchema,
      },
      { optional: ["includeHostname", "fields"] },
    ),
    outputSchema: batchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "parse_user_agents",
    description: "Parse one or more user-agent strings with Ipregistry.",
    inputSchema: s.object(
      "Input parameters for parsing user-agent strings with Ipregistry.",
      {
        userAgents: s.array("The user-agent strings to parse.", userAgentSchema, {
          minItems: 1,
          maxItems: 256,
        }),
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: batchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_asn",
    description: "Look up data for one Autonomous System Number with Ipregistry.",
    inputSchema: s.object(
      "Input parameters for looking up one Autonomous System Number with Ipregistry.",
      {
        asn: asnSchema,
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: ipDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "batch_lookup_asns",
    description: "Look up data for multiple Autonomous System Numbers with Ipregistry.",
    inputSchema: s.object(
      "Input parameters for batch ASN lookup with Ipregistry.",
      {
        asns: s.array("The Autonomous System Numbers to look up.", asnSchema, {
          minItems: 1,
          maxItems: 16,
        }),
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: batchOutputSchema,
  }),
];
