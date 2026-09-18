import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "octopus_deploy";

const spaceIdentifierSchema = s.nonEmptyString("The Octopus Deploy space identifier, ID, or slug.");
const resourceIdSchema = s.nonEmptyString("The Octopus Deploy resource ID.");
const skipSchema = s.nonNegativeInteger("Number of items to skip. Defaults to zero.");
const takeSchema = s.positiveInteger("Number of items to take. Defaults to the Octopus API default.");
const partialNameSchema = s.nonEmptyString("Optional partial name used by Octopus Deploy collection filters.");
const idsSchema = s.array(
  "Optional Octopus Deploy resource IDs used to filter the collection.",
  s.nonEmptyString("One Octopus Deploy resource ID."),
  { minItems: 1 },
);
const stringArrayFilterSchema = s.array(
  "Optional Octopus Deploy filter values.",
  s.nonEmptyString("One Octopus Deploy filter value."),
  { minItems: 1 },
);
const looseResourceSchema = s.looseObject("A resource object returned by the Octopus Deploy API.");
const paginationSchema = s.object(
  "Pagination metadata returned by an Octopus Deploy collection endpoint.",
  {
    totalResults: s.integer("Total matching resources reported by Octopus Deploy."),
    itemsPerPage: s.integer("Number of items included per page."),
    numberOfPages: s.integer("Number of pages reported by Octopus Deploy."),
    lastPageNumber: s.integer("Last page number reported by Octopus Deploy."),
    links: s.looseObject("Pagination links returned by Octopus Deploy."),
  },
  { optional: ["totalResults", "itemsPerPage", "numberOfPages", "lastPageNumber", "links"] },
);
const collectionOutputSchema = s.requiredObject("A normalized Octopus Deploy collection response.", {
  items: s.array("Resources returned by Octopus Deploy.", looseResourceSchema),
  pagination: paginationSchema,
  raw: s.looseObject("The raw Octopus Deploy collection response."),
});
const resourceOutputSchema = s.requiredObject("A normalized Octopus Deploy resource response.", {
  resource: looseResourceSchema,
  raw: s.looseObject("The raw Octopus Deploy resource response."),
});
const listSpacesInputSchema = s.object(
  "Query parameters for listing Octopus Deploy spaces.",
  {
    ids: idsSchema,
    name: s.nonEmptyString("Optional exact space name to match."),
    partialName: partialNameSchema,
    skip: skipSchema,
    take: takeSchema,
  },
  { optional: ["ids", "name", "partialName", "skip", "take"] },
);
const spaceCollectionInputSchema = s.object(
  "Query parameters for listing resources inside an Octopus Deploy space.",
  {
    spaceIdentifier: spaceIdentifierSchema,
    ids: idsSchema,
    partialName: partialNameSchema,
    skip: skipSchema,
    take: takeSchema,
  },
  { optional: ["ids", "partialName", "skip", "take"] },
);
const getSpaceResourceInputSchema = s.requiredObject(
  "Path parameters for fetching one resource inside an Octopus Deploy space.",
  {
    spaceIdentifier: spaceIdentifierSchema,
    id: resourceIdSchema,
  },
);
const listReleasesInputSchema = s.object(
  "Query parameters for listing releases inside an Octopus Deploy space.",
  {
    spaceIdentifier: spaceIdentifierSchema,
    skip: skipSchema,
    take: takeSchema,
  },
  { optional: ["skip", "take"] },
);
const listDeploymentsInputSchema = s.object(
  "Query parameters for listing deployments inside an Octopus Deploy space.",
  {
    spaceIdentifier: spaceIdentifierSchema,
    channels: stringArrayFilterSchema,
    environments: stringArrayFilterSchema,
    ids: idsSchema,
    partialName: partialNameSchema,
    projects: stringArrayFilterSchema,
    skip: skipSchema,
    take: takeSchema,
    taskState: s.nonEmptyString("Optional Octopus Deploy task state filter."),
    tenants: stringArrayFilterSchema,
  },
  {
    optional: ["channels", "environments", "ids", "partialName", "projects", "skip", "take", "taskState", "tenants"],
  },
);
const listTasksInputSchema = s.object(
  "Query parameters for listing server tasks inside an Octopus Deploy space.",
  {
    spaceIdentifier: spaceIdentifierSchema,
    active: s.boolean("Whether to return only active server tasks."),
    batch: s.nonEmptyString("Optional task batch identifier filter."),
    description: s.nonEmptyString("Optional task description filter."),
    environment: s.nonEmptyString("Optional environment ID filter."),
    fromCompletedDate: s.dateTime("Optional lower bound for task completion time."),
    fromQueueDate: s.dateTime("Optional lower bound for task queue time."),
    fromStartDate: s.dateTime("Optional lower bound for task start time."),
    hasPendingInterruptions: s.boolean("Whether to return tasks with pending interruptions."),
    hasPendingPreconditions: s.boolean("Whether to return tasks with pending preconditions."),
    hasWarningsOrErrors: s.boolean("Whether to return tasks with warnings or errors."),
    ids: idsSchema,
    name: stringArrayFilterSchema,
    node: s.nonEmptyString("Optional Octopus server node filter."),
    partialName: partialNameSchema,
    project: s.nonEmptyString("Optional project ID filter."),
    runbook: s.nonEmptyString("Optional runbook ID filter."),
    running: s.boolean("Whether to return running tasks."),
    skip: skipSchema,
    states: stringArrayFilterSchema,
    take: takeSchema,
    tenant: s.nonEmptyString("Optional tenant ID filter."),
    tenantTag: s.nonEmptyString("Optional tenant tag filter."),
    toCompletedDate: s.dateTime("Optional upper bound for task completion time."),
    toQueueDate: s.dateTime("Optional upper bound for task queue time."),
    toStartDate: s.dateTime("Optional upper bound for task start time."),
  },
  {
    optional: [
      "active",
      "batch",
      "description",
      "environment",
      "fromCompletedDate",
      "fromQueueDate",
      "fromStartDate",
      "hasPendingInterruptions",
      "hasPendingPreconditions",
      "hasWarningsOrErrors",
      "ids",
      "name",
      "node",
      "partialName",
      "project",
      "runbook",
      "running",
      "skip",
      "states",
      "take",
      "tenant",
      "tenantTag",
      "toCompletedDate",
      "toQueueDate",
      "toStartDate",
    ],
  },
);
const currentUserOutputSchema = s.requiredObject("The normalized Octopus Deploy current user response.", {
  user: looseResourceSchema,
  raw: s.looseObject("The raw Octopus Deploy current user response."),
});

