import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keeper_scim";

const scimIdSchema = s.string("Keeper SCIM resource ID returned by the Users or Groups endpoint.", {
  minLength: 1,
});
const startIndexSchema = s.positiveInteger("One-based index of the first SCIM result to return.");
const countSchema = s.positiveInteger("Maximum number of SCIM resources to return.");
const excludedAttributesSchema = s.array(
  "SCIM attributes to exclude, sent as a comma-separated list. Keeper documents this for the members attribute on group queries.",
  s.string("One SCIM attribute name to exclude, such as members.", { minLength: 1 }),
  { minItems: 1 },
);

const scimUserSchema = s.looseObject("Keeper SCIM user resource.", {
  id: s.string("Keeper SCIM user ID."),
  userName: s.string("SCIM username, usually the user's email address."),
  displayName: s.string("Display name returned for the user."),
  active: s.boolean("Whether the user is active in Keeper."),
  externalId: s.string("Provisioning client identifier for the user."),
  emails: s.array("Email entries returned for the user.", s.looseObject("SCIM email entry.")),
  groups: s.array("Group memberships returned for the user.", s.looseObject("SCIM group entry.")),
  meta: s.looseObject("SCIM metadata returned for the user."),
});

const scimGroupSchema = s.looseObject("Keeper SCIM group resource. Keeper represents groups as teams.", {
  id: s.string("Keeper team ID returned by SCIM."),
  displayName: s.string("Display name of the Keeper team."),
  externalId: s.string("Provisioning client identifier for the group."),
  members: s.array("Members returned for the group.", s.looseObject("SCIM member entry.")),
  meta: s.looseObject("SCIM metadata returned for the group."),
});

const scimListMetadataSchema = {
  totalResults: s.nonNegativeInteger("Total matching SCIM resources across all pages."),
  startIndex: startIndexSchema,
  itemsPerPage: s.nonNegativeInteger("Number of resources returned in this page."),
  schemas: s.array("SCIM schema URIs returned for the list response.", s.string("SCIM schema URI.")),
  raw: s.looseObject("Raw Keeper SCIM list response."),
};

const listUsersInputSchema = s.object(
  "Input parameters for listing Keeper SCIM users.",
  {
    startIndex: startIndexSchema,
    count: countSchema,
    filter: s.string('SCIM user filter, such as id eq "user_id".', { minLength: 1 }),
  },
  { optional: ["startIndex", "count", "filter"] },
);

const getUserInputSchema = s.object("Input parameters for retrieving one Keeper SCIM user.", {
  id: scimIdSchema,
});

const listGroupsInputSchema = s.object(
  "Input parameters for listing Keeper SCIM groups.",
  {
    startIndex: startIndexSchema,
    count: countSchema,
    excludedAttributes: excludedAttributesSchema,
  },
  { optional: ["startIndex", "count", "excludedAttributes"] },
);

const getGroupInputSchema = s.object(
  "Input parameters for retrieving one Keeper SCIM group.",
  {
    id: scimIdSchema,
    excludedAttributes: excludedAttributesSchema,
  },
  { optional: ["excludedAttributes"] },
);

const getServiceProviderConfigOutputSchema = s.object("Keeper SCIM service provider configuration response.", {
  config: s.looseObject("ServiceProviderConfig object returned by Keeper SCIM."),
});

const listUsersOutputSchema = s.object("A page of Keeper SCIM users.", {
  users: s.array("Users returned in this page.", scimUserSchema),
  ...scimListMetadataSchema,
});

const getUserOutputSchema = s.object("Single Keeper SCIM user response.", {
  user: scimUserSchema,
});

const listGroupsOutputSchema = s.object("A page of Keeper SCIM groups.", {
  groups: s.array("Groups returned in this page.", scimGroupSchema),
  ...scimListMetadataSchema,
});

const getGroupOutputSchema = s.object("Single Keeper SCIM group response.", {
  group: scimGroupSchema,
});

export const keeperScimActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_service_provider_config",
    description: "Get the Keeper SCIM service provider configuration for the connected node.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for this Keeper SCIM request.", {}),
    outputSchema: getServiceProviderConfigOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Keeper SCIM users with optional SCIM filter and pagination.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Keeper SCIM user by ID.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: getUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Keeper SCIM groups with optional pagination and excluded member attributes.",
    requiredScopes: [],
    inputSchema: listGroupsInputSchema,
    outputSchema: listGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Keeper SCIM group by ID.",
    requiredScopes: [],
    inputSchema: getGroupInputSchema,
    outputSchema: getGroupOutputSchema,
  }),
];
