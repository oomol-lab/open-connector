import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jumpseller";

const idSchema = s.positiveInteger("The Jumpseller numeric resource id.");
const fieldsSchema = s.stringArray("The Jumpseller fields to return.", {
  itemDescription: "One Jumpseller field name.",
});
const pageSchema = s.positiveInteger("The 1-based page number to request from Jumpseller.", {
  default: 1,
});
const limitSchema = s.integer("The number of records to request from Jumpseller.", {
  minimum: 1,
  maximum: 100,
  default: 50,
});
const localeSchema = s.nonEmptyString("The locale code of the translated Jumpseller content.");
const rawResourceSchema = s.looseObject("The unwrapped Jumpseller resource object.");
const rawPayloadSchema = s.unknown("The raw Jumpseller API response payload.");

const listInputSchema = s.object(
  "Pagination and projection options for Jumpseller list endpoints.",
  {
    page: pageSchema,
    limit: limitSchema,
    fields: fieldsSchema,
  },
  { optional: ["page", "limit", "fields"] },
);

const localizedListInputSchema = s.object(
  "Pagination, locale, and projection options for Jumpseller list endpoints.",
  {
    page: pageSchema,
    limit: limitSchema,
    locale: localeSchema,
    fields: fieldsSchema,
  },
  { optional: ["page", "limit", "locale", "fields"] },
);

const productInputSchema = s.looseRequiredObject(
  "Product fields accepted by Jumpseller product create and update endpoints.",
  {
    name: s.nonEmptyString("Name of the product."),
    price: s.number("Price of the product."),
    description: s.string("Description of the product."),
    page_title: s.string("SEO title of the product."),
    meta_description: s.string("SEO meta description of the product."),
    type: s.stringEnum("Type of the product.", ["physical", "digital", "gift_card"]),
    days_to_expire: s.integer("Number of days a gift card remains valid after purchase."),
    weight: s.number("Weight of the product."),
    stock: s.integer("Quantity in stock for the product."),
    stock_unlimited: s.boolean("Whether the product has unlimited stock."),
    stock_threshold: s.integer("Low stock threshold quantity."),
    stock_notification: s.boolean("Whether low stock notifications are enabled."),
    back_in_stock_enabled: s.boolean("Whether back-in-stock email alerts are enabled."),
    cost_per_item: s.number("Cost per item of the product."),
    compare_at_price: s.number("Sale comparison price, which should be higher than price."),
    minimum_quantity: s.number("Minimum units required to purchase the product."),
    maximum_quantity: s.number("Maximum units that can be purchased per order."),
    sku: s.string("Stock Keeping Unit of the product."),
    barcode: s.string("Barcode of the product."),
    google_product_category_text: s.string("Human-readable label for the Google product taxonomy category."),
    quotable: s.boolean("Whether the product can be quoted."),
    featured: s.boolean("Whether the product is featured."),
    shipping_required: s.boolean("Whether shipping is required for the product."),
    status: s.stringEnum("Status of the product.", ["available", "not-available", "disabled"]),
    package_format: s.stringEnum("Format of the product package.", ["box", "cylinder"]),
    length: s.number("Length of the product."),
    width: s.number("Width of the product."),
    height: s.number("Height of the product."),
    diameter: s.number("Diameter of the product."),
    permalink: s.string("Product unique URL path."),
    categories: s.array("Categories to associate with the product.", s.looseObject("One Jumpseller category object.")),
  },
  {
    optional: [
      "description",
      "page_title",
      "meta_description",
      "type",
      "days_to_expire",
      "weight",
      "stock",
      "stock_unlimited",
      "stock_threshold",
      "stock_notification",
      "back_in_stock_enabled",
      "cost_per_item",
      "compare_at_price",
      "minimum_quantity",
      "maximum_quantity",
      "sku",
      "barcode",
      "google_product_category_text",
      "quotable",
      "featured",
      "shipping_required",
      "status",
      "package_format",
      "length",
      "width",
      "height",
      "diameter",
      "permalink",
      "categories",
    ],
  },
);

const customerCreateInputSchema = s.looseRequiredObject(
  "Customer fields accepted by the Jumpseller customer create endpoint.",
  {
    email: s.email("Email of the customer."),
    phone: s.string("Phone of the customer."),
    password: s.string("Password for the customer account."),
    status: s.stringEnum("Status of the customer.", ["approved", "pending", "disabled"]),
    shipping_address: s.looseObject("Shipping address fields for the customer."),
    billing_address: s.looseObject("Billing address fields for the customer."),
    customer_category: s.array(
      "Customer category ids assigned to the customer.",
      s.integer("One customer category id."),
    ),
  },
  {
    optional: ["phone", "password", "status", "shipping_address", "billing_address", "customer_category"],
  },
);

