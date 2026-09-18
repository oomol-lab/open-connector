import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cratedb_cloud";

const idSchema = s.nonEmptyString("The CrateDB Cloud resource ID.");
const organizationIdSchema = s.nonEmptyString("The CrateDB Cloud organization ID.");
const projectIdSchema = s.nonEmptyString("The CrateDB Cloud project ID.");
const productKindSchema = s.nonEmptyString("Optional CrateDB Cloud product kind used to filter available products.");

const rawSchema = s.looseObject("The raw CrateDB Cloud object returned by the API.");

const userSchema = s.requiredObject("A normalized CrateDB Cloud user.", {
  uid: s.nullable(s.string("The CrateDB Cloud user UID when returned.")),
  email: s.nullable(s.string("The user email address.")),
  username: s.nullable(s.string("The user username.")),
  name: s.nullable(s.string("The user display name.")),
  organizationId: s.nullable(s.string("The user's current organization ID when returned.")),
  status: s.nullable(s.string("The user status.")),
  isSuperuser: s.nullable(s.boolean("Whether the user is marked as a CrateDB Cloud superuser.")),
  idp: s.nullable(s.string("The identity provider value when returned.")),
  raw: rawSchema,
});

const organizationSchema = s.requiredObject("A normalized CrateDB Cloud organization.", {
  id: s.string("The organization ID."),
  name: s.nullable(s.string("The organization name.")),
  planType: s.nullable(s.string("The organization plan type.")),
  raw: rawSchema,
});

const projectSchema = s.requiredObject("A normalized CrateDB Cloud project.", {
  id: s.string("The project ID."),
  name: s.nullable(s.string("The project name.")),
  region: s.nullable(s.string("The project region.")),
  organizationId: s.nullable(s.string("The organization ID that owns the project.")),
  backupLocation: s.unknown("The project backup location object when returned."),
  raw: rawSchema,
});

const clusterSchema = s.requiredObject("A normalized CrateDB Cloud cluster.", {
  id: s.string("The cluster ID."),
  name: s.nullable(s.string("The cluster name.")),
  numNodes: s.nullable(s.integer("The number of cluster nodes.")),
  crateVersion: s.nullable(s.string("The CrateDB version running on the cluster.")),
  projectId: s.nullable(s.string("The project ID that owns the cluster.")),
  username: s.nullable(s.string("The default database username when returned.")),
  suspended: s.nullable(s.boolean("Whether the cluster is suspended.")),
  fqdn: s.nullable(s.string("The cluster fully qualified domain name.")),
  url: s.nullable(s.string("The cluster URL when returned.")),
  channel: s.nullable(s.string("The cluster release channel.")),
  raw: rawSchema,
});

const regionSchema = s.requiredObject("A normalized CrateDB Cloud region.", {
  name: s.string("The region name."),
  description: s.nullable(s.string("The region description.")),
  organizationId: s.nullable(s.string("The organization ID for organization-specific regions.")),
  isEdgeRegion: s.nullable(s.boolean("Whether this region is an edge region.")),
  status: s.nullable(s.string("The region status when returned.")),
  raw: rawSchema,
});

const productSchema = s.requiredObject("A normalized CrateDB Cloud product.", {
  kind: s.nullable(s.string("The product kind.")),
  name: s.string("The product name."),
  tier: s.nullable(s.string("The product tier.")),
  description: s.nullable(s.string("The product description.")),
  scaleSummary: s.nullable(s.string("The product scale summary.")),
  vcpuCores: s.nullable(s.number("The CPU core count from the product specs.")),
  ramBytes: s.nullable(s.number("The RAM size in bytes from the product specs.")),
  minStorageBytes: s.nullable(s.number("The minimum storage size in bytes.")),
  maxStorageBytes: s.nullable(s.number("The maximum storage size in bytes.")),
  pricePerDtuMinute: s.nullable(s.number("The product price per DTU minute when returned.")),
  raw: rawSchema,
});

const getCurrentUserAction = defineProviderAction(service, {
  name: "get_current_user",
  operationType: "read",
  description: "Return the CrateDB Cloud user associated with the connected API key.",
  inputSchema: s.object("Input parameters for reading the current CrateDB Cloud user.", {}),
  outputSchema: s.requiredObject("The current CrateDB Cloud user response.", {
    user: userSchema,
  }),
});

