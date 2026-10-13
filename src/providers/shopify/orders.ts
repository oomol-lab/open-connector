import type { ShopifyActionHandler } from "./context.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";
import {
  readMutationResult,
  connectionVariables,
  normalizePageInfo,
  readEdges,
  readNullableObject,
  readRequiredString,
  readRequiredInteger,
  readRequiredBoolean,
} from "./runtime-common.ts";

const fulfillmentOrderFieldsFragment = `fragment ShopifyFulfillmentOrderFields on FulfillmentOrder {
  id
  orderId
  orderName
  status
  requestStatus
  assignedLocation {
    name
    location {
      id
    }
  }
  supportedActions {
    action
    externalUrl
  }
  lineItems(first: $lineItemsFirst, after: $lineItemsAfter) {
    edges {
      node {
        id
        totalQuantity
        remainingQuantity
        inventoryItemId
        sku
        productTitle
        variantTitle
        requiresShipping
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
  }
  updatedAt
}`;

const listOrderFulfillmentOrdersQuery = `query ShopifyListOrderFulfillmentOrders(
  $orderId: ID!,
  $first: Int,
  $after: String,
  $displayable: Boolean,
  $lineItemsFirst: Int!,
  $lineItemsAfter: String
) {
  order(id: $orderId) {
    id
    name
    fulfillmentOrders(first: $first, after: $after, displayable: $displayable) {
      edges {
        cursor
        node {
          ...ShopifyFulfillmentOrderFields
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
}

${fulfillmentOrderFieldsFragment}`;

const getFulfillmentOrderQuery = `query ShopifyGetFulfillmentOrder(
  $id: ID!,
  $lineItemsFirst: Int!,
  $lineItemsAfter: String
) {
  fulfillmentOrder(id: $id) {
    ...ShopifyFulfillmentOrderFields
  }
}

${fulfillmentOrderFieldsFragment}`;

