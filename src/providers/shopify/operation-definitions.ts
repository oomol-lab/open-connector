import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { operationQueries } from "./operation-queries.ts";
interface ShopifyOperation {
  name: string;
  field: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  query: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}
const id = s.nonEmptyString("A Shopify GraphQL global ID.");
const text = s.string("The text value to send to Shopify.");
const ids = s.array("Shopify GraphQL global IDs.", id);
const flag = s.boolean("Whether to enable this option.");
const strings = s.array("Text values to send to Shopify.", text);
const idInput = s.requiredObject("The resource to operate on.", { id });
const money = s.string("A decimal monetary amount in the applicable currency.");
const resource = s.looseObject("The Shopify resource returned by the operation.");
const errors = s.array(
  "Shopify business validation errors.",
  s.object(
    "A Shopify business validation error.",
    {
      field: s.nullable(strings),
      message: text,
      code: text,
    },
    { required: ["message"], additionalProperties: true },
  ),
);
const pageInfo = s.object(
  "Cursor pagination metadata.",
  {
    hasNextPage: flag,
    hasPreviousPage: flag,
    startCursor: s.nullable(text),
    endCursor: s.nullable(text),
  },
  { required: [], additionalProperties: true },
);
const job = s.object("A Shopify background job.", { id, done: flag }, { additionalProperties: true, optional: [] });
const productOperation = s.object(
  "An asynchronous product operation.",
  {
    id,
    status: text,
    userErrors: errors,
  },
  { required: ["id", "status"], additionalProperties: true },
);
// Document common fields while allowing other official inputs; Shopify validates business rules.
function inputObject(type: string, properties: Record<string, JsonSchema>, required: string[] = []) {
  return s.object(
    `Shopify ${type}. Additional official fields are accepted; see https://shopify.dev/docs/api/admin-graphql/2026-10/input-objects/${type}.`,
    Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, required.includes(key) ? value : s.nullable(value)]),
    ),
    { required, additionalProperties: true },
  );
}
function listInput(type: string, properties: Record<string, JsonSchema>, required: string[] = []) {
  return s.array(`Entries accepted by Shopify ${type}.`, inputObject(type, properties, required), {
    maxItems: 250,
  });
}
const address = inputObject("MailingAddressInput", {
  firstName: text,
  lastName: text,
  company: text,
  address1: text,
  address2: text,
  city: text,
  country: text,
  province: text,
  zip: text,
  phone: text,
});
const metafields = listInput("MetafieldInput", {
  id,
  namespace: text,
  key: text,
  type: text,
  value: text,
});
const customer = inputObject("CustomerInput", {
  id,
  firstName: text,
  lastName: text,
  email: text,
  phone: text,
  note: text,
  tags: strings,
  taxExempt: flag,
  addresses: s.array("Customer mailing addresses.", address),
  metafields,
});
const email = inputObject("EmailInput", {
  to: text,
  from: text,
  bcc: strings,
  subject: text,
  customMessage: text,
});
const media = listInput("CreateMediaInput", { originalSource: text, mediaContentType: text, alt: text }, [
  "originalSource",
  "mediaContentType",
]);
const variants = listInput("ProductVariantsBulkInput", {
  id,
  price: money,
  compareAtPrice: s.nullable(money),
  barcode: text,
  taxable: flag,
  inventoryPolicy: s.stringEnum("How to handle sales when inventory is exhausted.", ["DENY", "CONTINUE"]),
  inventoryItem: inputObject("InventoryItemInput", { sku: text, tracked: flag, cost: money }),
  optionValues: listInput("VariantOptionValueInput", {
    id,
    name: text,
    optionId: id,
    optionName: text,
  }),
  inventoryQuantities: listInput(
    "InventoryLevelInput",
    { locationId: id, availableQuantity: s.integer("Available inventory quantity.") },
    ["locationId", "availableQuantity"],
  ),
  mediaId: id,
  mediaSrc: strings,
  metafields,
});
const legacyCollection = inputObject("CollectionInput", {
  id,
  title: text,
  handle: text,
  descriptionHtml: text,
  products: ids,
  ruleSet: inputObject(
    "CollectionRuleSetInput",
    {
      appliedDisjunctively: flag,
      rules: listInput("CollectionRuleInput", { column: text, relation: text, condition: text }, [
        "column",
        "relation",
        "condition",
      ]),
    },
    ["appliedDisjunctively", "rules"],
  ),
  image: inputObject("ImageInput", { id, src: text, altText: text }),
  metafields,
});
const collection = inputObject(
  "CollectionCreateInput",
  {
    title: text,
    handle: text,
    descriptionHtml: text,
    templateSuffix: text,
    sortOrder: text,
    image: inputObject("ImageInput", { id, src: text, altText: text }),
    metafields,
    sources: listInput("CollectionCreateSourceTargetInput", {}),
  },
  ["title"],
);
const collectionUpdate = inputObject("CollectionUpdateInput", {
  id,
  title: text,
  handle: text,
  descriptionHtml: text,
  templateSuffix: text,
  sortOrder: text,
  image: inputObject("ImageInput", { id, src: text, altText: text }),
  metafields,
  sourcesToDelete: ids,
  sourcesToCreate: listInput("CollectionCreateSourceTargetInput", {}),
  sourcesToUpdate: listInput("CollectionUpdateSourceTargetInput", {}),
});
const draft = inputObject("DraftOrderInput", {
  email: text,
  phone: text,
  note: text,
  tags: strings,
  customerId: id,
  shippingAddress: address,
  billingAddress: address,
  lineItems: listInput(
    "DraftOrderLineItemInput",
    {
      variantId: id,
      title: text,
      quantity: s.integer("The line item quantity.", { minimum: 1 }),
      originalUnitPrice: money,
      customAttributes: listInput("AttributeInput", { key: text, value: text }, ["key", "value"]),
    },
    ["quantity"],
  ),
  sessionToken: s.string("A Shopify checkout session token. This value is sensitive."),
  taxExempt: flag,
  useCustomerDefaultAddress: flag,
  metafields,
});
const metaobjectFields = listInput("MetaobjectFieldInput", { key: text, value: text }, ["key", "value"]);
const metaobject = inputObject("MetaobjectCreateInput", {
  type: text,
  handle: text,
  fields: metaobjectFields,
});
const publication = listInput("PublicationInput", { publicationId: id, publishDate: text }, ["publicationId"]);
const pagination = {
  first: s.integer("The number of records after the cursor; defaults to 50 unless last is supplied.", {
    minimum: 1,
    maximum: 250,
  }),
  after: s.string("Return records after this cursor."),
  last: s.integer("The number of records before the cursor.", { minimum: 1, maximum: 250 }),
  before: s.string("Return records before this cursor."),
  reverse: s.boolean("Reverse the result order."),
};
const search = {
  ...pagination,
  query: s.string("A Shopify search expression."),
  sortKey: s.string("The Shopify sort key for this resource."),
};
const blog = inputObject("BlogCreateInput", {
  title: text,
  handle: text,
  commentPolicy: text,
  templateSuffix: text,
  metafields,
});
const page = inputObject("PageCreateInput", {
  title: text,
  handle: text,
  body: text,
  isPublished: flag,
  publishDate: text,
  templateSuffix: text,
  metafields,
});
const article = inputObject("ArticleCreateInput", {
  blogId: id,
  title: text,
  handle: text,
  body: text,
  summary: text,
  tags: strings,
  author: inputObject("AuthorInput", { name: text }, ["name"]),
  isPublished: flag,
  publishDate: text,
  metafields,
});
function operation(
  name: string,
  field: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  properties: Record<string, JsonSchema>,
  required: string[],
  output: Record<string, JsonSchema>,
): ShopifyOperation {
  return {
    name,
    field,
    operationType,
    description,
    query: operationQueries[name]!,
    inputSchema: s.object("Parameters for this Shopify operation.", properties, { required }),
    outputSchema: s.object("The Shopify operation result.", output, {
      required: [],
      additionalProperties: true,
    }),
  };
}
function connection(description: string) {
  return s.object(
    description,
    { nodes: s.array("Matching Shopify resources.", resource), pageInfo },
    { required: [], additionalProperties: true },
  );
}
export const operations: ShopifyOperation[] = [
  operation(
    "delete_product",
    "productDelete",
    "destructive",
    "Delete a product. Requires write_products and product deletion permission.",
    { input: idInput, synchronous: flag },
    ["input"],
    {
      deletedProductId: s.nullable(id),
      productDeleteOperation: s.nullable(productOperation),
      userErrors: errors,
    },
  ),
  operation(
    "duplicate_product",
    "productDuplicate",
    "write",
    "Duplicate a product, optionally including images and translations. Requires write_products.",
    {
      productId: id,
      newTitle: text,
      newStatus: s.stringEnum("The new product status.", ["ACTIVE", "ARCHIVED", "DRAFT", "UNLISTED"]),
      includeImages: flag,
      includeTranslations: flag,
      synchronous: flag,
    },
    ["productId", "newTitle"],
    {
      newProduct: resource,
      productDuplicateOperation: s.nullable(productOperation),
      imageJob: s.nullable(job),
      userErrors: errors,
    },
  ),
  operation(
    "create_product_variants",
    "productVariantsBulkCreate",
    "write",
    "Create product variants with option values, inventory, prices, and media. Requires write_products.",
    {
      productId: id,
      variants,
      media,
      strategy: s.stringEnum("How to handle the standalone variant.", [
        "DEFAULT",
        "PRESERVE_STANDALONE_VARIANT",
        "REMOVE_STANDALONE_VARIANT",
      ]),
    },
    ["productId", "variants"],
    {
      productVariants: s.array("Created product variants.", resource),
      product: resource,
      userErrors: errors,
    },
  ),
  operation(
    "update_product_variants",
    "productVariantsBulkUpdate",
    "write",
    "Update product variants. When allowPartialUpdates is true, return successful variants together with errors. Requires write_products.",
    { productId: id, variants, media, allowPartialUpdates: flag },
    ["productId", "variants"],
    {
      productVariants: s.array("Updated product variants.", resource),
      product: resource,
      userErrors: errors,
    },
  ),
  operation(
    "delete_product_variants",
    "productVariantsBulkDelete",
    "destructive",
    "Delete product variants. Requires write_products.",
    { productId: id, variantsIds: ids },
    ["productId", "variantsIds"],
    { product: resource, userErrors: errors },
  ),
  operation(
    "create_collection",
    "collectionCreate",
    "write",
    "Create a manual or automated collection. Supply collection or the legacy input argument. Requires write_products; unavailable on Starter and Retail plans.",
    { collection, input: legacyCollection },
    [],
    { collection: resource, userErrors: errors },
  ),
  operation(
    "update_collection",
    "collectionUpdate",
    "write",
    "Update a collection and its rules. Supply collection or the legacy input argument. Requires write_products.",
    {
      collection: collectionUpdate,
      input: legacyCollection,
    },
    [],
    { collection: resource, job: s.nullable(job), userErrors: errors },
  ),
  operation(
    "delete_collection",
    "collectionDelete",
    "destructive",
    "Delete a collection without deleting its products. Requires write_products.",
    { input: idInput },
    ["input"],
    { deletedCollectionId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "add_collection_products",
    "collectionAddProducts",
    "write",
    "Add products to a manual collection. Requires write_products.",
    { id, productIds: ids },
    ["id", "productIds"],
    { collection: resource, userErrors: errors },
  ),
  operation(
    "remove_collection_products",
    "collectionRemoveProducts",
    "write",
    "Remove products from a manual collection and return a background job. Requires write_products.",
    { id, productIds: ids },
    ["id", "productIds"],
    { job, userErrors: errors },
  ),
  operation(
    "close_order",
    "orderClose",
    "destructive",
    "Archive an order. Requires write_orders.",
    { input: idInput },
    ["input"],
    { order: resource, userErrors: errors },
  ),
  operation(
    "open_order",
    "orderOpen",
    "write",
    "Reopen an archived order. Requires write_orders.",
    { input: idInput },
    ["input"],
    { order: resource, userErrors: errors },
  ),
  operation(
    "mark_order_paid",
    "orderMarkAsPaid",
    "write",
    "Record payment for an order; this does not charge a payment method. Requires write_orders.",
    { input: idInput },
    ["input"],
    { order: resource, userErrors: errors },
  ),
  operation(
    "send_order_invoice",
    "orderInvoiceSend",
    "write",
    "Send an invoice email for an order. Requires write_orders.",
    { id, email },
    ["id"],
    { order: resource, userErrors: errors },
  ),
  operation(
    "cancel_order",
    "orderCancel",
    "destructive",
    "Cancel an order, optionally refunding payments, restocking, and notifying the customer. Requires write_orders and order cancellation permission.",
    {
      orderId: id,
      restock: flag,
      reason: s.stringEnum("The cancellation reason.", [
        "CUSTOMER",
        "DECLINED",
        "FRAUD",
        "INVENTORY",
        "OTHER",
        "STAFF",
      ]),
      refund: flag,
      refundMethod: inputObject("OrderCancelRefundMethodInput", {}),
      notifyCustomer: flag,
      staffNote: s.nullable(text),
    },
    ["orderId", "restock", "reason"],
    { job, orderCancelUserErrors: errors, userErrors: errors },
  ),
  operation(
    "create_refund",
    "refundCreate",
    "write",
    "Refund order line items, shipping, and transactions. Reuse the same idempotencyKey when retrying the same refund. Requires write_orders.",
    {
      idempotencyKey: s.nonEmptyString("A stable, unique key for this refund, reused on retries."),
      input: inputObject(
        "RefundInput",
        {
          orderId: id,
          note: text,
          notify: flag,
          currency: text,
          refundLineItems: listInput(
            "RefundLineItemInput",
            {
              lineItemId: id,
              quantity: s.integer("The quantity to refund."),
              restockType: text,
              locationId: id,
            },
            ["lineItemId", "quantity"],
          ),
          transactions: listInput("OrderTransactionInput", {
            orderId: id,
            parentId: id,
            amount: money,
            kind: text,
            gateway: text,
          }),
          shipping: inputObject("ShippingRefundInput", { amount: money, fullRefund: flag }),
        },
        ["orderId"],
      ),
    },
    ["input", "idempotencyKey"],
    { refund: resource, userErrors: errors },
  ),
  operation(
    "create_customer",
    "customerCreate",
    "write",
    "Create a customer with contact details and addresses. Requires write_customers and applicable protected customer data access.",
    { input: customer },
    ["input"],
    { customer: resource, userErrors: errors },
  ),
  operation(
    "update_customer",
    "customerUpdate",
    "write",
    "Update a customer identified by input.id. Requires write_customers.",
    {
      input: inputObject("CustomerInput", customer.properties as Record<string, JsonSchema>, ["id"]),
    },
    ["input"],
    { customer: resource, userErrors: errors },
  ),
  operation(
    "delete_customer",
    "customerDelete",
    "destructive",
    "Delete a customer when Shopify's business rules permit it. Requires write_customers.",
    { input: idInput },
    ["input"],
    { deletedCustomerId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "create_customer_address",
    "customerAddressCreate",
    "write",
    "Add a customer address. Requires write_customers.",
    { customerId: id, address, setAsDefault: flag },
    ["customerId", "address"],
    { address: resource, userErrors: errors },
  ),
  operation(
    "update_customer_address",
    "customerAddressUpdate",
    "write",
    "Update a customer address. Requires write_customers.",
    { customerId: id, addressId: id, address, setAsDefault: flag },
    ["customerId", "addressId", "address"],
    { address: resource, userErrors: errors },
  ),
  operation(
    "delete_customer_address",
    "customerAddressDelete",
    "destructive",
    "Delete a customer address. Requires write_customers.",
    { customerId: id, addressId: id },
    ["customerId", "addressId"],
    { deletedAddressId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "set_default_customer_address",
    "customerUpdateDefaultAddress",
    "write",
    "Select the customer's default address. Requires write_customers.",
    { customerId: id, addressId: id },
    ["customerId", "addressId"],
    { customer: resource, userErrors: errors },
  ),
  operation(
    "add_tags",
    "tagsAdd",
    "write",
    "Add tags to a supported resource. Requires the write scope for that resource.",
    { id, tags: strings },
    ["id", "tags"],
    { node: resource, userErrors: errors },
  ),
  operation(
    "remove_tags",
    "tagsRemove",
    "write",
    "Remove tags from a supported resource. Requires the write scope for that resource.",
    { id, tags: strings },
    ["id", "tags"],
    { node: resource, userErrors: errors },
  ),
  operation(
    "set_metafields",
    "metafieldsSet",
    "write",
    "Set metafields atomically, optionally using compareDigest for optimistic concurrency. Requires write access to the owning resources.",
    {
      metafields: s.array(
        "Metafields to set atomically.",
        inputObject(
          "MetafieldsSetInput",
          {
            ownerId: id,
            namespace: text,
            key: text,
            type: text,
            value: text,
            compareDigest: s.nullable(text),
          },
          ["ownerId", "key", "value"],
        ),
        { maxItems: 25 },
      ),
    },
    ["metafields"],
    { metafields: s.array("Updated metafields.", resource), userErrors: errors },
  ),
  operation(
    "delete_metafields",
    "metafieldsDelete",
    "destructive",
    "Delete metafields identified by owner, namespace, and key. Requires write access to their owners.",
    {
      metafields: listInput("MetafieldIdentifierInput", { ownerId: id, namespace: text, key: text }, [
        "ownerId",
        "namespace",
        "key",
      ]),
    },
    ["metafields"],
    { deletedMetafields: s.array("Deleted metafield identifiers.", resource), userErrors: errors },
  ),
  operation(
    "create_metaobject",
    "metaobjectCreate",
    "write",
    "Create a metaobject for an existing definition. Requires write_metaobjects.",
    {
      metaobject: inputObject("MetaobjectCreateInput", metaobject.properties as Record<string, JsonSchema>, ["type"]),
    },
    ["metaobject"],
    { metaobject: resource, userErrors: errors },
  ),
  operation(
    "update_metaobject",
    "metaobjectUpdate",
    "write",
    "Update a metaobject. Requires write_metaobjects.",
    {
      id,
      metaobject: inputObject("MetaobjectUpdateInput", { handle: text, fields: metaobjectFields }),
    },
    ["id", "metaobject"],
    { metaobject: resource, userErrors: errors },
  ),
  operation(
    "delete_metaobject",
    "metaobjectDelete",
    "destructive",
    "Delete a metaobject. Requires write_metaobjects.",
    { id },
    ["id"],
    { deletedId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "cancel_bulk_operation",
    "bulkOperationCancel",
    "destructive",
    "Request cancellation of a bulk operation; poll its status until cancellation completes.",
    { id },
    ["id"],
    { bulkOperation: resource, userErrors: errors },
  ),
  operation(
    "create_draft_order",
    "draftOrderCreate",
    "write",
    "Create a draft order with line items, customer details, discounts, and shipping. Requires write_draft_orders.",
    { input: draft },
    ["input"],
    { draftOrder: resource, userErrors: errors },
  ),
  operation(
    "update_draft_order",
    "draftOrderUpdate",
    "write",
    "Update a draft order. Requires write_draft_orders.",
    { id, input: draft },
    ["id", "input"],
    { draftOrder: resource, userErrors: errors },
  ),
  operation(
    "delete_draft_order",
    "draftOrderDelete",
    "destructive",
    "Delete a draft order. Requires write_draft_orders.",
    { input: idInput },
    ["input"],
    { deletedId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "complete_draft_order",
    "draftOrderComplete",
    "write",
    "Complete a draft order, creating an order and recording the selected payment state. Requires write_draft_orders.",
    { id, paymentPending: flag, paymentGatewayId: id, sourceName: text },
    ["id"],
    { draftOrder: resource, userErrors: errors },
  ),
  operation(
    "send_draft_order_invoice",
    "draftOrderInvoiceSend",
    "write",
    "Send the draft order invoice email. Requires write_draft_orders.",
    { id, email },
    ["id"],
    { draftOrder: resource, userErrors: errors },
  ),
  operation(
    "create_blog",
    "blogCreate",
    "write",
    "Create a blog. Requires write_content or write_online_store_pages.",
    {
      blog: inputObject("BlogCreateInput", blog.properties as Record<string, JsonSchema>, ["title"]),
    },
    ["blog"],
    { blog: resource, userErrors: errors },
  ),
  operation(
    "update_blog",
    "blogUpdate",
    "write",
    "Update a blog. Requires write_content or write_online_store_pages.",
    { id, blog },
    ["id", "blog"],
    { blog: resource, userErrors: errors },
  ),
  operation(
    "delete_blog",
    "blogDelete",
    "destructive",
    "Delete a blog and its articles. Requires write_content or write_online_store_pages.",
    { id },
    ["id"],
    { deletedBlogId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "create_page",
    "pageCreate",
    "write",
    "Create an online store page. Requires write_content or write_online_store_pages.",
    {
      page: inputObject("PageCreateInput", page.properties as Record<string, JsonSchema>, ["title"]),
    },
    ["page"],
    { page: resource, userErrors: errors },
  ),
  operation(
    "update_page",
    "pageUpdate",
    "write",
    "Update an online store page. Requires write_content or write_online_store_pages.",
    { id, page },
    ["id", "page"],
    { page: resource, userErrors: errors },
  ),
  operation(
    "delete_page",
    "pageDelete",
    "destructive",
    "Delete an online store page. Requires write_content or write_online_store_pages.",
    { id },
    ["id"],
    { deletedPageId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "create_article",
    "articleCreate",
    "write",
    "Create a blog article. Requires write_content or write_online_store_pages.",
    {
      article: inputObject("ArticleCreateInput", article.properties as Record<string, JsonSchema>, ["title", "author"]),
      blog: inputObject("ArticleBlogInput", { title: text }),
    },
    ["article"],
    { article: resource, userErrors: errors },
  ),
  operation(
    "update_article",
    "articleUpdate",
    "write",
    "Update a blog article. Requires write_content or write_online_store_pages.",
    { id, article, blog: inputObject("ArticleBlogInput", { title: text }) },
    ["id", "article"],
    { article: resource, userErrors: errors },
  ),
  operation(
    "delete_article",
    "articleDelete",
    "destructive",
    "Delete a blog article. Requires write_content or write_online_store_pages.",
    { id },
    ["id"],
    { deletedArticleId: s.nullable(id), userErrors: errors },
  ),
  operation(
    "publish_resource",
    "publishablePublish",
    "write",
    "Publish a resource to publications. Requires write_publications.",
    { id, input: publication },
    ["id", "input"],
    { publishable: resource, userErrors: errors },
  ),
  operation(
    "unpublish_resource",
    "publishableUnpublish",
    "destructive",
    "Unpublish a resource from publications. Requires write_publications.",
    { id, input: publication },
    ["id", "input"],
    { publishable: resource, userErrors: errors },
  ),
  operation(
    "create_files",
    "fileCreate",
    "write",
    "Create files from externally hosted URLs. Poll each returned file ID for processing completion. Requires write_files.",
    {
      files: listInput(
        "FileCreateInput",
        {
          originalSource: text,
          alt: text,
          contentType: text,
          filename: text,
          duplicateResolutionMode: text,
        },
        ["originalSource"],
      ),
    },
    ["files"],
    { files: s.array("Created files and their processing states.", resource), userErrors: errors },
  ),
  operation(
    "delete_files",
    "fileDelete",
    "destructive",
    "Delete files from the shop. Requires write_files.",
    { fileIds: ids },
    ["fileIds"],
    { deletedFileIds: ids, userErrors: errors },
  ),
  operation("get_job", "job", "read", "Check whether a Shopify background job has completed.", { id }, ["id"], {
    job: s.nullable(
      s.object(
        "A Shopify background job with normalized status.",
        {
          id,
          done: flag,
          status: s.stringEnum("The normalized job status derived from Shopify's done field.", [
            "RUNNING",
            "COMPLETED",
          ]),
        },
        { required: ["id", "done"], additionalProperties: true },
      ),
    ),
  }),
  operation(
    "get_product_operation",
    "productOperation",
    "read",
    "Poll a product deletion or duplication operation. Requires read_products.",
    { id },
    ["id"],
    { productOperation: s.nullable(productOperation) },
  ),
  operation(
    "list_publications",
    "publications",
    "read",
    "List publications available to the app. Requires read_publications.",
    { ...pagination, catalogType: text },
    [],
    { publications: connection("Matching publications.") },
  ),
  operation(
    "list_draft_orders",
    "draftOrders",
    "read",
    "Search draft orders with cursor pagination. Requires read_draft_orders.",
    { ...search, savedSearchId: id },
    [],
    { draftOrders: connection("Matching draft orders.") },
  ),
  operation(
    "get_draft_order",
    "draftOrder",
    "read",
    "Get a draft order and its invoice URL. Requires read_draft_orders.",
    { id },
    ["id"],
    { draftOrder: s.nullable(resource) },
  ),
  operation(
    "list_files",
    "files",
    "read",
    "Search files and their processing states. Requires read_files.",
    { ...search, savedSearchId: id },
    [],
    { files: connection("Matching files.") },
  ),
  operation(
    "get_file",
    "node",
    "read",
    "Get a file's processing state, errors, and available download URL. Requires read_files.",
    { id },
    ["id"],
    {
      node: s.nullable(
        s.object(
          "The file and its processing state.",
          { id, fileStatus: text, fileErrors: errors },
          { required: [], additionalProperties: true },
        ),
      ),
    },
  ),
  operation(
    "list_metaobjects",
    "metaobjects",
    "read",
    "Search metaobjects of a definition type. Requires read_metaobjects.",
    { ...search, type: text },
    ["type"],
    { metaobjects: connection("Matching metaobjects.") },
  ),
  operation(
    "get_metaobject",
    "metaobject",
    "read",
    "Get a metaobject and its fields. Requires read_metaobjects.",
    { id },
    ["id"],
    { metaobject: s.nullable(resource) },
  ),
  operation(
    "list_bulk_operations",
    "bulkOperations",
    "read",
    "Search bulk operations and their result URLs.",
    search,
    [],
    { bulkOperations: connection("Matching bulk operations.") },
  ),
];
