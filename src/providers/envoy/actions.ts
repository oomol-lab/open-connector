import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "envoy";

const resourceIdSchema = s.nonEmptyString("The Envoy resource ID.");
const resourceIdArraySchema = s.array("Envoy IDs to fetch in one list request.", resourceIdSchema, { minItems: 1 });
const paginationMetaSchema = s.looseObject("Metadata returned by Envoy for this API response.");

const addressSchema = s.looseObject("A physical address returned by Envoy.", {
  line1: s.string("The first address line."),
  line2: s.nullableString("The second address line."),
  city: s.string("The address city."),
  state: s.string("The address state or region."),
  postalCode: s.string("The postal code."),
  country: s.string("The country."),
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
});

const locationSchema = s.looseRequiredObject(
  "An Envoy location.",
  {
    id: s.nonEmptyString("The Envoy location ID."),
    name: s.nonEmptyString("The Envoy location name."),
    enabled: s.boolean("Whether the location is active."),
    companyId: s.string("The Envoy company ID that owns this location."),
    locale: s.string("The location locale."),
    timezone: s.nullableString("The location time zone."),
    logoUrl: s.nullableString("The location logo URL."),
    capacityLimit: s.nullableInteger("The maximum location capacity when present."),
    address: addressSchema,
    createdAt: s.string("The location creation timestamp."),
    updatedAt: s.string("The location update timestamp."),
  },
  {
    optional: [
      "enabled",
      "companyId",
      "locale",
      "timezone",
      "logoUrl",
      "capacityLimit",
      "address",
      "createdAt",
      "updatedAt",
    ],
  },
);

const employeeSchema = s.looseRequiredObject(
  "An Envoy employee.",
  {
    id: s.nonEmptyString("The Envoy employee ID."),
    name: s.nonEmptyString("The employee full name."),
    email: s.email("The employee email address."),
    createdAt: s.string("The employee creation timestamp."),
    updatedAt: s.string("The employee update timestamp."),
  },
  { optional: ["createdAt", "updatedAt"] },
);

const flowSchema = s.looseRequiredObject(
  "An Envoy sign-in flow.",
  {
    id: s.nonEmptyString("The Envoy flow ID."),
    name: s.nonEmptyString("The flow name."),
    type: s.string("The flow type, such as VISITOR or EMPLOYEE."),
    enabled: s.boolean("Whether the flow is enabled for visitor registration."),
    locationId: s.nullableString("The location ID linked to the flow."),
    createdAt: s.string("The flow creation timestamp."),
    updatedAt: s.string("The flow update timestamp."),
  },
  { optional: ["type", "enabled", "locationId", "createdAt", "updatedAt"] },
);

const userViewSchema = s.looseObject("A nested Envoy user view object.");

const inviteSchema = s.looseRequiredObject(
  "An Envoy invite.",
  {
    id: s.nonEmptyString("The Envoy invite ID."),
    expectedArrivalAt: s.string("The invite expected arrival timestamp."),
    expectedDepartureAt: s.nullableString("The invite expected departure timestamp."),
    type: s.string("The invite type, such as VISITOR or EMPLOYEE."),
    approvalStatus: s.nullableString("The current invite approval status."),
    flowId: s.nullableString("The flow ID linked to the invite."),
    locationId: s.nullableString("The location ID linked to the invite."),
    notes: s.nullableString("Internal notes attached to the invite."),
    invitee: userViewSchema,
    host: userViewSchema,
    photoUrl: s.nullableString("The invitee photo URL when present."),
    createdAt: s.string("The invite creation timestamp."),
    updatedAt: s.string("The invite update timestamp."),
  },
  {
    optional: [
      "expectedArrivalAt",
      "expectedDepartureAt",
      "type",
      "approvalStatus",
      "flowId",
      "locationId",
      "notes",
      "invitee",
      "host",
      "photoUrl",
      "createdAt",
      "updatedAt",
    ],
  },
);

const baseListInputSchema = {
  ids: resourceIdArraySchema,
  page: s.positiveInteger("The page number for pagination."),
  perPage: s.positiveInteger("The number of records to return per page."),
  order: s.stringEnum("The sort direction.", ["ASC", "DESC"]),
};

const listLocationsInputSchema = s.object(
  "Input parameters for listing Envoy locations.",
  {
    ...baseListInputSchema,
    perPage: s.positiveInteger("The number of records to return per page.", { maximum: 100 }),
    createdAtAfter: s.dateTime("Return locations created at or after this UTC timestamp."),
    createdAtBefore: s.dateTime("Return locations created at or before this UTC timestamp."),
    enabled: s.boolean("Whether to return active or inactive locations."),
    sort: s.stringEnum("The location field to sort by.", ["createdAt", "updatedAt"]),
  },
  { optional: ["ids", "page", "perPage", "order", "createdAtAfter", "createdAtBefore", "enabled", "sort"] },
);

