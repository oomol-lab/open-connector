import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "maintainx";

const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });
const positiveId = (description: string): JsonSchema => s.positiveInteger(description);
const idArray = (description: string): JsonSchema =>
  s.array(description, s.positiveInteger("One MaintainX numeric identifier."), { minItems: 1 });
const stringArray = (description: string): JsonSchema =>
  s.array(description, nonEmptyString("One MaintainX string value."), { minItems: 1 });

const prioritySchema = s.stringEnum("MaintainX work order priority.", ["NONE", "LOW", "MEDIUM", "HIGH"]);
const workOrderStatusSchema = s.stringEnum("MaintainX work order status.", [
  "OPEN",
  "IN_PROGRESS",
  "ON_HOLD",
  "DONE",
  "CANCELED",
  "SKIPPED",
]);
const workOrderStatusUpdateSchema = s.stringEnum("MaintainX status to set on the work order.", [
  "OPEN",
  "IN_PROGRESS",
  "ON_HOLD",
  "DONE",
  "CANCELED",
]);
const workOrderTypeSchema = s.stringEnum("MaintainX work order type.", ["OTHER", "REACTIVE", "PREVENTIVE"]);

const assigneeSchema = s.object("MaintainX work order assignee reference.", {
  type: s.stringEnum("Whether the assignee id refers to a user or a team.", ["USER", "TEAM"]),
  id: s.anyOf("MaintainX user or team id, or a user email address.", [
    s.positiveInteger("MaintainX user or team numeric identifier."),
    nonEmptyString("MaintainX user email address."),
  ]),
});

const organizationFields = {
  organizationId: positiveId("MaintainX organization id for multi-organization tokens."),
  organizationIds: s.array(
    "MaintainX organization ids for endpoints that can query multiple organizations.",
    s.positiveInteger("One MaintainX organization id."),
    { minItems: 1 },
  ),
};

const paginationFields = {
  cursor: nonEmptyString("MaintainX pagination cursor from a previous response."),
  limit: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 200 }),
};

const skipWebhookField = {
  skipWebhook: s.boolean("Whether MaintainX should skip triggering subscribed webhooks."),
};

const entitySchema = (description: string): JsonSchema => s.unknownObject(description);
const externalDataSchema = s.anyOf("Extra data attached to the MaintainX record.", [
  s.unknownObject("Arbitrary external data object."),
  s.number("Numeric external data value."),
  nonEmptyString("String external data value."),
]);
const extraFieldsSchema = s.record("MaintainX custom fields keyed by exact custom field labels.", s.unknown("Value."));
const partsUsedSchema = s.array("Parts used in this MaintainX work order.", s.unknownObject("Parts-used object."));

const paginationOutputFields = {
  nextCursor: s.nullableString("Cursor for the next page when MaintainX returned one."),
  nextPageUrl: s.nullableString("MaintainX relative URL for the next page when returned."),
};

const idOutputSchema = s.object("MaintainX identifier response.", {
  id: s.number("Global MaintainX identifier of the created resource."),
});
const successOutputSchema = s.object("MaintainX empty success response.", {
  ok: s.boolean("Whether MaintainX accepted the request."),
});

const workOrderFields = {
  title: nonEmptyString("MaintainX work order title."),
  description: s.nullableString("MaintainX work order description."),
  assetId: s.nullable(positiveId("MaintainX asset id assigned to the work order.")),
  locationId: s.nullable(positiveId("MaintainX location id assigned to the work order.")),
  priority: prioritySchema,
  type: workOrderTypeSchema,
  dueDate: s.nullable(s.dateTime("Due date and time for the work order.")),
  startDate: s.nullable(s.dateTime("Date and time when the work order should appear.")),
  estimatedTime: s.nullableInteger("Estimated time in seconds required to complete the work order."),
  requesterId: s.anyOf("MaintainX requester id or requester email address.", [
    s.nullable(positiveId("MaintainX requester user id.")),
    nonEmptyString("Requester email address."),
  ]),
  categories: stringArray("Categories assigned to the work order."),
  assignees: s.array("MaintainX users or teams assigned to the work order.", assigneeSchema),
  externalData: s.nullable(externalDataSchema),
  extraFields: extraFieldsSchema,
  vendorIds: idArray("Vendor ids assigned to the work order."),
  partsUsed: partsUsedSchema,
  workRequestId: s.nullable(positiveId("Work request id approved by this work order.")),
  workOrderTemplateId: s.nullable(positiveId("Work order template id used to create this work order.")),
  procedureTemplateId: s.nullable(s.number("Procedure template id to attach to the work order.")),
  parentId: s.nullable(s.number("Parent work order id for sub-work orders.")),
  isParent: s.nullableBoolean("Whether the work order is a parent work order."),
};

