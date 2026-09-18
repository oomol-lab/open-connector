import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "permit_io";

const contextFields: Record<string, JsonSchema> = {
  projectId: s.nonEmptyString(
    "The Permit.io project id or key. Required when the connected API key is not environment-scoped.",
  ),
  environmentId: s.nonEmptyString(
    "The Permit.io environment id or key. Required when the connected API key is not environment-scoped.",
  ),
};

const paginationFields: Record<string, JsonSchema> = {
  page: s.positiveInteger("The page number to retrieve, starting at 1."),
  perPage: s.integer("The maximum number of records per page.", { minimum: 1, maximum: 100 }),
};

const userPayloadFields: Record<string, JsonSchema> = {
  key: s.nonEmptyString("The unique key Permit.io uses to identify the user."),
  email: s.email("The user's email address."),
  first_name: s.nonEmptyString("The user's first name."),
  last_name: s.nonEmptyString("The user's last name."),
  attributes: s.looseObject("Arbitrary user attributes used by attribute-based policies."),
};

const userSchema = s.looseObject(
  {
    key: s.nonEmptyString("The unique user key."),
    id: s.nonEmptyString("The Permit.io user id."),
    organization_id: s.nonEmptyString("The organization id containing the user."),
    project_id: s.nonEmptyString("The project id containing the user."),
    environment_id: s.nonEmptyString("The environment id containing the user."),
    email: s.email("The user's email address."),
    first_name: s.nonEmptyString("The user's first name."),
    last_name: s.nonEmptyString("The user's last name."),
    attributes: s.looseObject("The user's arbitrary authorization attributes."),
    created_at: s.dateTime("The user creation timestamp."),
    updated_at: s.dateTime("The user update timestamp."),
  },
  { description: "A Permit.io user." },
);

const tenantPayloadFields: Record<string, JsonSchema> = {
  key: s.nonEmptyString("The URL-friendly key Permit.io uses to identify the tenant."),
  name: s.nonEmptyString("The descriptive tenant name."),
  description: s.string("The longer tenant description."),
  attributes: s.looseObject("Arbitrary tenant attributes used by attribute-based policies."),
};

const tenantSchema = s.looseObject(
  {
    key: s.nonEmptyString("The unique tenant key."),
    id: s.nonEmptyString("The Permit.io tenant id."),
    organization_id: s.nonEmptyString("The organization id containing the tenant."),
    project_id: s.nonEmptyString("The project id containing the tenant."),
    environment_id: s.nonEmptyString("The environment id containing the tenant."),
    name: s.nonEmptyString("The tenant name."),
    description: s.string("The tenant description."),
    attributes: s.looseObject("The tenant's arbitrary authorization attributes."),
    created_at: s.dateTime("The tenant creation timestamp."),
    updated_at: s.dateTime("The tenant update timestamp."),
    last_action_at: s.dateTime("The timestamp of the tenant's latest permission check."),
  },
  { description: "A Permit.io tenant." },
);

const roleAssignmentPayloadFields: Record<string, JsonSchema> = {
  user: s.nonEmptyString("The user id or key receiving the role."),
  role: s.nonEmptyString("The role id or key to assign or remove."),
  tenant: s.nonEmptyString("The tenant id or key that scopes the role."),
  resource_instance: s.nonEmptyString(
    "The resource instance id, or resource_type:resource_instance key, that scopes the role.",
  ),
};

const roleAssignmentSchema = s.looseObject(
  {
    id: s.nonEmptyString("The role assignment id."),
    user: s.nonEmptyString("The assigned user key."),
    role: s.nonEmptyString("The assigned role key."),
    tenant: s.nonEmptyString("The tenant key that scopes the assignment."),
    resource_instance: s.nonEmptyString("The resource instance key that scopes the assignment."),
    user_id: s.nonEmptyString("The assigned user id."),
    role_id: s.nonEmptyString("The assigned role id."),
    tenant_id: s.nonEmptyString("The tenant id that scopes the assignment."),
    organization_id: s.nonEmptyString("The organization id containing the assignment."),
    project_id: s.nonEmptyString("The project id containing the assignment."),
    environment_id: s.nonEmptyString("The environment id containing the assignment."),
    created_at: s.dateTime("The assignment creation timestamp."),
  },
  { description: "A Permit.io role assignment." },
);

function paginatedOutput(description: string, itemDescription: string, item: JsonSchema): JsonSchema {
  return s.actionOutput(
    {
      data: s.array(itemDescription, item),
      total_count: s.integer("The total number of matching records."),
      page_count: s.integer("The number of pages containing matching records."),
    },
    description,
    ["data", "total_count"],
  );
}

const okOutputSchema = s.actionOutput(
  {
    ok: s.boolean("Whether Permit.io accepted the operation."),
  },
  "The result of a successful empty Permit.io operation.",
);

