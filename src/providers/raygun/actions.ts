import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

type SchemaProperties = Record<string, JsonSchema>;

const service = "raygun" as const;

const applicationIdentifierField = s.string("Raygun application identifier.", { minLength: 1 });
const deploymentIdentifierField = s.string("Raygun deployment identifier.", { minLength: 1 });
const errorGroupIdentifierField = s.string("Raygun error group identifier.", { minLength: 1 });
const countField = s.integer("Maximum number of items to return.", { minimum: 1, maximum: 500 });
const offsetField = s.integer("Number of items to skip before returning results.", {
  minimum: 0,
  maximum: 2147483647,
});
const rawObjectSchema = s.looseObject("The raw Raygun API object for advanced fields.");

function inputObject<const TProperties extends SchemaProperties>(
  description: string,
  properties: TProperties,
  optional?: readonly (keyof TProperties & string)[],
) {
  return s.object(description, properties, optional ? { optional } : {});
}

function outputObject<const TProperties extends SchemaProperties>(
  description: string,
  properties: TProperties,
  optional?: readonly (keyof TProperties & string)[],
) {
  return s.object(description, properties, optional ? { optional } : {});
}

function requireAtLeastOneField(schema: JsonSchema, fieldNames: readonly string[]) {
  return { ...schema, anyOf: fieldNames.map((fieldName) => ({ required: [fieldName] })) };
}

const paginationInputSchema = inputObject(
  "Pagination controls for a Raygun list request.",
  {
    count: countField,
    offset: offsetField,
    orderBy: s.array(
      "Fields and optional directions accepted by the Raygun endpoint.",
      s.string("A Raygun orderBy entry such as `name desc`.", { minLength: 1 }),
      { minItems: 1 },
    ),
  },
  ["count", "offset", "orderBy"],
);

const paginationOutputSchema = outputObject(
  "Pagination metadata returned by Raygun list responses.",
  {
    totalCount: s.integer("Total number of items available when Raygun returns the header."),
    count: s.integer("Number of items in the current response."),
    links: s.record("Parsed Raygun Link header URLs by relation.", s.string("A pagination URL.")),
  },
  ["totalCount", "links"],
);

const listApplicationsInputSchema = paginationInputSchema;
const listApplicationsOutputSchema = outputObject("A Raygun application list.", {
  applications: s.array("Raygun applications returned by the API.", rawObjectSchema),
  pagination: paginationOutputSchema,
});

const getApplicationInputSchema = inputObject("The input for retrieving a Raygun application.", {
  applicationIdentifier: applicationIdentifierField,
});
const applicationOutputSchema = outputObject("A Raygun application result.", {
  application: rawObjectSchema,
});

const deploymentBaseProperties = {
  version: s.string("Deployment version.", { minLength: 1, maxLength: 128 }),
  ownerName: s.string("Deployment owner name.", { maxLength: 128 }),
  emailAddress: s.string("Deployment owner email address.", { format: "email", maxLength: 128 }),
  comment: s.string("Deployment comment."),
  scmIdentifier: s.string("Source control identifier for the deployment.", { maxLength: 256 }),
  scmType: s.stringEnum("Source control system type.", ["gitHub", "gitLab", "azureDevOps", "bitbucket"]),
  deployedAt: s.dateTime("Deployment timestamp."),
} satisfies SchemaProperties;

const listDeploymentsInputSchema = inputObject(
  "Filters and pagination controls for listing Raygun deployments.",
  {
    applicationIdentifier: applicationIdentifierField,
    count: countField,
    offset: offsetField,
    orderBy: s.array(
      "Fields and optional directions accepted by the Raygun deployments endpoint.",
      s.string("A Raygun deployment orderBy entry such as `deployedAt desc`.", { minLength: 1 }),
      { minItems: 1 },
    ),
  },
  ["count", "offset", "orderBy"],
);

const deploymentsOutputSchema = outputObject("A Raygun deployment list.", {
  deployments: s.array("Raygun deployments returned by the API.", rawObjectSchema),
  pagination: paginationOutputSchema,
});

const createDeploymentInputSchema = inputObject(
  "The request payload for creating a Raygun deployment.",
  {
    applicationIdentifier: applicationIdentifierField,
    ...deploymentBaseProperties,
  },
  ["ownerName", "emailAddress", "comment", "scmIdentifier", "scmType", "deployedAt"],
);