const listOrganizationsAction = defineProviderAction(service, {
  name: "list_organizations",
  operationType: "read",
  description: "List CrateDB Cloud organizations visible to the connected API key.",
  inputSchema: s.object("Input parameters for listing CrateDB Cloud organizations.", {}),
  outputSchema: s.requiredObject("The CrateDB Cloud organization list response.", {
    organizations: s.array("The organizations returned by CrateDB Cloud.", organizationSchema),
  }),
});

const getOrganizationAction = defineProviderAction(service, {
  name: "get_organization",
  operationType: "read",
  description: "Return one CrateDB Cloud organization by ID.",
  inputSchema: s.requiredObject("Input parameters for reading one CrateDB Cloud organization.", {
    id: organizationIdSchema,
  }),
  outputSchema: s.requiredObject("The CrateDB Cloud organization response.", {
    organization: organizationSchema,
  }),
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  operationType: "read",
  description: "List CrateDB Cloud projects, optionally scoped to one organization.",
  inputSchema: s.object(
    "Input parameters for listing CrateDB Cloud projects.",
    {
      organizationId: organizationIdSchema,
    },
    { optional: ["organizationId"] },
  ),
  outputSchema: s.requiredObject("The CrateDB Cloud project list response.", {
    projects: s.array("The projects returned by CrateDB Cloud.", projectSchema),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  operationType: "read",
  description: "Return one CrateDB Cloud project by ID.",
  inputSchema: s.requiredObject("Input parameters for reading one CrateDB Cloud project.", {
    id: projectIdSchema,
  }),
  outputSchema: s.requiredObject("The CrateDB Cloud project response.", {
    project: projectSchema,
  }),
});

const listClustersAction = defineProviderAction(service, {
  name: "list_clusters",
  operationType: "read",
  description: "List CrateDB Cloud clusters, optionally scoped to one organization or filtered by project.",
  inputSchema: s.object(
    "Input parameters for listing CrateDB Cloud clusters.",
    {
      organizationId: organizationIdSchema,
      projectId: projectIdSchema,
    },
    { optional: ["organizationId", "projectId"] },
  ),
  outputSchema: s.requiredObject("The CrateDB Cloud cluster list response.", {
    clusters: s.array("The clusters returned by CrateDB Cloud.", clusterSchema),
  }),
});

const getClusterAction = defineProviderAction(service, {
  name: "get_cluster",
  operationType: "read",
  description: "Return one CrateDB Cloud cluster by ID.",
  inputSchema: s.requiredObject("Input parameters for reading one CrateDB Cloud cluster.", {
    id: idSchema,
  }),
  outputSchema: s.requiredObject("The CrateDB Cloud cluster response.", {
    cluster: clusterSchema,
  }),
});

const listRegionsAction = defineProviderAction(service, {
  name: "list_regions",
  operationType: "read",
  description: "List CrateDB Cloud regions, optionally scoped to one organization.",
  inputSchema: s.object(
    "Input parameters for listing CrateDB Cloud regions.",
    {
      organizationId: organizationIdSchema,
    },
    { optional: ["organizationId"] },
  ),
  outputSchema: s.requiredObject("The CrateDB Cloud region list response.", {
    regions: s.array("The regions returned by CrateDB Cloud.", regionSchema),
  }),
});

const listProductsAction = defineProviderAction(service, {
  name: "list_products",
  operationType: "read",
  description: "List available CrateDB Cloud products, optionally filtered by product kind.",
  inputSchema: s.object(
    "Input parameters for listing CrateDB Cloud products.",
    {
      kind: productKindSchema,
    },
    { optional: ["kind"] },
  ),
  outputSchema: s.requiredObject("The CrateDB Cloud product list response.", {
    products: s.array("The products returned by CrateDB Cloud.", productSchema),
  }),
});

export const cratedbCloudActions: ActionDefinition[] = [
  getCurrentUserAction,
  listOrganizationsAction,
  getOrganizationAction,
  listProjectsAction,
  getProjectAction,
  listClustersAction,
  getClusterAction,
  listRegionsAction,
  listProductsAction,
];
