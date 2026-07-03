import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "better_stack";

const ownerTypes = [
  "Monitor",
  "Heartbeat",
  "Incident",
  "WebhookIntegration",
  "EmailIntegration",
  "IncomingWebhook",
  "CallRouting",
];
const escalationTypes = ["User", "Team", "Schedule", "Policy", "Organization"];
const metadataValueTypes = [
  "String",
  "User",
  "Team",
  "Policy",
  "Schedule",
  "SlackIntegration",
  "LinearIntegration",
  "JiraIntegration",
  "MicrosoftTeamsWebhook",
  "ZapierWebhook",
  "NativeWebhook",
  "PagerDutyWebhook",
];
const nonStringMetadataValueTypes = metadataValueTypes.filter((value) => value !== "String");

const incidentIdField = s.nonEmptyString("The Better Stack incident ID.");
const teamScopeField = s.nonEmptyString(
  "Team name used when a global Better Stack API token needs explicit team scoping.",
);
const pageField = s.positiveInteger("Page number to return.");
const incidentPerPageField = s.positiveInteger(
  "Number of incidents to return per page. Better Stack incident lists allow up to 50.",
  { maximum: 50 },
);
const metadataPerPageField = s.positiveInteger("Number of metadata records to return per page.", { maximum: 250 });
const ownerTypeSchema = s.stringEnum("Owner type accepted by the Better Stack metadata API.", ownerTypes);
const escalationTypeSchema = s.stringEnum("Escalation target type accepted by Better Stack.", escalationTypes);
const metadataValueTypeSchema = s.stringEnum("Metadata value type accepted by Better Stack.", metadataValueTypes);
const idStringOrNumberSchema = s.union(
  [
    s.nonEmptyString("String identifier returned by Better Stack."),
    s.number("Numeric identifier returned by Better Stack."),
  ],
  { description: "String or numeric Better Stack identifier." },
);
const metadataValueSchema = s.object(
  "A Better Stack metadata value.",
  {
    type: metadataValueTypeSchema,
    value: s.string("String value used when the metadata entry type is String."),
    item_id: idStringOrNumberSchema,
    name: s.string("Referenced item name returned by Better Stack or accepted when creating metadata."),
    email: s.email("Referenced user email accepted by Better Stack for User metadata values."),
  },
  { optional: ["type", "value", "item_id", "name", "email"] },
);
const metadataValueInputSchema: JsonSchema = {
  ...s.object(
    "A Better Stack metadata value accepted by incident mutations.",
    {
      type: metadataValueTypeSchema,
      value: s.string("String value to send when the metadata entry type is String."),
      item_id: idStringOrNumberSchema,
      name: s.string("Referenced item name for non-String metadata values."),
      email: s.email("Referenced user email for User metadata values."),
    },
    { optional: ["type", "value", "item_id", "name", "email"] },
  ),
  allOf: [
    {
      if: {
        anyOf: [{ properties: { type: { const: "String" } }, required: ["type"] }, { not: { required: ["type"] } }],
      },
      then: { required: ["value"] },
    },
    {
      if: {
        properties: { type: { enum: nonStringMetadataValueTypes } },
        required: ["type"],
      },
      then: {
        anyOf: [
          { required: ["item_id"] },
          { required: ["name"] },
          { properties: { type: { const: "User" } }, required: ["type", "email"] },
        ],
      },
    },
  ],
};
const metadataMapSchema = s.record(
  "Metadata entries grouped by metadata key.",
  s.array("Metadata values for a single metadata key.", metadataValueSchema, { minItems: 1 }),
);
const metadataMapInputSchema = s.record(
  "Metadata payload accepted by Better Stack incident mutations.",
  s.array("Metadata values to attach under a single metadata key.", metadataValueInputSchema, { minItems: 1 }),
);
const relationshipDataSchema = s.object(
  "Reference to a related Better Stack resource.",
  {
    id: s.string("Identifier of the related Better Stack resource."),
    type: s.string("Type of the related Better Stack resource."),
  },
  { required: ["id", "type"] },
);
const relationshipSchema = s.object(
  "Better Stack relationship entry.",
  {
    data: s.nullable(relationshipDataSchema),
  },
  { required: ["data"] },
);
const incidentRelationshipsSchema = s.looseObject("Relationships attached to a Better Stack incident.", {
  monitor: relationshipSchema,
  heartbeat: relationshipSchema,
  webhook_integration: relationshipSchema,
  email_integration: relationshipSchema,
  incoming_webhook: relationshipSchema,
  call_routing: relationshipSchema,
});
const incidentAttributesSchema = s.looseObject("Attributes returned for a Better Stack incident.", {
  name: s.string("Incident name returned by Better Stack."),
  url: s.nullableString("Affected URL when present."),
  http_method: s.nullableString("HTTP method of the affected check when present."),
  cause: s.string("Incident cause summary."),
  incident_group_id: s.nullable(idStringOrNumberSchema),
  started_at: s.dateTime("Timestamp when the incident started."),
  acknowledged_at: s.nullable(s.dateTime("Timestamp when the incident was acknowledged.")),
  acknowledged_by: s.nullableString("Actor that acknowledged the incident."),
  resolved_at: s.nullable(s.dateTime("Timestamp when the incident was resolved.")),
  resolved_by: s.nullableString("Actor that resolved the incident."),
  status: s.string("Incident status reported by Better Stack."),
  team_name: s.string("Owning Better Stack team name."),
  response_content: s.nullableString("Captured response content when Better Stack includes it."),
  response_options: s.nullableString("Serialized response options returned by Better Stack."),
  regions: s.nullable(
    s.stringArray("Monitoring regions attached to the incident.", { itemDescription: "Monitoring region code." }),
  ),
  response_url: s.nullableString("Response URL captured for the incident, when present."),
  screenshot_url: s.nullableString("Screenshot URL captured for the incident, when present."),
  origin_url: s.nullableString("Origin URL returned by Better Stack, when present."),
  escalation_policy_id: s.nullable(idStringOrNumberSchema),
  call: s.boolean("Whether calls are enabled for this incident."),
  sms: s.boolean("Whether SMS notifications are enabled for this incident."),
  email: s.boolean("Whether email notifications are enabled for this incident."),
  push: s.boolean("Whether push notifications are enabled for this incident."),
  critical_alert: s.boolean("Whether critical push notifications are enabled for this incident."),
  slack_channels: s.stringArray("Slack channels attached to the incident.", {
    itemDescription: "Slack channel name linked to the incident.",
  }),
  metadata: metadataMapSchema,
});
const incidentSchema = s.object(
  "A Better Stack incident resource.",
  {
    id: s.string("Better Stack incident identifier."),
    type: s.string("Resource type returned by Better Stack, usually incident."),
    attributes: incidentAttributesSchema,
    relationships: incidentRelationshipsSchema,
  },
  { required: ["id", "type", "attributes"], optional: ["relationships"] },
);
const includedResourceSchema = s.looseObject("A related Better Stack resource included with an incident response.", {
  id: s.string("Identifier of the included Better Stack resource."),
  type: s.string("Type of the included Better Stack resource."),
  attributes: s.looseObject("Selected attributes returned for the included resource.", {
    url: s.nullableString("URL of the included resource, when present."),
    pronounceable_name: s.string("Human-readable name of the included resource, when present."),
    status: s.string("Status of the included resource, when present."),
  }),
  relationships: s.looseObject("Relationships returned for the included resource, when present."),
});
const commentSchema = s.object(
  "A Better Stack incident comment.",
  {
    id: s.string("Incident comment identifier."),
    type: s.string("Resource type returned by Better Stack, usually incident_comment."),
    attributes: s.object(
      "Incident comment attributes.",
      {
        id: s.integer("Numeric incident comment identifier."),
        content: s.string("Comment content."),
        user_id: s.integer("Author user ID when Better Stack returns it."),
        user_email: s.email("Author email when Better Stack returns it."),
        created_at: s.dateTime("Timestamp when the comment was created."),
        updated_at: s.dateTime("Timestamp when the comment was last updated."),
      },
      { required: ["id", "content", "created_at", "updated_at"], optional: ["user_id", "user_email"] },
    ),
  },
  { required: ["id", "type", "attributes"] },
);
const metadataRecordSchema = s.object(
  "A Better Stack metadata record.",
  {
    id: s.string("Metadata record identifier."),
    type: s.string("Resource type returned by Better Stack, usually metadata."),
    attributes: s.object(
      "Metadata record attributes.",
      {
        key: s.string("Metadata key."),
        values: s.array("Metadata values stored under the key.", metadataValueSchema),
        team_name: s.string("Team that owns the metadata record."),
        owner_id: s.string("Owner ID for the metadata record."),
        owner_type: ownerTypeSchema,
      },
      { required: ["key", "values", "team_name", "owner_id", "owner_type"] },
    ),
  },
  { required: ["id", "type", "attributes"] },
);
const paginationSchema = s.object(
  "Pagination links returned by Better Stack.",
  {
    first: s.nullableString("URL of the first page, or null when not available."),
    last: s.nullableString("URL of the last page, or null when not available."),
    prev: s.nullableString("URL of the previous page, or null when not available."),
    next: s.nullableString("URL of the next page, or null when not available."),
  },
  { required: ["first", "last", "prev", "next"] },
);

