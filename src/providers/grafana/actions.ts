import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "grafana";

export type GrafanaActionName =
  | "list_folders"
  | "get_folder"
  | "create_folder"
  | "update_folder"
  | "delete_folder"
  | "search_dashboards"
  | "get_dashboard"
  | "create_dashboard"
  | "update_dashboard"
  | "delete_dashboard"
  | "list_data_sources"
  | "get_data_source"
  | "create_data_source"
  | "update_data_source"
  | "delete_data_source"
  | "list_alert_rules"
  | "get_alert_rule"
  | "list_alert_instances"
  | "list_contact_points";

const namespaceSchema = s.string("The Grafana API namespace. Use default for the main organization.", {
  minLength: 1,
});

const rawObjectSchema = s.looseObject("The raw Grafana API object.");

const alertRuleSchema = s.looseObject("A Grafana-managed alert rule.");

const alertInstanceSchema = s.looseObject("A firing or pending Grafana alert instance.");

const contactPointSchema = s.looseObject("A Grafana notification contact point.");

const folderSchema = s.object("A normalized Grafana folder.", {
  uid: s.nullable(s.string("The Grafana folder UID.")),
  title: s.nullable(s.string("The folder title.")),
  namespace: s.nullable(s.string("The namespace that owns the folder.")),
  resourceVersion: s.nullable(s.string("The folder resource version.")),
  parentUid: s.nullable(s.string("The parent folder UID when the folder is nested.")),
  raw: rawObjectSchema,
});

const dashboardSchema = s.object("A normalized Grafana dashboard resource.", {
  uid: s.nullable(s.string("The dashboard UID.")),
  title: s.nullable(s.string("The dashboard title.")),
  namespace: s.nullable(s.string("The namespace that owns the dashboard.")),
  resourceVersion: s.nullable(s.string("The dashboard resource version.")),
  folderUid: s.nullable(s.string("The folder UID that contains the dashboard.")),
  raw: rawObjectSchema,
});

const dashboardSearchItemSchema = s.looseRequiredObject("A Grafana folder or dashboard search result.", {
  id: s.nullable(s.integer("The numeric Grafana search result ID.")),
  uid: s.nullable(s.string("The Grafana dashboard or folder UID.")),
  title: s.nullable(s.string("The search result title.")),
  type: s.nullable(s.string("The Grafana result type, such as dash-db or dash-folder.")),
  url: s.nullable(s.string("The Grafana UI path for the result.")),
  isStarred: s.nullable(s.boolean("Whether the dashboard is starred.")),
});

const dataSourceSchema = s.looseRequiredObject("A Grafana data source record.", {
  id: s.nullable(s.integer("The numeric Grafana data source ID.")),
  uid: s.nullable(s.string("The Grafana data source UID.")),
  name: s.nullable(s.string("The data source name.")),
  type: s.nullable(s.string("The data source plugin type.")),
  access: s.nullable(s.string("The data source access mode.")),
  url: s.nullable(s.string("The data source URL when returned by Grafana.")),
  isDefault: s.nullable(s.boolean("Whether this data source is the default.")),
  readOnly: s.nullable(s.boolean("Whether this data source is read-only.")),
});

const dashboardSpecSchema = s.looseObject(
  "The Grafana dashboard spec JSON. This is forwarded to Grafana as the dashboard body.",
);

const dataSourcePayloadSchema = s.looseObject(
  "The Grafana data source payload. Use official Grafana data source fields such as name, type, access, url, jsonData, and secureJsonData.",
);

