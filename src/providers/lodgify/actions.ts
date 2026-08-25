import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lodgify";

const positiveIntegerSchema = (description: string) => s.positiveInteger(description);
const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableIntegerSchema = (description: string) => s.nullable(s.integer(description));
const nullableNumberSchema = (description: string) => s.nullable(s.number(description));

const propertyIdSchema = positiveIntegerSchema("The Lodgify property identifier.");
const bookingIdSchema = positiveIntegerSchema("The Lodgify booking identifier.");
const fromDateSchema = s.date("The start date for the Lodgify query in YYYY-MM-DD format.");
const toDateSchema = s.date("The end date for the Lodgify query in YYYY-MM-DD format.");
const rawObjectSchema = s.looseObject("The raw Lodgify object returned by the API.");

const propertySchema = s.object("A normalized Lodgify property wrapper.", {
  id: nullableIntegerSchema("The Lodgify property identifier when returned."),
  name: nullableStringSchema("The Lodgify property name when returned."),
  raw: rawObjectSchema,
});

const roomSchema = s.object("A normalized Lodgify room type wrapper.", {
  id: nullableIntegerSchema("The Lodgify room type identifier when returned."),
  name: nullableStringSchema("The Lodgify room type name when returned."),
  raw: rawObjectSchema,
});

const availabilityPeriodSchema = s.object("A normalized Lodgify availability period wrapper.", {
  roomTypeId: nullableIntegerSchema("The Lodgify room type identifier for this availability period."),
  start: nullableStringSchema("The availability period start date when returned."),
  end: nullableStringSchema("The availability period end date when returned."),
  available: nullableNumberSchema("The available unit count for this period when returned."),
  raw: rawObjectSchema,
});

const quoteSchema = s.object("A normalized Lodgify quote wrapper.", {
  totalIncludingVat: nullableNumberSchema("The quote total including VAT when returned by Lodgify."),
  currencyCode: nullableStringSchema("The Lodgify quote currency code when returned."),
  raw: rawObjectSchema,
});

const bookingSchema = s.object("A normalized Lodgify booking wrapper.", {
  id: nullableIntegerSchema("The Lodgify booking identifier when returned."),
  status: nullableStringSchema("The Lodgify booking status when returned."),
  raw: rawObjectSchema,
});

export const lodgifyActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_properties",
    description: "List Lodgify properties with optional pagination and total count.",
    inputSchema: s.object(
      "Input for listing Lodgify properties.",
      {
        page: positiveIntegerSchema("The 1-based Lodgify page number to request."),
        size: positiveIntegerSchema("The number of Lodgify items to request per page."),
        includeCount: s.boolean("Whether Lodgify should include the total count."),
      },
      { optional: ["page", "size", "includeCount"] },
    ),
    outputSchema: s.object("A page of Lodgify properties.", {
      count: nullableIntegerSchema("The Lodgify total count when included in the response."),
      properties: s.array("Properties returned for the current Lodgify page.", propertySchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_property",
    description: "Get one Lodgify property by identifier.",
    inputSchema: s.object("Input for retrieving a Lodgify property.", {
      propertyId: propertyIdSchema,
    }),
    outputSchema: s.object("A Lodgify property detail response.", {
      property: propertySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_property_rooms",
    description: "List room types configured for a Lodgify property.",
    inputSchema: s.object("Input for listing Lodgify property room types.", {
      propertyId: propertyIdSchema,
    }),
    outputSchema: s.object("Lodgify room types for a property.", {
      rooms: s.array("Room types returned by Lodgify.", roomSchema),
      raw: s.array("The raw Lodgify room type array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_property_availability",
    description: "Get Lodgify availability periods for a property over a date range.",
    inputSchema: s.object("Input for retrieving Lodgify property availability.", {
      propertyId: propertyIdSchema,
      from: fromDateSchema,
      to: toDateSchema,
    }),
    outputSchema: s.object("Lodgify availability periods for a property.", {
      availability: s.array("Availability periods returned by Lodgify.", availabilityPeriodSchema),
      raw: s.array("The raw Lodgify availability array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_quote",
    description: "Calculate a Lodgify quote for a property, room type, stay dates, and adults.",
    inputSchema: s.object("Input for calculating a Lodgify quote.", {
      propertyId: propertyIdSchema,
      from: fromDateSchema,
      to: toDateSchema,
      roomTypeId: positiveIntegerSchema("The Lodgify room type identifier to quote."),
      adults: positiveIntegerSchema("The number of adult guests to include in the quote."),
    }),
    outputSchema: s.object("A Lodgify quote response.", {
      quote: quoteSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_bookings",
    description: "List Lodgify bookings with pagination and optional stay filter.",
    inputSchema: s.object(
      "Input for listing Lodgify bookings.",
      {
        page: positiveIntegerSchema("The 1-based Lodgify page number to request."),
        size: positiveIntegerSchema("The number of Lodgify items to request per page."),
        stayFilter: s.stringEnum("The Lodgify stay filter for the booking list.", [
          "Upcoming",
          "Current",
          "Historic",
          "All",
        ]),
      },
      { optional: ["page", "size", "stayFilter"] },
    ),
    outputSchema: s.object("A page of Lodgify bookings.", {
      count: nullableIntegerSchema("The Lodgify booking total count when returned."),
      bookings: s.array("Bookings returned for the current Lodgify page.", bookingSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_booking",
    description: "Get one Lodgify booking by identifier.",
    inputSchema: s.object("Input for retrieving a Lodgify booking.", {
      bookingId: bookingIdSchema,
    }),
    outputSchema: s.object("A Lodgify booking detail response.", {
      booking: bookingSchema,
      raw: rawObjectSchema,
    }),
  }),
];
