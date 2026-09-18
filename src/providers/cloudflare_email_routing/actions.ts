import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudflare_email_routing";
const rulesRead = "Email Routing Rules Read";
const rulesWrite = "Email Routing Rules Write";
const addressesRead = "Email Routing Addresses Read";

const ruleId = s.nonEmptyString("The Cloudflare routing rule ID.");
const zoneId = s.nonEmptyString("The Cloudflare zone ID.");
const accountId = s.nonEmptyString("The Cloudflare account ID.");
const actionSchema = s.object(
  "An action applied to a matching email.",
  {
    type: s.stringEnum(["drop", "forward", "worker"], { description: "The action type." }),
    value: s.stringArray("Destination email addresses or Worker names.", { minItems: 1 }),
  },
  { required: ["type"], optional: ["value"] },
);
const matcherSchema = s.object(
  "A condition matching an incoming email.",
  {
    type: s.stringEnum(["all", "literal"], { description: "The matcher type." }),
    field: s.stringEnum(["to"], { description: "The email field to match." }),
    value: s.string({ description: "The literal email address to match.", maxLength: 90 }),
  },
  { required: ["type"], optional: ["field", "value"] },
);
const ruleSchema = s.object(
  "A Cloudflare Email Routing rule.",
  {
    id: s.string("The routing rule ID."),
    actions: s.array("Actions applied to matching email.", actionSchema),
    enabled: s.boolean("Whether the rule is enabled."),
    matchers: s.array("Conditions matching incoming email.", matcherSchema),
    name: s.string("The rule name."),
    priority: s.number("The rule priority.", { minimum: 0 }),
    source: s.stringEnum(["api", "wrangler"], { description: "Who manages the rule." }),
    ownerWorkerTag: s.string({
      description: "The public script tag of the Worker that owns a Wrangler-managed rule.",
      maxLength: 32,
    }),
    zone: s.looseObject("Zone information returned for account rule listings."),
  },
  {
    required: ["id"],
    optional: ["actions", "enabled", "matchers", "name", "priority", "source", "ownerWorkerTag", "zone"],
  },
);
const addressSchema = s.object(
  "A Cloudflare Email Routing destination address. Verified addresses may be used by forward actions.",
  {
    id: s.string("The destination address ID."),
    email: s.email("The destination email address."),
    created: s.dateTime("When the address was created."),
    modified: s.dateTime("When the address was last modified."),
    verified: s.nullableString("When the address was verified; null means not verified."),
  },
  { required: ["id", "email"], optional: ["created", "modified", "verified"] },
);
const resultInfoSchema = s.looseObject("Cloudflare pagination metadata.");
const paginationFields = {
  page: s.positiveInteger("The result page number."),
  perPage: s.integer({ description: "The page size.", minimum: 5, maximum: 50 }),
};
const ruleFields = {
  actions: s.array("Actions applied to matching email.", actionSchema, { minItems: 1 }),
  matchers: s.array("Conditions matching incoming email.", matcherSchema, { minItems: 1 }),
  enabled: s.boolean("Whether the rule is enabled."),
  name: s.string({ description: "The rule name.", maxLength: 256 }),
  priority: s.number("The rule priority.", { minimum: 0 }),
  source: s.stringEnum(["api", "wrangler"], { description: "Who manages the rule." }),
  ownerWorkerTag: s.string({
    description: "The public script tag required when source is wrangler.",
    maxLength: 32,
  }),
};

const createInput = s.object(
  "The input payload for this action.",
  { zoneId, ...ruleFields },
  {
    required: ["actions", "matchers"],
    optional: ["zoneId", "enabled", "name", "priority", "source", "ownerWorkerTag"],
  },
);
const updateInput = s.object(
  "The input payload for this action.",
  { zoneId, ruleId, ...ruleFields },
  {
    required: ["ruleId", "actions", "matchers"],
    optional: ["zoneId", "enabled", "name", "priority", "source", "ownerWorkerTag"],
  },
);
const listRulesInput: JsonSchema = {
  ...s.object(
    "The input payload for this action. zoneId and accountId are mutually exclusive.",
    { zoneId, accountId, enabled: s.boolean("Filter by enabled routing rules."), ...paginationFields },
    { optional: ["zoneId", "accountId", "enabled", "page", "perPage"] },
  ),
  not: { required: ["zoneId", "accountId"] },
};

export const cloudflareEmailRoutingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_routing_rules",
    operationType: "read",
    description: "List Cloudflare Email Routing rules for a zone or account.",
    requiredScopes: [rulesRead],
    providerPermissions: [rulesRead],
    inputSchema: listRulesInput,
    outputSchema: s.object(
      "The output payload for this action.",
      { rules: s.array("Routing rules.", ruleSchema), resultInfo: resultInfoSchema },
      { optional: ["resultInfo"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_routing_rule",
    operationType: "write",
    description:
      "Create a Cloudflare Email Routing rule in a zone. Forward actions require verified destination addresses.",
    requiredScopes: [rulesWrite],
    providerPermissions: [rulesWrite],
    inputSchema: createInput,
    outputSchema: s.object("The output payload for this action.", { rule: ruleSchema }),
  }),
  defineProviderAction(service, {
    name: "update_routing_rule",
    operationType: "destructive",
    description: "Replace a Cloudflare Email Routing rule in a zone.",
    requiredScopes: [rulesWrite],
    providerPermissions: [rulesWrite],
    inputSchema: updateInput,
    outputSchema: s.object("The output payload for this action.", { rule: ruleSchema }),
  }),
  defineProviderAction(service, {
    name: "delete_routing_rule",
    operationType: "destructive",
    description: "Delete a Cloudflare Email Routing rule from a zone.",
    requiredScopes: [rulesWrite],
    providerPermissions: [rulesWrite],
    inputSchema: s.object(
      "The input payload for this action.",
      { zoneId, ruleId },
      { required: ["ruleId"], optional: ["zoneId"] },
    ),
    outputSchema: s.object("The output payload for this action.", {
      id: ruleId,
      deleted: s.boolean("Whether deletion completed."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_destination_addresses",
    operationType: "read",
    description:
      "List Cloudflare Email Routing destination addresses. Use addresses with a non-null verified timestamp for forward actions.",
    requiredScopes: [addressesRead],
    providerPermissions: [addressesRead],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        accountId,
        direction: s.stringEnum(["asc", "desc"], { description: "The result sort direction." }),
        verified: s.boolean("Filter by destination address verification status."),
        ...paginationFields,
      },
      { optional: ["accountId", "direction", "verified", "page", "perPage"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        addresses: s.array("Destination addresses, including verification status.", addressSchema),
        resultInfo: resultInfoSchema,
      },
      { optional: ["resultInfo"] },
    ),
  }),
];
