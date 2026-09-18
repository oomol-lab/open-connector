import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zorus" as const;

const uuidField = (description: string) => s.uuid(description);
const optionalStringField = (description: string) => s.string(description, { minLength: 1 });
const optionalUuidArray = (description: string) => s.array(description, uuidField("One Zorus UUID."));
const optionalStringArray = (description: string) =>
  s.array(description, s.string("One string filter value.", { minLength: 1 }));

const commonSearchFields = {
  page: s.integer("The page of data to return."),
  pageSize: s.integer("The number of items per page."),
  sortAscending: s.boolean("Whether Zorus should sort the result set in ascending order."),
};

const customerSearchInputSchema = s.object(
  "Search, pagination, and sorting options for Zorus customers.",
  {
    ...commonSearchFields,
    sortProperty: s.stringEnum("Customer field to sort by.", ["Name"]),
    nameContains: optionalStringField("Only include customers whose name contains this value."),
    isEnabled: s.boolean("Only include customers whose enabled state matches this value."),
    uuidEquals: uuidField("Only include the customer with this UUID."),
    createdAfter: s.dateTime("Only include customers created after this UTC timestamp."),
    createdBefore: s.dateTime("Only include customers created before this UTC timestamp."),
  },
  {
    optional: [
      "page",
      "pageSize",
      "sortProperty",
      "sortAscending",
      "nameContains",
      "isEnabled",
      "uuidEquals",
      "createdAfter",
      "createdBefore",
    ],
  },
);

const endpointSearchInputSchema = s.object(
  "Search, pagination, and sorting options for Zorus endpoints.",
  {
    ...commonSearchFields,
    sortProperty: s.stringEnum("Endpoint field to sort by.", ["Name"]),
    nameContains: optionalStringField("Only include endpoints whose name contains this value."),
    isEnabled: s.boolean("Only include endpoints whose enabled state matches this value."),
    uuidEquals: uuidField("Only include the endpoint with this UUID."),
    uuidIn: optionalUuidArray("Only include endpoints whose UUID is in this list."),
    licenseIdEquals: optionalStringField("Only include the endpoint with this license ID."),
    licenseIdIn: optionalStringArray("Only include endpoints whose license ID is in this list."),
    customerUuidEquals: uuidField("Only include endpoints whose customer has this UUID."),
    customerUuidIn: optionalUuidArray("Only include endpoints whose customer UUID is in this list."),
    groupUuidEquals: uuidField("Only include endpoints whose group has this UUID."),
    groupUuidIn: optionalUuidArray("Only include endpoints whose group UUID is in this list."),
    isInErrorState: s.boolean("Only include endpoints whose error state matches this value."),
    agentStateEquals: optionalStringField("Only include endpoints whose agent state matches this value."),
    lastSeenBefore: s.dateTime("Only include endpoints last seen before this UTC timestamp."),
    lastSeenAfter: s.dateTime("Only include endpoints last seen after this UTC timestamp."),
    isInheritingGroupSettings: s.boolean("Only include endpoints whose group-setting inheritance matches this value."),
    isFilteringEnabled: s.boolean("Only include endpoints whose filtering state matches this value."),
    isCyberSightEnabled: s.boolean("Only include endpoints whose CyberSight state matches this value."),
  },
  {
    optional: [
      "page",
      "pageSize",
      "sortProperty",
      "sortAscending",
      "nameContains",
      "isEnabled",
      "uuidEquals",
      "uuidIn",
      "licenseIdEquals",
      "licenseIdIn",
      "customerUuidEquals",
      "customerUuidIn",
      "groupUuidEquals",
      "groupUuidIn",
      "isInErrorState",
      "agentStateEquals",
      "lastSeenBefore",
      "lastSeenAfter",
      "isInheritingGroupSettings",
      "isFilteringEnabled",
      "isCyberSightEnabled",
    ],
  },
);

const groupSearchInputSchema = s.object(
  "Search, pagination, and sorting options for Zorus groups.",
  {
    ...commonSearchFields,
    sortProperty: s.stringEnum("Group field to sort by.", [
      "Name",
      "CustomerName",
      "SyncOptionsToMembers",
      "SyncAddonsToMembers",
    ]),
    nameContains: optionalStringField("Only include groups whose name contains this value."),
    uuidEquals: uuidField("Only include the group with this UUID."),
    policyUuidEquals: uuidField("Only include groups assigned to this policy UUID."),
    customerUuidEquals: uuidField("Only include groups whose customer has this UUID."),
    customerNameContains: optionalStringField("Only include groups whose customer name contains this value."),
    syncOptionsToMembers: s.boolean("Only include groups whose sync-options-to-members setting matches this value."),
    syncAddonsToMembers: s.boolean("Only include groups whose sync-addons-to-members setting matches this value."),
  },
  {
    optional: [
      "page",
      "pageSize",
      "sortProperty",
      "sortAscending",
      "nameContains",
      "uuidEquals",
      "policyUuidEquals",
      "customerUuidEquals",
      "customerNameContains",
      "syncOptionsToMembers",
      "syncAddonsToMembers",
    ],
  },
);

