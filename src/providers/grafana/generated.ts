import type { JsonSchema } from "../../core/types.ts";

export interface GrafanaGeneratedActionSchema {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export const grafanaGeneratedActionSchemas: GrafanaGeneratedActionSchema[] = [
  {
    name: "list_folders",
    description: "List Grafana folders in a namespace with optional pagination.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
        limit: {
          type: "integer",
          exclusiveMinimum: 0,
          description: "Maximum number of folders to request.",
        },
        continueToken: {
          type: "string",
          minLength: 1,
          description: "The Grafana continue token from a previous folder list response.",
        },
      },
      additionalProperties: false,
      description: "Input for listing Grafana folders.",
    },
    outputSchema: {
      type: "object",
      properties: {
        folders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              uid: {
                type: ["string", "null"],
                description: "The Grafana folder UID.",
              },
              title: {
                type: ["string", "null"],
                description: "The folder title.",
              },
              namespace: {
                type: ["string", "null"],
                description: "The namespace that owns the folder.",
              },
              resourceVersion: {
                type: ["string", "null"],
                description: "The folder resource version.",
              },
              parentUid: {
                type: ["string", "null"],
                description: "The parent folder UID when the folder is nested.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Grafana API object.",
              },
            },
            required: ["uid", "title", "namespace", "resourceVersion", "parentUid", "raw"],
            additionalProperties: false,
            description: "A normalized Grafana folder.",
          },
          description: "Folders returned by Grafana.",
        },
        continueToken: {
          type: ["string", "null"],
          description: "The next Grafana continue token, or null on the last page.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana API object.",
        },
      },
      required: ["folders", "continueToken", "raw"],
      additionalProperties: false,
      description: "A page of Grafana folders.",
    },
  },
  {
    name: "get_folder",
    description: "Retrieve one Grafana folder by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana folder UID.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
      },
      required: ["uid"],
      additionalProperties: false,
      description: "Input for retrieving a Grafana folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        folder: {
          type: "object",
          properties: {
            uid: {
              type: ["string", "null"],
              description: "The Grafana folder UID.",
            },
            title: {
              type: ["string", "null"],
              description: "The folder title.",
            },
            namespace: {
              type: ["string", "null"],
              description: "The namespace that owns the folder.",
            },
            resourceVersion: {
              type: ["string", "null"],
              description: "The folder resource version.",
            },
            parentUid: {
              type: ["string", "null"],
              description: "The parent folder UID when the folder is nested.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Grafana API object.",
            },
          },
          required: ["uid", "title", "namespace", "resourceVersion", "parentUid", "raw"],
          additionalProperties: false,
          description: "A normalized Grafana folder.",
        },
      },
      required: ["folder"],
      additionalProperties: false,
      description: "A Grafana folder response.",
    },
  },
  {
    name: "create_folder",
    description: "Create a Grafana folder in a namespace.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 1,
          description: "The new folder title.",
        },
        uid: {
          type: "string",
          minLength: 1,
          description: "Optional explicit Grafana folder UID.",
        },
        generateName: {
          type: "string",
          minLength: 1,
          description: "Optional UID prefix Grafana can use to generate a folder UID.",
        },
        parentUid: {
          type: "string",
          minLength: 1,
          description: "Optional parent folder UID for a nested folder.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
      },
      required: ["title"],
      additionalProperties: false,
      description: "Input for creating a Grafana folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        folder: {
          type: "object",
          properties: {
            uid: {
              type: ["string", "null"],
              description: "The Grafana folder UID.",
            },
            title: {
              type: ["string", "null"],
              description: "The folder title.",
            },
            namespace: {
              type: ["string", "null"],
              description: "The namespace that owns the folder.",
            },
            resourceVersion: {
              type: ["string", "null"],
              description: "The folder resource version.",
            },
            parentUid: {
              type: ["string", "null"],
              description: "The parent folder UID when the folder is nested.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Grafana API object.",
            },
          },
          required: ["uid", "title", "namespace", "resourceVersion", "parentUid", "raw"],
          additionalProperties: false,
          description: "A normalized Grafana folder.",
        },
      },
      required: ["folder"],
      additionalProperties: false,
      description: "The created Grafana folder.",
    },
  },
  {
    name: "update_folder",
    description: "Update the title or parent folder for a Grafana folder.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana folder UID.",
        },
        title: {
          type: "string",
          minLength: 1,
          description: "The updated folder title.",
        },
        parentUid: {
          type: "string",
          minLength: 1,
          description: "Optional parent folder UID for a nested folder.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
        resourceVersion: {
          type: "string",
          minLength: 1,
          description: "The current Grafana resource version when required by the instance.",
        },
      },
      required: ["uid", "title"],
      additionalProperties: false,
      description: "Input for updating a Grafana folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        folder: {
          type: "object",
          properties: {
            uid: {
              type: ["string", "null"],
              description: "The Grafana folder UID.",
            },
            title: {
              type: ["string", "null"],
              description: "The folder title.",
            },
            namespace: {
              type: ["string", "null"],
              description: "The namespace that owns the folder.",
            },
            resourceVersion: {
              type: ["string", "null"],
              description: "The folder resource version.",
            },
            parentUid: {
              type: ["string", "null"],
              description: "The parent folder UID when the folder is nested.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Grafana API object.",
            },
          },
          required: ["uid", "title", "namespace", "resourceVersion", "parentUid", "raw"],
          additionalProperties: false,
          description: "A normalized Grafana folder.",
        },
      },
      required: ["folder"],
      additionalProperties: false,
      description: "The updated Grafana folder.",
    },
  },
  {
    name: "delete_folder",
    description: "Delete a Grafana folder by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana folder UID.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
      },
      required: ["uid"],
      additionalProperties: false,
      description: "Input for deleting a Grafana folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        deleted: {
          type: "boolean",
          description: "Whether the connector completed the delete request.",
        },
        raw: {
          type: ["object", "null"],
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana API object.",
        },
      },
      required: ["deleted", "raw"],
      additionalProperties: false,
      description: "Grafana folder deletion result.",
    },
  },
  {
    name: "search_dashboards",
    description: "Search Grafana folders and dashboards by query, tags, type, folder, and pagination.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Free-text search query.",
        },
        tags: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            description: "A dashboard tag.",
          },
          description: "Dashboard tags to search for.",
        },
        type: {
          type: "string",
          enum: ["dash-db", "dash-folder"],
          description: "Restrict results to dashboards or folders.",
        },
        dashboardUids: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            description: "A dashboard UID.",
          },
          description: "Dashboard UIDs to search for.",
        },
        folderUids: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            description: "A folder UID.",
          },
          description: "Folder UIDs to search in.",
        },
        starred: {
          type: "boolean",
          description: "Whether to return only starred dashboards.",
        },
        limit: {
          type: "integer",
          maximum: 5000,
          exclusiveMinimum: 0,
          description: "Maximum number of search results to return.",
        },
        page: {
          type: "integer",
          exclusiveMinimum: 0,
          description: "Search results page number. Numbering starts at 1.",
        },
      },
      additionalProperties: false,
      description: "Input for searching Grafana folders and dashboards.",
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "The numeric Grafana search result ID.",
              },
              uid: {
                type: ["string", "null"],
                description: "The Grafana dashboard or folder UID.",
              },
              title: {
                type: ["string", "null"],
                description: "The search result title.",
              },
              type: {
                type: ["string", "null"],
                description: "The Grafana result type, such as dash-db or dash-folder.",
              },
              url: {
                type: ["string", "null"],
                description: "The Grafana UI path for the result.",
              },
              isStarred: {
                type: ["boolean", "null"],
                description: "Whether the dashboard is starred.",
              },
            },
            required: ["id", "uid", "title", "type", "url", "isStarred"],
            additionalProperties: true,
            description: "A Grafana folder or dashboard search result.",
          },
          description: "Search results returned by Grafana.",
        },
        raw: {
          type: "array",
          items: {
            type: "object",
            properties: {},
            additionalProperties: true,
            description: "The raw Grafana API object.",
          },
          description: "Raw Grafana search result objects.",
        },
      },
      required: ["results", "raw"],
      additionalProperties: false,
      description: "Grafana folder and dashboard search results.",
    },
  },
  {
    name: "get_dashboard",
    description: "Retrieve one Grafana dashboard resource by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana dashboard UID.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
      },
      required: ["uid"],
      additionalProperties: false,
      description: "Input for retrieving a Grafana dashboard.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dashboard: {
          type: "object",
          properties: {
            uid: {
              type: ["string", "null"],
              description: "The dashboard UID.",
            },
            title: {
              type: ["string", "null"],
              description: "The dashboard title.",
            },
            namespace: {
              type: ["string", "null"],
              description: "The namespace that owns the dashboard.",
            },
            resourceVersion: {
              type: ["string", "null"],
              description: "The dashboard resource version.",
            },
            folderUid: {
              type: ["string", "null"],
              description: "The folder UID that contains the dashboard.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Grafana API object.",
            },
          },
          required: ["uid", "title", "namespace", "resourceVersion", "folderUid", "raw"],
          additionalProperties: false,
          description: "A normalized Grafana dashboard resource.",
        },
      },
      required: ["dashboard"],
      additionalProperties: false,
      description: "A Grafana dashboard response.",
    },
  },
  {
    name: "create_dashboard",
    description: "Create a Grafana dashboard resource in a namespace.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "Optional explicit Grafana dashboard UID.",
        },
        generateName: {
          type: "string",
          minLength: 1,
          description: "Optional UID prefix Grafana can use to generate a dashboard UID.",
        },
        folderUid: {
          type: "string",
          minLength: 1,
          description: "Optional folder UID for the new dashboard.",
        },
        spec: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The Grafana dashboard spec JSON. This is forwarded to Grafana as the dashboard body.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
      },
      required: ["spec"],
      additionalProperties: false,
      description: "Input for creating a Grafana dashboard.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dashboard: {
          type: "object",
          properties: {
            uid: {
              type: ["string", "null"],
              description: "The dashboard UID.",
            },
            title: {
              type: ["string", "null"],
              description: "The dashboard title.",
            },
            namespace: {
              type: ["string", "null"],
              description: "The namespace that owns the dashboard.",
            },
            resourceVersion: {
              type: ["string", "null"],
              description: "The dashboard resource version.",
            },
            folderUid: {
              type: ["string", "null"],
              description: "The folder UID that contains the dashboard.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Grafana API object.",
            },
          },
          required: ["uid", "title", "namespace", "resourceVersion", "folderUid", "raw"],
          additionalProperties: false,
          description: "A normalized Grafana dashboard resource.",
        },
      },
      required: ["dashboard"],
      additionalProperties: false,
      description: "The created Grafana dashboard.",
    },
  },
  {
    name: "update_dashboard",
    description: "Replace a Grafana dashboard resource by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana dashboard UID.",
        },
        folderUid: {
          type: "string",
          minLength: 1,
          description: "Optional folder UID for the dashboard.",
        },
        spec: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The Grafana dashboard spec JSON. This is forwarded to Grafana as the dashboard body.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
        resourceVersion: {
          type: "string",
          minLength: 1,
          description: "The current Grafana resource version when required by the instance.",
        },
      },
      required: ["uid", "spec"],
      additionalProperties: false,
      description: "Input for updating a Grafana dashboard.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dashboard: {
          type: "object",
          properties: {
            uid: {
              type: ["string", "null"],
              description: "The dashboard UID.",
            },
            title: {
              type: ["string", "null"],
              description: "The dashboard title.",
            },
            namespace: {
              type: ["string", "null"],
              description: "The namespace that owns the dashboard.",
            },
            resourceVersion: {
              type: ["string", "null"],
              description: "The dashboard resource version.",
            },
            folderUid: {
              type: ["string", "null"],
              description: "The folder UID that contains the dashboard.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Grafana API object.",
            },
          },
          required: ["uid", "title", "namespace", "resourceVersion", "folderUid", "raw"],
          additionalProperties: false,
          description: "A normalized Grafana dashboard resource.",
        },
      },
      required: ["dashboard"],
      additionalProperties: false,
      description: "The updated Grafana dashboard.",
    },
  },
  {
    name: "delete_dashboard",
    description: "Delete a Grafana dashboard resource by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana dashboard UID.",
        },
        namespace: {
          type: "string",
          minLength: 1,
          description: "The Grafana API namespace. Use default for the main organization.",
        },
      },
      required: ["uid"],
      additionalProperties: false,
      description: "Input for deleting a Grafana dashboard.",
    },
    outputSchema: {
      type: "object",
      properties: {
        deleted: {
          type: "boolean",
          description: "Whether the connector completed the delete request.",
        },
        raw: {
          type: ["object", "null"],
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana API object.",
        },
      },
      required: ["deleted", "raw"],
      additionalProperties: false,
      description: "Grafana dashboard deletion result.",
    },
  },
  {
    name: "list_data_sources",
    description: "List Grafana data sources available to the service account token.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      description: "No input is required to list Grafana data sources.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dataSources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "The numeric Grafana data source ID.",
              },
              uid: {
                type: ["string", "null"],
                description: "The Grafana data source UID.",
              },
              name: {
                type: ["string", "null"],
                description: "The data source name.",
              },
              type: {
                type: ["string", "null"],
                description: "The data source plugin type.",
              },
              access: {
                type: ["string", "null"],
                description: "The data source access mode.",
              },
              url: {
                type: ["string", "null"],
                description: "The data source URL when returned by Grafana.",
              },
              isDefault: {
                type: ["boolean", "null"],
                description: "Whether this data source is the default.",
              },
              readOnly: {
                type: ["boolean", "null"],
                description: "Whether this data source is read-only.",
              },
            },
            required: ["id", "uid", "name", "type", "access", "url", "isDefault", "readOnly"],
            additionalProperties: true,
            description: "A Grafana data source record.",
          },
          description: "Data sources returned by Grafana.",
        },
        raw: {
          type: "array",
          items: {
            type: "object",
            properties: {},
            additionalProperties: true,
            description: "The raw Grafana API object.",
          },
          description: "Raw Grafana data source objects.",
        },
      },
      required: ["dataSources", "raw"],
      additionalProperties: false,
      description: "Grafana data sources.",
    },
  },
  {
    name: "get_data_source",
    description: "Retrieve one Grafana data source by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana data source UID.",
        },
      },
      required: ["uid"],
      additionalProperties: false,
      description: "Input for retrieving a Grafana data source.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dataSource: {
          type: "object",
          properties: {
            id: {
              type: ["integer", "null"],
              description: "The numeric Grafana data source ID.",
            },
            uid: {
              type: ["string", "null"],
              description: "The Grafana data source UID.",
            },
            name: {
              type: ["string", "null"],
              description: "The data source name.",
            },
            type: {
              type: ["string", "null"],
              description: "The data source plugin type.",
            },
            access: {
              type: ["string", "null"],
              description: "The data source access mode.",
            },
            url: {
              type: ["string", "null"],
              description: "The data source URL when returned by Grafana.",
            },
            isDefault: {
              type: ["boolean", "null"],
              description: "Whether this data source is the default.",
            },
            readOnly: {
              type: ["boolean", "null"],
              description: "Whether this data source is read-only.",
            },
          },
          required: ["id", "uid", "name", "type", "access", "url", "isDefault", "readOnly"],
          additionalProperties: true,
          description: "A Grafana data source record.",
        },
      },
      required: ["dataSource"],
      additionalProperties: false,
      description: "A Grafana data source response.",
    },
  },
  {
    name: "create_data_source",
    description: "Create a Grafana data source using a JSON payload accepted by Grafana.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        dataSource: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description:
            "The Grafana data source payload. Use official Grafana data source fields such as name, type, access, url, jsonData, and secureJsonData.",
        },
      },
      required: ["dataSource"],
      additionalProperties: false,
      description: "Input for creating a Grafana data source.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dataSource: {
          type: "object",
          properties: {
            id: {
              type: ["integer", "null"],
              description: "The numeric Grafana data source ID.",
            },
            uid: {
              type: ["string", "null"],
              description: "The Grafana data source UID.",
            },
            name: {
              type: ["string", "null"],
              description: "The data source name.",
            },
            type: {
              type: ["string", "null"],
              description: "The data source plugin type.",
            },
            access: {
              type: ["string", "null"],
              description: "The data source access mode.",
            },
            url: {
              type: ["string", "null"],
              description: "The data source URL when returned by Grafana.",
            },
            isDefault: {
              type: ["boolean", "null"],
              description: "Whether this data source is the default.",
            },
            readOnly: {
              type: ["boolean", "null"],
              description: "Whether this data source is read-only.",
            },
          },
          required: ["id", "uid", "name", "type", "access", "url", "isDefault", "readOnly"],
          additionalProperties: true,
          description: "A Grafana data source record.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana API object.",
        },
      },
      required: ["dataSource", "raw"],
      additionalProperties: false,
      description: "The created Grafana data source result.",
    },
  },
  {
    name: "update_data_source",
    description: "Update a Grafana data source by UID using fields accepted by Grafana.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana data source UID.",
        },
        dataSource: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description:
            "The Grafana data source payload. Use official Grafana data source fields such as name, type, access, url, jsonData, and secureJsonData.",
        },
      },
      required: ["uid", "dataSource"],
      additionalProperties: false,
      description: "Input for updating a Grafana data source.",
    },
    outputSchema: {
      type: "object",
      properties: {
        dataSource: {
          type: "object",
          properties: {
            id: {
              type: ["integer", "null"],
              description: "The numeric Grafana data source ID.",
            },
            uid: {
              type: ["string", "null"],
              description: "The Grafana data source UID.",
            },
            name: {
              type: ["string", "null"],
              description: "The data source name.",
            },
            type: {
              type: ["string", "null"],
              description: "The data source plugin type.",
            },
            access: {
              type: ["string", "null"],
              description: "The data source access mode.",
            },
            url: {
              type: ["string", "null"],
              description: "The data source URL when returned by Grafana.",
            },
            isDefault: {
              type: ["boolean", "null"],
              description: "Whether this data source is the default.",
            },
            readOnly: {
              type: ["boolean", "null"],
              description: "Whether this data source is read-only.",
            },
          },
          required: ["id", "uid", "name", "type", "access", "url", "isDefault", "readOnly"],
          additionalProperties: true,
          description: "A Grafana data source record.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana API object.",
        },
      },
      required: ["dataSource", "raw"],
      additionalProperties: false,
      description: "The updated Grafana data source result.",
    },
  },
  {
    name: "delete_data_source",
    description: "Delete a Grafana data source by UID.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        uid: {
          type: "string",
          minLength: 1,
          description: "The Grafana data source UID.",
        },
      },
      required: ["uid"],
      additionalProperties: false,
      description: "Input for deleting a Grafana data source.",
    },
    outputSchema: {
      type: "object",
      properties: {
        deleted: {
          type: "boolean",
          description: "Whether the connector completed the delete request.",
        },
        raw: {
          type: ["object", "null"],
          properties: {},
          additionalProperties: true,
          description: "The raw Grafana API object.",
        },
      },
      required: ["deleted", "raw"],
      additionalProperties: false,
      description: "Grafana data source deletion result.",
    },
  },
];
