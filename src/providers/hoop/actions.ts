import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hoop";

const rawObjectSchema = s.looseObject("The raw Hoop object.");

const connectionSchema = s.object(
  "One Hoop connection summary.",
  {
    name: s.string("The Hoop connection name."),
    type: s.string("The Hoop connection type."),
    subtype: s.string("The Hoop connection subtype."),
    status: s.string("The current connection status."),
    agentId: s.string("The agent ID associated with the connection."),
    resourceName: s.string("The upstream resource name associated with the connection."),
    raw: rawObjectSchema,
  },
  {
    optional: ["name", "type", "subtype", "status", "agentId", "resourceName"],
  },
);

const sessionSchema = s.object(
  "One Hoop session summary.",
  {
    id: s.string("The Hoop session identifier."),
    connectionName: s.string("The connection name associated with the session."),
    status: s.string("The current session status."),
    user: s.string("The Hoop user subject or email associated with the session."),
    raw: rawObjectSchema,
  },
  {
    optional: ["id", "connectionName", "status", "user"],
  },
);

const userInfoSchema = s.object(
  "The current Hoop API caller profile.",
  {
    subject: s.string("The Hoop user subject identifier."),
    email: s.string("The Hoop user email address."),
    name: s.string("The Hoop user display name."),
    groups: s.array("The Hoop groups assigned to the caller.", s.string("One Hoop group name.")),
    raw: rawObjectSchema,
  },
  {
    optional: ["subject", "email", "name", "groups"],
  },
);

export const hoopActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Hoop profile for the connected API key.",
    requiredScopes: ["userinfo:read"],
    inputSchema: s.actionInput({}, [], "Input for reading the current Hoop API user."),
    outputSchema: s.actionOutput(
      {
        user: userInfoSchema,
      },
      "The current Hoop API caller profile.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_connections",
    description: "List Hoop connections with optional filters and pagination.",
    requiredScopes: ["connections:read"],
    inputSchema: s.object(
      "Input for listing Hoop connections.",
      {
        agentId: s.nonEmptyString("Filter by Hoop agent ID."),
        tags: s.nonEmptyString("Deprecated comma-separated Hoop tags filter."),
        tagSelector: s.nonEmptyString("Selector tags to filter on, such as key=value,key2!=value2."),
        search: s.nonEmptyString("Search by connection name, type, subtype, resource name, or status."),
        type: s.nonEmptyString("Filter by Hoop connection type."),
        subtype: s.nonEmptyString("Filter by Hoop connection subtype."),
        managedBy: s.nonEmptyString("Filter by manager identifier."),
        resourceName: s.nonEmptyString("Filter by upstream resource name."),
        attribute: s.nonEmptyString("Filter by comma-separated Hoop attributes."),
        connectionIds: s.nonEmptyString("Filter by comma-separated Hoop connection IDs."),
        pageSize: s.integer("Maximum number of connections to return, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        page: s.integer("One-based Hoop page number.", { minimum: 1 }),
      },
      {
        optional: [
          "agentId",
          "tags",
          "tagSelector",
          "search",
          "type",
          "subtype",
          "managedBy",
          "resourceName",
          "attribute",
          "connectionIds",
          "pageSize",
          "page",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        connections: s.array("The Hoop connection summaries.", connectionSchema),
        raw: s.anyOf("The raw Hoop connections response.", [
          s.array("A raw Hoop connection array.", rawObjectSchema),
          s.looseObject("A raw Hoop connection response wrapper."),
        ]),
      },
      "The Hoop connections returned by the API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    description: "List Hoop sessions with optional filters and pagination.",
    requiredScopes: ["sessions:read"],
    inputSchema: s.object(
      "Input for listing Hoop sessions.",
      {
        user: s.nonEmptyString("Filter by Hoop user subject ID."),
        connectionName: s.nonEmptyString("Filter by Hoop connection name."),
        type: s.nonEmptyString("Filter by Hoop connection type."),
        reviewApprover: s.nonEmptyString("Filter by the review approver email."),
        reviewStatus: s.nonEmptyString("Filter by review status."),
        correlationId: s.nonEmptyString("Filter by external workflow or task correlation ID."),
        jiraIssueKey: s.nonEmptyString("Filter by Jira issue key."),
        startDate: s.dateTime("Filter sessions starting on or after this RFC3339 timestamp."),
        endDate: s.dateTime("Filter sessions ending on or before this RFC3339 timestamp."),
        limit: s.integer("Maximum number of sessions to return, up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        offset: s.integer("Offset used to paginate Hoop sessions.", { minimum: 0 }),
      },
      {
        optional: [
          "user",
          "connectionName",
          "type",
          "reviewApprover",
          "reviewStatus",
          "correlationId",
          "jiraIssueKey",
          "startDate",
          "endDate",
          "limit",
          "offset",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        sessions: s.array("The Hoop session summaries.", sessionSchema),
        raw: s.anyOf("The raw Hoop sessions response.", [
          s.array("A raw Hoop session array.", rawObjectSchema),
          s.looseObject("A raw Hoop session response wrapper."),
        ]),
      },
      "The Hoop sessions returned by the API.",
    ),
  }),
];
