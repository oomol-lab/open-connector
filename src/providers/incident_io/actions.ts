import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "incident_io";

const incidentModeSchema = s.stringEnum("The incident mode to include in the result set.", [
  "standard",
  "retrospective",
  "test",
  "tutorial",
  "stream",
]);

const statusCategorySchema = s.stringEnum("The incident status category to filter by.", [
  "triage",
  "declined",
  "merged",
  "canceled",
  "live",
  "learning",
  "closed",
  "paused",
]);

const sortBySchema = s.stringEnum("The incident ordering requested from incident.io.", [
  "created_at_oldest_first",
  "created_at_newest_first",
]);

const filterModeSchema = s.stringEnum("Whether all or any provided incident filters must match.", ["all", "any"]);
const idSchema = (description: string) => s.string(description, { minLength: 1 });

const paginationMetaSchema = s.object("Pagination metadata returned by incident.io when listing resources.", {
  after: s.nullable(s.string("The cursor to pass as the after parameter when loading the next page.")),
  pageSize: s.nullable(s.integer("The maximum number of records requested from incident.io.")),
  totalRecordCount: s.nullable(s.integer("The total matching record count when incident.io provides it.")),
  raw: s.looseObject("The raw pagination_meta object returned by incident.io."),
});

const incidentSchema = s.object(
  "A normalized incident.io incident with stable top-level fields and raw upstream data.",
  {
    id: s.string("The unique incident identifier."),
    reference: s.nullable(s.string("The incident reference displayed in incident.io.")),
    name: s.nullable(s.string("The incident name or explanation.")),
    summary: s.nullable(s.string("The detailed incident summary.")),
    permalink: s.nullable(s.string("The incident homepage permalink.")),
    statusCategory: s.nullable(s.string("The incident status category.")),
    statusName: s.nullable(s.string("The incident status name.")),
    severityName: s.nullable(s.string("The incident severity name.")),
    mode: s.nullable(s.string("The incident mode.")),
    visibility: s.nullable(s.string("The incident visibility.")),
    createdAt: s.nullable(s.string("When the incident was created.")),
    updatedAt: s.nullable(s.string("When the incident was last updated.")),
    raw: s.looseObject("The raw incident object returned by incident.io."),
  },
);

const actionSchema = s.object("A normalized incident.io action with stable top-level fields and raw upstream data.", {
  id: s.string("The unique action identifier."),
  incidentId: s.string("The unique identifier of the incident this action belongs to."),
  description: s.string("The action description."),
  status: s.string("The action status returned by incident.io."),
  assigneeName: s.nullable(s.string("The assigned user's display name when present.")),
  assigneeEmail: s.nullable(s.string("The assigned user's email address when present.")),
  createdAt: s.nullable(s.string("When the action was created.")),
  updatedAt: s.nullable(s.string("When the action was last updated.")),
  completedAt: s.nullable(s.string("When the action was completed.")),
  raw: s.looseObject("The raw action object returned by incident.io."),
});

const severitySchema = s.object(
  "A normalized incident.io severity with stable top-level fields and raw upstream data.",
  {
    id: s.string("The unique severity identifier."),
    name: s.string("The severity name."),
    description: s.string("The severity description."),
    rank: s.integer("The rank used to sort severities, where lower numbers are less severe."),
    createdAt: s.nullable(s.string("When the severity was created.")),
    updatedAt: s.nullable(s.string("When the severity was last updated.")),
    raw: s.looseObject("The raw severity object returned by incident.io."),
  },
);

const incidentStatusSchema = s.object(
  "A normalized incident.io status with stable top-level fields and raw upstream data.",
  {
    id: s.string("The unique status identifier."),
    name: s.string("The status name."),
    description: s.string("The status description."),
    category: s.string("The status category returned by incident.io."),
    rank: s.integer("The order of this incident status."),
    createdAt: s.nullable(s.string("When the status was created.")),
    updatedAt: s.nullable(s.string("When the status was last updated.")),
    raw: s.looseObject("The raw incident status object returned by incident.io."),
  },
);

const listIncidentsInputSchema = s.object(
  "The input payload for listing incident.io incidents.",
  {
    pageSize: s.integer("The number of incidents to request. incident.io allows up to 250.", {
      minimum: 1,
      maximum: 250,
    }),
    after: idSchema("The incident.io pagination cursor returned by a previous list call."),
    sortBy: sortBySchema,
    filterMode: filterModeSchema,
    statusCategoryOneOf: statusCategorySchema,
    statusCategoryNotIn: statusCategorySchema,
    severityOneOf: idSchema("Only return incidents with this severity identifier."),
    severityGte: idSchema("Only return incidents whose severity rank is greater than or equal to this severity."),
    severityLte: idSchema("Only return incidents whose severity rank is less than or equal to this severity."),
    incidentTypeOneOf: idSchema("Only return incidents with this incident type identifier."),
    modeOneOf: s.array("The incident modes to include.", incidentModeSchema, { minItems: 1 }),
  },
  {
    optional: [
      "pageSize",
      "after",
      "sortBy",
      "filterMode",
      "statusCategoryOneOf",
      "statusCategoryNotIn",
      "severityOneOf",
      "severityGte",
      "severityLte",
      "incidentTypeOneOf",
      "modeOneOf",
    ],
  },
);

const getIncidentInputSchema = s.object("The input payload for loading one incident.io incident.", {
  id: idSchema("The incident full identifier or numeric reference to load."),
});

const listActionsInputSchema = s.object(
  "The input payload for listing incident.io actions.",
  {
    incidentId: idSchema("Only return actions related to this incident."),
    incidentMode: incidentModeSchema,
  },
  { optional: ["incidentId", "incidentMode"] },
);

const getActionInputSchema = s.object("The input payload for loading one incident.io action.", {
  id: idSchema("The action identifier to load."),
});

const emptyInputSchema = s.object("The input payload for this incident.io list action.", {});

export const incidentIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_incidents",
    description: "List incident.io incidents with optional stable filters and pagination.",
    inputSchema: listIncidentsInputSchema,
    outputSchema: s.object("The response returned when listing incident.io incidents.", {
      incidents: s.array("The incidents returned by incident.io.", incidentSchema),
      paginationMeta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_incident",
    description: "Get a single incident.io incident by full ID or numeric reference.",
    inputSchema: getIncidentInputSchema,
    outputSchema: s.object("The response returned when loading an incident.io incident.", {
      incident: incidentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_actions",
    description: "List incident.io actions with optional incident and mode filters.",
    inputSchema: listActionsInputSchema,
    outputSchema: s.object("The response returned when listing incident.io actions.", {
      actions: s.array("The actions returned by incident.io.", actionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_action",
    description: "Get a single incident.io action by ID.",
    inputSchema: getActionInputSchema,
    outputSchema: s.object("The response returned when loading an incident.io action.", {
      action: actionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_severities",
    description: "List incident.io severities configured for the organization.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The response returned when listing incident.io severities.", {
      severities: s.array("The severities returned by incident.io.", severitySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_incident_statuses",
    description: "List incident.io incident statuses configured for the organization.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The response returned when listing incident.io statuses.", {
      incidentStatuses: s.array("The statuses returned by incident.io.", incidentStatusSchema),
    }),
  }),
];
