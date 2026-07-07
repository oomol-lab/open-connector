import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

let service: "instatus" = "instatus";

export type InstatusActionName =
  | "list_status_pages"
  | "list_components"
  | "get_component"
  | "create_component"
  | "update_component"
  | "delete_component"
  | "list_incidents"
  | "get_incident"
  | "create_incident"
  | "update_incident"
  | "delete_incident"
  | "get_incident_update"
  | "create_incident_update"
  | "update_incident_update"
  | "delete_incident_update";

let pageStatusValues: [string, ...string[]] = [
  "UP",
  "HASISSUES",
  "ALLUNDERMAINTENANCE",
  "ALLDEGRADEDPERFORMANCE",
  "ALLPARTIALOUTAGE",
  "ALLMINOROUTAGE",
  "ALLMAJOROUTAGE",
  "SOMEUNDERMAINTENANCE",
  "SOMEDEGRADEDPERFORMANCE",
  "SOMEPARTIALOUTAGE",
  "SOMEMINOROUTAGE",
  "SOMEMAJOROUTAGE",
  "ONEUNDERMAINTENANCE",
  "ONEDEGRADEDPERFORMANCE",
  "ONEPARTIALOUTAGE",
  "ONEMINOROUTAGE",
  "ONEMAJOROUTAGE",
];
let componentStatusValues: [string, ...string[]] = [
  "OPERATIONAL",
  "UNDERMAINTENANCE",
  "DEGRADEDPERFORMANCE",
  "PARTIALOUTAGE",
  "MAJOROUTAGE",
];
let incidentStatusValues: [string, ...string[]] = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"];

let nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
let pageIdSchema = nonEmptyString("The ID of the Instatus status page.");
let componentIdSchema = nonEmptyString("The ID of the Instatus component.");
let incidentIdSchema = nonEmptyString("The ID of the Instatus incident.");
let incidentUpdateIdSchema = nonEmptyString("The ID of the Instatus incident update.");
let pageStatusSchema = s.stringEnum("The computed status of an Instatus status page.", pageStatusValues);
let componentStatusSchema = s.stringEnum("The status of an Instatus component.", componentStatusValues);
let incidentStatusSchema = s.stringEnum("The status of an Instatus incident.", incidentStatusValues);
let translationsSchema = s.record(
  "Translations keyed by field name and then language code.",
  s.record("Translations keyed by language code.", s.string("A translated value.")),
);
let paginationFields = {
  page: s.positiveInteger("The page number for pagination."),
  perPage: s.positiveInteger("The number of items per page, up to 100.", { maximum: 100 }),
};
let paginationOptionalFields: readonly (keyof typeof paginationFields & string)[] = ["page", "perPage"];

let statusPageSchema = s.looseObject("An Instatus status page.", {
  id: s.string("The ID of the status page."),
  subdomain: s.string("The subdomain of the status page."),
  name: s.string("The name of the status page."),
  status: pageStatusSchema,
  logoUrl: s.nullable(s.string("The logo URL of the status page.")),
  faviconUrl: s.nullable(s.string("The favicon URL of the status page.")),
  websiteUrl: s.nullable(s.string("The website URL of the status page.")),
  customDomain: s.nullable(s.string("The custom domain of the status page.")),
  publicEmail: s.nullable(s.string("The public email shown on the status page.")),
  createdAt: s.dateTime("The date and time when the status page was created."),
  updatedAt: s.dateTime("The date and time when the status page was updated."),
});

let componentSchema = s.looseObject("An Instatus component.", {
  id: s.string("The ID of the component."),
  name: s.string("The name of the component."),
  description: s.string("The component description."),
  status: componentStatusSchema,
  order: s.nullable(s.integer("The component order on the status page.")),
  showUptime: s.boolean("Whether uptime is shown for the component."),
  siteId: s.string("The ID of the status page that owns the component."),
  groupId: s.nullable(s.string("The ID of the parent component group.")),
  createdAt: s.dateTime("The date and time when the component was created."),
  updatedAt: s.dateTime("The date and time when the component was updated."),
  archivedAt: s.nullable(s.dateTime("The date and time when the component was archived.")),
  translations: translationsSchema,
});

