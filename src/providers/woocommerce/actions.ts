import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "woocommerce";

const pageSchema = s.positiveInteger("The page number to retrieve from WooCommerce.");
const perPageSchema = s.integer("The maximum number of records to return in one page.", { minimum: 1, maximum: 100 });
const sortOrderSchema = s.stringEnum("The result sort direction.", ["asc", "desc"]);
const productStatusSchema = s.stringEnum("The WooCommerce product status.", [
  "any",
  "draft",
  "pending",
  "private",
  "publish",
]);
const orderStatusSchema = s.stringEnum("The WooCommerce order status.", [
  "pending",
  "processing",
  "on-hold",
  "completed",
  "cancelled",
  "refunded",
  "failed",
  "trash",
]);
const stockStatusSchema = s.stringEnum("The WooCommerce stock status.", ["instock", "outofstock", "onbackorder"]);
const nullableInteger = (description: string) => s.nullableInteger(description);
const nullableString = (description: string) => s.nullableString(description);
const termSchema = s.object("A normalized WooCommerce taxonomy term.", {
  id: nullableInteger("The WooCommerce term ID."),
  name: nullableString("The term display name."),
  slug: nullableString("The term URL slug."),
  count: nullableInteger("The number of products assigned to the term, if returned."),
});
const productCategorySchema = s.object("One WooCommerce product category attached to a product.", {
  id: nullableInteger("The WooCommerce category ID."),
  name: nullableString("The category display name."),
  slug: nullableString("The category URL slug."),
});
const productImageSchema = s.object("One WooCommerce product image.", {
  id: nullableInteger("The WooCommerce image attachment ID."),
  src: nullableString("The image URL."),
  name: nullableString("The image display name."),
  alt: nullableString("The image alt text."),
});
const productSchema = s.object("A normalized WooCommerce product.", {
  id: nullableInteger("The WooCommerce product ID."),
  name: nullableString("The product name."),
  slug: nullableString("The product URL slug."),
  permalink: nullableString("The product permalink."),
  type: nullableString("The WooCommerce product type."),
  status: nullableString("The product status."),
  sku: nullableString("The product SKU."),
  price: nullableString("The current product price as returned by WooCommerce."),
  regularPrice: nullableString("The regular product price as returned by WooCommerce."),
  salePrice: nullableString("The sale product price as returned by WooCommerce."),
  stockStatus: nullableString("The product stock status."),
  stockQuantity: nullableInteger("The product stock quantity, if tracked."),
  categories: s.array("The product categories returned by WooCommerce.", productCategorySchema),
  images: s.array("The product images returned by WooCommerce.", productImageSchema),
});
const variationAttributeSchema = s.object("A normalized WooCommerce variation attribute.", {
  id: nullableInteger("The WooCommerce attribute ID."),
  name: nullableString("The attribute display name."),
  option: nullableString("The selected attribute option."),
});
const productVariationSchema = s.object("A normalized WooCommerce product variation.", {
  id: nullableInteger("The WooCommerce variation ID."),
  sku: nullableString("The variation SKU."),
  price: nullableString("The current variation price as returned by WooCommerce."),
  regularPrice: nullableString("The regular variation price as returned by WooCommerce."),
  salePrice: nullableString("The sale variation price as returned by WooCommerce."),
  stockStatus: nullableString("The variation stock status."),
  stockQuantity: nullableInteger("The variation stock quantity, if tracked."),
  attributes: s.array("The variation attributes returned by WooCommerce.", variationAttributeSchema),
  image: s.nullable(productImageSchema),
});
const addressSchema = s.object("A normalized WooCommerce address payload.", {
  firstName: nullableString("The first name on the address."),
  lastName: nullableString("The last name on the address."),
  company: nullableString("The company name on the address."),
  address1: nullableString("The first address line."),
  address2: nullableString("The second address line."),
  city: nullableString("The city name."),
  state: nullableString("The state, region, or province code."),
  postcode: nullableString("The postal code."),
  country: nullableString("The country code."),
  email: nullableString("The email address on the address, if returned."),
  phone: nullableString("The phone number on the address, if returned."),
});
const orderLineItemSchema = s.object("A normalized WooCommerce order line item.", {
  id: nullableInteger("The WooCommerce line item ID."),
  productId: nullableInteger("The related WooCommerce product ID."),
  variationId: nullableInteger("The related WooCommerce variation ID."),
  name: nullableString("The line item name."),
  quantity: s.nullableNumber("The ordered quantity."),
  total: nullableString("The line item total as returned by WooCommerce."),
  sku: nullableString("The line item SKU, if returned."),
});
const orderSchema = s.object("A normalized WooCommerce order.", {
  id: nullableInteger("The WooCommerce order ID."),
  number: nullableString("The WooCommerce order number."),
  status: nullableString("The order status."),
  currency: nullableString("The order currency code."),
  total: nullableString("The order total as returned by WooCommerce."),
  customerId: nullableInteger("The WooCommerce customer ID associated with the order."),
  dateCreated: nullableString("The order creation timestamp in the store timezone."),
  dateModified: nullableString("The order update timestamp in the store timezone."),
  billing: addressSchema,
  shipping: addressSchema,
  lineItems: s.array("The order line items returned by WooCommerce.", orderLineItemSchema),
});
const customerSchema = s.object("A normalized WooCommerce customer.", {
  id: nullableInteger("The WooCommerce customer ID."),
  email: nullableString("The customer email address."),
  firstName: nullableString("The customer first name."),
  lastName: nullableString("The customer last name."),
  username: nullableString("The customer username."),
  role: nullableString("The customer role."),
  dateCreated: nullableString("The customer creation timestamp in the store timezone."),
  dateModified: nullableString("The customer update timestamp in the store timezone."),
  billing: addressSchema,
  shipping: addressSchema,
});
const couponSchema = s.object("A normalized WooCommerce coupon.", {
  id: nullableInteger("The WooCommerce coupon ID."),
  code: nullableString("The coupon code."),
  amount: nullableString("The coupon amount as returned by WooCommerce."),
  discountType: nullableString("The WooCommerce coupon discount type."),
  description: nullableString("The coupon description."),
  dateCreated: nullableString("The coupon creation timestamp in the store timezone."),
  dateModified: nullableString("The coupon update timestamp in the store timezone."),
});
const productAttributeSchema = s.object("A normalized WooCommerce product attribute.", {
  id: nullableInteger("The WooCommerce attribute ID."),
  name: nullableString("The attribute display name."),
  slug: nullableString("The attribute slug."),
  type: nullableString("The attribute type."),
  orderBy: nullableString("The attribute sort mode."),
  hasArchives: s.nullableBoolean("Whether the attribute has archives enabled."),
});
const orderNoteSchema = s.object("A normalized WooCommerce order note.", {
  id: nullableInteger("The WooCommerce order note ID."),
  author: nullableString("The note author name."),
  dateCreated: nullableString("The note creation timestamp in the store timezone."),
  note: nullableString("The note body."),
  customerNote: s.boolean("Whether the note is visible to the customer."),
});
const mediaSchema = s.object("A normalized WordPress media item.", {
  id: nullableInteger("The WordPress media item ID."),
  sourceUrl: nullableString("The public source URL of the media file."),
  mediaType: nullableString("The WordPress media type."),
  mimeType: nullableString("The media MIME type."),
  title: nullableString("The rendered media title."),
  altText: nullableString("The media alt text."),
  metadataUpdated: s.nullableBoolean("Whether the requested media metadata update was applied."),
  metadataError: nullableString("The media metadata update error message when the file upload succeeded."),
});
const termReferenceInputSchema = s.object("A WooCommerce taxonomy term reference used in write payloads.", {
  id: s.positiveInteger("The WooCommerce term ID."),
});
const productImageInputSchema = s.object(
  "A WooCommerce product image reference used in write payloads.",
  {
    id: s.positiveInteger("The existing WordPress media attachment ID."),
    src: s.string("A public image URL WooCommerce can import."),
    name: s.string("The image display name."),
    alt: s.string("The image alt text."),
  },
  { optional: ["id", "src", "name", "alt"] },
);
const productAttributeInputSchema = s.object(
  "A WooCommerce product attribute payload used in product writes.",
  {
    id: s.positiveInteger("The existing WooCommerce attribute ID."),
    name: s.string("The custom attribute name when no attribute ID is used."),
    position: s.integer("The attribute display position."),
    visible: s.boolean("Whether the attribute is visible on the product page."),
    variation: s.boolean("Whether the attribute is used for variations."),
    options: s.array("The attribute option labels.", s.string("One attribute option.")),
  },
  { optional: ["id", "name", "position", "visible", "variation", "options"] },
);
const variationAttributeInputSchema = s.object(
  "A WooCommerce variation attribute payload.",
  {
    id: s.positiveInteger("The existing WooCommerce attribute ID."),
    name: s.string("The custom attribute name when no attribute ID is used."),
    option: s.string("The selected attribute option."),
  },
  { optional: ["id", "name"] },
);
const addressInputSchema = s.object(
  "A WooCommerce address payload used in order writes.",
  {
    firstName: s.string("The first name on the address."),
    lastName: s.string("The last name on the address."),
    company: s.string("The company name on the address."),
    address1: s.string("The first address line."),
    address2: s.string("The second address line."),
    city: s.string("The city name."),
    state: s.string("The state, region, or province code."),
    postcode: s.string("The postal code."),
    country: s.string("The country code."),
    email: s.string("The email address on the address."),
    phone: s.string("The phone number on the address."),
  },
  {
    optional: [
      "firstName",
      "lastName",
      "company",
      "address1",
      "address2",
      "city",
      "state",
      "postcode",
      "country",
      "email",
      "phone",
    ],
  },
);
const orderLineItemInputSchema = s.object(
  "A WooCommerce order line item payload.",
  {
    productId: s.positiveInteger("The WooCommerce product ID."),
    variationId: s.positiveInteger("The WooCommerce variation ID."),
    quantity: s.number("The item quantity."),
    subtotal: s.string("The line subtotal as a decimal string."),
    total: s.string("The line total as a decimal string."),
  },
  { optional: ["variationId", "subtotal", "total"] },
);
const couponLineInputSchema = s.object("A WooCommerce coupon line payload.", {
  code: s.string("The coupon code to apply to the order."),
});
const shippingLineInputSchema = s.object(
  "A WooCommerce shipping line payload.",
  {
    id: s.positiveInteger("The WooCommerce shipping line ID."),
    methodId: s.string("The shipping method ID."),
    methodTitle: s.string("The shipping method display title."),
    total: s.string("The shipping line total as a decimal string."),
  },
  { optional: ["id", "methodId", "methodTitle", "total"] },
);
const productWriteFields: Record<string, JsonSchema> = {
  name: s.string("The product name."),
  type: s.string("The WooCommerce product type, such as simple or variable."),
  status: productStatusSchema,
  sku: s.string("The product SKU."),
  regularPrice: s.string("The regular product price as a decimal string."),
  salePrice: s.string("The sale product price as a decimal string."),
  description: s.string("The full product description."),
  shortDescription: s.string("The short product description."),
  manageStock: s.boolean("Whether WooCommerce should manage stock for this product."),
  stockQuantity: s.integer("The product stock quantity."),
  stockStatus: stockStatusSchema,
  categories: s.array("The product category references.", termReferenceInputSchema),
  tags: s.array("The product tag references.", termReferenceInputSchema),
  images: s.array("The product image references.", productImageInputSchema),
  attributes: s.array("The product attributes.", productAttributeInputSchema),
};
const variationWriteFields: Record<string, JsonSchema> = {
  sku: s.string("The variation SKU."),
  regularPrice: s.string("The regular variation price as a decimal string."),
  salePrice: s.string("The sale variation price as a decimal string."),
  manageStock: s.boolean("Whether WooCommerce should manage stock for this variation."),
  stockQuantity: s.integer("The variation stock quantity."),
  stockStatus: stockStatusSchema,
  attributes: s.array("The variation attributes.", variationAttributeInputSchema),
  image: productImageInputSchema,
};
const paginationOutput = {
  total: nullableInteger("The total number of matching records reported by WooCommerce."),
  totalPages: nullableInteger("The total number of result pages reported by WooCommerce."),
};

