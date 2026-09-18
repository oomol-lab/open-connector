import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pagerduty";

export type PagerDutyActionName =
  | "list_incidents"
  | "get_incident"
  | "update_incident"
  | "acknowledge_incident"
  | "resolve_incident"
  | "list_on_calls"
  | "get_current_user";

interface PagerDutyActionDefinition {
  name: PagerDutyActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const emptyInputSchema = s.object("This action does not require any input fields.", {});
const idField = s.string("PagerDuty resource ID.", { minLength: 1 });
const limitField = s.integer("Maximum number of records to return.", {
  minimum: 1,
  maximum: 100,
});
const offsetField = s.integer("Zero-based offset for paginated results.", { minimum: 0 });
const dateTimeField = s.string("Timestamp in ISO 8601 format.");
const escalationPolicyIdsField = s.array("Only return results for these escalation policy IDs.", idField);
const userIdsField = s.array("Only return results for these user IDs.", idField);
const teamIdsField = s.array("Only return results for these team IDs.", idField);

const userReferenceSchema = s.looseObject("PagerDuty user reference.", {
  id: idField,
  type: s.string("PagerDuty user reference type."),
  summary: s.string("User display summary."),
  self: s.url("API URL for the user."),
  html_url: s.url("Web URL for the user."),
});
const serviceReferenceSchema = s.looseObject("PagerDuty service reference.", {
  id: idField,
  type: s.string("PagerDuty service reference type."),
  summary: s.string("Service display summary."),
  self: s.url("API URL for the service."),
  html_url: s.url("Web URL for the service."),
});
const escalationPolicyReferenceSchema = s.looseObject("PagerDuty escalation policy reference.", {
  id: idField,
  type: s.string("PagerDuty escalation policy reference type."),
  summary: s.string("Escalation policy display summary."),
  self: s.url("API URL for the escalation policy."),
  html_url: s.url("Web URL for the escalation policy."),
});

const incidentUrgencyField = s.stringEnum("Incident urgency.", ["high", "low"]);
const incidentStatusField = s.stringEnum("Incident status.", ["triggered", "acknowledged", "resolved"]);
const incidentSortByField = s.stringEnum("PagerDuty incident sort order.", [
  "incident_number:asc",
  "incident_number:desc",
  "created_at:asc",
  "created_at:desc",
  "resolved_at:asc",
  "resolved_at:desc",
  "urgency:asc",
  "urgency:desc",
]);
const incidentReferenceSchema = s.looseObject("PagerDuty incident record.", {
  id: idField,
  type: s.string("PagerDuty incident object type."),
  summary: s.string("Incident summary."),
  self: s.url("API URL for the incident."),
  html_url: s.url("Web URL for the incident."),
  incident_number: s.integer("PagerDuty incident number."),
  title: s.string("Incident title."),
  description: s.string("Incident description."),
  status: incidentStatusField,
  urgency: incidentUrgencyField,
  created_at: dateTimeField,
  updated_at: dateTimeField,
  service: serviceReferenceSchema,
  assignments: s.array(
    "Current incident assignments.",
    s.looseObject("PagerDuty incident assignment.", {
      at: dateTimeField,
      assignee: userReferenceSchema,
    }),
  ),
  escalation_policy: escalationPolicyReferenceSchema,
});
const paginationSchema = s.object(
  "PagerDuty pagination metadata.",
  {
    limit: s.integer("Maximum number of records requested."),
    offset: s.integer("Offset used for this page."),
    more: s.boolean("Whether PagerDuty has another page after this response."),
    total: s.integer("Total matching records when PagerDuty includes it."),
  },
  { optional: ["total"] },
);

const incidentMutationSchema = s.object(
  "Incident mutation fields.",
  {
    type: s.string("PagerDuty incident object type.", { minLength: 1 }),
    status: incidentStatusField,
    title: s.string("New incident title.", { minLength: 1 }),
    urgency: incidentUrgencyField,
    escalation_level: s.integer("Escalation level for the incident.", { minimum: 1 }),
    priority_id: idField,
    resolution: s.string("Resolution note for the incident.", { minLength: 1 }),
  },
  {
    optional: ["type", "status", "title", "urgency", "escalation_level", "priority_id", "resolution"],
  },
);

const incidentMutationInputSchema = s.object("Incident mutation request.", {
  incident_id: idField,
  from: s.email(
    "Email address of the PagerDuty user performing the incident mutation. PagerDuty requires this header for write operations.",
  ),
  incident: incidentMutationSchema,
});

const updateIncidentOutputSchema = s.object("Updated PagerDuty incident.", {
  incident: incidentReferenceSchema,
});

const onCallSchema = s.looseObject("PagerDuty on-call entry.", {
  escalation_level: s.integer("Escalation level for this on-call assignment."),
  start: dateTimeField,
  end: dateTimeField,
  user: userReferenceSchema,
  escalation_policy: escalationPolicyReferenceSchema,
});

const actionDefinitions: PagerDutyActionDefinition[] = [
  {
    name: "list_incidents",
    operationType: "read",
    description: "List PagerDuty incidents with status, service, assignment, and paging filters.",
    inputSchema: s.object(
      "Incident list filters.",
      {
        statuses: s.array("Only return incidents with these statuses.", incidentStatusField),
        since: s.string("Start of the incident time range in ISO 8601 format."),
        until: s.string("End of the incident time range in ISO 8601 format."),
        service_ids: s.array("Only return incidents for these service IDs.", idField),
        team_ids: teamIdsField,
        user_ids: userIdsField,
        urgencies: s.array("Only return incidents with these urgencies.", incidentUrgencyField),
        sort_by: incidentSortByField,
        include: s.array(
          "Related incident records to include.",
          s.stringEnum("Incident include option.", [
            "services",
            "assignees",
            "first_trigger_log_entries",
            "escalation_policies",
            "teams",
            "priority",
          ]),
        ),
        total: s.boolean("Whether PagerDuty should include total matching record count."),
        limit: limitField,
        offset: offsetField,
      },
      {
        optional: [
          "statuses",
          "since",
          "until",
          "service_ids",
          "team_ids",
          "user_ids",
          "urgencies",
          "sort_by",
          "include",
          "total",
          "limit",
          "offset",
        ],
      },
    ),
    outputSchema: s.object("PagerDuty incident list.", {
      incidents: s.array("PagerDuty incidents returned by the query.", incidentReferenceSchema),
      pagination: paginationSchema,
    }),
  },
  {
    name: "get_incident",
    operationType: "read",
    description: "Get a PagerDuty incident by ID.",
    inputSchema: s.object(
      "Incident lookup request.",
      {
        incident_id: idField,
        include: s.array(
          "Related incident records to include.",
          s.stringEnum("Incident include option.", [
            "services",
            "assignees",
            "first_trigger_log_entries",
            "escalation_policies",
            "teams",
            "priority",
          ]),
        ),
      },
      { optional: ["include"] },
    ),
    outputSchema: s.object("PagerDuty incident lookup result.", {
      incident: incidentReferenceSchema,
    }),
  },
  {
    name: "update_incident",
    operationType: "write",
    description: "Update mutable PagerDuty incident fields such as title, urgency, or status.",
    inputSchema: incidentMutationInputSchema,
    outputSchema: updateIncidentOutputSchema,
  },
  {
    name: "acknowledge_incident",
    operationType: "destructive",
    description: "Acknowledge a PagerDuty incident as the specified user.",
    inputSchema: s.object("Incident acknowledgement request.", {
      incident_id: idField,
      from: s.email(
        "Email address of the PagerDuty user acknowledging the incident. PagerDuty requires this header for write operations.",
      ),
    }),
    outputSchema: updateIncidentOutputSchema,
  },
  {
    name: "resolve_incident",
    operationType: "read",
    description: "Resolve a PagerDuty incident as the specified user.",
    inputSchema: s.object(
      "Incident resolution request.",
      {
        incident_id: idField,
        from: s.email(
          "Email address of the PagerDuty user resolving the incident. PagerDuty requires this header for write operations.",
        ),
        resolution: s.string("Optional resolution note for the incident.", { minLength: 1 }),
      },
      { optional: ["resolution"] },
    ),
    outputSchema: updateIncidentOutputSchema,
  },
  {
    name: "list_on_calls",
    operationType: "read",
    description: "List PagerDuty on-call assignments by user, schedule, or escalation policy.",
    inputSchema: s.object(
      "On-call list filters.",
      {
        user_ids: userIdsField,
        escalation_policy_ids: escalationPolicyIdsField,
        schedule_ids: s.array("Only return results for these schedule IDs.", idField),
        since: s.string("Start of the on-call time range in ISO 8601 format."),
        until: s.string("End of the on-call time range in ISO 8601 format."),
        earliest: s.boolean("Only return the earliest on-call assignment per escalation policy."),
        include: s.array(
          "Related on-call records to include.",
          s.stringEnum("On-call include option.", ["users", "schedules", "escalation_policies"]),
        ),
        limit: limitField,
        offset: offsetField,
      },
      {
        optional: [
          "user_ids",
          "escalation_policy_ids",
          "schedule_ids",
          "since",
          "until",
          "earliest",
          "include",
          "limit",
          "offset",
        ],
      },
    ),
    outputSchema: s.object("PagerDuty on-call list.", {
      onCalls: s.array("PagerDuty on-call entries returned by the query.", onCallSchema),
      pagination: paginationSchema,
    }),
  },
  {
    name: "get_current_user",
    operationType: "read",
    description: "Get the PagerDuty user associated with the API token.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("PagerDuty current user lookup result.", {
      user: userReferenceSchema,
    }),
  },
] satisfies PagerDutyActionDefinition[];

export const pagerDutyActions: ActionDefinition[] = actionDefinitions.map((definition) =>
  defineProviderAction(service, {
    name: definition.name,
    operationType: definition.operationType,
    description: definition.description,
    requiredScopes: [],
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
  }),
);
