import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bookingmood";

const productListInputSchema = s.object(
  "Query parameters for listing Bookingmood products.",
  {
    select: s.nonEmptyString("Columns to select from the products endpoint."),
    limit: s.positiveInteger("Maximum number of products to return."),
    offset: s.nonNegativeInteger("Number of products to skip before returning results."),
    order: s.nonEmptyString("PostgREST order expression for products, such as created_at.desc or updated_at.asc."),
    id: s.nonEmptyString("PostgREST filter for a specific product ID."),
    organization_id: s.nonEmptyString("PostgREST filter for a specific organization ID."),
  },
  {
    optional: ["select", "limit", "offset", "order", "id", "organization_id"],
  },
);

const bookingListInputSchema = s.object(
  "Query parameters for listing Bookingmood bookings.",
  {
    select: s.nonEmptyString("Columns to select from the bookings endpoint."),
    limit: s.positiveInteger("Maximum number of bookings to return."),
    offset: s.nonNegativeInteger("Number of bookings to skip before returning results."),
    order: s.nonEmptyString("PostgREST order expression for bookings, such as created_at.desc or updated_at.asc."),
    id: s.nonEmptyString("PostgREST filter for a specific booking ID."),
    organization_id: s.nonEmptyString("PostgREST filter for a specific organization ID."),
    product_id: s.nonEmptyString("PostgREST filter for bookings related to a product ID."),
  },
  {
    optional: ["select", "limit", "offset", "order", "id", "organization_id", "product_id"],
  },
);

const availabilityInputSchema = s.object(
  "Query parameters for fetching Bookingmood availability for one product.",
  {
    product_id: s.uuid("Bookingmood product ID to query availability for."),
    start: s.date("Start date for the availability window."),
    end: s.date("End date for the availability window."),
  },
  {
    required: ["product_id"],
  },
);

const productSchema = s.looseObject("A Bookingmood product object.", {
  id: s.string("The unique product identifier."),
  organization_id: s.string("The organization identifier that owns the product."),
  name: s.unknown("The localized product name returned by Bookingmood."),
  timezone: s.string("The product timezone."),
  rent_period: s.string("The product rent period."),
  created_at: s.string("The product creation timestamp returned by Bookingmood."),
  updated_at: s.string("The product update timestamp returned by Bookingmood."),
});

const bookingSchema = s.looseObject("A Bookingmood booking object.", {
  id: s.string("The unique booking identifier."),
  organization_id: s.string("The organization identifier that owns the booking."),
  product_id: s.string("The product identifier associated with the booking."),
  status: s.string("The booking status returned by Bookingmood."),
  start_at: s.string("The booking start timestamp returned by Bookingmood."),
  end_at: s.string("The booking end timestamp returned by Bookingmood."),
  created_at: s.string("The booking creation timestamp returned by Bookingmood."),
  updated_at: s.string("The booking update timestamp returned by Bookingmood."),
});

const availabilityEntrySchema = s.looseObject("A Bookingmood availability entry.", {
  date: s.string("The date or interval key returned by Bookingmood."),
  available: s.boolean("Whether the product is available for the interval."),
});

const listProductsOutputSchema = s.object(
  "Bookingmood products returned by the API.",
  {
    products: s.array("Product records returned by Bookingmood.", productSchema),
  },
  { required: ["products"] },
);

const listBookingsOutputSchema = s.object(
  "Bookingmood bookings returned by the API.",
  {
    bookings: s.array("Booking records returned by Bookingmood.", bookingSchema),
  },
  { required: ["bookings"] },
);

const queryAvailabilityOutputSchema = s.object(
  "Bookingmood availability returned for the requested product.",
  {
    availability: s.array("Availability entries returned by Bookingmood.", availabilityEntrySchema),
    raw: s.unknown("Raw availability payload returned by Bookingmood."),
  },
  { required: ["availability", "raw"] },
);

export const bookingmoodActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List Bookingmood products with optional PostgREST select, pagination, ordering, and ID filters.",
    inputSchema: productListInputSchema,
    outputSchema: listProductsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_bookings",
    operationType: "read",
    description: "List Bookingmood bookings with optional PostgREST select, pagination, ordering, and ID filters.",
    inputSchema: bookingListInputSchema,
    outputSchema: listBookingsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "query_availability",
    operationType: "read",
    description: "Fetch Bookingmood availability for a product using the official availability endpoint.",
    inputSchema: availabilityInputSchema,
    outputSchema: queryAvailabilityOutputSchema,
  }),
];
