import type { AppStoreConnectContext, AppStoreConnectHandlers, IncludedResources } from "./runtime-helpers.ts";

import {
  looseArray,
  recordOrEmpty,
  optionalInteger,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  compactObject,
  optionalBoolean,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getResource,
  indexIncludedResources,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIncludedResource,
  readOptionalAppStoreConnectId,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const priceRelationshipsInclude = "territory,subscriptionPricePoint";

export const appStoreConnectSubscriptionOfferHandlers: AppStoreConnectHandlers = {
  async list_subscription_introductory_offers(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/subscriptions",
        readAppStoreConnectId(input.subscriptionId, "subscriptionId"),
        "introductoryOffers",
      ),
      label: "App Store Connect introductory offer list",
      query: {
        "filter[territory]": readCommaSeparatedList(input.territoryIds),
        "include": priceRelationshipsInclude,
      },
    });
    return {
      subscriptionIntroductoryOffers: page.resources.map((resource) =>
        normalizeIntroductoryOffer(resource, page.included),
      ),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_subscription_introductory_offer(input, context) {
    const { resource, included } = await writeOfferResource(context, {
      method: "POST",
      path: "/v1/subscriptionIntroductoryOffers",
      type: "subscriptionIntroductoryOffers",
      label: "App Store Connect introductory offer",
      attributes: {
        startDate: pickOptionalString(input, "startDate"),
        endDate: pickOptionalString(input, "endDate"),
        duration: requiredInputString(input.duration, "duration"),
        offerMode: requiredInputString(input.offerMode, "offerMode"),
        numberOfPeriods: optionalInteger(input.numberOfPeriods),
        targetSubscriptionPlanType: pickOptionalString(input, "targetSubscriptionPlanType"),
      },
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
        territory: toOptionalOneLinkage("territories", readOptionalAppStoreConnectId(input.territoryId, "territoryId")),
        subscriptionPricePoint: toOptionalOneLinkage(
          "subscriptionPricePoints",
          readOptionalAppStoreConnectId(input.subscriptionPricePointId, "subscriptionPricePointId"),
        ),
      },
    });
    return { subscriptionIntroductoryOffer: normalizeIntroductoryOffer(resource, included) };
  },

  async update_subscription_introductory_offer(input, context) {
    const offerId = readAppStoreConnectId(input.subscriptionIntroductoryOfferId, "subscriptionIntroductoryOfferId");
    const endDate = readNullableText(input.endDate);

    if (endDate === undefined) {
      throw new ProviderRequestError(400, "endDate is required: pass a date to change it or null to remove it");
    }

    const { resource, included } = await writeOfferResource(context, {
      method: "PATCH",
      path: resourcePath("/v1/subscriptionIntroductoryOffers", offerId),
      type: "subscriptionIntroductoryOffers",
      id: offerId,
      label: "App Store Connect introductory offer",
      attributes: { endDate },
    });
    return { subscriptionIntroductoryOffer: normalizeIntroductoryOffer(resource, included) };
  },

  async delete_subscription_introductory_offer(input, context) {
    const offerId = readAppStoreConnectId(input.subscriptionIntroductoryOfferId, "subscriptionIntroductoryOfferId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptionIntroductoryOffers", offerId),
      "Deleting the App Store Connect introductory offer",
    );
    return { id: offerId, deleted: true };
  },

  async list_subscription_promotional_offers(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/subscriptions",
        readAppStoreConnectId(input.subscriptionId, "subscriptionId"),
        "promotionalOffers",
      ),
      label: "App Store Connect promotional offer",
      query: { "filter[territory]": readCommaSeparatedList(input.territoryIds) },
    });
    return {
      subscriptionPromotionalOffers: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_promotional_offer(input, context) {
    return {
      subscriptionPromotionalOffer: await getResource(
        context,
        resourcePath(
          "/v1/subscriptionPromotionalOffers",
          readAppStoreConnectId(input.subscriptionPromotionalOfferId, "subscriptionPromotionalOfferId"),
        ),
        "App Store Connect promotional offer",
      ),
    };
  },

  async create_subscription_promotional_offer(input, context) {
    const prices = readInlinePrices(input.prices, "subscriptionPromotionalOfferPrices", "territory");
    const { offer } = await writeOfferResource(context, {
      method: "POST",
      path: "/v1/subscriptionPromotionalOffers",
      type: "subscriptionPromotionalOffers",
      label: "App Store Connect promotional offer",
      attributes: {
        name: requiredInputString(input.name, "name"),
        offerCode: requiredInputString(input.offerCode, "offerCode"),
        duration: requiredInputString(input.duration, "duration"),
        offerMode: requiredInputString(input.offerMode, "offerMode"),
        numberOfPeriods: optionalInteger(input.numberOfPeriods),
        targetSubscriptionPlanType: pickOptionalString(input, "targetSubscriptionPlanType"),
      },
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
        prices: prices.linkage,
      },
      included: prices.included,
    });
    return { subscriptionPromotionalOffer: offer };
  },

  async update_subscription_promotional_offer(input, context) {
    const offerId = readAppStoreConnectId(input.subscriptionPromotionalOfferId, "subscriptionPromotionalOfferId");
    const prices = readInlinePrices(input.prices, "subscriptionPromotionalOfferPrices", "territory");
    const { offer } = await writeOfferResource(context, {
      method: "PATCH",
      path: resourcePath("/v1/subscriptionPromotionalOffers", offerId),
      type: "subscriptionPromotionalOffers",
      id: offerId,
      label: "App Store Connect promotional offer",
      relationships: { prices: prices.linkage },
      included: prices.included,
    });
    return { subscriptionPromotionalOffer: offer };
  },

  async delete_subscription_promotional_offer(input, context) {
    const offerId = readAppStoreConnectId(input.subscriptionPromotionalOfferId, "subscriptionPromotionalOfferId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptionPromotionalOffers", offerId),
      "Deleting the App Store Connect promotional offer",
    );
    return { id: offerId, deleted: true };
  },

  async list_subscription_promotional_offer_prices(input, context) {
    const page = await listOfferPrices(context, input, {
      path: resourcePath(
        "/v1/subscriptionPromotionalOffers",
        readAppStoreConnectId(input.subscriptionPromotionalOfferId, "subscriptionPromotionalOfferId"),
        "prices",
      ),
      label: "App Store Connect promotional offer price",
    });
    return {
      subscriptionPromotionalOfferPrices: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_subscription_offer_codes(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/subscriptions",
        readAppStoreConnectId(input.subscriptionId, "subscriptionId"),
        "offerCodes",
      ),
      label: "App Store Connect offer code",
      query: { "filter[territory]": readCommaSeparatedList(input.territoryIds) },
    });
    return { subscriptionOfferCodes: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_subscription_offer_code(input, context) {
    return {
      subscriptionOfferCode: await getResource(
        context,
        resourcePath(
          "/v1/subscriptionOfferCodes",
          readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId"),
        ),
        "App Store Connect offer code",
      ),
    };
  },

  async create_subscription_offer_code(input, context) {
    const customerEligibilities = readStringList(input.customerEligibilities);
    if (!customerEligibilities?.length) {
      throw new ProviderRequestError(400, "customerEligibilities must contain at least one customer group");
    }

    const prices = readInlinePrices(input.prices, "subscriptionOfferCodePrices", "territory");
    const { offer } = await writeOfferResource(context, {
      method: "POST",
      path: "/v1/subscriptionOfferCodes",
      type: "subscriptionOfferCodes",
      label: "App Store Connect offer code",
      attributes: {
        name: requiredInputString(input.name, "name"),
        customerEligibilities,
        offerEligibility: requiredInputString(input.offerEligibility, "offerEligibility"),
        duration: requiredInputString(input.duration, "duration"),
        offerMode: requiredInputString(input.offerMode, "offerMode"),
        numberOfPeriods: optionalInteger(input.numberOfPeriods),
        autoRenewEnabled: optionalBoolean(input.autoRenewEnabled),
        targetSubscriptionPlanType: pickOptionalString(input, "targetSubscriptionPlanType"),
      },
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
        prices: prices.linkage,
      },
      included: prices.included,
    });
    return { subscriptionOfferCode: offer };
  },

  async update_subscription_offer_code(input, context) {
    const offerCodeId = readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId");
    const subscriptionOfferCode = await updateResource(context, {
      path: resourcePath("/v1/subscriptionOfferCodes", offerCodeId),
      type: "subscriptionOfferCodes",
      id: offerCodeId,
      label: "App Store Connect offer code",
      attributes: { active: readRequiredBoolean(input.active, "active") },
    });
    return { subscriptionOfferCode };
  },

  async list_subscription_offer_code_prices(input, context) {
    const page = await listOfferPrices(context, input, {
      path: resourcePath(
        "/v1/subscriptionOfferCodes",
        readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId"),
        "prices",
      ),
      label: "App Store Connect offer code price",
    });
    return {
      subscriptionOfferCodePrices: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_subscription_offer_code_custom_codes(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/subscriptionOfferCodes",
        readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId"),
        "customCodes",
      ),
      label: "App Store Connect offer code custom code",
    });
    return {
      subscriptionOfferCodeCustomCodes: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_offer_code_custom_code(input, context) {
    return {
      subscriptionOfferCodeCustomCode: await getResource(
        context,
        resourcePath(
          "/v1/subscriptionOfferCodeCustomCodes",
          readAppStoreConnectId(input.subscriptionOfferCodeCustomCodeId, "subscriptionOfferCodeCustomCodeId"),
        ),
        "App Store Connect offer code custom code",
      ),
    };
  },

  async create_subscription_offer_code_custom_code(input, context) {
    const subscriptionOfferCodeCustomCode = await createResource(context, {
      path: "/v1/subscriptionOfferCodeCustomCodes",
      type: "subscriptionOfferCodeCustomCodes",
      label: "App Store Connect offer code custom code",
      attributes: {
        customCode: requiredInputString(input.customCode, "customCode"),
        numberOfCodes: optionalInteger(input.numberOfCodes),
        expirationDate: pickOptionalString(input, "expirationDate"),
      },
      relationships: {
        offerCode: toOneLinkage(
          "subscriptionOfferCodes",
          readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId"),
        ),
      },
    });
    return { subscriptionOfferCodeCustomCode };
  },

  async update_subscription_offer_code_custom_code(input, context) {
    const customCodeId = readAppStoreConnectId(
      input.subscriptionOfferCodeCustomCodeId,
      "subscriptionOfferCodeCustomCodeId",
    );
    const subscriptionOfferCodeCustomCode = await updateResource(context, {
      path: resourcePath("/v1/subscriptionOfferCodeCustomCodes", customCodeId),
      type: "subscriptionOfferCodeCustomCodes",
      id: customCodeId,
      label: "App Store Connect offer code custom code",
      attributes: { active: readRequiredBoolean(input.active, "active") },
    });
    return { subscriptionOfferCodeCustomCode };
  },

  async list_subscription_offer_code_one_time_use_codes(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/subscriptionOfferCodes",
        readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId"),
        "oneTimeUseCodes",
      ),
      label: "App Store Connect offer code one-time use code",
    });
    return {
      subscriptionOfferCodeOneTimeUseCodes: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_offer_code_one_time_use_code(input, context) {
    return {
      subscriptionOfferCodeOneTimeUseCode: await getResource(
        context,
        resourcePath(
          "/v1/subscriptionOfferCodeOneTimeUseCodes",
          readAppStoreConnectId(input.subscriptionOfferCodeOneTimeUseCodeId, "subscriptionOfferCodeOneTimeUseCodeId"),
        ),
        "App Store Connect offer code one-time use code",
      ),
    };
  },

  async create_subscription_offer_code_one_time_use_code(input, context) {
    const subscriptionOfferCodeOneTimeUseCode = await createResource(context, {
      path: "/v1/subscriptionOfferCodeOneTimeUseCodes",
      type: "subscriptionOfferCodeOneTimeUseCodes",
      label: "App Store Connect offer code one-time use code",
      attributes: {
        numberOfCodes: optionalInteger(input.numberOfCodes),
        expirationDate: requiredInputString(input.expirationDate, "expirationDate"),
        environment: pickOptionalString(input, "environment"),
      },
      relationships: {
        offerCode: toOneLinkage(
          "subscriptionOfferCodes",
          readAppStoreConnectId(input.subscriptionOfferCodeId, "subscriptionOfferCodeId"),
        ),
      },
    });
    return { subscriptionOfferCodeOneTimeUseCode };
  },

  async update_subscription_offer_code_one_time_use_code(input, context) {
    const batchId = readAppStoreConnectId(
      input.subscriptionOfferCodeOneTimeUseCodeId,
      "subscriptionOfferCodeOneTimeUseCodeId",
    );
    const subscriptionOfferCodeOneTimeUseCode = await updateResource(context, {
      path: resourcePath("/v1/subscriptionOfferCodeOneTimeUseCodes", batchId),
      type: "subscriptionOfferCodeOneTimeUseCodes",
      id: batchId,
      label: "App Store Connect offer code one-time use code",
      attributes: { active: readRequiredBoolean(input.active, "active") },
    });
    return { subscriptionOfferCodeOneTimeUseCode };
  },

  async list_win_back_offers(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/subscriptions",
        readAppStoreConnectId(input.subscriptionId, "subscriptionId"),
        "winBackOffers",
      ),
      label: "App Store Connect win-back offer",
    });
    return { winBackOffers: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_win_back_offer(input, context) {
    return {
      winBackOffer: await getResource(
        context,
        resourcePath("/v1/winBackOffers", readAppStoreConnectId(input.winBackOfferId, "winBackOfferId")),
        "App Store Connect win-back offer",
      ),
    };
  },

  async create_win_back_offer(input, context) {
    const timeSinceLastSubscribed = readIntegerRange(input.customerEligibilityTimeSinceLastSubscribedInMonths);
    if (!timeSinceLastSubscribed) {
      throw new ProviderRequestError(400, "customerEligibilityTimeSinceLastSubscribedInMonths is required");
    }

    const prices = readInlinePrices(input.prices, "winBackOfferPrices", "pricePoint");
    const { offer } = await writeOfferResource(context, {
      method: "POST",
      path: "/v1/winBackOffers",
      type: "winBackOffers",
      label: "App Store Connect win-back offer",
      attributes: {
        referenceName: requiredInputString(input.referenceName, "referenceName"),
        offerId: requiredInputString(input.offerId, "offerId"),
        duration: requiredInputString(input.duration, "duration"),
        offerMode: requiredInputString(input.offerMode, "offerMode"),
        periodCount: optionalInteger(input.periodCount),
        customerEligibilityPaidSubscriptionDurationInMonths: optionalInteger(
          input.customerEligibilityPaidSubscriptionDurationInMonths,
        ),
        customerEligibilityTimeSinceLastSubscribedInMonths: timeSinceLastSubscribed,
        customerEligibilityWaitBetweenOffersInMonths: optionalInteger(
          input.customerEligibilityWaitBetweenOffersInMonths,
        ),
        startDate: requiredInputString(input.startDate, "startDate"),
        endDate: pickOptionalString(input, "endDate"),
        priority: requiredInputString(input.priority, "priority"),
        promotionIntent: pickOptionalString(input, "promotionIntent"),
        targetSubscriptionPlanType: pickOptionalString(input, "targetSubscriptionPlanType"),
      },
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
        prices: prices.linkage,
      },
      included: prices.included,
    });
    return { winBackOffer: offer };
  },

  async update_win_back_offer(input, context) {
    const offerId = readAppStoreConnectId(input.winBackOfferId, "winBackOfferId");
    const attributes = compactObject({
      customerEligibilityPaidSubscriptionDurationInMonths: optionalInteger(
        input.customerEligibilityPaidSubscriptionDurationInMonths,
      ),
      customerEligibilityTimeSinceLastSubscribedInMonths: readIntegerRange(
        input.customerEligibilityTimeSinceLastSubscribedInMonths,
      ),
      customerEligibilityWaitBetweenOffersInMonths: readNullableInteger(
        input.customerEligibilityWaitBetweenOffersInMonths,
      ),
      startDate: pickOptionalString(input, "startDate"),
      endDate: readNullableText(input.endDate),
      priority: pickOptionalString(input, "priority"),
      promotionIntent: pickOptionalString(input, "promotionIntent"),
    });
    if (Object.keys(attributes).length === 0) {
      throw new ProviderRequestError(400, "At least one field to change is required besides winBackOfferId");
    }

    const { offer } = await writeOfferResource(context, {
      method: "PATCH",
      path: resourcePath("/v1/winBackOffers", offerId),
      type: "winBackOffers",
      id: offerId,
      label: "App Store Connect win-back offer",
      attributes,
    });
    return { winBackOffer: offer };
  },

  async delete_win_back_offer(input, context) {
    const offerId = readAppStoreConnectId(input.winBackOfferId, "winBackOfferId");
    await deleteResource(
      context,
      resourcePath("/v1/winBackOffers", offerId),
      "Deleting the App Store Connect win-back offer",
    );
    return { id: offerId, deleted: true };
  },

  async list_win_back_offer_prices(input, context) {
    const page = await listOfferPrices(context, input, {
      path: resourcePath("/v1/winBackOffers", readAppStoreConnectId(input.winBackOfferId, "winBackOfferId"), "prices"),
      label: "App Store Connect win-back offer price",
    });
    return { winBackOfferPrices: page.items, nextCursor: page.nextCursor, total: page.total };
  },
};

