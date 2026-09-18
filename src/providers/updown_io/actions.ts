import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "updown_io";

const checkTypeSchema = s.stringEnum("The type of check to create or update.", [
  "https",
  "http",
  "icmp",
  "pulse",
  "tcp",
  "tcps",
]);
const httpVerbSchema = s.stringEnum("The HTTP verb used by the check.", [
  "GET/HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const disabledLocationSchema = s.stringEnum("A monitoring location code supported by updown.io.", [
  "lan",
  "mia",
  "bhs",
  "rbx",
  "fra",
  "cap",
  "hel",
  "sin",
  "tok",
  "syd",
]);
const apdexValueSchema = s.union(
  [s.literal(0.125), s.literal(0.25), s.literal(0.5), s.literal(1), s.literal(2), s.literal(4), s.literal(8)],
  { description: "The APDEX threshold in seconds accepted by updown.io." },
);
const checkTokenSchema = s.nonEmptyString("The unique token of the updown.io check.");
const createOrUpdateCheckFields = {
  url: s.url("The URL to monitor. It is required for all checks except pulse checks."),
  type: checkTypeSchema,
  period: s.integer("The check interval in seconds accepted by updown.io.", { minimum: 15, maximum: 2_592_000 }),
  apdex_t: apdexValueSchema,
  enabled: s.boolean("Whether the check is enabled."),
  published: s.boolean("Whether the public status page is enabled."),
  alias: s.nonEmptyString("A human-readable alias for the check."),
  string_match: s.nonEmptyString("A string that must be present in the response body."),
  mute_until: s.nonEmptyString("A time, 'recovery', or 'forever' value supported by updown.io."),
  http_verb: httpVerbSchema,
  http_body: s.string("The HTTP request body sent with the check."),
  disabled_locations: s.array("Monitoring locations disabled for this check.", disabledLocationSchema, {
    minItems: 1,
  }),
  recipients: s.stringArray("Recipients selected for this check.", {
    minItems: 1,
    itemDescription: "A recipient identifier returned by the updown.io recipients API.",
  }),
  custom_headers: s.record(
    "Custom HTTP headers sent by updown.io when performing the check.",
    s.string("A custom HTTP header value sent by the check."),
  ),
};
const checkSchema = s.looseObject("A monitoring check returned by the updown.io API.", {
  token: s.string("The unique token of the check."),
  url: s.string("The monitored URL."),
  type: s.string("The type of check."),
  alias: s.nullableString("The human-readable alias of the check."),
  last_status: s.nullableInteger("The last HTTP status code returned by the monitored endpoint."),
  uptime: s.number("The uptime percentage reported by updown.io."),
  down: s.boolean("Whether the check is currently down."),
  down_since: s.nullableString("When the check went down, if it is currently down."),
  up_since: s.nullableString("When the check most recently recovered."),
  error: s.nullableString("The last error message returned by updown.io, if any."),
  period: s.integer("The check interval in seconds."),
  apdex_t: s.number("The APDEX threshold in seconds."),
  string_match: s.nullableString("The response body string required by the check."),
  enabled: s.boolean("Whether the check is enabled."),
  published: s.boolean("Whether the public status page is enabled."),
  disabled_locations: s.stringArray("Monitoring locations disabled for this check."),
  recipients: s.stringArray("Recipients selected for this check."),
  last_check_at: s.nullableString("When updown.io last executed the check."),
  next_check_at: s.nullableString("When updown.io will next execute the check."),
  created_at: s.string("When the check was created."),
  mute_until: s.nullableString("The mute-until setting returned by updown.io."),
  favicon_url: s.nullableString("The favicon URL discovered for the monitored endpoint."),
  custom_headers: s.record("Custom HTTP headers configured for the check.", s.string("A custom HTTP header value.")),
  http_verb: s.nullableString("The HTTP verb used by the check."),
  http_body: s.nullableString("The HTTP request body sent by the check."),
  ssl: s.looseObject("SSL information returned by updown.io, if present."),
  domain: s.looseObject("Domain metadata returned by updown.io, if present."),
});
const nodeSchema = s.object("A single updown.io monitoring node.", {
  ip: s.string("The IPv4 address of the updown.io node."),
  ip6: s.string("The IPv6 address of the updown.io node."),
  city: s.string("The city where the node is located."),
  country: s.string("The country where the node is located."),
  country_code: s.string("The lowercase country code of the node."),
  lat: s.number("The latitude of the node."),
  lng: s.number("The longitude of the node."),
});

export const updownIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_checks",
    operationType: "read",
    description: "List all monitoring checks available in the updown.io account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing updown.io checks.", {}),
    outputSchema: s.array("All checks returned by the updown.io API.", checkSchema),
  }),
  defineProviderAction(service, {
    name: "get_check",
    operationType: "read",
    description: "Get a single monitoring check from updown.io by token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting an updown.io check.", { token: checkTokenSchema }),
    outputSchema: checkSchema,
  }),
  defineProviderAction(service, {
    name: "create_check",
    operationType: "write",
    description: "Create a new monitoring check in the updown.io account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating an updown.io check.", createOrUpdateCheckFields, {
      optional: Object.keys(createOrUpdateCheckFields),
    }),
    outputSchema: checkSchema,
  }),
  defineProviderAction(service, {
    name: "update_check",
    operationType: "write",
    description: "Update an existing monitoring check in the updown.io account.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for updating an updown.io check.",
      { token: checkTokenSchema, ...createOrUpdateCheckFields },
      { optional: Object.keys(createOrUpdateCheckFields) },
    ),
    outputSchema: checkSchema,
  }),
  defineProviderAction(service, {
    name: "delete_check",
    operationType: "destructive",
    description: "Delete a monitoring check from the updown.io account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting an updown.io check.", { token: checkTokenSchema }),
    outputSchema: s.object("The deletion acknowledgement returned by updown.io.", {
      deleted: s.boolean("Whether the check was deleted successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_nodes",
    operationType: "read",
    description: "List all updown.io monitoring nodes and their network metadata.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing updown.io nodes.", {}),
    outputSchema: s.record("All monitoring nodes keyed by their node identifier.", nodeSchema),
  }),
  defineProviderAction(service, {
    name: "list_node_ips",
    operationType: "read",
    description: "List all updown.io monitoring node IP addresses.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing updown.io node IP addresses.", {}),
    outputSchema: s.stringArray("All monitoring node IP addresses returned by updown.io."),
  }),
  defineProviderAction(service, {
    name: "list_node_ipv4",
    operationType: "read",
    description: "List all updown.io monitoring node IPv4 addresses.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing updown.io node IPv4 addresses.", {}),
    outputSchema: s.stringArray("All monitoring node IPv4 addresses returned by updown.io."),
  }),
  defineProviderAction(service, {
    name: "list_node_ipv6",
    operationType: "read",
    description: "List all updown.io monitoring node IPv6 addresses.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing updown.io node IPv6 addresses.", {}),
    outputSchema: s.stringArray("All monitoring node IPv6 addresses returned by updown.io."),
  }),
];
