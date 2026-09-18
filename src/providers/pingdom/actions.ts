import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pingdom";

const idSchema = s.positiveInteger("A numeric identifier returned by the Pingdom API.");
const countsSchema = s.looseObject("Count metadata returned by the Pingdom checks list endpoint.", {
  total: s.integer("The total number of Pingdom checks."),
  limited: s.integer("The number of Pingdom checks after tag filtering was applied."),
  filtered: s.integer("The number of Pingdom checks after pagination was applied."),
});
const tagSchema = s.looseObject("A Pingdom tag attached to a check.", {
  name: s.string("The tag name returned by Pingdom."),
  type: s.string("The tag type returned by Pingdom."),
  count: s.integer("The number of resources using this tag."),
});
const checkSchema = s.looseObject("A Pingdom check returned by the checks API.", {
  id: idSchema,
  name: s.string("The human-readable name of the Pingdom check."),
  type: s.string("The Pingdom check type, such as http, tcp, or dns."),
  status: s.stringEnum("The current status of the Pingdom check.", [
    "up",
    "down",
    "unconfirmed_down",
    "unknown",
    "paused",
  ]),
  hostname: s.string("The target host monitored by the Pingdom check."),
  resolution: s.integer("How often Pingdom tests the check, in minutes."),
  tags: s.array("Tags attached to the Pingdom check.", tagSchema),
});
const detailedCheckSchema = s.looseObject("A detailed Pingdom check returned by the check detail endpoint.");
const probeSchema = s.looseObject("A Pingdom probe server.", {
  id: idSchema,
  country: s.string("The country where the Pingdom probe is located."),
  city: s.string("The city where the Pingdom probe is located."),
  name: s.string("The display name of the Pingdom probe location."),
  active: s.boolean("Whether the Pingdom probe is currently active."),
  hostname: s.string("The DNS name of the Pingdom probe server."),
  ip: s.string("The IPv4 address of the Pingdom probe server."),
  ipv6: s.string("The IPv6 address of the Pingdom probe server."),
  countryiso: s.string("The ISO country code for the Pingdom probe."),
});
const creditsSchema = s.looseObject("Credit and quota information returned by Pingdom.");

export const pingdomActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_checks",
    operationType: "read",
    description: "List Pingdom uptime checks with optional pagination and tag filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Pingdom checks.",
      {
        limit: s.integer("The maximum number of Pingdom checks to return.", { minimum: 1, maximum: 25000 }),
        offset: s.nonNegativeInteger("The zero-based pagination offset. Pingdom requires limit when offset is used."),
        showencryption: s.boolean("Whether to include each check's encryption setting."),
        include_tags: s.boolean("Whether to include tags for each Pingdom check."),
        include_severity: s.boolean("Whether to include severity for each Pingdom check."),
        tags: s.nonEmptyString("A comma-separated tag list used to filter Pingdom checks."),
      },
      { optional: ["limit", "offset", "showencryption", "include_tags", "include_severity", "tags"] },
    ),
    outputSchema: s.object("The Pingdom checks list response.", {
      checks: s.array("The Pingdom checks returned for this page.", checkSchema),
      counts: s.nullable(countsSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_check",
    operationType: "read",
    description: "Retrieve a detailed Pingdom uptime check by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving one Pingdom check.",
      {
        check_id: idSchema,
        include_teams: s.boolean("Whether to include team connections for the Pingdom check."),
      },
      { optional: ["include_teams"] },
    ),
    outputSchema: s.object("The Pingdom check detail response.", { check: detailedCheckSchema }),
  }),
  defineProviderAction(service, {
    name: "list_probes",
    operationType: "read",
    description: "List Pingdom probe servers and their location details.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Pingdom probe servers.",
      {
        limit: s.positiveInteger("The maximum number of Pingdom probes to return."),
        offset: s.nonNegativeInteger("The zero-based pagination offset. Pingdom requires limit when offset is used."),
        onlyactive: s.boolean("Whether to return only currently active Pingdom probes."),
        includedeleted: s.boolean("Whether to include old Pingdom probes that are no longer in use."),
      },
      { optional: ["limit", "offset", "onlyactive", "includedeleted"] },
    ),
    outputSchema: s.object("The Pingdom probes response.", {
      probes: s.array("The Pingdom probes returned by the API.", probeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Retrieve Pingdom account check and SMS credit information.",
    requiredScopes: [],
    inputSchema: s.object("This Pingdom action does not require input.", {}),
    outputSchema: s.object("The Pingdom credits response.", { credits: creditsSchema }),
  }),
];
