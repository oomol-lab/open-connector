import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lucid_scim";

const scimIdSchema = s.nonEmptyString("Lucid SCIM resource ID, such as lucid-1234.");
const groupIdSchema = s.nonEmptyString("Lucid SCIM group or team ID, such as lucid-group-1234.");
const attributeListSchema = s.array(
  "SCIM attributes to include or exclude, sent as a comma-separated list.",
  s.nonEmptyString("One SCIM attribute name."),
  { minItems: 1 },
);
const startIndexSchema = s.positiveInteger("One-based index of the first SCIM result to return.");
const countSchema = s.nonNegativeInteger("Maximum number of SCIM resources to return.");

const scimUserSchema = s.looseObject("Lucid SCIM user resource.", {
  id: s.string("Lucid user ID returned by SCIM."),
  userName: s.string("SCIM username, usually the user's email address."),
  displayName: s.string("Display name returned for the user."),
  active: s.boolean("Whether the user can authenticate to Lucid."),
  externalId: s.string("Provisioning client identifier for the user."),
  emails: s.array("Email entries returned for the user.", s.looseObject("SCIM email entry.")),
  groups: s.array("Group memberships returned for the user.", s.looseObject("SCIM group entry.")),
  meta: s.looseObject("SCIM metadata returned for the user."),
});

const scimGroupSchema = s.looseObject("Lucid SCIM group or team resource.", {
  id: s.string("Lucid group or team ID returned by SCIM."),
  displayName: s.string("Display name of the Lucid org group or team."),
  members: s.array("Members returned for the group or team.", s.looseObject("SCIM member entry.")),
  meta: s.looseObject("SCIM metadata returned for the group or team."),
});

const scimListMetadataSchema = {
  totalResults: s.nonNegativeInteger("Total matching SCIM resources across all pages."),
  startIndex: startIndexSchema,
  itemsPerPage: s.nonNegativeInteger("Number of resources returned in this page."),
  schemas: s.array("SCIM schema URIs returned for the list response.", s.string("SCIM schema URI.")),
  raw: s.looseObject("Raw Lucid SCIM list response."),
};

const attributeProjectionConflict: JsonSchema = {
  not: {
    required: ["attributes", "excludedAttributes"],
  },
};

const listUsersInputSchema = s.object(
  "Input parameters for listing Lucid SCIM users.",
  {
    startIndex: startIndexSchema,
    count: countSchema,
    filter: s.nonEmptyString(
      "SCIM user filter. Lucid recommends optimized attributes such as email, userName, displayName, or externalId.",
    ),
    attributes: attributeListSchema,
    excludedAttributes: attributeListSchema,
  },
  { optional: ["startIndex", "count", "filter", "attributes", "excludedAttributes"] },
);
listUsersInputSchema.allOf = [attributeProjectionConflict];

const listGroupsInputSchema = s.object(
  "Input parameters for listing Lucid SCIM groups or teams.",
  {
    startIndex: startIndexSchema,
    count: countSchema,
    filter: s.nonEmptyString(
      'SCIM group filter. Lucid currently supports single displayName equality filters such as displayName eq "Engineering".',
    ),
    attributes: attributeListSchema,
    excludedAttributes: attributeListSchema,
  },
  { optional: ["startIndex", "count", "filter", "attributes", "excludedAttributes"] },
);
listGroupsInputSchema.allOf = [attributeProjectionConflict];

const getUserInputSchema = s.object(
  "Input parameters for retrieving one Lucid SCIM user.",
  {
    id: scimIdSchema,
    attributes: attributeListSchema,
    excludedAttributes: attributeListSchema,
  },
  { optional: ["attributes", "excludedAttributes"] },
);
getUserInputSchema.allOf = [attributeProjectionConflict];

const getGroupInputSchema = s.object(
  "Input parameters for retrieving one Lucid SCIM group or team.",
  {
    id: groupIdSchema,
    attributes: attributeListSchema,
    excludedAttributes: attributeListSchema,
  },
  { optional: ["attributes", "excludedAttributes"] },
);
getGroupInputSchema.allOf = [attributeProjectionConflict];

const getServiceProviderConfigOutputSchema = s.object(
  "Lucid SCIM service provider configuration response.",
  {
    config: s.looseObject("ServiceProviderConfig object returned by Lucid SCIM."),
  },
  { required: ["config"] },
);

const listUsersOutputSchema = s.object(
  "A page of Lucid SCIM users.",
  {
    users: s.array("Users returned in this page.", scimUserSchema),
    ...scimListMetadataSchema,
  },
  { required: ["users", "totalResults", "startIndex", "itemsPerPage", "schemas", "raw"] },
);

const getUserOutputSchema = s.object(
  "Single Lucid SCIM user response.",
  {
    user: scimUserSchema,
  },
  { required: ["user"] },
);

const listGroupsOutputSchema = s.object(
  "A page of Lucid SCIM groups or teams.",
  {
    groups: s.array("Groups or teams returned in this page.", scimGroupSchema),
    ...scimListMetadataSchema,
  },
  { required: ["groups", "totalResults", "startIndex", "itemsPerPage", "schemas", "raw"] },
);

const getGroupOutputSchema = s.object(
  "Single Lucid SCIM group or team response.",
  {
    group: scimGroupSchema,
  },
  { required: ["group"] },
);

export const lucidScimActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_service_provider_config",
    description: "Get the Lucid SCIM service provider configuration for the connected account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for this Lucid SCIM request.", {}),
    outputSchema: getServiceProviderConfigOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Lucid SCIM users with optional SCIM filter, pagination, and attributes.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Lucid SCIM user by ID.",
    requiredScopes: [],
    inputSchema: getUserInputSchema,
    outputSchema: getUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Lucid SCIM org groups or teams with optional SCIM filter, pagination, and attributes.",
    requiredScopes: [],
    inputSchema: listGroupsInputSchema,
    outputSchema: listGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Lucid SCIM org group or team by ID.",
    requiredScopes: [],
    inputSchema: getGroupInputSchema,
    outputSchema: getGroupOutputSchema,
  }),
];
