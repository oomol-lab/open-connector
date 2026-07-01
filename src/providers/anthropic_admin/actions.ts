import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "anthropic_admin";

const nullableStringSchema = s.nullable(s.string("The string value returned by Anthropic."));
const timestampSchema = s.nullable(s.dateTime("The RFC 3339 timestamp returned by Anthropic when available."));
const paginationInputSchema = s.object(
  "Cursor pagination parameters for Anthropic Admin API list endpoints.",
  {
    before_id: s.string("Return objects before this object identifier.", { minLength: 1 }),
    after_id: s.string("Return objects after this object identifier.", { minLength: 1 }),
    limit: s.integer("The maximum number of objects to return.", { minimum: 1, maximum: 1000 }),
  },
  { optional: ["before_id", "after_id", "limit"] },
);
const paginationOutputFields = {
  has_more: s.boolean("Whether more results are available after this page."),
  first_id: s.nullable(s.string("The first object identifier in this page.")),
  last_id: s.nullable(s.string("The last object identifier in this page.")),
};
const organizationSchema = s.looseObject(
  {
    id: s.string("The Anthropic organization identifier."),
    type: s.string("The object type returned by Anthropic."),
    name: s.string("The organization display name."),
  },
  { description: "An Anthropic organization object." },
);
const userSchema = s.looseObject(
  {
    id: s.string("The Anthropic user identifier."),
    type: s.string("The object type returned by Anthropic."),
    email: s.string("The user's email address."),
    name: nullableStringSchema,
    role: s.string("The user's organization role."),
  },
  { description: "An Anthropic organization user object." },
);
const workspaceSchema = s.looseObject(
  {
    id: s.string("The Anthropic workspace identifier."),
    type: s.string("The object type returned by Anthropic."),
    name: s.string("The workspace display name."),
    archived_at: timestampSchema,
    created_at: s.dateTime("The date and time when the workspace was created."),
  },
  { description: "An Anthropic workspace object." },
);
const actorSchema = s.looseObject(
  {
    id: s.string("The actor identifier."),
    type: s.string("The actor object type."),
  },
  { description: "The Anthropic actor that created a resource." },
);
const apiKeySchema = s.looseObject(
  {
    id: s.string("The Anthropic API key identifier."),
    type: s.string("The object type returned by Anthropic."),
    name: s.string("The API key display name."),
    partial_key_hint: nullableStringSchema,
    created_at: s.dateTime("The date and time when the API key was created."),
    created_by: actorSchema,
    workspace_id: nullableStringSchema,
  },
  { description: "An Anthropic Admin API key object." },
);
const workspaceMemberSchema = s.looseObject(
  {
    id: s.string("The Anthropic user identifier."),
    type: s.string("The object type returned by Anthropic."),
    email: s.string("The member email address."),
    name: nullableStringSchema,
    workspace_role: s.string("The user's role in the workspace."),
  },
  { description: "An Anthropic workspace member object." },
);
const inviteSchema = s.looseObject(
  {
    id: s.string("The Anthropic invite identifier."),
    type: s.string("The object type returned by Anthropic."),
    email: s.string("The invited email address."),
    role: s.string("The organization role assigned by the invite."),
    status: s.string("The invite status."),
    expires_at: timestampSchema,
  },
  { description: "An Anthropic organization invite object." },
);
const listApiKeysInputSchema = s.object(
  "The filters and pagination parameters for listing Anthropic API keys.",
  {
    workspace_id: s.string("Only return API keys belonging to this workspace.", { minLength: 1 }),
    before_id: s.string("Return API keys before this API key identifier.", { minLength: 1 }),
    after_id: s.string("Return API keys after this API key identifier.", { minLength: 1 }),
    limit: s.integer("The maximum number of API keys to return.", { minimum: 1, maximum: 1000 }),
  },
  { optional: ["workspace_id", "before_id", "after_id", "limit"] },
);
const workspaceMembersInputSchema = s.object(
  "The input payload for listing Anthropic workspace members.",
  {
    workspace_id: s.string("The Anthropic workspace identifier.", { minLength: 1 }),
    before_id: s.string("Return members before this member identifier.", { minLength: 1 }),
    after_id: s.string("Return members after this member identifier.", { minLength: 1 }),
    limit: s.integer("The maximum number of members to return.", { minimum: 1, maximum: 1000 }),
  },
  { required: ["workspace_id"], optional: ["before_id", "after_id", "limit"] },
);

export const anthropicAdminActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve the Anthropic organization associated with the Admin API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the Anthropic organization.", {}),
    outputSchema: organizationSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the Anthropic organization with cursor pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("The response payload for listing Anthropic users.", "users", userSchema),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Anthropic workspaces in the organization with cursor pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("The response payload for listing Anthropic workspaces.", "workspaces", workspaceSchema),
  }),
  defineProviderAction(service, {
    name: "list_api_keys",
    description: "List Anthropic API keys in the organization, optionally filtered by workspace.",
    requiredScopes: [],
    inputSchema: listApiKeysInputSchema,
    outputSchema: listOutputSchema("The response payload for listing Anthropic API keys.", "API keys", apiKeySchema),
  }),
  defineProviderAction(service, {
    name: "list_workspace_members",
    description: "List members of one Anthropic workspace with cursor pagination.",
    requiredScopes: [],
    inputSchema: workspaceMembersInputSchema,
    outputSchema: listOutputSchema(
      "The response payload for listing Anthropic workspace members.",
      "workspace members",
      workspaceMemberSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_invites",
    description: "List pending or historical Anthropic organization invites.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("The response payload for listing Anthropic invites.", "invites", inviteSchema),
  }),
];

function listOutputSchema(description: string, itemLabel: string, itemSchema: ActionDefinition["outputSchema"]) {
  return s.object(description, {
    data: s.array(`The Anthropic ${itemLabel} returned in this page.`, itemSchema),
    ...paginationOutputFields,
  });
}
