import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

export interface GorgiasGeneratedActionSchema {
  name: string;
  readonly operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export const gorgiasGeneratedActionSchemas: GorgiasGeneratedActionSchema[] = [
  {
    name: "get_account",
    operationType: "read",
    description: "Retrieve the current Gorgias helpdesk account.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      description: "Input parameters for retrieving the current Gorgias account.",
    },
    outputSchema: {
      type: "object",
      properties: {
        account: {
          type: "object",
          properties: {
            domain: {
              type: ["string", "null"],
              description: "Gorgias account domain.",
            },
            status: {
              type: ["string", "null"],
              description: "Gorgias account status when returned.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Gorgias object.",
            },
          },
          required: ["domain", "status", "raw"],
          additionalProperties: false,
          description: "A normalized Gorgias account summary.",
        },
      },
      required: ["account"],
      additionalProperties: false,
      description: "The normalized Gorgias account response.",
    },
  },
  {
    name: "list_users",
    operationType: "read",
    description: "List Gorgias users with documented filters and ordering.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          minLength: 1,
          description: "A Gorgias cursor returned by a previous paginated response.",
        },
        externalId: {
          type: "string",
          minLength: 1,
          description: "ID of the user in a foreign system to filter by.",
        },
        email: {
          type: "string",
          format: "email",
          description: "Email address of the user to filter by.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum number of Gorgias records to return.",
        },
        orderBy: {
          type: "string",
          enum: [
            "created_datetime:asc",
            "created_datetime:desc",
            "name:asc",
            "name:desc",
            "email:asc",
            "email:desc",
            "role.name:asc",
            "role.name:desc",
          ],
          description: "Attribute and direction used to order Gorgias users.",
        },
        roles: {
          type: "array",
          items: {
            type: "string",
            enum: ["admin", "agent", "basic-agent", "bot", "internal-agent", "lite-agent", "observer-agent"],
            description: "A Gorgias user role filter.",
          },
          minItems: 1,
          description: "Gorgias roles used to filter users.",
        },
        search: {
          type: "string",
          minLength: 1,
          description: "Text used to search user names or email addresses.",
        },
        availableFirst: {
          type: "boolean",
          description: "Whether available users should be returned before non-available users.",
        },
      },
      additionalProperties: false,
      description: "Input parameters for listing Gorgias users.",
    },
    outputSchema: {
      type: "object",
      properties: {
        users: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "Gorgias user identifier.",
              },
              email: {
                type: ["string", "null"],
                description: "User email address.",
              },
              name: {
                type: ["string", "null"],
                description: "User display name.",
              },
              active: {
                type: ["boolean", "null"],
                description: "Whether the user can log in.",
              },
              roleName: {
                type: ["string", "null"],
                description: "The user's Gorgias role name.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Gorgias object.",
              },
            },
            required: ["id", "email", "name", "active", "roleName", "raw"],
            additionalProperties: false,
            description: "A normalized Gorgias user summary.",
          },
          description: "Gorgias users returned by the request.",
        },
      },
      required: ["users"],
      additionalProperties: false,
      description: "The normalized Gorgias users response.",
    },
  },
  {
    name: "list_customers",
    operationType: "read",
    description: "List Gorgias customers with cursor pagination and lookup filters.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          minLength: 1,
          description: "A Gorgias cursor returned by a previous paginated response.",
        },
        email: {
          type: "string",
          format: "email",
          description: "Primary customer email address to filter by.",
        },
        externalId: {
          type: "string",
          minLength: 1,
          description: "ID of the customer in a foreign system to filter by.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum number of Gorgias records to return.",
        },
      },
      additionalProperties: false,
      description: "Input parameters for listing Gorgias customers.",
    },
    outputSchema: {
      type: "object",
      properties: {
        customers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "Gorgias customer identifier.",
              },
              email: {
                type: ["string", "null"],
                description: "Primary email address of the customer.",
              },
              name: {
                type: ["string", "null"],
                description: "Customer display name.",
              },
              externalId: {
                type: ["string", "null"],
                description: "Customer identifier in a foreign system.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Gorgias object.",
              },
            },
            required: ["id", "email", "name", "externalId", "raw"],
            additionalProperties: false,
            description: "A normalized Gorgias customer summary.",
          },
          description: "Gorgias customers returned for the current page.",
        },
        pagination: {
          type: "object",
          properties: {
            previousCursor: {
              type: ["string", "null"],
              description: "Cursor for the previous page when Gorgias returns one.",
            },
            nextCursor: {
              type: ["string", "null"],
              description: "Cursor for the next page when Gorgias returns one.",
            },
            totalResources: {
              type: ["integer", "null"],
              description: "Total number of matching resources when returned.",
            },
          },
          required: ["previousCursor", "nextCursor", "totalResources"],
          additionalProperties: false,
          description: "Cursor pagination metadata returned by Gorgias.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Gorgias object.",
        },
      },
      required: ["customers", "pagination", "raw"],
      additionalProperties: false,
      description: "The normalized Gorgias customers response.",
    },
  },
  {
    name: "list_tickets",
    operationType: "read",
    description: "List Gorgias tickets with cursor pagination and common filters.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          minLength: 1,
          description: "A Gorgias cursor returned by a previous paginated response.",
        },
        customerId: {
          type: "integer",
          exclusiveMinimum: 0,
          description: "Gorgias customer identifier used to filter tickets.",
        },
        trashed: {
          type: "boolean",
          description: "Whether to include trashed tickets in the response.",
        },
        externalId: {
          type: "string",
          minLength: 1,
          description: "ID of the ticket in a foreign system to filter by.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum number of Gorgias records to return.",
        },
        viewId: {
          type: "integer",
          exclusiveMinimum: 0,
          description: "Gorgias view identifier used to select tickets.",
        },
        ruleId: {
          type: "integer",
          exclusiveMinimum: 0,
          description: "Gorgias rule identifier used to select tickets.",
        },
        ticketIds: {
          type: "array",
          items: {
            type: "integer",
            exclusiveMinimum: 0,
            description: "A Gorgias ticket identifier.",
          },
          minItems: 1,
          maxItems: 100,
          description: "Specific Gorgias ticket identifiers to select.",
        },
        orderBy: {
          type: "string",
          enum: ["created_datetime:asc", "created_datetime:desc", "updated_datetime:asc", "updated_datetime:desc"],
          description: "Attribute and direction used to order Gorgias tickets.",
        },
      },
      additionalProperties: false,
      description: "Input parameters for listing Gorgias tickets.",
    },
    outputSchema: {
      type: "object",
      properties: {
        tickets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "Gorgias ticket identifier.",
              },
              subject: {
                type: ["string", "null"],
                description: "Ticket subject.",
              },
              status: {
                type: ["string", "null"],
                description: "Ticket status returned by Gorgias.",
              },
              channel: {
                type: ["string", "null"],
                description: "Ticket channel returned by Gorgias.",
              },
              customer: {
                type: ["object", "null"],
                properties: {
                  id: {
                    type: ["integer", "null"],
                    description: "Gorgias customer identifier.",
                  },
                  email: {
                    type: ["string", "null"],
                    description: "Primary email address of the customer.",
                  },
                  name: {
                    type: ["string", "null"],
                    description: "Customer display name.",
                  },
                  externalId: {
                    type: ["string", "null"],
                    description: "Customer identifier in a foreign system.",
                  },
                  raw: {
                    type: "object",
                    properties: {},
                    additionalProperties: true,
                    description: "The raw Gorgias object.",
                  },
                },
                required: ["id", "email", "name", "externalId", "raw"],
                additionalProperties: false,
                description: "A normalized Gorgias customer summary.",
              },
              createdDatetime: {
                type: ["string", "null"],
                description: "Ticket creation timestamp returned by Gorgias.",
              },
              updatedDatetime: {
                type: ["string", "null"],
                description: "Ticket update timestamp returned by Gorgias.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Gorgias object.",
              },
            },
            required: ["id", "subject", "status", "channel", "customer", "createdDatetime", "updatedDatetime", "raw"],
            additionalProperties: false,
            description: "A normalized Gorgias ticket summary.",
          },
          description: "Gorgias tickets returned for the current page.",
        },
        pagination: {
          type: "object",
          properties: {
            previousCursor: {
              type: ["string", "null"],
              description: "Cursor for the previous page when Gorgias returns one.",
            },
            nextCursor: {
              type: ["string", "null"],
              description: "Cursor for the next page when Gorgias returns one.",
            },
            totalResources: {
              type: ["integer", "null"],
              description: "Total number of matching resources when returned.",
            },
          },
          required: ["previousCursor", "nextCursor", "totalResources"],
          additionalProperties: false,
          description: "Cursor pagination metadata returned by Gorgias.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Gorgias object.",
        },
      },
      required: ["tickets", "pagination", "raw"],
      additionalProperties: false,
      description: "The normalized Gorgias tickets response.",
    },
  },
  {
    name: "get_ticket",
    operationType: "read",
    description: "Retrieve one Gorgias ticket by identifier.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        ticketId: {
          type: "integer",
          exclusiveMinimum: 0,
          description: "Gorgias ticket identifier.",
        },
        relationships: {
          type: "array",
          items: {
            type: "string",
            enum: ["custom_fields"],
            description: "A Gorgias ticket relation to include in the returned ticket.",
          },
          minItems: 1,
          description: "Gorgias ticket relations to include in the returned ticket.",
        },
      },
      required: ["ticketId"],
      additionalProperties: false,
      description: "Input parameters for retrieving a single Gorgias ticket.",
    },
    outputSchema: {
      type: "object",
      properties: {
        ticket: {
          type: "object",
          properties: {
            id: {
              type: ["integer", "null"],
              description: "Gorgias ticket identifier.",
            },
            subject: {
              type: ["string", "null"],
              description: "Ticket subject.",
            },
            status: {
              type: ["string", "null"],
              description: "Ticket status returned by Gorgias.",
            },
            channel: {
              type: ["string", "null"],
              description: "Ticket channel returned by Gorgias.",
            },
            customer: {
              type: ["object", "null"],
              properties: {
                id: {
                  type: ["integer", "null"],
                  description: "Gorgias customer identifier.",
                },
                email: {
                  type: ["string", "null"],
                  description: "Primary email address of the customer.",
                },
                name: {
                  type: ["string", "null"],
                  description: "Customer display name.",
                },
                externalId: {
                  type: ["string", "null"],
                  description: "Customer identifier in a foreign system.",
                },
                raw: {
                  type: "object",
                  properties: {},
                  additionalProperties: true,
                  description: "The raw Gorgias object.",
                },
              },
              required: ["id", "email", "name", "externalId", "raw"],
              additionalProperties: false,
              description: "A normalized Gorgias customer summary.",
            },
            createdDatetime: {
              type: ["string", "null"],
              description: "Ticket creation timestamp returned by Gorgias.",
            },
            updatedDatetime: {
              type: ["string", "null"],
              description: "Ticket update timestamp returned by Gorgias.",
            },
            raw: {
              type: "object",
              properties: {},
              additionalProperties: true,
              description: "The raw Gorgias object.",
            },
          },
          required: ["id", "subject", "status", "channel", "customer", "createdDatetime", "updatedDatetime", "raw"],
          additionalProperties: false,
          description: "A normalized Gorgias ticket summary.",
        },
      },
      required: ["ticket"],
      additionalProperties: false,
      description: "The normalized Gorgias ticket response.",
    },
  },
  {
    name: "list_tags",
    operationType: "read",
    description: "List Gorgias tags with cursor pagination, search, and ordering.",
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: {
      type: "object",
      properties: {
        cursor: {
          type: "string",
          minLength: 1,
          description: "A Gorgias cursor returned by a previous paginated response.",
        },
        search: {
          type: "string",
          minLength: 1,
          description: "Text used to search tag names.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum number of Gorgias records to return.",
        },
        orderBy: {
          type: "string",
          enum: [
            "created_datetime",
            "name",
            "usage",
            "created_datetime:asc",
            "created_datetime:desc",
            "name:asc",
            "name:desc",
            "usage:asc,name:asc",
            "usage:desc,name:desc",
          ],
          description: "Attribute and direction used to order Gorgias tags.",
        },
      },
      additionalProperties: false,
      description: "Input parameters for listing Gorgias tags.",
    },
    outputSchema: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: ["integer", "null"],
                description: "Gorgias tag identifier.",
              },
              name: {
                type: ["string", "null"],
                description: "Gorgias tag name.",
              },
              color: {
                type: ["string", "null"],
                description: "Hex color code returned for the tag decoration.",
              },
              usage: {
                type: ["integer", "null"],
                description: "How often Gorgias reports this tag is used.",
              },
              raw: {
                type: "object",
                properties: {},
                additionalProperties: true,
                description: "The raw Gorgias object.",
              },
            },
            required: ["id", "name", "color", "usage", "raw"],
            additionalProperties: false,
            description: "A normalized Gorgias tag summary.",
          },
          description: "Gorgias tags returned for the current page.",
        },
        pagination: {
          type: "object",
          properties: {
            previousCursor: {
              type: ["string", "null"],
              description: "Cursor for the previous page when Gorgias returns one.",
            },
            nextCursor: {
              type: ["string", "null"],
              description: "Cursor for the next page when Gorgias returns one.",
            },
            totalResources: {
              type: ["integer", "null"],
              description: "Total number of matching resources when returned.",
            },
          },
          required: ["previousCursor", "nextCursor", "totalResources"],
          additionalProperties: false,
          description: "Cursor pagination metadata returned by Gorgias.",
        },
        raw: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "The raw Gorgias object.",
        },
      },
      required: ["tags", "pagination", "raw"],
      additionalProperties: false,
      description: "The normalized Gorgias tags response.",
    },
  },
];
