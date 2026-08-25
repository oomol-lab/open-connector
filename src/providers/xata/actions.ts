import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "xata";

const xataIdSchema = (description: string) => s.string({ description, minLength: 1 });
const organizationIdSchema = xataIdSchema("The Xata organizationID path parameter.");
const projectIdSchema = xataIdSchema("The Xata projectID path parameter.");
const branchIdSchema = xataIdSchema("The Xata branchID path parameter.");

const rawObjectSchema = s.looseObject("The raw object returned by Xata.");
const statusSchema = s.looseObject("The status object returned by Xata.");
const configurationSchema = s.looseObject("The configuration object returned by Xata.");
const scaleToZeroSchema = s.looseObject("The scaleToZero object returned by Xata.");

const organizationSchema = s.object(
  "A normalized Xata organization.",
  {
    id: s.string("The unique Xata organization ID."),
    name: s.string("The Xata organization name."),
    status: statusSchema,
    marketplace: s.nullableString("The marketplace provider for the organization, if present."),
    raw: rawObjectSchema,
  },
  { required: ["id", "name", "status", "marketplace", "raw"] },
);

const projectSchema = s.object(
  "A normalized Xata project.",
  {
    id: s.string("The unique Xata project ID."),
    name: s.string("The Xata project name."),
    createdAt: s.dateTime("The timestamp when Xata created the project."),
    updatedAt: s.dateTime("The timestamp when Xata last updated the project."),
    configuration: configurationSchema,
    raw: rawObjectSchema,
  },
  { required: ["id", "name", "createdAt", "updatedAt", "configuration", "raw"] },
);

const branchBaseProperties = {
  id: s.string("The unique Xata branch ID."),
  name: s.string("The Xata branch name."),
  createdAt: s.dateTime("The timestamp when Xata created the branch."),
  updatedAt: s.dateTime("The timestamp when Xata last updated the branch."),
  region: s.string("The region where the Xata branch is deployed."),
  publicAccess: s.boolean("Whether the branch allows public access."),
  backupsEnabled: s.boolean("Whether backups are enabled for the branch."),
  description: s.nullableString("The branch description when one is present."),
  parentID: s.nullableString("The parent branch ID when one is present."),
  raw: rawObjectSchema,
};

const branchRequiredKeys = [
  "id",
  "name",
  "createdAt",
  "updatedAt",
  "region",
  "publicAccess",
  "backupsEnabled",
  "description",
  "parentID",
  "raw",
];

const branchListSchema = s.object("A normalized Xata branch list item.", branchBaseProperties, {
  required: branchRequiredKeys,
});

const branchSchema = s.object(
  "A normalized Xata branch.",
  {
    ...branchBaseProperties,
    connectionString: s.nullableString("The database connection string returned by Xata when present."),
    status: statusSchema,
    scaleToZero: scaleToZeroSchema,
    configuration: configurationSchema,
  },
  {
    required: [...branchRequiredKeys, "connectionString", "status", "scaleToZero", "configuration"],
  },
);

const regionSchema = s.object(
  "A normalized Xata region.",
  {
    id: s.string("The unique Xata region ID."),
    publicAccess: s.boolean("Whether the region supports public data-plane access."),
    backupsEnabled: s.boolean("Whether backups are enabled for branches created in this region."),
    provider: s.string("The cloud provider that runs the region."),
    organizationId: s.nullableString("The organization that owns the region when the region is private."),
    raw: rawObjectSchema,
  },
  { required: ["id", "publicAccess", "backupsEnabled", "provider", "organizationId", "raw"] },
);

const organizationInputSchema = s.object(
  "The input payload for selecting a Xata organization.",
  { organizationID: organizationIdSchema },
  { required: ["organizationID"] },
);

const projectInputSchema = s.object(
  "The input payload for selecting a Xata project.",
  {
    organizationID: organizationIdSchema,
    projectID: projectIdSchema,
  },
  { required: ["organizationID", "projectID"] },
);

const branchInputSchema = s.object(
  "The input payload for selecting a Xata branch.",
  {
    organizationID: organizationIdSchema,
    projectID: projectIdSchema,
    branchID: branchIdSchema,
  },
  { required: ["organizationID", "projectID", "branchID"] },
);

export const xataActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Xata organizations available to the authenticated API key.",
    inputSchema: s.object("The input payload for listing Xata organizations.", {}, { required: [] }),
    outputSchema: s.object(
      "The response returned when listing Xata organizations.",
      { organizations: s.array("The Xata organizations returned by the API.", organizationSchema) },
      { required: ["organizations"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get details for a Xata organization by organizationID.",
    inputSchema: organizationInputSchema,
    outputSchema: s.object(
      "The response returned when getting a Xata organization.",
      { organization: organizationSchema },
      { required: ["organization"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Xata projects within an organization.",
    inputSchema: organizationInputSchema,
    outputSchema: s.object(
      "The response returned when listing Xata projects.",
      { projects: s.array("The Xata projects returned by the API.", projectSchema) },
      { required: ["projects"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get details for a Xata project by organizationID and projectID.",
    inputSchema: projectInputSchema,
    outputSchema: s.object(
      "The response returned when getting a Xata project.",
      { project: projectSchema },
      { required: ["project"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_branches",
    description: "List Xata branches within a project.",
    inputSchema: projectInputSchema,
    outputSchema: s.object(
      "The response returned when listing Xata branches.",
      { branches: s.array("The Xata branches returned by the API.", branchListSchema) },
      { required: ["branches"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_branch",
    description: "Get details for a Xata branch by organizationID, projectID, and branchID.",
    inputSchema: branchInputSchema,
    outputSchema: s.object(
      "The response returned when getting a Xata branch.",
      { branch: branchSchema },
      { required: ["branch"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_available_regions",
    description: "List Xata regions where new branches can be deployed for an organization.",
    inputSchema: organizationInputSchema,
    outputSchema: s.object(
      "The response returned when listing Xata available regions.",
      { regions: s.array("The Xata regions returned by the API.", regionSchema) },
      { required: ["regions"] },
    ),
  }),
];