export const woocommerceActions: ProviderActionDefinition[] = [
  action(
    "list_products",
    "read",
    "List WooCommerce products with common catalog filters and pagination metadata.",
    listInput({
      search: s.string("Limit results to products matching this search term."),
      status: productStatusSchema,
      sku: s.string("Limit results to products with this SKU."),
      category: s.string("Limit results to products assigned to this category ID."),
      tag: s.string("Limit results to products assigned to this tag ID."),
      featured: s.boolean("Limit results to featured products when true."),
      onSale: s.boolean("Limit results to products currently on sale when true."),
    }),
    listOutput("products", productSchema),
  ),
  action("get_product", "read", "Fetch one WooCommerce product by product ID.", idInput("productId"), productSchema),
  action(
    "create_product",
    "write",
    "Create a WooCommerce product with catalog, price, stock, image, and attribute fields.",
    s.object("The input payload for creating a WooCommerce product.", productWriteFields, {
      optional: Object.keys(productWriteFields).filter((key) => key !== "name"),
    }),
    productSchema,
  ),
  action(
    "update_product",
    "write",
    "Update a WooCommerce product by product ID.",
    s.object(
      "The input payload for updating a WooCommerce product.",
      { productId: s.positiveInteger("The WooCommerce product ID to update."), ...productWriteFields },
      { optional: Object.keys(productWriteFields) },
    ),
    productSchema,
  ),
  action(
    "list_product_categories",
    "read",
    "List WooCommerce product categories with filters and pagination metadata.",
    listInput({ search: s.string("Limit results to categories matching this search term.") }),
    listOutput("categories", termSchema),
  ),
  action(
    "list_product_tags",
    "read",
    "List WooCommerce product tags with filters and pagination metadata.",
    listInput({ search: s.string("Limit results to tags matching this search term.") }),
    listOutput("tags", termSchema),
  ),
  action(
    "list_product_attributes",
    "read",
    "List WooCommerce product attributes.",
    s.actionInput({}, [], "The input payload for listing WooCommerce product attributes."),
    s.actionOutput(
      { attributes: s.array("The attributes returned by WooCommerce.", productAttributeSchema) },
      "The output payload for listing WooCommerce product attributes.",
    ),
  ),
  action(
    "list_product_attribute_terms",
    "read",
    "List terms for one WooCommerce product attribute.",
    s.actionInput(
      {
        attributeId: s.positiveInteger("The WooCommerce product attribute ID."),
        page: pageSchema,
        perPage: perPageSchema,
        search: s.string("Limit results to attribute terms matching this search term."),
      },
      ["attributeId"],
      "The input payload for listing WooCommerce product attribute terms.",
    ),
    s.actionOutput(
      { terms: s.array("The attribute terms returned by WooCommerce.", termSchema), ...paginationOutput },
      "The output payload for listing WooCommerce attribute terms.",
    ),
  ),
  action(
    "list_product_variations",
    "read",
    "List variations for one WooCommerce variable product.",
    s.actionInput(
      {
        productId: s.positiveInteger("The WooCommerce product ID."),
        page: pageSchema,
        perPage: perPageSchema,
        sku: s.string("Limit results to variations with this SKU."),
      },
      ["productId"],
      "The input payload for listing WooCommerce product variations.",
    ),
    s.actionOutput(
      { variations: s.array("The variations returned by WooCommerce.", productVariationSchema), ...paginationOutput },
      "The output payload for listing WooCommerce product variations.",
    ),
  ),
  action(
    "get_product_variation",
    "read",
    "Fetch one WooCommerce product variation by product and variation ID.",
    s.actionInput(
      {
        productId: s.positiveInteger("The WooCommerce product ID."),
        variationId: s.positiveInteger("The WooCommerce variation ID."),
      },
      ["productId", "variationId"],
      "The input payload for fetching one WooCommerce product variation.",
    ),
    productVariationSchema,
  ),
  action(
    "create_product_variation",
    "write",
    "Create a variation for one WooCommerce variable product.",
    s.object(
      "The input payload for creating a WooCommerce product variation.",
      { productId: s.positiveInteger("The WooCommerce product ID."), ...variationWriteFields },
      { optional: Object.keys(variationWriteFields) },
    ),
    productVariationSchema,
  ),
  action(
    "update_product_variation",
    "write",
    "Update one WooCommerce product variation.",
    s.object(
      "The input payload for updating a WooCommerce product variation.",
      {
        productId: s.positiveInteger("The WooCommerce product ID."),
        variationId: s.positiveInteger("The WooCommerce variation ID."),
        ...variationWriteFields,
      },
      { optional: Object.keys(variationWriteFields) },
    ),
    productVariationSchema,
  ),
  action(
    "upload_media",
    "write",
    "Upload one media file to the WordPress media library used by WooCommerce.",
    s.actionInput(
      {
        file: s.transitFile("A file previously uploaded to the local transit file API."),
        fileUrl: s.url("A public URL to download and upload to WordPress media."),
        contentBase64: s.string("Base64-encoded file content to upload."),
        fileName: s.string("The file name sent to WordPress media."),
        mimeType: s.string("The MIME type sent to WordPress media."),
        title: s.string("The media title."),
        altText: s.string("The media alt text."),
      },
      [],
      "The input payload for uploading one WordPress media item.",
    ),
    mediaSchema,
  ),
  action(
    "list_orders",
    "read",
    "List WooCommerce orders with common status, customer, and date filters.",
    listInput({
      status: orderStatusSchema,
      customer: s.positiveInteger("Limit results to orders for this WooCommerce customer ID."),
      product: s.positiveInteger("Limit results to orders containing this product ID."),
      search: s.string("Limit results to orders matching this search term."),
      after: s.string("Limit results to orders created after this ISO 8601 timestamp."),
      before: s.string("Limit results to orders created before this ISO 8601 timestamp."),
    }),
    listOutput("orders", orderSchema),
  ),
  action("get_order", "read", "Fetch one WooCommerce order by order ID.", idInput("orderId"), orderSchema),
  action(
    "create_order",
    "write",
    "Create a WooCommerce order with customer, address, line item, and coupon fields.",
    s.actionInput(
      {
        status: orderStatusSchema,
        customerId: s.positiveInteger("The WooCommerce customer ID for the order."),
        currency: s.string("The order currency code."),
        billing: addressInputSchema,
        shipping: addressInputSchema,
        lineItems: s.array("The order line items.", orderLineItemInputSchema),
        couponLines: s.array("The order coupon lines.", couponLineInputSchema),
        shippingLines: s.array("The order shipping lines.", shippingLineInputSchema),
        customerNote: s.string("A customer-facing note for the order."),
        paymentMethod: s.string("The payment method identifier."),
        paymentMethodTitle: s.string("The payment method display title."),
        setPaid: s.boolean("Whether WooCommerce should mark the order as paid."),
      },
      ["lineItems"],
      "The input payload for creating a WooCommerce order.",
    ),
    orderSchema,
  ),
  action(
    "update_order",
    "write",
    "Update a WooCommerce order by order ID.",
    s.actionInput(
      {
        orderId: s.positiveInteger("The WooCommerce order ID to update."),
        status: orderStatusSchema,
        customerId: s.positiveInteger("The WooCommerce customer ID for the order."),
        billing: addressInputSchema,
        shipping: addressInputSchema,
        shippingLines: s.array("The order shipping lines.", shippingLineInputSchema),
        customerNote: s.string("A customer-facing note for the order."),
        paymentMethod: s.string("The payment method identifier."),
        paymentMethodTitle: s.string("The payment method display title."),
        setPaid: s.boolean("Whether WooCommerce should mark the order as paid."),
      },
      ["orderId"],
      "The input payload for updating a WooCommerce order.",
    ),
    orderSchema,
  ),
  action(
    "update_order_status",
    "destructive",
    "Update the status of one WooCommerce order.",
    s.actionInput(
      { orderId: s.positiveInteger("The WooCommerce order ID to update."), status: orderStatusSchema },
      ["orderId", "status"],
      "The input payload for updating a WooCommerce order status.",
    ),
    orderSchema,
  ),
  action(
    "list_order_notes",
    "read",
    "List notes for one WooCommerce order.",
    idInput("orderId"),
    s.actionOutput(
      { notes: s.array("The order notes returned by WooCommerce.", orderNoteSchema) },
      "The output payload for listing WooCommerce order notes.",
    ),
  ),
  action(
    "add_order_note",
    "write",
    "Add an administrator or customer-visible note to one WooCommerce order.",
    s.actionInput(
      {
        orderId: s.positiveInteger("The WooCommerce order ID."),
        note: s.string("The note body to add to the order."),
        customerNote: s.boolean("Whether the note should be visible to the customer."),
      },
      ["orderId", "note"],
      "The input payload for adding a WooCommerce order note.",
    ),
    orderNoteSchema,
  ),
  action(
    "list_customers",
    "read",
    "List WooCommerce customers with common filters and pagination metadata.",
    listInput({
      search: s.string("Limit results to customers matching this search term."),
      email: s.string("Limit results to customers with this email address."),
      role: s.string("Limit results to customers with this WordPress role."),
    }),
    listOutput("customers", customerSchema),
  ),
  action(
    "get_customer",
    "read",
    "Fetch one WooCommerce customer by customer ID.",
    idInput("customerId"),
    customerSchema,
  ),
  action(
    "list_coupons",
    "read",
    "List WooCommerce coupons with common code search and pagination metadata.",
    listInput({
      search: s.string("Limit results to coupons matching this search term."),
      code: s.string("Limit results to coupons with this exact code."),
    }),
    listOutput("coupons", couponSchema),
  ),
  action("get_coupon", "read", "Fetch one WooCommerce coupon by coupon ID.", idInput("couponId"), couponSchema),
  action("create_coupon", "write", "Create a WooCommerce coupon.", couponInput(false), couponSchema),
  action("update_coupon", "write", "Update a WooCommerce coupon by coupon ID.", couponInput(true), couponSchema),
];

