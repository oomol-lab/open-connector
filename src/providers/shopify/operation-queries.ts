export const operationQueries: Record<string, string> = {
  delete_product:
    "mutation Shopify_delete_product($input: ProductDeleteInput!, $synchronous: Boolean = true) { productDelete(input: $input, synchronous: $synchronous) { deletedProductId productDeleteOperation { id status deletedProductId } userErrors { field message } } }",
  duplicate_product:
    "mutation Shopify_duplicate_product($productId: ID!, $newTitle: String!, $newStatus: ProductStatus, $includeImages: Boolean = false, $includeTranslations: Boolean = false, $synchronous: Boolean = true) { productDuplicate(productId: $productId, newTitle: $newTitle, newStatus: $newStatus, includeImages: $includeImages, includeTranslations: $includeTranslations, synchronous: $synchronous) { newProduct { id title status } productDuplicateOperation { id status } imageJob { id done } userErrors { field message } } }",
  delete_collection:
    "mutation Shopify_delete_collection($input: CollectionDeleteInput!) { collectionDelete(input: $input) { deletedCollectionId userErrors { field message } } }",
  add_collection_products:
    "mutation Shopify_add_collection_products($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { collection { id title } userErrors { field message } } }",
  remove_collection_products:
    "mutation Shopify_remove_collection_products($id: ID!, $productIds: [ID!]!) { collectionRemoveProducts(id: $id, productIds: $productIds) { job { id done } userErrors { field message } } }",
  delete_customer:
    "mutation Shopify_delete_customer($input: CustomerDeleteInput!) { customerDelete(input: $input) { deletedCustomerId userErrors { field message } } }",
  create_customer:
    "mutation Shopify_create_customer($input: CustomerInput!) { customerCreate(input: $input) { customer { id firstName lastName email phone } userErrors { field message } } }",
  update_customer:
    "mutation Shopify_update_customer($input: CustomerInput!) { customerUpdate(input: $input) { customer { id firstName lastName email phone } userErrors { field message } } }",
  create_customer_address:
    "mutation Shopify_create_customer_address($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) { customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) { address { id address1 address2 city countryCodeV2 provinceCode zip } userErrors { field message } } }",
  update_customer_address:
    "mutation Shopify_update_customer_address($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) { customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) { address { id address1 address2 city countryCodeV2 provinceCode zip } userErrors { field message } } }",
  delete_customer_address:
    "mutation Shopify_delete_customer_address($customerId: ID!, $addressId: ID!) { customerAddressDelete(customerId: $customerId, addressId: $addressId) { deletedAddressId userErrors { field message } } }",
  set_default_customer_address:
    "mutation Shopify_set_default_customer_address($customerId: ID!, $addressId: ID!) { customerUpdateDefaultAddress(customerId: $customerId, addressId: $addressId) { customer { id defaultAddress { id } } userErrors { field message } } }",
  add_tags:
    "mutation Shopify_add_tags($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } } }",
  remove_tags:
    "mutation Shopify_remove_tags($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { node { id } userErrors { field message } } }",
  set_metafields:
    "mutation Shopify_set_metafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id namespace key type value compareDigest } userErrors { field message code } } }",
  delete_metafields:
    "mutation Shopify_delete_metafields($metafields: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $metafields) { deletedMetafields { ownerId namespace key } userErrors { field message } } }",
  create_metaobject:
    "mutation Shopify_create_metaobject($metaobject: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $metaobject) { metaobject { id type handle fields { key value } } userErrors { field message code } } }",
  update_metaobject:
    "mutation Shopify_update_metaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $metaobject) { metaobject { id type handle fields { key value } } userErrors { field message code } } }",
  delete_metaobject:
    "mutation Shopify_delete_metaobject($id: ID!) { metaobjectDelete(id: $id) { deletedId userErrors { field message code } } }",
  cancel_bulk_operation:
    "mutation Shopify_cancel_bulk_operation($id: ID!) { bulkOperationCancel(id: $id) { bulkOperation { id status type } userErrors { field message } } }",
  close_order:
    "mutation Shopify_close_order($input: OrderCloseInput!) { orderClose(input: $input) { order { id name closed closedAt } userErrors { field message } } }",
  open_order:
    "mutation Shopify_open_order($input: OrderOpenInput!) { orderOpen(input: $input) { order { id name closed closedAt } userErrors { field message } } }",
  mark_order_paid:
    "mutation Shopify_mark_order_paid($input: OrderMarkAsPaidInput!) { orderMarkAsPaid(input: $input) { order { id name displayFinancialStatus } userErrors { field message } } }",
  send_order_invoice:
    "mutation Shopify_send_order_invoice($id: ID!, $email: EmailInput) { orderInvoiceSend(id: $id, email: $email) { order { id name } userErrors { field message code } } }",
  delete_draft_order:
    "mutation Shopify_delete_draft_order($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { field message } } }",
  complete_draft_order:
    "mutation Shopify_complete_draft_order($id: ID!, $paymentPending: Boolean = false, $paymentGatewayId: ID, $sourceName: String) { draftOrderComplete(id: $id, paymentPending: $paymentPending, paymentGatewayId: $paymentGatewayId, sourceName: $sourceName) { draftOrder { id status order { id name } } userErrors { field message } } }",
  send_draft_order_invoice:
    "mutation Shopify_send_draft_order_invoice($id: ID!, $email: EmailInput) { draftOrderInvoiceSend(id: $id, email: $email) { draftOrder { id status invoiceUrl } userErrors { field message } } }",
  create_blog:
    "mutation Shopify_create_blog($blog: BlogCreateInput!) { blogCreate(blog: $blog) { blog { id title handle commentPolicy } userErrors { field message code } } }",
  update_blog:
    "mutation Shopify_update_blog($id: ID!, $blog: BlogUpdateInput!) { blogUpdate(id: $id, blog: $blog) { blog { id title handle commentPolicy } userErrors { field message code } } }",
  delete_blog:
    "mutation Shopify_delete_blog($id: ID!) { blogDelete(id: $id) { deletedBlogId userErrors { field message code } } }",
  create_page:
    "mutation Shopify_create_page($page: PageCreateInput!) { pageCreate(page: $page) { page { id title handle body isPublished publishedAt } userErrors { field message code } } }",
  update_page:
    "mutation Shopify_update_page($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id title handle body isPublished publishedAt } userErrors { field message code } } }",
  delete_page:
    "mutation Shopify_delete_page($id: ID!) { pageDelete(id: $id) { deletedPageId userErrors { field message code } } }",
  create_article:
    "mutation Shopify_create_article($article: ArticleCreateInput!, $blog: ArticleBlogInput) { articleCreate(article: $article, blog: $blog) { article { id title handle body summary isPublished publishedAt tags blog { id } } userErrors { field message code } } }",
  update_article:
    "mutation Shopify_update_article($id: ID!, $article: ArticleUpdateInput!, $blog: ArticleBlogInput) { articleUpdate(id: $id, article: $article, blog: $blog) { article { id title handle body summary isPublished publishedAt tags blog { id } } userErrors { field message code } } }",
  delete_article:
    "mutation Shopify_delete_article($id: ID!) { articleDelete(id: $id) { deletedArticleId userErrors { field message code } } }",
  publish_resource:
    "mutation Shopify_publish_resource($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { publishable { __typename } userErrors { field message } } }",
  unpublish_resource:
    "mutation Shopify_unpublish_resource($id: ID!, $input: [PublicationInput!]!) { publishableUnpublish(id: $id, input: $input) { publishable { __typename } userErrors { field message } } }",
  create_files:
    "mutation Shopify_create_files($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id alt fileStatus fileErrors { code message } } userErrors { field message code } } }",
  delete_files:
    "mutation Shopify_delete_files($fileIds: [ID!]!) { fileDelete(fileIds: $fileIds) { deletedFileIds userErrors { field message code } } }",
  create_product_variants:
    "mutation Shopify_create_product_variants($variants: [ProductVariantsBulkInput!]!, $productId: ID!, $media: [CreateMediaInput!], $strategy: ProductVariantsBulkCreateStrategy = DEFAULT) { productVariantsBulkCreate(variants: $variants, productId: $productId, media: $media, strategy: $strategy) { productVariants { id title sku price inventoryItem { id } } product { id } userErrors { field message code } } }",
  update_product_variants:
    "mutation Shopify_update_product_variants($variants: [ProductVariantsBulkInput!]!, $productId: ID!, $media: [CreateMediaInput!], $allowPartialUpdates: Boolean = false) { productVariantsBulkUpdate(variants: $variants, productId: $productId, media: $media, allowPartialUpdates: $allowPartialUpdates) { productVariants { id title sku price inventoryItem { id } } product { id } userErrors { field message code } } }",
  delete_product_variants:
    "mutation Shopify_delete_product_variants($variantsIds: [ID!]!, $productId: ID!) { productVariantsBulkDelete(variantsIds: $variantsIds, productId: $productId) { product { id } userErrors { field message code } } }",
  create_collection:
    "mutation Shopify_create_collection($input: CollectionInput, $collection: CollectionCreateInput) { collectionCreate(input: $input, collection: $collection) { collection { id title handle } userErrors { field message } } }",
  update_collection:
    "mutation Shopify_update_collection($input: CollectionInput, $collection: CollectionUpdateInput) { collectionUpdate(input: $input, collection: $collection) { collection { id title handle } job { id done } userErrors { field message } } }",
  create_draft_order:
    "mutation Shopify_create_draft_order($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name status invoiceUrl totalPriceSet { shopMoney { amount currencyCode } } } userErrors { field message } } }",
  update_draft_order:
    "mutation Shopify_update_draft_order($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { id name status invoiceUrl totalPriceSet { shopMoney { amount currencyCode } } } userErrors { field message } } }",
  create_refund:
    "mutation Shopify_create_refund($input: RefundInput!, $idempotencyKey: String!) { refundCreate(input: $input) @idempotent(key: $idempotencyKey) { refund { id createdAt totalRefundedSet { shopMoney { amount currencyCode } } } userErrors { field message } } }",
  cancel_order:
    "mutation Shopify_cancel_order($orderId: ID!, $refund: Boolean, $refundMethod: OrderCancelRefundMethodInput, $restock: Boolean!, $reason: OrderCancelReason!, $notifyCustomer: Boolean = false, $staffNote: String = null) { orderCancel(orderId: $orderId, refund: $refund, refundMethod: $refundMethod, restock: $restock, reason: $reason, notifyCustomer: $notifyCustomer, staffNote: $staffNote) { job { id done } orderCancelUserErrors { field message code } userErrors { field message } } }",
  get_job: "query Shopify_get_job($id: ID!) { job(id: $id) { id done } }",
  get_product_operation:
    "query Shopify_get_product_operation($id: ID!) { productOperation(id: $id) { status ... on ProductDeleteOperation { id deletedProductId userErrors { field message } } ... on ProductDuplicateOperation { id newProduct { id title } userErrors { field message } } } }",
  list_publications:
    "query Shopify_list_publications($catalogType: CatalogType, $first: Int, $after: String, $last: Int, $before: String, $reverse: Boolean = false) { publications(catalogType: $catalogType, first: $first, after: $after, last: $last, before: $before, reverse: $reverse) { nodes { id name } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }",
  list_draft_orders:
    "query Shopify_list_draft_orders($first: Int, $after: String, $last: Int, $before: String, $reverse: Boolean = false, $sortKey: DraftOrderSortKeys = ID, $query: String, $savedSearchId: ID) { draftOrders(first: $first, after: $after, last: $last, before: $before, reverse: $reverse, sortKey: $sortKey, query: $query, savedSearchId: $savedSearchId) { nodes { id name status email totalPriceSet { shopMoney { amount currencyCode } } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }",
  get_draft_order:
    "query Shopify_get_draft_order($id: ID!) { draftOrder(id: $id) { id name status email invoiceUrl note2 totalPriceSet { shopMoney { amount currencyCode } } order { id name } } }",
  list_files:
    "query Shopify_list_files($first: Int, $after: String, $last: Int, $before: String, $reverse: Boolean = false, $sortKey: FileSortKeys = ID, $query: String, $savedSearchId: ID) { files(first: $first, after: $after, last: $last, before: $before, reverse: $reverse, sortKey: $sortKey, query: $query, savedSearchId: $savedSearchId) { nodes { id alt fileStatus fileErrors { code message } ... on GenericFile { url } ... on MediaImage { image { url width height } } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }",
  list_metaobjects:
    "query Shopify_list_metaobjects($type: String!, $sortKey: String, $first: Int, $after: String, $last: Int, $before: String, $reverse: Boolean = false, $query: String) { metaobjects(type: $type, sortKey: $sortKey, first: $first, after: $after, last: $last, before: $before, reverse: $reverse, query: $query) { nodes { id type handle fields { key value } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }",
  get_metaobject:
    "query Shopify_get_metaobject($id: ID!) { metaobject(id: $id) { id type handle fields { key value } } }",
  list_bulk_operations:
    "query Shopify_list_bulk_operations($first: Int, $after: String, $last: Int, $before: String, $reverse: Boolean = false, $sortKey: BulkOperationsSortKeys = CREATED_AT, $query: String) { bulkOperations(first: $first, after: $after, last: $last, before: $before, reverse: $reverse, sortKey: $sortKey, query: $query) { nodes { id status type createdAt completedAt errorCode url partialDataUrl } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }",
  get_file:
    "query Shopify_get_file($id: ID!) { node(id: $id) { id ... on File { fileStatus alt fileErrors { code message } } ... on GenericFile { url } ... on MediaImage { image { url width height } } } }",
};