let incidentComponentStatusSchema = s.object("The status to apply to an affected component.", {
  id: componentIdSchema,
  status: componentStatusSchema,
});
let incidentComponentSchema = s.looseObject("A component affected by an Instatus incident.", {
  id: s.string("The ID of the affected component."),
  name: s.string("The name of the affected component."),
  status: s.anyOf("The status reported for the affected component.", [componentStatusSchema, incidentStatusSchema]),
  showUptime: s.boolean("Whether uptime is shown for the affected component."),
});
let incidentUpdateSchema = s.looseObject("An update on an Instatus incident.", {
  id: s.string("The ID of the incident update."),
  message: s.string("The incident update message."),
  messageHtml: s.string("The HTML form of the incident update message."),
  status: incidentStatusSchema,
  notify: s.boolean("Whether subscribers were notified for the incident update."),
  started: s.dateTime("The date and time when the incident update happened."),
  ended: s.nullable(s.dateTime("The date and time when the incident update resolved.")),
  duration: s.nullable(s.integer("The duration of the incident update in minutes.")),
  createdAt: s.dateTime("The date and time when the incident update was created."),
});
let incidentSchema = s.looseObject("An Instatus incident.", {
  id: s.string("The ID of the incident."),
  name: s.string("The name of the incident."),
  status: incidentStatusSchema,
  started: s.dateTime("The date and time when the incident started."),
  duration: s.nullable(s.integer("The incident duration in minutes.")),
  resolved: s.nullable(s.dateTime("The date and time when the incident resolved.")),
  updates: s.array("The updates attached to the incident.", incidentUpdateSchema),
  components: s.array("The components affected by the incident.", incidentComponentSchema),
  translations: translationsSchema,
});
let incidentUpdateDetailedSchema = s.looseObject("A detailed Instatus incident update.", {
  id: s.string("The ID of the incident update."),
  message: s.string("The incident update message."),
  messageHtml: s.string("The HTML form of the incident update message."),
  status: incidentStatusSchema,
  notify: s.boolean("Whether subscribers were notified for the incident update."),
  started: s.dateTime("The date and time when the incident update happened."),
  incident: incidentSchema,
  translations: translationsSchema,
});

let componentMutationFields = {
  name: nonEmptyString("The name of the component."),
  description: s.string("The component description."),
  status: componentStatusSchema,
  order: s.integer("The order of the component on the status page."),
  showUptime: s.boolean("Whether to show uptime for the component."),
  grouped: s.boolean("Whether the component is a parent or grouped component."),
  group: s.nullable(s.string("The ID of the component to group under.")),
  archived: s.boolean("Whether the component should be archived."),
  translations: translationsSchema,
};
let componentUpdateFields = {
  name: componentMutationFields.name,
  description: componentMutationFields.description,
  status: componentMutationFields.status,
  order: componentMutationFields.order,
  showUptime: componentMutationFields.showUptime,
  grouped: componentMutationFields.grouped,
  archived: componentMutationFields.archived,
  translations: componentMutationFields.translations,
};
let componentOptionalFields: readonly (keyof typeof componentMutationFields & string)[] = [
  "description",
  "status",
  "order",
  "showUptime",
  "grouped",
  "group",
  "archived",
  "translations",
];
let componentUpdateOptionalFields: readonly (keyof typeof componentUpdateFields & string)[] = [
  "name",
  "description",
  "status",
  "order",
  "showUptime",
  "grouped",
  "archived",
  "translations",
];

let incidentMutationFields = {
  name: nonEmptyString("The name of the incident."),
  message: s.string("The initial incident message."),
  components: s.array("The IDs of components affected by the incident.", componentIdSchema),
  started: s.dateTime("The date and time when the incident started."),
  status: incidentStatusSchema,
  notify: s.boolean("Whether to notify subscribers of the incident."),
  shouldPublish: s.boolean("Whether to publish the incident to the page."),
  statuses: s.array("The statuses to apply to affected components.", incidentComponentStatusSchema),
  translations: translationsSchema,
};
let incidentUpdateFields = {
  name: incidentMutationFields.name,
  components: incidentMutationFields.components,
  started: incidentMutationFields.started,
  status: incidentMutationFields.status,
  notify: incidentMutationFields.notify,
  statuses: incidentMutationFields.statuses,
  translations: incidentMutationFields.translations,
};
let incidentCreateOptionalFields: readonly (keyof typeof incidentMutationFields & string)[] = [
  "message",
  "components",
  "started",
  "notify",
  "shouldPublish",
  "statuses",
  "translations",
];
let incidentUpdateOptionalFields: readonly (keyof typeof incidentUpdateFields & string)[] = [
  "name",
  "components",
  "started",
  "status",
  "notify",
  "statuses",
  "translations",
];

