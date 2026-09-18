import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "statuspal";

const rawObjectSchema = s.looseObject("Raw StatusPal object.");
const subdomainInputSchema = s.object(
  {
    subdomain: s.nonEmptyString("The StatusPal status page subdomain."),
  },
  { required: ["subdomain"], description: "Input for targeting a StatusPal page." },
);
const serviceInputSchema = s.object(
  {
    subdomain: s.nonEmptyString("The StatusPal status page subdomain."),
    serviceId: s.integer("The StatusPal service ID."),
  },
  { required: ["subdomain", "serviceId"], description: "Input for targeting a StatusPal service." },
);
const incidentInputSchema = s.object(
  {
    subdomain: s.nonEmptyString("The StatusPal status page subdomain."),
    incidentId: s.integer("The StatusPal incident ID."),
  },
  { required: ["subdomain", "incidentId"], description: "Input for targeting a StatusPal incident." },
);

const statusPageSchema = s.looseObject("A StatusPal status page summary object.", {
  url: s.string("The URL of the website the status page is about."),
  time_zone: s.string("The primary timezone the status page uses."),
  subdomain: s.string("The subdomain that identifies the status page."),
  name: s.string("The status page name."),
  current_incident_type: s.nullableString("The current incident type key."),
});
const serviceSchema = s.looseObject("A StatusPal status service.", {
  id: s.integer("The StatusPal service ID."),
  name: s.string("The service name."),
  current_incident_type: s.nullableString("The current incident type key."),
  children: s.array(rawObjectSchema, { description: "Nested child services returned by StatusPal." }),
});
const incidentSchema = s.looseObject("A StatusPal incident.", {
  id: s.integer("The StatusPal incident ID."),
  title: s.string("The incident title."),
  type: s.string("The incident type key."),
  starts_at: s.dateTime("When the incident or maintenance starts."),
  ends_at: s.nullable(s.dateTime("When the incident or maintenance ends.")),
  service_ids: s.array(s.integer("A StatusPal service ID."), { description: "Affected service IDs." }),
  url: s.string("The public URL for the incident."),
});

export const statuspalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_status_page_status",
    operationType: "read",
    description: "Get the current status reported on a public StatusPal status page.",
    inputSchema: subdomainInputSchema,
    outputSchema: s.object(
      {
        statusPage: statusPageSchema,
        raw: rawObjectSchema,
      },
      { required: ["statusPage", "raw"], description: "StatusPal page status response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_status_page_summary",
    operationType: "read",
    description: "Get a StatusPal page summary including services and active incidents.",
    inputSchema: subdomainInputSchema,
    outputSchema: s.object(
      {
        statusPage: statusPageSchema,
        services: s.array(serviceSchema, { description: "Services returned in the summary." }),
        incidents: s.array(incidentSchema, { description: "Active incidents returned in the summary." }),
        maintenances: s.array(incidentSchema, { description: "Active maintenances returned in the summary." }),
        upcomingMaintenances: s.array(incidentSchema, {
          description: "Upcoming maintenances returned in the summary.",
        }),
        infoNotices: s.array(rawObjectSchema, { description: "Featured information notices." }),
        currentStatusType: s.nullableString("The current status type for the status page summary."),
        raw: rawObjectSchema,
      },
      {
        required: [
          "statusPage",
          "services",
          "incidents",
          "maintenances",
          "upcomingMaintenances",
          "infoNotices",
          "currentStatusType",
          "raw",
        ],
        description: "StatusPal page summary response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_services",
    operationType: "read",
    description: "List services configured on a StatusPal status page.",
    inputSchema: subdomainInputSchema,
    outputSchema: s.object(
      {
        services: s.array(serviceSchema, { description: "Services returned by StatusPal." }),
        raw: s.array(rawObjectSchema, { description: "Raw StatusPal services response." }),
      },
      { required: ["services", "raw"], description: "StatusPal service list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_service",
    operationType: "read",
    description: "Get one StatusPal service by ID.",
    inputSchema: serviceInputSchema,
    outputSchema: s.object(
      {
        service: serviceSchema,
        raw: rawObjectSchema,
      },
      { required: ["service", "raw"], description: "StatusPal service response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_incidents",
    operationType: "read",
    description: "List StatusPal incidents with cursor, limit, and type filters.",
    inputSchema: s.object(
      {
        subdomain: s.nonEmptyString("The StatusPal status page subdomain."),
        before: s.nonEmptyString("Pagination cursor for items before this position."),
        after: s.nonEmptyString("Pagination cursor for items after this position."),
        limit: s.integer("The number of incidents to return, up to 100.", { minimum: 1, maximum: 100 }),
        type: s.nonEmptyString("Filter incidents by incident type key."),
      },
      { required: ["subdomain"], description: "Input for listing StatusPal incidents." },
    ),
    outputSchema: s.object(
      {
        incidents: s.array(incidentSchema, { description: "Incidents returned by StatusPal." }),
        raw: s.array(rawObjectSchema, { description: "Raw StatusPal incidents response." }),
      },
      { required: ["incidents", "raw"], description: "StatusPal incident list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_incident",
    operationType: "read",
    description: "Get one StatusPal incident by ID.",
    inputSchema: incidentInputSchema,
    outputSchema: s.object(
      {
        incident: incidentSchema,
        raw: rawObjectSchema,
      },
      { required: ["incident", "raw"], description: "StatusPal incident response." },
    ),
  }),
];