function action(
  name: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ProviderActionDefinition {
  return defineProviderAction(service, { name, operationType, description, inputSchema, outputSchema });
}

function idInput(fieldName: string): JsonSchema {
  return s.actionInput(
    { [fieldName]: s.positiveInteger(`The WooCommerce ${fieldName} to fetch.`) },
    [fieldName],
    `The input payload for ${fieldName}.`,
  );
}

function listInput(extra: Record<string, JsonSchema>): JsonSchema {
  return s.actionInput(
    {
      page: pageSchema,
      perPage: perPageSchema,
      ...extra,
      order: sortOrderSchema,
      orderBy: s.string("Sort by an official WooCommerce orderby value."),
    },
    [],
    "The input payload for listing WooCommerce records.",
  );
}

function listOutput(key: string, itemSchema: JsonSchema): JsonSchema {
  return s.actionOutput(
    { [key]: s.array(`The ${key} returned by WooCommerce.`, itemSchema), ...paginationOutput },
    "The output payload for listing WooCommerce records.",
  );
}

function couponInput(includeId: boolean): JsonSchema {
  return s.actionInput(
    {
      ...(includeId ? { couponId: s.positiveInteger("The WooCommerce coupon ID to update.") } : {}),
      code: s.string("The coupon code."),
      discountType: s.string("The WooCommerce coupon discount type."),
      amount: s.string("The coupon amount as a decimal string."),
      description: s.string("The coupon description."),
      individualUse: s.boolean("Whether the coupon can only be used individually."),
      excludeSaleItems: s.boolean("Whether sale items should be excluded from the coupon."),
      freeShipping: s.boolean("Whether the coupon grants free shipping."),
      dateExpires: s.string("The coupon expiration date in the store timezone."),
      minimumAmount: s.string("The minimum spend amount required for the coupon."),
      maximumAmount: s.string("The maximum spend amount allowed for the coupon."),
    },
    includeId ? ["couponId"] : ["code", "discountType", "amount"],
    includeId
      ? "The input payload for updating a WooCommerce coupon."
      : "The input payload for creating a WooCommerce coupon.",
  );
}