const listIncidentsInputSchema = s.actionInput(
  {
    team_name: teamScopeField,
    from: s.date("Only return incidents on or after this date."),
    to: s.date("Only return incidents on or before this date."),
    monitor_id: s.positiveInteger("Only return incidents for this monitor ID."),
    heartbeat_id: s.positiveInteger("Only return incidents for this heartbeat ID."),
    resolved: s.boolean("Whether to return resolved incidents only or unresolved incidents only."),
    acknowledged: s.boolean("Whether to return acknowledged incidents only or unacknowledged incidents only."),
    page: pageField,
    per_page: incidentPerPageField,
  },
  [],
  "Filters and pagination parameters for listing Better Stack incidents.",
);
const createIncidentInputSchema = s.actionInput(
  {
    team_name: teamScopeField,
    requester_email: s.email("Email address of the requester that opened the incident."),
    name: s.nonEmptyString("Short incident name."),
    summary: s.nonEmptyString("Brief summary of the incident."),
    description: s.nonEmptyString("Full description of the incident."),
    call: s.boolean("Whether Better Stack should call the current on-call responder."),
    sms: s.boolean("Whether Better Stack should send an SMS to the on-call responder."),
    email: s.boolean("Whether Better Stack should send an email to the on-call responder."),
    critical_alert: s.boolean("Whether Better Stack should send a critical push notification."),
    team_wait: s.positiveInteger("Seconds to wait before escalating to the whole team."),
    policy_id: idStringOrNumberSchema,
    metadata: metadataMapInputSchema,
  },
  ["summary"],
  "Input payload for creating a Better Stack incident.",
);
const acknowledgeIncidentInputSchema = s.actionInput(
  {
    incident_id: incidentIdField,
    acknowledged_by: s.nonEmptyString("User email or custom identifier acknowledging the incident."),
  },
  ["incident_id"],
  "Input payload for acknowledging a Better Stack incident.",
);
const escalateIncidentInputSchema: JsonSchema = {
  ...s.actionInput(
    {
      incident_id: incidentIdField,
      escalation_type: escalationTypeSchema,
      user_email: s.email("User email to escalate the incident to."),
      user_id: s.positiveInteger("User ID to escalate the incident to."),
      team_name: s.nonEmptyString("Team name to escalate the incident to."),
      team_id: s.positiveInteger("Team ID to escalate the incident to."),
      schedule_id: s.positiveInteger("On-call schedule ID to escalate the incident to."),
      policy_id: s.positiveInteger("Escalation policy ID to escalate the incident to."),
      call: s.boolean("Whether the escalation should trigger phone calls."),
      sms: s.boolean("Whether the escalation should trigger SMS notifications."),
      email: s.boolean("Whether the escalation should trigger email notifications."),
      push: s.boolean("Whether the escalation should trigger push notifications."),
      critical_alert: s.boolean("Whether the escalation should trigger critical push notifications."),
      metadata: metadataMapInputSchema,
    },
    ["incident_id", "escalation_type"],
    "Input payload for escalating a Better Stack incident.",
  ),
  allOf: [
    {
      if: { properties: { escalation_type: { const: "User" } }, required: ["escalation_type"] },
      then: { anyOf: [{ required: ["user_email"] }, { required: ["user_id"] }] },
    },
    {
      if: { properties: { escalation_type: { const: "Team" } }, required: ["escalation_type"] },
      then: { anyOf: [{ required: ["team_name"] }, { required: ["team_id"] }] },
    },
    {
      if: { properties: { escalation_type: { const: "Schedule" } }, required: ["escalation_type"] },
      then: { required: ["schedule_id"] },
    },
    {
      if: { properties: { escalation_type: { const: "Policy" } }, required: ["escalation_type"] },
      then: {
        required: ["policy_id"],
        not: {
          anyOf: [
            { required: ["call"] },
            { required: ["sms"] },
            { required: ["email"] },
            { required: ["push"] },
            { required: ["critical_alert"] },
          ],
        },
      },
    },
  ],
};
const listIncidentCommentsInputSchema = s.actionInput(
  {
    incident_id: incidentIdField,
  },
  ["incident_id"],
  "Input payload for listing Better Stack incident comments.",
);
const listMetadataInputSchema = s.actionInput(
  {
    team_name: teamScopeField,
    owner_id: s.nonEmptyString("Only return metadata records for this owner ID."),
    owner_type: ownerTypeSchema,
    page: pageField,
    per_page: metadataPerPageField,
  },
  [],
  "Filters and pagination parameters for listing Better Stack metadata.",
);

