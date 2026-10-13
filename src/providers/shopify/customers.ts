import type { ShopifyActionHandler } from "./context.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { requiredResponseRecord } from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";
import {
  connectionVariables,
  normalizePageInfo,
  readEdges,
  readNullableObject,
  readRequiredString,
} from "./runtime-common.ts";

const listCustomersQuery = `query ShopifyListCustomers($first: Int, $after: String, $query: String) {
  customers(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        displayName
        firstName
        lastName
        defaultEmailAddress {
          emailAddress
        }
        defaultPhoneNumber {
          phoneNumber
        }
        state
        tags
        numberOfOrders
        amountSpent {
          amount
          currencyCode
        }
        createdAt
        updatedAt
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

const getCustomerQuery = `query ShopifyGetCustomer($id: ID!) {
  customer(id: $id) {
    id
    displayName
    firstName
    lastName
    defaultEmailAddress {
      emailAddress
    }
    defaultPhoneNumber {
      phoneNumber
    }
    state
    tags
    numberOfOrders
    amountSpent {
      amount
      currencyCode
    }
    createdAt
    updatedAt
  }
}`;

function normalizeCustomer(edge: Record<string, unknown>) {
  const customer = requiredResponseRecord(edge.node, "node");
  return {
    ...normalizeCustomerDetail(customer),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeCustomerDetail(raw: Record<string, unknown>) {
  const amountSpent = optionalRecord(raw.amountSpent);
  const defaultEmailAddress = optionalRecord(raw.defaultEmailAddress);
  const defaultPhoneNumber = optionalRecord(raw.defaultPhoneNumber);
  return {
    id: readRequiredString(raw, "id"),
    displayName: readRequiredString(raw, "displayName"),
    firstName: optionalString(raw.firstName) ?? null,
    lastName: optionalString(raw.lastName) ?? null,
    email: optionalString(defaultEmailAddress?.emailAddress) ?? null,
    phone: optionalString(defaultPhoneNumber?.phoneNumber) ?? null,
    state: optionalString(raw.state) ?? null,
    tags: readStringArray(raw.tags),
    numberOfOrders: optionalString(raw.numberOfOrders) ?? null,
    amountSpent: optionalString(amountSpent?.amount) ?? null,
    amountSpentCurrencyCode: optionalString(amountSpent?.currencyCode) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    raw,
  };
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export const customersHandlers: Record<string, ShopifyActionHandler> = {
  async list_customers(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listCustomersQuery,
      variables: connectionVariables(input),
    });
    const customers = requiredResponseRecord(requiredResponseRecord(payload.data, "data").customers, "customers");
    return {
      customers: readEdges(customers).map((edge) => normalizeCustomer(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(customers.pageInfo, "pageInfo")),
    };
  },
  async get_customer(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getCustomerQuery,
      variables: {
        id: input.id,
      },
    });
    const customer = readNullableObject(requiredResponseRecord(payload.data, "data").customer, "customer");
    return { customer: customer ? normalizeCustomerDetail(customer) : null };
  },
};
