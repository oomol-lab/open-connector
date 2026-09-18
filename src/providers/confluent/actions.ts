import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "confluent";
const idSchema = (description: string) => s.nonEmptyString(description);
const pageSizeSchema = s.integer("The maximum number of resources to return.", {
  minimum: 1,
  maximum: 100,
});
const pageTokenSchema = s.nonEmptyString("The opaque Confluent pagination token.", {
  maxLength: 255,
});
const rawResourceSchema = s.looseObject("The Confluent resource object returned by the API.");
const paginationSchema = s.object("Pagination metadata returned by Confluent.", {
  first: s.nullable(s.string("The first-page URL when returned.")),
  last: s.nullable(s.string("The last-page URL when returned.")),
  previous: s.nullable(s.string("The previous-page URL when returned.")),
  next: s.nullable(s.string("The next-page URL when returned.")),
  nextPageToken: s.nullable(s.string("The opaque token for requesting the next page.")),
  totalSize: s.nullable(s.integer("The total number of resources when returned.")),
});

const paginatedInputSchema = (description: string, properties = {}) =>
  s.object(
    description,
    {
      ...properties,
      pageSize: pageSizeSchema,
      pageToken: pageTokenSchema,
    },
    { optional: ["pageSize", "pageToken"] },
  );

const listOutputSchema = (name: string) =>
  s.object(`A page of Confluent ${name}.`, {
    [name]: s.array(`The ${name} returned by Confluent.`, rawResourceSchema),
    pagination: paginationSchema,
  });

const resourceOutputSchema = (name: string) =>
  s.object(`The Confluent ${name} response.`, {
    [name]: rawResourceSchema,
  });

const environmentIdSchema = idSchema("The Confluent environment ID.");
const environmentNameSchema = s.nonEmptyString("The human-readable environment name.");
const governancePackageSchema = s.stringEnum("The Stream Governance package for the environment.", [
  "ESSENTIALS",
  "ADVANCED",
]);

export const confluentActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    operationType: "read",
    description: "List Confluent Cloud organizations visible to the connected Cloud API key.",
    requiredScopes: [],
    inputSchema: paginatedInputSchema("Input for listing Confluent Cloud organizations."),
    outputSchema: listOutputSchema("organizations"),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    operationType: "read",
    description: "Retrieve one Confluent Cloud organization by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Confluent Cloud organization.", {
      organizationId: idSchema("The Confluent organization ID."),
    }),
    outputSchema: resourceOutputSchema("organization"),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    operationType: "read",
    description: "List Confluent Cloud environments visible to the connected Cloud API key.",
    requiredScopes: [],
    inputSchema: paginatedInputSchema("Input for listing Confluent Cloud environments."),
    outputSchema: listOutputSchema("environments"),
  }),
  defineProviderAction(service, {
    name: "get_environment",
    operationType: "read",
    description: "Retrieve one Confluent Cloud environment by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Confluent Cloud environment.", {
      environmentId: environmentIdSchema,
    }),
    outputSchema: resourceOutputSchema("environment"),
  }),
  defineProviderAction(service, {
    name: "create_environment",
    operationType: "write",
    description: "Create a Confluent Cloud environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Confluent Cloud environment.",
      {
        displayName: environmentNameSchema,
        governancePackage: governancePackageSchema,
      },
      { optional: ["governancePackage"] },
    ),
    outputSchema: resourceOutputSchema("environment"),
  }),
  defineProviderAction(service, {
    name: "update_environment",
    operationType: "write",
    description: "Update the display name or Stream Governance package of an environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Confluent Cloud environment.",
      {
        environmentId: environmentIdSchema,
        displayName: environmentNameSchema,
        governancePackage: governancePackageSchema,
      },
      { optional: ["displayName", "governancePackage"] },
    ),
    outputSchema: resourceOutputSchema("environment"),
  }),
  defineProviderAction(service, {
    name: "delete_environment",
    operationType: "destructive",
    description: "Delete a Confluent Cloud environment by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Confluent Cloud environment.", {
      environmentId: environmentIdSchema,
    }),
    outputSchema: s.object("The Confluent Cloud environment deletion result.", {
      deleted: s.boolean("Whether Confluent accepted the deletion request."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_kafka_clusters",
    operationType: "read",
    description: "List Kafka clusters in a Confluent Cloud environment.",
    requiredScopes: [],
    inputSchema: paginatedInputSchema("Input for listing Confluent Cloud Kafka clusters.", {
      environmentId: environmentIdSchema,
    }),
    outputSchema: listOutputSchema("clusters"),
  }),
  defineProviderAction(service, {
    name: "get_kafka_cluster",
    operationType: "read",
    description: "Retrieve one Kafka cluster in a Confluent Cloud environment.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Confluent Cloud Kafka cluster.", {
      environmentId: environmentIdSchema,
      clusterId: idSchema("The Confluent Kafka cluster ID."),
    }),
    outputSchema: resourceOutputSchema("cluster"),
  }),
];