export const grafanaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_folders",
    description: "List Grafana folders in a namespace with optional pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Grafana folders.",
      {
        namespace: namespaceSchema,
        limit: s.positiveInteger("Maximum number of folders to request."),
        continueToken: s.string("The Grafana continue token from a previous folder list response.", {
          minLength: 1,
        }),
      },
      { optional: ["namespace", "limit", "continueToken"] },
    ),
    outputSchema: s.object("A page of Grafana folders.", {
      folders: s.array("Folders returned by Grafana.", folderSchema),
      continueToken: s.nullable(s.string("The next Grafana continue token, or null on the last page.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_folder",
    description: "Retrieve one Grafana folder by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving a Grafana folder.",
      {
        uid: s.string("The Grafana folder UID.", { minLength: 1 }),
        namespace: namespaceSchema,
      },
      { optional: ["namespace"] },
    ),
    outputSchema: s.object("A Grafana folder response.", {
      folder: folderSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_folder",
    description: "Create a Grafana folder in a namespace.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Grafana folder.",
      {
        title: s.string("The new folder title.", { minLength: 1 }),
        uid: s.string("Optional explicit Grafana folder UID.", { minLength: 1 }),
        generateName: s.string("Optional UID prefix Grafana can use to generate a folder UID.", { minLength: 1 }),
        parentUid: s.string("Optional parent folder UID for a nested folder.", { minLength: 1 }),
        namespace: namespaceSchema,
      },
      { optional: ["uid", "generateName", "parentUid", "namespace"] },
    ),
    outputSchema: s.object("The created Grafana folder.", {
      folder: folderSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_folder",
    description: "Update the title or parent folder for a Grafana folder.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Grafana folder.",
      {
        uid: s.string("The Grafana folder UID.", { minLength: 1 }),
        title: s.string("The updated folder title.", { minLength: 1 }),
        parentUid: s.string("Optional parent folder UID for a nested folder.", { minLength: 1 }),
        namespace: namespaceSchema,
        resourceVersion: s.string("The current Grafana resource version when required by the instance.", {
          minLength: 1,
        }),
      },
      { optional: ["parentUid", "namespace", "resourceVersion"] },
    ),
    outputSchema: s.object("The updated Grafana folder.", {
      folder: folderSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_folder",
    description: "Delete a Grafana folder by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for deleting a Grafana folder.",
      {
        uid: s.string("The Grafana folder UID.", { minLength: 1 }),
        namespace: namespaceSchema,
      },
      { optional: ["namespace"] },
    ),
    outputSchema: s.object("Grafana folder deletion result.", {
      deleted: s.boolean("Whether the connector completed the delete request."),
      raw: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_dashboards",
    description: "Search Grafana folders and dashboards by query, tags, type, folder, and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for searching Grafana folders and dashboards.",
      {
        query: s.string("Free-text search query.", { minLength: 1 }),
        tags: s.array("Dashboard tags to search for.", s.string("A dashboard tag.", { minLength: 1 })),
        type: s.stringEnum("Restrict results to dashboards or folders.", ["dash-db", "dash-folder"]),
        dashboardUids: s.array("Dashboard UIDs to search for.", s.string("A dashboard UID.", { minLength: 1 })),
        folderUids: s.array("Folder UIDs to search in.", s.string("A folder UID.", { minLength: 1 })),
        starred: s.boolean("Whether to return only starred dashboards."),
        limit: s.positiveInteger("Maximum number of search results to return.", { maximum: 5000 }),
        page: s.positiveInteger("Search results page number. Numbering starts at 1."),
      },
      {
        optional: ["query", "tags", "type", "dashboardUids", "folderUids", "starred", "limit", "page"],
      },
    ),
    outputSchema: s.object("Grafana folder and dashboard search results.", {
      results: s.array("Search results returned by Grafana.", dashboardSearchItemSchema),
      raw: s.array("Raw Grafana search result objects.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dashboard",
    description: "Retrieve one Grafana dashboard resource by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving a Grafana dashboard.",
      {
        uid: s.string("The Grafana dashboard UID.", { minLength: 1 }),
        namespace: namespaceSchema,
      },
      { optional: ["namespace"] },
    ),
    outputSchema: s.object("A Grafana dashboard response.", {
      dashboard: dashboardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_dashboard",
    description: "Create a Grafana dashboard resource in a namespace.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating a Grafana dashboard.",
      {
        uid: s.string("Optional explicit Grafana dashboard UID.", { minLength: 1 }),
        generateName: s.string("Optional UID prefix Grafana can use to generate a dashboard UID.", { minLength: 1 }),
        folderUid: s.string("Optional folder UID for the new dashboard.", { minLength: 1 }),
        spec: dashboardSpecSchema,
        namespace: namespaceSchema,
      },
      { optional: ["uid", "generateName", "folderUid", "namespace"] },
    ),
    outputSchema: s.object("The created Grafana dashboard.", {
      dashboard: dashboardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_dashboard",
    description: "Replace a Grafana dashboard resource by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Grafana dashboard.",
      {
        uid: s.string("The Grafana dashboard UID.", { minLength: 1 }),
        folderUid: s.string("Optional folder UID for the dashboard.", { minLength: 1 }),
        spec: dashboardSpecSchema,
        namespace: namespaceSchema,
        resourceVersion: s.string("The current Grafana resource version when required by the instance.", {
          minLength: 1,
        }),
      },
      { optional: ["folderUid", "namespace", "resourceVersion"] },
    ),
    outputSchema: s.object("The updated Grafana dashboard.", {
      dashboard: dashboardSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_dashboard",
    description: "Delete a Grafana dashboard resource by UID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for deleting a Grafana dashboard.",
      {
        uid: s.string("The Grafana dashboard UID.", { minLength: 1 }),
        namespace: namespaceSchema,
      },
      { optional: ["namespace"] },
    ),
    outputSchema: s.object("Grafana dashboard deletion result.", {
      deleted: s.boolean("Whether the connector completed the delete request."),
      raw: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_data_sources",
    description: "List Grafana data sources available to the service account token.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Grafana data sources.", {}),
    outputSchema: s.object("Grafana data sources.", {
      dataSources: s.array("Data sources returned by Grafana.", dataSourceSchema),
      raw: s.array("Raw Grafana data source objects.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_data_source",
    description: "Retrieve one Grafana data source by UID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Grafana data source.", {
      uid: s.string("The Grafana data source UID.", { minLength: 1 }),
    }),
    outputSchema: s.object("A Grafana data source response.", {
      dataSource: dataSourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_data_source",
    description: "Create a Grafana data source using a JSON payload accepted by Grafana.",
    requiredScopes: [],
    inputSchema: s.object("Input for creating a Grafana data source.", {
      dataSource: dataSourcePayloadSchema,
    }),
    outputSchema: s.object("The created Grafana data source result.", {
      dataSource: dataSourceSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_data_source",
    description: "Update a Grafana data source by UID using fields accepted by Grafana.",
    requiredScopes: [],
    inputSchema: s.object("Input for updating a Grafana data source.", {
      uid: s.string("The Grafana data source UID.", { minLength: 1 }),
      dataSource: dataSourcePayloadSchema,
    }),
    outputSchema: s.object("The updated Grafana data source result.", {
      dataSource: dataSourceSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_data_source",
    description: "Delete a Grafana data source by UID.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Grafana data source.", {
      uid: s.string("The Grafana data source UID.", { minLength: 1 }),
    }),
    outputSchema: s.object("Grafana data source deletion result.", {
      deleted: s.boolean("Whether the connector completed the delete request."),
      raw: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_alert_rules",
    description: "List all Grafana-managed alert rules via the provisioning API.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Grafana alert rules.", {}),
    outputSchema: s.object("Grafana-managed alert rules.", {
      alertRules: s.array("Alert rules returned by Grafana.", alertRuleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_alert_rule",
    description: "Retrieve one Grafana-managed alert rule by UID via the provisioning API.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving a Grafana alert rule.",
      { uid: s.string("The Grafana alert rule UID.", { minLength: 1 }) },
      { required: ["uid"] },
    ),
    outputSchema: s.object("A Grafana-managed alert rule.", {
      alertRule: alertRuleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_alert_instances",
    description: "List currently firing or pending Grafana alert instances from the built-in Alertmanager.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Grafana alert instances.",
      {
        active: s.boolean("Include active (firing) alert instances."),
        silenced: s.boolean("Include silenced alert instances."),
        inhibited: s.boolean("Include inhibited alert instances."),
      },
      { optional: ["active", "silenced", "inhibited"] },
    ),
    outputSchema: s.object("Grafana alert instances.", {
      alertInstances: s.array("Alert instances returned by Grafana.", alertInstanceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contact_points",
    description: "List Grafana notification contact points via the provisioning API.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Grafana contact points.", {}),
    outputSchema: s.object("Grafana notification contact points.", {
      contactPoints: s.array("Contact points returned by Grafana.", contactPointSchema),
    }),
  }),
];