const policySearchInputSchema = s.object(
  "Search, pagination, and sorting options for Zorus policies.",
  {
    ...commonSearchFields,
    sortProperty: s.stringEnum("Policy field to sort by.", ["CustomerName", "GroupName", "CreatedDateUtc"]),
    uuidEquals: uuidField("Only include the policy with this UUID."),
    groupUuidEquals: uuidField("Only include policies whose group has this UUID."),
    groupNameContains: optionalStringField("Only include policies whose group name contains this value."),
    customerNameContains: optionalStringField("Only include policies whose customer name contains this value."),
    customerUuidEquals: uuidField("Only include policies whose customer has this UUID."),
    createdBefore: s.dateTime("Only include policies created before this UTC timestamp."),
    createdAfter: s.dateTime("Only include policies created after this UTC timestamp."),
  },
  {
    optional: [
      "page",
      "pageSize",
      "sortProperty",
      "sortAscending",
      "uuidEquals",
      "groupUuidEquals",
      "groupNameContains",
      "customerNameContains",
      "customerUuidEquals",
      "createdBefore",
      "createdAfter",
    ],
  },
);

const activeUnblockRequestSearchInputSchema = s.object(
  "Search, pagination, and sorting options for active Zorus unblock requests.",
  {
    ...commonSearchFields,
    sortProperty: s.stringEnum("Active unblock-request field to sort by.", [
      "CustomerName",
      "LoggedOnUser",
      "EndpointName",
      "Website",
    ]),
    customerUuidIn: optionalUuidArray("Only include unblock requests whose customer UUID is in this list."),
    policyUuidIn: optionalUuidArray("Only include unblock requests whose policy UUID is in this list."),
    loggedOnUserContains: optionalStringField(
      "Only include unblock requests whose logged-on user contains this value.",
    ),
    requestedBefore: s.dateTime("Only include unblock requests submitted before this UTC timestamp."),
    requestedAfter: s.dateTime("Only include unblock requests submitted after this UTC timestamp."),
  },
  {
    optional: [
      "page",
      "pageSize",
      "sortProperty",
      "sortAscending",
      "customerUuidIn",
      "policyUuidIn",
      "loggedOnUserContains",
      "requestedBefore",
      "requestedAfter",
    ],
  },
);

const deploymentInfoSchema = s.looseObject("Deployment summary for a Zorus customer.", {
  deployedEndpointCount: s.integer("Number of endpoints associated with the customer."),
  filteringEnabledCount: s.integer("Number of customer endpoints with filtering enabled."),
  cyberSightEnabledCount: s.integer("Number of customer endpoints with CyberSight enabled."),
  enabledNetworkCount: s.integer("Number of enabled WANs associated with the customer."),
  networkSeatCount: s.integer("Number of seats in WANs associated with the customer."),
});

const integrationInfoSchema = s.looseObject("Integration summary for a Zorus customer.", {
  vendorName: s.nullable(s.string("The integration vendor name.")),
  name: s.nullable(s.string("The integration name.")),
});

const customerSchema = s.looseObject("A Zorus customer returned by the API.", {
  uuid: uuidField("The customer UUID."),
  name: s.nullable(s.string("The customer name.")),
  createdDateUtc: s.dateTime("Timestamp when the customer was created."),
  isEnabled: s.boolean("Whether the customer is enabled."),
  deploymentInfo: deploymentInfoSchema,
  integrations: s.nullable(s.array("Integrations used by the customer.", integrationInfoSchema)),
});