const workOrderOptional = [
  "description",
  "assetId",
  "locationId",
  "priority",
  "type",
  "dueDate",
  "startDate",
  "estimatedTime",
  "requesterId",
  "categories",
  "assignees",
  "externalData",
  "extraFields",
  "vendorIds",
  "partsUsed",
  "workRequestId",
  "workOrderTemplateId",
  "procedureTemplateId",
  "parentId",
  "isParent",
];

const locationFields = {
  name: nonEmptyString("MaintainX location name."),
  description: s.nullableString("MaintainX location description."),
  address: s.nullableString("Postal address of the MaintainX location."),
  barcode: s.nullableString("Encoded MaintainX location barcode."),
  parentId: s.nullable(positiveId("Parent MaintainX location id.")),
  extraFields: extraFieldsSchema,
  vendorIds: idArray("Vendor ids assigned to the location."),
};

const locationOptional = ["description", "address", "barcode", "parentId", "extraFields", "vendorIds"];

const userRoleSchema = s.stringEnum("MaintainX user role.", [
  "ADMIN",
  "MEMBER",
  "OPERATOR",
  "REQUESTER",
  "SERVICE_ACCOUNT",
]);
const userAuthTypeSchema = s.stringEnum("MaintainX user authentication type.", ["NORMAL", "SAML", "OIDC"]);
const inviteTypeSchema = s.stringEnum("How MaintainX should invite the user.", ["ALL", "EMAIL", "SMS", "NONE"]);

const userFields = {
  firstName: nonEmptyString("MaintainX user's first name."),
  lastName: nonEmptyString("MaintainX user's last name."),
  email: s.nullable(s.email("MaintainX user's email address.")),
  phoneNumber: s.nullableString("MaintainX user's phone number."),
  role: s.nullable(userRoleSchema),
  customRole: s.nullableString("MaintainX custom role assigned to the user."),
  authType: s.nullable(userAuthTypeSchema),
  inviteType: s.nullable(inviteTypeSchema),
  hourlyRate: s.nullableInteger("User hourly rate in cents."),
  externalData: s.nullable(externalDataSchema),
  extraFields: extraFieldsSchema,
};

const userOptional = [
  "email",
  "phoneNumber",
  "role",
  "customRole",
  "authType",
  "inviteType",
  "hourlyRate",
  "externalData",
  "extraFields",
];

