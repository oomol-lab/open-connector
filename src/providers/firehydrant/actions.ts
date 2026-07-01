import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "firehydrant";

const rawObjectSchema = s.unknownObject("The raw object returned by FireHydrant.");
const idSchema = (description: string) => s.string(description, { minLength: 1 });

const paginationSchema = s.requiredObject("Pagination metadata returned by FireHydrant.", {
  count: s.nullable(s.integer("The total number of matching records.")),
  page: s.nullable(s.integer("The current page number.")),
  items: s.nullable(s.integer("The number of records returned on this page.")),
  pages: s.nullable(s.integer("The total number of available pages.")),
  last: s.nullable(s.integer("The last page number.")),
  prev: s.nullable(s.integer("The previous page number.")),
  next: s.nullable(s.integer("The next page number.")),
  raw: rawObjectSchema,
});

const entityRefSchema = s.requiredObject("A compact FireHydrant related entity.", {
  id: s.nullable(s.string("The related entity identifier.")),
  name: s.nullable(s.string("The related entity name.")),
  slug: s.nullable(s.string("The related entity slug.")),
  raw: rawObjectSchema,
});

const labelsSchema = s.record(s.unknown("The label value."), {
  description: "FireHydrant labels keyed by label name.",
});

const incidentSchema = s.requiredObject("A normalized FireHydrant incident.", {
  id: s.nullable(s.string("The incident UUID.")),
  name: s.nullable(s.string("The incident name.")),
  number: s.nullable(s.integer("The incident number.")),
  summary: s.nullable(s.string("The incident summary.")),
  description: s.nullable(s.string("The incident description.")),
  customerImpactSummary: s.nullable(s.string("The customer impact summary.")),
  currentMilestone: s.nullable(s.string("The current incident milestone slug.")),
  severity: s.nullable(s.string("The incident severity.")),
  priority: s.nullable(s.string("The incident priority.")),
  createdAt: s.nullable(s.string("When the incident was created.")),
  startedAt: s.nullable(s.string("When the incident started.")),
  updatedAt: s.nullable(s.string("When the incident was last updated.")),
  incidentUrl: s.nullable(s.string("The FireHydrant incident URL.")),
  active: s.nullable(s.boolean("Whether the incident is active.")),
  restricted: s.nullable(s.boolean("Whether the incident is restricted.")),
  services: s.array("Services impacted by the incident.", entityRefSchema),
  environments: s.array("Environments impacted by the incident.", entityRefSchema),
  tags: s.array("Tags attached to the incident.", s.string("A FireHydrant incident tag.")),
  labels: s.nullable(labelsSchema),
  raw: rawObjectSchema,
});

const catalogEntrySchema = s.requiredObject("A normalized FireHydrant catalog entry.", {
  id: s.nullable(s.string("The catalog entry UUID.")),
  name: s.nullable(s.string("The catalog entry name.")),
  slug: s.nullable(s.string("The catalog entry slug.")),
  description: s.nullable(s.string("The catalog entry description.")),
  serviceTier: s.nullable(s.integer("The service tier when FireHydrant provides one.")),
  createdAt: s.nullable(s.string("When the catalog entry was created.")),
  updatedAt: s.nullable(s.string("When the catalog entry was last updated.")),
  activeIncidents: s.array(
    "Active incident identifiers associated with this catalog entry.",
    s.string("An active incident identifier."),
  ),
  labels: s.nullable(labelsSchema),
  owner: s.nullable(entityRefSchema),
  raw: rawObjectSchema,
});

const listInputSchema = s.object(
  "The input payload for FireHydrant paginated list actions.",
  {
    page: s.integer("The page number to request.", { minimum: 1 }),
    perPage: s.integer("The number of records to request per page. FireHydrant allows up to 200.", {
      minimum: 1,
      maximum: 200,
    }),
    query: s.string("A free-text query to search matching records."),
    name: s.string("A name query to search matching records."),
  },
  { optional: ["page", "perPage", "query", "name"] },
);

const listIncidentsInputSchema = s.object(
  "The input payload for listing FireHydrant incidents.",
  {
    page: s.integer("The page number to request.", { minimum: 1 }),
    perPage: s.integer("The number of records to request per page. FireHydrant allows up to 200.", {
      minimum: 1,
      maximum: 200,
    }),
    query: s.string("A text query that searches incident name, summary, and description."),
    name: s.string("A query to search incidents by name."),
    status: s.string("The incident status to filter by."),
    services: s.string("A comma-separated list of service IDs, or is_empty for incidents with no impacted services."),
    environments: s.string(
      "A comma-separated list of environment IDs, or is_empty for incidents with no impacted environments.",
    ),
    tags: s.string("A comma-separated list of tags."),
    tagMatchStrategy: s.stringEnum("The tag matching strategy.", ["any", "match_all", "exclude"]),
    archived: s.boolean("Whether to return archived incidents."),
    createdAtOrAfter: s.dateTime("Only return incidents created at or after this time."),
    createdAtOrBefore: s.dateTime("Only return incidents created at or before this time."),
    updatedAfter: s.dateTime("Only return incidents updated after this time."),
    updatedBefore: s.dateTime("Only return incidents updated before this time."),
  },
  {
    optional: [
      "page",
      "perPage",
      "query",
      "name",
      "status",
      "services",
      "environments",
      "tags",
      "tagMatchStrategy",
      "archived",
      "createdAtOrAfter",
      "createdAtOrBefore",
      "updatedAfter",
      "updatedBefore",
    ],
  },
);

