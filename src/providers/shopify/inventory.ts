import type { ShopifyActionHandler } from "./context.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
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

const listInventoryItemsQuery = `query ShopifyListInventoryItems($first: Int, $after: String, $query: String) {
  inventoryItems(first: $first, after: $after, query: $query) {
    edges {
      cursor
      node {
        id
        sku
        tracked
        requiresShipping
        countryCodeOfOrigin
        harmonizedSystemCode
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

const getInventoryItemQuery = `query ShopifyGetInventoryItem($id: ID!) {
  inventoryItem(id: $id) {
    id
    sku
    tracked
    requiresShipping
    countryCodeOfOrigin
    harmonizedSystemCode
    createdAt
    updatedAt
  }
}`;

const getInventoryQuantitiesQuery = `query ShopifyGetInventoryQuantities(
  $inventoryItemId: ID!,
  $locationId: ID!,
  $names: [String!]!,
  $includeInactive: Boolean
) {
  inventoryItem(id: $inventoryItemId) {
    inventoryLevel(locationId: $locationId, includeInactive: $includeInactive) {
      id
      isActive
      item {
        id
        sku
      }
      location {
        id
        name
      }
      quantities(names: $names) {
        name
        quantity
      }
    }
  }
}`;

const listLocationsQuery = `query ShopifyListLocations(
  $first: Int,
  $after: String,
  $query: String,
  $includeInactive: Boolean,
  $includeLegacy: Boolean
) {
  locations(
    first: $first,
    after: $after,
    query: $query,
    includeInactive: $includeInactive,
    includeLegacy: $includeLegacy
  ) {
    edges {
      cursor
      node {
        id
        name
        isActive
        fulfillsOnlineOrders
        address {
          address1
          city
          province
          country
          zip
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

const getLocationQuery = `query ShopifyGetLocation($id: ID!) {
  location(id: $id) {
    id
    name
    isActive
    fulfillsOnlineOrders
    address {
      address1
      city
      province
      country
      zip
    }
  }
}`;

const adjustInventoryQuantitiesMutation = `mutation ShopifyAdjustInventoryQuantities(
  $input: InventoryAdjustQuantitiesInput!,
  $idempotencyKey: String!
) {
  inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup {
      id
      createdAt
      reason
      referenceDocumentUri
      changes {
        name
        delta
        quantityAfterChange
      }
    }
    userErrors {
      code
      field
      message
    }
  }
}`;

const setInventoryQuantitiesMutation = `mutation ShopifySetInventoryQuantities(
  $input: InventorySetQuantitiesInput!,
  $idempotencyKey: String!
) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    inventoryAdjustmentGroup {
      id
      createdAt
      reason
      referenceDocumentUri
      changes {
        name
        delta
        quantityAfterChange
      }
    }
    userErrors {
      code
      field
      message
    }
  }
}`;

function locationConnectionVariables(input: Record<string, unknown>) {
  return {
    ...connectionVariables(input),
    includeInactive: typeof input.includeInactive === "boolean" ? input.includeInactive : undefined,
    includeLegacy: typeof input.includeLegacy === "boolean" ? input.includeLegacy : undefined,
  };
}

function normalizeInventoryAdjustmentGroup(raw: Record<string, unknown>) {
  const changes = raw.changes;
  if (!Array.isArray(changes)) {
    throw new ProviderRequestError(502, "shopify response is missing inventory adjustment changes");
  }
  return {
    id: readRequiredString(raw, "id"),
    createdAt: readRequiredString(raw, "createdAt"),
    reason: readRequiredString(raw, "reason"),
    referenceDocumentUri: optionalString(raw.referenceDocumentUri) ?? null,
    changes: changes.map((item) => {
      const change = requiredResponseRecord(item, "inventory change");
      return {
        name: readRequiredString(change, "name"),
        delta: readRequiredInteger(change, "delta"),
        quantityAfterChange: optionalInteger(change.quantityAfterChange) ?? null,
        raw: change,
      };
    }),
    raw,
  };
}

function normalizeInventoryItem(edge: Record<string, unknown>) {
  const inventoryItem = requiredResponseRecord(edge.node, "node");
  return {
    ...normalizeInventoryItemDetail(inventoryItem),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeInventoryItemDetail(raw: Record<string, unknown>) {
  return {
    id: readRequiredString(raw, "id"),
    sku: optionalString(raw.sku) ?? null,
    tracked: readRequiredBoolean(raw, "tracked"),
    requiresShipping: readRequiredBoolean(raw, "requiresShipping"),
    countryCodeOfOrigin: optionalString(raw.countryCodeOfOrigin) ?? null,
    harmonizedSystemCode: optionalString(raw.harmonizedSystemCode) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    updatedAt: optionalString(raw.updatedAt) ?? null,
    raw,
  };
}

function normalizeInventoryLevel(raw: Record<string, unknown>) {
  const inventoryItem = requiredResponseRecord(raw.item, "item");
  const location = requiredResponseRecord(raw.location, "location");
  const quantities = raw.quantities;
  if (!Array.isArray(quantities)) {
    throw new ProviderRequestError(502, "shopify response is missing inventory quantities");
  }
  return {
    id: readRequiredString(raw, "id"),
    isActive: readRequiredBoolean(raw, "isActive"),
    inventoryItemId: readRequiredString(inventoryItem, "id"),
    inventoryItemSku: optionalString(inventoryItem.sku) ?? null,
    locationId: readRequiredString(location, "id"),
    locationName: readRequiredString(location, "name"),
    quantities: quantities.map((item) => {
      const quantity = requiredResponseRecord(item, "inventory quantity");
      return {
        name: readRequiredString(quantity, "name"),
        quantity: readRequiredInteger(quantity, "quantity"),
      };
    }),
    raw,
  };
}

function normalizeLocation(edge: Record<string, unknown>) {
  const location = requiredResponseRecord(edge.node, "node");
  return {
    ...normalizeLocationDetail(location),
    cursor: optionalString(edge.cursor) ?? null,
  };
}

function normalizeLocationDetail(raw: Record<string, unknown>) {
  const address = optionalRecord(raw.address);
  return {
    id: readRequiredString(raw, "id"),
    name: readRequiredString(raw, "name"),
    isActive: readRequiredBoolean(raw, "isActive"),
    fulfillsOnlineOrders: readRequiredBoolean(raw, "fulfillsOnlineOrders"),
    address1: optionalString(address?.address1) ?? null,
    city: optionalString(address?.city) ?? null,
    province: optionalString(address?.province) ?? null,
    country: optionalString(address?.country) ?? null,
    zip: optionalString(address?.zip) ?? null,
    raw,
  };
}

export const inventoryHandlers: Record<string, ShopifyActionHandler> = {
  async list_inventory_items(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listInventoryItemsQuery,
      variables: connectionVariables(input),
    });
    const inventoryItems = requiredResponseRecord(
      requiredResponseRecord(payload.data, "data").inventoryItems,
      "inventoryItems",
    );
    return {
      inventoryItems: readEdges(inventoryItems).map((edge) => normalizeInventoryItem(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(inventoryItems.pageInfo, "pageInfo")),
    };
  },
  async get_inventory_item(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getInventoryItemQuery,
      variables: {
        id: input.id,
      },
    });
    const inventoryItem = readNullableObject(
      requiredResponseRecord(payload.data, "data").inventoryItem,
      "inventoryItem",
    );
    return { inventoryItem: inventoryItem ? normalizeInventoryItemDetail(inventoryItem) : null };
  },
  async get_inventory_quantities(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getInventoryQuantitiesQuery,
      variables: {
        inventoryItemId: input.inventoryItemId,
        locationId: input.locationId,
        names: input.names ?? ["available", "on_hand"],
        includeInactive: typeof input.includeInactive === "boolean" ? input.includeInactive : undefined,
      },
    });
    const inventoryItem = readNullableObject(
      requiredResponseRecord(payload.data, "data").inventoryItem,
      "inventoryItem",
    );
    const inventoryLevel = inventoryItem ? readNullableObject(inventoryItem.inventoryLevel, "inventoryLevel") : null;
    return {
      inventoryLevel: inventoryLevel ? normalizeInventoryLevel(inventoryLevel) : null,
    };
  },
  async list_locations(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: listLocationsQuery,
      variables: locationConnectionVariables(input),
    });
    const locations = requiredResponseRecord(requiredResponseRecord(payload.data, "data").locations, "locations");
    return {
      locations: readEdges(locations).map((edge) => normalizeLocation(edge)),
      pageInfo: normalizePageInfo(requiredResponseRecord(locations.pageInfo, "pageInfo")),
    };
  },
  async get_location(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getLocationQuery,
      variables: {
        id: input.id,
      },
    });
    const location = readNullableObject(requiredResponseRecord(payload.data, "data").location, "location");
    return { location: location ? normalizeLocationDetail(location) : null };
  },
  async adjust_inventory_quantities(input, context) {
    const { idempotencyKey, name, reason, referenceDocumentUri, changes } = input;
    for (const change of changes as Record<string, unknown>[]) {
      if (name === "available" && change.ledgerDocumentUri !== undefined)
        throw new ProviderRequestError(400, "ledgerDocumentUri is not allowed when adjusting available");
      if (name !== "available" && change.ledgerDocumentUri === undefined)
        throw new ProviderRequestError(400, "ledgerDocumentUri is required when adjusting a non-available quantity");
    }
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: adjustInventoryQuantitiesMutation,
      variables: {
        idempotencyKey,
        input: {
          name,
          reason,
          referenceDocumentUri,
          changes,
        },
      },
    });
    const result = readMutationResult(payload, "inventoryAdjustQuantities");
    return {
      inventoryAdjustmentGroup: normalizeInventoryAdjustmentGroup(
        requiredResponseRecord(result.inventoryAdjustmentGroup, "inventoryAdjustmentGroup"),
      ),
    };
  },
  async set_inventory_quantities(input, context) {
    const { idempotencyKey, name, reason, referenceDocumentUri, quantities } = input;
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: setInventoryQuantitiesMutation,
      variables: {
        idempotencyKey,
        input: {
          name,
          reason,
          referenceDocumentUri,
          quantities,
        },
      },
    });
    const result = readMutationResult(payload, "inventorySetQuantities");
    return {
      inventoryAdjustmentGroup: normalizeInventoryAdjustmentGroup(
        requiredResponseRecord(result.inventoryAdjustmentGroup, "inventoryAdjustmentGroup"),
      ),
    };
  },
};
