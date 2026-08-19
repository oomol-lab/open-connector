import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "landbot";

const paginationInputFields = {
  offset: s.integer("Number of items to skip before returning this page.", { minimum: 0 }),
  limit: s.integer("Maximum number of items to return in this page. Landbot accepts up to 100.", {
    minimum: 0,
    maximum: 100,
  }),
};

const paginationOutputFields = {
  success: s.boolean("Whether Landbot accepted the request."),
  total: s.integer("Total number of matching resources before pagination."),
};

const channelSchema = s.looseObject(
  "A Landbot channel returned by the Platform API, including its id, name, type, token, active state, and timestamps when available.",
);

const customerSchema = s.looseObject(
  "A Landbot customer returned by the Platform API, including identity, channel, assignment, field, and conversation state fields when available.",
);

const messageSchema = s.looseObject(
  "A Landbot customer message returned by the Platform API. Message fields vary by message type.",
);

const listChannelsInputSchema = s.object(
  "Pagination and optional filters for listing Landbot channels.",
  {
    ...paginationInputFields,
    type: s.nonEmptyString("Filter channels by Landbot channel type, such as webchat or whatsapp."),
    active: s.boolean("Filter channels by active state."),
  },
  { optional: ["offset", "limit", "type", "active"] },
);

const listCustomersInputSchema = s.object(
  "Pagination and optional filters for listing Landbot customers.",
  {
    ...paginationInputFields,
    channel_id: s.integer("Filter customers by numeric Landbot channel id.", { minimum: 1 }),
    agent_id: s.integer("Filter customers by numeric Landbot agent id.", { minimum: 1 }),
    archived: s.boolean("Filter customers by archived state."),
    opt_in: s.boolean("Filter customers by opt-in state."),
    search_by: s.stringEnum("Customer field used for search.", ["name", "email", "phone"]),
    search: s.nonEmptyString("Search text matched against the selected customer field."),
  },
  {
    optional: ["offset", "limit", "channel_id", "agent_id", "archived", "opt_in", "search_by", "search"],
  },
);

const customerIdInputSchema = s.object("Input identifying a Landbot customer.", {
  customer_id: s.integer("Numeric Landbot customer id.", { minimum: 1 }),
});

const fieldValueSchema = s.anyOf("Value to store in the Landbot customer field.", [
  s.string("String field value."),
  s.number("Number field value."),
  s.boolean("Boolean field value."),
  s.nullable(s.string("Null field value.")),
]);

export const landbotActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_channels",
    description: "List channels in a Landbot workspace with optional pagination and filters.",
    requiredScopes: [],
    inputSchema: listChannelsInputSchema,
    outputSchema: s.object("Landbot channels returned for the requested page.", {
      ...paginationOutputFields,
      channels: s.array("Channels returned for this page.", channelSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Landbot customers with pagination and optional channel or search filters.",
    requiredScopes: [],
    inputSchema: listCustomersInputSchema,
    outputSchema: s.object("Landbot customers returned for the requested page.", {
      ...paginationOutputFields,
      customers: s.array("Customers returned for this page.", customerSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer_messages",
    description: "Fetch the message history for a Landbot customer.",
    requiredScopes: [],
    inputSchema: customerIdInputSchema,
    outputSchema: s.object("Landbot customer message history.", {
      success: s.boolean("Whether Landbot accepted the request."),
      messages: s.array("Messages returned for the customer.", messageSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "send_text",
    description: "Send a text message to a Landbot customer through their current channel.",
    requiredScopes: [],
    inputSchema: s.object("Input for sending a text message to a Landbot customer.", {
      customer_id: s.integer("Numeric Landbot customer id.", { minimum: 1 }),
      message: s.nonEmptyString("Text message to send to the customer."),
    }),
    outputSchema: s.object("A Landbot success response.", {
      success: s.boolean("Whether Landbot accepted the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "set_customer_field",
    description: "Set a typed custom field value on a Landbot customer.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for setting a typed field value on a Landbot customer.",
      {
        customer_id: s.integer("Numeric Landbot customer id.", { minimum: 1 }),
        field_name: s.nonEmptyString("Landbot field name to set on the customer."),
        type: s.stringEnum("Landbot field type for the value.", [
          "string",
          "integer",
          "float",
          "boolean",
          "date",
          "datetime",
        ]),
        value: fieldValueSchema,
        extra: s.looseObject("Optional extra metadata passed through to Landbot for the field."),
      },
      { optional: ["extra"] },
    ),
    outputSchema: s.object("A Landbot success response.", {
      success: s.boolean("Whether Landbot accepted the request."),
    }),
  }),
];