const deploymentPathInputSchema = inputObject("The input for retrieving a Raygun deployment.", {
  applicationIdentifier: applicationIdentifierField,
  deploymentIdentifier: deploymentIdentifierField,
});

const updateDeploymentInputSchema = requireAtLeastOneField(
  inputObject(
    "The request payload for updating a Raygun deployment.",
    {
      applicationIdentifier: applicationIdentifierField,
      deploymentIdentifier: deploymentIdentifierField,
      ...deploymentBaseProperties,
    },
    ["version", "ownerName", "emailAddress", "comment", "scmIdentifier", "scmType", "deployedAt"],
  ),
  ["version", "ownerName", "emailAddress", "comment", "scmIdentifier", "scmType", "deployedAt"],
);

const deploymentOutputSchema = outputObject("A Raygun deployment result.", {
  deployment: rawObjectSchema,
});

const deletedDeploymentOutputSchema = outputObject("The Raygun deployment delete result.", {
  applicationIdentifier: applicationIdentifierField,
  deploymentIdentifier: deploymentIdentifierField,
  deleted: s.boolean("Whether the deployment delete request completed successfully."),
});

const listErrorGroupsInputSchema = inputObject(
  "Filters and pagination controls for listing Raygun error groups.",
  {
    applicationIdentifier: applicationIdentifierField,
    count: countField,
    offset: offsetField,
    orderBy: s.array(
      "Fields and optional directions accepted by the Raygun error groups endpoint.",
      s.string("A Raygun error group orderBy entry such as `lastOccurredAt desc`.", {
        minLength: 1,
      }),
      { minItems: 1 },
    ),
  },
  ["count", "offset", "orderBy"],
);

const errorGroupsOutputSchema = outputObject("A Raygun error group list.", {
  errorGroups: s.array("Raygun error groups returned by the API.", rawObjectSchema),
  pagination: paginationOutputSchema,
});

const getErrorGroupInputSchema = inputObject("The input for retrieving a Raygun error group.", {
  applicationIdentifier: applicationIdentifierField,
  errorGroupIdentifier: errorGroupIdentifierField,
});

const errorGroupOutputSchema = outputObject("A Raygun error group result.", {
  errorGroup: rawObjectSchema,
});

export const raygunActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_applications",
    description: "List Raygun applications available to the personal access token.",
    requiredScopes: [],
    inputSchema: listApplicationsInputSchema,
    outputSchema: listApplicationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_application",
    description: "Retrieve a Raygun application by identifier.",
    requiredScopes: [],
    inputSchema: getApplicationInputSchema,
    outputSchema: applicationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    description: "List deployments for a Raygun application.",
    requiredScopes: [],
    inputSchema: listDeploymentsInputSchema,
    outputSchema: deploymentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_latest_deployment",
    description: "Retrieve the latest deployment for a Raygun application.",
    requiredScopes: [],
    inputSchema: inputObject("The input for retrieving the latest Raygun deployment.", {
      applicationIdentifier: applicationIdentifierField,
    }),
    outputSchema: deploymentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    description: "Retrieve a Raygun deployment by identifier.",
    requiredScopes: [],
    inputSchema: deploymentPathInputSchema,
    outputSchema: deploymentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_deployment",
    description: "Create a deployment for a Raygun application.",
    requiredScopes: [],
    inputSchema: createDeploymentInputSchema,
    outputSchema: deploymentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_deployment",
    description: "Update a Raygun deployment.",
    requiredScopes: [],
    inputSchema: updateDeploymentInputSchema,
    outputSchema: deploymentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_deployment",
    description: "Delete a Raygun deployment.",
    requiredScopes: [],
    inputSchema: deploymentPathInputSchema,
    outputSchema: deletedDeploymentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_error_groups",
    description: "List crash reporting error groups for a Raygun application.",
    requiredScopes: [],
    inputSchema: listErrorGroupsInputSchema,
    outputSchema: errorGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_error_group",
    description: "Retrieve a Raygun error group by identifier.",
    requiredScopes: [],
    inputSchema: getErrorGroupInputSchema,
    outputSchema: errorGroupOutputSchema,
  }),
] satisfies Array<ProviderActionDefinition<any>>;