const getIncidentInputSchema = s.requiredObject("The input payload for loading one FireHydrant incident.", {
  incidentId: idSchema("The incident ID to load."),
});

const incidentImpactInputSchema = s.requiredObject("An impacted FireHydrant infrastructure item.", {
  type: s.stringEnum("The impacted infrastructure type.", ["environment", "functionality", "service"]),
  id: idSchema("The impacted infrastructure ID."),
  conditionId: idSchema("The severity matrix condition ID for the impact."),
});

const createIncidentInputSchema = s.object(
  "The input payload for creating a FireHydrant incident.",
  {
    name: s.string("The incident name.", { minLength: 1 }),
    summary: s.string("The incident summary."),
    customerImpactSummary: s.string("The customer impact summary."),
    description: s.string("The incident description."),
    priority: s.string("The incident priority."),
    severity: s.string("The incident severity."),
    severityConditionId: idSchema("The severity condition ID."),
    severityImpactId: idSchema("The severity impact ID."),
    labels: labelsSchema,
    tagList: s.array("Tags to attach to the incident.", s.string("A FireHydrant incident tag.")),
    impacts: s.array("Impacted infrastructure to attach to the incident.", incidentImpactInputSchema),
    teamIds: s.array("Team IDs to assign to the incident.", idSchema("A FireHydrant team ID.")),
    restricted: s.boolean("Whether the incident should be restricted."),
    incidentTypeId: idSchema("The incident type ID."),
    skipIncidentTypeValues: s.boolean("Whether to skip values copied from the incident type."),
  },
  {
    required: ["name"],
    optional: [
      "summary",
      "customerImpactSummary",
      "description",
      "priority",
      "severity",
      "severityConditionId",
      "severityImpactId",
      "labels",
      "tagList",
      "impacts",
      "teamIds",
      "restricted",
      "incidentTypeId",
      "skipIncidentTypeValues",
    ],
  },
);

const getServiceInputSchema = s.requiredObject("The input payload for loading one FireHydrant service.", {
  serviceId: idSchema("The service UUID or slug to load."),
});

const getEnvironmentInputSchema = s.requiredObject("The input payload for loading one FireHydrant environment.", {
  environmentId: idSchema("The environment UUID or slug to load."),
});

export const firehydrantActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_incidents",
    description: "List FireHydrant incidents with stable pagination and common filters.",
    inputSchema: listIncidentsInputSchema,
    outputSchema: s.requiredObject("The response returned when listing FireHydrant incidents.", {
      incidents: s.array("The incidents returned by FireHydrant.", incidentSchema),
      pagination: s.nullable(paginationSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_incident",
    description: "Retrieve a single FireHydrant incident by ID.",
    inputSchema: getIncidentInputSchema,
    outputSchema: s.requiredObject("The response returned when loading a FireHydrant incident.", {
      incident: incidentSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_incident",
    description: "Create a FireHydrant incident using a JSON-friendly request body.",
    inputSchema: createIncidentInputSchema,
    outputSchema: s.requiredObject("The response returned when creating a FireHydrant incident.", {
      incident: incidentSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_services",
    description: "List FireHydrant services with pagination and search filters.",
    inputSchema: listInputSchema,
    outputSchema: s.requiredObject("The response returned when listing FireHydrant services.", {
      services: s.array("The services returned by FireHydrant.", catalogEntrySchema),
      pagination: s.nullable(paginationSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_service",
    description: "Retrieve a single FireHydrant service by UUID or slug.",
    inputSchema: getServiceInputSchema,
    outputSchema: s.requiredObject("The response returned when loading a FireHydrant service.", {
      service: catalogEntrySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List FireHydrant environments with pagination and search filters.",
    inputSchema: listInputSchema,
    outputSchema: s.requiredObject("The response returned when listing FireHydrant environments.", {
      environments: s.array("The environments returned by FireHydrant.", catalogEntrySchema),
      pagination: s.nullable(paginationSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_environment",
    description: "Retrieve a single FireHydrant environment by UUID or slug.",
    inputSchema: getEnvironmentInputSchema,
    outputSchema: s.requiredObject("The response returned when loading a FireHydrant environment.", {
      environment: catalogEntrySchema,
      raw: rawObjectSchema,
    }),
  }),
];

export type FirehydrantActionName =
  | "list_incidents"
  | "get_incident"
  | "create_incident"
  | "list_services"
  | "get_service"
  | "list_environments"
  | "get_environment";
