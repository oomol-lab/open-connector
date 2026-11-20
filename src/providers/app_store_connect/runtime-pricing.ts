import type { AppStoreConnectContext, AppStoreConnectHandlers, IncludedResources } from "./runtime-helpers.ts";

import {
  looseArray,
  recordOrEmpty,
  rawStringOrNull,
  compactObject,
  optionalBoolean,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  createResource,
  getResource,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIdentifierList,
  readIncludedResource,
  readOptionalRawResource,
  readRelationshipId,
  readResource,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
} from "./runtime-helpers.ts";

const priceScheduleLabel = "App Store Connect app price schedule";
const pricePointLabel = "App Store Connect app price point";
const availabilityLabel = "App Store Connect app availability";
const territoryAvailabilityLabel = "App Store Connect territory availability";

export const appStoreConnectPricingHandlers: AppStoreConnectHandlers = {
  async get_app_price_schedule(input, context) {
    const resource = await readOptionalRelatedResource(
      context,
      resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appPriceSchedule"),
      priceScheduleLabel,

      { include: "baseTerritory" },
    );
    return { appPriceSchedule: resource ? readAppPriceSchedule(resource) : null };
  },

  async create_app_price_schedule(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");
    const baseTerritoryId = readAppStoreConnectId(input.baseTerritoryId, "baseTerritoryId");
    const manualPrices = readManualPriceInputs(input.manualPrices);

    const included = manualPrices.map((price, index) => ({
      type: "appPrices",
      id: inlineResourceId("newprice", index),

      attributes: { startDate: price.startDate ?? null, endDate: price.endDate ?? null },
      relationships: { appPricePoint: toOneLinkage("appPricePoints", price.appPricePointId) },
    }));
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/appPriceSchedules",
      body: {
        data: {
          type: "appPriceSchedules",
          relationships: {
            app: toOneLinkage("apps", appId),
            baseTerritory: toOneLinkage("territories", baseTerritoryId),
            manualPrices: toManyLinkage(
              "appPrices",
              included.map((price) => price.id),
            ),
          },
        },
        included,
      },
    });
    const schedule = readAppPriceSchedule(readResource(payload, priceScheduleLabel));
    return {
      appPriceSchedule: {
        ...schedule,

        baseTerritoryId: schedule.baseTerritoryId ?? baseTerritoryId,
      },
    };
  },

  async list_app_price_schedule_manual_prices(input, context) {
    return listSchedulePrices(input, context, "manualPrices");
  },

  async list_app_price_schedule_automatic_prices(input, context) {
    return listSchedulePrices(input, context, "automaticPrices");
  },

  async get_app_price_schedule_base_territory(input, context) {
    return {
      territory: await getResource(
        context,
        resourcePath(
          "/v1/appPriceSchedules",
          readAppStoreConnectId(input.appPriceScheduleId, "appPriceScheduleId"),
          "baseTerritory",
        ),
        "App Store Connect territory",
      ),
    };
  },

  async list_app_price_points(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appPricePoints"),
      label: `${pricePointLabel} list`,
      query: {
        "filter[territory]": readCommaSeparatedList(input.territoryIds),
        "include": "territory",
      },
    });
    return {
      appPricePoints: page.resources.map(readAppPricePoint),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_price_point(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v3/appPricePoints", readAppStoreConnectId(input.appPricePointId, "appPricePointId")),
      query: { include: "territory" },
    });
    return { appPricePoint: readAppPricePoint(readResource(payload, pricePointLabel)) };
  },

  async list_app_price_point_equalizations(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v3/appPricePoints",
        readAppStoreConnectId(input.appPricePointId, "appPricePointId"),
        "equalizations",
      ),
      label: `${pricePointLabel} equalization list`,
      query: {
        "filter[territory]": readCommaSeparatedList(input.territoryIds),
        "include": "territory",
      },
    });
    return {
      appPricePoints: page.resources.map(readAppPricePoint),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_availability(input, context) {
    const resource = await readOptionalRelatedResource(
      context,
      resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appAvailabilityV2"),
      availabilityLabel,
    );
    return { appAvailability: resource ? normalizeResource(resource, availabilityLabel) : null };
  },

  async create_app_availability(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");
    const availableInNewTerritories = optionalBoolean(input.availableInNewTerritories);
    if (availableInNewTerritories === undefined) {
      throw new ProviderRequestError(400, "availableInNewTerritories is required");
    }
    const territoryAvailabilities = readTerritoryAvailabilityInputs(input.territoryAvailabilities);

    const included = territoryAvailabilities.map((entry, index) => ({
      type: "territoryAvailabilities",
      id: inlineResourceId("territoryAvailability", index),
      attributes: compactObject({
        available: entry.available,
        releaseDate: entry.releaseDate,
        preOrderEnabled: entry.preOrderEnabled,
      }),
      relationships: { territory: toOneLinkage("territories", entry.territoryId) },
    }));
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v2/appAvailabilities",
      body: {
        data: {
          type: "appAvailabilities",
          attributes: { availableInNewTerritories },
          relationships: {
            app: toOneLinkage("apps", appId),
            territoryAvailabilities: toManyLinkage(
              "territoryAvailabilities",
              included.map((entry) => entry.id),
            ),
          },
        },
        included,
      },
    });
    return {
      appAvailability: normalizeResource(readResource(payload, availabilityLabel), availabilityLabel),
    };
  },

  async list_territory_availabilities(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v2/appAvailabilities",
        readAppStoreConnectId(input.appAvailabilityId, "appAvailabilityId"),
        "territoryAvailabilities",
      ),
      label: `${territoryAvailabilityLabel} list`,
      query: { include: "territory" },
    });
    return {
      territoryAvailabilities: page.resources.map(readTerritoryAvailability),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async update_territory_availability(input, context) {
    const territoryAvailabilityId = readAppStoreConnectId(input.territoryAvailabilityId, "territoryAvailabilityId");
    const attributes = {
      available: optionalBoolean(input.available),

      releaseDate: input.releaseDate === null ? null : pickOptionalString(input, "releaseDate"),
      preOrderEnabled: optionalBoolean(input.preOrderEnabled),
    };
    requireAnyAttribute(attributes, "at least one of available, releaseDate or preOrderEnabled must be provided");

    const { payload } = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/territoryAvailabilities", territoryAvailabilityId),
      body: {
        data: {
          type: "territoryAvailabilities",
          id: territoryAvailabilityId,
          attributes: compactObject(attributes),
        },
      },
    });
    return {
      territoryAvailability: readTerritoryAvailability(readResource(payload, territoryAvailabilityLabel)),
    };
  },

  async create_end_app_availability_pre_order(input, context) {
    const territoryAvailabilityIds = readIdentifierList(input.territoryAvailabilityIds, "territoryAvailabilityIds");
    const endAppAvailabilityPreOrder = await createResource(context, {
      path: "/v1/endAppAvailabilityPreOrders",
      type: "endAppAvailabilityPreOrders",
      label: "App Store Connect end app availability pre-order",
      relationships: {
        territoryAvailabilities: toManyLinkage("territoryAvailabilities", territoryAvailabilityIds),
      },
    });
    return { endAppAvailabilityPreOrder, territoryAvailabilityIds };
  },
};

