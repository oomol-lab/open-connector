import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "statuspage";

const pageIdSchema = s.nonEmptyString("The Statuspage page identifier.");
const componentIdSchema = s.nonEmptyString("The Statuspage component identifier.");
const incidentIdSchema = s.nonEmptyString("The Statuspage incident identifier.");
const groupIdSchema = s.nonEmptyString("The Statuspage component group identifier.");
const metadataSchema = s.looseObject("Additional provider-defined metadata returned by Statuspage.");
const componentStatusSchema = s.stringEnum("The Statuspage component status.", [
  "operational",
  "under_maintenance",
  "degraded_performance",
  "partial_outage",
  "major_outage",
]);
const incidentStatusSchema = s.stringEnum("The Statuspage incident status.", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "postmortem",
]);
const impactOverrideSchema = s.stringEnum("The Statuspage incident impact override.", [
  "none",
  "minor",
  "major",
  "critical",
  "maintenance",
]);
const rawObject = s.looseObject("The raw object returned by Statuspage.");
const pageSchema = s.looseObject("A Statuspage page object.", {
  id: s.string("The page id."),
  name: s.string("The page name."),
  subdomain: s.nullableString("The page subdomain when present."),
  url: s.nullable(s.url("The public page URL when Statuspage returns one.")),
  raw: rawObject,
});
const componentSchema = s.looseObject("A Statuspage component object.", {
  id: s.string("The component id."),
  name: s.string("The component name."),
  status: s.string("The component status returned by Statuspage."),
  groupId: s.nullableString("The component group id when the component belongs to a group."),
  raw: rawObject,
});
const incidentSchema = s.looseObject("A Statuspage incident object.", {
  id: s.string("The incident id."),
  name: s.string("The incident name."),
  status: s.string("The incident status returned by Statuspage."),
  impact: s.nullableString("The incident impact returned by Statuspage."),
  shortlink: s.nullable(s.url("The Statuspage incident shortlink when present.")),
  raw: rawObject,
});
const eventSchema = s.looseObject("A Statuspage activity event object.", {
  id: s.nullableString("The event id when present."),
  type: s.nullableString("The event type when present."),
  createdAt: s.nullableString("The timestamp when Statuspage created the event."),
  raw: rawObject,
});
const componentStatusUpdateSchema = s.actionInput(
  {
    componentId: componentIdSchema,
    status: componentStatusSchema,
  },
  ["componentId", "status"],
  "A component status change attached to an incident update.",
);
const incidentCreateSchema = s.actionInput(
  {
    name: s.nonEmptyString("The incident name."),
    status: incidentStatusSchema,
    body: s.nonEmptyString("The incident update body."),
    impactOverride: impactOverrideSchema,
    components: s.array("Component status changes for this incident.", componentStatusUpdateSchema, { minItems: 1 }),
    deliverNotifications: s.boolean("Whether Statuspage should deliver incident notifications."),
    autoTransitionToMaintenanceState: s.boolean(
      "Whether Statuspage should automatically transition components into maintenance.",
    ),
    autoTransitionToOperationalState: s.boolean(
      "Whether Statuspage should automatically transition components back to operational.",
    ),
    autoTransitionDeliverNotificationsAtEnd: s.boolean(
      "Whether Statuspage should deliver notifications when an automatic transition ends.",
    ),
    autoTweetAtBeginning: s.boolean("Whether Statuspage should tweet at the start."),
    autoTweetOnCompletion: s.boolean("Whether Statuspage should tweet on completion."),
    autoTweetOnCreation: s.boolean("Whether Statuspage should tweet on incident creation."),
    autoTweetOneHourBefore: s.boolean("Whether Statuspage should tweet one hour before scheduled maintenance."),
    backfillDate: s.date("The date used by Statuspage for a backfilled incident."),
    backfilled: s.boolean("Whether the incident is backfilled."),
    scheduledFor: s.dateTime("The scheduled start time for a scheduled incident."),
    scheduledUntil: s.dateTime("The scheduled end time for a scheduled incident."),
    scheduledRemindPrior: s.boolean("Whether Statuspage should send a scheduled reminder."),
    scheduledAutoInProgress: s.boolean(
      "Whether Statuspage should automatically move scheduled maintenance in progress.",
    ),
    scheduledAutoCompleted: s.boolean("Whether Statuspage should automatically complete scheduled maintenance."),
    metadata: metadataSchema,
  },
  ["name"],
  "The incident fields sent to Statuspage when creating an incident.",
);
const incidentUpdateSchema = s.actionInput(
  {
    name: s.nonEmptyString("The incident name."),
    status: incidentStatusSchema,
    body: s.nonEmptyString("The incident update body."),
    impactOverride: impactOverrideSchema,
    components: s.array("Component status changes for this incident.", componentStatusUpdateSchema, { minItems: 1 }),
    deliverNotifications: s.boolean("Whether Statuspage should deliver incident notifications."),
    metadata: metadataSchema,
  },
  [],
  "The incident fields sent to Statuspage when updating an incident.",
);
const componentInputSchema = s.actionInput(
  {
    name: s.nonEmptyString("The component name."),
    status: componentStatusSchema,
    description: s.nonEmptyString("The component description."),
    groupId: groupIdSchema,
    onlyShowIfDegraded: s.boolean("Whether Statuspage should show the component only when degraded."),
    showcase: s.boolean("Whether Statuspage should showcase the component."),
    startDate: s.date("The component start date."),
  },
  ["name"],
  "The component fields sent to Statuspage when creating a component.",
);
const componentUpdateInputSchema = s.actionInput(
  {
    name: s.nonEmptyString("The component name."),
    status: componentStatusSchema,
    description: s.nonEmptyString("The component description."),
    groupId: groupIdSchema,
    onlyShowIfDegraded: s.boolean("Whether Statuspage should show the component only when degraded."),
    showcase: s.boolean("Whether Statuspage should showcase the component."),
    startDate: s.date("The component start date."),
  },
  [],
  "The component fields sent to Statuspage when updating a component.",
);

