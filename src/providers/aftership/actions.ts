import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aftership";

const rawObjectSchema = s.unknownObject("A JSON object returned by AfterShip.");
const aftershipIdSchema = s.nonEmptyString("The AfterShip tracking ID.");
const courierSlugSchema = s.nonEmptyString("The AfterShip courier slug, such as dhl, ups, or usps.");

const trackingTagSchema = s.stringEnum("The current shipment delivery status.", [
  "Pending",
  "InfoReceived",
  "InTransit",
  "OutForDelivery",
  "AttemptFail",
  "Delivered",
  "AvailableForPickup",
  "Exception",
  "Expired",
]);

const completedReasonSchema = s.stringEnum("The reason for marking the tracking as completed.", [
  "DELIVERED",
  "LOST",
  "RETURNED_TO_SENDER",
]);

const customFieldsSchema = s.record(
  "Custom tracking fields sent to AfterShip as string key-value pairs.",
  s.string("One custom field value."),
);

const customerSchema = s.object(
  "A shipment customer contact to attach to the tracking.",
  {
    name: s.nonEmptyString("The customer's display name."),
    email: s.email("The customer's email address."),
    phone_number: s.nonEmptyString("The customer's phone number."),
  },
  { optional: ["name", "email", "phone_number"] },
);

const promisedDeliveryDateSchema = s.object(
  "The promised delivery date range in the shipment recipient's timezone.",
  {
    promised_delivery_date: s.nullable(s.nonEmptyString("The promised delivery date.")),
    promised_delivery_date_min: s.nullable(s.nonEmptyString("The earliest promised delivery date.")),
    promised_delivery_date_max: s.nullable(s.nonEmptyString("The latest promised delivery date.")),
  },
  { optional: ["promised_delivery_date", "promised_delivery_date_min", "promised_delivery_date_max"] },
);

const commonTrackingInputFields: Record<string, JsonSchema> = {
  title: s.nonEmptyString("A user-facing tracking title, such as an order number."),
  order_id: s.nonEmptyString("A globally unique identifier for the order."),
  custom_fields: customFieldsSchema,
  order_id_path: s.nonEmptyString("The URL for the order in your system or store."),
  language: s.nonEmptyString("The recipient's ISO 639-1 language code for notifications."),
  order_promised_delivery_date: promisedDeliveryDateSchema,
  pickup_location: s.nonEmptyString("The shipment pickup location for the receiver."),
  delivery_type: s.stringEnum("The shipment delivery type.", ["pickup_at_store", "door_to_door", "pickup_at_courier"]),
  pickup_note: s.nonEmptyString("The shipment pickup note for the receiver."),
  tracking_account_number: s.nonEmptyString("The shipper's carrier account number."),
  tracking_key: s.nonEmptyString("A carrier-specific tracking credential."),
  tracking_ship_date: s.nonEmptyString("The shipment ship date."),
  origin_country_region: s.nonEmptyString("The origin country or region as an ISO Alpha-3 code."),
  origin_state: s.nonEmptyString("The origin state or province."),
  origin_city: s.nonEmptyString("The origin city."),
  origin_postal_code: s.nonEmptyString("The origin postal code."),
  origin_raw_location: s.nonEmptyString("The origin address or raw location text."),
  destination_country_region: s.nonEmptyString("The destination country or region as an ISO Alpha-3 code."),
  destination_state: s.nonEmptyString("The destination state or province."),
  destination_city: s.nonEmptyString("The destination city."),
  destination_postal_code: s.nonEmptyString("The destination postal code."),
  destination_raw_location: s.nonEmptyString("The destination address or raw location text."),
  note: s.nonEmptyString("A note attached to the tracking."),
  order_date: s.nonEmptyString("The order date."),
  order_number: s.nonEmptyString("The order number."),
  shipment_type: s.nonEmptyString("The shipment type."),
  location_id: s.nonEmptyString("The AfterShip location ID."),
  shipping_method: s.nonEmptyString("The shipping method name."),
  customers: s.array("Customer contacts attached to the tracking.", customerSchema),
};

