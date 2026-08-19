import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tremendous";

const rawObject = (description: string) => s.looseObject(description);
const rawArray = (description: string, itemDescription: string) => s.array(description, rawObject(itemDescription));

const limit = s.integer("The maximum number of Tremendous records to return. Tremendous caps list pages at 500.", {
  minimum: 1,
  maximum: 500,
});
const offset = s.nonNegativeInteger("The zero-based Tremendous result offset.");

const product = rawObject("A Tremendous product object.");
const campaign = rawObject("A Tremendous campaign object.");
const fundingSource = rawObject("A Tremendous funding source object.");
const order = rawObject("A Tremendous order object.");
const reward = rawObject("A Tremendous reward object.");

const idInput = (resource: string) =>
  s.object(`Input for retrieving one Tremendous ${resource}.`, {
    id: s.nonEmptyString(`The Tremendous ${resource} ID.`),
  });

const productsInput = s.object(
  "Input for listing Tremendous products.",
  {
    country: s.nonEmptyString("Comma-separated Alpha-2 country codes used to filter available products."),
    currency: s.nonEmptyString("Comma-separated ISO 4217 currency codes used to filter available products."),
    subcategory: s.nonEmptyString("Comma-separated Tremendous product subcategories used to filter products."),
  },
  { optional: ["country", "currency", "subcategory"] },
);

const ordersInput = s.object(
  "Input for listing Tremendous orders.",
  {
    offset,
    limit,
    campaignId: s.nonEmptyString("Only return orders for this Tremendous campaign ID."),
    externalId: s.nonEmptyString("Only return orders with this customer-supplied external ID."),
    createdAtGte: s.dateTime("Only return orders created at or after this ISO 8601 timestamp."),
    createdAtLte: s.dateTime("Only return orders created at or before this ISO 8601 timestamp."),
  },
  { optional: ["offset", "limit", "campaignId", "externalId", "createdAtGte", "createdAtLte"] },
);

const rewardsInput = s.object(
  "Input for listing Tremendous rewards.",
  {
    offset,
    limit,
  },
  { optional: ["offset", "limit"] },
);

const rewardValueInput = s.object(
  "The monetary value of the Tremendous reward.",
  {
    denomination: s.number("The amount of the reward."),
    currency_code: s.nonEmptyString("The ISO 4217 currency code for the reward."),
  },
  { optional: ["currency_code"] },
);

const recipientInput = s.object(
  "Details of the Tremendous reward recipient.",
  {
    name: s.nonEmptyString("The recipient name."),
    email: s.email("The recipient email address."),
    phone: s.nonEmptyString("The recipient phone number, including country code for non-US numbers."),
  },
  { optional: ["name", "email", "phone"] },
);

const customFieldInput = s.object("Custom data attached to the Tremendous reward.", {
  id: s.nonEmptyString("The Tremendous custom field ID."),
  value: s.string("The custom field value."),
});

const deliveryInput = s.object(
  "Details on how Tremendous should deliver the reward.",
  {
    method: s.stringEnum("How Tremendous should deliver the reward.", ["EMAIL", "LINK", "PHONE"]),
    meta: s.looseObject("Customizable Tremendous reward delivery metadata.", {
      sender_name: s.string("The sender name used in the delivery."),
      subject_line: s.string("The subject line used for email delivery."),
      message: s.string("The message shown in the delivery and reward landing page."),
    }),
  },
  { optional: ["meta"] },
);

const createOrderInput: JsonSchema = s.object(
  "Input for creating one Tremendous order.",
  {
    externalId: s.nonEmptyString("A customer-supplied idempotency reference for this order."),
    fundingSourceId: s.nonEmptyString(
      "The Tremendous funding source ID used to pay for the order. Use balance to use the Tremendous balance.",
    ),
    campaignId: s.nonEmptyString("The Tremendous campaign ID that defines the reward experience."),
    products: s.array(
      "Product IDs that the recipient can choose from. This overrides campaign products when provided.",
      s.nonEmptyString("A Tremendous product ID."),
      { minItems: 1 },
    ),
    value: rewardValueInput,
    recipient: recipientInput,
    deliverAt: s.date("The reward delivery date. Tremendous ignores time values if a date-time is sent."),
    customFields: s.array("Custom fields to attach to the reward.", customFieldInput),
    language: s.nonEmptyString("The ISO 639-1 language code for the redemption experience."),
    delivery: deliveryInput,
  },
  {
    optional: ["externalId", "campaignId", "products", "deliverAt", "customFields", "language", "delivery"],
  },
);
createOrderInput.anyOf = [{ required: ["campaignId"] }, { required: ["products"] }];

