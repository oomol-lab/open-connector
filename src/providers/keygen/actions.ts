import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keygen";

const primitiveQueryValueSchema = s.anyOf("A string, number, or boolean query value.", [
  s.string("String query value."),
  s.number("Numeric query value."),
  s.boolean("Boolean query value."),
]);
const queryValueSchema = s.anyOf("A Keygen query value.", [
  primitiveQueryValueSchema,
  s.array("Multiple values for the same Keygen query field.", primitiveQueryValueSchema),
]);
const filterSchema = s.record(
  "Keygen JSON:API filters keyed by filter name. Values are serialized as filter[key] query parameters.",
  queryValueSchema,
);
const jsonApiAttributesSchema = s.looseObject(
  "JSON:API resource attributes to send to Keygen. Use the official attribute names for the target resource.",
);
const jsonApiRelationshipsSchema = s.looseObject(
  "JSON:API relationships to send to Keygen. Use standard relationship linkage objects from the Keygen API docs.",
);
const jsonApiMetaSchema = s.looseObject("JSON:API meta fields to send to Keygen for this resource or action.");
const keygenDocumentSchema = s.looseObject("The raw JSON:API document returned by Keygen.", {
  data: s.unknown("The JSON:API data member returned by Keygen."),
  meta: s.looseObject("The JSON:API meta member returned by Keygen."),
  links: s.looseObject("The JSON:API links member returned by Keygen."),
  included: s.array("Included JSON:API resources returned by Keygen.", s.unknown("Included resource.")),
  errors: s.array("JSON:API errors returned by Keygen.", s.unknown("Error object.")),
});
const idInputSchema = (resource: string) =>
  s.object(`Input parameters for retrieving one Keygen ${resource} resource.`, {
    id: s.string(`The Keygen ${resource} resource ID.`, { minLength: 1 }),
  });
const limitPaginationFields = {
  limit: s.positiveInteger("The maximum number of related resources to return from Keygen."),
  pageSize: s.positiveInteger("The Keygen cursor page size to request."),
  pageCursor: s.string("The Keygen cursor value for the page to return.", { minLength: 1 }),
};
const listRelationshipInputSchema = (relationship: string) =>
  s.object(
    `Input parameters for listing Keygen ${relationship}.`,
    {
      id: s.string("The parent Keygen resource ID.", { minLength: 1 }),
      ...limitPaginationFields,
    },
    { optional: ["limit", "pageSize", "pageCursor"] },
  );
const relationshipIdsInputSchema = (relationship: string, fieldName: string, fieldDescription: string) =>
  s.object(`Input parameters for updating Keygen ${relationship}.`, {
    id: s.string("The parent Keygen resource ID.", { minLength: 1 }),
    [fieldName]: s.array(fieldDescription, s.string("A related Keygen resource ID.", { minLength: 1 }), {
      minItems: 1,
    }),
  });
const changeRelationshipInputSchema = (relationship: string, fieldName: string, fieldDescription: string) =>
  s.object(`Input parameters for changing a Keygen ${relationship}.`, {
    id: s.string("The parent Keygen resource ID.", { minLength: 1 }),
    [fieldName]: s.string(fieldDescription, { minLength: 1 }),
  });
const listInputSchema = (resource: string) =>
  s.object(
    `Input parameters for listing Keygen ${resource} resources.`,
    {
      pageNumber: s.positiveInteger("The page number to return from Keygen."),
      pageSize: s.positiveInteger("The number of resources to request from Keygen."),
      include: s.string("Comma-separated Keygen relationship names to include in the response.", {
        minLength: 1,
      }),
      filter: filterSchema,
    },
    { optional: ["pageNumber", "pageSize", "include", "filter"] },
  );
const createInputSchema = (resource: string) =>
  s.object(
    `Input parameters for creating a Keygen ${resource} resource.`,
    {
      attributes: jsonApiAttributesSchema,
      relationships: jsonApiRelationshipsSchema,
      meta: jsonApiMetaSchema,
    },
    { optional: ["relationships", "meta"] },
  );
const updateInputSchema = (resource: string) =>
  s.object(
    `Input parameters for updating a Keygen ${resource} resource.`,
    {
      id: s.string(`The Keygen ${resource} resource ID.`, { minLength: 1 }),
      attributes: jsonApiAttributesSchema,
      relationships: jsonApiRelationshipsSchema,
      meta: jsonApiMetaSchema,
    },
    { optional: ["attributes", "relationships", "meta"] },
  );
const deleteInputSchema = (resource: string) =>
  s.object(`Input parameters for deleting one Keygen ${resource} resource.`, {
    id: s.string(`The Keygen ${resource} resource ID.`, { minLength: 1 }),
  });
