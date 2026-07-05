import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fomo";

export type FomoActionName = "list_events" | "get_event" | "create_event" | "update_event" | "delete_event";

const eventIdSchema = s.oneOf(
  [s.positiveInteger("The numeric Fomo event identifier."), s.nonEmptyString("The string Fomo event identifier.")],
  { description: "The Fomo event identifier." },
);

const eventTypeIdSchema = s.oneOf(
  [s.positiveInteger("The numeric Fomo event type ID."), s.nonEmptyString("The string Fomo event type ID.")],
  { description: "The Fomo event type ID." },
);

const eventTypeTagSchema = s.nonEmptyString("The Fomo event type tag.");
const nullableStringSchema = s.nullable(s.string("The string value returned by Fomo."));
const nullableNumberSchema = s.nullable(s.number("The numeric value returned by Fomo."));
const rawPayloadSchema = s.looseObject("The raw Fomo object payload.");

const customEventFieldInputSchema = s.object("A custom Fomo event field.", {
  key: s.nonEmptyString("The custom field key."),
  value: s.nonEmptyString("The custom field value."),
});

const customEventFieldOutputSchema = s.looseObject("A custom Fomo event field returned by Fomo.", {
  key: s.string("The custom field key."),
  value: s.string("The custom field value."),
});

const eventInputProperties = {
  event_type_id: eventTypeIdSchema,
  event_type_tag: eventTypeTagSchema,
  url: s.url("The URL opened when a visitor clicks the event notification."),
  first_name: s.nonEmptyString("The first name to display in the Fomo event."),
  email_address: s.email("The email address associated with the Fomo event."),
  ip_address: s.nonEmptyString("The IP address Fomo can use for event location enrichment."),
  city: s.nonEmptyString("The city to display in the Fomo event."),
  province: s.nonEmptyString("The province or state to display in the Fomo event."),
  country: s.nonEmptyString("The ISO-2 country code to display in the Fomo event."),
  title: s.nonEmptyString("The title or item name to display in the Fomo event."),
  external_id: s.nonEmptyString("Your application-specific event identifier."),
  image_url: s.url("The image URL to display in the Fomo event."),
  created_at: s.nonEmptyString("The event creation time to send to Fomo when backdating events."),
  custom_event_fields_attributes: s.array(
    "Custom event fields to merge into the selected Fomo template.",
    customEventFieldInputSchema,
    { minItems: 1 },
  ),
};

const eventOutputSchema = s.object("A normalized Fomo event.", {
  id: s.nullable(eventIdSchema),
  event_type_id: s.nullable(eventTypeIdSchema),
  event_type_tag: s.nullable(eventTypeTagSchema),
  url: nullableStringSchema,
  first_name: nullableStringSchema,
  email_address: nullableStringSchema,
  ip_address: nullableStringSchema,
  city: nullableStringSchema,
  province: nullableStringSchema,
  country: nullableStringSchema,
  title: nullableStringSchema,
  external_id: nullableStringSchema,
  image_url: nullableStringSchema,
  message: nullableStringSchema,
  link: nullableStringSchema,
  created_at: nullableStringSchema,
  created_at_to_seconds_from_epoch: nullableNumberSchema,
  custom_event_fields_attributes: s.array("The custom event fields returned by Fomo.", customEventFieldOutputSchema),
  raw: rawPayloadSchema,
});

const metaSchema = s.object("Fomo pagination metadata.", {
  per_page: s.integer("The number of events requested per page."),
  page: s.integer("The current page number."),
  total_count: s.integer("The total number of events available."),
  total_pages: s.integer("The total number of pages available."),
});

const createEventInputSchema = {
  ...s.object("The Fomo event fields used to create a new event.", eventInputProperties, {
    optional: [
      "event_type_id",
      "event_type_tag",
      "first_name",
      "email_address",
      "ip_address",
      "city",
      "province",
      "country",
      "title",
      "external_id",
      "image_url",
      "created_at",
      "custom_event_fields_attributes",
    ],
  }),
  oneOf: [{ required: ["event_type_id"] }, { required: ["event_type_tag"] }],
};

const updateEventInputSchema = {
  ...s.object(
    "The Fomo event fields used to update an existing event.",
    {
      id: eventIdSchema,
      ...eventInputProperties,
    },
    {
      optional: [
        "event_type_id",
        "event_type_tag",
        "url",
        "first_name",
        "email_address",
        "ip_address",
        "city",
        "province",
        "country",
        "title",
        "external_id",
        "image_url",
        "created_at",
        "custom_event_fields_attributes",
      ],
    },
  ),
  not: {
    required: ["event_type_id", "event_type_tag"],
  },
};

export const fomoActions: Array<ProviderActionDefinition<FomoActionName>> = [
  defineProviderAction(service, {
    name: "list_events",
    description: "List Fomo events with optional pagination and ordering.",
    inputSchema: s.object(
      "The filters and pagination options for listing Fomo events.",
      {
        per_page: s.positiveInteger("The number of events to return per page."),
        page: s.positiveInteger("The page number to return."),
        order_by: s.stringEnum("The Fomo event sort field.", ["created_at", "event_type_id"]),
        order_direction: s.stringEnum("The Fomo event sort direction.", ["asc", "desc"]),
      },
      { optional: ["per_page", "page", "order_by", "order_direction"] },
    ),
    outputSchema: s.object("The connector-normalized Fomo event list.", {
      events: s.array("The Fomo events returned for the requested page.", eventOutputSchema),
      meta: metaSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_event",
    description: "Retrieve a single Fomo event by ID.",
    inputSchema: s.object("The input for retrieving a Fomo event.", {
      id: eventIdSchema,
    }),
    outputSchema: s.object("The connector-normalized Fomo event response.", {
      event: eventOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_event",
    description: "Create a Fomo event for a configured event template.",
    inputSchema: createEventInputSchema,
    outputSchema: s.object("The connector-normalized Fomo event creation response.", {
      event: eventOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_event",
    description: "Update an existing Fomo event by ID.",
    inputSchema: updateEventInputSchema,
    outputSchema: s.object("The connector-normalized Fomo event update response.", {
      event: eventOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_event",
    description: "Delete an existing Fomo event by ID.",
    inputSchema: s.object("The input for deleting a Fomo event.", {
      id: eventIdSchema,
    }),
    outputSchema: s.object("The connector-normalized Fomo event deletion response.", {
      message: nullableStringSchema,
      raw: rawPayloadSchema,
    }),
  }),
];