export const maintainxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_work_orders",
    operationType: "read",
    description: "List MaintainX work orders with filters and cursor pagination.",
    inputSchema: s.object(
      "Query parameters for listing MaintainX work orders.",
      {
        ...paginationFields,
        organizationId: organizationFields.organizationId,
        title: s.string("Filter MaintainX work orders by title."),
        assets: idArray("Asset ids to include."),
        notAssets: idArray("Asset ids to exclude."),
        locations: idArray("Location ids to include."),
        notLocations: idArray("Location ids to exclude."),
        parts: idArray("Part ids to include."),
        notParts: idArray("Part ids to exclude."),
        vendors: idArray("Vendor ids to include."),
        notVendors: idArray("Vendor ids to exclude."),
        assignees: idArray("Assignee user ids to include."),
        teams: idArray("Team ids to include."),
        categories: stringArray("Categories to include."),
        notCategories: stringArray("Categories to exclude."),
        priorities: s.array("Work order priorities to include.", prioritySchema, { minItems: 1 }),
        statuses: s.array("Work order statuses to include.", workOrderStatusSchema, { minItems: 1 }),
        partStatuses: stringArray("Part statuses to include."),
        showUpcoming: s.boolean("Whether to include work orders with future start dates."),
        sort: s.stringEnum("MaintainX work order sort attribute.", [
          "-completedAt",
          "-createdAt",
          "-dueDate",
          "-startedAt",
          "-updatedAt",
          "completedAt",
          "createdAt",
          "dueDate",
          "startedAt",
          "updatedAt",
        ]),
        expand: stringArray("MaintainX work order fields to expand."),
      },
      {
        optional: [
          "cursor",
          "limit",
          "organizationId",
          "title",
          "assets",
          "notAssets",
          "locations",
          "notLocations",
          "parts",
          "notParts",
          "vendors",
          "notVendors",
          "assignees",
          "teams",
          "categories",
          "notCategories",
          "priorities",
          "statuses",
          "partStatuses",
          "showUpcoming",
          "sort",
          "expand",
        ],
      },
    ),
    outputSchema: s.object(
      "MaintainX work order list response.",
      {
        workOrders: s.array("Work orders returned by MaintainX.", entitySchema("MaintainX work order.")),
        ...paginationOutputFields,
      },
      { optional: ["nextCursor", "nextPageUrl"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_work_order",
    operationType: "read",
    description: "Retrieve one MaintainX work order by global id.",
    inputSchema: s.object(
      "Path and query parameters for retrieving a MaintainX work order.",
      {
        id: positiveId("MaintainX work order id."),
        expand: stringArray("MaintainX work order fields to expand."),
        useSequentialId: s.boolean("Whether the id is the organization-specific sequential id."),
      },
      { optional: ["expand", "useSequentialId"] },
    ),
    outputSchema: s.object("MaintainX work order response.", {
      workOrder: entitySchema("Work order returned by MaintainX."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_work_order",
    operationType: "write",
    description: "Create a MaintainX work order.",
    inputSchema: s.object(
      "Input payload for creating a MaintainX work order.",
      {
        ...workOrderFields,
        organizationId: organizationFields.organizationId,
        ...skipWebhookField,
      },
      { optional: [...workOrderOptional, "organizationId", "skipWebhook"] },
    ),
    outputSchema: idOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_work_order",
    operationType: "write",
    description: "Update a MaintainX work order.",
    inputSchema: s.object(
      "Input payload for updating a MaintainX work order.",
      {
        id: positiveId("MaintainX work order id."),
        ...workOrderFields,
        ...skipWebhookField,
        expand: stringArray("MaintainX work order fields to expand in the response."),
      },
      { optional: ["title", ...workOrderOptional, "skipWebhook", "expand"] },
    ),
    outputSchema: s.object("MaintainX work order response.", {
      workOrder: entitySchema("Work order returned by MaintainX."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_work_order_status",
    operationType: "write",
    description: "Update the status of a MaintainX work order.",
    inputSchema: s.object(
      "Input payload for updating a MaintainX work order status.",
      {
        id: positiveId("MaintainX work order id."),
        status: workOrderStatusUpdateSchema,
        ...skipWebhookField,
      },
      { optional: ["skipWebhook"] },
    ),
    outputSchema: s.object("MaintainX work order response.", {
      workOrder: entitySchema("Work order returned by MaintainX."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_work_order_comments",
    operationType: "read",
    description: "List comments on a MaintainX work order.",
    inputSchema: s.object(
      "Path and query parameters for listing MaintainX work order comments.",
      {
        id: positiveId("MaintainX work order id."),
        ...paginationFields,
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: s.object(
      "MaintainX work order comments response.",
      {
        comments: s.array("Comments returned by MaintainX.", entitySchema("MaintainX comment.")),
        ...paginationOutputFields,
      },
      { optional: ["nextCursor", "nextPageUrl"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_work_order_comment",
    operationType: "write",
    description: "Create a comment on a MaintainX work order.",
    inputSchema: s.object(
      "Input payload for creating a MaintainX work order comment.",
      {
        id: positiveId("MaintainX work order id."),
        content: nonEmptyString("Comment content to post."),
        ...skipWebhookField,
      },
      { optional: ["skipWebhook"] },
    ),
    outputSchema: idOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_locations",
    operationType: "read",
    description: "List MaintainX locations with filters and cursor pagination.",
    inputSchema: s.object(
      "Query parameters for listing MaintainX locations.",
      {
        ...paginationFields,
        ...organizationFields,
        name: s.string("Filter MaintainX locations by name."),
        customFieldName: stringArray("Custom field names to include."),
        expand: stringArray("MaintainX location fields to expand."),
      },
      {
        optional: ["cursor", "limit", "organizationId", "organizationIds", "name", "customFieldName", "expand"],
      },
    ),
    outputSchema: s.object(
      "MaintainX location list response.",
      {
        locations: s.array("Locations returned by MaintainX.", entitySchema("MaintainX location.")),
        ...paginationOutputFields,
      },
      { optional: ["nextCursor", "nextPageUrl"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_location",
    operationType: "read",
    description: "Retrieve one MaintainX location by id.",
    inputSchema: s.object("Path parameters for retrieving a MaintainX location.", {
      id: positiveId("MaintainX location id."),
    }),
    outputSchema: s.object("MaintainX location response.", {
      location: entitySchema("Location returned by MaintainX."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_location",
    operationType: "write",
    description: "Create a MaintainX location.",
    inputSchema: s.object(
      "Input payload for creating a MaintainX location.",
      {
        ...locationFields,
        organizationId: organizationFields.organizationId,
        ...skipWebhookField,
      },
      { optional: [...locationOptional, "organizationId", "skipWebhook"] },
    ),
    outputSchema: idOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_location",
    operationType: "write",
    description: "Update a MaintainX location.",
    inputSchema: s.object(
      "Input payload for updating a MaintainX location.",
      {
        id: positiveId("MaintainX location id."),
        ...locationFields,
        ...skipWebhookField,
      },
      { optional: ["name", ...locationOptional, "skipWebhook"] },
    ),
    outputSchema: s.object("MaintainX location response.", {
      location: entitySchema("Location returned by MaintainX."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_location",
    operationType: "destructive",
    description: "Delete a MaintainX location by id.",
    inputSchema: s.object(
      "Input payload for deleting a MaintainX location.",
      {
        id: positiveId("MaintainX location id."),
        ...skipWebhookField,
      },
      { optional: ["skipWebhook"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List MaintainX users with filters and cursor pagination.",
    inputSchema: s.object(
      "Query parameters for listing MaintainX users.",
      {
        ...paginationFields,
        organizationId: organizationFields.organizationId,
        onlyAssignable: s.boolean("Whether to only return assignable users."),
        email: stringArray("Email addresses to filter users by."),
        expand: stringArray("MaintainX user fields to expand."),
      },
      { optional: ["cursor", "limit", "organizationId", "onlyAssignable", "email", "expand"] },
    ),
    outputSchema: s.object(
      "MaintainX user list response.",
      {
        users: s.array("Users returned by MaintainX.", entitySchema("MaintainX user.")),
        ...paginationOutputFields,
      },
      { optional: ["nextCursor", "nextPageUrl"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Retrieve one MaintainX user by id.",
    inputSchema: s.object(
      "Path and query parameters for retrieving a MaintainX user.",
      {
        id: positiveId("MaintainX user id."),
        organizationId: organizationFields.organizationId,
      },
      { optional: ["organizationId"] },
    ),
    outputSchema: s.object("MaintainX user response.", {
      user: entitySchema("User returned by MaintainX."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_user",
    operationType: "write",
    description: "Create a MaintainX user.",
    inputSchema: s.object(
      "Input payload for creating a MaintainX user.",
      {
        ...userFields,
        organizationId: organizationFields.organizationId,
        ...skipWebhookField,
      },
      { optional: [...userOptional, "organizationId", "skipWebhook"] },
    ),
    outputSchema: idOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description: "Update a MaintainX user.",
    inputSchema: s.object(
      "Input payload for updating a MaintainX user.",
      {
        id: positiveId("MaintainX user id."),
        ...userFields,
        organizationId: organizationFields.organizationId,
        ...skipWebhookField,
      },
      { optional: ["firstName", "lastName", ...userOptional, "organizationId", "skipWebhook"] },
    ),
    outputSchema: s.object("MaintainX user response.", {
      user: entitySchema("User returned by MaintainX."),
    }),
  }),
];
