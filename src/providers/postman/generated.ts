export const postmanGeneratedActionSchemas = [
  {
    name: "create_an_api",
    operationType: "write",
    description:
      "Tool to create a new API in Postman. Use when you need to create an API with a name, summary, and description in your Postman workspace.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "api"],
      properties: {
        api: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "The name of the API to create",
            },
            summary: {
              type: "string",
              description: "A brief summary of the API",
            },
            description: {
              type: "string",
              description: "A detailed description of the API",
            },
          },
          description: "The API object containing name, summary, and description",
          additionalProperties: false,
        },
        workspace_id: {
          type: "string",
          description: "The workspace ID where the API will be created",
        },
      },
      description: "Request model for creating a new API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the created API",
        },
        name: {
          type: "string",
          description: "The name of the created API",
        },
        summary: {
          type: "string",
          description: "The summary of the created API",
        },
        createdAt: {
          type: "string",
          description: "ISO 8601 timestamp when the API was created",
        },
        createdBy: {
          type: "string",
          description: "User ID of who created the API",
        },
        updatedAt: {
          type: "string",
          description: "ISO 8601 timestamp when the API was last updated",
        },
        updatedBy: {
          type: "string",
          description: "User ID of who last updated the API",
        },
        description: {
          type: "string",
          description: "The description of the created API",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_an_environment",
    operationType: "write",
    description:
      "Tool to create a new environment in a Postman workspace. Use when you need to create a new environment with variables for different settings (development, production, testing, etc.). Returns the created environment's ID, name, and UID upon successful creation.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "environment"],
      properties: {
        environment: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "The name of the environment to create",
            },
            values: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The name/key of the environment variable",
                  },
                  type: {
                    enum: ["default", "secret"],
                    type: "string",
                    default: "default",
                    description:
                      "The type of the variable. Use 'default' for regular variables or 'secret' for sensitive values like passwords and API keys",
                  },
                  value: {
                    type: "string",
                    description: "The value of the environment variable",
                  },
                  enabled: {
                    type: "boolean",
                    default: true,
                    description: "Whether the variable is enabled and active in the environment",
                  },
                },
                description: "Individual environment variable to be added to the environment.",
              },
              description:
                "Array of environment variables with key, value, type, and enabled properties. Defaults to empty array for new environments",
            },
          },
          description: "Environment object containing name and optional array of environment variables",
          additionalProperties: false,
        },
        workspace_id: {
          type: "string",
          description:
            "The workspace ID where the environment will be created. Required to associate the environment with a specific workspace",
        },
      },
      description: "Request parameters for creating a new Postman environment.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created environment",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the created environment",
            },
          },
          description: "Created environment object containing id, name, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_collection",
    operationType: "write",
    description:
      "Tool to create a new Postman collection in a specific workspace or the default workspace. Use when you need to create a collection with workspace specification. For complete collection format details, refer to the Postman Collection Format documentation.",
    inputSchema: {
      type: "object",
      required: ["collection"],
      properties: {
        workspace: {
          type: "string",
          description:
            "Optional workspace ID where the collection will be created. If not specified, the collection is created in the user's default workspace",
        },
        collection: {
          type: "object",
          required: ["info"],
          properties: {
            info: {
              type: "object",
              required: ["name"],
              properties: {
                name: {
                  type: "string",
                  description: "The name of the collection to create",
                },
                schema: {
                  type: "string",
                  default: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                  description: "The schema version URL for the collection. Defaults to v2.1.0",
                },
                description: {
                  type: "string",
                  description: "Optional description of the collection explaining its purpose",
                },
              },
              description: "Collection metadata containing name, description, and schema version",
              additionalProperties: false,
            },
            item: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: true,
                      description: "The Item object.",
                    },
                    description: "Nested items if this is a folder",
                  },
                  name: {
                    type: "string",
                    description: "Name of the item (request or folder)",
                  },
                  request: {
                    type: "object",
                    description: "Request object containing method, url, headers, body, etc.",
                    additionalProperties: true,
                  },
                },
                description: "Represents a collection item which can be a request or folder.",
              },
              description: "Array of collection items (requests, folders). Defaults to empty array for new collections",
            },
          },
          description:
            "Collection object containing info (name, description, schema) and item array (requests/folders)",
          additionalProperties: false,
        },
      },
      description: "Request parameters for creating a new Postman collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created collection",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the created collection",
            },
          },
          description: "Created collection object containing id, name, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_collection_comment",
    operationType: "write",
    description:
      "Tool to create a comment on an API's collection. Use when you need to add a comment to a specific collection within an API. To create a reply on an existing comment, include the thread_id in the request.",
    inputSchema: {
      type: "object",
      required: ["api_id", "collection_id", "body"],
      properties: {
        body: {
          type: "string",
          description: "The text content of the comment to create on the API collection.",
        },
        api_id: {
          type: "string",
          description: "The API's unique identifier (UUID). This identifies the API containing the collection.",
        },
        thread_id: {
          type: "integer",
          description:
            "Optional thread ID to reply to an existing comment thread. Include this to create a reply on an existing comment.",
        },
        collection_id: {
          type: "string",
          description:
            "The collection's unique identifier (UUID). This identifies the specific collection to comment on.",
        },
      },
      description: "Request parameters to create a comment on an API's collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description: "The comment's unique ID",
        },
        body: {
          type: "string",
          description: "The text content of the comment",
        },
        thread_id: {
          type: "integer",
          description: "The thread ID this comment belongs to",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was created",
        },
        created_by: {
          type: "integer",
          description: "The ID of the user who created the comment",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was last updated",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_collection_from_a_schema",
    operationType: "write",
    description:
      "Tool to create a collection from a schema and link it to an API with specified relations. Note: This endpoint is deprecated in Postman v10 and higher. Use when you need to generate a collection from an API schema and establish relations like contract tests or documentation.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id", "schema_id", "name", "relations"],
      properties: {
        name: {
          type: "string",
          description: "The name of the collection to be created",
        },
        api_id: {
          type: "string",
          description: "The unique identifier (UUID) of the API",
        },
        relations: {
          type: "array",
          items: {
            type: "object",
            required: ["type"],
            properties: {
              type: {
                enum: ["contracttest", "integrationtest", "testsuite", "documentation"],
                type: "string",
                description:
                  "The type of relation to create. Must be one of: contracttest, integrationtest, testsuite, or documentation",
              },
            },
            description: "Relation type for the collection.",
          },
          description: "List of relation(s) to be created. Each relation must specify a type from the allowed values",
        },
        schema_id: {
          type: "string",
          description: "The unique identifier (UUID) of the schema from which to create the collection",
        },
        workspace: {
          type: "string",
          description:
            "Optional workspace ID where the collection will be created. If not specified, the collection is created in the user's default workspace",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier (UUID) of the API version",
        },
      },
      description: "Request parameters for creating a collection from a schema.",
    },
    outputSchema: {
      type: "object",
      properties: {
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the created relation",
              },
              type: {
                type: "string",
                description: "The type of the relation",
              },
            },
            description: "Information about a created relation.",
          },
          description: "List of created relations",
        },
        collection: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the created collection",
            },
            uid: {
              type: "string",
              description: "The extended unique identifier combining workspace and collection ID",
            },
          },
          description: "Information about the newly created collection",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_folder",
    operationType: "write",
    description:
      "Tool to create a folder in a Postman collection. Use when you need to organize requests by creating a new folder within a collection. For complete details, see the Postman Collection Format documentation.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "name"],
      properties: {
        name: {
          type: "string",
          description: "The name of the folder to create",
        },
        description: {
          type: "string",
          description: "Optional description of the folder explaining its purpose",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection to create the folder in",
        },
      },
      description: "Request parameters to create a folder in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the created folder",
            },
            name: {
              type: "string",
              description: "The name of the folder",
            },
            order: {
              type: "array",
              items: {
                type: "string",
                description: "The Order value.",
              },
              description: "Array of request IDs in the folder's display order",
            },
            owner: {
              type: "string",
              description: "The owner ID of the folder",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the folder was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the folder was last updated",
            },
            collection: {
              type: "string",
              description: "The collection ID containing this folder",
            },
            description: {
              type: "string",
              description: "The description of the folder",
            },
            foldersOrder: {
              type: "array",
              items: {
                type: "string",
                description: "The Folders Order value.",
              },
              description: "Array of subfolder IDs in the folder's display order",
            },
            lastUpdatedBy: {
              type: "string",
              description: "User ID who last updated the folder",
            },
          },
          description: "Data about the created folder",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
          },
          description: "Metadata about the folder creation operation",
        },
        model_id: {
          type: "string",
          description: "The model ID of the created folder",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_folder_comment",
    operationType: "write",
    description:
      "Tool to create a comment on a folder. Use when you need to add a comment to a specific folder in a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "folder_uid", "body"],
      properties: {
        body: {
          type: "string",
          description: "The comment text content to post on the folder.",
        },
        folder_uid: {
          type: "string",
          description: "The unique identifier (UID) of the folder to comment on.",
        },
        collection_uid: {
          type: "string",
          description: "The unique identifier (UID) of the collection containing the folder.",
        },
      },
      description: "Request parameters to create a comment on a folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "The comment's unique ID",
            },
            body: {
              type: "string",
              description: "The comment text content",
            },
            status: {
              type: "string",
              description: "The comment status",
            },
            thread_id: {
              type: "integer",
              description: "The thread ID this comment belongs to",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when comment was created",
            },
            created_by: {
              type: "integer",
              description: "User ID who created the comment",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when comment was last updated",
            },
          },
          description: "The created comment object with all its details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_fork2",
    operationType: "write",
    description:
      "Tool to create a fork from an existing environment into a workspace. Use when you need to fork an environment to a specified workspace.",
    inputSchema: {
      type: "object",
      required: ["environment_uid", "workspace", "fork_name"],
      properties: {
        fork_name: {
          type: "string",
          description: "A name for the forked environment",
        },
        workspace: {
          type: "string",
          description: "The workspace ID where the forked environment will be created",
        },
        environment_uid: {
          type: "string",
          description: "The unique identifier (UID) of the environment to fork",
        },
      },
      description: "Request parameters for creating a fork from an existing environment.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            uid: {
              type: "string",
              description: "The unique identifier of the newly created fork",
            },
            name: {
              type: "string",
              description: "The original environment name",
            },
            forkName: {
              type: "string",
              description: "The name of the forked environment",
            },
          },
          description: "The environment object containing the fork details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_mock_server",
    operationType: "write",
    description:
      "Tool to create a new mock server in a Postman collection. Use when you need to create a mock server to simulate API endpoints for testing or development. Returns the created mock server's details including the mockUrl which can be used to make requests.",
    inputSchema: {
      type: "object",
      required: ["mock"],
      properties: {
        mock: {
          type: "object",
          required: ["name", "collection"],
          properties: {
            name: {
              type: "string",
              description: "The name for the mock server",
            },
            private: {
              type: "boolean",
              description:
                "Whether to create a private mock server. Private mocks require API key authentication. Default is false (public).",
            },
            collection: {
              type: "string",
              description: "The collection UID (format: userId-collectionId) to create the mock server from",
            },
            environment: {
              type: "string",
              description: "The environment UID to use with the mock server",
            },
          },
          description:
            "Mock server configuration containing name, collection UID, optional environment UID, and privacy setting",
          additionalProperties: false,
        },
        workspace: {
          type: "string",
          description: "The workspace ID where the mock server should be created",
        },
      },
      description: "Request parameters for creating a new mock server.",
    },
    outputSchema: {
      type: "object",
      properties: {
        mock: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created mock server",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the created mock server",
            },
            owner: {
              type: "string",
              description: "User ID of the mock server owner",
            },
            mockUrl: {
              type: "string",
              description: "URL of the mock server that can be used to make requests",
            },
            isPublic: {
              type: "boolean",
              description:
                "Whether the mock server is public (true) or private (false). Private mocks require API key authentication.",
            },
            collection: {
              type: "string",
              description: "Collection ID associated with this mock server",
            },
            environment: {
              type: "string",
              description: "Environment ID associated with this mock server (if applicable)",
            },
          },
          description:
            "Created mock server object with details including id, name, uid, owner, collection, environment, mockUrl, and isPublic",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_monitor",
    operationType: "write",
    description:
      "Tool to create a new monitor in a specific workspace to run a collection on a schedule. Use when you need to set up automated collection runs at specified intervals using cron expressions within a workspace.",
    inputSchema: {
      type: "object",
      required: ["workspace", "monitor"],
      properties: {
        monitor: {
          type: "object",
          required: ["name", "collection", "schedule"],
          properties: {
            name: {
              type: "string",
              description: "Name of the monitor to be created",
            },
            schedule: {
              type: "object",
              required: ["cron", "timezone"],
              properties: {
                cron: {
                  type: "string",
                  description:
                    "Cron expression defining when the monitor should run (e.g., '0 0 * * *' for daily at midnight, '0 */6 * * *' for every 6 hours)",
                },
                timezone: {
                  type: "string",
                  description: "Timezone for the monitor schedule (e.g., 'UTC', 'America/New_York', 'Asia/Kolkata')",
                },
              },
              description: "Schedule configuration defining when and how often the monitor should run",
              additionalProperties: false,
            },
            collection: {
              type: "string",
              description:
                "Collection UID in the format 'owner-collectionId' (e.g., '12345678-abcd1234-ef56-7890-abcd-1234567890ab')",
            },
            environment: {
              type: "string",
              description:
                "Optional environment UID to use with the monitor. If not provided, the monitor runs without an environment.",
            },
          },
          description: "Monitor configuration object containing name, collection, schedule, and optional environment",
          additionalProperties: false,
        },
        workspace: {
          type: "string",
          description: "The workspace ID where the monitor will be created",
        },
      },
      description: "Request model for creating a new monitor in a workspace.",
    },
    outputSchema: {
      type: "object",
      properties: {
        monitor: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created monitor",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the created monitor",
            },
          },
          description: "The created monitor object with id, name, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_pull_request",
    operationType: "write",
    description:
      "Tool to create a pull request for a forked collection into its parent collection. Use when you need to propose changes from a forked collection to be merged into the parent collection. The forked collection must exist before creating a pull request.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "title", "destination_id"],
      properties: {
        title: {
          type: "string",
          description: "The title of the pull request. This should summarize the changes being proposed.",
        },
        reviewers: {
          type: "array",
          items: {
            type: "string",
            description: "The Reviewer value.",
          },
          description:
            "Array of reviewer user IDs or user groups who should review the pull request. Can be an empty array if no specific reviewers are required.",
        },
        description: {
          type: "string",
          description: "A detailed description of the changes in the pull request. Provides context for reviewers.",
        },
        collection_uid: {
          type: "string",
          description:
            "The unique identifier (UID) of the forked collection from which to create the pull request. Format: {owner}-{collectionId}",
        },
        destination_id: {
          type: "string",
          description:
            "The UID of the destination (parent) collection where the changes will be merged. Format: {owner}-{collectionId}",
        },
      },
      description: "Request parameters for creating a pull request on a forked collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created pull request",
            },
            title: {
              type: "string",
              description: "Title of the pull request",
            },
            source: {
              type: "string",
              description: "Source collection ID (the forked collection)",
            },
            status: {
              type: "string",
              description: "Current status of the pull request (e.g., 'open', 'merged', 'declined')",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the pull request was created",
            },
            created_by: {
              type: "integer",
              description: "User ID of the pull request creator",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the pull request was last updated",
            },
            description: {
              type: "string",
              description: "Description of the pull request",
            },
            destination: {
              type: "string",
              description: "Destination collection ID (the parent collection)",
            },
          },
          description: "The pull request object containing details about the created pull request",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_request",
    operationType: "write",
    description:
      "Tool to create a new request in a Postman collection. Use when you need to add a request to an existing collection with specified method, URL, headers, and body.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "name", "request"],
      properties: {
        name: {
          type: "string",
          description: "The name of the request to create",
        },
        request: {
          type: "object",
          required: ["method", "url"],
          properties: {
            url: {
              type: "string",
              description: "The request URL",
            },
            body: {
              type: "object",
              properties: {
                raw: {
                  type: "string",
                  description: "The raw body content when mode is 'raw'",
                },
                mode: {
                  type: "string",
                  description: "The mode of the request body (e.g., 'raw', 'urlencoded', 'formdata')",
                },
                formdata: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Formdata item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Formdata item option 2 value.",
                        },
                      ],
                      description: "The Formdata item value.",
                    },
                    description: "The Formdata object.",
                  },
                  description: "Form data key-value pairs when mode is 'formdata'",
                },
                urlencoded: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Urlencoded item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Urlencoded item option 2 value.",
                        },
                      ],
                      description: "The Urlencoded item value.",
                    },
                    description: "The Urlencoded object.",
                  },
                  description: "URL-encoded key-value pairs when mode is 'urlencoded'",
                },
              },
              description: "Body object for the request.",
              additionalProperties: false,
            },
            header: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The header key/name",
                  },
                  value: {
                    type: "string",
                    description: "The header value",
                  },
                  disabled: {
                    type: "boolean",
                    description: "Whether this header is disabled",
                  },
                },
                description: "Header object for the request.",
              },
              description: "Array of header objects for the request",
            },
            method: {
              type: "string",
              description: "HTTP method for the request",
            },
            description: {
              type: "string",
              description: "Description of the request",
            },
          },
          description:
            "The request object containing method, URL, headers, body, and other request details following the Postman Collection Format",
          additionalProperties: false,
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection where the request will be created",
        },
      },
      description: "Request model for creating a request in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the created request",
            },
            url: {
              type: "string",
              description: "The URL of the request",
            },
            name: {
              type: "string",
              description: "The name of the created request",
            },
            owner: {
              type: "string",
              description: "The owner ID of the request",
            },
            folder: {
              type: "string",
              description: "The folder ID if the request is in a folder",
            },
            method: {
              type: "string",
              description: "The HTTP method of the request",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Header item option 1 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Header item option 2 value.",
                    },
                  ],
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "List of headers in the request",
            },
            dataMode: {
              type: "string",
              description: "The data mode of the request body",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the request was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the request was last updated",
            },
            collection: {
              type: "string",
              description: "The collection ID containing this request",
            },
          },
          description: "Data about the created request",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_request_comment",
    operationType: "write",
    description:
      "Tool to create a comment on a request. Use when you need to add a comment to a specific request within a collection or reply to an existing comment thread.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "request_uid", "body"],
      properties: {
        body: {
          type: "string",
          description: "The comment text content to post on the request.",
        },
        thread_id: {
          type: "integer",
          description:
            "Optional thread ID to reply to an existing comment. If provided, this comment will be added as a reply to the specified thread.",
        },
        request_uid: {
          type: "string",
          description: "The request's unique ID (UID). This identifies the specific request to create a comment on.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the request.",
        },
      },
      description: "Request parameters to create a comment on a request.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "The comment's unique ID",
            },
            body: {
              type: "string",
              description: "The comment text content",
            },
            status: {
              type: "string",
              description: "The comment status (e.g., Open)",
            },
            thread_id: {
              type: "integer",
              description: "The thread ID this comment belongs to",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when comment was created",
            },
            created_by: {
              type: "integer",
              description: "User ID who created the comment",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when comment was last updated",
            },
          },
          description: "The created comment object with all its details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_response",
    operationType: "write",
    description:
      "Tool to create a request response in a Postman collection. Use when you need to add a saved response example to a specific request in a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "parent_request_id", "name"],
      properties: {
        body: {
          type: "string",
          description: "The response body as a string",
        },
        code: {
          type: "integer",
          description: "The HTTP status code",
        },
        name: {
          type: "string",
          description: "The name of the response example",
        },
        header: {
          type: "array",
          items: {
            type: "object",
            required: ["key", "value"],
            properties: {
              key: {
                type: "string",
                description: "The header key name",
              },
              value: {
                type: "string",
                description: "The header value",
              },
            },
            description: "A single header key-value pair.",
          },
          description: "Array of header objects with key and value properties",
        },
        status: {
          type: "string",
          description: "The status text (e.g., OK, Not Found, Bad Request)",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection where the response will be created",
        },
        original_request: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL of the original request",
            },
            method: {
              type: "string",
              description: "HTTP method of the request (GET, POST, PUT, DELETE, etc.)",
            },
          },
          description: "The original request object structure.",
          additionalProperties: false,
        },
        parent_request_id: {
          type: "string",
          description: "The unique identifier of the parent request to which this response will be attached",
        },
        _postman_previewlanguage: {
          type: "string",
          description: "The preview language for the response body (e.g., json, html, xml)",
        },
      },
      description: "Request parameters for creating a response in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the created response",
            },
            name: {
              type: "string",
              description: "The name of the response",
            },
            text: {
              type: "string",
              description: "The response body text",
            },
            owner: {
              type: "string",
              description: "The owner ID of the response",
            },
            status: {
              type: "string",
              description: "The status text of the response",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Header item option 1 value.",
                    },
                    {
                      type: "integer",
                      description: "The Header item option 2 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Header item option 3 value.",
                    },
                  ],
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "List of response headers",
            },
            request: {
              type: "string",
              description: "The request ID associated with this response",
            },
            language: {
              type: "string",
              description: "The language of the response",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the response was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the response was last updated",
            },
            rawDataType: {
              type: "string",
              description: "The raw data type of the response",
            },
            responseCode: {
              type: "integer",
              description: "The HTTP response code",
            },
            requestObject: {
              type: "object",
              description: "The request object associated with this response",
              additionalProperties: {
                anyOf: [
                  {
                    type: "string",
                    description: "The Request Object item option 1 value.",
                  },
                  {
                    type: "integer",
                    description: "The Request Object item option 2 value.",
                  },
                  {
                    type: "boolean",
                    description: "The Request Object item option 3 value.",
                  },
                  {
                    type: "array",
                    items: {
                      description: "The Request Object item option 4 value.",
                    },
                    description: "The list of request object item option 4 values.",
                  },
                  {
                    type: "object",
                    additionalProperties: true,
                    description: "The Request Object item option 5 object.",
                  },
                ],
                description: "The Request Object item value.",
              },
            },
          },
          description: "Data about the created response",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
          },
          description: "Metadata about the response operation",
        },
        model_id: {
          type: "string",
          description: "The model ID of the response",
        },
        revision: {
          type: "integer",
          description: "The revision number of the collection after creation",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_response_comment",
    operationType: "write",
    description:
      "Tool to create a comment on a response. Use when you need to add a comment to a specific response within a collection or reply to an existing comment thread.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "response_uid", "body"],
      properties: {
        body: {
          type: "string",
          description: "The comment text content to post on the response.",
        },
        thread_id: {
          type: "integer",
          description:
            "Optional thread ID to reply to an existing comment. If provided, this comment will be added as a reply to the specified thread.",
        },
        response_uid: {
          type: "string",
          description: "The response's unique ID (UID). This identifies the specific response to create a comment on.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the response.",
        },
      },
      description: "Request parameters to create a comment on a response.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "The comment's unique ID",
            },
            body: {
              type: "string",
              description: "The comment text content",
            },
            status: {
              type: "string",
              description: "The comment status (e.g., Open)",
            },
            thread_id: {
              type: "integer",
              description: "The thread ID this comment belongs to",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when comment was created",
            },
            created_by: {
              type: "integer",
              description: "User ID who created the comment",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when comment was last updated",
            },
          },
          description: "The created comment object with all its details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_schema",
    operationType: "write",
    description:
      "Tool to create a schema for an API in Postman. Use when you need to add a schema definition (such as OpenAPI, GraphQL, or Protocol Buffers) to an existing API. The schema can consist of single or multiple files. Returns the created schema's ID and metadata upon successful creation.",
    inputSchema: {
      type: "object",
      required: ["api_id", "type", "files"],
      properties: {
        type: {
          type: "string",
          description:
            "The type of schema being created. Common values include 'openapi:3' (OpenAPI 3.0), 'openapi:2' (Swagger 2.0), 'proto' (Protocol Buffers), 'graphql', etc.",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: {
                type: "string",
                description:
                  "The path of the file in the schema (e.g., 'index.json', 'openapi.yaml'). This defines the file structure within the schema",
              },
              content: {
                type: "string",
                description:
                  "The actual content of the schema file. Must be a valid JSON or YAML string representation of the schema (e.g., OpenAPI specification)",
              },
            },
            description: "File containing schema content.",
          },
          description:
            "List of files that make up the schema. Each file must have a path and content. For single-file schemas, provide one file; for multi-file schemas, provide all referenced files",
        },
        api_id: {
          type: "string",
          description: "The unique identifier (UUID) of the API for which to create the schema",
        },
      },
      description: "Request parameters for creating a schema for an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the created schema",
        },
        type: {
          type: "string",
          description: "The type of the schema (e.g., 'openapi:3')",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the created file",
              },
              name: {
                type: "string",
                description: "Name of the file",
              },
              path: {
                type: "string",
                description: "Path of the file in the schema",
              },
            },
            description: "Information about a created schema file.",
          },
          description: "List of files that were created as part of the schema",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the schema was created",
        },
        created_by: {
          type: "string",
          description: "User ID who created the schema",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the schema was last updated",
        },
        updated_by: {
          type: "string",
          description: "User ID who last updated the schema",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_server_response",
    operationType: "write",
    description:
      "Tool to create a server response on a Postman mock server. Use when you need to simulate 5xx server-level responses (500, 503, etc.) for testing error conditions.",
    inputSchema: {
      type: "object",
      required: ["mock_id", "serverResponse"],
      properties: {
        mock_id: {
          type: "string",
          description: "The unique identifier of the mock server (UUID format)",
        },
        serverResponse: {
          type: "object",
          required: ["name", "statusCode"],
          properties: {
            body: {
              type: "string",
              description: "The response body content as a string",
            },
            name: {
              type: "string",
              description: "Name of the server response (e.g., 'Internal Server Error', 'Service Unavailable')",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  type: "string",
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "Array of header objects with key and value properties",
            },
            language: {
              type: "string",
              description: "Preview language for the response body (e.g., json, html, text)",
            },
            statusCode: {
              type: "integer",
              description: "HTTP status code for the server-level response. Must be a 5xx status code (500-599)",
            },
          },
          description: "Server response configuration containing name, status code, and optional body/headers",
          additionalProperties: false,
        },
      },
      description: "Request parameters for creating a server response on a mock server.",
    },
    outputSchema: {
      type: "object",
      properties: {
        serverResponse: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created server response",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            body: {
              type: "string",
              description: "The response body content",
            },
            name: {
              type: "string",
              description: "Name of the server response",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Header item option 1 value.",
                    },
                    {
                      type: "integer",
                      description: "The Header item option 2 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Header item option 3 value.",
                    },
                  ],
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "List of response headers",
            },
            language: {
              type: "string",
              description: "Preview language for the response body",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the server response was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the server response was last updated",
            },
            statusCode: {
              type: "integer",
              description: "HTTP status code of the server response",
            },
          },
          description: "The created server response object with id, name, uid, and status code",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_spec",
    operationType: "write",
    description:
      "Tool to create an API specification in Postman's Spec Hub. Use when you need to create single or multi-file specifications in a workspace. Supports various spec types including OpenAPI 3.0, OpenAPI 3.1, and AsyncAPI 2.0.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "name", "type", "files"],
      properties: {
        name: {
          type: "string",
          description: "The name of the API specification to create",
        },
        type: {
          type: "string",
          description: "The type of specification. Common values include 'OPENAPI:3.0', 'OPENAPI:3.1', 'ASYNCAPI:2.0'",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: {
                type: "string",
                description: "The file path within the specification (e.g., 'index.yaml', 'paths/users.yaml')",
              },
              content: {
                type: "string",
                description:
                  "The content of the file as a string. For YAML files, provide properly formatted YAML content",
              },
            },
            description: "Represents a file in the API specification.",
          },
          minItems: 1,
          description:
            "Array of files for the specification. Each file must have a path and content property. For single-file specs, provide one file; for multi-file specs, provide multiple files",
        },
        workspace_id: {
          type: "string",
          description:
            "The workspace ID where the spec will be created. This is a UUID format string identifying the target workspace",
        },
      },
      description: "Request model for creating a new API specification.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier of the created specification",
        },
        name: {
          type: "string",
          description: "Name of the created specification",
        },
        type: {
          type: "string",
          description: "Type of specification (e.g., 'OPENAPI:3.0')",
        },
        createdAt: {
          type: "string",
          description: "ISO 8601 timestamp when the spec was created",
        },
        createdBy: {
          type: "integer",
          description: "User ID who created the spec",
        },
        updatedAt: {
          type: "string",
          description: "ISO 8601 timestamp when the spec was last updated",
        },
        updatedBy: {
          type: "integer",
          description: "User ID who last updated the spec",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_spec_file",
    operationType: "write",
    description:
      "Tool to create a new file in an API specification. Use when you need to add a new file (such as schema definitions, path configurations, or components) to an existing spec.",
    inputSchema: {
      type: "object",
      required: ["spec_id", "path", "content"],
      properties: {
        path: {
          type: "string",
          description:
            "The file path within the spec (e.g., 'components/schemas.yaml', 'paths/users.yaml'). This defines the file location in the spec structure",
        },
        content: {
          type: "string",
          description: "The content of the file to create. Must be a valid YAML or JSON string",
        },
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification in which to create the file",
        },
      },
      description: "Request model for creating a spec file.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the created file",
        },
        path: {
          type: "string",
          description: "The file path within the specification",
        },
        type: {
          type: "string",
          description: "The type of file (e.g., 'DEFAULT', 'ROOT')",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was created",
        },
        created_by: {
          type: "integer",
          description: "User ID who created the file",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was last updated",
        },
        updated_by: {
          type: "integer",
          description: "User ID who last updated the file",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_webhook",
    operationType: "write",
    description:
      "Tool to create a webhook that triggers a collection with a custom payload. Use when you need to set up a webhook endpoint that can trigger a Postman collection run. The webhook URL is available in the webhookUrl property of the response.",
    inputSchema: {
      type: "object",
      required: ["workspace", "webhook"],
      properties: {
        webhook: {
          type: "object",
          required: ["name", "collection"],
          properties: {
            name: {
              type: "string",
              description: "Name of the webhook to be created",
            },
            collection: {
              type: "string",
              description:
                "Collection UID in the format 'owner-collectionId' (e.g., '12345678-abcd1234-ef56-7890-abcd-1234567890ab'). This is the collection that will be triggered by the webhook.",
            },
          },
          description: "Webhook configuration object containing name and collection UID",
          additionalProperties: false,
        },
        workspace: {
          type: "string",
          description: "The workspace ID where the webhook will be created",
        },
      },
      description: "Request model for creating a new webhook.",
    },
    outputSchema: {
      type: "object",
      properties: {
        webhook: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the created webhook",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the created webhook",
            },
            collection: {
              type: "string",
              description: "Collection UID associated with the webhook",
            },
            webhookUrl: {
              type: "string",
              description: "The URL endpoint for triggering this webhook with custom payloads",
            },
          },
          description: "The created webhook object with id, name, collection, webhookUrl, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_a_workspace",
    operationType: "write",
    description:
      "Tool to create a new workspace in Postman. Use when you need to create a workspace with a specified name, type (personal, team, private, or public), and optional description. Returns the created workspace's ID, name, and type upon successful creation.",
    inputSchema: {
      type: "object",
      required: ["workspace"],
      properties: {
        workspace: {
          type: "object",
          required: ["name", "type"],
          properties: {
            name: {
              type: "string",
              description: "The name of the workspace to create",
            },
            type: {
              enum: ["personal", "team", "private", "public"],
              type: "string",
              description:
                "The type of workspace. Use 'personal' for individual workspaces, 'team' for team collaboration, 'private' for private team workspaces, or 'public' for publicly accessible workspaces",
            },
            description: {
              type: "string",
              description: "A detailed description of the workspace",
            },
          },
          description: "The workspace object containing name, type, and optional description",
          additionalProperties: false,
        },
      },
      description: "Request model for creating a new workspace.",
    },
    outputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the created workspace",
            },
            name: {
              type: "string",
              description: "The name of the created workspace",
            },
            type: {
              type: "string",
              description: "The type of the created workspace",
            },
          },
          description: "The created workspace object with id, name, and type",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_or_update_a_schema_file",
    operationType: "write",
    description:
      "Tool to create or update an API schema file in Postman. Use when you need to add a new schema file or modify an existing one within an API schema. Requires API ID, schema ID, file path, and stringified JSON content.",
    inputSchema: {
      type: "object",
      required: ["api_id", "schema_id", "file_path", "content"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API containing the schema. This is the API's ID in Postman.",
        },
        content: {
          type: "string",
          description:
            "The stringified JSON content of the schema file. This should be a JSON string representation of your schema content. For complex JSON objects, ensure proper escaping.",
        },
        file_path: {
          type: "string",
          description:
            "The path to the schema file to create or update. This is the file path within the schema structure (e.g., 'index.json', 'components.json', 'schemas/openapi.yaml').",
        },
        schema_id: {
          type: "string",
          description:
            "The unique identifier of the schema to which the file belongs. This is the schema's ID within the API.",
        },
      },
      description: "Request model for creating or updating a schema file.",
    },
    outputSchema: {
      type: "object",
      properties: {
        file: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the schema file",
            },
            name: {
              type: "string",
              description: "Name of the schema file",
            },
            path: {
              type: "string",
              description: "File path within the schema structure",
            },
            root: {
              type: "object",
              properties: {
                enabled: {
                  type: "boolean",
                  description: "Indicates whether the file is enabled as a root file in the schema",
                },
              },
              description: "Root configuration indicating if this is a root file",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the file was created",
            },
            created_by: {
              type: "string",
              description: "User ID of the person who created the file",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the file was last updated",
            },
            updated_by: {
              type: "string",
              description: "User ID of the person who last updated the file",
            },
          },
          description:
            "The created or updated schema file object with metadata including ID, name, path, and timestamps",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "create_relations",
    operationType: "write",
    description:
      "Tool to create new relations for an API version. Use when you need to link collections or mock servers to an API version as contract tests, test suites, documentation, or mocks.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        mock: {
          type: "array",
          items: {
            type: "string",
            description: "The Mock value.",
          },
          description: "Array of mock server UIDs",
        },
        api_id: {
          type: "string",
          description: "The unique identifier of the API",
        },
        testsuite: {
          type: "array",
          items: {
            type: "string",
            description: "The Testsuite value.",
          },
          description: "Array of collection UIDs for test suites",
        },
        contracttest: {
          type: "array",
          items: {
            type: "string",
            description: "The Contracttest value.",
          },
          description: "Array of collection UIDs for contract testing",
        },
        documentation: {
          type: "array",
          items: {
            type: "string",
            description: "The Documentation value.",
          },
          description: "Array of collection UIDs for documentation",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version",
        },
      },
      description: "Request model for creating relations for an API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        mock: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
                description: "The Mock option 1 value.",
              },
              {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the relation",
                  },
                  name: {
                    type: "string",
                    description: "Name of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of relation (contracttest, testsuite, documentation, mock)",
                  },
                },
                description: "Individual relation item.",
              },
            ],
            description: "The Mock value.",
          },
          description: "Array of mock server relations created (can be IDs or relation objects)",
        },
        testsuite: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
                description: "The Testsuite option 1 value.",
              },
              {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the relation",
                  },
                  name: {
                    type: "string",
                    description: "Name of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of relation (contracttest, testsuite, documentation, mock)",
                  },
                },
                description: "Individual relation item.",
              },
            ],
            description: "The Testsuite value.",
          },
          description: "Array of test suite relations created (can be IDs or relation objects)",
        },
        contracttest: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
                description: "The Contracttest option 1 value.",
              },
              {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the relation",
                  },
                  name: {
                    type: "string",
                    description: "Name of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of relation (contracttest, testsuite, documentation, mock)",
                  },
                },
                description: "Individual relation item.",
              },
            ],
            description: "The Contracttest value.",
          },
          description: "Array of contract test relations created (can be IDs or relation objects)",
        },
        documentation: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
                description: "The Documentation option 1 value.",
              },
              {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the relation",
                  },
                  name: {
                    type: "string",
                    description: "Name of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of relation (contracttest, testsuite, documentation, mock)",
                  },
                },
                description: "Individual relation item.",
              },
            ],
            description: "The Documentation value.",
          },
          description: "Array of documentation relations created (can be IDs or relation objects)",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_an_api",
    operationType: "destructive",
    description:
      "Tool to delete an API from Postman. Use when you need to permanently remove an API. On success, returns HTTP 204 No Content response.",
    inputSchema: {
      type: "object",
      required: ["api_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The ID of the API to delete. This is the unique identifier for the API.",
        },
      },
      description: "Request model for deleting an API.",
    },
    outputSchema: {
      type: "object",
      required: ["success"],
      properties: {
        success: {
          type: "boolean",
          description: "Indicates if the delete operation was successful. Returns true when API is deleted (HTTP 204).",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_an_apis_comment",
    operationType: "destructive",
    description:
      "Tool to delete a comment from an API. Use when you need to remove a comment from a specific API. On success, this returns an HTTP 204 No Content response indicating the comment was successfully deleted.",
    inputSchema: {
      type: "object",
      required: ["api_id", "comment_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The API ID. This is the unique identifier of the API from which to delete the comment",
        },
        comment_id: {
          type: "string",
          description: "The comment ID. This is the unique identifier of the comment to delete",
        },
      },
      description: "Request parameters to delete a comment from an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          default: true,
          description: "Indicates the operation completed successfully",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_an_environment",
    operationType: "destructive",
    description:
      "Tool to delete an environment permanently in Postman. Use when you need to remove an environment that is no longer needed.",
    inputSchema: {
      type: "object",
      required: ["environment_id"],
      properties: {
        environment_id: {
          type: "string",
          description: "The environment ID or UID to delete.",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the deleted environment",
            },
            uid: {
              type: "string",
              description: "The UID of the deleted environment",
            },
          },
          description: "Information about the deleted environment",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_collection",
    operationType: "destructive",
    description:
      "Tool to permanently delete a collection from Postman. Use when you need to remove a collection that is no longer needed.",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        collection_id: {
          type: "string",
          description: "The unique identifier (UID) or ID of the collection to delete.",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The ID of the deleted collection",
            },
            uid: {
              type: "string",
              description: "The UID of the deleted collection",
            },
          },
          description: "Information about the deleted collection",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_collections_comment",
    operationType: "destructive",
    description:
      "Tool to delete a comment from an API's collection. Use when you need to remove a specific comment from a collection. On success, returns HTTP 204 No Content.",
    inputSchema: {
      type: "object",
      required: ["api_id", "collection_id", "comment_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The API's ID",
        },
        comment_id: {
          type: "integer",
          description: "The comment's ID",
        },
        collection_id: {
          type: "string",
          description: "The collection's UID",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      required: ["success", "message"],
      properties: {
        message: {
          type: "string",
          description: "Status message describing the result",
        },
        success: {
          type: "boolean",
          description: "Indicates whether the comment was successfully deleted",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_folder",
    operationType: "destructive",
    description:
      "Tool to delete a folder in a Postman collection. Use when you need to remove a folder and all its contents from a collection. The folder ID should not contain spaces to avoid 404 errors.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "folder_id"],
      properties: {
        folder_id: {
          type: "string",
          description:
            "The folder's ID. This is the unique identifier for the folder to delete. Note: folder IDs should not contain spaces to avoid 404 errors.",
        },
        collection_id: {
          type: "string",
          description:
            "The collection's ID. This is the unique identifier for the collection containing the folder to delete.",
        },
      },
      description: "Request parameters to delete a folder in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The ID of the deleted folder",
            },
            owner: {
              type: "string",
              description: "The owner ID of the deleted folder",
            },
          },
          description: "Data information about the deleted folder",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The type of model that was deleted",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
          },
          description: "Metadata about the delete operation",
        },
        model_id: {
          type: "string",
          description: "The ID of the deleted folder",
        },
        revision: {
          type: "integer",
          description: "The revision number after the delete operation",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_folders_comment",
    operationType: "destructive",
    description:
      "Tool to delete a comment from a folder. Use when you need to remove a specific comment from a folder. Returns HTTP 204 No Content on successful deletion.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "folder_uid", "comment_id"],
      properties: {
        comment_id: {
          type: "integer",
          description: "The ID of the comment to delete",
        },
        folder_uid: {
          type: "string",
          description: "The unique identifier (UID) of the folder",
        },
        collection_uid: {
          type: "string",
          description: "The unique identifier (UID) of the collection",
        },
      },
      description: "Request parameters to delete a comment from a folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          default: true,
          description: "Indicates the operation completed successfully",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_requests_comment",
    operationType: "destructive",
    description:
      "Tool to delete a comment from a request. Use when you need to remove a specific comment from a request. On success, this returns an HTTP 204 No Content response.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "request_uid", "comment_id"],
      properties: {
        comment_id: {
          type: "integer",
          description: "The comment's ID to delete. This identifies the specific comment to be removed.",
        },
        request_uid: {
          type: "string",
          description: "The request's unique ID (UID). This identifies the specific request containing the comment.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the request.",
        },
      },
      description: "Request parameters to delete a comment from a request.",
    },
    outputSchema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          default: true,
          description: "Indicates the operation completed successfully",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_response",
    operationType: "destructive",
    description:
      "Tool to delete a response in a Postman collection. Use when you need to remove a saved response from a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "response_id"],
      properties: {
        response_id: {
          type: "string",
          description: "The unique identifier of the response to delete",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the response",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The ID of the deleted response",
            },
            owner: {
              type: "string",
              description: "The owner ID of the response",
            },
          },
          description: "Data about the deleted response",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type, typically 'response'",
            },
            action: {
              type: "string",
              description: "The action performed, typically 'destroy'",
            },
          },
          description: "Metadata about the deletion operation",
        },
        model_id: {
          type: "string",
          description: "The ID of the deleted response model",
        },
        revision: {
          type: "integer",
          description: "The revision number after deletion",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_responses_comment",
    operationType: "destructive",
    description:
      "Tool to delete a comment from a response. Use when you need to remove a specific comment from a collection response. On successful deletion, this returns HTTP 204 No Content.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "response_uid", "comment_id"],
      properties: {
        comment_id: {
          type: "integer",
          description: "The unique identifier for the comment to delete.",
        },
        response_uid: {
          type: "string",
          description: "The unique identifier for the response.",
        },
        collection_uid: {
          type: "string",
          description: "The unique identifier for the collection.",
        },
      },
      description: "Request parameters to delete a comment from a response.",
    },
    outputSchema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          default: true,
          description: "Indicates the operation completed successfully",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_schema_file",
    operationType: "destructive",
    description:
      "Tool to delete a file in an API schema. Use when you need to remove a specific file from a schema. On success, returns HTTP 204 No Content response.",
    inputSchema: {
      type: "object",
      required: ["api_id", "schema_id", "file_path"],
      properties: {
        api_id: {
          type: "string",
          description: "The API's ID. This is the unique identifier for the API containing the schema.",
        },
        file_path: {
          type: "string",
          description: "The path to the schema file to delete. This is the file path within the schema.",
        },
        schema_id: {
          type: "string",
          description: "The schema's ID. This is the unique identifier for the schema containing the file.",
        },
      },
      description: "Request model for deleting a schema file.",
    },
    outputSchema: {
      type: "object",
      required: ["success"],
      properties: {
        success: {
          type: "boolean",
          description:
            "Indicates if the delete operation was successful. Returns true when file is deleted (HTTP 204).",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_server_response",
    operationType: "destructive",
    description:
      "Tool to delete a mock server's server response. Use when you need to remove a specific response from a Postman mock server.",
    inputSchema: {
      type: "object",
      required: ["mock_id", "server_response_id"],
      properties: {
        mock_id: {
          type: "string",
          description: "The mock server's unique identifier (UUID format)",
        },
        server_response_id: {
          type: "string",
          description: "The server response's unique identifier (UUID format) to delete",
        },
      },
      description: "Request parameters to delete a mock server's server response.",
    },
    outputSchema: {
      type: "object",
      properties: {
        server_response: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the server response",
            },
            uid: {
              type: "string",
              description: "The unique identifier (uid) of the server response",
            },
            name: {
              type: "string",
              description: "The name of the server response",
            },
            status_code: {
              type: "integer",
              description: "The HTTP status code of the server response",
            },
          },
          description: "Details of the deleted server response",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_spec",
    operationType: "destructive",
    description:
      "Tool to delete an API specification from Postman. Use when you need to permanently remove a specification. On success, returns HTTP 204 No Content response.",
    inputSchema: {
      type: "object",
      required: ["spec_id"],
      properties: {
        spec_id: {
          type: "string",
          description:
            "The ID of the API specification to delete. This is the unique identifier for the specification.",
        },
      },
      description: "Request model for deleting an API specification.",
    },
    outputSchema: {
      type: "object",
      required: ["success"],
      properties: {
        success: {
          type: "boolean",
          description:
            "Indicates if the delete operation was successful. Returns true when spec is deleted (HTTP 204).",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_spec_file",
    operationType: "destructive",
    description:
      "Tool to delete a file from an API specification. Use when you need to remove a specific file from a multi-file specification.",
    inputSchema: {
      type: "object",
      required: ["spec_id", "file_path"],
      properties: {
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification containing the file to delete",
        },
        file_path: {
          type: "string",
          description:
            "The path to the file within the specification to delete (e.g., 'components/schemas.yaml', 'openapi.yaml')",
        },
      },
      description: "Request parameters to delete a file from an API specification.",
    },
    outputSchema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          default: true,
          description: "Indicates the file was successfully deleted from the specification",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_a_workspace",
    operationType: "destructive",
    description:
      "Tool to delete a Postman workspace permanently. Use when you need to remove a workspace and all its contents. Deletion is permanent and cannot be undone.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "The ID of the workspace to delete. This is the unique identifier assigned to the workspace when it was created.",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      required: ["workspace"],
      properties: {
        workspace: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the deleted workspace",
            },
          },
          description: "Contains the ID of the deleted workspace",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "delete_monitor",
    operationType: "destructive",
    description:
      "Tool to delete a monitor by its ID. Use when you need to permanently remove a monitor from Postman. The monitor ID must be provided to identify which monitor to delete.",
    inputSchema: {
      type: "object",
      required: ["monitor_id"],
      properties: {
        monitor_id: {
          type: "string",
          description: "The ID of the monitor to delete",
        },
      },
      description: "Request schema for deleting a monitor by its ID.",
    },
    outputSchema: {
      type: "object",
      required: ["monitor"],
      properties: {
        monitor: {
          type: "object",
          required: ["id", "uid"],
          properties: {
            id: {
              type: "string",
              description: "The ID of the deleted monitor",
            },
            uid: {
              type: "string",
              description: "The UID of the deleted monitor",
            },
          },
          description: "Information about the deleted monitor",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "duplicate_a_collection",
    operationType: "write",
    description:
      "Tool to create a duplicate of a collection in another workspace. Use when you need to copy an existing collection to a different workspace. Returns an asynchronous task that can be tracked using the duplication task status endpoint.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "workspace"],
      properties: {
        workspace: {
          type: "string",
          description: "The ID of the workspace where the duplicated collection will be created",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier (UUID) of the collection to duplicate",
        },
      },
      description: "Request parameters for duplicating a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        task: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier for the duplication task",
            },
            status: {
              type: "string",
              description: "The status of the duplication task (e.g., 'processing')",
            },
          },
          description: "Task object containing status and id fields for the asynchronous duplication operation",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "fork_collection",
    operationType: "write",
    description:
      "Tool to create a fork of a collection in a specified workspace. Use when you need to fork an existing collection to a workspace.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "workspace"],
      properties: {
        label: {
          type: "string",
          description: "Label or name for the fork. If not provided, the fork will be created with a default label.",
        },
        workspace: {
          type: "string",
          description:
            "The workspace ID where the forked collection will be created. This is a required parameter for creating a fork.",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier (UUID) of the collection to fork",
        },
      },
      description: "Request parameters for forking a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        fork: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the forked collection",
            },
            name: {
              type: "string",
              description: "The name of the forked collection",
            },
          },
          description: "The fork object containing the ID and name of the newly created forked collection",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "generate_a_collection_from_spec",
    operationType: "write",
    description:
      "Tool to generate a Postman collection from an OpenAPI 2.0, 3.0, or 3.1 specification. Use when you need to create a collection from an existing API spec. The operation is asynchronous and returns a task ID and polling URL to check the generation status.",
    inputSchema: {
      type: "object",
      required: ["spec_id", "name"],
      properties: {
        name: {
          type: "string",
          description: "The name for the generated collection. This will be the display name in Postman.",
        },
        options: {
          type: "object",
          properties: {
            folderStrategy: {
              enum: ["Paths", "Tags"],
              type: "string",
              description:
                "Determines how folders are organized in the generated collection. 'Paths' organizes by API paths, 'Tags' organizes by OpenAPI tags.",
            },
            requestNameSource: {
              enum: ["Fallback", "URL"],
              type: "string",
              description:
                "Source for generating request names. 'Fallback' uses operationId, summary, or URL as fallback. 'URL' uses the endpoint URL.",
            },
          },
          description: "Options for configuring the collection generation from the specification.",
          additionalProperties: false,
        },
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification from which to generate the collection.",
        },
        element_type: {
          type: "string",
          const: "collection",
          default: "collection",
          description: "The type of element to generate. Must be 'collection' for collection generation.",
        },
      },
      description: "Request parameters for generating a collection from an OpenAPI specification.",
    },
    outputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The relative polling URL to check the task status. Append this to the base URL to monitor generation progress.",
        },
        taskId: {
          type: "string",
          description: "The unique identifier for the asynchronous generation task. Use this to poll the task status.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "generate_spec_from_collection",
    operationType: "write",
    description:
      "Tool to generate an API specification from a Postman collection. Use when you need to create an OpenAPI 3.0 specification from an existing collection. The operation is asynchronous and returns a task ID and polling URL to check the generation status.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "type", "name", "format"],
      properties: {
        name: {
          type: "string",
          description:
            "The name for the generated API specification. This will be used to identify the generated spec.",
        },
        type: {
          type: "string",
          const: "OPENAPI:3.0",
          description:
            "The specification type to generate. Must be 'OPENAPI:3.0' for OpenAPI 3.0 specification format.",
        },
        format: {
          enum: ["json", "yaml"],
          type: "string",
          description:
            "The format of the generated specification file. Choose 'json' for JSON format or 'yaml' for YAML format.",
        },
        element_type: {
          type: "string",
          const: "spec",
          default: "spec",
          description: "The type of element to generate. Valid value is 'spec' for API specification generation.",
        },
        collection_uid: {
          type: "string",
          description:
            "The unique identifier for the collection (UID format). This identifies the collection to generate the specification from.",
        },
      },
      description: "Request parameters for generating an API specification from a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The relative polling URL to check the task status. Append this to the base URL to monitor generation progress.",
        },
        taskId: {
          type: "string",
          description: "The unique identifier for the asynchronous task. Use this to poll the task status.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_accounts",
    operationType: "read",
    description:
      "Tool to retrieve Postman billing account details for the authenticated team. Use when you need to access account information such as account ID, team ID, account state, billing slots, sales channel, or billing email.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters to get Postman billing account details.",
    },
    outputSchema: {
      type: "object",
      properties: {
        slots: {
          type: "object",
          properties: {
            total: {
              type: "integer",
              description: "Total number of slots available in the account",
            },
            consumed: {
              type: "integer",
              description: "Number of slots currently consumed",
            },
            unbilled: {
              type: "integer",
              description: "Number of slots that are not yet billed",
            },
            available: {
              type: "integer",
              description: "Number of slots available for use",
            },
          },
          description: "Billing slot details showing total, unbilled, consumed, and available slots",
        },
        team_id: {
          type: "string",
          description: "Unique identifier for the team associated with this account",
        },
        account_id: {
          type: "string",
          description: "Unique identifier for the Postman account",
        },
        account_state: {
          type: "string",
          description: "Current state of the account (e.g., active, suspended)",
        },
        billing_email: {
          type: "string",
          description: "Email address used for billing communications",
        },
        sales_channel: {
          type: "string",
          description: "Sales channel through which the account was acquired",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_apis",
    operationType: "read",
    description:
      "Tool to get all APIs accessible to the authenticated user with optional workspace filtering. Use when you need to list or retrieve APIs from Postman. Returns an array of API objects with their IDs, names, summaries, and other metadata.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            "Filter by workspace ID to get APIs specific to a workspace. If not provided, returns all APIs accessible to the authenticated user.",
        },
      },
      description: "Request parameters for getting all APIs.",
    },
    outputSchema: {
      type: "object",
      properties: {
        apis: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the API",
              },
              name: {
                type: "string",
                description: "Name of the API",
              },
              summary: {
                type: "string",
                description: "A brief summary of the API",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the API was created",
              },
              created_by: {
                type: "string",
                description: "User ID of who created the API",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the API was last updated",
              },
              updated_by: {
                type: "string",
                description: "User ID of who last updated the API",
              },
              description: {
                type: "string",
                description: "A detailed description of the API",
              },
            },
            description: "Individual API information.",
          },
          description: "Array of API objects, each containing API details such as id, name, summary, and timestamps",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_api_releases",
    operationType: "read",
    description:
      "Tool to get all releases for a specific API version in Postman. Use when you need to list releases for an API version. Note: This endpoint is deprecated in Postman v10 and higher.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version",
        },
      },
      description: "Request parameters for getting all releases of an API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        releases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the release",
              },
              name: {
                type: "string",
                description: "Name of the release",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the release was created",
              },
              created_by: {
                type: "string",
                description: "User ID who created the release",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the release was last updated",
              },
              updated_by: {
                type: "string",
                description: "User ID who last updated the release",
              },
              release_notes: {
                type: "string",
                description: "Release notes describing changes in this release",
              },
            },
            description: "Individual release information.",
          },
          description: "Array of release objects for the specified API version",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_collections2",
    operationType: "read",
    description:
      "Tool to get all collections accessible to the authenticated user. Use when you need to retrieve all your collections including subscribed collections. Returns detailed information for each collection including owner, creation/update timestamps, and visibility.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            "Optional workspace ID to filter collections. Can be empty to get all collections across all workspaces.",
        },
      },
      description: "Request parameters for getting all collections.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the collection",
              },
              uid: {
                type: "string",
                description: "Unique identifier with team/user prefix",
              },
              name: {
                type: "string",
                description: "Name of the collection",
              },
              owner: {
                type: "string",
                description: "Owner of the collection",
              },
              isPublic: {
                type: "boolean",
                description: "Whether the collection is public",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the collection was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the collection was last updated",
              },
            },
            description: "Individual collection information.",
          },
          description:
            "Array of collection objects with detailed information including id, name, owner, timestamps, uid, and visibility status",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_environments",
    operationType: "read",
    description:
      "Tool to get all environments accessible to the authenticated user with optional workspace filtering. Use when you need to list or retrieve environments from Postman. Returns an array of environment objects with their IDs, names, and UIDs.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            "Filter by workspace ID to get environments specific to a workspace. If not provided, returns all environments accessible to the authenticated user.",
        },
      },
      description: "Request parameters for getting all environments.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the environment",
              },
              uid: {
                type: "string",
                description: "Unique identifier with team/user prefix",
              },
              name: {
                type: "string",
                description: "Name of the environment",
              },
            },
            description: "Individual environment information.",
          },
          description: "Array of environment objects, each containing id, name, and uid fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_forked_collections",
    operationType: "read",
    description:
      "Tool to retrieve all forked collections for the authenticated user. Use when you need to list or access all collections that the user has forked.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting all forked collections.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the forked collection",
              },
              uid: {
                type: "string",
                description: "Unique identifier for the collection in the form of teamId-collectionId",
              },
              fork: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description: "Reference to the source collection that was forked",
                  },
                  label: {
                    type: "string",
                    description: "Label or name of the fork",
                  },
                  createdAt: {
                    type: "string",
                    description: "ISO 8601 timestamp when the fork was created",
                  },
                },
                description: "Fork metadata including label, creation timestamp, and source collection reference",
              },
              name: {
                type: "string",
                description: "Name of the forked collection",
              },
              owner: {
                type: "string",
                description: "User ID of the collection owner",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the fork was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the fork was last updated",
              },
            },
            description: "Individual forked collection information.",
          },
          description: "Array of forked collection objects",
        },
        meta: {
          type: "object",
          properties: {
            total: {
              type: "integer",
              description: "Total number of forked collections",
            },
            nextCursor: {
              type: "string",
              description: "Cursor for pagination to fetch next set of results",
            },
            inaccessibleFork: {
              type: "integer",
              description: "Number of inaccessible forks",
            },
          },
          description: "Metadata about the response including total count and pagination cursor",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_groups",
    operationType: "read",
    description:
      "Tool to get all user groups in a Postman team. Use when you need to list all groups and their details including member counts and timestamps. Returns an array of group objects with their IDs, names, team IDs, user counts, and creation/update timestamps.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting all team groups.",
    },
    outputSchema: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the group",
              },
              name: {
                type: "string",
                description: "Name of the group",
              },
              teamId: {
                type: "string",
                description: "Identifier of the team this group belongs to",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 datetime string indicating when the group was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 datetime string indicating when the group was last updated",
              },
              userCount: {
                type: "integer",
                description: "Number of users in the group",
              },
            },
            description: "Individual group information.",
          },
          description:
            "Array of group objects, each containing group details such as id, name, teamId, userCount, and timestamps",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_linked_relations",
    operationType: "read",
    description:
      "Tool to retrieve all linked relations for a specific API version in Postman. Use when you need to discover what collections, documentation, mocks, or monitors are linked to an API version.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API. This is the API's ID returned when listing or creating APIs.",
        },
        api_version_id: {
          type: "string",
          description:
            "The unique identifier of the API version. This is the version ID returned when listing or creating API versions.",
        },
      },
      description: "Request parameters to get all linked relations for an API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        relations: {
          type: "object",
          properties: {
            mock: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of the relation",
                  },
                },
                description: "Individual relation item with ID and type.",
              },
              description: "Mock server relations for the API version",
            },
            monitor: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of the relation",
                  },
                },
                description: "Individual relation item with ID and type.",
              },
              description: "Monitor relations for the API version",
            },
            contracttest: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of the relation",
                  },
                },
                description: "Individual relation item with ID and type.",
              },
              description: "Contract test relations for the API version",
            },
            documentation: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of the relation",
                  },
                },
                description: "Individual relation item with ID and type.",
              },
              description: "Documentation relations for the API version",
            },
            integrationtest: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the related entity",
                  },
                  type: {
                    type: "string",
                    description: "Type of the relation",
                  },
                },
                description: "Individual relation item with ID and type.",
              },
              description: "Integration test relations for the API version",
            },
          },
          description:
            "Object containing all relation types (contracttest, integrationtest, documentation, mock, monitor) for the specified API version",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_mock_servers",
    operationType: "read",
    description:
      "Tool to get all active mock servers accessible to the authenticated user. Use when you need to list or retrieve mock servers from Postman. By default, returns only mock servers you created across all workspaces. Can be filtered by workspace ID to get mock servers specific to a workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            "Filter by workspace ID to get mock servers specific to a workspace. If not provided, returns all mock servers you created across all workspaces.",
        },
      },
      description: "Request parameters for getting all mock servers.",
    },
    outputSchema: {
      type: "object",
      properties: {
        mocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the mock server",
              },
              uid: {
                type: "string",
                description: "Unique identifier with team/user prefix",
              },
              name: {
                type: "string",
                description: "Name of the mock server",
              },
              owner: {
                type: "string",
                description: "User ID of the mock server owner",
              },
              mockUrl: {
                type: "string",
                description: "URL of the mock server that can be used to make requests",
              },
              isPublic: {
                type: "boolean",
                description:
                  "Whether the mock server is public (true) or private (false). Private mocks require API key authentication.",
              },
              collection: {
                type: "string",
                description: "Collection ID associated with this mock server",
              },
              environment: {
                type: "string",
                description: "Environment ID associated with this mock server (if applicable)",
              },
            },
            description: "Individual mock server information.",
          },
          description:
            "Array of mock server objects with details including id, name, uid, owner, collection, environment, mockUrl, and isPublic",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_monitors",
    operationType: "read",
    description:
      "Tool to get all monitors accessible to the authenticated user with optional workspace filtering. Use when you need to list or retrieve monitors from Postman. Returns an array of monitor objects with their IDs, names, and UIDs.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "string",
          description:
            "Filter by workspace ID to get monitors specific to a workspace. If not provided, returns all monitors accessible to the authenticated user.",
        },
      },
      description: "Request parameters for getting all monitors.",
    },
    outputSchema: {
      type: "object",
      properties: {
        monitors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the monitor",
              },
              uid: {
                type: "string",
                description: "Unique identifier with team/user prefix",
              },
              name: {
                type: "string",
                description: "Name of the monitor",
              },
            },
            description: "Individual monitor information.",
          },
          description: "Array of monitor objects, each containing id, name, and uid fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_specs",
    operationType: "read",
    description:
      "Tool to get all API specifications in a workspace. Use when you need to list or retrieve API specs from a specific Postman workspace. Returns an array of spec objects with their IDs, names, types, and timestamps, along with pagination metadata.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "The workspace ID to fetch API specifications from. This is required to retrieve specs for a specific workspace.",
        },
      },
      description: "Request parameters for getting all API specifications in a workspace.",
    },
    outputSchema: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            nextCursor: {
              type: "string",
              description: "Cursor for fetching the next page of results, null if no more pages",
            },
          },
          description: "Metadata including pagination cursor for fetching additional results",
        },
        specs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the specification",
              },
              name: {
                type: "string",
                description: "Name of the specification",
              },
              type: {
                type: "string",
                description: "Type of specification (e.g., 'OPENAPI:3.0')",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the spec was created",
              },
              createdBy: {
                type: "integer",
                description: "User ID who created the spec",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the spec was last updated",
              },
              updatedBy: {
                type: "integer",
                description: "User ID who last updated the spec",
              },
            },
            description: "Individual API specification information.",
          },
          description:
            "Array of specification objects, each containing spec details such as id, name, type, and timestamps",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_team_users",
    operationType: "read",
    description:
      "Tool to get information about all users on the Postman team. Use when you need to list all team members and their details including roles and join dates. Returns an array of user objects with their IDs, names, usernames, emails, roles, and join timestamps.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting all team users.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "Unique identifier of the user",
              },
              name: {
                type: "string",
                description: "Full name of the user",
              },
              email: {
                type: "string",
                description: "Email address of the user",
              },
              roles: {
                type: "array",
                items: {
                  type: "string",
                  description: "The Role value.",
                },
                description: "List of roles assigned to the user within the team",
              },
              joinedAt: {
                type: "string",
                description: "ISO 8601 datetime string indicating when the user joined the team",
              },
              username: {
                type: "string",
                description: "Username of the user",
              },
            },
            description: "Individual team user information.",
          },
          description:
            "Array of team user objects, each containing user details such as id, name, username, email, roles, and joinedAt timestamp",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_test_relations",
    operationType: "read",
    description:
      "Tool to retrieve all test relations for a specific API version. Use when you need to get test relations associated with an API version. Note: This endpoint is deprecated in Postman v10 and higher.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API.",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version.",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      properties: {
        test: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the test relation",
              },
              uid: {
                type: "string",
                description: "Unique identifier of the related entity",
              },
              name: {
                type: "string",
                description: "Name of the test relation",
              },
              type: {
                type: "string",
                description: "Type of the test relation",
              },
            },
            description: "Represents a single test relation item.",
          },
          description: "Array of test relations for the API version",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_versions",
    operationType: "read",
    description:
      "Tool to get all published versions of a specific API in Postman. Use when you need to list or retrieve version information for an API. Returns an array of version objects with their IDs and names.",
    inputSchema: {
      type: "object",
      required: ["api_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API whose versions you want to retrieve.",
        },
      },
      description: "Request parameters for getting all versions of an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        versions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the version",
              },
              name: {
                type: "string",
                description: "Name of the version",
              },
            },
            description: "Individual API version information.",
          },
          description: "Array of version objects, each containing id and name fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_all_workspaces",
    operationType: "read",
    description:
      "Tool to get all workspaces accessible to the authenticated user with optional type filtering. Use when you need to list or retrieve workspaces from Postman. Returns an array of workspace objects with their IDs, names, and types.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          enum: ["personal", "team", "public"],
          type: "string",
          description:
            "Filter by workspace type. Use 'personal' for personal workspaces, 'team' for team workspaces, or 'public' for public workspaces. If not provided, returns all workspaces accessible to the authenticated user.",
        },
      },
      description: "Request parameters for getting all workspaces.",
    },
    outputSchema: {
      type: "object",
      properties: {
        workspaces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the workspace",
              },
              name: {
                type: "string",
                description: "Name of the workspace",
              },
              type: {
                type: "string",
                description: "Type of the workspace (personal, team, or public)",
              },
            },
            description: "Individual workspace information.",
          },
          description: "Array of workspace objects, each containing id, name, and type fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_an_api",
    operationType: "read",
    description:
      "Tool to retrieve information about a specific API in Postman. Use when you need to fetch API details including name, description, versions, and schemas.",
    inputSchema: {
      type: "object",
      required: ["api_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API to retrieve",
        },
      },
      description: "Request model for getting information about a specific API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        api: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the API",
            },
            name: {
              type: "string",
              description: "The name of the API",
            },
            team: {
              type: "string",
              description: "The team ID associated with this API",
            },
            summary: {
              type: "string",
              description: "A brief summary of the API",
            },
            versions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "The unique identifier of the API version",
                  },
                  name: {
                    type: "string",
                    description: "The name of the API version",
                  },
                  schemas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: {
                          type: "string",
                          description: "The unique identifier of the schema",
                        },
                        type: {
                          type: "string",
                          description: "The type of schema (e.g., 'openapi:3')",
                        },
                      },
                      description: "Schema information within an API version.",
                    },
                    description: "List of schemas associated with this version",
                  },
                },
                description: "Version information for an API.",
              },
              description: "List of versions associated with this API",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the API was created",
            },
            created_by: {
              type: "string",
              description: "User ID of who created the API",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the API was last updated",
            },
            updated_by: {
              type: "string",
              description: "User ID of who last updated the API",
            },
            description: {
              type: "string",
              description: "A detailed description of the API",
            },
          },
          description: "The API object with all details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_an_apis_comments",
    operationType: "read",
    description:
      "Tool to retrieve all comments left by users in an API. Use when you need to fetch all comments associated with a specific API.",
    inputSchema: {
      type: "object",
      required: ["api_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The API's unique identifier (UUID). This identifies the API to retrieve comments from.",
        },
      },
      description: "Request parameters to get all comments from an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "The comment's unique ID",
              },
              user: {
                type: "object",
                properties: {
                  id: {
                    type: "integer",
                    description: "The user's unique ID",
                  },
                  username: {
                    type: "string",
                    description: "The user's username",
                  },
                },
                description: "Information about the user who created the comment",
              },
              content: {
                type: "string",
                description: "The comment's content/text",
              },
              user_id: {
                type: "integer",
                description: "The ID of the user who created the comment",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was created",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was last updated",
              },
            },
            description: "Individual comment object.",
          },
          description: "Array of comment objects left by users in the API",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_an_api_version",
    operationType: "read",
    description:
      "Tool to get information about a specific API version in Postman. Use when you need to retrieve details about a particular version of an API. Returns version details including ID, name, creation date, and associated schemas.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API.",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version to retrieve.",
        },
      },
      description: "Request parameters for getting a specific API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        version: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the version",
            },
            api: {
              type: "string",
              description: "The API ID this version belongs to",
            },
            name: {
              type: "string",
              description: "Name of the version",
            },
            schema: {
              type: "array",
              items: {
                type: "string",
                description: "The Schema value.",
              },
              description: "Array of schema IDs associated with this version",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the version was created",
            },
            createdBy: {
              type: "string",
              description: "User ID who created the version",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the version was last updated",
            },
            updatedBy: {
              type: "string",
              description: "User ID who last updated the version",
            },
          },
          description: "The version object containing all details about the API version",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_an_environment",
    operationType: "read",
    description:
      "Tool to retrieve detailed information about a specific environment in Postman. Use when you need to fetch environment details including name, ID, owner, and all environment variables.",
    inputSchema: {
      type: "object",
      required: ["environment_id"],
      properties: {
        environment_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the environment to retrieve",
        },
      },
      description: "Request model for getting information about a specific environment.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the environment",
            },
            uid: {
              type: "string",
              description: "The unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "The name of the environment",
            },
            owner: {
              type: "string",
              description: "User ID of the environment owner",
            },
            values: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: {
                    type: "string",
                    description: "The name of the environment variable",
                  },
                  type: {
                    type: "string",
                    description: "The type of the environment variable (e.g., 'default', 'secret')",
                  },
                  value: {
                    type: "string",
                    description: "The value of the environment variable",
                  },
                  enabled: {
                    type: "boolean",
                    description: "Whether the environment variable is enabled",
                  },
                },
                description: "Individual environment variable within the environment.",
              },
              description: "Array of environment variable objects with key, value, type, and enabled fields",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the environment was created",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the environment was last updated",
            },
          },
          description: "The environment object with all details including variables",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_an_environments_forks",
    operationType: "read",
    description:
      "Tool to retrieve all forked environments for a specific environment. Use when you need to list all environments that have been forked from a particular environment.",
    inputSchema: {
      type: "object",
      required: ["environment_uid"],
      properties: {
        environment_uid: {
          type: "string",
          description: "The environment's unique identifier (UID)",
        },
      },
      description: "Request parameters for getting an environment's forked environments.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the forked environment",
              },
              uid: {
                type: "string",
                description: "Unique identifier for the environment in the form of teamId-environmentId",
              },
              fork: {
                type: "object",
                description: "Fork metadata including label, creation timestamp, and source environment reference",
                additionalProperties: {
                  type: "string",
                  description: "The Fork item value.",
                },
              },
              name: {
                type: "string",
                description: "Name of the forked environment",
              },
              owner: {
                type: "string",
                description: "User ID of the environment owner",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the fork was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the fork was last updated",
              },
            },
            description: "Individual forked environment information.",
          },
          description: "Array of forked environment objects",
        },
        meta: {
          type: "object",
          properties: {
            total: {
              type: "integer",
              description: "Total number of forked environments",
            },
            nextCursor: {
              type: "string",
              description: "Cursor for pagination to fetch next set of results",
            },
          },
          description: "Metadata about the response including total count and pagination cursor",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_async_collection_update_status",
    operationType: "read",
    description:
      "Tool to get the status of an asynchronous collection update task. Use when you need to check whether a previously initiated async collection update is still processing, has completed successfully, or has failed. The task ID is obtained from PUT /collections/{collectionId} endpoint when using the Prefer: respond-async header.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: {
          type: "string",
          description:
            "The ID of the collection update task. Obtained from PUT /collections/{collectionId} with Prefer: respond-async header.",
        },
      },
      description: "Request parameters to get the status of an asynchronous collection update task.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The task ID",
        },
        status: {
          type: "string",
          description:
            "Current status of the collection update task. Possible values: 'successful', 'failed', 'in-progress'",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_authenticated_user",
    operationType: "read",
    description:
      "Tool to get information about the authenticated user. Use when you need to retrieve details about the current authenticated user, including their user ID, username, and email address.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting authenticated user information.",
    },
    outputSchema: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Unique identifier of the authenticated user",
            },
            email: {
              type: "string",
              description: "Email address of the authenticated user",
            },
            roles: {
              type: "array",
              items: {
                type: "string",
                description: "The Role value.",
              },
              description: "List of roles assigned to the user",
            },
            avatar: {
              type: "string",
              description: "Avatar URL of the authenticated user",
            },
            teamId: {
              type: "integer",
              description: "Team ID the user belongs to",
            },
            fullName: {
              type: "string",
              description: "Full name of the authenticated user",
            },
            isPublic: {
              type: "boolean",
              description: "Whether the user's profile is public",
            },
            teamName: {
              type: "string",
              description: "Name of the team the user belongs to",
            },
            username: {
              type: "string",
              description: "Username of the authenticated user",
            },
            teamDomain: {
              type: "string",
              description: "Domain of the team the user belongs to",
            },
          },
          description: "Object containing the authenticated user's details including ID, username, and email",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_collections_comments",
    operationType: "read",
    description:
      "Tool to retrieve all comments left by users in an API's collection. Use when you need to fetch all comments associated with a specific collection within an API.",
    inputSchema: {
      type: "object",
      required: ["api_id", "collection_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The API's unique identifier (UUID). This identifies the API containing the collection.",
        },
        collection_id: {
          type: "string",
          description:
            "The collection's unique identifier (UUID). This identifies the specific collection to retrieve comments from.",
        },
      },
      description: "Request parameters to get all comments from an API's collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "The comment's unique ID",
              },
              user: {
                type: "object",
                properties: {
                  id: {
                    type: "integer",
                    description: "The user's unique ID",
                  },
                  username: {
                    type: "string",
                    description: "The user's username",
                  },
                },
                description: "Information about the user who created the comment",
              },
              content: {
                type: "string",
                description: "The comment's content/text",
              },
              user_id: {
                type: "integer",
                description: "The ID of the user who created the comment",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was created",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was last updated",
              },
            },
            description: "Individual comment object.",
          },
          description: "Array of comment objects left by users in the collection",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_collections_forks",
    operationType: "read",
    description:
      "Tool to get all forks of a specific collection. Use when you need to retrieve information about who has forked a collection, including fork IDs, users, and creation dates.",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        collection_id: {
          type: "string",
          description: "The unique identifier (UUID) of the collection whose forks you want to retrieve",
        },
      },
      description: "Request parameters for getting a collection's forks.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the forked collection",
              },
              uid: {
                type: "string",
                description: "Unique identifier for the collection in the form of teamId-collectionId",
              },
              fork: {
                type: "object",
                properties: {
                  from: {
                    type: "string",
                    description: "Reference to the source collection that was forked",
                  },
                  label: {
                    type: "string",
                    description: "Label or name of the fork",
                  },
                  createdAt: {
                    type: "string",
                    description: "ISO 8601 timestamp when the fork was created",
                  },
                },
                description: "Fork metadata including label, creation timestamp, and source collection reference",
              },
              name: {
                type: "string",
                description: "Name of the forked collection",
              },
              owner: {
                type: "string",
                description: "User ID of the collection owner who forked it",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the fork was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the fork was last updated",
              },
            },
            description: "Individual fork information.",
          },
          description: "Array of fork objects, each containing fork ID, user who forked it, and creation date",
        },
        meta: {
          type: "object",
          properties: {
            total: {
              type: "integer",
              description: "Total number of forks for this collection",
            },
            nextCursor: {
              type: "string",
              description: "Cursor for pagination to fetch next set of results",
            },
          },
          description: "Metadata about the response including total count and pagination cursor",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_collections_pull_requests",
    operationType: "read",
    description:
      "Tool to get information about a collection's pull requests including source and destination IDs, status, and URLs. Use when you need to retrieve pull request details for a specific collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid"],
      properties: {
        collection_uid: {
          type: "string",
          description:
            "The unique identifier for the collection in the format {owner}-{collectionId}. This identifies the collection to retrieve pull requests from.",
        },
      },
      description: "Request parameters for getting pull requests from a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the pull request",
              },
              url: {
                type: "string",
                description: "URL link to view the pull request details",
              },
              title: {
                type: "string",
                description: "Title of the pull request",
              },
              source: {
                type: "string",
                description: "Source collection ID where the changes originate",
              },
              status: {
                type: "string",
                description: "Current status of the pull request (e.g., 'open', 'merged', 'declined', 'closed')",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the pull request was created",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the pull request was last updated",
              },
              description: {
                type: "string",
                description: "Description or details about the pull request",
              },
              destination: {
                type: "string",
                description: "Destination collection ID where the changes will be merged",
              },
            },
            description: "Individual pull request information.",
          },
          description:
            "Array of pull request objects for the collection, containing source and destination IDs, status, and URLs",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_collections_roles",
    operationType: "read",
    description:
      "Tool to get information about all roles in a collection. Use when you need to retrieve the IDs of all users, teams, and groups with access to view or edit a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection to retrieve roles for",
        },
      },
      description: "Request model for getting roles information for a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        team: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "Team ID",
              },
              role: {
                type: "string",
                description: "Role type assigned to the team (e.g., EDITOR, VIEWER)",
              },
            },
            description: "Team role information with access to the collection.",
          },
          description: "Array of team roles with access to the collection",
        },
        user: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "User ID",
              },
              role: {
                type: "string",
                description: "Role type assigned to the user (e.g., EDITOR, VIEWER)",
              },
            },
            description: "User role information with access to the collection.",
          },
          description: "Array of user roles with access to the collection",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_folder",
    operationType: "read",
    description:
      "Tool to retrieve information about a folder in a Postman collection. Use when you need to fetch details about a specific folder including its name, description, owner, and timestamps.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "folder_id"],
      properties: {
        folder_id: {
          type: "string",
          description:
            "The unique identifier of the folder to retrieve. Note: folder IDs should not contain spaces to avoid 404 errors.",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the folder",
        },
      },
      description: "Request model for getting information about a folder in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the folder",
            },
            name: {
              type: "string",
              description: "The name of the folder",
            },
            order: {
              type: "array",
              items: {
                type: "string",
                description: "The Order value.",
              },
              description: "Array of request IDs in the folder's display order",
            },
            owner: {
              type: "string",
              description: "The owner ID of the folder",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the folder was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the folder was last updated",
            },
            collection: {
              type: "string",
              description: "The collection ID containing this folder",
            },
            description: {
              type: "string",
              description: "The description of the folder",
            },
            foldersOrder: {
              type: "array",
              items: {
                type: "string",
                description: "The Folders Order value.",
              },
              description: "Array of subfolder IDs in the folder's display order",
            },
            lastUpdatedBy: {
              type: "string",
              description: "User ID who last updated the folder",
            },
          },
          description: "Data about the folder",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
          },
          description: "Metadata about the folder operation",
        },
        model_id: {
          type: "string",
          description: "The model ID of the folder",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_folders_comments",
    operationType: "read",
    description:
      "Tool to retrieve all comments left by users in a folder. Use when you need to fetch all comments associated with a specific folder within a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "folder_uid"],
      properties: {
        folder_uid: {
          type: "string",
          description: "The folder's unique ID (UID). This identifies the specific folder to retrieve comments from.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the folder.",
        },
      },
      description: "Request parameters to get all comments from a folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "The comment's unique ID",
              },
              body: {
                type: "string",
                description: "The comment's text content",
              },
              status: {
                type: "string",
                description: "The comment's status (e.g., 'Open', 'Resolved')",
              },
              thread_id: {
                type: "integer",
                description: "The thread ID this comment belongs to",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was created",
              },
              created_by: {
                type: "integer",
                description: "The ID of the user who created the comment",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was last updated",
              },
            },
            description: "Individual comment object for a folder.",
          },
          description: "Array of comment objects left by users in the folder",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_monitor",
    operationType: "read",
    description:
      "Tool to retrieve information about a specific monitor in Postman. Use when you need to fetch monitor details including schedule, collection, environment, and run status.",
    inputSchema: {
      type: "object",
      required: ["monitor_id"],
      properties: {
        monitor_id: {
          type: "string",
          description: "The unique identifier of the monitor to retrieve",
        },
      },
      description: "Request model for getting information about a specific monitor.",
    },
    outputSchema: {
      type: "object",
      properties: {
        monitor: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the monitor",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "The name of the monitor",
            },
            owner: {
              anyOf: [
                {
                  type: "string",
                  description: "The Owner option 1 value.",
                },
                {
                  type: "integer",
                  description: "The Owner option 2 value.",
                },
              ],
              description: "User ID of the monitor owner",
            },
            active: {
              type: "boolean",
              description: "Whether the monitor is active",
            },
            lastRun: {
              type: "object",
              properties: {
                stats: {
                  type: "object",
                  description: "Statistics from the last run",
                  additionalProperties: {
                    anyOf: [
                      {
                        type: "string",
                        description: "The Stats item option 1 value.",
                      },
                      {
                        type: "integer",
                        description: "The Stats item option 2 value.",
                      },
                      {
                        type: "number",
                        description: "The Stats item option 3 value.",
                      },
                    ],
                    description: "The Stats item value.",
                  },
                },
                status: {
                  type: "string",
                  description: "Status of the last run (e.g., 'success', 'failure')",
                },
                startedAt: {
                  type: "string",
                  description: "ISO 8601 timestamp when the last run started",
                },
                finishedAt: {
                  type: "string",
                  description: "ISO 8601 timestamp when the last run finished",
                },
              },
              description: "Information about the monitor's last run",
            },
            options: {
              type: "object",
              properties: {
                strictSSL: {
                  type: "boolean",
                  description: "Whether to enforce strict SSL certificate validation",
                },
                requestDelay: {
                  type: "integer",
                  description: "Delay between requests in milliseconds",
                },
                requestTimeout: {
                  type: "integer",
                  description: "Request timeout in milliseconds",
                },
                followRedirects: {
                  type: "boolean",
                  description: "Whether to follow HTTP redirects",
                },
              },
              description: "Additional configuration options",
            },
            schedule: {
              type: "object",
              properties: {
                cron: {
                  type: "string",
                  description: "Cron expression defining when the monitor runs",
                },
                nextRun: {
                  type: "string",
                  description: "ISO 8601 timestamp of the next scheduled run",
                },
                timezone: {
                  type: "string",
                  description: "Timezone for the schedule (e.g., 'America/New_York')",
                },
              },
              description: "Schedule configuration for the monitor",
            },
            distribution: {
              type: "array",
              items: {
                type: "string",
                description: "The Distribution value.",
              },
              description: "List of regions where the monitor runs",
            },
            collectionUid: {
              type: "string",
              description: "UID of the collection being monitored",
            },
            notifications: {
              type: "object",
              properties: {
                onError: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: true,
                    description: "The On Error object.",
                  },
                  description: "Notification settings triggered on monitor errors",
                },
                onFailure: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: true,
                    description: "The On Failure object.",
                  },
                  description: "Notification settings triggered on monitor failures",
                },
              },
              description: "Notification settings for the monitor",
            },
            environmentUid: {
              type: "string",
              description: "UID of the environment used by the monitor",
            },
          },
          description: "The monitor object with all details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_request",
    operationType: "read",
    description:
      "Tool to retrieve information about a specific request in a Postman collection. Use when you need to fetch details about a request including its method, URL, headers, body, authentication, and associated scripts.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "request_id"],
      properties: {
        request_id: {
          type: "string",
          description: "The unique identifier of the request to retrieve",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the request",
        },
      },
      description: "Request model for getting information about a request in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the request",
            },
            url: {
              anyOf: [
                {
                  type: "string",
                  description: "The Url option 1 value.",
                },
                {
                  type: "object",
                  properties: {
                    raw: {
                      type: "string",
                      description: "The complete URL as a string",
                    },
                    host: {
                      type: "array",
                      items: {
                        type: "string",
                        description: "The Host value.",
                      },
                      description: "List of host components",
                    },
                    path: {
                      type: "array",
                      items: {
                        type: "string",
                        description: "The Path value.",
                      },
                      description: "List of path segments",
                    },
                    query: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: {
                          anyOf: [
                            {
                              type: "string",
                              description: "The Query item option 1 value.",
                            },
                            {
                              type: "boolean",
                              description: "The Query item option 2 value.",
                            },
                          ],
                          description: "The Query item value.",
                        },
                        description: "The Query object.",
                      },
                      description: "List of query parameters",
                    },
                    protocol: {
                      type: "string",
                      description: "The protocol (e.g., 'https')",
                    },
                  },
                  description: "URL information for the request.",
                },
              ],
              description: "The URL of the request, either as a string or detailed URL object",
            },
            auth: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "The authentication type (e.g., 'apikey', 'bearer', 'basic')",
                },
                basic: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Basic item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Basic item option 2 value.",
                        },
                      ],
                      description: "The Basic item value.",
                    },
                    description: "The Basic object.",
                  },
                  description: "Basic authentication details",
                },
                apikey: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Apikey item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Apikey item option 2 value.",
                        },
                      ],
                      description: "The Apikey item value.",
                    },
                    description: "The Apikey object.",
                  },
                  description: "API key authentication details",
                },
                bearer: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Bearer item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Bearer item option 2 value.",
                        },
                      ],
                      description: "The Bearer item value.",
                    },
                    description: "The Bearer object.",
                  },
                  description: "Bearer token authentication details",
                },
              },
              description: "Authentication configuration for the request",
            },
            body: {
              type: "object",
              properties: {
                raw: {
                  type: "string",
                  description: "Raw body content",
                },
                mode: {
                  type: "string",
                  description: "The body mode (e.g., 'raw', 'urlencoded', 'formdata')",
                },
                formdata: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Formdata item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Formdata item option 2 value.",
                        },
                      ],
                      description: "The Formdata item value.",
                    },
                    description: "The Formdata object.",
                  },
                  description: "Form-data body parameters",
                },
                urlencoded: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Urlencoded item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Urlencoded item option 2 value.",
                        },
                      ],
                      description: "The Urlencoded item value.",
                    },
                    description: "The Urlencoded object.",
                  },
                  description: "URL-encoded body parameters",
                },
              },
              description: "Request body information",
            },
            name: {
              type: "string",
              description: "The name of the request",
            },
            owner: {
              type: "string",
              description: "The owner ID of the request",
            },
            events: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  listen: {
                    type: "string",
                    description: "Event type (e.g., 'prerequest', 'test')",
                  },
                  script: {
                    type: "object",
                    description: "Script details including type and code",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Script item option 1 value.",
                        },
                        {
                          type: "array",
                          items: {
                            type: "string",
                            description: "The Script item option 2 value.",
                          },
                          description: "The list of script item option 2 values.",
                        },
                      ],
                      description: "The Script item value.",
                    },
                  },
                },
                description: "Event information (pre-request script or test script).",
              },
              description: "List of events (pre-request scripts, test scripts)",
            },
            folder: {
              type: "string",
              description: "The folder ID this request belongs to, if any",
            },
            header: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Header item option 1 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Header item option 2 value.",
                    },
                  ],
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "List of headers for the request",
            },
            method: {
              type: "string",
              description: "The HTTP method (e.g., 'GET', 'POST', 'PUT', 'DELETE')",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the request was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the request was last updated",
            },
            collection: {
              type: "string",
              description: "The collection ID this request belongs to",
            },
            description: {
              type: "string",
              description: "Description of the request",
            },
            lastRevision: {
              type: "integer",
              description: "The revision number of the request",
            },
            lastUpdatedBy: {
              type: "string",
              description: "User ID who last updated the request",
            },
          },
          description: "Data about the request",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
            populate: {
              type: "boolean",
              description: "Whether to populate additional fields",
            },
            changeset: {
              type: "boolean",
              description: "Whether changeset is enabled",
            },
          },
          description: "Metadata about the request operation",
        },
        model_id: {
          type: "string",
          description: "The model ID of the request",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_requests_comments",
    operationType: "read",
    description:
      "Tool to retrieve all comments left by users in a request. Use when you need to fetch all comments associated with a specific request within a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "request_uid"],
      properties: {
        request_uid: {
          type: "string",
          description: "The request's unique ID (UID). This identifies the specific request to retrieve comments from.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the request.",
        },
      },
      description: "Request parameters to get all comments from a request.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "The comment's unique ID",
              },
              body: {
                type: "string",
                description: "The comment's text content",
              },
              status: {
                type: "string",
                description: "The comment's status (e.g., 'Open', 'Resolved')",
              },
              thread_id: {
                type: "integer",
                description: "The thread ID this comment belongs to",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was created",
              },
              created_by: {
                type: "integer",
                description: "The ID of the user who created the comment",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was last updated",
              },
            },
            description: "Individual comment object for a request.",
          },
          description: "Array of comment objects left by users in the request",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_response",
    operationType: "read",
    description:
      "Tool to retrieve information about a saved response in a Postman collection. Use when you need to fetch details about a specific response including status, headers, body, and metadata.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "response_id"],
      properties: {
        response_id: {
          type: "string",
          description: "The unique identifier of the response to retrieve",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the response",
        },
      },
      description: "Request model for getting information about a response in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the response",
            },
            mime: {
              type: "string",
              description: "The MIME type of the response",
            },
            name: {
              type: "string",
              description: "The name of the response",
            },
            text: {
              type: "string",
              description: "The response body text",
            },
            time: {
              type: "integer",
              description: "The response time in milliseconds",
            },
            owner: {
              type: "string",
              description: "The owner ID of the response",
            },
            status: {
              type: "string",
              description: "The status text of the response",
            },
            cookies: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Cookie item option 1 value.",
                    },
                    {
                      type: "integer",
                      description: "The Cookie item option 2 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Cookie item option 3 value.",
                    },
                  ],
                  description: "The Cookie item value.",
                },
                description: "The Cookie object.",
              },
              description: "List of cookies in the response",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Header item option 1 value.",
                    },
                    {
                      type: "integer",
                      description: "The Header item option 2 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Header item option 3 value.",
                    },
                  ],
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "List of response headers",
            },
            request: {
              type: "string",
              description: "The request ID associated with this response",
            },
            language: {
              type: "string",
              description: "The language of the response",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the response was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the response was last updated",
            },
            rawDataType: {
              type: "string",
              description: "The raw data type of the response",
            },
            lastRevision: {
              type: "integer",
              description: "The revision number of the response",
            },
            responseCode: {
              type: "integer",
              description: "The HTTP response code",
            },
            lastUpdatedBy: {
              type: "string",
              description: "User ID who last updated the response",
            },
            requestObject: {
              type: "object",
              description: "The request object associated with this response",
              additionalProperties: {
                anyOf: [
                  {
                    type: "string",
                    description: "The Request Object item option 1 value.",
                  },
                  {
                    type: "integer",
                    description: "The Request Object item option 2 value.",
                  },
                  {
                    type: "boolean",
                    description: "The Request Object item option 3 value.",
                  },
                  {
                    type: "array",
                    items: {
                      description: "The Request Object item option 4 value.",
                    },
                    description: "The list of request object item option 4 values.",
                  },
                  {
                    type: "object",
                    additionalProperties: true,
                    description: "The Request Object item option 5 object.",
                  },
                ],
                description: "The Request Object item value.",
              },
            },
          },
          description: "Data about the response",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
            populate: {
              type: "boolean",
              description: "Whether to populate additional fields",
            },
            changeset: {
              type: "boolean",
              description: "Whether changeset is enabled",
            },
          },
          description: "Metadata about the response operation",
        },
        model_id: {
          type: "string",
          description: "The model ID of the response",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_responses_comments",
    operationType: "read",
    description:
      "Tool to retrieve all comments left by users in a response. Use when you need to fetch all comments associated with a specific response within a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "response_uid"],
      properties: {
        response_uid: {
          type: "string",
          description:
            "The response's unique ID (UID). This identifies the specific response to retrieve comments from.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the response.",
        },
      },
      description: "Request parameters to get all comments from a response.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "integer",
                description: "The comment's unique ID",
              },
              body: {
                type: "string",
                description: "The comment's text content",
              },
              status: {
                type: "string",
                description: "The comment's status (e.g., 'Open', 'Resolved')",
              },
              thread_id: {
                type: "integer",
                description: "The thread ID this comment belongs to",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was created",
              },
              created_by: {
                type: "integer",
                description: "The ID of the user who created the comment",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the comment was last updated",
              },
            },
            description: "Individual comment object for a response.",
          },
          description: "Array of comment objects left by users in the response",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_schema",
    operationType: "read",
    description:
      "Tool to retrieve information about an API schema from Postman. Use when you need to fetch schema details for a specific API. Optionally specify a version ID to get a schema published in a specific API version.",
    inputSchema: {
      type: "object",
      required: ["api_id", "schema_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The API's unique identifier",
        },
        schema_id: {
          type: "string",
          description: "The schema's unique identifier",
        },
        version_id: {
          type: "string",
          description: "Optional. The API version ID to get a schema published in a specific API version",
        },
      },
      description: "Request model for retrieving schema information from an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The schema's unique ID",
        },
        type: {
          type: "string",
          description: "The schema type (e.g., 'openapi:3')",
        },
        files: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the file",
                  },
                  name: {
                    type: "string",
                    description: "Name of the file",
                  },
                  path: {
                    type: "string",
                    description: "Path of the file",
                  },
                  root: {
                    type: "object",
                    description: "Root object of the file",
                    additionalProperties: true,
                  },
                  created_at: {
                    type: "string",
                    description: "ISO 8601 timestamp when the file was created",
                  },
                  created_by: {
                    type: "string",
                    description: "User ID who created the file",
                  },
                  updated_at: {
                    type: "string",
                    description: "ISO 8601 timestamp when the file was last updated",
                  },
                  updated_by: {
                    type: "string",
                    description: "User ID who last updated the file",
                  },
                },
                description: "Schema file information.",
              },
              description: "List of schema files",
            },
            meta: {
              type: "object",
              properties: {},
              description: "Metadata about the files",
            },
          },
          description: "Schema files information",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the schema was created",
        },
        created_by: {
          type: "string",
          description: "User ID who created the schema",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the schema was last updated",
        },
        updated_by: {
          type: "string",
          description: "User ID who last updated the schema",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_spec",
    operationType: "read",
    description:
      "Tool to retrieve information about an API specification in Postman. Use when you need to fetch spec details including name, type, and timestamps.",
    inputSchema: {
      type: "object",
      required: ["spec_id"],
      properties: {
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification to retrieve. This is a UUID format string.",
        },
      },
      description: "Request model for getting information about an API specification.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier of the specification",
        },
        name: {
          type: "string",
          description: "Name of the specification",
        },
        type: {
          type: "string",
          description: "Type of specification (e.g., 'OPENAPI:3.0')",
        },
        createdAt: {
          type: "string",
          description: "ISO 8601 timestamp when the spec was created",
        },
        createdBy: {
          type: "integer",
          description: "User ID who created the spec",
        },
        updatedAt: {
          type: "string",
          description: "ISO 8601 timestamp when the spec was last updated",
        },
        updatedBy: {
          type: "integer",
          description: "User ID who last updated the spec",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_specs_definition",
    operationType: "read",
    description:
      "Tool to get the complete contents of an API specification's definition. Use when you need to retrieve the full OpenAPI/Swagger specification content for a spec. Returns the raw definition content as a string.",
    inputSchema: {
      type: "object",
      required: ["spec_id"],
      properties: {
        spec_id: {
          type: "string",
          description:
            "The unique identifier of the API specification to retrieve the definition for. This is a UUID format string.",
        },
      },
      description: "Request model for getting an API specification's definition.",
    },
    outputSchema: {
      type: "object",
      properties: {
        definition: {
          type: "string",
          description:
            "The complete API specification definition content in YAML or JSON format (OpenAPI spec content)",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_specs_files",
    operationType: "read",
    description:
      "Tool to retrieve all files in an API specification from Postman. Use when you need to list or view specification files for a specific spec ID. Returns file metadata including IDs, names, paths, types, and timestamps.",
    inputSchema: {
      type: "object",
      required: ["spec_id"],
      properties: {
        spec_id: {
          type: "string",
          description:
            "The ID of the API specification whose files you want to retrieve. This is the unique identifier for the specification.",
        },
      },
      description: "Request model for retrieving files in an API specification.",
    },
    outputSchema: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            next_cursor: {
              type: "string",
              description: "Cursor for fetching the next page of results. Returns null if no more pages exist.",
            },
          },
          description: "Pagination metadata including cursor for next page",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the specification file",
              },
              name: {
                type: "string",
                description: "Name of the specification file",
              },
              path: {
                type: "string",
                description: "File path within the specification structure",
              },
              type: {
                type: "string",
                description: "Type of the specification file",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the file was created",
              },
              created_by: {
                type: "integer",
                description: "User ID of the person who created the file",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the file was last updated",
              },
              updated_by: {
                type: "integer",
                description: "User ID of the person who last updated the file",
              },
            },
            description: "Specification file metadata.",
          },
          description:
            "Array of specification file objects with metadata including ID, name, path, type, and timestamps",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_specs_generated_collections",
    operationType: "read",
    description:
      "Tool to retrieve all collections generated from an API specification in Postman. Use when you need to fetch collections that have been auto-generated from a spec. Returns metadata and an array of generated collections.",
    inputSchema: {
      type: "object",
      required: ["spec_id"],
      properties: {
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification",
        },
        element_type: {
          type: "string",
          default: "collection",
          description: "The type of element to retrieve generations for. Valid value: 'collection'",
        },
      },
      description: "Request model for getting all of an API specification's generated collections.",
    },
    outputSchema: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            nextCursor: {
              type: "string",
              description: "Cursor for pagination. If present, use this value to fetch the next page of results.",
            },
          },
          description: "Metadata about the response including pagination information",
        },
        collections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the generated collection",
              },
              uid: {
                type: "string",
                description: "Universal identifier of the collection",
              },
              name: {
                type: "string",
                description: "Name of the generated collection",
              },
              owner: {
                type: "string",
                description: "Owner of the collection",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the collection was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the collection was last updated",
              },
            },
            description: "Individual generated collection object.",
          },
          description:
            "Array of generated collections from the specification. May be empty if no collections have been generated.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_spec_file",
    operationType: "read",
    description:
      "Tool to get the contents of an API specification's file. Use when you need to retrieve the actual content and metadata of a specific file within a spec.",
    inputSchema: {
      type: "object",
      required: ["spec_id", "file_path"],
      properties: {
        spec_id: {
          type: "string",
          description: "The ID of the API specification",
        },
        file_path: {
          type: "string",
          description: "The path of the file within the spec (e.g., 'openapi.yaml', 'components/schemas.yaml')",
        },
      },
      description: "Request model for getting a spec file's contents.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the file",
        },
        name: {
          type: "string",
          description: "The name of the file",
        },
        path: {
          type: "string",
          description: "The path of the file within the specification",
        },
        type: {
          type: "string",
          description: "The type of file (e.g., 'ROOT')",
        },
        content: {
          type: "string",
          description: "The file contents",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was created",
        },
        created_by: {
          type: "integer",
          description: "User ID who created the file",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was last updated",
        },
        updated_by: {
          type: "integer",
          description: "User ID who last updated the file",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_team_user",
    operationType: "read",
    description:
      "Tool to get information about a user on the Postman team. Use when you need to retrieve details about a specific team member including their ID, name, email, roles, and join date.",
    inputSchema: {
      type: "object",
      required: ["user_id"],
      properties: {
        user_id: {
          type: "integer",
          description: "The ID of the user to retrieve information about",
        },
      },
      description: "Request parameters for getting a team user's information.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description: "User ID",
        },
        name: {
          type: "string",
          description: "User's full name",
        },
        email: {
          type: "string",
          description: "User's email address",
        },
        roles: {
          type: "array",
          items: {
            type: "string",
            description: "The Role value.",
          },
          description: "Array of roles assigned to the user (e.g., admin, billing, user, community-manager)",
        },
        joinedAt: {
          type: "string",
          description: "ISO 8601 timestamp of when the user joined the team",
        },
        username: {
          type: "string",
          description: "User's username",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_workspace",
    operationType: "read",
    description:
      "Tool to get detailed information about a specific workspace by its ID. Use when you need to retrieve the complete structure of a workspace including all collections, environments, APIs, mocks, and monitors.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "The unique identifier of the workspace to retrieve",
        },
      },
      description: "Request parameters for getting a single workspace.",
    },
    outputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the workspace",
            },
            apis: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the API",
                  },
                  uid: {
                    type: "string",
                    description: "Unique identifier with team/user prefix",
                  },
                  name: {
                    type: "string",
                    description: "Name of the API",
                  },
                },
                description: "API information within a workspace.",
              },
              description: "Array of APIs in the workspace",
            },
            name: {
              type: "string",
              description: "Name of the workspace",
            },
            type: {
              type: "string",
              description: "Type of the workspace (personal, team, or public)",
            },
            mocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the mock server",
                  },
                  uid: {
                    type: "string",
                    description: "Unique identifier with team/user prefix",
                  },
                  name: {
                    type: "string",
                    description: "Name of the mock server",
                  },
                },
                description: "Mock server information within a workspace.",
              },
              description: "Array of mock servers in the workspace",
            },
            monitors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the monitor",
                  },
                  uid: {
                    type: "string",
                    description: "Unique identifier with team/user prefix",
                  },
                  name: {
                    type: "string",
                    description: "Name of the monitor",
                  },
                },
                description: "Monitor information within a workspace.",
              },
              description: "Array of monitors in the workspace",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the workspace was created",
            },
            created_by: {
              type: "string",
              description: "User ID of who created the workspace",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the workspace was last updated",
            },
            updated_by: {
              type: "string",
              description: "User ID of who last updated the workspace",
            },
            visibility: {
              type: "string",
              description: "Visibility setting of the workspace",
            },
            collections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the collection",
                  },
                  uid: {
                    type: "string",
                    description: "Unique identifier with team/user prefix",
                  },
                  name: {
                    type: "string",
                    description: "Name of the collection",
                  },
                },
                description: "Collection information within a workspace.",
              },
              description: "Array of collections in the workspace",
            },
            description: {
              type: "string",
              description: "Description of the workspace",
            },
            environments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Unique identifier of the environment",
                  },
                  uid: {
                    type: "string",
                    description: "Unique identifier with team/user prefix",
                  },
                  name: {
                    type: "string",
                    description: "Name of the environment",
                  },
                },
                description: "Environment information within a workspace.",
              },
              description: "Array of environments in the workspace",
            },
          },
          description:
            "The workspace object with all its details including collections, environments, APIs, mocks, and monitors",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_workspaces_activity_feed",
    operationType: "read",
    description:
      "Tool to get a workspace's activity feed showing who added or removed collections, environments, or elements, and users joining or leaving. Use when you need to track workspace changes and user activity.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        limit: {
          type: "integer",
          description: "The maximum number of activities to return. Used for pagination.",
        },
        cursor: {
          type: "string",
          description:
            "Cursor for pagination. Use the nextCursor value from the previous response to fetch the next page of results.",
        },
        workspace_id: {
          type: "string",
          description: "The ID of the workspace to get the activity feed for",
        },
      },
      description: "Request parameters for getting a workspace's activity feed.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the activity",
              },
              user: {
                type: "object",
                properties: {
                  id: {
                    type: "integer",
                    description: "Unique identifier of the user",
                  },
                  name: {
                    type: "string",
                    description: "Display name of the user",
                  },
                  username: {
                    type: "string",
                    description: "Username of the user",
                  },
                  isPartner: {
                    type: "boolean",
                    description: "Whether the user is a partner",
                  },
                },
                description: "User who performed the activity",
              },
              action: {
                type: "string",
                description: "Action performed (e.g., create, update, destroy, comment)",
              },
              trigger: {
                type: "string",
                description:
                  "Trigger that caused the activity (e.g., create, update, destroy, pull_request, comment_on_request)",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the activity was created",
              },
              elementId: {
                type: "string",
                description: "ID of the element that was acted upon",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the activity was last updated",
              },
              elementName: {
                type: "string",
                description: "Name of the element that was acted upon",
              },
              elementType: {
                type: "string",
                description: "Type of element (e.g., collection, environment, specification, workspace, monitor)",
              },
              workspaceId: {
                type: "string",
                description: "ID of the workspace where the activity occurred",
              },
            },
            description: "Individual activity in the feed.",
          },
          description: "Array of activity objects showing workspace changes and user actions",
        },
        meta: {
          type: "object",
          properties: {
            nextCursor: {
              type: "string",
              description:
                "Cursor to use for fetching the next page of activities. If null or absent, there are no more pages.",
            },
          },
          description: "Metadata containing pagination information",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_a_workspaces_roles",
    operationType: "read",
    description:
      "Tool to get the roles of users, user groups, and partners in a workspace. Use when you need to retrieve role assignments and understand who has what level of access to a specific workspace.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description: "The unique identifier of the workspace to retrieve roles for",
        },
      },
      description: "Request model for getting roles information for a workspace.",
    },
    outputSchema: {
      type: "object",
      properties: {
        roles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Role ID",
              },
              user: {
                type: "array",
                items: {
                  type: "string",
                  description: "The User value.",
                },
                description: "Array of user IDs with this role",
              },
              display_name: {
                type: "string",
                description: "Display name of the role (e.g., Editor, Admin)",
              },
            },
            description: "Role information with assigned users.",
          },
          description: "Array of role objects with user assignments",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_collection_access_keys",
    operationType: "read",
    description:
      "Tool to retrieve all personal and team collection access keys for the authenticated user. Use when you need to list or manage collection access keys. Returns an array of access key objects with their IDs, tokens, status, and associated collection information.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting collection access keys.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier for the access key",
              },
              token: {
                type: "string",
                description: "The actual key value (displayed masked for security)",
              },
              status: {
                type: "string",
                description: "Current state of the access key (e.g., ACTIVE)",
              },
              teamId: {
                type: "string",
                description: "Associated team identifier",
              },
              userId: {
                type: "string",
                description: "User ID who created the key",
              },
              createdAt: {
                type: "string",
                description: "Timestamp when the access key was created",
              },
              deletedAt: {
                type: "string",
                description: "Timestamp when the access key was revoked (null if active)",
              },
              updatedAt: {
                type: "string",
                description: "Timestamp when the access key was last modified",
              },
              lastUsedAt: {
                type: "string",
                description: "Timestamp of most recent usage (null if unused)",
              },
              collectionId: {
                type: "string",
                description: "Target collection's unique identifier",
              },
              expiresAfter: {
                type: "string",
                description: "Timestamp when the access key will expire",
              },
            },
            description: "Individual collection access key information.",
          },
          description: "Array of collection access key objects",
        },
        meta: {
          type: "object",
          properties: {
            nextCursor: {
              type: "string",
              description: "Cursor for pagination to fetch next set of results",
            },
            prevCursor: {
              type: "string",
              description: "Cursor for pagination to fetch previous set of results",
            },
          },
          description: "Pagination metadata including cursors for navigating results",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_contract_test_relations",
    operationType: "read",
    description:
      "Tool to retrieve contract test relations for a specific API version. Use when you need to check contract test associations. Note: This endpoint is deprecated and may return limited or no data.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version",
        },
      },
      description: "Request parameters to get contract test relations for an API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        contracttest: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the contract test relation",
              },
              entity_id: {
                type: "string",
                description: "Identifier of the entity",
              },
              entity_type: {
                type: "string",
                description: "Type of the entity",
              },
              collection_id: {
                type: "string",
                description: "Identifier of the associated collection",
              },
            },
            description: "Contract test relation information.",
          },
          description: "Array of contract test relations. This endpoint is deprecated and may return an empty array.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_documentation_relations",
    operationType: "read",
    description:
      "Tool to get documentation relations for a specific API version. This endpoint is deprecated in Postman v10 and higher.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The ID of the API",
        },
        api_version_id: {
          type: "string",
          description: "The ID of the API version",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      required: ["documentation"],
      properties: {
        documentation: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the documentation relation",
              },
              url: {
                type: "string",
                description: "URL of the documentation",
              },
              name: {
                type: "string",
                description: "Name of the documentation",
              },
              type: {
                type: "string",
                description: "Type of the documentation",
              },
              collection_id: {
                type: "string",
                description: "Associated collection ID",
              },
            },
            description: "A documentation relation object.",
          },
          description: "Array of documentation relations for the API version",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_duplication_task_status",
    operationType: "read",
    description:
      "Tool to get the status of a collection duplication task. Use when you need to check whether a previously initiated collection duplication is still processing or has completed. The task ID must first be obtained from the POST /collections/{collectionId}/duplicates endpoint.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: {
          type: "string",
          description:
            "The ID of the collection duplication task. Obtained from POST /collections/{collectionId}/duplicates endpoint response.",
        },
      },
      description: "Request parameters to get the status of a collection duplication task.",
    },
    outputSchema: {
      type: "object",
      properties: {
        task: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The task ID",
            },
            status: {
              type: "string",
              description: "Status of the duplication task (e.g., 'processing', 'completed')",
            },
          },
          description: "Task object containing status and id fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_environment_relations",
    operationType: "read",
    description:
      "Tool to get environment relations for a specific API version. This endpoint is deprecated in Postman v10 and higher.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique ID of the API.",
        },
        api_version_id: {
          type: "string",
          description: "The unique ID of the API version.",
        },
      },
      description: "Request model for getting environment relations for an API version.",
    },
    outputSchema: {
      type: "object",
      required: ["environment"],
      properties: {
        environment: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the environment",
              },
              uid: {
                type: "string",
                description: "Unique identifier in UID format",
              },
              name: {
                type: "string",
                description: "Name of the environment",
              },
            },
            description: "Environment relation information.",
          },
          description: "Array of environment relations associated with the API version",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_generated_spec",
    operationType: "read",
    description:
      "Tool to retrieve the API specification generated for a Postman collection. Use when you need to fetch OpenAPI/Swagger specs that have been auto-generated from a collection. Returns metadata and an array of generated specifications.",
    inputSchema: {
      type: "object",
      required: ["collection_uid"],
      properties: {
        element_type: {
          type: "string",
          default: "spec",
          description:
            "The type of generated element to retrieve. Use 'spec' for API specifications. This is typically 'spec' for OpenAPI/Swagger specifications generated from the collection.",
        },
        collection_uid: {
          type: "string",
          description:
            "The unique identifier for the collection. This is the collection's UID (with team/user prefix).",
        },
      },
      description: "Request model for getting the API specification generated for a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            nextCursor: {
              type: "string",
              description: "Cursor for pagination. If present, use this value to fetch the next page of results.",
            },
          },
          description: "Metadata about the response including pagination information",
        },
        specs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the generated specification",
              },
              type: {
                type: "string",
                description: "Type of the specification (e.g., 'openapi', 'swagger')",
              },
              content: {
                type: "object",
                properties: {
                  info: {
                    type: "object",
                    description: "API information including title, version, and description",
                    additionalProperties: {
                      type: "string",
                      description: "The Info item value.",
                    },
                  },
                  paths: {
                    type: "object",
                    description: "API paths and their operations",
                    additionalProperties: {
                      type: "object",
                      additionalProperties: {
                        type: "string",
                        description: "The Paths item item value.",
                      },
                      description: "The Paths item object.",
                    },
                  },
                  openapi: {
                    type: "string",
                    description: "OpenAPI version (e.g., '3.0.0', '3.1.0')",
                  },
                  components: {
                    type: "object",
                    description: "Reusable components like schemas, parameters, responses",
                    additionalProperties: {
                      type: "object",
                      additionalProperties: {
                        type: "string",
                        description: "The Components item item value.",
                      },
                      description: "The Components item object.",
                    },
                  },
                },
                description: "The actual specification content/definition",
              },
              createdAt: {
                type: "string",
                description: "ISO 8601 timestamp when the specification was created",
              },
              updatedAt: {
                type: "string",
                description: "ISO 8601 timestamp when the specification was last updated",
              },
            },
            description: "Individual generated specification object.",
          },
          description:
            "Array of generated API specifications for the collection. May be empty if no specifications have been generated.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_global_variables",
    operationType: "read",
    description:
      "Tool to get a workspace's global variables. Use when you need to retrieve global variables that are available throughout a workspace for access between collections, requests, scripts, and environments. Note that this endpoint only works with personal or team workspaces, not public workspaces.",
    inputSchema: {
      type: "object",
      required: ["workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "The unique identifier of the workspace to retrieve global variables from. Can be obtained from the GET /workspaces endpoint.",
        },
      },
      description: "Request parameters for getting workspace global variables.",
    },
    outputSchema: {
      type: "object",
      properties: {
        values: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: "The name/key of the global variable",
              },
              type: {
                type: "string",
                description: "The type of the global variable (e.g., 'default', 'secret')",
              },
              value: {
                type: "string",
                description: "The value of the global variable",
              },
              enabled: {
                type: "boolean",
                description: "Whether the global variable is enabled or not",
              },
            },
            description: "Individual global variable information.",
          },
          description: "Array of global variable objects, each containing key, value, enabled, and type fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_integration_test_relations",
    operationType: "read",
    description:
      "Tool to get integration test relations for a specific API version. This endpoint is deprecated and may not return active data.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version",
        },
      },
      description: "Request parameters for getting integration test relations.",
    },
    outputSchema: {
      type: "object",
      properties: {
        integrationtest: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the integration test relation",
              },
              name: {
                type: "string",
                description: "Name of the integration test",
              },
            },
            description: "Integration test relation details.",
          },
          description:
            "Array of integration test relations for the API version. This endpoint is deprecated and typically returns an empty array.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_resource_types",
    operationType: "read",
    description:
      "Tool to get all resource types supported by Postman's SCIM API. Use when you need to discover what resource types (e.g., User, Group) are available in the SCIM API and their corresponding endpoints and schemas.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting resource types.",
    },
    outputSchema: {
      type: "object",
      properties: {
        Resources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Resource type identifier (e.g., 'User', 'Group')",
              },
              name: {
                type: "string",
                description: "Human-readable name of the resource type",
              },
              schema: {
                type: "string",
                description: "The primary/base schema URI for this resource type",
              },
              schemas: {
                type: "array",
                items: {
                  type: "string",
                  description: "The Schema value.",
                },
                description: "SCIM schemas URIs for this resource type",
              },
              endpoint: {
                type: "string",
                description: "The HTTP-addressable endpoint of this resource type (e.g., '/Users', '/Groups')",
              },
              description: {
                type: "string",
                description: "Description of the resource type",
              },
              schemaExtensions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    schema: {
                      type: "string",
                      description: "The URI of the schema extension",
                    },
                    required: {
                      type: "boolean",
                      description: "Whether this schema extension is required",
                    },
                  },
                  description: "Schema extension information for a resource type.",
                },
                description: "Schema extensions supported by this resource type",
              },
            },
            description: "Individual resource type information.",
          },
          description: "Array of resource type objects supported by Postman's SCIM API",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_schema_files",
    operationType: "read",
    description:
      "Tool to retrieve files in an API schema from Postman. Use when you need to list or view schema files for a specific API and schema ID. Optionally filter by version ID to get files from a particular API version.",
    inputSchema: {
      type: "object",
      required: ["api_id", "schema_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API containing the schema.",
        },
        schema_id: {
          type: "string",
          description: "The unique identifier of the schema whose files you want to retrieve.",
        },
        version_id: {
          type: "string",
          description:
            "Optional version ID to get schema files published in a specific API version. If not provided, returns files from the latest version.",
        },
      },
      description: "The Input payload object.",
    },
    outputSchema: {
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            next_cursor: {
              type: "string",
              description: "Cursor for fetching the next page of results. Returns null if no more pages exist.",
            },
          },
          description: "Pagination metadata including cursor for next page",
        },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier of the schema file",
              },
              name: {
                type: "string",
                description: "Name of the schema file",
              },
              path: {
                type: "string",
                description: "File path within the schema structure",
              },
              root: {
                type: "object",
                properties: {
                  enabled: {
                    type: "boolean",
                    description: "Indicates whether the file is enabled as a root file",
                  },
                },
                description: "Root configuration indicating if this is a root file",
              },
              created_at: {
                type: "string",
                description: "ISO 8601 timestamp when the file was created",
              },
              created_by: {
                type: "string",
                description: "User ID of the person who created the file",
              },
              updated_at: {
                type: "string",
                description: "ISO 8601 timestamp when the file was last updated",
              },
              updated_by: {
                type: "string",
                description: "User ID of the person who last updated the file",
              },
            },
            description: "Schema file metadata.",
          },
          description: "Array of schema file objects with metadata including ID, name, path, and timestamps",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_schema_file_contents",
    operationType: "read",
    description:
      "Tool to get the contents of an API schema file at a specified path. Use when you need to retrieve the actual content of a schema file. Optionally specify a version ID to get file contents from a specific API version.",
    inputSchema: {
      type: "object",
      required: ["api_id", "schema_id", "file_path"],
      properties: {
        api_id: {
          type: "string",
          description: "The API's unique identifier",
        },
        file_path: {
          type: "string",
          description: "The path of the file within the schema (e.g., 'index.yaml', 'schemas/openapi.yaml')",
        },
        schema_id: {
          type: "string",
          description: "The schema's unique identifier",
        },
        version_id: {
          type: "string",
          description: "Optional query parameter to get schema file contents published in an API version",
        },
      },
      description: "Request model for getting API schema file contents.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the file",
        },
        name: {
          type: "string",
          description: "The name of the file",
        },
        path: {
          type: "string",
          description: "The path of the file",
        },
        content: {
          type: "string",
          description: "The file contents as a string",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was created",
        },
        created_by: {
          type: "string",
          description: "User ID who created the file",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was last updated",
        },
        updated_by: {
          type: "string",
          description: "User ID who last updated the file",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_service_provider_configuration",
    operationType: "read",
    description:
      "Tool to get Postman's SCIM API service provider configuration information. Use when you need to discover supported SCIM operations, capabilities, and authentication schemes. This endpoint returns configuration details including support for PATCH, bulk operations, filtering, sorting, and ETag handling.",
    inputSchema: {
      type: "object",
      properties: {},
      description: "Request parameters for getting service provider configuration.",
    },
    outputSchema: {
      type: "object",
      properties: {
        bulk: {
          type: "object",
          properties: {
            supported: {
              type: "boolean",
              description: "Whether bulk operations are supported",
            },
            maxOperations: {
              type: "integer",
              description: "Maximum number of operations allowed in a bulk request",
            },
            maxPayloadSize: {
              type: "integer",
              description: "Maximum payload size in bytes for bulk operations",
            },
          },
          description: "Bulk operation support configuration",
        },
        etag: {
          type: "object",
          properties: {
            supported: {
              type: "boolean",
              description: "Whether ETag support is enabled",
            },
          },
          description: "ETag support configuration",
        },
        meta: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The URI of the resource",
            },
            resourceType: {
              type: "string",
              description: "The resource type name",
            },
          },
          description: "Resource metadata including resource type and location",
        },
        sort: {
          type: "object",
          properties: {
            supported: {
              type: "boolean",
              description: "Whether sorting is supported",
            },
          },
          description: "Sort operation support configuration",
        },
        patch: {
          type: "object",
          properties: {
            supported: {
              type: "boolean",
              description: "Whether PATCH operations are supported",
            },
          },
          description: "PATCH operation support configuration",
        },
        filter: {
          type: "object",
          properties: {
            supported: {
              type: "boolean",
              description: "Whether filtering is supported",
            },
            maxResults: {
              type: "integer",
              description: "Maximum number of resources returned in a query response",
            },
          },
          description: "Filter operation support configuration",
        },
        schemas: {
          type: "array",
          items: {
            type: "string",
            description: "The Schema value.",
          },
          description: "SCIM schemas URIs for the service provider configuration",
        },
        changePassword: {
          type: "object",
          properties: {
            supported: {
              type: "boolean",
              description: "Whether password change operations are supported",
            },
          },
          description: "Password change operation support configuration",
        },
        documentationUri: {
          type: "string",
          description: "HTTP-addressable URL pointing to the service provider's documentation",
        },
        authenticationSchemes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Common name of the authentication scheme (e.g., 'OAuth Bearer Token')",
              },
              type: {
                type: "string",
                description: "The authentication scheme type (e.g., 'oauthbearertoken', 'httpbasic')",
              },
              specUri: {
                type: "string",
                description: "HTTP-addressable URL pointing to the authentication scheme's specification",
              },
              description: {
                type: "string",
                description: "Description of the authentication scheme",
              },
            },
            description: "Authentication scheme information.",
          },
          description: "List of supported authentication schemes",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_source_collections_status",
    operationType: "read",
    description:
      "Tool to check whether there is a change between a forked collection and its parent (source) collection. Use when you need to determine if the source collection has updates that are not yet in the forked collection. This endpoint only works with forked collections; attempting to use it with regular collections will result in an error.",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        collection_id: {
          type: "string",
          description:
            "The ID of a forked collection. The endpoint only works with forked collections, not regular collections.",
        },
      },
      description: "Request parameters for checking source collection status.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          description: "Dictionary with collection UID as key and source status information as value",
          additionalProperties: {
            type: "object",
            properties: {
              is_source_ahead: {
                type: "boolean",
                description:
                  "Indicates whether the parent (source) collection has changes that are ahead of the forked collection",
              },
            },
            description: "Source status information for a collection.",
          },
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_test_suite_relations",
    operationType: "read",
    description:
      "Tool to get test suite relations for a specific API version. Use when you need to retrieve the test suites associated with an API version. Note: This endpoint is deprecated and only works with legacy v9 APIs. For v10+ APIs, this returns an empty array.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API to get test suite relations for.",
        },
        api_version_id: {
          type: "string",
          description: "The unique identifier of the API version to get test suite relations for.",
        },
      },
      description: "Request parameters to get test suite relations for an API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Optional message providing additional context about the response, especially for deprecated endpoints.",
        },
        testsuite: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the test suite",
              },
              uid: {
                type: "string",
                description: "The UID of the test suite",
              },
              name: {
                type: "string",
                description: "The name of the test suite",
              },
            },
            description: "A test suite item in the response.",
          },
          description:
            "Array of test suite relations for the API version. Each item represents a test suite associated with this API version. This endpoint is deprecated and returns an empty array for v10+ APIs.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "get_unclassified_relations",
    operationType: "read",
    description:
      "Tool to get unclassified relations for an API version in Postman. Use when you need to retrieve unclassified relations for a specific API version. This endpoint is for Postman v10 and higher.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api_version_id"],
      properties: {
        api_id: {
          type: "string",
          description: "The API identifier (UUID format)",
        },
        api_version_id: {
          type: "string",
          description: "The API version identifier (UUID format)",
        },
      },
      description: "Request parameters for getting unclassified relations for an API version.",
    },
    outputSchema: {
      type: "object",
      properties: {
        unclassified: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            description: "The Unclassified object.",
          },
          description:
            "Array of unclassified relations for the API version. Each relation is a dictionary containing relation metadata.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "import_openapi",
    operationType: "write",
    description:
      "Tool to import an OpenAPI specification into Postman as a new collection. Use when you need to convert an OpenAPI 3.0+ specification into a Postman collection within a specific workspace. The imported specification will be automatically converted to a Postman collection with all endpoints, request parameters, and documentation.",
    inputSchema: {
      type: "object",
      required: ["workspace", "type", "input"],
      properties: {
        type: {
          type: "string",
          description:
            "The type of import input. Use 'string' when providing the OpenAPI specification as a JSON/YAML string, or 'file' when uploading a file. Common value is 'string'.",
        },
        input: {
          type: "string",
          description:
            "The OpenAPI specification content as a JSON or YAML string. Must be a valid OpenAPI 3.0+ specification with required fields like 'openapi', 'info', and 'paths'. Ensure proper JSON formatting if using type='string'.",
        },
        workspace: {
          type: "string",
          description:
            "The unique identifier of the workspace where the OpenAPI specification will be imported. The imported OpenAPI will be created as a collection in this workspace.",
        },
      },
      description: "Request parameters for importing an OpenAPI specification into Postman.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "The unique identifier of the created collection",
              },
              uid: {
                type: "string",
                description: "The full unique identifier of the collection including user/team prefix",
              },
              name: {
                type: "string",
                description: "The name of the created collection, typically derived from the OpenAPI info.title field",
              },
            },
            description: "Represents a collection created from the OpenAPI import.",
          },
          description:
            "Array of collections created from the OpenAPI specification import. Usually contains one collection per import.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "list_account_invoices",
    operationType: "read",
    description:
      "Tool to get all invoices for a Postman billing account filtered by status. Use when you need to retrieve invoice history for an account. The account ID must first be obtained from the GET /accounts endpoint.",
    inputSchema: {
      type: "object",
      required: ["account_id"],
      properties: {
        status: {
          type: "string",
          description: "Filter invoices by status (e.g., PAID). If not provided, returns all invoices.",
        },
        account_id: {
          type: "string",
          description: "The billing account ID obtained from GET /accounts endpoint",
        },
      },
      description: "Request parameters to get invoices for a Postman billing account.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Invoice identifier",
              },
              links: {
                type: "object",
                properties: {
                  web: {
                    type: "object",
                    description: "Object containing href link to view/pay the invoice",
                    additionalProperties: {
                      type: "string",
                      description: "The Web item value.",
                    },
                  },
                },
                description: "Links object containing web href to view/pay the invoice",
              },
              status: {
                type: "string",
                description: "Invoice status (e.g., PAID)",
              },
              issuedAt: {
                type: "string",
                description: "Issue date in YYYY-MM-DD format",
              },
              totalAmount: {
                type: "object",
                properties: {
                  value: {
                    type: "number",
                    description: "Numeric amount of the invoice",
                  },
                  currency: {
                    type: "string",
                    description: "Currency code for the invoice amount (e.g., USD)",
                  },
                },
                description: "Total amount object containing value and currency",
              },
            },
            description: "Individual invoice information.",
          },
          description: "Array of invoice objects containing invoice details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "merge_a_fork",
    operationType: "write",
    description:
      "Tool to merge a forked collection back into its parent collection. This endpoint is deprecated. Use when you need to merge changes from a forked collection into the parent collection.",
    inputSchema: {
      type: "object",
      required: ["source", "destination"],
      properties: {
        source: {
          type: "string",
          description: "The UID of the forked collection (source) to merge from",
        },
        strategy: {
          type: "string",
          description:
            "Optional merge strategy: 'deleteSource' (merge and delete forked collection) or 'updateSourceWithDestination' (merge and update both collections)",
        },
        destination: {
          type: "string",
          description: "The UID of the parent collection (destination) to merge into",
        },
      },
      description: "Request parameters for merging a forked collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the merged collection",
            },
            uid: {
              type: "string",
              description: "The unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "The name of the merged collection",
            },
          },
          description: "The merged collection object containing id, name, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "merge_a_fork2",
    operationType: "write",
    description:
      "Tool to merge a forked environment back into its parent environment. Use when you need to merge changes from a forked environment into the parent.",
    inputSchema: {
      type: "object",
      required: ["environment_uid", "source"],
      properties: {
        source: {
          type: "string",
          description: "The UID of the forked (source) environment to merge from",
        },
        environment_uid: {
          type: "string",
          description: "The UID of the parent (destination) environment where changes will be merged into",
        },
      },
      description: "Request parameters for merging a forked environment back into its parent.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            uid: {
              type: "string",
              description: "The UID of the parent environment that received the merged changes",
            },
          },
          description: "The parent environment object containing the UID after merge",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "publish_a_mock_server",
    operationType: "write",
    description:
      "Tool to publish a mock server in Postman. Use when you need to make a mock server publicly accessible. Publishing sets the mock server's Access Control configuration to public.",
    inputSchema: {
      type: "object",
      required: ["mock_id"],
      properties: {
        mock_id: {
          type: "string",
          description:
            "The unique identifier of the mock server to publish. Publishing a mock server sets its Access Control configuration to public.",
        },
      },
      description: "Request parameters for publishing a mock server.",
    },
    outputSchema: {
      type: "object",
      properties: {
        mock: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the published mock server",
            },
          },
          description: "Information about the published mock server",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "pull_source_changes2",
    operationType: "write",
    description:
      "Tool to pull changes from a parent (source) collection into a forked collection. Use when you need to sync a forked collection with its parent.",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        collection_id: {
          type: "string",
          description:
            "The ID of the forked collection that will receive the changes from its parent (source) collection",
        },
      },
      description: "Request parameters for pulling source changes into a forked collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          properties: {
            source_id: {
              type: "string",
              description: "The ID of the parent collection (source)",
            },
            destination_id: {
              type: "string",
              description: "The ID of the forked collection (destination)",
            },
          },
          description: "The collection object containing destination and source IDs after pulling changes",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "replace_an_environments_data",
    operationType: "destructive",
    description:
      "Tool to completely replace an environment's data with new variables and values. Use when you need to update an entire environment by replacing all its contents. This operation replaces ALL existing variables with the ones provided in the request.",
    inputSchema: {
      type: "object",
      required: ["environment_id", "environment"],
      properties: {
        environment: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              description: "The name of the environment to replace",
            },
            values: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The name/key of the environment variable",
                  },
                  type: {
                    enum: ["default", "secret"],
                    type: "string",
                    default: "default",
                    description:
                      "The type of the variable. Use 'default' for regular variables or 'secret' for sensitive values like passwords and API keys",
                  },
                  value: {
                    type: "string",
                    description: "The value of the environment variable",
                  },
                  enabled: {
                    type: "boolean",
                    default: true,
                    description: "Whether the variable is enabled and active in the environment",
                  },
                },
                description: "Individual environment variable to be added to the environment.",
              },
              description:
                "Array of environment variables with key, value, type, and enabled properties. This replaces ALL existing variables in the environment",
            },
          },
          description:
            "Environment object containing name and array of environment variables. This completely replaces the environment's data",
          additionalProperties: false,
        },
        environment_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the environment to replace",
        },
      },
      description: "Request parameters for replacing an environment's data.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the environment",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the environment",
            },
          },
          description: "Replaced environment object containing id, name, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "replace_collections_data_asynchronously",
    operationType: "destructive",
    description:
      "Tool to replace the entire contents of a collection asynchronously. Use when you need to completely replace a collection with new data. IMPORTANT: Include the collection's ID values in item, variable, and other nested objects to preserve them. If you do not include IDs, existing items will be removed and new items will be created.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "collection"],
      properties: {
        collection: {
          type: "object",
          required: ["info"],
          properties: {
            auth: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "The type of authentication (e.g., 'apikey', 'bearer', 'basic', 'oauth2')",
                },
              },
              description: "Authentication configuration for the collection.",
              additionalProperties: false,
            },
            info: {
              type: "object",
              required: ["name"],
              properties: {
                name: {
                  type: "string",
                  description: "The name of the collection",
                },
                schema: {
                  type: "string",
                  default: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
                  description: "The schema version URL for the collection. Defaults to v2.1.0",
                },
                description: {
                  type: "string",
                  description: "Optional description of the collection explaining its purpose",
                },
              },
              description: "Collection metadata containing name, description, and schema version",
              additionalProperties: false,
            },
            item: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description:
                      "The unique identifier for the item. Include to preserve existing items, omit to create new ones.",
                  },
                  item: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: {
                        anyOf: [
                          {
                            type: "string",
                            description: "The Item item option 1 value.",
                          },
                          {
                            type: "array",
                            items: {
                              description: "The Item item option 2 value.",
                            },
                            description: "The list of item item option 2 values.",
                          },
                          {
                            type: "object",
                            additionalProperties: true,
                            description: "The Item item option 3 object.",
                          },
                        ],
                        description: "The Item item value.",
                      },
                      description: "The Item object.",
                    },
                    description: "Nested items if this is a folder",
                  },
                  name: {
                    type: "string",
                    description: "Name of the item (request or folder)",
                  },
                  request: {
                    type: "object",
                    description: "Request object containing method, url, headers, body, etc.",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Request item option 1 value.",
                        },
                        {
                          type: "array",
                          items: {
                            description: "The Request item option 2 value.",
                          },
                          description: "The list of request item option 2 values.",
                        },
                        {
                          type: "object",
                          additionalProperties: true,
                          description: "The Request item option 3 object.",
                        },
                      ],
                      description: "The Request item value.",
                    },
                  },
                  response: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: {
                        anyOf: [
                          {
                            type: "string",
                            description: "The Response item option 1 value.",
                          },
                          {
                            type: "array",
                            items: {
                              description: "The Response item option 2 value.",
                            },
                            description: "The list of response item option 2 values.",
                          },
                          {
                            type: "object",
                            additionalProperties: true,
                            description: "The Response item option 3 object.",
                          },
                        ],
                        description: "The Response item value.",
                      },
                      description: "The Response object.",
                    },
                    description: "Array of saved responses for this request",
                  },
                },
                description: "Represents a collection item which can be a request or folder.",
              },
              description:
                "Array of collection items (requests, folders). Include existing item IDs to preserve them, omit IDs to create new items.",
            },
            variable: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description:
                      "The unique identifier for the variable. Include to preserve existing variables, omit to create new ones.",
                  },
                  key: {
                    type: "string",
                    description: "The variable name/key",
                  },
                  type: {
                    type: "string",
                    description: "The type of the variable (e.g., 'string', 'secret')",
                  },
                  value: {
                    type: "string",
                    description: "The variable value",
                  },
                },
                description: "Variable definition at the collection level.",
              },
              description:
                "Collection-level variables. Include existing variable IDs to preserve them, omit IDs to create new variables.",
            },
          },
          description:
            "The complete collection object to replace the existing collection. IMPORTANT: Include the collection's ID values in item, variable, and other nested objects to preserve them. If you do not include IDs, the endpoint removes existing items and creates new items.",
          additionalProperties: false,
        },
        collection_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the collection to replace",
        },
      },
      description: "Request parameters for replacing collection contents asynchronously.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the collection",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            info: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "The name of the collection",
                },
                schema: {
                  type: "string",
                  description: "The schema URL for the collection format",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO 8601 timestamp when the collection was last updated",
                },
                _postman_id: {
                  type: "string",
                  description: "The collection's unique Postman identifier",
                },
                description: {
                  type: "string",
                  description: "A description of the collection",
                },
              },
              description: "Metadata about the collection",
            },
            name: {
              type: "string",
              description: "The name of the collection",
            },
          },
          description:
            "The replaced collection object. The update happens asynchronously, so full details may not be immediately available.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "resolve_a_comment_thread",
    operationType: "destructive",
    description:
      "Tool to resolve a comment thread and any associated replies. Use when you need to mark a comment thread as resolved. On success, this returns an HTTP 204 No Content response.",
    inputSchema: {
      type: "object",
      required: ["thread_id"],
      properties: {
        thread_id: {
          type: "integer",
          description:
            "The ID of the comment thread to resolve. This is obtained from the threadId field when creating or retrieving comments.",
        },
      },
      description: "Request parameters to resolve a comment thread.",
    },
    outputSchema: {
      type: "object",
      properties: {
        success: {
          type: "boolean",
          default: true,
          description: "Indicates the operation completed successfully",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "review_a_pull_request",
    operationType: "write",
    description:
      "Tool to update the review status of a pull request by approving, declining, or unapproving it. Use when you need to perform a review action on a Postman pull request.",
    inputSchema: {
      type: "object",
      required: ["pull_request_id", "action"],
      properties: {
        action: {
          enum: ["approve", "decline", "unapprove"],
          type: "string",
          description:
            "The review action to perform on the pull request. 'approve' to approve the PR, 'decline' to decline it, or 'unapprove' to revoke a previous approval",
        },
        pull_request_id: {
          type: "string",
          description: "The unique identifier of the pull request to review",
        },
      },
      description: "Request parameters for reviewing a pull request.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the task",
            },
            action: {
              type: "string",
              description: "The action that was performed",
            },
            status: {
              type: "string",
              description: "Status of the pull request after the review action",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the task was created",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the task was last updated",
            },
            pull_request_id: {
              type: "string",
              description: "The ID of the pull request that was reviewed",
            },
          },
          description: "Task data containing the updated pull request review status",
        },
        message: {
          type: "string",
          description: "Response message indicating success or additional information",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "run_a_monitor",
    operationType: "write",
    description:
      "Tool to trigger an immediate run of a monitor and retrieve its execution results. Use when you need to manually execute a monitor outside of its scheduled runs.",
    inputSchema: {
      type: "object",
      required: ["monitor_id"],
      properties: {
        monitor_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the monitor to run",
        },
      },
      description: "Request parameters for running a monitor.",
    },
    outputSchema: {
      type: "object",
      properties: {
        run: {
          type: "object",
          properties: {
            info: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  description: "Status of the monitor run",
                },
                execution_id: {
                  type: "string",
                  description: "Unique identifier for this execution",
                },
              },
              description: "Information about the monitor run execution",
            },
            stats: {
              type: "object",
              properties: {
                requests: {
                  type: "object",
                  properties: {
                    total: {
                      type: "integer",
                      description: "Total number of requests",
                    },
                    pending: {
                      type: "integer",
                      description: "Number of pending requests",
                    },
                  },
                  description: "Request statistics including total and pending counts",
                },
                assertions: {
                  type: "object",
                  properties: {
                    total: {
                      type: "integer",
                      description: "Total number of assertions",
                    },
                    failed: {
                      type: "integer",
                      description: "Number of failed assertions",
                    },
                    passed: {
                      type: "integer",
                      description: "Number of passed assertions",
                    },
                  },
                  description: "Assertion statistics including total, failed, and passed counts",
                },
              },
              description: "Statistics about the monitor run including assertions and requests",
            },
          },
          description: "The monitor run object containing execution info and statistics",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "sync_collection_with_schema",
    operationType: "write",
    description:
      "Tool to sync a collection attached to an API with the API schema. This is an asynchronous endpoint that returns HTTP 202 Accepted. Use when you need to synchronize a collection with changes made to the API schema. The collection must already be attached to the API. Returns a task ID that can be used to check the status of the sync operation.",
    inputSchema: {
      type: "object",
      required: ["api_id", "collection_uid"],
      properties: {
        api_id: {
          type: "string",
          description: "The unique identifier of the API. Must be in UUID format.",
        },
        collection_uid: {
          type: "string",
          description:
            "The unique identifier of the collection that is attached to the API. Format: userId-collectionId.",
        },
      },
      description: "Request parameters to sync a collection with an API schema.",
    },
    outputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The unique identifier of the asynchronous sync task. Use this to check task status.",
        },
        location: {
          type: "string",
          description: "URL to check the status of the sync task",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "sync_collection_with_spec",
    operationType: "write",
    description:
      "Tool to sync a collection generated from an API specification. This is an asynchronous operation that returns HTTP 202 Accepted. Use when you need to update a collection to match the latest version of its source API specification. The collection must have been generated from a spec.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "spec_id"],
      properties: {
        spec_id: {
          type: "string",
          description:
            "The ID of the API specification to sync with the collection. This is the source specification that the collection was generated from.",
        },
        collection_uid: {
          type: "string",
          description:
            "The UID of a collection that was generated from an API specification. This collection will be synchronized with its source specification.",
        },
      },
      description: "Request parameters to sync a collection with its API specification.",
    },
    outputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to poll for checking the status of the synchronization task",
        },
        taskId: {
          type: "string",
          description: "The unique identifier of the asynchronous task for tracking the synchronization operation",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "sync_spec_with_collection",
    operationType: "write",
    description:
      "Tool to sync an API specification with a linked collection. This is an asynchronous operation that returns HTTP 202 Accepted with task tracking information. Use when you need to synchronize changes from a generated collection back to its source specification. Prerequisites: the collection must be generated from the spec, and the spec must be single-file.",
    inputSchema: {
      type: "object",
      required: ["spec_id", "collection_uid"],
      properties: {
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification to sync. Must be in UUID format.",
        },
        collection_uid: {
          type: "string",
          description:
            "The unique identifier of the generated collection whose changes should be synchronized back to the specification. The collection must have been generated from this spec, and the spec must be a single-file specification.",
        },
      },
      description: "Request parameters for syncing an API specification with a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The relative URL to check the task status. Use GET request to this URL to monitor sync progress.",
        },
        taskId: {
          type: "string",
          description: "The unique identifier for the asynchronous sync task. Use this to poll the task status.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "transfer_folders",
    operationType: "write",
    description:
      "Tool to copy or move folders into a collection or folder. Use when you need to reorganize collections by transferring folders between collections or into other folders.",
    inputSchema: {
      type: "object",
      required: ["ids", "target", "location", "mode"],
      properties: {
        ids: {
          type: "array",
          items: {
            type: "string",
            description: "The Id value.",
          },
          minItems: 1,
          description:
            "Array of folder unique identifiers (UIDs) to transfer. Each UID must be in format 'owner-folderId' (e.g., '50304422-f172eb50-ded9-dcc1-5c6a-1ad2a604bf55'). All folders must exist and be accessible.",
        },
        mode: {
          enum: ["copy", "move"],
          type: "string",
          description:
            "Transfer mode: 'copy' creates duplicates of folders in target, 'move' relocates folders to target (removes from source).",
        },
        target: {
          type: "object",
          required: ["model", "id"],
          properties: {
            id: {
              type: "string",
              description:
                "The unique identifier (UID) of the target collection or folder in format 'owner-id' (e.g., '50304422-747b3035-ab7d-408e-bff9-ac1634a769d4')",
            },
            model: {
              enum: ["collection", "folder"],
              type: "string",
              description:
                "Type of target to transfer folders into. Use 'collection' to transfer into a collection root, or 'folder' to transfer into a specific folder.",
            },
          },
          description:
            "Target location where folders should be transferred. Specify the model type (collection or folder) and its UID.",
          additionalProperties: false,
        },
        location: {
          type: "object",
          required: ["position"],
          properties: {
            id: {
              type: "string",
              description:
                "Optional ID to position relative to. Use with model to place folders before/after a specific item.",
            },
            model: {
              type: "string",
              description:
                "Optional model type for positioning relative to another item. Can be 'collection', 'folder', or 'request'.",
            },
            position: {
              enum: ["start", "end"],
              type: "string",
              description:
                "Position where folders should be placed in the target. Use 'start' to place at beginning or 'end' to place at end.",
            },
          },
          description:
            "Position within the target where folders should be placed. Specify 'start' or 'end' for the position.",
          additionalProperties: false,
        },
      },
      description: "Request parameters for transferring folders between collections or into folders.",
    },
    outputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: {
            type: "string",
            description: "The Id value.",
          },
          description:
            "Array of folder IDs created in the target location after the transfer operation. These are the new folder UIDs in the destination.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "transform_collection_to_openapi",
    operationType: "read",
    description:
      "Tool to transform an existing Postman Collection into a stringified OpenAPI 3.0.3 definition. Use when you need to convert a collection to OpenAPI format for API documentation or interoperability with other tools.",
    inputSchema: {
      type: "object",
      required: ["collection_id"],
      properties: {
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection to transform into OpenAPI format",
        },
      },
      description: "Request model for transforming a Postman collection to OpenAPI format.",
    },
    outputSchema: {
      type: "object",
      properties: {
        output: {
          type: "string",
          description:
            "Stringified JSON containing the OpenAPI 3.0.3 definition of the collection. Parse this string to get the full OpenAPI specification with paths, components, schemas, and server configurations.",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_an_api",
    operationType: "write",
    description:
      "Tool to update an existing API in Postman. Use when you need to modify the name, summary, or description of an API.",
    inputSchema: {
      type: "object",
      required: ["api_id", "api"],
      properties: {
        api: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the API. Update this field to change the API's display name.",
            },
            summary: {
              type: "string",
              description: "A brief summary of the API. Update to change the API's summary description.",
            },
            description: {
              type: "string",
              description: "A detailed description of the API. Update to change the full API description.",
            },
          },
          description:
            "The API object containing fields to update. Include at least one of: name, summary, or description.",
          additionalProperties: false,
        },
        api_id: {
          type: "string",
          description:
            "The unique identifier of the API to update. This is the API ID returned when the API was created.",
        },
      },
      description: "Request model for updating an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        api: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the API",
            },
            name: {
              type: "string",
              description: "The name of the API",
            },
            summary: {
              type: "string",
              description: "The summary of the API",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the API was created",
            },
            created_by: {
              type: "string",
              description: "User ID of who created the API",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the API was last updated",
            },
            updated_by: {
              type: "string",
              description: "User ID of who last updated the API",
            },
            description: {
              type: "string",
              description: "The description of the API",
            },
            is_soft_deleted: {
              type: "integer",
              description: "Indicates if the API is soft deleted (0 for active, 1 for deleted)",
            },
            api_container_status: {
              type: "integer",
              description: "The container status of the API",
            },
            configuration_source: {
              type: "string",
              description: "The configuration source of the API",
            },
          },
          description: "The updated API object with all details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_an_apis_comment",
    operationType: "write",
    description:
      "Tool to update a comment on an API. Use when you need to modify the text content of an existing comment on a specific API.",
    inputSchema: {
      type: "object",
      required: ["api_id", "comment_id", "body"],
      properties: {
        body: {
          type: "string",
          description: "The updated text content of the comment.",
        },
        api_id: {
          type: "string",
          description: "The API's unique identifier. This identifies the API containing the comment to update.",
        },
        comment_id: {
          type: "integer",
          description: "The comment's unique identifier. This is the ID of the comment to update.",
        },
      },
      description: "Request parameters to update a comment on an API.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description: "The comment's unique ID",
        },
        body: {
          type: "string",
          description: "The updated text content of the comment",
        },
        status: {
          type: "string",
          description: "The status of the comment (e.g., 'Open')",
        },
        thread_id: {
          type: "integer",
          description: "The thread ID this comment belongs to",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was created",
        },
        created_by: {
          type: "integer",
          description: "The ID of the user who created the comment",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was last updated",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_an_environment",
    operationType: "write",
    description:
      "Tool to update specific environment properties using JSON Patch operations (RFC 6902). Use when you need to modify environment name or variables without replacing the entire environment.",
    inputSchema: {
      type: "object",
      required: ["environment_id", "operations"],
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            required: ["op", "path"],
            properties: {
              op: {
                enum: ["replace", "add", "remove", "copy", "move", "test"],
                type: "string",
                description:
                  "The operation type to perform. Use 'replace' to update existing fields, 'add' to create new fields or append to arrays, 'remove' to delete fields, 'copy'/'move' to copy/move from another path (requires 'from' field)",
              },
              from: {
                type: "string",
                description:
                  "Source JSON pointer for 'copy' and 'move' operations (RFC 6902). Required when op is 'copy' or 'move'",
              },
              path: {
                type: "string",
                description:
                  "JSON pointer to the field to modify (e.g., '/name' for environment name, '/values/0/value' for first variable's value)",
              },
              value: {
                anyOf: [
                  {
                    type: "string",
                    description: "The Value option 1 value.",
                  },
                  {
                    type: "integer",
                    description: "The Value option 2 value.",
                  },
                  {
                    type: "boolean",
                    description: "The Value option 3 value.",
                  },
                  {
                    type: "number",
                    description: "The Value option 4 value.",
                  },
                  {
                    type: "object",
                    additionalProperties: true,
                    description: "The Value option 5 object.",
                  },
                  {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: true,
                      description: "The Value option 6 object.",
                    },
                    description: "The list of value option 6 values.",
                  },
                ],
                description:
                  "New value for the field. Required for 'replace' and 'add' operations, not used for 'remove' operation",
              },
            },
            description: "JSON Patch operation following RFC 6902 specification.",
          },
          description:
            "Array of JSON Patch operations to apply to the environment. Each operation modifies a specific field using the RFC 6902 format",
        },
        environment_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the environment to update",
        },
      },
      description: "Request model for updating an environment using JSON Patch operations.",
    },
    outputSchema: {
      type: "object",
      properties: {
        environment: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the environment",
            },
            uid: {
              type: "string",
              description: "The unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "The name of the environment",
            },
            owner: {
              type: "string",
              description: "User ID of the environment owner",
            },
            values: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: {
                    type: "string",
                    description: "The name of the environment variable",
                  },
                  type: {
                    type: "string",
                    description: "The type of the environment variable (e.g., 'default', 'secret')",
                  },
                  value: {
                    type: "string",
                    description: "The value of the environment variable",
                  },
                  enabled: {
                    type: "boolean",
                    description: "Whether the environment variable is enabled",
                  },
                },
                description: "Individual environment variable within the environment.",
              },
              description: "Array of environment variable objects with key, value, type, and enabled fields",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the environment was created",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the environment was last updated",
            },
          },
          description: "The updated environment object with all details including variables",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_folder",
    operationType: "write",
    description:
      "Tool to update a folder in a Postman collection. Use when you need to modify the name or description of an existing folder. For complete properties and information, see the Postman Collection Format documentation.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "folder_id"],
      properties: {
        name: {
          type: "string",
          description: "The new name for the folder",
        },
        folder_id: {
          type: "string",
          description: "The unique identifier of the folder to update",
        },
        description: {
          type: "string",
          description: "Optional updated description for the folder explaining its purpose",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the folder",
        },
      },
      description: "Request parameters to update a folder in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the updated folder",
            },
            name: {
              type: "string",
              description: "The name of the folder",
            },
            order: {
              type: "array",
              items: {
                type: "string",
                description: "The Order value.",
              },
              description: "Array of request IDs in the folder's display order",
            },
            owner: {
              type: "string",
              description: "The owner ID of the folder",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the folder was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the folder was last updated",
            },
            collection: {
              type: "string",
              description: "The collection ID containing this folder",
            },
            description: {
              type: "string",
              description: "The description of the folder",
            },
            foldersOrder: {
              type: "array",
              items: {
                type: "string",
                description: "The Folders Order value.",
              },
              description: "Array of subfolder IDs in the folder's display order",
            },
            lastUpdatedBy: {
              type: "string",
              description: "User ID who last updated the folder",
            },
          },
          description: "Data about the updated folder",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
          },
          description: "Metadata about the folder update operation",
        },
        model_id: {
          type: "string",
          description: "The model ID of the updated folder",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_folders_comment",
    operationType: "write",
    description:
      "Tool to update a comment on a folder. Use when you need to modify the text content of an existing comment on a specific folder in a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "folder_uid", "comment_id", "body"],
      properties: {
        body: {
          type: "string",
          description: "The updated text content of the comment.",
        },
        comment_id: {
          type: "string",
          description: "The unique identifier of the comment to update.",
        },
        folder_uid: {
          type: "string",
          description: "The unique identifier (UID) of the folder containing the comment.",
        },
        collection_uid: {
          type: "string",
          description: "The unique identifier (UID) of the collection containing the folder.",
        },
      },
      description: "Request parameters to update a comment on a folder.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "The comment's unique ID",
            },
            body: {
              type: "string",
              description: "The updated text content of the comment",
            },
            status: {
              type: "string",
              description: "The status of the comment",
            },
            thread_id: {
              type: "integer",
              description: "The thread ID this comment belongs to",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the comment was created",
            },
            created_by: {
              type: "integer",
              description: "The ID of the user who created the comment",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the comment was last updated",
            },
          },
          description: "The updated comment object with all its details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_mock_server",
    operationType: "write",
    description:
      "Tool to update an existing mock server. Use when you need to change a mock server's name, collection, environment, or privacy settings. The collection UID is required for all updates.",
    inputSchema: {
      type: "object",
      required: ["mock_id", "mock"],
      properties: {
        mock: {
          type: "object",
          required: ["collection"],
          properties: {
            name: {
              type: "string",
              description: "The new name for the mock server",
            },
            private: {
              type: "boolean",
              description: "Whether the mock server should be private. Private mocks require API key authentication.",
            },
            collection: {
              type: "string",
              description:
                "The collection UID (format: userId-collectionId) to associate with the mock server. This is required when updating a mock server.",
            },
            environment: {
              type: "string",
              description: "The environment UID to use with the mock server",
            },
          },
          description:
            "Mock server configuration containing the collection UID (required), and optional name, environment UID, and privacy setting",
          additionalProperties: false,
        },
        mock_id: {
          type: "string",
          description: "The unique identifier of the mock server to update",
        },
      },
      description: "Request parameters for updating an existing mock server.",
    },
    outputSchema: {
      type: "object",
      properties: {
        mock: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the mock server",
            },
            uid: {
              type: "string",
              description: "Unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "Name of the mock server",
            },
            owner: {
              type: "string",
              description: "User ID of the mock server owner",
            },
            config: {
              type: "object",
              properties: {
                delay: {
                  anyOf: [
                    {
                      type: "integer",
                      description: "The Delay option 1 value.",
                    },
                    {
                      type: "string",
                      description: "The Delay option 2 value.",
                    },
                  ],
                  description: "Delay in milliseconds before responding",
                },
                headers: {
                  type: "array",
                  items: {
                    description: "The Header value.",
                  },
                  description: "Custom headers for the mock server",
                },
                matchBody: {
                  type: "boolean",
                  description: "Whether to match request body",
                },
                matchHeader: {
                  type: "boolean",
                  description: "Whether to match request headers",
                },
                matchWildcards: {
                  type: "boolean",
                  description: "Whether to match wildcards",
                },
                matchQueryParams: {
                  type: "boolean",
                  description: "Whether to match query parameters",
                },
                serverResponseId: {
                  type: "string",
                  description: "Server response ID if configured",
                },
              },
              description: "Configuration settings for the mock server",
            },
            mockUrl: {
              type: "string",
              description: "URL of the mock server that can be used to make requests",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the mock server was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the mock server was last updated",
            },
            collection: {
              type: "string",
              description: "Collection ID associated with this mock server",
            },
            environment: {
              type: "string",
              description: "Environment ID associated with this mock server (if applicable)",
            },
          },
          description:
            "Updated mock server object with details including id, name, uid, owner, collection, environment, mockUrl, createdAt, updatedAt, and config",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_monitor",
    operationType: "write",
    description:
      "Tool to update an existing monitor in Postman. Use when you need to modify monitor properties like name, active status, collection, environment, options, notifications, or distribution settings.",
    inputSchema: {
      type: "object",
      required: ["monitor_id", "monitor"],
      properties: {
        monitor: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The monitor's name. Update this field to change the monitor's display name.",
            },
            active: {
              type: "boolean",
              description: "Whether the monitor is active. Set to true to enable or false to disable the monitor.",
            },
            options: {
              type: "object",
              properties: {
                strictSSL: {
                  type: "boolean",
                  description: "Whether to enforce strict SSL certificate validation",
                },
                requestDelay: {
                  type: "integer",
                  description: "Delay between requests in milliseconds",
                },
                requestTimeout: {
                  type: "integer",
                  description: "Request timeout in milliseconds",
                },
                followRedirects: {
                  type: "boolean",
                  description: "Whether to follow HTTP redirects",
                },
              },
              description: "Monitor options configuration.",
              additionalProperties: false,
            },
            distribution: {
              type: "array",
              items: {
                type: "string",
                description: "The Distribution value.",
              },
              description: "Distribution/region settings for where the monitor should run",
            },
            collectionUid: {
              type: "string",
              description: "The collection UID to monitor. Update to change which collection the monitor runs.",
            },
            notifications: {
              type: "object",
              properties: {
                onError: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      email: {
                        type: "string",
                        description: "Email address of the recipient",
                      },
                    },
                    description: "Notification recipient configuration.",
                  },
                  description: "Array of recipients to notify on error",
                },
                onFailure: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      email: {
                        type: "string",
                        description: "Email address of the recipient",
                      },
                    },
                    description: "Notification recipient configuration.",
                  },
                  description: "Array of recipients to notify on failure",
                },
              },
              description: "Monitor notification settings.",
              additionalProperties: false,
            },
            environmentUid: {
              type: "string",
              description:
                "The environment UID to use with the monitor. Update to change the environment or set to null to remove.",
            },
          },
          description:
            "The monitor object containing fields to update. All fields are optional - only include fields you want to update.",
          additionalProperties: false,
        },
        monitor_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the monitor to update",
        },
      },
      description: "Request model for updating a monitor.",
    },
    outputSchema: {
      type: "object",
      properties: {
        monitor: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the monitor",
            },
            uid: {
              type: "string",
              description: "The unique identifier with team/user prefix",
            },
            name: {
              type: "string",
              description: "The name of the monitor",
            },
          },
          description: "The updated monitor object with id, name, and uid",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_pull_request",
    operationType: "write",
    description:
      "Tool to update an open pull request in Postman. Use when you need to modify the title, description, source, destination, or reviewers of an existing pull request. All fields must be provided in the request.",
    inputSchema: {
      type: "object",
      required: ["pull_request_id", "title", "description", "source_id", "destination_id", "reviewers"],
      properties: {
        title: {
          type: "string",
          description: "The updated title of the pull request. This should summarize the changes being proposed.",
        },
        reviewers: {
          type: "array",
          items: {
            type: "string",
            description: "The Reviewer value.",
          },
          description:
            "Array of reviewer user IDs who should review the pull request. Can be an empty array if no specific reviewers are required. This field is required even when updating a pull request.",
        },
        source_id: {
          type: "string",
          description:
            "The UID of the source collection (forked collection). Format: {owner}-{collectionId}. This field is required even when updating a pull request.",
        },
        description: {
          type: "string",
          description:
            "The updated description for the pull request. Provides context for reviewers about the changes.",
        },
        destination_id: {
          type: "string",
          description:
            "The UID of the destination collection (parent collection). Format: {owner}-{collectionId}. This field is required even when updating a pull request.",
        },
        pull_request_id: {
          type: "string",
          description:
            "The unique identifier of the pull request to update. This is the pull request ID returned when the pull request was created.",
        },
      },
      description: "Request parameters for updating a pull request.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the updated pull request",
            },
            title: {
              type: "string",
              description: "Updated title of the pull request",
            },
            status: {
              type: "string",
              description: "Current status of the pull request (e.g., 'open', 'merged', 'declined')",
            },
            reviewers: {
              type: "array",
              items: {
                type: "string",
                description: "The Reviewer value.",
              },
              description: "Array of reviewer user IDs assigned to the pull request",
            },
            source_id: {
              type: "string",
              description: "Source collection ID (the forked collection)",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the pull request was created",
            },
            created_by: {
              type: "integer",
              description: "User ID of the pull request creator",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the pull request was last updated",
            },
            description: {
              type: "string",
              description: "Updated description of the pull request",
            },
            destination_id: {
              type: "string",
              description: "Destination collection ID (the parent collection)",
            },
          },
          description: "The updated pull request object containing details about the pull request",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_request",
    operationType: "write",
    description:
      "Tool to update a request in a Postman collection. Use when you need to modify an existing request's name, method, URL, headers, or body following the Postman Collection Format.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "request_id"],
      properties: {
        name: {
          type: "string",
          description: "The updated name of the request",
        },
        request: {
          type: "object",
          required: ["method", "url"],
          properties: {
            url: {
              type: "string",
              description: "The request URL",
            },
            body: {
              type: "object",
              properties: {
                raw: {
                  type: "string",
                  description: "The raw body content when mode is 'raw'",
                },
                mode: {
                  type: "string",
                  description: "The mode of the request body (e.g., 'raw', 'urlencoded', 'formdata')",
                },
                formdata: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Formdata item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Formdata item option 2 value.",
                        },
                      ],
                      description: "The Formdata item value.",
                    },
                    description: "The Formdata object.",
                  },
                  description: "Form data key-value pairs when mode is 'formdata'",
                },
                urlencoded: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: {
                      anyOf: [
                        {
                          type: "string",
                          description: "The Urlencoded item option 1 value.",
                        },
                        {
                          type: "boolean",
                          description: "The Urlencoded item option 2 value.",
                        },
                      ],
                      description: "The Urlencoded item value.",
                    },
                    description: "The Urlencoded object.",
                  },
                  description: "URL-encoded key-value pairs when mode is 'urlencoded'",
                },
              },
              description: "Body object for the request.",
              additionalProperties: false,
            },
            header: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The header key/name",
                  },
                  value: {
                    type: "string",
                    description: "The header value",
                  },
                  disabled: {
                    type: "boolean",
                    description: "Whether this header is disabled",
                  },
                },
                description: "Header object for the request.",
              },
              description: "Array of header objects for the request",
            },
            method: {
              type: "string",
              description: "HTTP method for the request",
            },
            description: {
              type: "string",
              description: "Description of the request",
            },
          },
          description: "Request object following Postman Collection Format.",
          additionalProperties: false,
        },
        request_id: {
          type: "string",
          description: "The unique identifier of the request to update",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the request",
        },
      },
      description: "Request model for updating a request in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the updated request",
            },
            url: {
              type: "string",
              description: "The URL of the request",
            },
            name: {
              type: "string",
              description: "The name of the updated request",
            },
            owner: {
              type: "string",
              description: "The owner ID of the request",
            },
            folder: {
              type: "string",
              description: "The folder ID if the request is in a folder",
            },
            method: {
              type: "string",
              description: "The HTTP method of the request",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  anyOf: [
                    {
                      type: "string",
                      description: "The Header item option 1 value.",
                    },
                    {
                      type: "boolean",
                      description: "The Header item option 2 value.",
                    },
                  ],
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "List of headers in the request",
            },
            dataMode: {
              type: "string",
              description: "The data mode of the request body",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the request was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the request was last updated",
            },
            collection: {
              type: "string",
              description: "The collection ID containing this request",
            },
          },
          description: "Data about the updated request",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_requests_comment",
    operationType: "write",
    description:
      "Tool to update a comment on a request. Use when you need to modify the text content of an existing comment on a specific request within a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "request_uid", "comment_id", "body"],
      properties: {
        body: {
          type: "string",
          description: "The updated text content of the comment.",
        },
        comment_id: {
          type: "integer",
          description: "The comment's unique identifier. This is the ID of the comment to update.",
        },
        request_uid: {
          type: "string",
          description: "The request's unique ID (UID). This identifies the specific request containing the comment.",
        },
        collection_uid: {
          type: "string",
          description: "The collection's unique ID (UID). This identifies the collection containing the request.",
        },
      },
      description: "Request parameters to update a comment on a request.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description: "The comment's unique ID",
        },
        body: {
          type: "string",
          description: "The updated text content of the comment",
        },
        status: {
          type: "string",
          description: "The status of the comment (e.g., 'Open')",
        },
        thread_id: {
          type: "integer",
          description: "The thread ID this comment belongs to",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was created",
        },
        created_by: {
          type: "integer",
          description: "The ID of the user who created the comment",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was last updated",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_response",
    operationType: "write",
    description:
      "Tool to update a response in a Postman collection. Use when you need to modify properties of an existing saved response example such as name, status, code, headers, cookies, or body.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "response_id", "response"],
      properties: {
        response: {
          type: "object",
          properties: {
            body: {
              type: "string",
              description: "The response body as a string",
            },
            code: {
              type: "integer",
              description: "The HTTP status code",
            },
            name: {
              type: "string",
              description: "The name of the response example",
            },
            cookie: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The cookie key name",
                  },
                  value: {
                    type: "string",
                    description: "The cookie value",
                  },
                },
                description: "A single cookie key-value pair.",
              },
              description: "Array of cookie objects with key and value properties",
            },
            header: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The header key name",
                  },
                  value: {
                    type: "string",
                    description: "The header value",
                  },
                },
                description: "A single header key-value pair.",
              },
              description: "Array of header objects with key and value properties",
            },
            status: {
              type: "string",
              description: "The status text (e.g., OK, Not Found, Bad Request)",
            },
            originalRequest: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL of the original request",
                },
                method: {
                  type: "string",
                  description: "HTTP method of the request (GET, POST, PUT, DELETE, etc.)",
                },
              },
              description: "The original request object structure.",
              additionalProperties: false,
            },
          },
          description:
            "The response object containing the properties to update. Can include name, status, code, header, cookie, body, originalRequest, etc.",
          additionalProperties: false,
        },
        response_id: {
          type: "string",
          description: "The unique identifier of the response to update",
        },
        collection_id: {
          type: "string",
          description: "The unique identifier of the collection containing the response",
        },
      },
      description: "Request parameters for updating a response in a collection.",
    },
    outputSchema: {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the response",
            },
            mime: {
              type: "string",
              description: "The MIME type of the response",
            },
            name: {
              type: "string",
              description: "The name of the response",
            },
            text: {
              type: "string",
              description: "The response body text",
            },
            time: {
              type: "number",
              description: "The response time",
            },
            owner: {
              type: "string",
              description: "The owner ID of the response",
            },
            status: {
              type: "string",
              description: "The status text of the response",
            },
            cookies: {
              type: "array",
              items: {
                description: "The Cookie value.",
              },
              description: "List of cookies in the response",
            },
            headers: {
              type: "array",
              items: {
                description: "The Header value.",
              },
              description: "List of response headers",
            },
            request: {
              type: "string",
              description: "The request ID associated with this response",
            },
            language: {
              type: "string",
              description: "The language of the response",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the response was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the response was last updated",
            },
            rawDataType: {
              type: "string",
              description: "The raw data type of the response",
            },
            lastRevision: {
              type: "integer",
              description: "The revision number of the response",
            },
            responseCode: {
              type: "integer",
              description: "The HTTP response code",
            },
            lastUpdatedBy: {
              type: "string",
              description: "User ID who last updated the response",
            },
            requestObject: {
              type: "object",
              description: "The request object associated with this response",
              additionalProperties: true,
            },
          },
          description: "Data about the updated response",
        },
        meta: {
          type: "object",
          properties: {
            model: {
              type: "string",
              description: "The model type",
            },
            action: {
              type: "string",
              description: "The action performed",
            },
          },
          description: "Metadata about the response operation",
        },
        model_id: {
          type: "string",
          description: "The ID of the updated response",
        },
        revision: {
          type: "integer",
          description: "The revision number of the collection after update",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_responses_comment",
    operationType: "write",
    description:
      "Tool to update a comment on a response. Use when you need to modify the text content of an existing comment on a specific response within a collection.",
    inputSchema: {
      type: "object",
      required: ["collection_uid", "response_uid", "comment_id", "body"],
      properties: {
        body: {
          type: "string",
          description: "The updated text content of the comment.",
        },
        comment_id: {
          type: "string",
          description: "The unique identifier of the comment to update.",
        },
        response_uid: {
          type: "string",
          description: "The unique identifier (UID) of the response containing the comment.",
        },
        collection_uid: {
          type: "string",
          description: "The unique identifier (UID) of the collection containing the response.",
        },
      },
      description: "Request parameters to update a comment on a response.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "integer",
          description: "The comment's unique ID",
        },
        body: {
          type: "string",
          description: "The updated text content of the comment",
        },
        status: {
          type: "string",
          description: "The status of the comment",
        },
        thread_id: {
          type: "integer",
          description: "The thread ID this comment belongs to",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was created",
        },
        created_by: {
          type: "integer",
          description: "The ID of the user who created the comment",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the comment was last updated",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_server_response",
    operationType: "write",
    description:
      "Tool to update a mock server's server response. Use when you need to modify properties of an existing server response such as name, status code, language, body, or headers. At least one property must be included in the update request.",
    inputSchema: {
      type: "object",
      required: ["mock_id", "server_response_id", "server_response"],
      properties: {
        mock_id: {
          type: "string",
          description: "The mock server's unique identifier (UUID format)",
        },
        server_response: {
          type: "object",
          properties: {
            body: {
              type: "string",
              description: "The response body content as a string",
            },
            name: {
              type: "string",
              description: "The name of the server response",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                required: ["key", "value"],
                properties: {
                  key: {
                    type: "string",
                    description: "The header key name",
                  },
                  value: {
                    type: "string",
                    description: "The header value",
                  },
                },
                description: "A single header key-value pair.",
              },
              description: "Array of header objects with key and value properties to include in the response",
            },
            language: {
              type: "string",
              description: "The language/format of the response body (e.g., json, html, text, xml)",
            },
            status_code: {
              type: "integer",
              description: "The HTTP status code for the server response",
            },
          },
          description:
            "The server response object containing the properties to update. Include at least one property: name, status_code, language, body, or headers.",
          additionalProperties: false,
        },
        server_response_id: {
          type: "string",
          description: "The server response's unique identifier (UUID format) to update",
        },
      },
      description: "Request parameters for updating a mock server's server response.",
    },
    outputSchema: {
      type: "object",
      properties: {
        serverResponse: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the server response",
            },
            uid: {
              type: "string",
              description: "The unique identifier (uid) of the server response",
            },
            body: {
              type: "string",
              description: "The response body content",
            },
            name: {
              type: "string",
              description: "The name of the server response",
            },
            headers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: {
                  type: "string",
                  description: "The Header item value.",
                },
                description: "The Header object.",
              },
              description: "Array of response headers",
            },
            language: {
              type: "string",
              description: "The language/format of the response body",
            },
            createdAt: {
              type: "string",
              description: "ISO 8601 timestamp when the server response was created",
            },
            updatedAt: {
              type: "string",
              description: "ISO 8601 timestamp when the server response was last updated",
            },
            statusCode: {
              type: "integer",
              description: "The HTTP status code of the server response",
            },
          },
          description: "Details of the updated server response",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_specs_properties",
    operationType: "write",
    description:
      "Tool to update an API specification's properties such as its name. Use when you need to modify metadata of an existing spec.",
    inputSchema: {
      type: "object",
      required: ["spec_id"],
      properties: {
        name: {
          type: "string",
          description: "The new name for the API specification",
        },
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification to update. This is a UUID format string.",
        },
      },
      description: "Request model for updating API specification properties.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier of the specification",
        },
        name: {
          type: "string",
          description: "Name of the specification",
        },
        type: {
          type: "string",
          description: "Type of specification (e.g., 'OPENAPI:3.0')",
        },
        createdAt: {
          type: "string",
          description: "ISO 8601 timestamp when the spec was created",
        },
        createdBy: {
          type: "integer",
          description: "User ID who created the spec",
        },
        updatedAt: {
          type: "string",
          description: "ISO 8601 timestamp when the spec was last updated",
        },
        updatedBy: {
          type: "integer",
          description: "User ID who last updated the spec",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_spec_file",
    operationType: "write",
    description:
      "Tool to update an API specification file's content. Use when you need to modify the contents of a specific file within a spec.",
    inputSchema: {
      type: "object",
      required: ["spec_id", "file_path", "content"],
      properties: {
        content: {
          type: "string",
          description: "The updated content of the spec file in YAML or JSON format",
        },
        spec_id: {
          type: "string",
          description: "The unique identifier of the API specification",
        },
        file_path: {
          type: "string",
          description:
            "The path of the file within the spec to update (e.g., 'openapi.yaml', 'components/schemas.yaml')",
        },
      },
      description: "Request model for updating a spec file's contents.",
    },
    outputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The unique identifier of the file",
        },
        name: {
          type: "string",
          description: "The name of the file",
        },
        path: {
          type: "string",
          description: "The path of the file within the specification",
        },
        type: {
          type: "string",
          description: "The type of file (e.g., 'ROOT')",
        },
        created_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was created",
        },
        created_by: {
          type: "integer",
          description: "User ID who created the file",
        },
        updated_at: {
          type: "string",
          description: "ISO 8601 timestamp when the file was last updated",
        },
        updated_by: {
          type: "integer",
          description: "User ID who last updated the file",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_a_workspace",
    operationType: "write",
    description:
      "Tool to update an existing workspace in Postman. Use when you need to modify the name, type, or description of a workspace. The 'type' field is required for all updates.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "workspace"],
      properties: {
        workspace: {
          type: "object",
          required: ["type"],
          properties: {
            name: {
              type: "string",
              description: "The name of the workspace. Update this field to change the workspace's display name.",
            },
            type: {
              type: "string",
              description:
                "The type of the workspace. Required field. Valid values are 'personal', 'team', or 'public'.",
            },
            description: {
              type: "string",
              description: "A description of the workspace. Update to change the workspace's description.",
            },
          },
          description:
            "The workspace object containing fields to update. The 'type' field is required, while 'name' and 'description' are optional.",
          additionalProperties: false,
        },
        workspace_id: {
          type: "string",
          description:
            "The unique identifier of the workspace to update. This is the workspace ID returned when the workspace was created.",
        },
      },
      description: "Request model for updating a workspace.",
    },
    outputSchema: {
      type: "object",
      properties: {
        workspace: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The unique identifier of the workspace",
            },
            name: {
              type: "string",
              description: "The name of the workspace",
            },
            type: {
              type: "string",
              description: "The type of the workspace (personal, team, or public)",
            },
            created_at: {
              type: "string",
              description: "ISO 8601 timestamp when the workspace was created",
            },
            created_by: {
              type: "string",
              description: "User ID of who created the workspace",
            },
            updated_at: {
              type: "string",
              description: "ISO 8601 timestamp when the workspace was last updated",
            },
            updated_by: {
              type: "string",
              description: "User ID of who last updated the workspace",
            },
            visibility: {
              type: "string",
              description: "Visibility setting of the workspace",
            },
            description: {
              type: "string",
              description: "The description of the workspace",
            },
          },
          description: "The updated workspace object with all details",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_global_variables",
    operationType: "destructive",
    description:
      "Tool to update and replace a workspace's global variables. Use when you need to set or replace all global variables in a workspace. Note: This endpoint replaces all existing global variables with the provided list.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "values"],
      properties: {
        values: {
          type: "array",
          items: {
            type: "object",
            required: ["key", "value"],
            properties: {
              key: {
                type: "string",
                description: "The name/key of the global variable",
              },
              type: {
                type: "string",
                default: "default",
                description:
                  "The type of the global variable. Typically 'default' for standard variables or 'secret' for sensitive data",
              },
              value: {
                type: "string",
                description: "The value of the global variable",
              },
              enabled: {
                type: "boolean",
                default: true,
                description: "Whether the global variable is enabled or not",
              },
            },
            description: "Individual global variable to be set.",
          },
          description:
            "Array of global variable objects to set. This replaces all existing global variables in the workspace with the provided list.",
        },
        workspace_id: {
          type: "string",
          description:
            "The unique identifier of the workspace to update global variables for. Can be obtained from the GET /workspaces endpoint.",
        },
      },
      description: "Request parameters for updating workspace global variables.",
    },
    outputSchema: {
      type: "object",
      properties: {
        values: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description: "The name/key of the global variable",
              },
              type: {
                type: "string",
                description: "The type of the global variable (e.g., 'default', 'secret')",
              },
              value: {
                type: "string",
                description: "The value of the global variable",
              },
              enabled: {
                type: "boolean",
                description: "Whether the global variable is enabled or not",
              },
            },
            description: "Individual global variable information returned from the API.",
          },
          description: "Array of updated global variable objects, each containing key, value, enabled, and type fields",
        },
      },
      description: "Data from the action execution",
    },
  },
  {
    name: "update_part_of_a_collection",
    operationType: "write",
    description:
      "Tool to update specific collection properties like name, description, authentication, variables, or events. Use when you need to partially update a collection without replacing the entire collection structure. Returns the updated collection information after the changes are applied.",
    inputSchema: {
      type: "object",
      required: ["collection_id", "collection"],
      properties: {
        collection: {
          type: "object",
          properties: {
            auth: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "The type of authentication (e.g., 'apikey', 'bearer', 'basic', 'oauth2')",
                },
              },
              description: "Authentication configuration to update.",
              additionalProperties: false,
            },
            info: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "The new name for the collection",
                },
                description: {
                  type: "string",
                  description: "The new description for the collection",
                },
              },
              description: "Collection metadata to update.",
              additionalProperties: false,
            },
            event: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  listen: {
                    type: "string",
                    description: "When the script runs (e.g., 'prerequest', 'test')",
                  },
                  script: {
                    type: "object",
                    properties: {
                      exec: {
                        type: "array",
                        items: {
                          type: "string",
                          description: "The Exec value.",
                        },
                        description: "Array of script lines to execute",
                      },
                      type: {
                        type: "string",
                        description: "The script language type (e.g., 'text/javascript')",
                      },
                    },
                    description: "Script configuration for an event.",
                    additionalProperties: false,
                  },
                },
                description: "Event script to update in the collection.",
              },
              description: "Collection-level event scripts to update or add",
            },
            variable: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: {
                    type: "string",
                    description: "The variable name/key",
                  },
                  type: {
                    type: "string",
                    description: "The type of the variable (e.g., 'string', 'secret')",
                  },
                  value: {
                    type: "string",
                    description: "The variable value",
                  },
                },
                description: "Variable to update or add at the collection level.",
              },
              description: "Collection-level variables to update or add",
            },
          },
          description:
            "The collection object containing the properties to update. Can include info (with name, description), auth, variables, or events properties. Only the specified properties will be updated.",
          additionalProperties: false,
        },
        collection_id: {
          type: "string",
          description: "The unique identifier (ID or UID) of the collection to update",
        },
      },
      description: "Request parameters for updating specific collection properties.",
    },
    outputSchema: {
      type: "object",
      properties: {
        collection: {
          type: "object",
          properties: {
            auth: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "The type of authentication",
                },
              },
              description: "Authentication configuration for the collection",
            },
            info: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "The name of the collection",
                },
                schema: {
                  type: "string",
                  description: "The schema URL for the collection format",
                },
                updatedAt: {
                  type: "string",
                  description: "ISO 8601 timestamp when the collection was last updated",
                },
                _postman_id: {
                  type: "string",
                  description: "The collection's unique Postman identifier",
                },
                description: {
                  type: "string",
                  description: "A description of the collection",
                },
              },
              description: "Metadata about the collection",
            },
            event: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  listen: {
                    type: "string",
                    description: "When the script runs",
                  },
                  script: {
                    type: "object",
                    properties: {
                      exec: {
                        type: "array",
                        items: {
                          type: "string",
                          description: "The Exec value.",
                        },
                        description: "Array of script lines to execute",
                      },
                      type: {
                        type: "string",
                        description: "The script language type",
                      },
                    },
                    description: "The script configuration and code",
                  },
                },
                description: "Event script in the response.",
              },
              description: "Collection-level event scripts",
            },
            variable: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "The unique identifier for the variable",
                  },
                  key: {
                    type: "string",
                    description: "The variable name/key",
                  },
                  type: {
                    type: "string",
                    description: "The type of the variable",
                  },
                  value: {
                    type: "string",
                    description: "The variable value",
                  },
                },
                description: "Variable in the response.",
              },
              description: "Collection-level variables",
            },
          },
          description: "The updated collection object with the modified properties",
        },
      },
      description: "Data from the action execution",
    },
  },
] as const;
