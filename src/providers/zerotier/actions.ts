import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zerotier";

const singleOutput = (description: string) =>
  s.requiredObject(description, {
    result: s.unknown("The ZeroTier API response payload for the requested resource."),
  });

const listOutput = (description: string) =>
  s.requiredObject(description, {
    items: s.array("The ZeroTier API resources returned for this request.", s.unknown("One ZeroTier API resource.")),
  });

const statusOutput = (description: string) =>
  s.requiredObject(description, {
    ok: s.boolean("Whether the ZeroTier API operation completed successfully."),
    result: s.unknown("The ZeroTier API response payload when one was returned."),
  });

const networkIdParam = s.nonEmptyString("The ZeroTier network ID (16-character hex string).");
const memberIdParam = s.nonEmptyString("The member device/node ID (10-character hex string).");
const orgIdParam = s.nonEmptyString("The ZeroTier organization ID.");
const nameParam = s.string("The display name to set.");
const descriptionParam = s.string("The description to set (may be an empty string).");

const listNetworksInput = s.object(
  "Filters for listing ZeroTier networks.",
  {
    orgId: s.string("v2 only: organization ID to filter by. Falls back to the connection's orgId field when omitted."),
    stats: s.boolean("v2 only: include device statistics for each network."),
    permissionCheck: s.stringArray(
      "v2 only: permission names to check for each network; results include a permissions map.",
    ),
  },
  { required: [] },
);

const memberIdsArray = s.array(
  "Member device IDs (10-character hex strings).",
  s.nonEmptyString("A member device ID."),
);

const iamResourceType = s.stringEnum(["org", "network-group", "network"], {
  description: "The ZeroTier v2 resource kind the IAM assignment applies to.",
});

const iamTupleSchema = s.requiredObject("A principal-to-roles assignment.", {
  principal: s.nonEmptyString("Email address of the user or service account."),
  roles: s.array(
    "One or more ZeroTier IAM role names.",
    s.nonEmptyString("An IAM role such as Owner, Admin, Editor, Viewer, NetworkGroupAdmin, or NetworkAdmin."),
  ),
});

