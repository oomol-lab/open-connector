import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aroflo";

const fields = s.string(
  "Comma-separated top-level AroFlo fields to include. Sub-entity fields can use bracket notation.",
);
const encodedId = s.nonEmptyString("An AroFlo encoded identifier.");
const raw = s.looseObject("The raw object returned by AroFlo.");
const links = s.looseObject("Related links returned by AroFlo.");
const page = s.object(
  "AroFlo page metadata.",
  {
    count: s.integer("The number of pages available."),
    number: s.integer("The current page number."),
    size: s.integer("The requested page size."),
  },
  { optional: ["count", "number", "size"] },
);
const listOutput = (description: string, item: JsonSchema): JsonSchema =>
  s.object(
    description,
    {
      count: s.integer("The total number of matching records."),
      items: s.array("The records returned by AroFlo.", item),
      page,
      raw,
    },
    { optional: ["count", "page"] },
  );

const clientSummary = s.object(
  "A normalized AroFlo client summary.",
  {
    id: s.string("The unique identifier for the client."),
    name: s.string("The client name."),
    individual: s.boolean("Whether the client is an individual."),
    links,
    raw,
  },
  { optional: ["individual", "links"] },
);
const clientDetail = s.object(
  "A normalized AroFlo client detail.",
  {
    id: s.string("The unique identifier for the client."),
    name: s.string("The client name."),
    individual: s.boolean("Whether the client is an individual."),
    shortName: s.nullableString("The client's short name."),
    website: s.nullableString("The client's website."),
    links,
    raw,
  },
  { optional: ["individual", "shortName", "website", "links"] },
);
const taskSummary = s.object(
  "A normalized AroFlo task summary.",
  {
    id: s.string("The unique identifier for the task."),
    name: s.string("The task name."),
    status: s.string("The task status."),
    jobNumber: s.nullableInteger("The AroFlo job number."),
    dueDate: s.nullableString("The task due date."),
    client: s.looseObject("The client summary."),
    location: s.looseObject("The location summary."),
    links,
    raw,
  },
  { optional: ["name", "status", "jobNumber", "dueDate", "client", "location", "links"] },
);
const taskDetail = s.object(
  "A normalized AroFlo task detail.",
  {
    id: s.string("The unique identifier for the task."),
    name: s.string("The task name."),
    status: s.string("The task status."),
    description: s.nullableString("The task description."),
    jobNumber: s.nullableInteger("The AroFlo job number."),
    dueDate: s.nullableString("The task due date."),
    client: s.looseObject("The client summary."),
    location: s.looseObject("The location summary."),
    links,
    raw,
  },
  { optional: ["name", "status", "description", "jobNumber", "dueDate", "client", "location", "links"] },
);
const userSummary = s.object(
  "A normalized AroFlo user summary.",
  {
    id: s.string("The unique identifier for the user."),
    givenName: s.string("The user's given name."),
    familyName: s.string("The user's family name."),
    email: s.nullableString("The user's email."),
    accessType: s.string("The user's access type."),
    isArchived: s.boolean("Whether the user is archived."),
    businessUnit: s.looseObject("The business unit summary."),
    links,
    raw,
  },
  { optional: ["givenName", "familyName", "email", "accessType", "isArchived", "businessUnit", "links"] },
);
const userDetail = s.object(
  "A normalized AroFlo user detail.",
  {
    id: s.string("The unique identifier for the user."),
    givenName: s.string("The user's given name."),
    familyName: s.string("The user's family name."),
    email: s.nullableString("The user's email."),
    mobile: s.nullableString("The user's mobile."),
    phone: s.nullableString("The user's phone."),
    position: s.nullableString("The user's position."),
    isArchived: s.boolean("Whether the user is archived."),
    links,
    raw,
  },
  { optional: ["givenName", "familyName", "email", "mobile", "phone", "position", "isArchived", "links"] },
);