export const betterStackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_incidents",
    description: "List Better Stack incidents with optional date and status filters.",
    requiredScopes: [],
    followUpActions: ["better_stack.get_incident"],
    inputSchema: listIncidentsInputSchema,
    outputSchema: s.actionOutput(
      {
        incidents: s.array("Incidents returned by Better Stack.", incidentSchema),
        pagination: paginationSchema,
      },
      "Paginated Better Stack incident list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_incident",
    description: "Get a Better Stack incident by ID with included resource context when available.",
    requiredScopes: [],
    followUpActions: ["better_stack.list_incident_comments"],
    inputSchema: s.actionInput(
      {
        incident_id: incidentIdField,
      },
      ["incident_id"],
      "Input payload for getting a Better Stack incident.",
    ),
    outputSchema: s.actionOutput(
      {
        incident: incidentSchema,
        included: s.nullable(includedResourceSchema),
      },
      "Single Better Stack incident response with included resource context.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_incident",
    description: "Create a Better Stack incident and alert the current on-call responder.",
    requiredScopes: [],
    followUpActions: ["better_stack.acknowledge_incident", "better_stack.escalate_incident"],
    inputSchema: createIncidentInputSchema,
    outputSchema: s.actionOutput(
      {
        incident: incidentSchema,
      },
      "Single Better Stack incident response.",
    ),
  }),
  defineProviderAction(service, {
    name: "acknowledge_incident",
    description: "Acknowledge a Better Stack incident to stop further escalations.",
    requiredScopes: [],
    inputSchema: acknowledgeIncidentInputSchema,
    outputSchema: s.actionOutput(
      {
        incident: incidentSchema,
      },
      "Single Better Stack incident response.",
    ),
  }),
  defineProviderAction(service, {
    name: "escalate_incident",
    description: "Escalate a Better Stack incident to a user, team, schedule, policy, or organization.",
    requiredScopes: [],
    inputSchema: escalateIncidentInputSchema,
    outputSchema: s.actionOutput(
      {
        incident: incidentSchema,
      },
      "Single Better Stack incident response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_incident_comments",
    description: "List all comments attached to a Better Stack incident.",
    requiredScopes: [],
    inputSchema: listIncidentCommentsInputSchema,
    outputSchema: s.actionOutput(
      {
        comments: s.array("Comments returned for the Better Stack incident.", commentSchema),
      },
      "Incident comments returned by Better Stack.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_metadata",
    description: "List Better Stack metadata records for incidents or other supported owner types.",
    requiredScopes: [],
    inputSchema: listMetadataInputSchema,
    outputSchema: s.actionOutput(
      {
        metadata: s.array("Metadata records returned by Better Stack.", metadataRecordSchema),
        pagination: paginationSchema,
      },
      "Paginated Better Stack metadata list.",
    ),
  }),
];

export type BetterStackActionName = (typeof betterStackActions)[number]["name"];