export const zerotierActions: ActionDefinition[] = [
  // ── Shared actions (dispatch on the connection's apiVersion) ──────────────
  defineProviderAction(service, {
    name: "list_networks",
    operationType: "read",
    description:
      "List ZeroTier networks visible to the configured token. Works on both API versions; orgId, stats, and permissionCheck only apply to v2.",
    inputSchema: listNetworksInput,
    outputSchema: listOutput("The list of ZeroTier networks."),
  }),
  defineProviderAction(service, {
    name: "get_network",
    operationType: "read",
    description: "Get one ZeroTier network by ID, including its config and member counts.",
    inputSchema: s.object(
      "Input for fetching one ZeroTier network.",
      { networkId: networkIdParam },
      { required: ["networkId"] },
    ),
    outputSchema: singleOutput("The ZeroTier network object."),
  }),
  defineProviderAction(service, {
    name: "create_network",
    operationType: "write",
    description:
      "Create a ZeroTier network. For v1 sends {config}; for v2 sends {name, description, config} and requires networkGroupId (the group the network is created under).",
    inputSchema: s.object(
      "Input for creating a ZeroTier network.",
      {
        networkGroupId: s.string("v2 only, required: the network group ID to create the network under."),
        name: nameParam,
        description: descriptionParam,
        config: s.looseObject(
          "Network configuration. v1 accepts name/private/enableBroadcast/mtu/multicastLimit/routes/ipAssignmentPools/v4AssignMode/v6AssignMode/dns; v2 accepts private/enableBroadcast/mtu/multicastLimit/routes/v4Subnet/v4IpAssignmentPools/v4AssignmentMode/v6Subnet/v6IpAssignmentPools/v6AssignmentMode/dns.",
        ),
      },
      { required: [] },
    ),
    outputSchema: singleOutput("The created ZeroTier network."),
  }),
  defineProviderAction(service, {
    name: "update_network",
    operationType: "write",
    description: "Update a ZeroTier network's name, description, and/or configuration fields.",
    inputSchema: s.object(
      "Input for updating a ZeroTier network.",
      {
        networkId: networkIdParam,
        name: nameParam,
        description: descriptionParam,
        config: s.looseObject(
          "Partial network configuration. v1 fields: name/private/enableBroadcast/mtu/multicastLimit/routes/ipAssignmentPools/v4AssignMode/v6AssignMode/dns; v2 fields: private/enableBroadcast/mtu/multicastLimit/routes/v4Subnet/v4IpAssignmentPools/v4AssignmentMode/v6Subnet/v6IpAssignmentPools/v6AssignmentMode/dns.",
        ),
      },
      { required: ["networkId"] },
    ),
    outputSchema: singleOutput("The updated ZeroTier network."),
  }),
  defineProviderAction(service, {
    name: "delete_network",
    operationType: "destructive",
    description: "Delete a ZeroTier network permanently.",
    inputSchema: s.object(
      "Input for deleting a ZeroTier network.",
      { networkId: networkIdParam },
      { required: ["networkId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "list_members",
    operationType: "read",
    description: "List all members (devices) joined to a ZeroTier network.",
    inputSchema: s.object(
      "Input for listing network members.",
      { networkId: networkIdParam },
      { required: ["networkId"] },
    ),
    outputSchema: listOutput("The list of network members."),
  }),
  defineProviderAction(service, {
    name: "get_member",
    operationType: "read",
    description: "Get one member of a ZeroTier network, including authorization and IP assignment state.",
    inputSchema: s.object(
      "Input for fetching one network member.",
      { networkId: networkIdParam, memberId: memberIdParam },
      { required: ["networkId", "memberId"] },
    ),
    outputSchema: singleOutput("The network member object."),
  }),
  defineProviderAction(service, {
    name: "update_member",
    operationType: "write",
    description:
      "Update a network member. v1 fields: name, description, authorized, activeBridge, noAutoAssignIps, ipAssignments. v2 fields: name, description, activeBridge, noAutoAssignIps, ipv4Assignments, ipv6Assignments.",
    inputSchema: s.object(
      "Input for updating a network member.",
      {
        networkId: networkIdParam,
        memberId: memberIdParam,
        name: nameParam,
        description: descriptionParam,
        authorized: s.boolean("v1 only: whether the member is authorized on the network."),
        activeBridge: s.boolean("Whether this device acts as an active bridge."),
        noAutoAssignIps: s.boolean("Disable automatic IP assignment for this member."),
        ipAssignments: s.stringArray("v1 only: static IP assignments replacing the current list."),
        ipv4Assignments: s.stringArray("v2 only: static IPv4 assignments."),
        ipv6Assignments: s.stringArray("v2 only: static IPv6 assignments."),
      },
      { required: ["networkId", "memberId"] },
    ),
    outputSchema: singleOutput("The updated network member."),
  }),
  defineProviderAction(service, {
    name: "delete_member",
    operationType: "destructive",
    description: "Remove a member from a ZeroTier network.",
    inputSchema: s.object(
      "Input for deleting a network member.",
      { networkId: networkIdParam, memberId: memberIdParam },
      { required: ["networkId", "memberId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "authorize_member",
    operationType: "write",
    description: "Authorize one member on a ZeroTier network.",
    inputSchema: s.object(
      "Input for authorizing a network member.",
      { networkId: networkIdParam, memberId: memberIdParam },
      { required: ["networkId", "memberId"] },
    ),
    outputSchema: singleOutput("The authorized network member."),
  }),
  defineProviderAction(service, {
    name: "deauthorize_member",
    operationType: "write",
    description: "Revoke authorization for one member on a ZeroTier network.",
    inputSchema: s.object(
      "Input for de-authorizing a network member.",
      { networkId: networkIdParam, memberId: memberIdParam },
      { required: ["networkId", "memberId"] },
    ),
    outputSchema: singleOutput("The de-authorized network member."),
  }),
  defineProviderAction(service, {
    name: "get_org",
    operationType: "read",
    description:
      "Get a ZeroTier organization. For v1, returns the current user's org when orgId is omitted, or /org/{orgId}. For v2, orgId is required.",
    inputSchema: s.object(
      "Input for fetching an organization.",
      { orgId: s.string("The organization ID (required for v2).") },
      { required: [] },
    ),
    outputSchema: singleOutput("The ZeroTier organization object."),
  }),

  // ── v1-only actions (Legacy Central, api.zerotier.com) ────────────────────
  defineProviderAction(service, {
    name: "get_status",
    operationType: "read",
    description: "v1 only: get ZeroTier Legacy Central status, including the authenticated user, version, and uptime.",
    inputSchema: s.object("No input.", {}, { required: [] }),
    outputSchema: singleOutput("The Central status object."),
  }),
  defineProviderAction(service, {
    name: "get_random_token",
    operationType: "read",
    description: "v1 only: get a server-generated random token value.",
    inputSchema: s.object("No input.", {}, { required: [] }),
    outputSchema: singleOutput("The random token object."),
  }),
  defineProviderAction(service, {
    name: "list_org_members",
    operationType: "read",
    description: "v1 only: list user members of an organization.",
    inputSchema: s.object("Input for listing org members.", { orgId: orgIdParam }, { required: ["orgId"] }),
    outputSchema: listOutput("The organization members."),
  }),
  defineProviderAction(service, {
    name: "list_invitations",
    operationType: "read",
    description: "v1 only: list organization invitations for the current user.",
    inputSchema: s.object("No input.", {}, { required: [] }),
    outputSchema: listOutput("The organization invitations."),
  }),
  defineProviderAction(service, {
    name: "create_invitation",
    operationType: "write",
    description: "v1 only: send an organization invitation to an email address.",
    inputSchema: s.object(
      "Input for creating an organization invitation.",
      { email: s.email("The email address to invite.") },
      { required: ["email"] },
    ),
    outputSchema: singleOutput("The created invitation."),
  }),
  defineProviderAction(service, {
    name: "get_invitation",
    operationType: "read",
    description: "v1 only: get one organization invitation by ID.",
    inputSchema: s.object(
      "Input for fetching an invitation.",
      { invitationId: s.nonEmptyString("The invitation ID.") },
      { required: ["invitationId"] },
    ),
    outputSchema: singleOutput("The invitation object."),
  }),
  defineProviderAction(service, {
    name: "accept_invitation",
    operationType: "write",
    description: "v1 only: accept an organization invitation.",
    inputSchema: s.object(
      "Input for accepting an invitation.",
      { invitationId: s.nonEmptyString("The invitation ID.") },
      { required: ["invitationId"] },
    ),
    outputSchema: singleOutput("The accepted invitation."),
  }),
  defineProviderAction(service, {
    name: "decline_invitation",
    operationType: "destructive",
    description: "v1 only: decline or cancel an organization invitation.",
    inputSchema: s.object(
      "Input for declining an invitation.",
      { invitationId: s.nonEmptyString("The invitation ID.") },
      { required: ["invitationId"] },
    ),
    outputSchema: statusOutput("Decline result."),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "v1 only: get a ZeroTier user by ID.",
    inputSchema: s.object(
      "Input for fetching a user.",
      { userId: s.nonEmptyString("The user ID.") },
      { required: ["userId"] },
    ),
    outputSchema: singleOutput("The user object."),
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description: "v1 only: update a user's profile fields.",
    inputSchema: s.object(
      "Input for updating a user.",
      {
        userId: s.nonEmptyString("The user ID."),
        displayName: s.string("The display name to set."),
        email: s.string("The email address to set."),
        smsNumber: s.string("The SMS number to set."),
      },
      { required: ["userId"] },
    ),
    outputSchema: singleOutput("The updated user."),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "v1 only: delete a ZeroTier user account by ID.",
    inputSchema: s.object(
      "Input for deleting a user.",
      { userId: s.nonEmptyString("The user ID.") },
      { required: ["userId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "add_user_token",
    operationType: "write",
    description: "v1 only: create an API token for a user. The token value is returned once.",
    inputSchema: s.object(
      "Input for creating a user API token.",
      { userId: s.nonEmptyString("The user ID."), tokenName: s.nonEmptyString("A name for the new token.") },
      { required: ["userId", "tokenName"] },
    ),
    outputSchema: singleOutput("The created API token (secret shown once)."),
  }),
  defineProviderAction(service, {
    name: "delete_user_token",
    operationType: "destructive",
    description: "v1 only: delete one of a user's API tokens by name.",
    inputSchema: s.object(
      "Input for deleting a user API token.",
      { userId: s.nonEmptyString("The user ID."), tokenName: s.nonEmptyString("The token name to delete.") },
      { required: ["userId", "tokenName"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "set_network_user_permissions",
    operationType: "write",
    description: "v1 only: set a specific user's permissions on a network.",
    inputSchema: s.object(
      "Input for setting network user permissions.",
      {
        networkId: networkIdParam,
        userId: s.nonEmptyString("The user ID to grant permissions to."),
        read: s.boolean("Read permission (r)."),
        authorize: s.boolean("Authorize permission (a)."),
        modify: s.boolean("Modify permission (m)."),
        delete: s.boolean("Delete permission (d)."),
      },
      { required: ["networkId", "userId"] },
    ),
    outputSchema: singleOutput("The applied permission set."),
  }),

  // ── v2-only actions (New Central, central.zerotier.com) ───────────────────
  defineProviderAction(service, {
    name: "list_orgs",
    operationType: "read",
    description: "v2 only: list organizations the service account can access.",
    inputSchema: s.object(
      "Filters for listing organizations.",
      {
        permissionCheck: s.stringArray("Permission names to check on each organization."),
        latest: s.stringArray("Limit to recently active orgs plus the listed org IDs."),
        stats: s.boolean("Include aggregate statistics."),
      },
      { required: [] },
    ),
    outputSchema: listOutput("The organizations."),
  }),
  defineProviderAction(service, {
    name: "list_network_groups",
    operationType: "read",
    description: "v2 only: list network groups, optionally filtered by organization.",
    inputSchema: s.object(
      "Filters for listing network groups.",
      {
        orgId: s.string("Organization ID to filter by. Falls back to the connection's orgId when omitted."),
        stats: s.boolean("Include device and network statistics."),
        permissionCheck: s.stringArray("Permission names to check on each group."),
      },
      { required: [] },
    ),
    outputSchema: listOutput("The network groups."),
  }),
  defineProviderAction(service, {
    name: "get_network_group",
    operationType: "read",
    description: "v2 only: get one network group by ID.",
    inputSchema: s.object(
      "Input for fetching a network group.",
      { networkGroupId: s.nonEmptyString("The network group ID.") },
      { required: ["networkGroupId"] },
    ),
    outputSchema: singleOutput("The network group object."),
  }),
  defineProviderAction(service, {
    name: "create_network_group",
    operationType: "write",
    description: "v2 only: create a network group inside an organization.",
    inputSchema: s.object(
      "Input for creating a network group.",
      { orgId: orgIdParam, name: s.nonEmptyString("The group name."), description: descriptionParam },
      { required: ["orgId", "name"] },
    ),
    outputSchema: singleOutput("The created network group."),
  }),
  defineProviderAction(service, {
    name: "update_network_group",
    operationType: "write",
    description: "v2 only: rename or re-describe a network group.",
    inputSchema: s.object(
      "Input for updating a network group.",
      { networkGroupId: s.nonEmptyString("The network group ID."), name: nameParam, description: descriptionParam },
      { required: ["networkGroupId"] },
    ),
    outputSchema: singleOutput("The updated network group."),
  }),
  defineProviderAction(service, {
    name: "delete_network_group",
    operationType: "destructive",
    description: "v2 only: delete a network group.",
    inputSchema: s.object(
      "Input for deleting a network group.",
      { networkGroupId: s.nonEmptyString("The network group ID.") },
      { required: ["networkGroupId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "list_network_group_networks",
    operationType: "read",
    description: "v2 only: list networks inside one network group.",
    inputSchema: s.object(
      "Input for listing a network group's networks.",
      {
        networkGroupId: s.nonEmptyString("The network group ID."),
        stats: s.boolean("Include device statistics."),
        permissionCheck: s.stringArray("Permission names to check on each network."),
      },
      { required: ["networkGroupId"] },
    ),
    outputSchema: listOutput("The networks in the group."),
  }),
  defineProviderAction(service, {
    name: "get_iam",
    operationType: "read",
    description: "v2 only: list IAM role assignments on an org, network group, or network.",
    inputSchema: s.object(
      "Input for reading IAM assignments.",
      { resourceType: iamResourceType, resourceId: s.nonEmptyString("The resource ID.") },
      { required: ["resourceType", "resourceId"] },
    ),
    outputSchema: listOutput("The IAM assignments."),
  }),
  defineProviderAction(service, {
    name: "add_iam",
    operationType: "write",
    description: "v2 only: add roles for a principal on an org, network group, or network.",
    inputSchema: s.object(
      "Input for adding IAM roles.",
      {
        resourceType: iamResourceType,
        resourceId: s.nonEmptyString("The resource ID."),
        principal: s.nonEmptyString("Email of the user or service account."),
        roles: s.array("IAM roles to add.", s.nonEmptyString("An IAM role name.")),
      },
      { required: ["resourceType", "resourceId", "principal", "roles"] },
    ),
    outputSchema: listOutput("The resulting IAM assignments."),
  }),
  defineProviderAction(service, {
    name: "replace_iam",
    operationType: "write",
    description: "v2 only: replace all IAM assignments on an org, network group, or network.",
    inputSchema: s.object(
      "Input for replacing IAM assignments.",
      {
        resourceType: iamResourceType,
        resourceId: s.nonEmptyString("The resource ID."),
        assignments: s.array("The complete principal–roles assignment list.", iamTupleSchema),
      },
      { required: ["resourceType", "resourceId", "assignments"] },
    ),
    outputSchema: listOutput("The resulting IAM assignments."),
  }),
  defineProviderAction(service, {
    name: "remove_iam",
    operationType: "write",
    description: "v2 only: remove roles from a principal on an org, network group, or network.",
    inputSchema: s.object(
      "Input for removing IAM roles.",
      {
        resourceType: iamResourceType,
        resourceId: s.nonEmptyString("The resource ID."),
        principal: s.nonEmptyString("Email of the user or service account."),
        roles: s.array("IAM roles to remove.", s.nonEmptyString("An IAM role name.")),
      },
      { required: ["resourceType", "resourceId", "principal", "roles"] },
    ),
    outputSchema: listOutput("The resulting IAM assignments."),
  }),
  defineProviderAction(service, {
    name: "get_org_iam_tree",
    operationType: "read",
    description: "v2 only: get the IAM tree of an organization (groups, networks, principals, roles).",
    inputSchema: s.object("Input for the org IAM tree.", { orgId: orgIdParam }, { required: ["orgId"] }),
    outputSchema: singleOutput("The org IAM tree."),
  }),
  defineProviderAction(service, {
    name: "search_principals",
    operationType: "read",
    description: "v2 only: search org principals (users, service accounts) by email term.",
    inputSchema: s.object(
      "Input for searching principals.",
      {
        orgId: orgIdParam,
        search: s.nonEmptyString("Search term matched against principal email addresses."),
        principalType: s.stringArray("Optional principal-type filters."),
      },
      { required: ["orgId", "search"] },
    ),
    outputSchema: listOutput("The matching principals."),
  }),
  defineProviderAction(service, {
    name: "invite_users",
    operationType: "write",
    description: "v2 only: invite email addresses to an organization.",
    inputSchema: s.object(
      "Input for inviting users to an org.",
      { orgId: orgIdParam, emails: s.array("Email addresses to invite.", s.email("An email address.")) },
      { required: ["orgId", "emails"] },
    ),
    outputSchema: singleOutput("The invitation result."),
  }),
  defineProviderAction(service, {
    name: "get_org_subscription",
    operationType: "read",
    description: "v2 only: get an organization's subscription plan and entitlements.",
    inputSchema: s.object("Input for fetching an org subscription.", { orgId: orgIdParam }, { required: ["orgId"] }),
    outputSchema: singleOutput("The subscription object."),
  }),
  defineProviderAction(service, {
    name: "list_service_accounts",
    operationType: "read",
    description: "v2 only: list service accounts in an organization.",
    inputSchema: s.object("Input for listing service accounts.", { orgId: orgIdParam }, { required: ["orgId"] }),
    outputSchema: listOutput("The service accounts."),
  }),
  defineProviderAction(service, {
    name: "create_service_account",
    operationType: "write",
    description: "v2 only: create a service account in an organization.",
    inputSchema: s.object(
      "Input for creating a service account.",
      {
        orgId: orgIdParam,
        id: s.nonEmptyString("The service account ID."),
        name: s.nonEmptyString("The service account name."),
        description: descriptionParam,
      },
      { required: ["orgId", "id", "name"] },
    ),
    outputSchema: singleOutput("The created service account."),
  }),
  defineProviderAction(service, {
    name: "get_service_account",
    operationType: "read",
    description: "v2 only: get one service account by ID, including its API keys.",
    inputSchema: s.object(
      "Input for fetching a service account.",
      { serviceAccountId: s.nonEmptyString("The service account ID.") },
      { required: ["serviceAccountId"] },
    ),
    outputSchema: singleOutput("The service account object."),
  }),
  defineProviderAction(service, {
    name: "update_service_account",
    operationType: "write",
    description: "v2 only: update a service account's name or description.",
    inputSchema: s.object(
      "Input for updating a service account.",
      { serviceAccountId: s.nonEmptyString("The service account ID."), name: nameParam, description: descriptionParam },
      { required: ["serviceAccountId"] },
    ),
    outputSchema: singleOutput("The updated service account."),
  }),
  defineProviderAction(service, {
    name: "delete_service_account",
    operationType: "destructive",
    description: "v2 only: delete a service account.",
    inputSchema: s.object(
      "Input for deleting a service account.",
      { serviceAccountId: s.nonEmptyString("The service account ID.") },
      { required: ["serviceAccountId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "create_api_key",
    operationType: "write",
    description: "v2 only: create an API key for a service account. The secret is returned only once.",
    inputSchema: s.object(
      "Input for creating a service account API key.",
      {
        serviceAccountId: s.nonEmptyString("The service account ID."),
        expires: s.dateTime("The key expiration time (RFC 3339)."),
        description: descriptionParam,
      },
      { required: ["serviceAccountId", "expires"] },
    ),
    outputSchema: singleOutput("The created API key (secret shown once)."),
  }),
  defineProviderAction(service, {
    name: "get_api_key",
    operationType: "read",
    description: "v2 only: get one API key's metadata by ID.",
    inputSchema: s.object(
      "Input for fetching an API key.",
      { apiKeyId: s.nonEmptyString("The API key ID.") },
      { required: ["apiKeyId"] },
    ),
    outputSchema: singleOutput("The API key object."),
  }),
  defineProviderAction(service, {
    name: "update_api_key",
    operationType: "write",
    description: "v2 only: update an API key's description.",
    inputSchema: s.object(
      "Input for updating an API key.",
      { apiKeyId: s.nonEmptyString("The API key ID."), description: descriptionParam },
      { required: ["apiKeyId"] },
    ),
    outputSchema: singleOutput("The updated API key."),
  }),
  defineProviderAction(service, {
    name: "delete_api_key",
    operationType: "destructive",
    description: "v2 only: delete an API key.",
    inputSchema: s.object(
      "Input for deleting an API key.",
      { apiKeyId: s.nonEmptyString("The API key ID.") },
      { required: ["apiKeyId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "list_webhooks",
    operationType: "read",
    description: "v2 only: list webhooks in an organization.",
    inputSchema: s.object("Input for listing webhooks.", { orgId: orgIdParam }, { required: ["orgId"] }),
    outputSchema: listOutput("The webhooks."),
  }),
  defineProviderAction(service, {
    name: "create_webhook",
    operationType: "write",
    description: "v2 only: create a webhook for an organization.",
    inputSchema: s.object(
      "Input for creating a webhook.",
      {
        orgId: orgIdParam,
        url: s.url("The HTTPS endpoint URL that receives webhook events (FQDN only, no raw IPs or private ranges)."),
        eventList: s.array("ZeroTier event types to subscribe to.", s.nonEmptyString("An event type.")),
        description: descriptionParam,
      },
      { required: ["orgId", "url", "eventList"] },
    ),
    outputSchema: singleOutput("The created webhook."),
  }),
  defineProviderAction(service, {
    name: "get_webhook",
    operationType: "read",
    description: "v2 only: get one webhook by ID.",
    inputSchema: s.object(
      "Input for fetching a webhook.",
      { webhookId: s.nonEmptyString("The webhook ID.") },
      { required: ["webhookId"] },
    ),
    outputSchema: singleOutput("The webhook object."),
  }),
  defineProviderAction(service, {
    name: "update_webhook",
    operationType: "write",
    description: "v2 only: update a webhook's URL, event list, or description.",
    inputSchema: s.object(
      "Input for updating a webhook.",
      {
        webhookId: s.nonEmptyString("The webhook ID."),
        url: s.url("The HTTPS endpoint URL that receives webhook events."),
        eventList: s.array("ZeroTier event types to subscribe to.", s.nonEmptyString("An event type.")),
        description: descriptionParam,
      },
      { required: ["webhookId"] },
    ),
    outputSchema: singleOutput("The updated webhook."),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    operationType: "destructive",
    description: "v2 only: delete a webhook.",
    inputSchema: s.object(
      "Input for deleting a webhook.",
      { webhookId: s.nonEmptyString("The webhook ID.") },
      { required: ["webhookId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "rotate_webhook_secret",
    operationType: "write",
    description: "v2 only: rotate a webhook's signing secret.",
    inputSchema: s.object(
      "Input for rotating a webhook secret.",
      {
        webhookId: s.nonEmptyString("The webhook ID."),
        overlapHours: s.integer(
          "Hours the previous secret stays valid after rotation (0 = immediate cutover, default 24).",
        ),
      },
      { required: ["webhookId"] },
    ),
    outputSchema: singleOutput("The rotation result."),
  }),
  defineProviderAction(service, {
    name: "delete_webhook_secret",
    operationType: "destructive",
    description: "v2 only: delete one webhook secret by ID.",
    inputSchema: s.object(
      "Input for deleting a webhook secret.",
      { webhookSecretId: s.nonEmptyString("The webhook secret ID.") },
      { required: ["webhookSecretId"] },
    ),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "check_permissions",
    operationType: "write",
    description: "v2 only: check whether the authenticated principal holds permissions on resources.",
    inputSchema: s.object(
      "Input for checking permissions.",
      {
        checks: s.array(
          "Permission checks to perform.",
          s.requiredObject("One permission check.", {
            permission: s.nonEmptyString("The permission name to check."),
            resourceType: s.nonEmptyString("The resource type, e.g. org, networkGroup, network."),
            resourceId: s.nonEmptyString("The resource ID."),
          }),
        ),
      },
      { required: ["checks"] },
    ),
    outputSchema: listOutput("The permission check results."),
  }),
  defineProviderAction(service, {
    name: "update_current_user",
    operationType: "write",
    description: "v2 only: update the authenticated user's profile.",
    inputSchema: s.object(
      "Input for updating the current user.",
      { firstName: s.string("The first name to set."), lastName: s.string("The last name to set.") },
      { required: [] },
    ),
    outputSchema: singleOutput("The updated user."),
  }),
  defineProviderAction(service, {
    name: "delete_current_user",
    operationType: "destructive",
    description: "v2 only: permanently delete the authenticated user account.",
    inputSchema: s.object("No input.", {}, { required: [] }),
    outputSchema: statusOutput("Deletion result."),
  }),
  defineProviderAction(service, {
    name: "add_members",
    operationType: "write",
    description: "v2 only: add multiple members to a network in one call.",
    inputSchema: s.object(
      "Input for adding members.",
      {
        networkId: networkIdParam,
        members: s.array(
          "Members to add.",
          s.requiredObject("One member to add.", {
            deviceId: memberIdParam,
            name: nameParam,
            description: descriptionParam,
            activeBridge: s.boolean("Whether this device acts as an active bridge."),
            noAutoAssignIps: s.boolean("Disable automatic IP assignment."),
            ipv4Assignments: s.stringArray("Static IPv4 assignments."),
            ipv6Assignments: s.stringArray("Static IPv6 assignments."),
          }),
        ),
      },
      { required: ["networkId", "members"] },
    ),
    outputSchema: listOutput("The added members."),
  }),
  defineProviderAction(service, {
    name: "remove_members",
    operationType: "destructive",
    description: "v2 only: remove multiple members from a network in one call.",
    inputSchema: s.object(
      "Input for removing members.",
      { networkId: networkIdParam, deviceIds: memberIdsArray },
      { required: ["networkId", "deviceIds"] },
    ),
    outputSchema: listOutput("The removal result."),
  }),
  defineProviderAction(service, {
    name: "authorize_members",
    operationType: "write",
    description: "v2 only: authorize multiple members on a network in one call.",
    inputSchema: s.object(
      "Input for authorizing members.",
      { networkId: networkIdParam, deviceIds: memberIdsArray },
      { required: ["networkId", "deviceIds"] },
    ),
    outputSchema: listOutput("The authorized members."),
  }),
  defineProviderAction(service, {
    name: "deauthorize_members",
    operationType: "write",
    description: "v2 only: de-authorize multiple members on a network in one call.",
    inputSchema: s.object(
      "Input for de-authorizing members.",
      { networkId: networkIdParam, deviceIds: memberIdsArray },
      { required: ["networkId", "deviceIds"] },
    ),
    outputSchema: listOutput("The de-authorized members."),
  }),
  defineProviderAction(service, {
    name: "reject_members",
    operationType: "write",
    description: "v2 only: reject multiple members on a network in one call.",
    inputSchema: s.object(
      "Input for rejecting members.",
      { networkId: networkIdParam, deviceIds: memberIdsArray },
      { required: ["networkId", "deviceIds"] },
    ),
    outputSchema: listOutput("The rejected members."),
  }),
  defineProviderAction(service, {
    name: "reject_member",
    operationType: "write",
    description: "v2 only: reject one member on a network.",
    inputSchema: s.object(
      "Input for rejecting a member.",
      { networkId: networkIdParam, memberId: memberIdParam },
      { required: ["networkId", "memberId"] },
    ),
    outputSchema: singleOutput("The rejected member."),
  }),
  defineProviderAction(service, {
    name: "get_flow_rules",
    operationType: "read",
    description: "v2 only (beta): get a network's flow rules.",
    inputSchema: s.object("Input for fetching flow rules.", { networkId: networkIdParam }, { required: ["networkId"] }),
    outputSchema: singleOutput("The flow rules."),
  }),
  defineProviderAction(service, {
    name: "update_flow_rules",
    operationType: "write",
    description: "v2 only (beta): update a network's flow rules (custom rule source or isolation config).",
    inputSchema: s.object(
      "Input for updating flow rules.",
      {
        networkId: networkIdParam,
        kind: s.nonEmptyString("The flow rule kind (e.g. custom, isolation)."),
        config: s.looseObject(
          "The flow rule config. For custom rules: {source: '<rules source>'}. For isolation: {allowedServices, blockNonIP, enableServiceFilter, excludedDeviceIds}.",
        ),
      },
      { required: ["networkId", "kind"] },
    ),
    outputSchema: singleOutput("The updated flow rules."),
  }),
];
