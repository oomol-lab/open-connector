import type { AppStoreConnectContext, AppStoreConnectHandlers, IncludedResources } from "./runtime-helpers.ts";

import {
  looseArray,
  recordOrEmpty,
  optionalInteger,
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
  listPage,
  listResources,
  modifyRelationship,
  normalizeResource,
  readAppStoreConnectId,
  readIdentifierList,
  readIncludedResource,
  readOptionalAppStoreConnectId,
  readOptionalRawResource,
  readOptionalResource,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const inAppPurchaseLabel = "App Store Connect in-app purchase";
const localizationLabel = "App Store Connect in-app purchase localization";
const versionLabel = "App Store Connect in-app purchase version";
const pricePointLabel = "App Store Connect in-app purchase price point";
const priceLabel = "App Store Connect in-app purchase price";
const priceScheduleLabel = "App Store Connect in-app purchase price schedule";
const availabilityLabel = "App Store Connect in-app purchase availability";
const offerCodeLabel = "App Store Connect in-app purchase offer code";
const offerPriceLabel = "App Store Connect in-app purchase offer price";
const customCodeLabel = "App Store Connect in-app purchase offer code custom code";
const oneTimeUseCodeLabel = "App Store Connect in-app purchase offer code one-time-use code";
const promotedPurchaseLabel = "App Store Connect promoted purchase";
const territoryLabel = "App Store Connect territory";

export const appStoreConnectInAppPurchaseHandlers: AppStoreConnectHandlers = {
  async list_in_app_purchases(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "inAppPurchasesV2"),
      label: inAppPurchaseLabel,
      query: {
        "filter[inAppPurchaseType]": pickOptionalString(input, "inAppPurchaseType"),
        "filter[state]": pickOptionalString(input, "state"),
        "filter[name]": pickOptionalString(input, "name"),
        "filter[productId]": pickOptionalString(input, "productId"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { inAppPurchases: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_in_app_purchase(input, context) {
    return {
      inAppPurchase: await getResource(context, inAppPurchasePath(input.inAppPurchaseId), inAppPurchaseLabel),
    };
  },

  async create_in_app_purchase(input, context) {
    const inAppPurchase = await createResource(context, {
      path: "/v2/inAppPurchases",
      type: "inAppPurchases",
      label: inAppPurchaseLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        productId: requiredInputString(input.productId, "productId"),
        inAppPurchaseType: requiredInputString(input.inAppPurchaseType, "inAppPurchaseType"),
        reviewNote: pickOptionalString(input, "reviewNote"),
        familySharable: optionalBoolean(input.familySharable),
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { inAppPurchase };
  },

  async update_in_app_purchase(input, context) {
    const inAppPurchaseId = readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      reviewNote: pickOptionalString(input, "reviewNote"),
      familySharable: optionalBoolean(input.familySharable),
    };
    requireAnyAttribute(attributes, "Provide at least one of name, reviewNote, or familySharable");
    const inAppPurchase = await updateResource(context, {
      path: resourcePath("/v2/inAppPurchases", inAppPurchaseId),
      type: "inAppPurchases",
      id: inAppPurchaseId,
      label: inAppPurchaseLabel,
      attributes,
    });
    return { inAppPurchase };
  },

  async delete_in_app_purchase(input, context) {
    const inAppPurchaseId = readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId");
    await deleteResource(
      context,
      resourcePath("/v2/inAppPurchases", inAppPurchaseId),
      "Deleting the App Store Connect in-app purchase",
    );
    return { id: inAppPurchaseId, deleted: true };
  },

  async list_in_app_purchase_localizations(input, context) {
    const page = await listPage(context, input, {
      path: inAppPurchasePath(input.inAppPurchaseId, "inAppPurchaseLocalizations"),
      label: localizationLabel,
    });
    return { localizations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_in_app_purchase_localization(input, context) {
    return {
      localization: await getResource(
        context,
        resourcePath(
          "/v1/inAppPurchaseLocalizations",
          readAppStoreConnectId(input.inAppPurchaseLocalizationId, "inAppPurchaseLocalizationId"),
        ),
        localizationLabel,
      ),
    };
  },

  async create_in_app_purchase_localization(input, context) {
    const localization = await createResource(context, {
      path: "/v1/inAppPurchaseLocalizations",
      type: "inAppPurchaseLocalizations",
      label: localizationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        locale: requiredInputString(input.locale, "locale"),
        description: pickOptionalString(input, "description"),
      },
      relationships: {
        inAppPurchaseV2: toOneLinkage(
          "inAppPurchases",
          readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId"),
        ),
      },
    });
    return { localization };
  },

  async update_in_app_purchase_localization(input, context) {
    const localizationId = readAppStoreConnectId(input.inAppPurchaseLocalizationId, "inAppPurchaseLocalizationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      description: pickOptionalString(input, "description"),
    };
    requireAnyAttribute(attributes, "Provide at least one of name or description");
    const localization = await updateResource(context, {
      path: resourcePath("/v1/inAppPurchaseLocalizations", localizationId),
      type: "inAppPurchaseLocalizations",
      id: localizationId,
      label: localizationLabel,
      attributes,
    });
    return { localization };
  },

  async delete_in_app_purchase_localization(input, context) {
    const localizationId = readAppStoreConnectId(input.inAppPurchaseLocalizationId, "inAppPurchaseLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/inAppPurchaseLocalizations", localizationId),
      "Deleting the App Store Connect in-app purchase localization",
    );
    return { id: localizationId, deleted: true };
  },

  async list_in_app_purchase_price_points(input, context) {
    const page = await listResources(context, input, {
      path: inAppPurchasePath(input.inAppPurchaseId, "pricePoints"),
      label: `${pricePointLabel} list`,
      query: { "filter[territory]": pickOptionalString(input, "territory"), "include": "territory" },
    });
    return {
      pricePoints: page.resources.map((resource) => readPricePoint(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_in_app_purchase_price_point_equalizations(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/inAppPurchasePricePoints",
        readAppStoreConnectId(input.inAppPurchasePricePointId, "inAppPurchasePricePointId"),
        "equalizations",
      ),
      label: `${pricePointLabel} equalization list`,
      query: {
        "filter[territory]": pickOptionalString(input, "territory"),
        "filter[inAppPurchaseV2]": readOptionalAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId"),
        "include": "territory",
      },
    });
    return {
      pricePoints: page.resources.map((resource) => readPricePoint(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_in_app_purchase_price_schedule(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: inAppPurchasePath(input.inAppPurchaseId, "iapPriceSchedule"),

      query: { include: "baseTerritory" },
    });

    const resource = readOptionalRawResource(payload, priceScheduleLabel);
    return { priceSchedule: resource ? readPriceSchedule(resource) : null };
  },

  async create_in_app_purchase_price_schedule(input, context) {
    const inAppPurchaseId = readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId");
    const baseTerritory = readAppStoreConnectId(input.baseTerritory, "baseTerritory");
    const manualPrices = readManualPrices(input.manualPrices);

    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/inAppPurchasePriceSchedules",
      body: {
        data: {
          type: "inAppPurchasePriceSchedules",
          relationships: {
            inAppPurchase: toOneLinkage("inAppPurchases", inAppPurchaseId),
            baseTerritory: toOneLinkage("territories", baseTerritory),
            manualPrices: toManyLinkage(
              "inAppPurchasePrices",
              manualPrices.map((price) => price.id),
            ),
          },
        },
        included: manualPrices.map((price) => ({
          type: "inAppPurchasePrices",
          id: price.id,

          attributes: compactObject({ startDate: price.startDate ?? null, endDate: price.endDate }),
          relationships: {
            inAppPurchasePricePoint: toOneLinkage("inAppPurchasePricePoints", price.inAppPurchasePricePointId),
          },
        })),
      },
    });
    const resource = readResource(payload, priceScheduleLabel);
    const priceSchedule = readPriceSchedule(resource);

    return {
      priceSchedule: {
        ...priceSchedule,
        baseTerritory: priceSchedule.baseTerritory ?? baseTerritory,
      },
    };
  },

  async list_in_app_purchase_price_schedule_manual_prices(input, context) {
    return listScheduledPrices(context, input, "manualPrices");
  },

  async list_in_app_purchase_price_schedule_automatic_prices(input, context) {
    return listScheduledPrices(context, input, "automaticPrices");
  },

  async get_in_app_purchase_price_schedule_base_territory(input, context) {
    return {
      territory: await getResource(
        context,
        resourcePath(
          "/v1/inAppPurchasePriceSchedules",
          readAppStoreConnectId(input.inAppPurchasePriceScheduleId, "inAppPurchasePriceScheduleId"),
          "baseTerritory",
        ),
        territoryLabel,
      ),
    };
  },

  async get_in_app_purchase_availability(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: inAppPurchasePath(input.inAppPurchaseId, "inAppPurchaseAvailability"),
    });
    return { availability: readOptionalResource(payload, availabilityLabel) };
  },

  async create_in_app_purchase_availability(input, context) {
    const availability = await createResource(context, {
      path: "/v1/inAppPurchaseAvailabilities",
      type: "inAppPurchaseAvailabilities",
      label: availabilityLabel,

      attributes: { availableInNewTerritories: input.availableInNewTerritories === true },
      relationships: {
        inAppPurchase: toOneLinkage("inAppPurchases", readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId")),
        availableTerritories: toManyLinkage(
          "territories",
          readIdentifierList(input.availableTerritories, "availableTerritories"),
        ),
      },
    });
    return { availability };
  },

  async list_in_app_purchase_available_territories(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/inAppPurchaseAvailabilities",
        readAppStoreConnectId(input.inAppPurchaseAvailabilityId, "inAppPurchaseAvailabilityId"),
        "availableTerritories",
      ),
      label: territoryLabel,
    });
    return { territories: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_in_app_purchase_content(input, context) {
    const label = "App Store Connect in-app purchase content";
    const { payload } = await requestAppStoreConnect(context, {
      path: inAppPurchasePath(input.inAppPurchaseId, "content"),
    });
    return { content: readOptionalResource(payload, label) };
  },

  async list_in_app_purchase_versions(input, context) {
    const page = await listPage(context, input, {
      path: inAppPurchasePath(input.inAppPurchaseId, "versions"),
      label: versionLabel,
      query: { "filter[state]": pickOptionalString(input, "state") },
    });
    return { versions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_in_app_purchase_version(input, context) {
    return {
      version: await getResource(
        context,
        resourcePath(
          "/v1/inAppPurchaseVersions",
          readAppStoreConnectId(input.inAppPurchaseVersionId, "inAppPurchaseVersionId"),
        ),
        versionLabel,
      ),
    };
  },

  async create_in_app_purchase_version(input, context) {
    const version = await createResource(context, {
      path: "/v1/inAppPurchaseVersions",
      type: "inAppPurchaseVersions",
      label: versionLabel,
      relationships: {
        inAppPurchase: toOneLinkage("inAppPurchases", readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId")),
      },
    });
    return { version };
  },

  async list_in_app_purchase_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/inAppPurchaseVersions",
        readAppStoreConnectId(input.inAppPurchaseVersionId, "inAppPurchaseVersionId"),
        "localizations",
      ),
      label: localizationLabel,
    });
    return { localizations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_in_app_purchase_version_localization(input, context) {
    return {
      localization: await getResource(
        context,
        resourcePath(
          "/v2/inAppPurchaseLocalizations",
          readAppStoreConnectId(input.inAppPurchaseVersionLocalizationId, "inAppPurchaseVersionLocalizationId"),
        ),
        localizationLabel,
      ),
    };
  },

  async create_in_app_purchase_version_localization(input, context) {
    const localization = await createResource(context, {
      path: "/v2/inAppPurchaseLocalizations",
      type: "inAppPurchaseLocalizations",
      label: localizationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        locale: requiredInputString(input.locale, "locale"),
        description: pickOptionalString(input, "description"),
      },
      relationships: {
        version: toOneLinkage(
          "inAppPurchaseVersions",
          readAppStoreConnectId(input.inAppPurchaseVersionId, "inAppPurchaseVersionId"),
        ),
      },
    });
    return { localization };
  },

  async update_in_app_purchase_version_localization(input, context) {
    const localizationId = readAppStoreConnectId(
      input.inAppPurchaseVersionLocalizationId,
      "inAppPurchaseVersionLocalizationId",
    );
    const attributes = {
      name: pickOptionalString(input, "name"),
      description: pickOptionalString(input, "description"),
    };
    requireAnyAttribute(attributes, "Provide at least one of name or description");
    const localization = await updateResource(context, {
      path: resourcePath("/v2/inAppPurchaseLocalizations", localizationId),
      type: "inAppPurchaseLocalizations",
      id: localizationId,
      label: localizationLabel,
      attributes,
    });
    return { localization };
  },

  async delete_in_app_purchase_version_localization(input, context) {
    const localizationId = readAppStoreConnectId(
      input.inAppPurchaseVersionLocalizationId,
      "inAppPurchaseVersionLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v2/inAppPurchaseLocalizations", localizationId),
      "Deleting the App Store Connect in-app purchase version localization",
    );
    return { id: localizationId, deleted: true };
  },

  async submit_in_app_purchase_for_review(input, context) {
    const inAppPurchaseId = readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId");
    const submission = await createResource(context, {
      path: "/v1/inAppPurchaseSubmissions",
      type: "inAppPurchaseSubmissions",
      label: "App Store Connect in-app purchase submission",
      relationships: { inAppPurchaseV2: toOneLinkage("inAppPurchases", inAppPurchaseId) },
    });
    return { id: submission.id, inAppPurchaseId };
  },

  async list_in_app_purchase_offer_codes(input, context) {
    const page = await listPage(context, input, {
      path: inAppPurchasePath(input.inAppPurchaseId, "offerCodes"),
      label: offerCodeLabel,
      query: { "filter[territory]": pickOptionalString(input, "territory") },
    });
    return { offerCodes: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_in_app_purchase_offer_code(input, context) {
    return {
      offerCode: await getResource(context, offerCodePath(input.inAppPurchaseOfferCodeId), offerCodeLabel),
    };
  },

  async create_in_app_purchase_offer_code(input, context) {
    const prices = readOfferPrices(input.prices);

    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/inAppPurchaseOfferCodes",
      body: {
        data: {
          type: "inAppPurchaseOfferCodes",
          attributes: {
            name: requiredInputString(input.name, "name"),
            customerEligibilities: readStringList(input.customerEligibilities) ?? [],
          },
          relationships: {
            inAppPurchase: toOneLinkage(
              "inAppPurchases",
              readAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId"),
            ),
            prices: toManyLinkage(
              "inAppPurchaseOfferPrices",
              prices.map((price) => price.id),
            ),
          },
        },
        included: prices.map((price) => ({
          type: "inAppPurchaseOfferPrices",
          id: price.id,
          relationships: {
            territory: toOneLinkage("territories", price.territory),
            pricePoint: toOneLinkage("inAppPurchasePricePoints", price.inAppPurchasePricePointId),
          },
        })),
      },
    });
    return { offerCode: normalizeResource(readResource(payload, offerCodeLabel), offerCodeLabel) };
  },

  async update_in_app_purchase_offer_code(input, context) {
    const offerCodeId = readAppStoreConnectId(input.inAppPurchaseOfferCodeId, "inAppPurchaseOfferCodeId");
    const offerCode = await updateResource(context, {
      path: resourcePath("/v1/inAppPurchaseOfferCodes", offerCodeId),
      type: "inAppPurchaseOfferCodes",
      id: offerCodeId,
      label: offerCodeLabel,
      attributes: { active: input.active === true },
    });
    return { offerCode };
  },

  async list_in_app_purchase_offer_code_prices(input, context) {
    const page = await listResources(context, input, {
      path: offerCodePath(input.inAppPurchaseOfferCodeId, "prices"),
      label: `${offerPriceLabel} list`,
      query: {
        "filter[territory]": pickOptionalString(input, "territory"),
        "include": "territory,pricePoint",
      },
    });
    return {
      prices: page.resources.map((resource) => ({
        ...normalizeResource(resource, offerPriceLabel),
        territory: readRelationshipId(resource, "territory"),
        inAppPurchasePricePointId: readRelationshipId(resource, "pricePoint"),
        ...readPricePointAmounts(readIncludedResource(resource, "pricePoint", page.included)),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_in_app_purchase_offer_code_custom_codes(input, context) {
    const page = await listPage(context, input, {
      path: offerCodePath(input.inAppPurchaseOfferCodeId, "customCodes"),
      label: customCodeLabel,
    });
    return { customCodes: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_in_app_purchase_offer_code_custom_code(input, context) {
    const customCode = await createResource(context, {
      path: "/v1/inAppPurchaseOfferCodeCustomCodes",
      type: "inAppPurchaseOfferCodeCustomCodes",
      label: customCodeLabel,
      attributes: {
        customCode: requiredInputString(input.customCode, "customCode"),
        numberOfCodes: optionalInteger(input.numberOfCodes),
        expirationDate: pickOptionalString(input, "expirationDate"),
      },
      relationships: {
        offerCode: toOneLinkage(
          "inAppPurchaseOfferCodes",
          readAppStoreConnectId(input.inAppPurchaseOfferCodeId, "inAppPurchaseOfferCodeId"),
        ),
      },
    });
    return { customCode };
  },

  async update_in_app_purchase_offer_code_custom_code(input, context) {
    const customCodeId = readAppStoreConnectId(
      input.inAppPurchaseOfferCodeCustomCodeId,
      "inAppPurchaseOfferCodeCustomCodeId",
    );
    const customCode = await updateResource(context, {
      path: resourcePath("/v1/inAppPurchaseOfferCodeCustomCodes", customCodeId),
      type: "inAppPurchaseOfferCodeCustomCodes",
      id: customCodeId,
      label: customCodeLabel,
      attributes: { active: input.active === true },
    });
    return { customCode };
  },

  async list_in_app_purchase_offer_code_one_time_use_codes(input, context) {
    const page = await listPage(context, input, {
      path: offerCodePath(input.inAppPurchaseOfferCodeId, "oneTimeUseCodes"),
      label: oneTimeUseCodeLabel,
    });
    return { oneTimeUseCodes: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_in_app_purchase_offer_code_one_time_use_code(input, context) {
    const oneTimeUseCode = await createResource(context, {
      path: "/v1/inAppPurchaseOfferCodeOneTimeUseCodes",
      type: "inAppPurchaseOfferCodeOneTimeUseCodes",
      label: oneTimeUseCodeLabel,
      attributes: {
        numberOfCodes: optionalInteger(input.numberOfCodes),
        expirationDate: requiredInputString(input.expirationDate, "expirationDate"),
        environment: pickOptionalString(input, "environment"),
      },
      relationships: {
        offerCode: toOneLinkage(
          "inAppPurchaseOfferCodes",
          readAppStoreConnectId(input.inAppPurchaseOfferCodeId, "inAppPurchaseOfferCodeId"),
        ),
      },
    });
    return { oneTimeUseCode };
  },

  async update_in_app_purchase_offer_code_one_time_use_code(input, context) {
    const oneTimeUseCodeId = readAppStoreConnectId(
      input.inAppPurchaseOfferCodeOneTimeUseCodeId,
      "inAppPurchaseOfferCodeOneTimeUseCodeId",
    );
    const oneTimeUseCode = await updateResource(context, {
      path: resourcePath("/v1/inAppPurchaseOfferCodeOneTimeUseCodes", oneTimeUseCodeId),
      type: "inAppPurchaseOfferCodeOneTimeUseCodes",
      id: oneTimeUseCodeId,
      label: oneTimeUseCodeLabel,
      attributes: { active: input.active === true },
    });
    return { oneTimeUseCode };
  },

  async list_promoted_purchases(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "promotedPurchases"),
      label: `${promotedPurchaseLabel} list`,

      query: { include: "inAppPurchaseV2,subscription" },
    });
    return {
      promotedPurchases: page.resources.map((resource) => readPromotedPurchase(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_promoted_purchase(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/promotedPurchases",
        readAppStoreConnectId(input.promotedPurchaseId, "promotedPurchaseId"),
      ),
      query: { include: "inAppPurchaseV2,subscription" },
    });
    return { promotedPurchase: readPromotedPurchase(readResource(payload, promotedPurchaseLabel)) };
  },

  async create_promoted_purchase(input, context) {
    const inAppPurchaseId = readOptionalAppStoreConnectId(input.inAppPurchaseId, "inAppPurchaseId");
    const subscriptionId = readOptionalAppStoreConnectId(input.subscriptionId, "subscriptionId");

    if ((inAppPurchaseId === undefined) === (subscriptionId === undefined)) {
      throw new ProviderRequestError(400, "Provide exactly one of inAppPurchaseId or subscriptionId");
    }

    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/promotedPurchases",
      body: {
        data: {
          type: "promotedPurchases",
          attributes: compactObject({
            visibleForAllUsers: input.visibleForAllUsers === true,
            enabled: optionalBoolean(input.enabled),
          }),
          relationships: compactObject({
            app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
            inAppPurchaseV2:
              inAppPurchaseId === undefined ? undefined : toOneLinkage("inAppPurchases", inAppPurchaseId),
            subscription: subscriptionId === undefined ? undefined : toOneLinkage("subscriptions", subscriptionId),
          }),
        },
      },
    });
    const promotedPurchase = readPromotedPurchase(readResource(payload, promotedPurchaseLabel));

    return {
      promotedPurchase: {
        ...promotedPurchase,
        inAppPurchaseId: promotedPurchase.inAppPurchaseId ?? inAppPurchaseId ?? null,
        subscriptionId: promotedPurchase.subscriptionId ?? subscriptionId ?? null,
      },
    };
  },

  async update_promoted_purchase(input, context) {
    const promotedPurchaseId = readAppStoreConnectId(input.promotedPurchaseId, "promotedPurchaseId");
    const attributes = {
      visibleForAllUsers: optionalBoolean(input.visibleForAllUsers),
      enabled: optionalBoolean(input.enabled),
    };
    requireAnyAttribute(attributes, "Provide at least one of visibleForAllUsers or enabled");
    const { payload } = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/promotedPurchases", promotedPurchaseId),
      body: {
        data: {
          type: "promotedPurchases",
          id: promotedPurchaseId,
          attributes: compactObject(attributes),
        },
      },
    });
    return { promotedPurchase: readPromotedPurchase(readResource(payload, promotedPurchaseLabel)) };
  },

  async delete_promoted_purchase(input, context) {
    const promotedPurchaseId = readAppStoreConnectId(input.promotedPurchaseId, "promotedPurchaseId");
    await deleteResource(
      context,
      resourcePath("/v1/promotedPurchases", promotedPurchaseId),
      "Deleting the App Store Connect promoted purchase",
    );
    return { id: promotedPurchaseId, deleted: true };
  },

  async reorder_promoted_purchases(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");
    const promotedPurchaseIds = readIdentifierList(input.promotedPurchaseIds, "promotedPurchaseIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/apps", appId, "relationships/promotedPurchases"),
      type: "promotedPurchases",
      ids: promotedPurchaseIds,
      label: "Reordering the App Store Connect promoted purchases",
    });
    return { appId, promotedPurchaseIds, replaced: true };
  },
};

function inAppPurchasePath(inAppPurchaseId: unknown, suffix?: string): string {
  return resourcePath("/v2/inAppPurchases", readAppStoreConnectId(inAppPurchaseId, "inAppPurchaseId"), suffix);
}

function offerCodePath(offerCodeId: unknown, suffix?: string): string {
  return resourcePath(
    "/v1/inAppPurchaseOfferCodes",
    readAppStoreConnectId(offerCodeId, "inAppPurchaseOfferCodeId"),
    suffix,
  );
}

function readPricePoint(resource: Record<string, unknown>, included: IncludedResources): Record<string, unknown> {
  const territory = readIncludedResource(resource, "territory", included);
  return {
    ...normalizeResource(resource, pricePointLabel),
    territory: readRelationshipId(resource, "territory"),
    currency: territory ? rawStringOrNull(recordOrEmpty(territory.attributes).currency) : null,
  };
}

function readPricePointAmounts(pricePoint: Record<string, unknown> | undefined): {
  customerPrice: string | null;
  proceeds: string | null;
} {
  const attributes = recordOrEmpty(pricePoint?.attributes);
  return {
    customerPrice: rawStringOrNull(attributes.customerPrice),
    proceeds: rawStringOrNull(attributes.proceeds),
  };
}

function readPriceSchedule(resource: Record<string, unknown>): {
  id: unknown;
  baseTerritory: string | null;
} {
  return {
    id: normalizeResource(resource, priceScheduleLabel).id,
    baseTerritory: readRelationshipId(resource, "baseTerritory"),
  };
}

async function listScheduledPrices(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  relationship: "manualPrices" | "automaticPrices",
) {
  const page = await listResources(context, input, {
    path: resourcePath(
      "/v1/inAppPurchasePriceSchedules",
      readAppStoreConnectId(input.inAppPurchasePriceScheduleId, "inAppPurchasePriceScheduleId"),
      relationship,
    ),
    label: `${priceLabel} list`,
    query: {
      "filter[territory]": pickOptionalString(input, "territory"),
      "include": "inAppPurchasePricePoint,territory",
    },
  });
  return {
    prices: page.resources.map((resource) => ({
      ...normalizeResource(resource, priceLabel),
      territory: readRelationshipId(resource, "territory"),
      inAppPurchasePricePointId: readRelationshipId(resource, "inAppPurchasePricePoint"),
      ...readPricePointAmounts(readIncludedResource(resource, "inAppPurchasePricePoint", page.included)),
    })),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

function readManualPrices(value: unknown) {
  return looseArray(value).map((item, index) => {
    const price = recordOrEmpty(item);
    return {
      id: `\${manualPrice${index + 1}}`,
      inAppPurchasePricePointId: readAppStoreConnectId(
        price.inAppPurchasePricePointId,
        "manualPrices.inAppPurchasePricePointId",
      ),
      startDate: pickOptionalString(price, "startDate"),
      endDate: pickOptionalString(price, "endDate"),
    };
  });
}

function readOfferPrices(value: unknown) {
  return looseArray(value).map((item, index) => {
    const price = recordOrEmpty(item);
    return {
      id: `\${offerPrice${index + 1}}`,
      territory: readAppStoreConnectId(price.territory, "prices.territory"),
      inAppPurchasePricePointId: readAppStoreConnectId(
        price.inAppPurchasePricePointId,
        "prices.inAppPurchasePricePointId",
      ),
    };
  });
}

function readPromotedPurchase(resource: Record<string, unknown>): Record<string, unknown> & {
  inAppPurchaseId: string | null;
  subscriptionId: string | null;
} {
  return {
    ...normalizeResource(resource, promotedPurchaseLabel),
    inAppPurchaseId: readRelationshipId(resource, "inAppPurchaseV2"),
    subscriptionId: readRelationshipId(resource, "subscription"),
  };
}
