import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "17track";
const rawObjectSchema = s.unknownObject("A JSON object returned by 17TRACK.");

const trackingNumberSchema = s.string("A 17TRACK-compatible tracking number.", {
  minLength: 5,
  maxLength: 50,
  pattern: "^[A-Za-z0-9-]+$",
});

const carrierSchema = s.positiveInteger("The numeric 17TRACK carrier code.");

const specialTrackingInfoSchema = s.object(
  "Carrier-specific information required to retrieve tracking events.",
  {
    number_type: s.nonEmptyString("The carrier query channel type."),
    parameter: s.nonEmptyString("The value required by the carrier query channel."),
  },
  { optional: ["number_type", "parameter"] },
);

const registrationSchema = s.object(
  "A tracking number and its optional registration metadata.",
  {
    number: trackingNumberSchema,
    lang: s.nonEmptyString("The language code used to translate tracking events."),
    translation_mode: s.stringEnum("The fallback behavior when the carrier does not support the requested language.", [
      "Denied",
      "UseDefaultLang",
      "UseThirdPartyServices",
    ]),
    email: s.email("The recipient email used for optional 17TRACK notifications.", {
      maxLength: 250,
    }),
    order_no: s.string("The merchant order number.", {
      minLength: 5,
      maxLength: 50,
      pattern: "^[A-Za-z0-9-]+$",
    }),
    order_time: s.nonEmptyString("The order time accepted by 17TRACK."),
    carrier: carrierSchema,
    final_carrier: s.positiveInteger("The last-mile carrier code for a UPU shipment."),
    auto_detection: s.boolean("Whether 17TRACK should auto-detect the carrier."),
    origin_country: s.string("The origin ISO 3166-1 alpha-2 country code.", {
      pattern: "^[A-Za-z]{2}$",
    }),
    ship_date: s.nonEmptyString("The shipping date, normally in YYYY/MM/DD format."),
    destination_postal_code: s.nonEmptyString("The destination postal code."),
    destination_country: s.string("The destination ISO 3166-1 alpha-2 country code.", {
      pattern: "^[A-Za-z]{2}$",
    }),
    destination_city: s.nonEmptyString("The destination city."),
    shipper: s.nonEmptyString("The shipper name."),
    consignee: s.nonEmptyString("The consignee name."),
    phone_number_last_4: s.nonEmptyString("The last digits of the shipper or recipient phone number."),
    phone_number: s.nonEmptyString("The shipper or recipient phone number."),
    cpf_or_cnpj: s.nonEmptyString("The Brazilian CPF or CNPJ identifier."),
    special_tracking_info: specialTrackingInfoSchema,
    tag: s.string("A custom tag attached to the tracking number.", { maxLength: 100 }),
    remark: s.string("A note describing the package.", { maxLength: 1_000 }),
  },
  {
    optional: [
      "lang",
      "translation_mode",
      "email",
      "order_no",
      "order_time",
      "carrier",
      "final_carrier",
      "auto_detection",
      "origin_country",
      "ship_date",
      "destination_postal_code",
      "destination_country",
      "destination_city",
      "shipper",
      "consignee",
      "phone_number_last_4",
      "phone_number",
      "cpf_or_cnpj",
      "special_tracking_info",
      "tag",
      "remark",
    ],
  },
);

const trackingQuerySchema = s.object(
  "A tracking number and optional carrier used to retrieve its details.",
  {
    number: trackingNumberSchema,
    carrier: carrierSchema,
  },
  { optional: ["carrier"] },
);

const batchOutputSchema = s.object("A normalized 17TRACK batch response.", {
  accepted: s.array("Items accepted and processed by 17TRACK.", rawObjectSchema),
  rejected: s.array("Items rejected by 17TRACK with error details.", rawObjectSchema),
});

const listOutputSchema = s.object("A normalized 17TRACK tracking list response.", {
  trackings: s.array("Tracking records returned by 17TRACK.", rawObjectSchema),
  pagination: s.object("Pagination information returned by 17TRACK.", {
    totalItems: s.nonNegativeInteger("The total number of matching tracking records."),
    totalPages: s.nonNegativeInteger("The total number of result pages."),
    pageNumber: s.nonNegativeInteger("The current page number."),
    pageSize: s.nonNegativeInteger("The number of records in a page."),
  }),
});