const taskFilters = {
  businessUnitId: encodedId,
  status: s.integer("Task status: 0=PENDING, 1=IN_PROGRESS, 2=COMPLETED, 3=ARCHIVED.", { minimum: 0, maximum: 3 }),
  assignedFilterUserId: encodedId,
  scheduledFilterUserId: encodedId,
  contractorId: encodedId,
  locationId: encodedId,
  noLocation: s.boolean("Filter tasks with no location assigned."),
  projectId: encodedId,
  clientId: encodedId,
  assetId: encodedId,
  serviceId: encodedId,
  ownerFilterOrgId: encodedId,
  subStatusList: s.nonEmptyString("Comma-separated substatus identifiers."),
  templateId: encodedId,
  tagIds: s.nonEmptyString("Comma-separated tag identifiers."),
  startRow: s.positiveInteger("The starting row for pagination."),
  userBuAccessType: s.stringEnum("Business unit access scope.", ["childbus", "thisbu", "allbus"]),
  assignedFilter: s.nonEmptyString("Assigned resources filter."),
  serviceList: s.nonEmptyString("Comma-separated service identifiers."),
  statusList: s.nonEmptyString("Comma-separated status identifiers."),
  priorityList: s.nonEmptyString("Comma-separated priority identifiers."),
  clientList: s.nonEmptyString("Comma-separated client identifiers."),
  requiredByFrom: s.date("Filter by required-by date from."),
  requiredByTo: s.date("Filter by required-by date to."),
  sortBy: s.stringEnum("The task sort field.", [
    "requiredby",
    "client",
    "clientcode",
    "status",
    "lastupdateutc",
    "jobnumber",
    "custon",
    "service",
    "priority",
    "task",
    "substatus",
    "schedule",
    "modified",
    "completiondate",
  ]),
  ascending: s.boolean("Sort in ascending order."),
  page: s.positiveInteger("The page number."),
  limit: s.integer("The number of items per page.", { minimum: 1, maximum: 100 }),
  fields,
};

export const arofloActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_health_status",
    operationType: "read",
    description: "Retrieve the public health status for the AroFlo API.",
    inputSchema: s.actionInput({}, [], "The health request."),
    outputSchema: s.object(
      "The normalized health status.",
      { status: s.string("The health status."), uptime: s.integer("The API uptime."), raw },
      { optional: ["uptime"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_clients",
    operationType: "read",
    description: "List AroFlo clients with optional partial-name filtering and field selection.",
    inputSchema: s.actionInput({ name: s.string("Filter clients by partial name."), fields }, [], "Client list input."),
    outputSchema: listOutput("The normalized clients response.", clientSummary),
  }),
  defineProviderAction(service, {
    name: "get_client",
    operationType: "read",
    description: "Retrieve a specific AroFlo client by encoded client ID.",
    inputSchema: s.actionInput({ clientId: encodedId, fields }, ["clientId"], "Client lookup input."),
    outputSchema: clientDetail,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List AroFlo tasks with business unit, status, resource, date, and pagination filters.",
    inputSchema: s.actionInput(taskFilters, [], "Task list input."),
    outputSchema: listOutput("The normalized tasks response.", taskSummary),
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description: "Retrieve a specific AroFlo task by encoded task ID.",
    inputSchema: s.actionInput({ taskId: encodedId, fields }, ["taskId"], "Task lookup input."),
    outputSchema: taskDetail,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List AroFlo users for an organisation with optional filters.",
    inputSchema: s.actionInput(
      {
        orgId: encodedId,
        givenName: s.string("Filter by given name."),
        surname: s.string("Filter by surname."),
        billingPortalAccess: s.integer("Billing portal access flag.", { minimum: 0, maximum: 1 }),
        assignedUsersOnly: s.integer("Assigned users only flag.", { minimum: 0, maximum: 1 }),
        excludeDisabledStockholders: s.integer("Exclude disabled stockholders flag.", { minimum: 0, maximum: 1 }),
        includeArchived: s.integer("Include archived users flag.", { minimum: 0, maximum: 1 }),
        fields,
      },
      ["orgId"],
      "User list input.",
    ),
    outputSchema: listOutput("The normalized users response.", userSummary),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Retrieve a specific AroFlo user by encoded user ID.",
    inputSchema: s.actionInput({ userId: encodedId, fields }, ["userId"], "User lookup input."),
    outputSchema: userDetail,
  }),
];