export const tremendousActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_products",
    description: "List Tremendous products with optional country, currency, and subcategory filters.",
    requiredScopes: [],
    inputSchema: productsInput,
    outputSchema: s.object("Tremendous products returned by the API.", {
      products: rawArray("The Tremendous products matching the request.", "A Tremendous product object."),
      raw: rawObject("Raw Tremendous list products response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve one Tremendous product by ID.",
    requiredScopes: [],
    inputSchema: idInput("product"),
    outputSchema: s.object("A Tremendous product response.", {
      product,
      raw: rawObject("Raw Tremendous product response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Tremendous campaigns in the current organization.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Tremendous campaigns.", {}),
    outputSchema: s.object("Tremendous campaigns returned by the API.", {
      campaigns: rawArray("The Tremendous campaigns available to this API key.", "A Tremendous campaign object."),
      raw: rawObject("Raw Tremendous list campaigns response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Retrieve one Tremendous campaign by ID.",
    requiredScopes: [],
    inputSchema: idInput("campaign"),
    outputSchema: s.object("A Tremendous campaign response.", {
      campaign,
      raw: rawObject("Raw Tremendous campaign response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_funding_sources",
    description: "List funding sources in the current Tremendous organization.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Tremendous funding sources.", {}),
    outputSchema: s.object("Tremendous funding sources returned by the API.", {
      fundingSources: rawArray(
        "The Tremendous funding sources available to this API key.",
        "A Tremendous funding source object.",
      ),
      raw: rawObject("Raw Tremendous list funding sources response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_funding_source",
    description: "Retrieve one Tremendous funding source by ID, including the special BALANCE value.",
    requiredScopes: [],
    inputSchema: idInput("funding source"),
    outputSchema: s.object("A Tremendous funding source response.", {
      fundingSource,
      raw: rawObject("Raw Tremendous funding source response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List the Tremendous organization tied to the current API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Tremendous organizations.", {}),
    outputSchema: s.object("Tremendous organizations returned by the API.", {
      organizations: rawArray(
        "The Tremendous organizations visible to this API key.",
        "A Tremendous organization object.",
      ),
      raw: rawObject("Raw Tremendous list organizations response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "List Tremendous orders with optional pagination and order filters.",
    requiredScopes: [],
    inputSchema: ordersInput,
    outputSchema: s.object("Tremendous orders returned by the API.", {
      orders: rawArray("The Tremendous orders matching the request.", "A Tremendous order object."),
      totalCount: s.integer("The total number of Tremendous orders across all pages."),
      raw: rawObject("Raw Tremendous list orders response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Retrieve one Tremendous order by ID or external ID.",
    requiredScopes: [],
    inputSchema: idInput("order or external order"),
    outputSchema: s.object("A Tremendous order response.", {
      order,
      raw: rawObject("Raw Tremendous order response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_order",
    description: "Create a Tremendous reward order with an optional external ID for idempotent retries.",
    requiredScopes: [],
    inputSchema: createOrderInput,
    outputSchema: s.object("A Tremendous order creation response.", {
      order,
      raw: rawObject("Raw Tremendous create order response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_rewards",
    description: "List Tremendous rewards with optional offset pagination.",
    requiredScopes: [],
    inputSchema: rewardsInput,
    outputSchema: s.object("Tremendous rewards returned by the API.", {
      rewards: rawArray("The Tremendous rewards matching the request.", "A Tremendous reward object."),
      totalCount: s.integer("The total number of Tremendous rewards across all pages."),
      raw: rawObject("Raw Tremendous list rewards response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_reward",
    description: "Retrieve one Tremendous reward by ID.",
    requiredScopes: [],
    inputSchema: idInput("reward"),
    outputSchema: s.object("A Tremendous reward response.", {
      reward,
      raw: rawObject("Raw Tremendous reward response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "generate_reward_link",
    description: "Generate a redemption link for an existing Tremendous reward.",
    requiredScopes: [],
    inputSchema: idInput("reward"),
    outputSchema: s.object("A Tremendous generated reward link response.", {
      reward,
      raw: rawObject("Raw Tremendous generate reward link response payload."),
    }),
  }),
];