const customerUpdateInputSchema = s.looseObject(
  "Customer fields accepted by the Jumpseller customer update endpoint.",
  {
    email: s.email("Email of the customer."),
    phone: s.string("Phone of the customer."),
    password: s.string("Password for the customer account."),
    status: s.stringEnum("Status of the customer.", ["approved", "pending", "disabled"]),
    shipping_address: s.looseObject("Shipping address fields for the customer."),
    billing_address: s.looseObject("Billing address fields for the customer."),
    customer_category: s.array(
      "Customer category ids assigned to the customer.",
      s.integer("One customer category id."),
    ),
  },
);

const categoryCreateInputSchema = s.looseRequiredObject(
  "Category fields accepted by the Jumpseller category create endpoint.",
  {
    name: s.nonEmptyString("Name of the category."),
    parent_id: s.integer("Unique identifier of the parent category."),
    default_order: s.stringEnum("Default order of products in the category.", [
      "position-asc",
      "name-asc",
      "name-desc",
      "price-asc",
      "price-desc",
      "date-desc",
    ]),
    description: s.string("Description of the category."),
    filters_visibility: s.boolean("Whether filters are visible in the category page."),
    not_recommendable: s.boolean("Whether the category is recommendable."),
    permalink: s.string("Category unique URL path."),
    page_title: s.string("SEO page title for the category page."),
    meta_description: s.string("SEO meta description for the category page."),
    products: s.array(
      "Products to associate with the category.",
      s.requiredObject("One product association.", {
        id: s.integer("Unique identifier of the product."),
      }),
    ),
  },
  {
    optional: [
      "parent_id",
      "default_order",
      "description",
      "filters_visibility",
      "not_recommendable",
      "permalink",
      "page_title",
      "meta_description",
      "products",
    ],
  },
);

const categoryUpdateInputSchema = s.looseObject(
  "Category fields accepted by the Jumpseller category update endpoint.",
  {
    name: s.nonEmptyString("Name of the category."),
    parent_id: s.integer("Unique identifier of the parent category."),
    default_order: s.stringEnum("Default order of products in the category.", [
      "position-asc",
      "name-asc",
      "name-desc",
      "price-asc",
      "price-desc",
      "date-desc",
    ]),
    description: s.string("Description of the category."),
    filters_visibility: s.boolean("Whether filters are visible in the category page."),
    not_recommendable: s.boolean("Whether the category is recommendable."),
    permalink: s.string("Category unique URL path."),
    page_title: s.string("SEO page title for the category page."),
    meta_description: s.string("SEO meta description for the category page."),
    products: s.array(
      "Products to associate with the category.",
      s.requiredObject("One product association.", {
        id: s.integer("Unique identifier of the product."),
      }),
    ),
  },
);

const orderUpdateSchema = s.looseObject("Order fields accepted by the Jumpseller order update endpoint.", {
  status: s.stringEnum("Status of the order.", ["Abandoned", "Canceled", "Pending Payment", "Paid"]),
  shipment_status: s.stringEnum("Shipment status of the order.", [
    "requested",
    "in_transit",
    "delivered",
    "failed",
    "pickup_available",
  ]),
  tracking_number: s.string("Shipping tracking number used for the order."),
  tracking_company: s.string("Shipping company used for the order."),
  tracking_url: s.url("URL to check delivery information for the order."),
  additional_information: s.string("Additional information for the order."),
  additional_fields: s.array("Additional fields for the order.", s.looseObject("One additional field object.")),
});

const resourceOutputSchema = (resourceName: string) =>
  s.requiredObject(`The ${resourceName} returned by Jumpseller.`, {
    [resourceName]: rawResourceSchema,
    raw: rawPayloadSchema,
  });

const listOutputSchema = (resourceName: string) =>
  s.requiredObject(`The ${resourceName} list returned by Jumpseller.`, {
    [resourceName]: s.array(`The unwrapped ${resourceName} returned by Jumpseller.`, rawResourceSchema),
    raw: rawPayloadSchema,
  });

