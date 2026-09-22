import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bitwarden";

const idSchema = s.uuid("The Bitwarden resource identifier.");
const optionalIdSchema = s.optional(s.nullable(s.uuid("The Bitwarden resource identifier.")));

const associationSchema = s.looseObject("A Bitwarden resource association and its permissions.", {
  id: idSchema,
  readOnly: s.optional(s.boolean("Whether the association grants read-only access.")),
  hidePasswords: s.optional(s.boolean("Whether passwords are hidden from members through this association.")),
  manage: s.optional(s.boolean("Whether the association grants management access.")),
});

const collectionSchema = s.looseObject("A Bitwarden organization collection.", {
  object: s.optional(s.string("The Bitwarden object type.")),
  id: idSchema,
  name: s.string("The collection name."),
  externalId: s.optional(s.nullable(s.string("The external identifier linked to the collection."))),
  groups: s.optional(s.array("The groups associated with the collection.", associationSchema)),
});

const groupSchema = s.looseObject("A Bitwarden organization group.", {
  object: s.optional(s.string("The Bitwarden object type.")),
  id: idSchema,
  name: s.string("The group name."),
  externalId: s.optional(s.nullable(s.string("The external identifier linked to the group."))),
  collections: s.optional(s.array("The collections associated with the group.", associationSchema)),
});

const memberSchema = s.looseObject("A Bitwarden organization member.", {
  object: s.optional(s.string("The Bitwarden object type.")),
  id: idSchema,
  userId: s.nullable(s.uuid("The member's identifier across Bitwarden.")),
  name: s.optional(s.nullable(s.string("The member's profile name."))),
  email: s.email("The member's email address."),
  type: s.integer("The numeric Bitwarden organization role type."),
  status: s.integer("The numeric Bitwarden organization membership status."),
  externalId: s.optional(s.nullable(s.string("The external identifier linked to the member."))),
  twoFactorEnabled: s.boolean("Whether the member has two-step login enabled."),
  resetPasswordEnrolled: s.boolean("Whether the member enrolled in organization password-reset assistance."),
  ssoExternalId: s.optional(s.nullable(s.string("The member identifier from the connected identity provider."))),
  collections: s.optional(s.array("The collections associated with the member.", associationSchema)),
  permissions: s.optional(s.looseObject("The member's custom organization permissions.", {})),
});

const policySchema = s.looseObject("A Bitwarden organization policy.", {
  object: s.optional(s.string("The Bitwarden object type.")),
  id: idSchema,
  type: s.integer("The numeric Bitwarden policy type."),
  enabled: s.boolean("Whether the policy is enabled and enforced."),
  data: s.optional(s.nullable(s.looseObject("The policy-specific configuration data.", {}))),
});

const eventSchema = s.looseObject("A Bitwarden organization audit event.", {
  object: s.string("The Bitwarden object type."),
  type: s.integer("The numeric Bitwarden event type."),
  date: s.dateTime("The event time in RFC 3339 format."),
  actingUserId: optionalIdSchema,
  itemId: optionalIdSchema,
  collectionId: optionalIdSchema,
  groupId: optionalIdSchema,
  policyId: optionalIdSchema,
  memberId: optionalIdSchema,
  secretId: optionalIdSchema,
  projectId: optionalIdSchema,
  ipAddress: s.optional(s.nullable(s.string("The IP address associated with the event."))),
});

const subscriptionSectionSchema = s.looseObject("One Bitwarden subscription product section.", {
  seats: s.optional(s.nullable(s.integer("The configured seat count."))),
  maxAutoScaleSeats: s.optional(s.nullable(s.integer("The maximum seat count allowed through automatic scaling."))),
  storage: s.optional(s.nullable(s.integer("The configured storage quantity."))),
  serviceAccounts: s.optional(s.nullable(s.integer("The configured service-account count."))),
  maxAutoScaleServiceAccounts: s.optional(
    s.nullable(s.integer("The maximum service-account count allowed through automatic scaling.")),
  ),
});

function resourceIdInput(description: string) {
  return s.object(description, { id: idSchema });
}

function listInput(description: string) {
  return s.object(
    description,
    {
      continuationToken: s.optional(
        s.nonEmptyString("The opaque cursor returned by a previous call to this list action."),
      ),
    },
    { optional: ["continuationToken"] },
  );
}

function listOutput(description: string, field: string, itemDescription: string, item: JsonSchema) {
  return s.object(description, {
    [field]: s.array(itemDescription, item),
    continuationToken: s.nullable(s.string("The cursor for the next page, or null when no next page is available.")),
  });
}