interface OfferWriteRequest {
  method: "POST" | "PATCH";
  path: string;

  type: string;

  id?: string;
  label: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;

  included?: Array<Record<string, unknown>>;
}

async function writeOfferResource(
  context: AppStoreConnectContext,
  request: OfferWriteRequest,
): Promise<{
  resource: Record<string, unknown>;
  included: IncludedResources;

  offer: Record<string, unknown>;
}> {
  const { payload } = await requestAppStoreConnect(context, {
    method: request.method,
    path: request.path,
    body: compactObject({
      data: compactObject({
        type: request.type,
        id: request.id,
        attributes: request.attributes ? compactObject(request.attributes) : undefined,
        relationships: request.relationships ? compactObject(request.relationships) : undefined,
      }),
      included: request.included,
    }),
  });
  const resource = readResource(payload, request.label);
  return {
    resource,
    included: indexIncludedResources(payload),
    offer: normalizeResource(resource, request.label),
  };
}

function temporaryPriceId(index: number): string {
  return "${price-" + index + "}";
}

function readInlinePrices(
  value: unknown,
  type: string,
  shape: "territory" | "pricePoint",
): {
  linkage: { data: Array<{ type: string; id: string }> };
  included: Array<Record<string, unknown>>;
} {
  const entries = looseArray(value);
  if (entries.length === 0) {
    throw new ProviderRequestError(400, "prices must contain at least one entry");
  }

  const included = entries.map((entry, index) => {
    const price = recordOrEmpty(entry);
    const fieldName = `prices[${index}]`;
    const territoryId =
      shape === "territory" ? readAppStoreConnectId(price.territoryId, `${fieldName}.territoryId`) : undefined;
    const pricePointId =
      shape === "territory"
        ? readOptionalAppStoreConnectId(price.subscriptionPricePointId, `${fieldName}.subscriptionPricePointId`)
        : readAppStoreConnectId(price.subscriptionPricePointId, `${fieldName}.subscriptionPricePointId`);
    return {
      type,
      id: temporaryPriceId(index),
      relationships: compactObject({
        territory: toOptionalOneLinkage("territories", territoryId),
        subscriptionPricePoint: toOptionalOneLinkage("subscriptionPricePoints", pricePointId),
      }),
    };
  });
  return {
    linkage: toManyLinkage(
      type,
      included.map((price) => price.id),
    ),
    included,
  };
}

