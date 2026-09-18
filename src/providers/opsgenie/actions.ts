import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "opsgenie";

export type OpsgenieActionName =
  | "get_current_account"
  | "list_alerts"
  | "get_alert"
  | "create_alert"
  | "acknowledge_alert"
  | "close_alert"
  | "get_request_status";

interface OpsgenieActionDefinition {
  name: OpsgenieActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  followUpActions?: string[];
  asyncLifecycle?: ProviderActionDefinition["asyncLifecycle"];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const emptyInputSchema = s.actionInput({}, [], "This action does not require any input fields.");
const nonEmptyString = (description: string, maxLength?: number): JsonSchema =>
  s.string({ description, minLength: 1, ...(maxLength === undefined ? {} : { maxLength }) });
const identifierTypeField = s.stringEnum("Type of Opsgenie alert identifier.", ["id", "tiny", "alias"]);
const searchIdentifierTypeField = s.stringEnum("Type of Opsgenie saved-search identifier.", ["id", "name"]);
const sortOrderField = s.stringEnum("Sort direction for the Opsgenie result set.", ["asc", "desc"]);
const priorityField = s.stringEnum("Opsgenie alert priority.", ["P1", "P2", "P3", "P4", "P5"]);

const stringArrayField = (description: string, maxItems?: number): JsonSchema =>
  s.array(description, nonEmptyString("One string value."), {
    minItems: 1,
    ...(maxItems === undefined ? {} : { maxItems }),
  });

const keyValueDetailsSchema = s.record(
  "Opsgenie alert details as key-value string properties.",
  s.string("One Opsgenie alert detail value."),
);

const responderSchema = s.looseRequiredObject(
  "Opsgenie responder target. Provide id, name, or username according to the responder type.",
  {
    type: s.stringEnum("Opsgenie responder type.", ["team", "user", "escalation", "schedule"]),
    id: nonEmptyString("Opsgenie responder ID."),
    name: nonEmptyString("Opsgenie responder name."),
    username: nonEmptyString("Opsgenie user responder username."),
  },
  { optional: ["id", "name", "username"] },
);

const visibleToSchema = s.looseRequiredObject(
  "Opsgenie visibility target. Provide id, name, or username according to the target type.",
  {
    type: s.stringEnum("Opsgenie visibility target type.", ["team", "user"]),
    id: nonEmptyString("Opsgenie visibility target ID."),
    name: nonEmptyString("Opsgenie team name."),
    username: nonEmptyString("Opsgenie user username."),
  },
  { optional: ["id", "name", "username"] },
);

const alertSchema = s.looseObject("Opsgenie alert record.", {
  id: s.string("Opsgenie alert ID."),
  tinyId: s.string("Opsgenie tiny alert ID."),
  alias: s.string("Opsgenie alert alias."),
  message: s.string("Opsgenie alert message."),
  status: s.string("Opsgenie alert status."),
  acknowledged: s.boolean("Whether the alert has been acknowledged."),
  isSeen: s.boolean("Whether the alert has been seen."),
  tags: s.array("Alert tags.", s.string("One alert tag.")),
  snoozed: s.boolean("Whether the alert is snoozed."),
  snoozedUntil: s.string("Date and time when the alert snooze ends."),
  count: s.integer("Alert occurrence count."),
  lastOccurredAt: s.string("Date and time when the alert last occurred."),
  createdAt: s.string("Date and time when the alert was created."),
  updatedAt: s.string("Date and time when the alert was last updated."),
  source: s.string("Alert source."),
  owner: s.string("Alert owner."),
  priority: priorityField,
  responders: s.array("Alert responders.", responderSchema),
  integration: s.looseObject("Opsgenie integration that created the alert.", {
    id: s.string("Opsgenie integration ID."),
    name: s.string("Opsgenie integration name."),
    type: s.string("Opsgenie integration type."),
  }),
  report: s.looseObject("Opsgenie alert report metrics.", {
    ackTime: s.integer("Alert acknowledgement time in milliseconds."),
    closeTime: s.integer("Alert close time in milliseconds."),
    acknowledgedBy: s.string("User who acknowledged the alert."),
    closedBy: s.string("User who closed the alert."),
  }),
  actions: s.array("Custom actions available on the alert.", s.string("One custom action.")),
  entity: s.string("Entity related to the alert."),
  description: s.string("Detailed alert description."),
  details: keyValueDetailsSchema,
});

const paginationSchema = s.object("Opsgenie pagination metadata.", {
  offset: s.integer("Start index of this result page."),
  limit: s.integer("Maximum number of records requested."),
  count: s.integer("Number of records returned in this page."),
});

const requestAcceptedSchema = s.object("Opsgenie asynchronous request response.", {
  result: s.string("Opsgenie request acceptance message."),
  took: s.number("Time Opsgenie spent accepting the request."),
  requestId: s.string("Opsgenie request ID for polling request status."),
});

const requestStatusDataSchema = s.looseObject("Opsgenie request status data.", {
  success: s.boolean("Whether the asynchronous request status call succeeded."),
  action: s.string("Opsgenie asynchronous action name."),
  processedAt: s.string("Date and time when Opsgenie processed the request."),
  integrationId: s.string("Opsgenie integration ID."),
  isSuccess: s.boolean("Whether the original asynchronous request succeeded."),
  status: s.string("Human-readable processing status."),
  alertId: s.string("Alert ID affected by the request, when available."),
  alias: s.string("Alert alias affected by the request, when available."),
});

const mutationTargetInputSchema = s.object(
  "Opsgenie alert mutation target.",
  {
    identifier: nonEmptyString("Opsgenie alert identifier."),
    identifierType: identifierTypeField,
    user: nonEmptyString("Display name of the request owner.", 100),
    source: nonEmptyString("Display name of the request source.", 100),
    note: nonEmptyString("Additional alert note.", 25000),
  },
  { optional: ["identifierType", "user", "source", "note"] },
);

const actionDefinitions: OpsgenieActionDefinition[] = [
  {
    name: "get_current_account",
    operationType: "read",
    description: "Validate the Opsgenie API key and return account information for the key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Opsgenie account validation result.", {
      account: s.looseObject("Opsgenie account information.", {
        name: s.string("Opsgenie account name."),
        plan: s.string("Opsgenie account plan."),
      }),
    }),
  },
  {
    name: "list_alerts",
    operationType: "read",
    description: "List Opsgenie alerts with query, saved-search, sorting, and paging filters.",
    inputSchema: s.object(
      "Opsgenie alert list filters.",
      {
        query: nonEmptyString("Opsgenie alert search query."),
        searchIdentifier: nonEmptyString("Opsgenie saved-search identifier."),
        searchIdentifierType: searchIdentifierTypeField,
        offset: s.integer("Start index of the result set.", { minimum: 0 }),
        limit: s.integer("Maximum number of alerts to return.", { minimum: 1, maximum: 100 }),
        sort: nonEmptyString("Alert field to sort by."),
        order: sortOrderField,
      },
      { optional: ["query", "searchIdentifier", "searchIdentifierType", "offset", "limit", "sort", "order"] },
    ),
    outputSchema: s.object("Opsgenie alert list response.", {
      alerts: s.array("Opsgenie alerts returned by the query.", alertSchema),
      pagination: paginationSchema,
      requestId: s.string("Opsgenie request ID."),
    }),
  },
  {
    name: "get_alert",
    operationType: "read",
    description: "Get one Opsgenie alert by ID, tiny ID, or alias.",
    inputSchema: s.object(
      "Opsgenie alert lookup request.",
      {
        identifier: nonEmptyString("Opsgenie alert identifier."),
        identifierType: identifierTypeField,
      },
      { optional: ["identifierType"] },
    ),
    outputSchema: s.object("Opsgenie alert lookup response.", {
      alert: alertSchema,
      requestId: s.string("Opsgenie request ID."),
    }),
  },
  {
    name: "create_alert",
    operationType: "write",
    description: "Create an Opsgenie alert and return the asynchronous request ID.",
    followUpActions: ["opsgenie.get_request_status"],
    asyncLifecycle: {
      startActionId: "opsgenie.create_alert",
      statusActionId: "opsgenie.get_request_status",
    },
    inputSchema: s.object(
      "Opsgenie alert creation request.",
      {
        message: nonEmptyString("Message of the alert.", 130),
        alias: nonEmptyString("Client-defined identifier for alert de-duplication.", 512),
        description: nonEmptyString("Detailed alert description.", 15000),
        responders: s.array("Teams, users, escalations, or schedules to notify.", responderSchema, {
          minItems: 1,
          maxItems: 50,
        }),
        visibleTo: s.array("Teams or users that can view the alert.", visibleToSchema, {
          minItems: 1,
          maxItems: 50,
        }),
        actions: stringArrayField("Custom actions available for the alert.", 10),
        tags: stringArrayField("Tags to add to the alert.", 20),
        details: keyValueDetailsSchema,
        entity: nonEmptyString("Entity related to the alert.", 512),
        source: nonEmptyString("Alert source.", 100),
        priority: priorityField,
        user: nonEmptyString("Display name of the request owner.", 100),
        note: nonEmptyString("Additional note added while creating the alert.", 25000),
      },
      {
        optional: [
          "alias",
          "description",
          "responders",
          "visibleTo",
          "actions",
          "tags",
          "details",
          "entity",
          "source",
          "priority",
          "user",
          "note",
        ],
      },
    ),
    outputSchema: requestAcceptedSchema,
  },
  {
    name: "acknowledge_alert",
    operationType: "write",
    description: "Acknowledge an Opsgenie alert and return the asynchronous request ID.",
    followUpActions: ["opsgenie.get_request_status"],
    asyncLifecycle: {
      startActionId: "opsgenie.acknowledge_alert",
      statusActionId: "opsgenie.get_request_status",
    },
    inputSchema: mutationTargetInputSchema,
    outputSchema: requestAcceptedSchema,
  },
  {
    name: "close_alert",
    operationType: "destructive",
    description: "Close an Opsgenie alert and return the asynchronous request ID.",
    followUpActions: ["opsgenie.get_request_status"],
    asyncLifecycle: {
      startActionId: "opsgenie.close_alert",
      statusActionId: "opsgenie.get_request_status",
    },
    inputSchema: mutationTargetInputSchema,
    outputSchema: requestAcceptedSchema,
  },
  {
    name: "get_request_status",
    operationType: "read",
    description: "Get processing status for an Opsgenie asynchronous alert request.",
    inputSchema: s.object(
      "Opsgenie request status lookup.",
      {
        requestId: nonEmptyString("Opsgenie asynchronous request ID."),
      },
      { required: ["requestId"] },
    ),
    outputSchema: s.object("Opsgenie request status response.", {
      data: requestStatusDataSchema,
      took: s.number("Time Opsgenie spent returning the request status."),
      requestId: s.string("Opsgenie request ID for this status lookup."),
    }),
  },
];

export const opsgenieActions: ActionDefinition[] = actionDefinitions.map((action) =>
  defineProviderAction(service, {
    name: action.name,
    operationType: action.operationType,
    description: action.description,
    requiredScopes: [],
    followUpActions: action.followUpActions,
    asyncLifecycle: action.asyncLifecycle,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  }),
);