export const bitwardenActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_collections",
    operationType: "read",
    description: "List collections in the Bitwarden organization.",
    inputSchema: listInput("The pagination input for listing Bitwarden collections."),
    outputSchema: listOutput(
      "The Bitwarden organization collections.",
      "collections",
      "The collections returned by Bitwarden.",
      collectionSchema,
    ),
    followUpActions: ["bitwarden.get_collection"],
  }),
  defineProviderAction(service, {
    name: "get_collection",
    operationType: "read",
    description: "Get one Bitwarden organization collection.",
    inputSchema: resourceIdInput("The collection to retrieve."),
    outputSchema: s.object("The requested Bitwarden collection.", {
      collection: collectionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description: "List Bitwarden organization audit events with optional filters and pagination.",
    inputSchema: s.object(
      "The filters and pagination cursor for listing Bitwarden audit events.",
      {
        start: s.optional(s.dateTime("The inclusive start time for the event range.")),
        end: s.optional(s.dateTime("The inclusive end time for the event range.")),
        actingUserId: optionalIdSchema,
        itemId: optionalIdSchema,
        secretId: optionalIdSchema,
        projectId: optionalIdSchema,
        continuationToken: s.optional(s.nonEmptyString("The opaque cursor returned by a previous list_events call.")),
      },
      {
        optional: ["start", "end", "actingUserId", "itemId", "secretId", "projectId", "continuationToken"],
      },
    ),
    outputSchema: s.object("A page of Bitwarden organization audit events.", {
      events: s.array("The audit events returned for this page.", eventSchema),
      continuationToken: s.nullable(s.string("The cursor for the next page, or null when no next page is available.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List groups in the Bitwarden organization.",
    inputSchema: listInput("The pagination input for listing Bitwarden groups."),
    outputSchema: listOutput(
      "The Bitwarden organization groups.",
      "groups",
      "The groups returned by Bitwarden.",
      groupSchema,
    ),
    followUpActions: ["bitwarden.get_group"],
  }),
  defineProviderAction(service, {
    name: "get_group",
    operationType: "read",
    description: "Get one Bitwarden organization group.",
    inputSchema: resourceIdInput("The group to retrieve."),
    outputSchema: s.object("The requested Bitwarden group.", { group: groupSchema }),
    followUpActions: ["bitwarden.get_group_member_ids"],
  }),
  defineProviderAction(service, {
    name: "get_group_member_ids",
    operationType: "read",
    description: "List the member IDs associated with one Bitwarden organization group.",
    inputSchema: resourceIdInput("The group whose member IDs should be retrieved."),
    outputSchema: s.object("The member IDs associated with the Bitwarden group.", {
      memberIds: s.array("The associated member IDs.", idSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List members in the Bitwarden organization.",
    inputSchema: listInput("The pagination input for listing Bitwarden members."),
    outputSchema: listOutput(
      "The Bitwarden organization members.",
      "members",
      "The members returned by Bitwarden.",
      memberSchema,
    ),
    followUpActions: ["bitwarden.get_member"],
  }),
  defineProviderAction(service, {
    name: "get_member",
    operationType: "read",
    description: "Get one Bitwarden organization member.",
    inputSchema: resourceIdInput("The member to retrieve."),
    outputSchema: s.object("The requested Bitwarden member.", { member: memberSchema }),
    followUpActions: ["bitwarden.get_member_group_ids"],
  }),
  defineProviderAction(service, {
    name: "get_member_group_ids",
    operationType: "read",
    description: "List the group IDs associated with one Bitwarden organization member.",
    inputSchema: resourceIdInput("The member whose group IDs should be retrieved."),
    outputSchema: s.object("The group IDs associated with the Bitwarden member.", {
      groupIds: s.array("The associated group IDs.", idSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_policies",
    operationType: "read",
    description: "List policies in the Bitwarden organization.",
    inputSchema: listInput("The pagination input for listing Bitwarden policies."),
    outputSchema: listOutput(
      "The Bitwarden organization policies.",
      "policies",
      "The policies returned by Bitwarden.",
      policySchema,
    ),
    followUpActions: ["bitwarden.get_policy"],
  }),
  defineProviderAction(service, {
    name: "get_policy",
    operationType: "read",
    description: "Get one Bitwarden organization policy by its numeric policy type.",
    inputSchema: s.object("The policy type to retrieve.", {
      type: s.integer("The numeric Bitwarden policy type.", { minimum: 0, maximum: 22 }),
    }),
    outputSchema: s.object("The requested Bitwarden policy.", { policy: policySchema }),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Get the organization's Bitwarden subscription capacity details.",
    inputSchema: s.object("The input for retrieving Bitwarden subscription details.", {}),
    outputSchema: s.object("The Bitwarden organization subscription details.", {
      passwordManager: s.optional(
        s.nullable(s.describe(subscriptionSectionSchema, "The Password Manager subscription.")),
      ),
      secretsManager: s.optional(
        s.nullable(s.describe(subscriptionSectionSchema, "The Secrets Manager subscription.")),
      ),
    }),
  }),
];