async function listOfferPrices(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: { path: string; label: string },
): Promise<{
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
  total: number | null;
}> {
  const page = await listResources(context, input, {
    path: request.path,
    label: `${request.label} list`,
    query: {
      "filter[territory]": readCommaSeparatedList(input.territoryIds),
      "include": priceRelationshipsInclude,
    },
  });
  return {
    items: page.resources.map((resource) => ({
      ...normalizeResource(resource, request.label),
      ...readPriceRelationships(resource, page.included),
    })),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

function normalizeIntroductoryOffer(
  resource: Record<string, unknown>,
  included: IncludedResources,
): Record<string, unknown> {
  return {
    ...normalizeResource(resource, "App Store Connect introductory offer"),
    ...readPriceRelationships(resource, included),
  };
}

function readPriceRelationships(
  resource: Record<string, unknown>,
  included: IncludedResources,
): {
  territory: Record<string, unknown> | null;
  subscriptionPricePoint: Record<string, unknown> | null;
} {
  const territory = readIncludedResource(resource, "territory", included);
  const territoryId = readRelationshipId(resource, "territory");
  const pricePoint = readIncludedResource(resource, "subscriptionPricePoint", included);
  const pricePointId = readRelationshipId(resource, "subscriptionPricePoint");
  return {
    territory: territory
      ? readTerritorySummary(territory)
      : territoryId === null
        ? null
        : { id: territoryId, currency: null },
    subscriptionPricePoint: pricePoint
      ? readPricePointSummary(pricePoint)
      : pricePointId === null
        ? null
        : { id: pricePointId, customerPrice: null, proceeds: null, proceedsYear2: null },
  };
}

function readTerritorySummary(resource: Record<string, unknown>): Record<string, unknown> {
  const territory = normalizeResource(resource, "App Store Connect territory");
  return { id: territory.id, currency: rawStringOrNull(territory.currency) };
}

function readPricePointSummary(resource: Record<string, unknown>): Record<string, unknown> {
  const pricePoint = normalizeResource(resource, "App Store Connect subscription price point");
  return {
    id: pricePoint.id,
    customerPrice: rawStringOrNull(pricePoint.customerPrice),
    proceeds: rawStringOrNull(pricePoint.proceeds),
    proceedsYear2: rawStringOrNull(pricePoint.proceedsYear2),
  };
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  const flag = optionalBoolean(value);
  if (flag === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return flag;
}

function readNullableText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  const text = optionalString(value)?.trim();
  return text ? text : undefined;
}

function readNullableInteger(value: unknown): number | null | undefined {
  return value === null ? null : optionalInteger(value);
}

function readIntegerRange(value: unknown): Record<string, number> | undefined {
  const range = optionalRecord(value);
  if (!range) {
    return undefined;
  }
  return compactObject({
    minimum: optionalInteger(range.minimum),
    maximum: optionalInteger(range.maximum),
  }) as Record<string, number>;
}