let incidentUpdateMutationFields = {
  message: s.string("The incident update message."),
  components: s.array("The IDs of components affected by the incident update.", componentIdSchema),
  started: s.dateTime("The date and time when the incident update happened."),
  status: incidentStatusSchema,
  notify: s.boolean("Whether to notify subscribers of the incident update."),
  statuses: s.array("The statuses to apply to affected components.", incidentComponentStatusSchema),
  translations: translationsSchema,
};
let incidentUpdateCreateOptionalFields: readonly (keyof typeof incidentUpdateMutationFields & string)[] = [
  "message",
  "started",
  "notify",
  "translations",
];
let incidentUpdateEditOptionalFields: readonly (keyof typeof incidentUpdateMutationFields & string)[] = [
  "message",
  "components",
  "started",
  "status",
  "notify",
  "statuses",
  "translations",
];

let listStatusPagesAction = defineProviderAction(service, {
  name: "list_status_pages",
  description: "List Instatus status pages in the authenticated account.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing Instatus status pages.", paginationFields, {
    optional: paginationOptionalFields,
  }),
  outputSchema: s.object("The response returned when listing Instatus status pages.", {
    statusPages: s.array("The status pages returned by Instatus.", statusPageSchema),
  }),
});

let listComponentsAction = defineProviderAction(service, {
  name: "list_components",
  description: "List components on an Instatus status page.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Instatus components.",
    { pageId: pageIdSchema, ...paginationFields },
    { optional: paginationOptionalFields },
  ),
  outputSchema: s.object("The response returned when listing Instatus components.", {
    components: s.array("The components returned by Instatus.", componentSchema),
  }),
});

let getComponentAction = defineProviderAction(service, {
  name: "get_component",
  description: "Get one Instatus component by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting an Instatus component.", {
    pageId: pageIdSchema,
    componentId: componentIdSchema,
  }),
  outputSchema: s.object("The response returned when getting an Instatus component.", {
    component: componentSchema,
  }),
});

let createComponentAction = defineProviderAction(service, {
  name: "create_component",
  description: "Create one component on an Instatus status page.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating an Instatus component.",
    { pageId: pageIdSchema, ...componentMutationFields },
    { optional: componentOptionalFields },
  ),
  outputSchema: s.object("The response returned when creating an Instatus component.", {
    component: componentSchema,
  }),
});

let updateComponentAction = defineProviderAction(service, {
  name: "update_component",
  description: "Update one Instatus component by ID.",
  requiredScopes: [],
  inputSchema: mutationSchema(
    s.object(
      "The input payload for updating an Instatus component.",
      { pageId: pageIdSchema, componentId: componentIdSchema, ...componentUpdateFields },
      { optional: componentUpdateOptionalFields },
    ),
    componentUpdateOptionalFields,
    "At least one component update field must be provided.",
  ),
  outputSchema: s.object("The response returned when updating an Instatus component.", {
    component: componentSchema,
  }),
});

let deleteComponentAction = defineProviderAction(service, {
  name: "delete_component",
  description: "Delete one Instatus component by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting an Instatus component.", {
    pageId: pageIdSchema,
    componentId: componentIdSchema,
  }),
  outputSchema: s.object("The response returned when deleting an Instatus component.", {
    deleted: s.boolean("Whether the delete request completed successfully."),
    id: s.string("The ID of the deleted component."),
  }),
});

let listIncidentsAction = defineProviderAction(service, {
  name: "list_incidents",
  description: "List incidents on an Instatus status page.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Instatus incidents.",
    {
      pageId: pageIdSchema,
      ...paginationFields,
      statuses: s.array("Incident statuses to include.", incidentStatusSchema),
      excludedStatuses: s.array("Incident statuses to exclude.", incidentStatusSchema),
    },
    { optional: [...paginationOptionalFields, "statuses", "excludedStatuses"] },
  ),
  outputSchema: s.object("The response returned when listing Instatus incidents.", {
    incidents: s.array("The incidents returned by Instatus.", incidentSchema),
  }),
});

let getIncidentAction = defineProviderAction(service, {
  name: "get_incident",
  description: "Get one Instatus incident by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting an Instatus incident.", {
    pageId: pageIdSchema,
    incidentId: incidentIdSchema,
  }),
  outputSchema: s.object("The response returned when getting an Instatus incident.", {
    incident: incidentSchema,
  }),
});