export const octopusDeployActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Fetch the current Octopus Deploy user for the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching the current Octopus Deploy user.", {}),
    outputSchema: currentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    operationType: "read",
    description: "List Octopus Deploy spaces visible to the connected API key.",
    requiredScopes: [],
    inputSchema: listSpacesInputSchema,
    outputSchema: collectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List projects inside an Octopus Deploy space.",
    requiredScopes: [],
    inputSchema: spaceCollectionInputSchema,
    outputSchema: collectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Fetch one project inside an Octopus Deploy space by ID.",
    requiredScopes: [],
    inputSchema: getSpaceResourceInputSchema,
    outputSchema: resourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_environments",
    operationType: "read",
    description: "List environments inside an Octopus Deploy space.",
    requiredScopes: [],
    inputSchema: spaceCollectionInputSchema,
    outputSchema: collectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_environment",
    operationType: "read",
    description: "Fetch one environment inside an Octopus Deploy space by ID.",
    requiredScopes: [],
    inputSchema: getSpaceResourceInputSchema,
    outputSchema: resourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_releases",
    operationType: "read",
    description: "List releases inside an Octopus Deploy space.",
    requiredScopes: [],
    inputSchema: listReleasesInputSchema,
    outputSchema: collectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_release",
    operationType: "read",
    description: "Fetch one release inside an Octopus Deploy space by ID.",
    requiredScopes: [],
    inputSchema: getSpaceResourceInputSchema,
    outputSchema: resourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    operationType: "read",
    description: "List deployments inside an Octopus Deploy space with optional filters.",
    requiredScopes: [],
    inputSchema: listDeploymentsInputSchema,
    outputSchema: collectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    operationType: "read",
    description: "Fetch one deployment inside an Octopus Deploy space by ID.",
    requiredScopes: [],
    inputSchema: getSpaceResourceInputSchema,
    outputSchema: resourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List Octopus Deploy server tasks inside a space with optional filters.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: collectionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description: "Fetch one Octopus Deploy server task inside a space by ID.",
    requiredScopes: [],
    inputSchema: getSpaceResourceInputSchema,
    outputSchema: resourceOutputSchema,
  }),
];
