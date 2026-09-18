import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pretix";

const organizerSchema = s.looseObject("A pretix organizer.", {
  name: s.string("The organizer name."),
  slug: s.string("The organizer slug."),
  public_url: s.string("The public organizer URL."),
  plugins: s.array("Enabled organizer plugin package names.", s.string("A plugin package name.")),
});
const eventSchema = s.looseObject("A pretix event.", {
  name: s.looseObject("The translated event name keyed by locale."),
  slug: s.string("The event slug."),
  live: s.boolean("Whether the ticket shop is live."),
  testmode: s.boolean("Whether the event is in test mode."),
  currency: s.string("The event currency code."),
  date_from: s.nullableString(
    "The event start date and time, or null for an event series without a single start date.",
  ),
});
const itemSchema = s.looseObject("A pretix item or product.", {
  id: s.integer("The item ID."),
  name: s.looseObject("The translated item name keyed by locale."),
  default_price: s.string("The default item price as a decimal string."),
  active: s.boolean("Whether the item is active."),
  admission: s.boolean("Whether the item grants event admission."),
});
const orderSchema = s.looseObject("A pretix order.", {
  code: s.string("The order code."),
  event: s.string("The parent event slug."),
  status: s.string("The order status code."),
  testmode: s.boolean("Whether the order was created in test mode."),
  email: s.string("The customer email address."),
  datetime: s.string("The order creation date and time."),
});
const pageFields = {
  count: s.nonNegativeInteger("The total number of matching resources."),
  next: s.nullableString("The next page URL, or null when there is no next page."),
  previous: s.nullableString("The previous page URL, or null when there is no previous page."),
};
const pageInput = {
  page: s.positiveInteger("The one-based page number to retrieve."),
  ordering: s.string("The official pretix ordering expression for this resource."),
};
const organizerInput = s.string("The organizer slug.");
const eventInput = s.string("The event slug.");

export const pretixActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_organizers",
    operationType: "read",
    description: "List pretix organizers accessible to the connected API token.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing pretix organizers.", pageInput, {
      optional: ["page", "ordering"],
    }),
    outputSchema: s.object("A paginated pretix organizer list.", {
      ...pageFields,
      organizers: s.array("Organizers returned by pretix.", organizerSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_organizer",
    operationType: "read",
    description: "Get one pretix organizer by slug.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting a pretix organizer.", {
      organizer: organizerInput,
    }),
    outputSchema: s.object("A pretix organizer response.", { organizer: organizerSchema }),
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description: "List events belonging to a pretix organizer.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing pretix events.",
      { organizer: organizerInput, ...pageInput },
      { optional: ["page", "ordering"] },
    ),
    outputSchema: s.object("A paginated pretix event list.", {
      ...pageFields,
      events: s.array("Events returned by pretix.", eventSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_event",
    operationType: "read",
    description: "Get one pretix event by organizer and event slug.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting a pretix event.", {
      organizer: organizerInput,
      event: eventInput,
    }),
    outputSchema: s.object("A pretix event response.", { event: eventSchema }),
  }),
  defineProviderAction(service, {
    name: "list_items",
    operationType: "read",
    description: "List products or ticket items configured for a pretix event.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing pretix items.",
      { organizer: organizerInput, event: eventInput, ...pageInput },
      { optional: ["page", "ordering"] },
    ),
    outputSchema: s.object("A paginated pretix item list.", {
      ...pageFields,
      items: s.array("Items returned by pretix.", itemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    operationType: "read",
    description: "Get one product or ticket item from a pretix event.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting a pretix item.", {
      organizer: organizerInput,
      event: eventInput,
      itemId: s.positiveInteger("The item ID."),
    }),
    outputSchema: s.object("A pretix item response.", { item: itemSchema }),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List and filter orders for a pretix event.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing pretix orders.",
      {
        organizer: organizerInput,
        event: eventInput,
        ...pageInput,
        status: s.string("The pretix order status code to filter by."),
        search: s.string("A search query matched against order and attendee fields."),
        modifiedSince: s.string("Only return orders modified at or after this ISO 8601 date and time."),
      },
      { optional: ["page", "ordering", "status", "search", "modifiedSince"] },
    ),
    outputSchema: s.object("A paginated pretix order list.", {
      ...pageFields,
      orders: s.array("Orders returned by pretix.", orderSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Get one pretix order by organizer, event, and order code.",
    requiredScopes: [],
    inputSchema: s.object("The input for getting a pretix order.", {
      organizer: organizerInput,
      event: eventInput,
      orderCode: s.string("The order code."),
    }),
    outputSchema: s.object("A pretix order response.", { order: orderSchema }),
  }),
];