export const jumpsellerActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_store_info",
    operationType: "read",
    description: "Retrieve store information from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Fields to return for the Jumpseller store.",
      {
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: s.requiredObject("The store information returned by Jumpseller.", {
      store: rawResourceSchema,
      raw: rawPayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "Retrieve products from Jumpseller.",
    requiredScopes: [],
    inputSchema: localizedListInputSchema,
    outputSchema: listOutputSchema("products"),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve a single product from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Product id and projection options.",
      {
        id: idSchema,
        locale: localeSchema,
        fields: fieldsSchema,
      },
      { optional: ["locale", "fields"] },
    ),
    outputSchema: resourceOutputSchema("product"),
  }),
  defineProviderAction(service, {
    name: "search_products",
    operationType: "read",
    description: "Search products in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Product search query and list options.",
      {
        query: s.nonEmptyString("Text to query for products."),
        page: pageSchema,
        limit: limitSchema,
        locale: localeSchema,
        fields: fieldsSchema,
      },
      { optional: ["page", "limit", "locale", "fields"] },
    ),
    outputSchema: listOutputSchema("products"),
  }),
  defineProviderAction(service, {
    name: "create_product",
    operationType: "write",
    description: "Create a product in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Product data and response options.",
      {
        product: productInputSchema,
        locale: localeSchema,
        fields: fieldsSchema,
      },
      { optional: ["locale", "fields"] },
    ),
    outputSchema: resourceOutputSchema("product"),
  }),
  defineProviderAction(service, {
    name: "update_product",
    operationType: "write",
    description: "Update a product in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Product id, product data, and response options.",
      {
        id: idSchema,
        product: productInputSchema,
        locale: localeSchema,
        fields: fieldsSchema,
      },
      { optional: ["locale", "fields"] },
    ),
    outputSchema: resourceOutputSchema("product"),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "Retrieve orders from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Order list filters and pagination options.",
      {
        status: s.stringEnum("Optional status endpoint to use for the order list.", [
          "abandoned",
          "canceled",
          "pending_payment",
          "paid",
        ]),
        page: pageSchema,
        limit: limitSchema,
      },
      { optional: ["status", "page", "limit"] },
    ),
    outputSchema: listOutputSchema("orders"),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Retrieve a single order from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Order id to retrieve.", {
      id: idSchema,
    }),
    outputSchema: resourceOutputSchema("order"),
  }),
  defineProviderAction(service, {
    name: "search_orders",
    operationType: "read",
    description: "Search orders in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Order search query and list options.",
      {
        query: s.nonEmptyString("Text to query for orders."),
        page: pageSchema,
        limit: limitSchema,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: listOutputSchema("orders"),
  }),
  defineProviderAction(service, {
    name: "update_order",
    operationType: "write",
    description: "Update status, tracking, or additional information for a Jumpseller order.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Order id and fields to update.", {
      id: idSchema,
      order: orderUpdateSchema,
    }),
    outputSchema: resourceOutputSchema("order"),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "Retrieve customers from Jumpseller.",
    requiredScopes: [],
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema("customers"),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve a single customer from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Customer id to retrieve.", {
      id: idSchema,
    }),
    outputSchema: resourceOutputSchema("customer"),
  }),
  defineProviderAction(service, {
    name: "search_customers",
    operationType: "read",
    description: "Search customers in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Customer search query and list options.",
      {
        query: s.nonEmptyString("Text to query for customers."),
        order: s.stringEnum("Sort customers by creation date.", ["asc", "desc"]),
        page: pageSchema,
        limit: limitSchema,
      },
      { optional: ["order", "page", "limit"] },
    ),
    outputSchema: listOutputSchema("customers"),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    operationType: "write",
    description: "Create a customer in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Customer data to create.", {
      customer: customerCreateInputSchema,
    }),
    outputSchema: resourceOutputSchema("customer"),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    operationType: "write",
    description: "Update a customer in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Customer id and fields to update.", {
      id: idSchema,
      customer: customerUpdateInputSchema,
    }),
    outputSchema: resourceOutputSchema("customer"),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    operationType: "read",
    description: "Retrieve categories from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Fields to return for Jumpseller categories.",
      {
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: listOutputSchema("categories"),
  }),
  defineProviderAction(service, {
    name: "get_category",
    operationType: "read",
    description: "Retrieve a single category from Jumpseller.",
    requiredScopes: [],
    inputSchema: s.object(
      "Category id and projection options.",
      {
        id: idSchema,
        fields: fieldsSchema,
      },
      { optional: ["fields"] },
    ),
    outputSchema: resourceOutputSchema("category"),
  }),
  defineProviderAction(service, {
    name: "create_category",
    operationType: "write",
    description: "Create a category in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Category data to create.", {
      category: categoryCreateInputSchema,
    }),
    outputSchema: resourceOutputSchema("category"),
  }),
  defineProviderAction(service, {
    name: "update_category",
    operationType: "write",
    description: "Update a category in Jumpseller.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Category id and fields to update.", {
      id: idSchema,
      category: categoryUpdateInputSchema,
    }),
    outputSchema: resourceOutputSchema("category"),
  }),
];
