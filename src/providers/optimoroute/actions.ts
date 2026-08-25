import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "optimoroute";

const trimmedString = (description: string): JsonSchema => s.string({ description, minLength: 1 });

const orderIdentifierSchema = s.object(
  "An OptimoRoute order identifier object referencing an order by orderNo or id.",
  {
    orderNo: trimmedString("The user-specified order identifier."),
    id: trimmedString("The OptimoRoute order identifier assigned by the platform."),
  },
  { optional: ["orderNo", "id"] },
);
orderIdentifierSchema.anyOf = [{ required: ["orderNo"] }, { required: ["id"] }];

const orderOperationSchema = s.stringEnum("The OptimoRoute bulk write mode for this order.", [
  "MERGE",
  "SYNC",
  "CREATE",
  "UPDATE",
]);
const prioritySchema = s.stringEnum("The OptimoRoute order priority.", ["L", "M", "H", "C"]);
const orderTypeSchema = s.stringEnum("The OptimoRoute order type.", ["D", "P", "T"]);
const weekdaySchema = s.stringEnum("One weekday code allowed by OptimoRoute.", [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
]);
const notificationPreferenceSchema = s.stringEnum("The OptimoRoute customer notification preference when specified.", [
  "email",
  "sms",
  "voice",
  "dont_notify",
]);

const assignedToSchema = s.object(
  "An OptimoRoute driver assignment selector.",
  {
    serial: trimmedString("The driver serial recognized by OptimoRoute."),
    externalId: trimmedString("The driver externalId recognized by OptimoRoute."),
  },
  { optional: ["serial", "externalId"] },
);

const timeWindowSchema = s.object(
  "One OptimoRoute order time window.",
  {
    twFrom: trimmedString("The earliest time in HH:MM format."),
    twTo: trimmedString("The latest time in HH:MM format."),
  },
  { required: ["twFrom", "twTo"] },
);

const dateRangeSchema = s.object(
  "An OptimoRoute date range object with inclusive from and to dates.",
  {
    from: s.date("The inclusive start date in YYYY-MM-DD format."),
    to: s.date("The inclusive end date in YYYY-MM-DD format."),
  },
  { optional: ["from", "to"] },
);

const dateTimeWindowSchema = s.object(
  "An OptimoRoute datetime restriction window.",
  {
    from: s.nullable(s.dateTime("The inclusive earliest datetime in ISO format.")),
    to: s.nullable(s.dateTime("The inclusive latest datetime in ISO format.")),
  },
  { optional: ["from", "to"] },
);

const locationSchema = s.looseObject("An OptimoRoute location object.", {
  locationNo: trimmedString("The location identifier."),
  address: trimmedString("The location address."),
  locationName: trimmedString("The location name."),
  latitude: s.number("The location latitude."),
  longitude: s.number("The location longitude."),
  notes: s.string("The location notes."),
  checkInTime: s.number("The check-in time in minutes."),
});

const orderPayloadSchema = s.looseObject("An OptimoRoute order object.", {
  id: trimmedString("The OptimoRoute order identifier assigned by the platform."),
  orderNo: trimmedString("The user-specified order identifier."),
  relatedOrderNo: trimmedString("The related order number for linked pickup and delivery pairs."),
  relatedId: trimmedString("The related OptimoRoute order identifier."),
  operation: orderOperationSchema,
  acceptDuplicateOrderNo: s.boolean("Whether CREATE should allow duplicate orderNo values in OptimoRoute."),
  date: s.date("The order date in YYYY-MM-DD format."),
  duration: s.number("The order duration in minutes."),
  priority: prioritySchema,
  type: orderTypeSchema,
  load1: s.number("The first load requirement."),
  load2: s.number("The second load requirement."),
  load3: s.number("The third load requirement."),
  load4: s.number("The fourth load requirement."),
  assignedTo: assignedToSchema,
  location: locationSchema,
  timeWindows: s.array("The allowed service time windows.", timeWindowSchema),
  allowedWeekdays: s.array("The weekdays allowed for servicing the order.", weekdaySchema),
  allowedDates: dateRangeSchema,
  allowedDateTimes: s.array("The datetime windows when the order can be serviced.", dateTimeWindowSchema),
  skills: s.array("The required driver skills.", trimmedString("One OptimoRoute skill code.")),
  vehicleFeatures: s.array("The required vehicle features.", trimmedString("One OptimoRoute vehicle feature code.")),
  notes: s.string("The free-form order note."),
  email: s.string("The customer email address."),
  phone: s.string("The customer phone number."),
  customField1: s.string("The legacy customField1 value."),
  customField2: s.string("The legacy customField2 value."),
  customField3: s.string("The legacy customField3 value."),
  customField4: s.string("The legacy customField4 value."),
  customField5: s.string("The legacy customField5 value."),
  customFields: s.record(
    "The OptimoRoute custom field values keyed by field code.",
    s.unknown("One custom field value."),
  ),
  notificationPreference: notificationPreferenceSchema,
});