const endpointSchema = s.looseObject("A Zorus endpoint returned by the API.", {
  customerName: s.nullable(s.string("The endpoint customer name.")),
  customerUuid: uuidField("The endpoint customer UUID."),
  groupName: s.nullable(s.string("The endpoint group name.")),
  groupUuid: uuidField("The endpoint group UUID."),
  policyUuid: uuidField("The endpoint policy UUID."),
  name: s.nullable(s.string("The endpoint name.")),
  uuid: uuidField("The endpoint UUID."),
  licenseId: s.nullable(s.string("The endpoint license ID.")),
  createdDateUtc: s.dateTime("Timestamp when the endpoint was created."),
  isEnabled: s.boolean("Whether the endpoint is enabled."),
  operatingSystemType: s.nullable(s.string("The endpoint operating system type.")),
  operatingSystem: s.nullable(s.string("The endpoint operating system.")),
  localIp: s.nullable(s.string("The endpoint local IP address.")),
  version: s.nullable(s.string("The endpoint agent version.")),
  isInErrorState: s.boolean("Whether the endpoint is in an error state."),
  isInheritingGroupSettings: s.boolean("Whether the endpoint inherits group settings."),
  isFilteringEnabled: s.boolean("Whether filtering is enabled on the endpoint."),
  isCyberSightEnabled: s.boolean("Whether CyberSight is enabled on the endpoint."),
  isCyberSightBrowserExtensionEnabled: s.boolean(
    "Whether the CyberSight browser extension is enabled on the endpoint.",
  ),
  browserExtensionState: s.nullable(s.string("The endpoint browser extension state.")),
  agentState: s.nullable(s.string("The endpoint agent state.")),
  lastSeenDateUtc: s.nullable(s.dateTime("Timestamp when the endpoint was last seen.")),
});

const groupSchema = s.looseObject("A Zorus group returned by the API.", {
  name: s.nullable(s.string("The group name.")),
  uuid: uuidField("The group UUID."),
  policyUuid: uuidField("The policy UUID used by the group."),
  customerName: s.nullable(s.string("The group customer name.")),
  customerUuid: uuidField("The group customer UUID."),
  syncOptionsToMembers: s.boolean("Whether options are synchronized to group members."),
  syncAddonsToMembers: s.boolean("Whether addons are synchronized to group members."),
});

const policySchema = s.looseObject("A Zorus policy returned by the API.", {
  uuid: uuidField("The policy UUID."),
  groupName: s.nullable(s.string("The policy group name.")),
  groupUuid: uuidField("The policy group UUID."),
  customerName: s.nullable(s.string("The policy customer name.")),
  customerUuid: uuidField("The policy customer UUID."),
  createdDateUtc: s.nullable(s.dateTime("Timestamp when the policy was created.")),
});

const unblockRequestSchema = s.looseObject("An active Zorus unblock request returned by the API.", {
  uuid: uuidField("The unblock request UUID."),
  customerUuid: uuidField("The unblock request customer UUID."),
  customerName: s.nullable(s.string("The unblock request customer name.")),
  policyUuid: uuidField("The policy UUID responsible for the block."),
  loggedOnUser: s.nullable(s.string("The remote username of the submitter.")),
  endpointName: s.nullable(s.string("The endpoint hostname that submitted the request.")),
  website: s.nullable(s.string("The blocked URL.")),
  blockReason: s.nullable(s.string("The Zorus-provided block reason.")),
  categoryNames: s.nullable(s.array("Categories assigned to the blocked website or URL.", s.string("Category name."))),
  requestReason: s.nullable(s.string("The user-supplied reason for the unblock request.")),
  requestDateUtc: s.dateTime("Timestamp when the unblock request was submitted."),
});

function searchOutputSchema(description: string, itemSchema: ReturnType<typeof s.looseObject>) {
  return s.object(description, {
    items: s.array("Items returned by the Zorus search endpoint.", itemSchema),
  });
}

export const zorusActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_customers",
    operationType: "read",
    description: "Search Zorus customers with documented filtering, pagination, and sorting.",
    requiredScopes: [],
    inputSchema: customerSearchInputSchema,
    outputSchema: searchOutputSchema("Zorus customer search results.", customerSchema),
  }),
  defineProviderAction(service, {
    name: "search_endpoints",
    operationType: "read",
    description: "Search Zorus endpoints with documented filtering, pagination, and sorting.",
    requiredScopes: [],
    inputSchema: endpointSearchInputSchema,
    outputSchema: searchOutputSchema("Zorus endpoint search results.", endpointSchema),
  }),
  defineProviderAction(service, {
    name: "search_groups",
    operationType: "read",
    description: "Search Zorus groups with documented filtering, pagination, and sorting.",
    requiredScopes: [],
    inputSchema: groupSearchInputSchema,
    outputSchema: searchOutputSchema("Zorus group search results.", groupSchema),
  }),
  defineProviderAction(service, {
    name: "search_policies",
    operationType: "read",
    description: "Search Zorus policies with documented filtering, pagination, and sorting.",
    requiredScopes: [],
    inputSchema: policySearchInputSchema,
    outputSchema: searchOutputSchema("Zorus policy search results.", policySchema),
  }),
  defineProviderAction(service, {
    name: "search_active_unblock_requests",
    operationType: "read",
    description: "Search active Zorus unblock requests with documented filtering, pagination, and sorting.",
    requiredScopes: [],
    inputSchema: activeUnblockRequestSearchInputSchema,
    outputSchema: searchOutputSchema("Active Zorus unblock-request search results.", unblockRequestSchema),
  }),
];