const listOrdersQuery = `query ShopifyListOrders($first: Int, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        name
        email
        phone
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        createdAt
        updatedAt
        customer {
          id
          displayName
        }
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
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

const getOrderQuery = `query ShopifyGetOrder($id: ID!) {
  order(id: $id) {
    id
    name
    email
    phone
    displayFinancialStatus
    displayFulfillmentStatus
    currencyCode
    createdAt
    updatedAt
    customer {
      id
      displayName
    }
    currentTotalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
  }
}`;

const createFulfillmentMutation = `mutation ShopifyCreateFulfillment(
  $fulfillment: FulfillmentInput!,
  $message: String
) {
  fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
    fulfillment {
      id
      name
      status
      totalQuantity
      createdAt
      order {
        id
        name
      }
      trackingInfo {
        company
        number
        url
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

function normalizeFulfillment(raw: Record<string, unknown>) {
  const order = requiredResponseRecord(raw.order, "order");
  const trackingInfo = raw.trackingInfo;
  if (!Array.isArray(trackingInfo)) {
    throw new ProviderRequestError(502, "shopify response is missing fulfillment trackingInfo");
  }
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    status: readRequiredString(raw, "status"),
    totalQuantity: readRequiredInteger(raw, "totalQuantity"),
    createdAt: readRequiredString(raw, "createdAt"),
    orderId: readRequiredString(order, "id"),
    orderName: readRequiredString(order, "name"),
    trackingInfo: trackingInfo.map((item) => {
      const tracking = requiredResponseRecord(item, "trackingInfo");
      return {
        company: optionalString(tracking.company) ?? null,
        number: optionalString(tracking.number) ?? null,
        url: optionalString(tracking.url) ?? null,
        raw: tracking,
      };
    }),
    raw,
  };
}

function normalizeOrderFulfillmentOrders(raw: Record<string, unknown>) {
  const connection = requiredResponseRecord(raw.fulfillmentOrders, "fulfillmentOrders");
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    fulfillmentOrders: readEdges(connection).map((edge) => normalizeFulfillmentOrder(edge)),
    pageInfo: normalizePageInfo(requiredResponseRecord(connection.pageInfo, "pageInfo")),
    raw,
  };
}

function normalizeFulfillmentOrder(edge: Record<string, unknown>) {
  const fulfillmentOrder = requiredResponseRecord(edge.node, "node");
  const assignedLocation = requiredResponseRecord(fulfillmentOrder.assignedLocation, "assignedLocation");
  const location = optionalRecord(assignedLocation.location);
  const lineItems = requiredResponseRecord(fulfillmentOrder.lineItems, "lineItems");
  const supportedActions = fulfillmentOrder.supportedActions;
  if (!Array.isArray(supportedActions)) {
    throw new ProviderRequestError(502, "shopify response is missing supportedActions");
  }
  return {
    id: readRequiredString(fulfillmentOrder, "id"),
    orderId: readRequiredString(fulfillmentOrder, "orderId"),
    orderName: readRequiredString(fulfillmentOrder, "orderName"),
    status: readRequiredString(fulfillmentOrder, "status"),
    requestStatus: readRequiredString(fulfillmentOrder, "requestStatus"),
    assignedLocationId: optionalString(location?.id) ?? null,
    assignedLocationName: readRequiredString(assignedLocation, "name"),
    supportedActions: supportedActions.map((item) => {
      const supportedAction = requiredResponseRecord(item, "supportedAction");
      return {
        action: readRequiredString(supportedAction, "action"),
        externalUrl: optionalString(supportedAction.externalUrl) ?? null,
      };
    }),
    lineItems: readEdges(lineItems).map((lineItemEdge) => {
      const lineItem = requiredResponseRecord(lineItemEdge.node, "node");
      return {
        id: readRequiredString(lineItem, "id"),
        totalQuantity: readRequiredInteger(lineItem, "totalQuantity"),
        remainingQuantity: readRequiredInteger(lineItem, "remainingQuantity"),
        inventoryItemId: optionalString(lineItem.inventoryItemId) ?? null,
        sku: optionalString(lineItem.sku) ?? null,
        productTitle: readRequiredString(lineItem, "productTitle"),
        variantTitle: optionalString(lineItem.variantTitle) ?? null,
        requiresShipping: readRequiredBoolean(lineItem, "requiresShipping"),
        raw: lineItem,
      };
    }),
    lineItemsPageInfo: normalizePageInfo(requiredResponseRecord(lineItems.pageInfo, "pageInfo")),
    updatedAt: readRequiredString(fulfillmentOrder, "updatedAt"),
    cursor: optionalString(edge.cursor) ?? null,
    raw: fulfillmentOrder,
  };
}

function normalizeOrder(edge: Record<string, unknown>) {
  const order = requiredResponseRecord(edge.node, "node");
  return {
    ...normalizeOrderDetail(order),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeOrderDetail(raw: Record<string, unknown>) {
  const customer = optionalRecord(raw.customer);
  const totalMoney = readShopMoney(raw.currentTotalPriceSet);
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    email: optionalString(raw.email) ?? null,
    phone: optionalString(raw.phone) ?? null,
    displayFinancialStatus: optionalString(raw.displayFinancialStatus) ?? null,
    displayFulfillmentStatus: optionalString(raw.displayFulfillmentStatus) ?? null,
    currencyCode: optionalString(raw.currencyCode) ?? null,
    totalAmount: totalMoney.amount,
    totalCurrencyCode: totalMoney.currencyCode,
    customerId: optionalString(customer?.id) ?? null,
    customerDisplayName: optionalString(customer?.displayName) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    raw,
  };
}

function readShopMoney(value: unknown) {
  const money = optionalRecord(optionalRecord(value)?.shopMoney);
  return {
    amount: optionalString(money?.amount) ?? null,
    currencyCode: optionalString(money?.currencyCode) ?? null,
  };
}

export const ordersHandlers: Record<string, ShopifyActionHandler> = {
  async list_order_fulfillment_orders(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listOrderFulfillmentOrdersQuery,
      variables: {
        orderId: input.orderId,
        lineItemsFirst: input.lineItemsFirst ?? 10,
        first: input.first ?? 10,
        after: typeof input.after === "string" ? input.after : undefined,
        displayable: typeof input.displayable === "boolean" ? input.displayable : undefined,
      },
    });
    const order = readNullableObject(requiredResponseRecord(payload.data, "data").order, "order");
    return {
      order: order ? normalizeOrderFulfillmentOrders(order) : null,
    };
  },
  async get_fulfillment_order(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getFulfillmentOrderQuery,
      variables: {
        id: input.id,
        lineItemsFirst: input.lineItemsFirst ?? 50,
        lineItemsAfter: typeof input.lineItemsAfter === "string" ? input.lineItemsAfter : undefined,
      },
    });
    const fulfillmentOrder = readNullableObject(
      requiredResponseRecord(payload.data, "data").fulfillmentOrder,
      "fulfillmentOrder",
    );
    return {
      fulfillmentOrder: fulfillmentOrder ? normalizeFulfillmentOrder({ node: fulfillmentOrder }) : null,
    };
  },
  async list_orders(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listOrdersQuery,
      variables: connectionVariables(input),
    });
    const orders = requiredResponseRecord(requiredResponseRecord(payload.data, "data").orders, "orders");
    return {
      orders: readEdges(orders).map((edge) => normalizeOrder(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(orders.pageInfo, "pageInfo")),
    };
  },
  async get_order(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getOrderQuery,
      variables: {
        id: input.id,
      },
    });
    const order = readNullableObject(requiredResponseRecord(payload.data, "data").order, "order");
    return { order: order ? normalizeOrderDetail(order) : null };
  },
  async create_fulfillment(input, context) {
    const tracking = optionalRecord(optionalRecord(input.fulfillment)?.trackingInfo);
    if (tracking) {
      if (tracking.number !== undefined && tracking.numbers !== undefined)
        throw new ProviderRequestError(400, "number and numbers cannot both be provided");
      if (tracking.url !== undefined && tracking.urls !== undefined)
        throw new ProviderRequestError(400, "url and urls cannot both be provided");
      if (tracking.url !== undefined && tracking.number === undefined)
        throw new ProviderRequestError(400, "number is required when url is provided");
      if (tracking.urls !== undefined && tracking.numbers === undefined)
        throw new ProviderRequestError(400, "numbers is required when urls is provided");
    }
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: createFulfillmentMutation,
      variables: {
        fulfillment: requiredResponseRecord(input.fulfillment, "fulfillment"),
        message: typeof input.message === "string" ? input.message : undefined,
      },
    });
    const result = readMutationResult(payload, "fulfillmentCreate");
    return {
      fulfillment: normalizeFulfillment(requiredResponseRecord(result.fulfillment, "fulfillment")),
    };
  },
};