const listEmployeesInputSchema = s.object(
  "Input parameters for listing Envoy employees.",
  {
    ...baseListInputSchema,
    name: s.string("The employee full name search string. Envoy supports partial matches."),
    email: s.string("The employee email search string. Envoy supports partial matches."),
    sort: s.stringEnum("The employee field to sort by.", ["NAME", "EMAIL"]),
  },
  { optional: ["ids", "page", "perPage", "order", "name", "email", "sort"] },
);

const listFlowsInputSchema = s.object(
  "Input parameters for listing Envoy flows.",
  {
    ...baseListInputSchema,
    locationIds: resourceIdArraySchema,
    enabled: s.boolean("Whether to return only enabled or disabled flows."),
    name: s.string("The flow name search string."),
    type: s.stringEnum("The flow type.", ["VISITOR", "EMPLOYEE"]),
    sort: s.stringEnum("The flow field to sort by.", ["NAME", "CREATED_AT"]),
  },
  { optional: ["ids", "page", "perPage", "order", "locationIds", "enabled", "name", "type", "sort"] },
);

const listInvitesInputSchema = s.object(
  "Input parameters for listing Envoy invites.",
  {
    ...baseListInputSchema,
    locationIds: resourceIdArraySchema,
    expectedArrivalAtBefore: s.dateTime("Return invites expected before this UTC timestamp."),
    expectedArrivalAtAfter: s.dateTime("Return invites expected after this UTC timestamp."),
    hostEmail: s.string("The host email address used to filter invites."),
    inviteeEmail: s.string("The invitee email address used to filter invites."),
    type: s.stringEnum("The invite type.", ["VISITOR", "EMPLOYEE"]),
    approvalStatus: s.stringEnum("The invite approval status.", ["PENDING", "APPROVED", "DENIED", "AWAITING_REVIEW"]),
    sort: s.stringEnum("The invite field to sort by.", ["EXPECTED_ARRIVAL_AT", "CREATED_AT"]),
  },
  {
    optional: [
      "ids",
      "page",
      "perPage",
      "order",
      "locationIds",
      "expectedArrivalAtBefore",
      "expectedArrivalAtAfter",
      "hostEmail",
      "inviteeEmail",
      "type",
      "approvalStatus",
      "sort",
    ],
  },
);

const idInputSchema = s.requiredObject("Input parameters for fetching one Envoy resource by ID.", {
  id: resourceIdSchema,
});

export const envoyActions: ProviderActionDefinition<EnvoyActionName>[] = [
  defineProviderAction(service, {
    name: "list_locations",
    operationType: "read",
    description: "List Envoy locations with optional filters and pagination.",
    inputSchema: listLocationsInputSchema,
    outputSchema: s.requiredObject("The Envoy locations list response.", {
      locations: s.array("Locations returned by Envoy.", locationSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_location",
    operationType: "read",
    description: "Fetch one Envoy location by ID.",
    inputSchema: idInputSchema,
    outputSchema: s.requiredObject("The Envoy location response.", {
      location: locationSchema,
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_employees",
    operationType: "read",
    description: "List Envoy employees with optional search filters and pagination.",
    inputSchema: listEmployeesInputSchema,
    outputSchema: s.requiredObject("The Envoy employees list response.", {
      employees: s.array("Employees returned by Envoy.", employeeSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    operationType: "read",
    description: "Fetch one Envoy employee by ID.",
    inputSchema: idInputSchema,
    outputSchema: s.requiredObject("The Envoy employee response.", {
      employee: employeeSchema,
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_flows",
    operationType: "read",
    description: "List Envoy sign-in flows with optional filters and pagination.",
    inputSchema: listFlowsInputSchema,
    outputSchema: s.requiredObject("The Envoy flows list response.", {
      flows: s.array("Flows returned by Envoy.", flowSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_flow",
    operationType: "read",
    description: "Fetch one Envoy sign-in flow by ID.",
    inputSchema: idInputSchema,
    outputSchema: s.requiredObject("The Envoy flow response.", {
      flow: flowSchema,
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_invites",
    operationType: "read",
    description: "List Envoy invites with optional filters and pagination.",
    inputSchema: listInvitesInputSchema,
    outputSchema: s.requiredObject("The Envoy invites list response.", {
      invites: s.array("Invites returned by Envoy.", inviteSchema),
      meta: paginationMetaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_invite",
    operationType: "read",
    description: "Fetch one Envoy invite by ID.",
    inputSchema: idInputSchema,
    outputSchema: s.requiredObject("The Envoy invite response.", {
      invite: inviteSchema,
      meta: paginationMetaSchema,
    }),
  }),
];

export type EnvoyActionName =
  | "list_locations"
  | "get_location"
  | "list_employees"
  | "get_employee"
  | "list_flows"
  | "get_flow"
  | "list_invites"
  | "get_invite";