const createOrUpdateOrdersInputSchema = s.object(
  "The input payload for creating, updating, or syncing OptimoRoute orders in bulk.",
  {
    orders: s.array("The list of orders to write to OptimoRoute.", orderPayloadSchema, {
      minItems: 1,
      maxItems: 500,
    }),
  },
  { required: ["orders"] },
);

const getOrdersInputSchema = s.object(
  "The input payload for retrieving OptimoRoute orders in bulk.",
  {
    orders: s.array("The list of orders to retrieve from OptimoRoute.", orderIdentifierSchema, {
      minItems: 1,
      maxItems: 500,
    }),
  },
  { required: ["orders"] },
);

const deleteOrdersInputSchema = s.object(
  "The input payload for deleting OptimoRoute orders in bulk.",
  {
    orders: s.array("The list of orders to delete from OptimoRoute.", orderIdentifierSchema, {
      minItems: 1,
      maxItems: 500,
    }),
    deleteMultiple: s.boolean(
      "Whether delete_orders should remove all matches when one order selector matches multiple orders.",
    ),
    forceDelete: s.boolean("Whether delete_orders should ignore live-plan delete restrictions when possible."),
  },
  { optional: ["deleteMultiple", "forceDelete"] },
);

const nullableString = (description: string): JsonSchema => s.nullable(s.string(description));

const bulkOrderWriteResultSchema = s.object("One normalized OptimoRoute bulk write result.", {
  success: s.boolean("Whether the order write succeeded."),
  id: nullableString("The OptimoRoute order identifier when returned."),
  orderNo: nullableString("The OptimoRoute orderNo when returned."),
  code: nullableString("The OptimoRoute per-order error code when present."),
  message: nullableString("The OptimoRoute per-order error or warning message when present."),
  locationNo: nullableString("The locationNo echoed for location-related errors when present."),
  raw: s.looseObject("The raw OptimoRoute result item."),
});

const bulkOrderReadResultSchema = s.object("One normalized OptimoRoute order read result.", {
  success: s.boolean("Whether the order retrieval succeeded."),
  id: nullableString("The OptimoRoute order identifier when returned."),
  orderNo: nullableString("The OptimoRoute orderNo when returned."),
  code: nullableString("The OptimoRoute per-order error code when present."),
  message: nullableString("The OptimoRoute per-order error or warning message when present."),
  data: s.nullable(s.looseObject("The raw OptimoRoute order object when retrieval succeeded.")),
  raw: s.looseObject("The raw OptimoRoute result item."),
});

const bulkOrderDeleteResultSchema = s.object("One normalized OptimoRoute bulk delete result.", {
  success: s.boolean("Whether the order delete succeeded."),
  id: nullableString("The OptimoRoute order identifier when returned."),
  orderNo: nullableString("The OptimoRoute orderNo when returned."),
  code: nullableString("The OptimoRoute per-order error code when present."),
  message: nullableString("The OptimoRoute per-order error or warning message when present."),
  raw: s.looseObject("The raw OptimoRoute result item."),
});

const createOrUpdateOrdersOutputSchema = s.object("The normalized OptimoRoute create_or_update_orders response.", {
  success: s.boolean("Whether at least one order write succeeded."),
  orders: s.array("The per-order write results returned by OptimoRoute.", bulkOrderWriteResultSchema),
});

const getOrdersOutputSchema = s.object("The normalized OptimoRoute get_orders response.", {
  success: s.boolean("Whether at least one order retrieval succeeded."),
  orders: s.array("The per-order retrieval results returned by OptimoRoute.", bulkOrderReadResultSchema),
});

const deleteOrdersOutputSchema = s.object("The normalized OptimoRoute delete_orders response.", {
  success: s.boolean("Whether at least one order delete succeeded."),
  orders: s.array("The per-order delete results returned by OptimoRoute.", bulkOrderDeleteResultSchema),
});

export const optimorouteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_or_update_orders",
    description: "Create, update, merge, or sync one or more OptimoRoute orders in one request.",
    inputSchema: createOrUpdateOrdersInputSchema,
    outputSchema: createOrUpdateOrdersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_orders",
    description: "Retrieve one or more OptimoRoute orders by orderNo or id.",
    inputSchema: getOrdersInputSchema,
    outputSchema: getOrdersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_orders",
    description: "Delete one or more OptimoRoute orders by orderNo or id.",
    inputSchema: deleteOrdersInputSchema,
    outputSchema: deleteOrdersOutputSchema,
  }),
];