const deleteOutputSchema = s.object(
  "The normalized deletion result returned by the connector.",
  {
    deleted: s.boolean("Whether Keygen accepted the delete request."),
    data: s.unknown("The raw Keygen response body, or null when Keygen returned no body."),
  },
  { optional: ["data"] },
);
const validationMetaFields = {
  nonce: s.integer("An optional numerical nonce echoed by Keygen in signed responses."),
  scope: s.looseObject(
    "Optional Keygen validation scope, such as fingerprint, product, policy, machine, or user scope.",
  ),
};
const licenseUsageInputSchema = (action: string, valueName: string, valueDescription: string) =>
  s.object(
    `Input parameters for the Keygen ${action} license usage action.`,
    {
      id: s.string("The Keygen license resource ID.", { minLength: 1 }),
      [valueName]: s.positiveInteger(valueDescription),
    },
    { optional: [valueName] },
  );

export const keygenActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "whoami",
    description: "Fetch the Keygen profile associated with the connected API token.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for fetching the current Keygen profile.", {}),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List products in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("product"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_product",
    description: "Retrieve one product from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("product"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_product",
    description: "Create a product in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("product"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_product",
    description: "Update a product in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("product"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_product",
    description: "Delete a product from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("product"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_entitlements",
    description: "List entitlements in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("entitlement"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_entitlement",
    description: "Retrieve one entitlement from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("entitlement"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_entitlement",
    description: "Create an entitlement in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("entitlement"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_entitlement",
    description: "Update an entitlement in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("entitlement"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_entitlement",
    description: "Delete an entitlement from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("entitlement"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List groups in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("group"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_group",
    description: "Retrieve one group from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("group"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a group in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("group"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Update a group in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("group"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete a group from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("group"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_policies",
    description: "List license policies in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("policy"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_policy",
    description: "Retrieve one license policy from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("policy"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_policy",
    description: "Create a license policy in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("policy"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_policy",
    description: "Update a license policy in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("policy"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_policy",
    description: "Delete a license policy from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("policy"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_policy_entitlements",
    description: "List entitlements attached to a Keygen policy.",
    requiredScopes: [],
    inputSchema: listRelationshipInputSchema("policy entitlements"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "attach_policy_entitlements",
    description: "Attach entitlements to a Keygen policy.",
    requiredScopes: [],
    inputSchema: relationshipIdsInputSchema(
      "policy entitlements",
      "entitlementIds",
      "The Keygen entitlement IDs to attach to the policy.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "detach_policy_entitlements",
    description: "Detach entitlements from a Keygen policy.",
    requiredScopes: [],
    inputSchema: relationshipIdsInputSchema(
      "policy entitlements",
      "entitlementIds",
      "The Keygen entitlement IDs to detach from the policy.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("user"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_user",
    description: "Retrieve one user from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("user"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create a user in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("user"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    description: "Update a user in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("user"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Delete a user from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("user"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ban_user",
    description: "Ban a Keygen user from authenticating.",
    requiredScopes: [],
    inputSchema: idInputSchema("user"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "unban_user",
    description: "Unban a Keygen user so they can authenticate again.",
    requiredScopes: [],
    inputSchema: idInputSchema("user"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "change_user_group",
    description: "Move a Keygen user to another group.",
    requiredScopes: [],
    inputSchema: changeRelationshipInputSchema("user group", "groupId", "The Keygen group ID to assign to the user."),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_licenses",
    description: "List licenses in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_license",
    description: "Retrieve one license from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_license",
    description: "Create a license in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_license",
    description: "Update a license in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_license",
    description: "Delete a license from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("license"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "suspend_license",
    description: "Suspend a Keygen license so it can no longer authenticate with the API.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "reinstate_license",
    description: "Reinstate a suspended Keygen license.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "renew_license",
    description: "Renew a Keygen license according to its policy.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "revoke_license",
    description: "Revoke a Keygen license through the official revoke action.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_in_license",
    description: "Check in a Keygen license for policies that require periodic license check-ins.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "increment_license_usage",
    description: "Increment metered usage for a Keygen license.",
    requiredScopes: [],
    inputSchema: licenseUsageInputSchema(
      "increment",
      "increment",
      "The usage amount to increment. Keygen defaults to 1 when omitted.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "decrement_license_usage",
    description: "Decrement metered usage for a Keygen license.",
    requiredScopes: [],
    inputSchema: licenseUsageInputSchema(
      "decrement",
      "decrement",
      "The usage amount to decrement. Keygen defaults to 1 when omitted.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "reset_license_usage",
    description: "Reset metered usage for a Keygen license.",
    requiredScopes: [],
    inputSchema: idInputSchema("license"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "validate_license_by_id",
    description: "Validate a Keygen license by its resource ID and optional validation scope.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for validating a Keygen license by ID.",
      {
        id: s.string("The Keygen license resource ID to validate.", { minLength: 1 }),
        ...validationMetaFields,
      },
      { optional: ["nonce", "scope"] },
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "validate_license_key",
    description: "Validate a Keygen license key and optional validation scope.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for validating a Keygen license key.",
      {
        key: s.string("The Keygen license key to validate.", { minLength: 1 }),
        ...validationMetaFields,
      },
      { optional: ["nonce", "scope"] },
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_license_users",
    description: "List users attached to a Keygen license.",
    requiredScopes: [],
    inputSchema: listRelationshipInputSchema("license users"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "attach_license_users",
    description: "Attach users to a Keygen license.",
    requiredScopes: [],
    inputSchema: relationshipIdsInputSchema(
      "license users",
      "userIds",
      "The Keygen user IDs to attach to the license.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "detach_license_users",
    description: "Detach users from a Keygen license.",
    requiredScopes: [],
    inputSchema: relationshipIdsInputSchema(
      "license users",
      "userIds",
      "The Keygen user IDs to detach from the license.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_license_entitlements",
    description: "List entitlements attached to a Keygen license.",
    requiredScopes: [],
    inputSchema: listRelationshipInputSchema("license entitlements"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "attach_license_entitlements",
    description: "Attach entitlements to a Keygen license.",
    requiredScopes: [],
    inputSchema: relationshipIdsInputSchema(
      "license entitlements",
      "entitlementIds",
      "The Keygen entitlement IDs to attach to the license.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "detach_license_entitlements",
    description: "Detach entitlements from a Keygen license.",
    requiredScopes: [],
    inputSchema: relationshipIdsInputSchema(
      "license entitlements",
      "entitlementIds",
      "The Keygen entitlement IDs to detach from the license.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "change_license_policy",
    description: "Move a Keygen license to another policy.",
    requiredScopes: [],
    inputSchema: changeRelationshipInputSchema(
      "license policy",
      "policyId",
      "The Keygen policy ID to assign to the license.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "change_license_owner",
    description: "Change the owner user for a Keygen license.",
    requiredScopes: [],
    inputSchema: changeRelationshipInputSchema(
      "license owner",
      "userId",
      "The Keygen user ID to assign as the license owner.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "change_license_group",
    description: "Change the group assigned to a Keygen license.",
    requiredScopes: [],
    inputSchema: changeRelationshipInputSchema(
      "license group",
      "groupId",
      "The Keygen group ID to assign to the license.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_machines",
    description: "List activated machines in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("machine"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_machine",
    description: "Retrieve one activated machine from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("machine"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "activate_machine",
    description: "Activate a machine in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("machine"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_machine",
    description: "Update an activated machine in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("machine"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "deactivate_machine",
    description: "Deactivate a machine from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("machine"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ping_machine",
    description: "Ping a Keygen machine heartbeat.",
    requiredScopes: [],
    inputSchema: idInputSchema("machine"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "reset_machine_heartbeat",
    description: "Reset a Keygen machine heartbeat.",
    requiredScopes: [],
    inputSchema: idInputSchema("machine"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "change_machine_owner",
    description: "Change the owner user for a Keygen machine.",
    requiredScopes: [],
    inputSchema: changeRelationshipInputSchema(
      "machine owner",
      "userId",
      "The Keygen user ID to assign as the machine owner.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "change_machine_group",
    description: "Change the group assigned to a Keygen machine.",
    requiredScopes: [],
    inputSchema: changeRelationshipInputSchema(
      "machine group",
      "groupId",
      "The Keygen group ID to assign to the machine.",
    ),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "list_components",
    description: "List machine components in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("component"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_component",
    description: "Retrieve one machine component from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("component"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_component",
    description: "Create a machine component in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("component"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_component",
    description: "Update a machine component in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("component"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_component",
    description: "Delete a machine component from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("component"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_processes",
    description: "List tracked processes in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: listInputSchema("process"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "retrieve_process",
    description: "Retrieve one tracked process from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: idInputSchema("process"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "create_process",
    description: "Create a tracked process in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: createInputSchema("process"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "update_process",
    description: "Update a tracked process in the connected Keygen account.",
    requiredScopes: [],
    inputSchema: updateInputSchema("process"),
    outputSchema: keygenDocumentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_process",
    description: "Delete a tracked process from the connected Keygen account.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("process"),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ping_process",
    description: "Ping a Keygen process heartbeat.",
    requiredScopes: [],
    inputSchema: idInputSchema("process"),
    outputSchema: keygenDocumentSchema,
  }),
];
