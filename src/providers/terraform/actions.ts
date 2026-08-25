import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "terraform" as const;

const nonEmptyStringSchema = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

const pageNumberSchema = s.positiveInteger("The 1-indexed page number to request.");
const pageSizeSchema = s.positiveInteger("The number of records to request per page.");

const organizationNameSchema = nonEmptyStringSchema("The HCP Terraform organization name.");
const workspaceNameSchema = nonEmptyStringSchema("The HCP Terraform workspace name.");
const workspaceIdSchema = nonEmptyStringSchema("The HCP Terraform workspace ID.");
const runIdSchema = nonEmptyStringSchema("The HCP Terraform run ID.");

const jsonApiLinksSchema = s.looseObject("The JSON:API links object returned by HCP Terraform.");
const jsonApiMetaSchema = s.looseObject("The JSON:API metadata object returned by HCP Terraform.");
const jsonApiRelationshipsSchema = s.looseObject("The JSON:API relationships object returned by HCP Terraform.");

const jsonApiResourceSchema = s.object("A normalized JSON:API resource returned by HCP Terraform.", {
  id: s.string("The JSON:API resource ID."),
  type: s.string("The JSON:API resource type."),
  attributes: s.looseObject("The JSON:API resource attributes returned by HCP Terraform."),
  relationships: s.nullable(jsonApiRelationshipsSchema),
  links: s.nullable(jsonApiLinksSchema),
});

const includedSchema = s.array("The included JSON:API resources returned by HCP Terraform.", jsonApiResourceSchema);

const listResponseFields = {
  links: s.nullable(jsonApiLinksSchema),
  meta: s.nullable(jsonApiMetaSchema),
  included: includedSchema,
};

const runOperationSchema = s.stringEnum("The run operation filter value.", [
  "plan_only",
  "plan_and_apply",
  "save_plan",
  "refresh_only",
  "destroy",
  "empty_apply",
  "action_only",
]);

const runStatusGroupSchema = s.stringEnum("The run status group filter value.", ["non_final", "final", "discardable"]);

const runSourceSchema = s.stringEnum("The run source filter value.", [
  "tfe-ui",
  "tfe-api",
  "tfe-configuration-version",
]);

const paginationInputFields = {
  pageNumber: pageNumberSchema,
  pageSize: pageSizeSchema,
};

const getAccountDetailsAction = defineProviderAction(service, {
  name: "get_account_details",
  description: "Get details for the user or service user associated with the Terraform API token.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting Terraform account details.", {}),
  outputSchema: s.object("The response returned when getting Terraform account details.", {
    user: jsonApiResourceSchema,
  }),
});

const listOrganizationsAction = defineProviderAction(service, {
  name: "list_organizations",
  description: "List HCP Terraform organizations visible to the authenticated token.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Terraform organizations.", paginationInputFields, {
    optional: ["pageNumber", "pageSize"],
  }),
  outputSchema: s.object("The response returned when listing Terraform organizations.", {
    organizations: s.array("The organizations returned by HCP Terraform.", jsonApiResourceSchema),
    ...listResponseFields,
  }),
});

const getOrganizationAction = defineProviderAction(service, {
  name: "get_organization",
  description: "Get details for a single HCP Terraform organization by name.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Terraform organization.", {
    organizationName: organizationNameSchema,
  }),
  outputSchema: s.object("The response returned when getting a Terraform organization.", {
    organization: jsonApiResourceSchema,
    included: includedSchema,
  }),
});

const listWorkspacesAction = defineProviderAction(service, {
  name: "list_workspaces",
  description: "List HCP Terraform workspaces in an organization with optional pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Terraform workspaces.",
    {
      organizationName: organizationNameSchema,
      ...paginationInputFields,
    },
    { optional: ["pageNumber", "pageSize"] },
  ),
  outputSchema: s.object("The response returned when listing Terraform workspaces.", {
    workspaces: s.array("The workspaces returned by HCP Terraform.", jsonApiResourceSchema),
    ...listResponseFields,
  }),
});

const getWorkspaceByIdAction = defineProviderAction(service, {
  name: "get_workspace_by_id",
  description: "Get HCP Terraform workspace details by workspace ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Terraform workspace by ID.", {
    workspaceId: workspaceIdSchema,
  }),
  outputSchema: s.object("The response returned when getting a Terraform workspace.", {
    workspace: jsonApiResourceSchema,
    included: includedSchema,
  }),
});

const getWorkspaceByNameAction = defineProviderAction(service, {
  name: "get_workspace_by_name",
  description: "Get HCP Terraform workspace details by organization and workspace name.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Terraform workspace by name.", {
    organizationName: organizationNameSchema,
    workspaceName: workspaceNameSchema,
  }),
  outputSchema: s.object("The response returned when getting a Terraform workspace.", {
    workspace: jsonApiResourceSchema,
    included: includedSchema,
  }),
});

const listWorkspaceRunsAction = defineProviderAction(service, {
  name: "list_workspace_runs",
  description: "List HCP Terraform runs for a workspace with optional filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Terraform workspace runs.",
    {
      workspaceId: workspaceIdSchema,
      pageNumber: pageNumberSchema,
      pageSize: pageSizeSchema,
      operations: s.array("The run operations to include.", runOperationSchema, { minItems: 1 }),
      statuses: s.array("The run statuses to include.", nonEmptyStringSchema("A run status."), {
        minItems: 1,
      }),
      statusGroup: runStatusGroupSchema,
      sources: s.array("The run sources to include.", runSourceSchema, { minItems: 1 }),
    },
    {
      optional: ["pageNumber", "pageSize", "operations", "statuses", "statusGroup", "sources"],
    },
  ),
  outputSchema: s.object("The response returned when listing Terraform workspace runs.", {
    runs: s.array("The runs returned by HCP Terraform.", jsonApiResourceSchema),
    ...listResponseFields,
  }),
});

const getRunAction = defineProviderAction(service, {
  name: "get_run",
  description: "Get HCP Terraform run details by run ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting a Terraform run.", {
    runId: runIdSchema,
  }),
  outputSchema: s.object("The response returned when getting a Terraform run.", {
    run: jsonApiResourceSchema,
    included: includedSchema,
  }),
});

export const terraformActions: ActionDefinition[] = [
  getAccountDetailsAction,
  listOrganizationsAction,
  getOrganizationAction,
  listWorkspacesAction,
  getWorkspaceByIdAction,
  getWorkspaceByNameAction,
  listWorkspaceRunsAction,
  getRunAction,
];
