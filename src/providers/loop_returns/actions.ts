import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "loop_returns";

const rawObjectSchema = s.unknownObject("The raw object returned by Loop Returns.");

const pageInfoSchema = {
  nextPageUrl: s.nullableString("The URL Loop Returns returned for the next page, or null when none is available."),
  previousPageUrl: s.nullableString(
    "The URL Loop Returns returned for the previous page, or null when none is available.",
  ),
};

const destinationAddressSchema = s.object("A Loop Returns destination address.", {
  address1: s.nullableString("The street address of the destination."),
  address2: s.nullableString("The secondary address details of the destination."),
  city: s.nullableString("The destination city."),
  state: s.nullableString("The destination state or region."),
  zip: s.nullableString("The destination postal code."),
  country: s.nullableString("The destination country name."),
  countryCode: s.nullableString("The destination ISO country code."),
});

const destinationSchema = s.object("A normalized Loop Returns destination.", {
  id: s.integer("The Loop Returns destination identifier."),
  type: s.nullableString("The destination type returned by Loop Returns."),
  name: s.nullableString("The destination name."),
  enabled: s.nullableBoolean("Whether the destination is enabled."),
  providerLocationId: s.nullableInteger("The commerce-platform location identifier linked to this destination."),
  address: s.nullable(destinationAddressSchema),
  raw: rawObjectSchema,
});

const returnSummarySchema = s.object("A normalized Loop Returns return summary.", {
  id: s.string("The Loop Returns return identifier."),
  state: s.nullableString("The current return state."),
  createdAt: s.nullableString("The date and time when the return was created."),
  updatedAt: s.nullableString("The date and time when the return was last updated."),
  orderId: s.nullableString("The Loop Returns order identifier."),
  orderName: s.nullableString("The order name."),
  providerOrderId: s.nullableString("The provider order identifier, such as a Shopify order ID."),
  customer: s.nullableString("The customer email address returned by Loop Returns."),
  currency: s.nullableString("The return currency code."),
  total: s.nullableString("The total cost of the return."),
  outcome: s.nullableString("The return outcome selected by the customer."),
  destinationId: s.nullableString("The destination identifier associated with the return."),
  statusPageUrl: s.nullableString("The Loop Returns status page URL for the return."),
  raw: rawObjectSchema,
});

const returnDetailsSchema = s.object("A normalized Loop Returns return detail record.", {
  id: s.nullableString("The Loop Returns return identifier."),
  state: s.nullableString("The current return state."),
  createdAt: s.nullableString("The date and time when the return was created."),
  updatedAt: s.nullableString("The date and time when the return was last updated."),
  orderId: s.nullableString("The Loop Returns order identifier."),
  orderName: s.nullableString("The order name."),
  providerOrderId: s.nullableString("The provider order identifier, such as a Shopify order ID."),
  customerEmail: s.nullableString("The customer email address returned by Loop Returns."),
  currency: s.nullableString("The return currency code."),
  total: s.nullableString("The total cost of the return."),
  refund: s.nullableString("The refund amount returned by Loop Returns."),
  outcome: s.nullableString("The return outcome selected by the customer."),
  carrier: s.nullableString("The carrier associated with the return."),
  trackingNumber: s.nullableString("The return tracking number."),
  destinationId: s.nullableString("The destination identifier associated with the return."),
  statusPageUrl: s.nullableString("The Loop Returns status page URL for the return."),
  lineItems: s.array("The return line item objects returned by Loop Returns.", rawObjectSchema),
  raw: rawObjectSchema,
});

export const loopReturnsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_returns",
    description: "List Loop Returns returns created or updated within an optional timeframe.",
    inputSchema: s.object(
      "Input for listing Loop Returns returns.",
      {
        from: s.nonEmptyString("The start date and time for the returns list."),
        to: s.nonEmptyString("The end date and time for the returns list."),
        filter: s.stringEnum("The date field Loop Returns should use to filter results.", ["created_at", "updated_at"]),
        state: s.stringEnum("The return state to filter by.", ["open", "closed", "cancelled", "expired", "review"]),
        pageSize: s.integer("The number of returns to return per page.", {
          minimum: 1,
          maximum: 750,
        }),
        cursor: s.nonEmptyString("The Loop Returns cursor identifying the page to return."),
      },
      { optional: ["from", "to", "filter", "state", "pageSize", "cursor"] },
    ),
    outputSchema: s.object("The response returned when listing Loop Returns returns.", {
      ...pageInfoSchema,
      returns: s.array("The Loop Returns return summaries.", returnSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_return_details",
    description: "Get Loop Returns return details by return ID, order ID, or order name.",
    inputSchema: s.object(
      "Input for retrieving one Loop Returns return.",
      {
        returnId: s.positiveInteger("The Loop Returns return ID."),
        orderId: s.positiveInteger("The Loop Returns order ID."),
        orderName: s.nonEmptyString("The order name."),
        currencyType: s.stringEnum("The currency type Loop Returns should use for currency fields.", [
          "shop",
          "presentment",
        ]),
      },
      { optional: ["returnId", "orderId", "orderName", "currencyType"] },
    ),
    outputSchema: s.object("The response returned when getting Loop Returns return details.", {
      return: s.nullable(returnDetailsSchema),
      message: s.nullableString("The Loop Returns message when no matching return was found."),
      raw: s.unknown("The full raw Loop Returns response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_destinations",
    description: "List Loop Returns destinations configured for return shipments.",
    inputSchema: s.object("No input is required for listing Loop Returns destinations.", {}),
    outputSchema: s.object("The response returned when listing Loop Returns destinations.", {
      destinations: s.array("The Loop Returns destinations.", destinationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_destination",
    description: "Get one Loop Returns destination by ID.",
    inputSchema: s.object("Input for retrieving one Loop Returns destination.", {
      destinationId: s.positiveInteger("The Loop Returns destination ID."),
    }),
    outputSchema: s.object("The response returned when getting a Loop Returns destination.", {
      destination: destinationSchema,
    }),
  }),
];
