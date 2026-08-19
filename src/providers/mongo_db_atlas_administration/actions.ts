import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mongo_db_atlas_administration";

const groupIdSchema = s.nonEmptyString("The MongoDB Atlas project ID.");
const clusterNameSchema = s.nonEmptyString("The MongoDB Atlas cluster name.");
const pageNumSchema = s.positiveInteger("The page number to request from MongoDB Atlas.");
const itemsPerPageSchema = s.integer("The number of items to request per page.", { minimum: 1, maximum: 500 });
const includeCountSchema = s.boolean("Whether MongoDB Atlas should include the total item count when supported.");

const paginationInputSchema = {
  pageNum: pageNumSchema,
  itemsPerPage: itemsPerPageSchema,
  includeCount: includeCountSchema,
};

const atlasListMetaSchema = s.object("Pagination metadata returned by MongoDB Atlas.", {
  links: s.array("The HATEOAS links returned by MongoDB Atlas.", s.looseObject("One MongoDB Atlas link object.")),
  totalCount: s.nullableInteger("The total number of matching items when Atlas returned it."),
});

const projectSchema = s.object("A normalized MongoDB Atlas project.", {
  id: s.nonEmptyString("The MongoDB Atlas project ID."),
  name: s.nullableString("The MongoDB Atlas project name."),
  orgId: s.nullableString("The organization ID that owns the project."),
  createdAt: s.nullableString("The project creation timestamp when Atlas returned it."),
  regionUsageRestrictions: s.nullableString("The Atlas region usage restriction value when returned."),
  raw: s.looseObject("The raw MongoDB Atlas project object."),
});

const clusterSchema = s.object("A normalized MongoDB Atlas cluster.", {
  id: s.nullableString("The MongoDB Atlas cluster ID when returned."),
  name: s.nonEmptyString("The MongoDB Atlas cluster name."),
  groupId: s.nullableString("The MongoDB Atlas project ID associated with the cluster."),
  clusterType: s.nullableString("The Atlas cluster type when returned."),
  mongoDBVersion: s.nullableString("The MongoDB version reported for the cluster."),
  stateName: s.nullableString("The Atlas cluster state name."),
  paused: s.nullableBoolean("Whether the cluster is paused when Atlas returned the field."),
  providerName: s.nullableString("The backing cloud provider name when returned."),
  backingProviderName: s.nullableString("The backing provider name for tenant clusters when returned."),
  instanceSizeName: s.nullableString("The Atlas instance size name when returned."),
  regionName: s.nullableString("The primary region name when returned."),
  raw: s.looseObject("The raw MongoDB Atlas cluster object."),
});

export const mongoDbAtlasAdministrationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List MongoDB Atlas projects visible to the connected API key.",
    inputSchema: s.actionInput(paginationInputSchema, [], "Input parameters for listing MongoDB Atlas projects."),
    outputSchema: s.actionOutput(
      {
        projects: s.array("The MongoDB Atlas projects returned for this page.", projectSchema),
        meta: atlasListMetaSchema,
      },
      "The MongoDB Atlas project list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Return one MongoDB Atlas project by project ID.",
    inputSchema: s.actionInput(
      {
        groupId: groupIdSchema,
      },
      ["groupId"],
      "Input parameters for reading one MongoDB Atlas project.",
    ),
    outputSchema: s.actionOutput(
      {
        project: projectSchema,
      },
      "The MongoDB Atlas project response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_clusters",
    description: "List MongoDB Atlas clusters in one project.",
    inputSchema: s.actionInput(
      {
        groupId: groupIdSchema,
        ...paginationInputSchema,
      },
      ["groupId"],
      "Input parameters for listing MongoDB Atlas clusters in one project.",
    ),
    outputSchema: s.actionOutput(
      {
        clusters: s.array("The MongoDB Atlas clusters returned for this page.", clusterSchema),
        meta: atlasListMetaSchema,
      },
      "The MongoDB Atlas cluster list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_cluster",
    description: "Return one MongoDB Atlas cluster by project ID and cluster name.",
    inputSchema: s.actionInput(
      {
        groupId: groupIdSchema,
        name: clusterNameSchema,
      },
      ["groupId", "name"],
      "Input parameters for reading one MongoDB Atlas cluster.",
    ),
    outputSchema: s.actionOutput(
      {
        cluster: clusterSchema,
      },
      "The MongoDB Atlas cluster response.",
    ),
  }),
];