interface ManualPriceInput {
  appPricePointId: string;
  startDate: string | undefined;
  endDate: string | undefined;
}

interface TerritoryAvailabilityInput {
  territoryId: string;
  available: boolean;
  releaseDate: string | undefined;
  preOrderEnabled: boolean | undefined;
}

function inlineResourceId(prefix: string, index: number): string {
  return `\${${prefix}-${index}}`;
}

async function readOptionalRelatedResource(
  context: AppStoreConnectContext,
  path: string,
  label: string,
  query?: Record<string, string | undefined>,
): Promise<Record<string, unknown> | null> {
  let payload: unknown;
  try {
    ({ payload } = await requestAppStoreConnect(context, { path, query }));
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
  return readOptionalRawResource(payload, label);
}

function readAppPriceSchedule(resource: Record<string, unknown>): {
  id: unknown;
  baseTerritoryId: string | null;
} {
  const schedule = normalizeResource(resource, priceScheduleLabel);
  return { id: schedule.id, baseTerritoryId: readRelationshipId(resource, "baseTerritory") };
}

async function listSchedulePrices(
  input: Record<string, unknown>,
  context: AppStoreConnectContext,
  relationship: "manualPrices" | "automaticPrices",
): Promise<Record<string, unknown>> {
  const page = await listResources(context, input, {
    path: resourcePath(
      "/v1/appPriceSchedules",
      readAppStoreConnectId(input.appPriceScheduleId, "appPriceScheduleId"),
      relationship,
    ),
    label: `App Store Connect app price ${relationship} list`,
    query: {
      "filter[territory]": readCommaSeparatedList(input.territoryIds),
      "filter[startDate]": pickOptionalString(input, "startDate"),
      "filter[endDate]": pickOptionalString(input, "endDate"),

      "include": "appPricePoint,territory",
    },
  });
  return {
    [relationship]: page.resources.map((resource) => readAppPrice(resource, page.included)),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

function readAppPrice(resource: Record<string, unknown>, included: IncludedResources): Record<string, unknown> {
  const pricePoint = recordOrEmpty(readIncludedResource(resource, "appPricePoint", included)?.attributes);
  return {
    ...normalizeResource(resource, "App Store Connect app price"),
    appPricePointId: readRelationshipId(resource, "appPricePoint"),
    territoryId: readRelationshipId(resource, "territory"),
    customerPrice: rawStringOrNull(pricePoint.customerPrice),
    proceeds: rawStringOrNull(pricePoint.proceeds),
  };
}

function readAppPricePoint(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, pricePointLabel),
    territoryId: readRelationshipId(resource, "territory"),
  };
}

function readTerritoryAvailability(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, territoryAvailabilityLabel),
    territoryId: readRelationshipId(resource, "territory"),
  };
}

function readManualPriceInputs(value: unknown): ManualPriceInput[] {
  const prices = looseArray(value).map((item, index) => {
    const price = recordOrEmpty(item);
    return {
      appPricePointId: readAppStoreConnectId(price.appPricePointId, `manualPrices[${index}].appPricePointId`),
      startDate: pickOptionalString(price, "startDate"),
      endDate: pickOptionalString(price, "endDate"),
    };
  });
  if (!prices.length) {
    throw new ProviderRequestError(400, "manualPrices must contain at least one price");
  }
  return prices;
}

function readTerritoryAvailabilityInputs(value: unknown): TerritoryAvailabilityInput[] {
  const entries = looseArray(value).map((item, index) => {
    const entry = recordOrEmpty(item);
    const available = optionalBoolean(entry.available);
    if (available === undefined) {
      throw new ProviderRequestError(400, `territoryAvailabilities[${index}].available is required`);
    }
    return {
      territoryId: readAppStoreConnectId(entry.territoryId, `territoryAvailabilities[${index}].territoryId`),
      available,
      releaseDate: pickOptionalString(entry, "releaseDate"),
      preOrderEnabled: optionalBoolean(entry.preOrderEnabled),
    };
  });
  if (!entries.length) {
    throw new ProviderRequestError(400, "territoryAvailabilities must contain at least one territory");
  }
  return entries;
}
