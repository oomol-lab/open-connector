import type { ShopifyActionHandler } from "./context.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { requiredResponseRecord } from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";
import {
  readMutationResult,
  connectionVariables,
  normalizePageInfo,
  readEdges,
  readNullableObject,
  readRequiredString,
} from "./runtime-common.ts";

const listProductsQuery = `query ShopifyListProducts($first: Int, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        status
        vendor
        productType
        createdAt
        updatedAt
        onlineStoreUrl
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;

const getProductQuery = `query ShopifyGetProduct($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    status
    vendor
    productType
    descriptionHtml
    createdAt
    updatedAt
    onlineStoreUrl
  }
}`;

const listProductVariantsQuery = `query ShopifyListProductVariants($first: Int, $after: String, $query: String) {
  productVariants(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        sku
        price
        inventoryQuantity
        inventoryItem {
          id
        }
        product {
          id
          title
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;

const listCollectionsQuery = `query ShopifyListCollections($first: Int, $after: String, $query: String) {
  collections(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        title
        handle
        description
        descriptionHtml
        updatedAt
        image {
          url
        }
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
}`;

const getCollectionQuery = `query ShopifyGetCollection($id: ID!) {
  collection(id: $id) {
    id
    title
    handle
    description
    descriptionHtml
    updatedAt
    image {
      url
    }
  }
}`;

const createProductMutation = `mutation ShopifyCreateProduct(
  $product: ProductCreateInput!,
  $media: [CreateMediaInput!]
) {
  productCreate(product: $product, media: $media) {
    product {
      id
      title
      handle
      status
      vendor
      productType
      descriptionHtml
      createdAt
      updatedAt
      onlineStoreUrl
    }
    userErrors {
      field
      message
    }
  }
}`;

const updateProductMutation = `mutation ShopifyUpdateProduct(
  $product: ProductUpdateInput!,
  $media: [CreateMediaInput!]
) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      title
      handle
      status
      vendor
      productType
      descriptionHtml
      createdAt
      updatedAt
      onlineStoreUrl
    }
    userErrors {
      field
      message
    }
  }
}`;

function normalizeProductSummary(edge: Record<string, unknown>) {
  const product = requiredResponseRecord(edge.node, "node");
  return {
    id: readRequiredString(product, "id"),
    title: readRequiredString(product, "title"),
    handle: optionalString(product.handle) ?? null,
    status: optionalString(product.status) ?? null,
    vendor: optionalString(product.vendor) ?? null,
    productType: optionalString(product.productType) ?? null,
    createdAt: optionalString(product.createdAt) ?? null,
    updatedAt: optionalString(product.updatedAt) ?? null,
    onlineStoreUrl: optionalString(product.onlineStoreUrl) ?? null,
    cursor: optionalString(edge.cursor) ?? null,
    raw: product,
  };
}

function normalizeProductDetail(raw: Record<string, unknown>) {
  return {
    id: readRequiredString(raw, "id"),
    title: readRequiredString(raw, "title"),
    handle: optionalString(raw.handle) ?? null,
    status: optionalString(raw.status) ?? null,
    vendor: optionalString(raw.vendor) ?? null,
    productType: optionalString(raw.productType) ?? null,
    descriptionHtml: optionalString(raw.descriptionHtml) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    onlineStoreUrl: optionalString(raw.onlineStoreUrl) ?? null,
    raw,
  };
}

function normalizeVariant(edge: Record<string, unknown>) {
  const variant = requiredResponseRecord(edge.node, "node");
  const inventoryItem = optionalRecord(variant.inventoryItem);
  const product = optionalRecord(variant.product);
  return {
    id: readRequiredString(variant, "id"),
    title: readRequiredString(variant, "title"),
    sku: optionalString(variant.sku) ?? null,
    price: optionalString(variant.price) ?? null,
    inventoryQuantity: optionalInteger(variant.inventoryQuantity) ?? null,
    inventoryItemId: optionalString(inventoryItem?.id) ?? null,
    productId: optionalString(product?.id) ?? null,
    productTitle: optionalString(product?.title) ?? null,
    cursor: optionalString(edge.cursor) ?? null,
    raw: variant,
  };
}

function normalizeCollection(edge: Record<string, unknown>) {
  const collection = requiredResponseRecord(edge.node, "node");
  return {
    ...normalizeCollectionDetail(collection),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeCollectionDetail(raw: Record<string, unknown>) {
  const image = optionalRecord(raw.image);
  return {
    id: readRequiredString(raw, "id"),
    title: readRequiredString(raw, "title"),
    handle: readRequiredString(raw, "handle"),
    description: readRequiredString(raw, "description"),
    descriptionHtml: readRequiredString(raw, "descriptionHtml"),
    updatedAt: optionalString(raw.updatedAt) ?? null,
    imageUrl: optionalString(image?.url) ?? null,
    raw,
  };
}

export const catalogHandlers: Record<string, ShopifyActionHandler> = {
  async list_products(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listProductsQuery,
      variables: connectionVariables(input),
    });
    const products = requiredResponseRecord(requiredResponseRecord(payload.data, "data").products, "products");
    return {
      products: readEdges(products).map((edge) => normalizeProductSummary(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(products.pageInfo, "pageInfo")),
    };
  },
  async get_product(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getProductQuery,
      variables: {
        id: input.id,
      },
    });
    const product = readNullableObject(requiredResponseRecord(payload.data, "data").product, "product");
    return { product: product ? normalizeProductDetail(product) : null };
  },
  async list_product_variants(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listProductVariantsQuery,
      variables: connectionVariables(input),
    });
    const variants = requiredResponseRecord(
      requiredResponseRecord(payload.data, "data").productVariants,
      "productVariants",
    );
    return {
      variants: readEdges(variants).map((edge) => normalizeVariant(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(variants.pageInfo, "pageInfo")),
    };
  },
  async list_collections(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listCollectionsQuery,
      variables: connectionVariables(input),
    });
    const collections = requiredResponseRecord(requiredResponseRecord(payload.data, "data").collections, "collections");
    return {
      collections: readEdges(collections).map((edge) => normalizeCollection(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(collections.pageInfo, "pageInfo")),
    };
  },
  async get_collection(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getCollectionQuery,
      variables: {
        id: input.id,
      },
    });
    const collection = readNullableObject(requiredResponseRecord(payload.data, "data").collection, "collection");
    return { collection: collection ? normalizeCollectionDetail(collection) : null };
  },
  async create_product(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: createProductMutation,
      variables: {
        product: requiredResponseRecord(input.product, "product"),
        media: Array.isArray(input.media) ? input.media : undefined,
      },
    });
    const result = readMutationResult(payload, "productCreate");
    return {
      product: normalizeProductDetail(requiredResponseRecord(result.product, "product")),
    };
  },
  async update_product(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: updateProductMutation,
      variables: {
        product: requiredResponseRecord(input.product, "product"),
        media: Array.isArray(input.media) ? input.media : undefined,
      },
    });
    const result = readMutationResult(payload, "productUpdate");
    return {
      product: normalizeProductDetail(requiredResponseRecord(result.product, "product")),
    };
  },
};