const commonTrackingOptionalFields = [
  "title",
  "order_id",
  "custom_fields",
  "order_id_path",
  "language",
  "order_promised_delivery_date",
  "pickup_location",
  "delivery_type",
  "pickup_note",
  "tracking_account_number",
  "tracking_key",
  "tracking_ship_date",
  "origin_country_region",
  "origin_state",
  "origin_city",
  "origin_postal_code",
  "origin_raw_location",
  "destination_country_region",
  "destination_state",
  "destination_city",
  "destination_postal_code",
  "destination_raw_location",
  "note",
  "order_date",
  "order_number",
  "shipment_type",
  "location_id",
  "shipping_method",
  "customers",
];

const createTrackingInputSchema = s.object(
  "The AfterShip tracking fields to create.",
  {
    id: s.nonEmptyString("A custom tracking ID. AfterShip generates one if omitted."),
    tracking_number: s.nonEmptyString("The carrier tracking number of the shipment."),
    slug: courierSlugSchema,
    slug_group: s.nonEmptyString("A courier slug group such as fedex-group."),
    shipment_tags: s.array("Shipment tag strings attached to the tracking.", s.nonEmptyString("A shipment tag.")),
    courier_connection_id: s.nonEmptyString("The AfterShip courier connection ID."),
    last_mile: courierSlugSchema,
    ...commonTrackingInputFields,
  },
  {
    optional: [
      "id",
      "slug",
      "slug_group",
      "shipment_tags",
      "courier_connection_id",
      "last_mile",
      ...commonTrackingOptionalFields,
    ],
  },
);

const updateTrackingInputSchema = s.object(
  "The AfterShip tracking fields to update.",
  {
    id: aftershipIdSchema,
    slug: courierSlugSchema,
    ...commonTrackingInputFields,
  },
  { optional: ["slug", ...commonTrackingOptionalFields] },
);

const trackingOutputSchema = s.actionOutput(
  {
    tracking: rawObjectSchema,
    meta: rawObjectSchema,
    raw: rawObjectSchema,
  },
  "A normalized AfterShip tracking response.",
);