const quotaOutputSchema = s.object("The normalized quota counters for the 17TRACK account.", {
  total: s.nonNegativeInteger("The total tracking quota."),
  used: s.nonNegativeInteger("The tracking quota already used."),
  remaining: s.nonNegativeInteger("The tracking quota still available."),
  todayUsed: s.nonNegativeInteger("The number of tracking registrations used today."),
  dailyLimit: s.nonNegativeInteger("The maximum number of registrations allowed per day, where 0 means unlimited."),
  freeEmailQuota: s.nonNegativeInteger("The free email notification quota."),
  freeEmailQuotaUsed: s.nonNegativeInteger("The free email notification quota already used."),
});

export const seventeenTrackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "register_trackings",
    operationType: "write",
    description: "Register up to 40 tracking numbers for automatic tracking by 17TRACK.",
    requiredScopes: [],
    inputSchema: s.object("The tracking numbers to register with 17TRACK.", {
      trackings: s.array("Tracking numbers to register.", registrationSchema, {
        minItems: 1,
        maxItems: 40,
      }),
    }),
    outputSchema: batchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tracking_details",
    operationType: "read",
    description: "Get current tracking details for up to 40 registered tracking numbers.",
    requiredScopes: [],
    inputSchema: s.object("The tracking numbers whose details should be retrieved.", {
      trackings: s.array("Tracking numbers to retrieve.", trackingQuerySchema, {
        minItems: 1,
        maxItems: 40,
      }),
    }),
    outputSchema: batchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trackings",
    operationType: "read",
    description: "List registered 17TRACK shipments with status, time, and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The filters used to list registered tracking numbers.",
      {
        tracking_numbers: s.array("Tracking numbers to filter by.", trackingNumberSchema, {
          minItems: 1,
          maxItems: 200,
        }),
        carrier: carrierSchema,
        data_origin: s.stringEnum("The source used to register the tracking number.", ["Api", "Manual", "Import"]),
        package_status: s.stringEnum("The current main package status.", [
          "NotFound",
          "InfoReceived",
          "InTransit",
          "Expired",
          "AvailableForPickup",
          "OutForDelivery",
          "DeliveryFailure",
          "Delivered",
          "Exception",
        ]),
        register_time_from: s.nonEmptyString("The start of the registration time range."),
        register_time_to: s.nonEmptyString("The end of the registration time range."),
        tracking_status: s.stringEnum("Whether 17TRACK is still tracking the shipment.", ["Tracking", "Stopped"]),
        sync_status: s.boolean("Whether the latest carrier synchronization succeeded."),
        track_time_from: s.nonEmptyString("The start of the latest tracking time range."),
        track_time_to: s.nonEmptyString("The end of the latest tracking time range."),
        push_time_from: s.nonEmptyString("The start of the webhook push time range."),
        push_time_to: s.nonEmptyString("The end of the webhook push time range."),
        push_status: s.stringEnum("The webhook push result.", ["NotPushed", "Success", "Failure"]),
        push_status_code: s.integer("The webhook HTTP response status code."),
        stop_track_time_from: s.nonEmptyString("The start of the stopped tracking time range."),
        stop_track_time_to: s.nonEmptyString("The end of the stopped tracking time range."),
        page_no: s.nonNegativeInteger("The result page number, starting from 0."),
        order_by: s.stringEnum("The order used for tracking records.", [
          "RegisterTimeAsc",
          "RegisterTimeDesc",
          "PushTimeAsc",
          "PushTimeDesc",
          "TrackTimeAsc",
          "TrackTimeDesc",
        ]),
      },
      {
        optional: [
          "tracking_numbers",
          "carrier",
          "data_origin",
          "package_status",
          "register_time_from",
          "register_time_to",
          "tracking_status",
          "sync_status",
          "track_time_from",
          "track_time_to",
          "push_time_from",
          "push_time_to",
          "push_status",
          "push_status_code",
          "stop_track_time_from",
          "stop_track_time_to",
          "page_no",
          "order_by",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_quota",
    operationType: "read",
    description: "Get the current tracking and email quota counters for the 17TRACK account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve quota counters.", {}),
    outputSchema: quotaOutputSchema,
  }),
];