export const permitIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List users in a Permit.io environment.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        search: s.nonEmptyString("Text to search for in user email addresses."),
        role: s.nonEmptyString("Only return users assigned this role id or key."),
        ...paginationFields,
      },
      [],
      "Input parameters for listing Permit.io users.",
    ),
    outputSchema: paginatedOutput("The paginated Permit.io user result.", "Permit.io users.", userSchema),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Retrieve a Permit.io user by id or key.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        userId: s.nonEmptyString("The Permit.io user id or key."),
      },
      ["userId"],
      "Input parameters for retrieving a Permit.io user.",
    ),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "create_user",
    operationType: "write",
    description: "Create a user in a Permit.io environment.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        ...userPayloadFields,
      },
      ["key"],
      "Input parameters for creating a Permit.io user.",
    ),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description: "Partially update a Permit.io user.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        userId: s.nonEmptyString("The Permit.io user id or key."),
        email: userPayloadFields.email,
        first_name: userPayloadFields.first_name,
        last_name: userPayloadFields.last_name,
        attributes: userPayloadFields.attributes,
      },
      ["userId"],
      "Input parameters for updating a Permit.io user.",
    ),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description: "Delete a Permit.io user by id or key.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        userId: s.nonEmptyString("The Permit.io user id or key."),
      },
      ["userId"],
      "Input parameters for deleting a Permit.io user.",
    ),
    outputSchema: okOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tenants",
    operationType: "read",
    description: "List tenants in a Permit.io environment.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        search: s.nonEmptyString("Text to search for in tenant names or keys."),
        ...paginationFields,
      },
      [],
      "Input parameters for listing Permit.io tenants.",
    ),
    outputSchema: s.array("Permit.io tenants.", tenantSchema),
  }),
  defineProviderAction(service, {
    name: "get_tenant",
    operationType: "read",
    description: "Retrieve a Permit.io tenant by id or key.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        tenantId: s.nonEmptyString("The Permit.io tenant id or key."),
      },
      ["tenantId"],
      "Input parameters for retrieving a Permit.io tenant.",
    ),
    outputSchema: tenantSchema,
  }),
  defineProviderAction(service, {
    name: "create_tenant",
    operationType: "write",
    description: "Create a tenant in a Permit.io environment.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        ...tenantPayloadFields,
      },
      ["key", "name"],
      "Input parameters for creating a Permit.io tenant.",
    ),
    outputSchema: tenantSchema,
  }),
  defineProviderAction(service, {
    name: "update_tenant",
    operationType: "write",
    description: "Partially update a Permit.io tenant.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        tenantId: s.nonEmptyString("The Permit.io tenant id or key."),
        name: tenantPayloadFields.name,
        description: tenantPayloadFields.description,
        attributes: tenantPayloadFields.attributes,
      },
      ["tenantId"],
      "Input parameters for updating a Permit.io tenant.",
    ),
    outputSchema: tenantSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tenant",
    operationType: "destructive",
    description: "Delete a Permit.io tenant by id or key.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        tenantId: s.nonEmptyString("The Permit.io tenant id or key."),
      },
      ["tenantId"],
      "Input parameters for deleting a Permit.io tenant.",
    ),
    outputSchema: okOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_role_assignments",
    operationType: "read",
    description: "List role assignments in a Permit.io environment.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        user: s.nonEmptyString("Only return assignments for this user id or key."),
        role: s.nonEmptyString("Only return assignments granting this role id or key."),
        tenant: s.nonEmptyString("Only return assignments in this tenant id or key."),
        resource: s.nonEmptyString("Only return assignments for this resource type."),
        resourceInstance: s.nonEmptyString("Only return assignments for this resource instance."),
        detailed: s.boolean("Whether to include full user, tenant, and role details."),
        ...paginationFields,
      },
      [],
      "Input parameters for listing Permit.io role assignments.",
    ),
    outputSchema: paginatedOutput(
      "The paginated Permit.io role assignment result.",
      "Permit.io role assignments.",
      roleAssignmentSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "assign_role",
    operationType: "write",
    description: "Assign a Permit.io role to a user.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        ...roleAssignmentPayloadFields,
      },
      ["user", "role"],
      "Input parameters for assigning a Permit.io role.",
    ),
    outputSchema: roleAssignmentSchema,
  }),
  defineProviderAction(service, {
    name: "unassign_role",
    operationType: "destructive",
    description: "Remove a Permit.io role assignment from a user.",
    inputSchema: s.actionInput(
      {
        ...contextFields,
        ...roleAssignmentPayloadFields,
      },
      ["user", "role"],
      "Input parameters for removing a Permit.io role assignment.",
    ),
    outputSchema: okOutputSchema,
  }),
];