export const statuspageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_pages",
    description: "List Statuspage pages available to the API token.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "Input parameters for listing Statuspage pages."),
    outputSchema: s.requiredObject("The normalized Statuspage pages response.", {
      pages: s.array("The pages returned by Statuspage.", pageSchema),
      raw: s.array("The raw page objects returned by Statuspage.", rawObject),
    }),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Get one Statuspage page by id.",
    requiredScopes: [],
    inputSchema: s.actionInput({ pageId: pageIdSchema }, ["pageId"], "Input parameters for getting a Statuspage page."),
    outputSchema: s.requiredObject("The normalized Statuspage page response.", {
      page: pageSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_components",
    description: "List components for a Statuspage page.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema },
      ["pageId"],
      "Input parameters for listing Statuspage components.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage components response.", {
      components: s.array("The components returned by Statuspage.", componentSchema),
      raw: s.array("The raw component objects returned by Statuspage.", rawObject),
    }),
  }),
  defineProviderAction(service, {
    name: "create_component",
    description: "Create a component on a Statuspage page.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        pageId: pageIdSchema,
        component: componentInputSchema,
      },
      ["pageId", "component"],
      "Input parameters for creating a Statuspage component.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage component response.", {
      component: componentSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "update_component",
    description: "Update a Statuspage component.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        pageId: pageIdSchema,
        componentId: componentIdSchema,
        component: componentUpdateInputSchema,
      },
      ["pageId", "componentId", "component"],
      "Input parameters for updating a Statuspage component.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage component response.", {
      component: componentSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_component",
    description: "Delete a Statuspage component.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema, componentId: componentIdSchema },
      ["pageId", "componentId"],
      "Input parameters for deleting a Statuspage component.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage delete component response.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_incidents",
    description: "List incidents for a Statuspage page.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        pageId: pageIdSchema,
        limit: s.integer("Maximum number of incidents to return.", { minimum: 1, maximum: 100 }),
        page: s.integer("The Statuspage pagination page number.", { minimum: 1 }),
        q: s.nonEmptyString("Search query used by Statuspage to filter incidents."),
      },
      ["pageId"],
      "Input parameters for listing Statuspage incidents.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage incidents response.", {
      incidents: s.array("The incidents returned by Statuspage.", incidentSchema),
      raw: s.array("The raw incident objects returned by Statuspage.", rawObject),
    }),
  }),
  defineProviderAction(service, {
    name: "get_incident",
    description: "Get one Statuspage incident by id.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema, incidentId: incidentIdSchema },
      ["pageId", "incidentId"],
      "Input parameters for getting a Statuspage incident.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage incident response.", {
      incident: incidentSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "create_incident",
    description: "Create an incident on a Statuspage page.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema, incident: incidentCreateSchema },
      ["pageId", "incident"],
      "Input parameters for creating a Statuspage incident.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage incident response.", {
      incident: incidentSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "update_incident",
    description: "Update a Statuspage incident.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema, incidentId: incidentIdSchema, incident: incidentUpdateSchema },
      ["pageId", "incidentId", "incident"],
      "Input parameters for updating a Statuspage incident.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage incident response.", {
      incident: incidentSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_incident",
    description: "Delete a Statuspage incident.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema, incidentId: incidentIdSchema },
      ["pageId", "incidentId"],
      "Input parameters for deleting a Statuspage incident.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage delete incident response.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List activity events for a Statuspage page.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        pageId: pageIdSchema,
        limit: s.integer("Maximum number of events to return.", { minimum: 1, maximum: 100 }),
        page: s.integer("The Statuspage pagination page number.", { minimum: 1 }),
        q: s.nonEmptyString("Search query used by Statuspage to filter events."),
      },
      ["pageId"],
      "Input parameters for listing Statuspage activity events.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage events response.", {
      events: s.array("The events returned by Statuspage.", eventSchema),
      raw: s.array("The raw event objects returned by Statuspage.", rawObject),
    }),
  }),
  defineProviderAction(service, {
    name: "get_automation_email",
    description: "Get the inbound automation email address for a Statuspage page.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { pageId: pageIdSchema },
      ["pageId"],
      "Input parameters for getting a Statuspage automation email.",
    ),
    outputSchema: s.requiredObject("The normalized Statuspage automation email response.", {
      automationEmail: s.email("The automation email address used by Statuspage for email automation."),
      raw: rawObject,
    }),
  }),
];