let createIncidentAction = defineProviderAction(service, {
  name: "create_incident",
  description: "Create one incident on an Instatus status page.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating an Instatus incident.",
    { pageId: pageIdSchema, ...incidentMutationFields },
    { optional: incidentCreateOptionalFields },
  ),
  outputSchema: s.object("The response returned when creating an Instatus incident.", {
    incident: incidentSchema,
  }),
});

let updateIncidentAction = defineProviderAction(service, {
  name: "update_incident",
  description: "Update one Instatus incident by ID.",
  requiredScopes: [],
  inputSchema: mutationSchema(
    s.object(
      "The input payload for updating an Instatus incident.",
      { pageId: pageIdSchema, incidentId: incidentIdSchema, ...incidentUpdateFields },
      { optional: incidentUpdateOptionalFields },
    ),
    incidentUpdateOptionalFields,
    "At least one incident update field must be provided.",
  ),
  outputSchema: s.object("The response returned when updating an Instatus incident.", {
    incident: incidentSchema,
  }),
});

let deleteIncidentAction = defineProviderAction(service, {
  name: "delete_incident",
  description: "Delete one Instatus incident by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting an Instatus incident.", {
    pageId: pageIdSchema,
    incidentId: incidentIdSchema,
  }),
  outputSchema: s.object("The response returned when deleting an Instatus incident.", {
    deleted: s.boolean("Whether the delete request completed successfully."),
    id: s.string("The ID of the deleted incident."),
  }),
});

let getIncidentUpdateAction = defineProviderAction(service, {
  name: "get_incident_update",
  description: "Get one Instatus incident update by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting an Instatus incident update.", {
    pageId: pageIdSchema,
    incidentId: incidentIdSchema,
    incidentUpdateId: incidentUpdateIdSchema,
  }),
  outputSchema: s.object("The response returned when getting an Instatus incident update.", {
    incidentUpdate: incidentUpdateDetailedSchema,
  }),
});

let createIncidentUpdateAction = defineProviderAction(service, {
  name: "create_incident_update",
  description: "Create one update on an Instatus incident.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating an Instatus incident update.",
    { pageId: pageIdSchema, incidentId: incidentIdSchema, ...incidentUpdateMutationFields },
    { optional: incidentUpdateCreateOptionalFields },
  ),
  outputSchema: s.object("The response returned when creating an Instatus incident update.", {
    incidentUpdate: incidentUpdateDetailedSchema,
  }),
});

let updateIncidentUpdateAction = defineProviderAction(service, {
  name: "update_incident_update",
  description: "Update one Instatus incident update by ID.",
  requiredScopes: [],
  inputSchema: mutationSchema(
    s.object(
      "The input payload for updating an Instatus incident update.",
      {
        pageId: pageIdSchema,
        incidentId: incidentIdSchema,
        incidentUpdateId: incidentUpdateIdSchema,
        ...incidentUpdateMutationFields,
      },
      { optional: incidentUpdateEditOptionalFields },
    ),
    incidentUpdateEditOptionalFields,
    "At least one incident update edit field must be provided.",
  ),
  outputSchema: s.object("The response returned when updating an Instatus incident update.", {
    incidentUpdate: incidentUpdateDetailedSchema,
  }),
});

let deleteIncidentUpdateAction = defineProviderAction(service, {
  name: "delete_incident_update",
  description: "Delete one Instatus incident update by ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting an Instatus incident update.", {
    pageId: pageIdSchema,
    incidentId: incidentIdSchema,
    incidentUpdateId: incidentUpdateIdSchema,
  }),
  outputSchema: s.object("The response returned when deleting an Instatus incident update.", {
    deleted: s.boolean("Whether the delete request completed successfully."),
    id: s.string("The ID of the deleted incident update."),
  }),
});

export const instatusActions: readonly ActionDefinition[] = [
  listStatusPagesAction,
  listComponentsAction,
  getComponentAction,
  createComponentAction,
  updateComponentAction,
  deleteComponentAction,
  listIncidentsAction,
  getIncidentAction,
  createIncidentAction,
  updateIncidentAction,
  deleteIncidentAction,
  getIncidentUpdateAction,
  createIncidentUpdateAction,
  updateIncidentUpdateAction,
  deleteIncidentUpdateAction,
];

function mutationSchema(schema: JsonSchema, fields: readonly string[], _message: string): JsonSchema {
  return {
    ...schema,
    anyOf: fields.map((field) => ({ required: [field] })),
  };
}