export const aftershipActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_tracking",
    description: "Create an AfterShip tracking record for a shipment.",
    inputSchema: createTrackingInputSchema,
    outputSchema: trackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tracking",
    description: "Retrieve one AfterShip tracking record by tracking ID.",
    inputSchema: s.object(
      "The input for retrieving one AfterShip tracking.",
      {
        id: aftershipIdSchema,
        fields: s.nonEmptyString("A comma-separated list of response fields to include."),
        lang: s.nonEmptyString("The language code used to translate checkpoint messages."),
      },
      { optional: ["fields", "lang"] },
    ),
    outputSchema: trackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_tracking",
    description: "Update editable fields on an AfterShip tracking record.",
    inputSchema: updateTrackingInputSchema,
    outputSchema: trackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tracking",
    description: "Delete an AfterShip tracking record by tracking ID.",
    inputSchema: s.object("The input for deleting one AfterShip tracking.", {
      id: aftershipIdSchema,
    }),
    outputSchema: trackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trackings",
    description: "List AfterShip trackings with cursor pagination and shipment filters.",
    inputSchema: s.object(
      "The filters and pagination parameters for listing AfterShip trackings.",
      {
        cursor: s.nonEmptyString("The cursor value for the current page of results."),
        limit: s.integer("The number of trackings to return on each page.", { minimum: 1, maximum: 200 }),
        keyword: s.nonEmptyString("Search tracking numbers, titles, order IDs, customers, and custom fields."),
        tracking_numbers: s.array(
          "Tracking numbers to filter by. AfterShip supports up to 50 values.",
          s.nonEmptyString("One tracking number."),
          { minItems: 1, maxItems: 50 },
        ),
        slug: s.array("Courier slugs to filter by.", courierSlugSchema, { minItems: 1 }),
        transit_time: s.integer("Total delivery time in days."),
        origin: s.array("Origin ISO Alpha-3 country or region codes.", s.nonEmptyString("One origin code.")),
        destination: s.array(
          "Destination ISO Alpha-3 country or region codes.",
          s.nonEmptyString("One destination code."),
        ),
        tag: trackingTagSchema,
        created_at_min: s.nonEmptyString("Only include trackings created at or after this timestamp."),
        created_at_max: s.nonEmptyString("Only include trackings created at or before this timestamp."),
        updated_at_min: s.nonEmptyString("Only include trackings updated at or after this timestamp."),
        updated_at_max: s.nonEmptyString("Only include trackings updated at or before this timestamp."),
        fields: s.nonEmptyString("A comma-separated list of response fields to include."),
        return_to_sender: s.boolean("Whether to filter return-to-sender shipments."),
        courier_destination_country_region: s.nonEmptyString("The courier destination country or region to filter by."),
        shipment_tags: s.array("Shipment tags to filter by.", s.nonEmptyString("One shipment tag.")),
        order_id: s.nonEmptyString("The order ID to filter by."),
      },
      {
        optional: [
          "cursor",
          "limit",
          "keyword",
          "tracking_numbers",
          "slug",
          "transit_time",
          "origin",
          "destination",
          "tag",
          "created_at_min",
          "created_at_max",
          "updated_at_min",
          "updated_at_max",
          "fields",
          "return_to_sender",
          "courier_destination_country_region",
          "shipment_tags",
          "order_id",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        trackings: s.array("The AfterShip tracking records returned for the page.", rawObjectSchema),
        pagination: rawObjectSchema,
        meta: rawObjectSchema,
        raw: rawObjectSchema,
      },
      "The normalized response returned when listing AfterShip trackings.",
    ),
  }),
  defineProviderAction(service, {
    name: "retrack_tracking",
    description: "Ask AfterShip to retrack an expired tracking record by ID.",
    inputSchema: s.object("The input for retracking an expired AfterShip tracking.", {
      id: aftershipIdSchema,
    }),
    outputSchema: trackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "mark_tracking_completed",
    description: "Mark an AfterShip tracking record as completed by ID.",
    inputSchema: s.object(
      "The input for marking an AfterShip tracking as completed.",
      {
        id: aftershipIdSchema,
        reason: completedReasonSchema,
        event_datetime: s.nonEmptyString("The completion event timestamp."),
      },
      { optional: ["event_datetime"] },
    ),
    outputSchema: trackingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_couriers",
    description: "List AfterShip couriers, optionally limited to active couriers or slugs.",
    inputSchema: s.object(
      "The filters for listing AfterShip couriers.",
      {
        active: s.boolean("Whether to return only couriers activated for the account."),
        slug: s.array("Courier slugs to filter by.", courierSlugSchema, { minItems: 1 }),
      },
      { optional: ["active", "slug"] },
    ),
    outputSchema: s.actionOutput(
      {
        couriers: s.array("The AfterShip courier records returned by the API.", rawObjectSchema),
        total: s.integer("The total count returned by AfterShip."),
        meta: rawObjectSchema,
        raw: rawObjectSchema,
      },
      "The normalized response returned when listing AfterShip couriers.",
    ),
  }),
  defineProviderAction(service, {
    name: "detect_couriers",
    description: "Detect possible AfterShip couriers for a tracking number.",
    inputSchema: s.object(
      "The shipment fields used to detect possible couriers.",
      {
        tracking_number: s.nonEmptyString("The carrier tracking number to inspect."),
        slug: s.array("Courier slugs to limit auto-detection to.", courierSlugSchema),
        destination_postal_code: s.nonEmptyString("The destination postal code."),
        tracking_ship_date: s.nonEmptyString("The shipping date in YYYYMMDD format."),
        tracking_account_number: s.nonEmptyString("The shipper's carrier account number."),
        tracking_key: s.nonEmptyString("A carrier-specific tracking credential."),
        destination_state: s.nonEmptyString("The destination state or province."),
        slug_group: s.nonEmptyString("A courier slug group such as fedex-group."),
        origin_country_region: s.nonEmptyString("The origin country or region as an ISO Alpha-3 code."),
        destination_country_region: s.nonEmptyString("The destination country or region as an ISO Alpha-3 code."),
      },
      {
        optional: [
          "slug",
          "destination_postal_code",
          "tracking_ship_date",
          "tracking_account_number",
          "tracking_key",
          "destination_state",
          "slug_group",
          "origin_country_region",
          "destination_country_region",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        couriers: s.array("The matched AfterShip courier records.", rawObjectSchema),
        total: s.integer("The total count returned by AfterShip."),
        meta: rawObjectSchema,
        raw: rawObjectSchema,
      },
      "The normalized response returned when detecting AfterShip couriers.",
    ),
  }),
];
