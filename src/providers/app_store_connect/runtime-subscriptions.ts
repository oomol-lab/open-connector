import type {
  AppStoreConnectContext,
  AppStoreConnectHandlers,
  AppStoreConnectRequest,
  IncludedResources,
} from "./runtime-helpers.ts";

import {
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
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIdentifierList,
  readIncludedResource,
  readOptionalAppStoreConnectId,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const subscriptionGroupLabel = "App Store Connect subscription group";
const subscriptionGroupLocalizationLabel = "App Store Connect subscription group localization";
const subscriptionLabel = "App Store Connect subscription";
const subscriptionLocalizationLabel = "App Store Connect subscription localization";
const subscriptionPriceLabel = "App Store Connect subscription price";
const subscriptionPricePointLabel = "App Store Connect subscription price point";
const subscriptionGracePeriodLabel = "App Store Connect subscription grace period";
const subscriptionPlanAvailabilityLabel = "App Store Connect subscription plan availability";
const subscriptionVersionLabel = "App Store Connect subscription version";
const subscriptionGroupVersionLabel = "App Store Connect subscription group version";

const noIncluded: IncludedResources = new Map();

export const appStoreConnectSubscriptionHandlers: AppStoreConnectHandlers = {
  async list_subscription_groups(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "subscriptionGroups"),
      label: subscriptionGroupLabel,
      query: {
        "filter[referenceName]": pickOptionalString(input, "referenceName"),
        "filter[subscriptions.state]": readCommaSeparatedList(input.subscriptionStates),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { subscriptionGroups: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_subscription_group(input, context) {
    const subscriptionGroupId = readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId");
    return {
      subscriptionGroup: await getResource(
        context,
        resourcePath("/v1/subscriptionGroups", subscriptionGroupId),
        subscriptionGroupLabel,
      ),
    };
  },

  async create_subscription_group(input, context) {
    const subscriptionGroup = await createResource(context, {
      path: "/v1/subscriptionGroups",
      type: "subscriptionGroups",
      label: subscriptionGroupLabel,
      attributes: { referenceName: requiredInputString(input.referenceName, "referenceName") },
      relationships: { app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")) },
    });
    return { subscriptionGroup };
  },

  async update_subscription_group(input, context) {
    const subscriptionGroupId = readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId");
    const subscriptionGroup = await updateResource(context, {
      path: resourcePath("/v1/subscriptionGroups", subscriptionGroupId),
      type: "subscriptionGroups",
      id: subscriptionGroupId,
      label: subscriptionGroupLabel,
      attributes: { referenceName: requiredInputString(input.referenceName, "referenceName") },
    });
    return { subscriptionGroup };
  },

  async delete_subscription_group(input, context) {
    const subscriptionGroupId = readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptionGroups", subscriptionGroupId),
      "Deleting the App Store Connect subscription group",
    );
    return { id: subscriptionGroupId, deleted: true };
  },

  async list_subscription_group_localizations(input, context) {
    const subscriptionGroupId = readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptionGroups", subscriptionGroupId, "subscriptionGroupLocalizations"),
      label: subscriptionGroupLocalizationLabel,
    });
    return {
      subscriptionGroupLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_group_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupLocalizationId, "subscriptionGroupLocalizationId");
    return {
      subscriptionGroupLocalization: await getResource(
        context,
        resourcePath("/v1/subscriptionGroupLocalizations", id),
        subscriptionGroupLocalizationLabel,
      ),
    };
  },

  async create_subscription_group_localization(input, context) {
    const subscriptionGroupLocalization = await createResource(context, {
      path: "/v1/subscriptionGroupLocalizations",
      type: "subscriptionGroupLocalizations",
      label: subscriptionGroupLocalizationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        customAppName: pickOptionalString(input, "customAppName"),
        locale: requiredInputString(input.locale, "locale"),
      },
      relationships: {
        subscriptionGroup: toOneLinkage(
          "subscriptionGroups",
          readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId"),
        ),
      },
    });
    return { subscriptionGroupLocalization };
  },

  async update_subscription_group_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupLocalizationId, "subscriptionGroupLocalizationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      customAppName: pickOptionalString(input, "customAppName"),
    };
    requireAnyAttribute(attributes, "name or customAppName must be provided");
    const subscriptionGroupLocalization = await updateResource(context, {
      path: resourcePath("/v1/subscriptionGroupLocalizations", id),
      type: "subscriptionGroupLocalizations",
      id,
      label: subscriptionGroupLocalizationLabel,
      attributes,
    });
    return { subscriptionGroupLocalization };
  },

  async delete_subscription_group_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupLocalizationId, "subscriptionGroupLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptionGroupLocalizations", id),
      "Deleting the App Store Connect subscription group localization",
    );
    return { id, deleted: true };
  },

  async list_subscriptions(input, context) {
    const subscriptionGroupId = readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId");
    const page = await listResources(context, input, {
      path: resourcePath("/v1/subscriptionGroups", subscriptionGroupId, "subscriptions"),
      label: `${subscriptionLabel} list`,
      query: {
        "filter[name]": pickOptionalString(input, "name"),
        "filter[productId]": pickOptionalString(input, "productId"),
        "filter[state]": readCommaSeparatedList(input.states),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return {
      subscriptions: page.resources.map(readSubscription),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    return {
      subscription: await requestSubscription(context, {
        path: resourcePath("/v1/subscriptions", subscriptionId),
      }),
    };
  },

  async create_subscription(input, context) {
    const subscription = await requestSubscription(context, {
      method: "POST",
      path: "/v1/subscriptions",
      body: {
        data: {
          type: "subscriptions",
          attributes: compactObject({
            name: requiredInputString(input.name, "name"),
            productId: requiredInputString(input.productId, "productId"),
            subscriptionPeriod: pickOptionalString(input, "subscriptionPeriod"),
            familySharable: optionalBoolean(input.familySharable),
            reviewNote: pickOptionalString(input, "reviewNote"),
            groupLevel: optionalInteger(input.groupLevel),
          }),
          relationships: {
            group: toOneLinkage(
              "subscriptionGroups",
              readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId"),
            ),
          },
        },
      },
    });
    return { subscription };
  },

  async update_subscription(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      subscriptionPeriod: pickOptionalString(input, "subscriptionPeriod"),
      familySharable: optionalBoolean(input.familySharable),
      reviewNote: pickOptionalString(input, "reviewNote"),
      groupLevel: optionalInteger(input.groupLevel),
    };
    requireAnyAttribute(
      attributes,
      "at least one of name, subscriptionPeriod, familySharable, reviewNote or groupLevel must be provided",
    );
    const subscription = await requestSubscription(context, {
      method: "PATCH",
      path: resourcePath("/v1/subscriptions", subscriptionId),
      body: {
        data: { type: "subscriptions", id: subscriptionId, attributes: compactObject(attributes) },
      },
    });
    return { subscription };
  },

  async delete_subscription(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptions", subscriptionId),
      "Deleting the App Store Connect subscription",
    );
    return { id: subscriptionId, deleted: true };
  },

  async list_subscription_localizations(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptions", subscriptionId, "subscriptionLocalizations"),
      label: subscriptionLocalizationLabel,
    });
    return {
      subscriptionLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionLocalizationId, "subscriptionLocalizationId");
    return {
      subscriptionLocalization: await getResource(
        context,
        resourcePath("/v1/subscriptionLocalizations", id),
        subscriptionLocalizationLabel,
      ),
    };
  },

  async create_subscription_localization(input, context) {
    const subscriptionLocalization = await createResource(context, {
      path: "/v1/subscriptionLocalizations",
      type: "subscriptionLocalizations",
      label: subscriptionLocalizationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        locale: requiredInputString(input.locale, "locale"),
        description: pickOptionalString(input, "description"),
      },
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
      },
    });
    return { subscriptionLocalization };
  },

  async update_subscription_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionLocalizationId, "subscriptionLocalizationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      description: pickOptionalString(input, "description"),
    };
    requireAnyAttribute(attributes, "name or description must be provided");
    const subscriptionLocalization = await updateResource(context, {
      path: resourcePath("/v1/subscriptionLocalizations", id),
      type: "subscriptionLocalizations",
      id,
      label: subscriptionLocalizationLabel,
      attributes,
    });
    return { subscriptionLocalization };
  },

  async delete_subscription_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionLocalizationId, "subscriptionLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptionLocalizations", id),
      "Deleting the App Store Connect subscription localization",
    );
    return { id, deleted: true };
  },

  async list_subscription_prices(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    const page = await listResources(context, input, {
      path: resourcePath("/v1/subscriptions", subscriptionId, "prices"),
      label: `${subscriptionPriceLabel} list`,
      query: {
        "filter[territory]": pickOptionalString(input, "territory"),
        "filter[planType]": pickOptionalString(input, "planType"),
        "filter[subscriptionPricePoint]": readOptionalAppStoreConnectId(
          input.subscriptionPricePointId,
          "subscriptionPricePointId",
        ),

        "include": "subscriptionPricePoint",
      },
    });
    return {
      subscriptionPrices: page.resources.map((resource) => readSubscriptionPrice(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_subscription_price(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/subscriptionPrices",
      body: {
        data: {
          type: "subscriptionPrices",
          attributes: compactObject({
            startDate: pickOptionalString(input, "startDate"),
            preserveCurrentPrice: optionalBoolean(input.preserveCurrentPrice),
            planType: pickOptionalString(input, "planType"),
          }),
          relationships: compactObject({
            subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
            subscriptionPricePoint: toOneLinkage(
              "subscriptionPricePoints",
              readAppStoreConnectId(input.subscriptionPricePointId, "subscriptionPricePointId"),
            ),
            territory: toOptionalOneLinkage(
              "territories",
              readOptionalAppStoreConnectId(input.territoryId, "territoryId"),
            ),
          }),
        },
      },
    });

    return {
      subscriptionPrice: readSubscriptionPrice(readResource(payload, subscriptionPriceLabel), noIncluded),
    };
  },

  async delete_subscription_price(input, context) {
    const subscriptionPriceId = readAppStoreConnectId(input.subscriptionPriceId, "subscriptionPriceId");
    await deleteResource(
      context,
      resourcePath("/v1/subscriptionPrices", subscriptionPriceId),
      "Deleting the App Store Connect subscription price",
    );
    return { id: subscriptionPriceId, deleted: true };
  },

  async list_subscription_price_points(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    return listPricePoints(context, input, {
      path: resourcePath("/v1/subscriptions", subscriptionId, "pricePoints"),
      query: {
        "filter[territory]": pickOptionalString(input, "territory"),
        "filter[planType]": pickOptionalString(input, "planType"),
        "filter[upfrontPricePointId]": pickOptionalString(input, "upfrontPricePointId"),
      },
    });
  },

  async get_subscription_price_point(input, context) {
    const subscriptionPricePointId = readAppStoreConnectId(input.subscriptionPricePointId, "subscriptionPricePointId");
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/subscriptionPricePoints", subscriptionPricePointId),
    });
    return {
      subscriptionPricePoint: readSubscriptionPricePoint(readResource(payload, subscriptionPricePointLabel)),
    };
  },

  async list_subscription_price_point_equalizations(input, context) {
    return listPricePoints(context, input, {
      path: resourcePath(
        "/v1/subscriptionPricePoints",
        readAppStoreConnectId(input.subscriptionPricePointId, "subscriptionPricePointId"),
        "equalizations",
      ),
      query: readEqualizationFilters(input),
    });
  },

  async list_subscription_price_point_adjusted_equalizations(input, context) {
    return listPricePoints(context, input, {
      path: resourcePath(
        "/v1/subscriptionPricePoints",
        readAppStoreConnectId(input.subscriptionPricePointId, "subscriptionPricePointId"),
        "adjustedEqualizations",
      ),
      query: readEqualizationFilters(input),
    });
  },

  async get_subscription_grace_period(input, context) {
    const appId = readOptionalAppStoreConnectId(input.appId, "appId");
    const subscriptionGracePeriodId = readOptionalAppStoreConnectId(
      input.subscriptionGracePeriodId,
      "subscriptionGracePeriodId",
    );

    if ((appId === undefined) === (subscriptionGracePeriodId === undefined)) {
      throw new ProviderRequestError(400, "exactly one of appId or subscriptionGracePeriodId must be provided");
    }
    const path =
      appId === undefined
        ? resourcePath("/v1/subscriptionGracePeriods", String(subscriptionGracePeriodId))
        : resourcePath("/v1/apps", appId, "subscriptionGracePeriod");
    return {
      subscriptionGracePeriod: await getResource(context, path, subscriptionGracePeriodLabel),
    };
  },

  async update_subscription_grace_period(input, context) {
    const subscriptionGracePeriodId = readAppStoreConnectId(
      input.subscriptionGracePeriodId,
      "subscriptionGracePeriodId",
    );
    const attributes = {
      optIn: optionalBoolean(input.optIn),
      sandboxOptIn: optionalBoolean(input.sandboxOptIn),
      duration: pickOptionalString(input, "duration"),
      renewalType: pickOptionalString(input, "renewalType"),
    };
    requireAnyAttribute(attributes, "at least one of optIn, sandboxOptIn, duration or renewalType must be provided");
    const subscriptionGracePeriod = await updateResource(context, {
      path: resourcePath("/v1/subscriptionGracePeriods", subscriptionGracePeriodId),
      type: "subscriptionGracePeriods",
      id: subscriptionGracePeriodId,
      label: subscriptionGracePeriodLabel,
      attributes,
    });
    return { subscriptionGracePeriod };
  },

  async list_subscription_plan_availabilities(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptions", subscriptionId, "planAvailabilities"),
      label: subscriptionPlanAvailabilityLabel,
    });
    return {
      subscriptionPlanAvailabilities: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_plan_availability(input, context) {
    const id = readAppStoreConnectId(input.subscriptionPlanAvailabilityId, "subscriptionPlanAvailabilityId");
    return {
      subscriptionPlanAvailability: await getResource(
        context,
        resourcePath("/v1/subscriptionPlanAvailabilities", id),
        subscriptionPlanAvailabilityLabel,
      ),
    };
  },

  async create_subscription_plan_availability(input, context) {
    const subscriptionPlanAvailability = await createResource(context, {
      path: "/v1/subscriptionPlanAvailabilities",
      type: "subscriptionPlanAvailabilities",
      label: subscriptionPlanAvailabilityLabel,
      attributes: {
        planType: requiredInputString(input.planType, "planType"),
        availableInNewTerritories: optionalBoolean(input.availableInNewTerritories),
      },
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
        availableTerritories: toManyLinkage(
          "territories",
          readIdentifierList(input.availableTerritoryIds, "availableTerritoryIds"),
        ),
      },
    });
    return { subscriptionPlanAvailability };
  },

  async update_subscription_plan_availability(input, context) {
    const id = readAppStoreConnectId(input.subscriptionPlanAvailabilityId, "subscriptionPlanAvailabilityId");
    const availableInNewTerritories = optionalBoolean(input.availableInNewTerritories);
    const availableTerritoryIds = readStringList(input.availableTerritoryIds);
    requireAnyAttribute(
      { availableInNewTerritories, availableTerritoryIds },
      "availableTerritoryIds or availableInNewTerritories must be provided",
    );
    const subscriptionPlanAvailability = await updateResource(context, {
      path: resourcePath("/v1/subscriptionPlanAvailabilities", id),
      type: "subscriptionPlanAvailabilities",
      id,
      label: subscriptionPlanAvailabilityLabel,
      attributes: { availableInNewTerritories },
      relationships: {
        availableTerritories:
          availableTerritoryIds === undefined
            ? undefined
            : toManyLinkage("territories", readIdentifierList(availableTerritoryIds, "availableTerritoryIds")),
      },
    });
    return { subscriptionPlanAvailability };
  },

  async list_subscription_plan_availability_territories(input, context) {
    const id = readAppStoreConnectId(input.subscriptionPlanAvailabilityId, "subscriptionPlanAvailabilityId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptionPlanAvailabilities", id, "availableTerritories"),
      label: "App Store Connect territory",
    });
    return { territories: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_subscription_versions(input, context) {
    const subscriptionId = readAppStoreConnectId(input.subscriptionId, "subscriptionId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptions", subscriptionId, "versions"),
      label: subscriptionVersionLabel,
      query: { "filter[state]": readCommaSeparatedList(input.states) },
    });
    return { subscriptionVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_subscription_version(input, context) {
    const id = readAppStoreConnectId(input.subscriptionVersionId, "subscriptionVersionId");
    return {
      subscriptionVersion: await getResource(
        context,
        resourcePath("/v1/subscriptionVersions", id),
        subscriptionVersionLabel,
      ),
    };
  },

  async create_subscription_version(input, context) {
    const subscriptionVersion = await createResource(context, {
      path: "/v1/subscriptionVersions",
      type: "subscriptionVersions",
      label: subscriptionVersionLabel,
      relationships: {
        subscription: toOneLinkage("subscriptions", readAppStoreConnectId(input.subscriptionId, "subscriptionId")),
      },
    });
    return { subscriptionVersion };
  },

  async list_subscription_version_localizations(input, context) {
    const id = readAppStoreConnectId(input.subscriptionVersionId, "subscriptionVersionId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptionVersions", id, "localizations"),
      label: subscriptionLocalizationLabel,
    });
    return {
      subscriptionLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_version_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionLocalizationId, "subscriptionLocalizationId");
    return {
      subscriptionLocalization: await getResource(
        context,
        resourcePath("/v2/subscriptionLocalizations", id),
        subscriptionLocalizationLabel,
      ),
    };
  },

  async create_subscription_version_localization(input, context) {
    const subscriptionLocalization = await createResource(context, {
      path: "/v2/subscriptionLocalizations",
      type: "subscriptionLocalizations",
      label: subscriptionLocalizationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        locale: requiredInputString(input.locale, "locale"),
        description: pickOptionalString(input, "description"),
      },
      relationships: {
        version: toOneLinkage(
          "subscriptionVersions",
          readAppStoreConnectId(input.subscriptionVersionId, "subscriptionVersionId"),
        ),
      },
    });
    return { subscriptionLocalization };
  },

  async update_subscription_version_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionLocalizationId, "subscriptionLocalizationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      description: pickOptionalString(input, "description"),
    };
    requireAnyAttribute(attributes, "name or description must be provided");
    const subscriptionLocalization = await updateResource(context, {
      path: resourcePath("/v2/subscriptionLocalizations", id),
      type: "subscriptionLocalizations",
      id,
      label: subscriptionLocalizationLabel,
      attributes,
    });
    return { subscriptionLocalization };
  },

  async delete_subscription_version_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionLocalizationId, "subscriptionLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v2/subscriptionLocalizations", id),
      "Deleting the App Store Connect subscription version localization",
    );
    return { id, deleted: true };
  },

  async list_subscription_group_versions(input, context) {
    const subscriptionGroupId = readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptionGroups", subscriptionGroupId, "versions"),
      label: subscriptionGroupVersionLabel,
      query: { "filter[state]": readCommaSeparatedList(input.states) },
    });
    return {
      subscriptionGroupVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_group_version(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupVersionId, "subscriptionGroupVersionId");
    return {
      subscriptionGroupVersion: await getResource(
        context,
        resourcePath("/v1/subscriptionGroupVersions", id),
        subscriptionGroupVersionLabel,
      ),
    };
  },

  async create_subscription_group_version(input, context) {
    const subscriptionGroupVersion = await createResource(context, {
      path: "/v1/subscriptionGroupVersions",
      type: "subscriptionGroupVersions",
      label: subscriptionGroupVersionLabel,
      relationships: {
        subscriptionGroup: toOneLinkage(
          "subscriptionGroups",
          readAppStoreConnectId(input.subscriptionGroupId, "subscriptionGroupId"),
        ),
      },
    });
    return { subscriptionGroupVersion };
  },

  async list_subscription_group_version_localizations(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupVersionId, "subscriptionGroupVersionId");
    const page = await listPage(context, input, {
      path: resourcePath("/v1/subscriptionGroupVersions", id, "localizations"),
      label: subscriptionGroupLocalizationLabel,
    });
    return {
      subscriptionGroupLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_subscription_group_version_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupLocalizationId, "subscriptionGroupLocalizationId");
    return {
      subscriptionGroupLocalization: await getResource(
        context,
        resourcePath("/v2/subscriptionGroupLocalizations", id),
        subscriptionGroupLocalizationLabel,
      ),
    };
  },

  async create_subscription_group_version_localization(input, context) {
    const subscriptionGroupLocalization = await createResource(context, {
      path: "/v2/subscriptionGroupLocalizations",
      type: "subscriptionGroupLocalizations",
      label: subscriptionGroupLocalizationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        customAppName: pickOptionalString(input, "customAppName"),
        locale: requiredInputString(input.locale, "locale"),
      },
      relationships: {
        version: toOneLinkage(
          "subscriptionGroupVersions",
          readAppStoreConnectId(input.subscriptionGroupVersionId, "subscriptionGroupVersionId"),
        ),
      },
    });
    return { subscriptionGroupLocalization };
  },

  async update_subscription_group_version_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupLocalizationId, "subscriptionGroupLocalizationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      customAppName: pickOptionalString(input, "customAppName"),
    };
    requireAnyAttribute(attributes, "name or customAppName must be provided");
    const subscriptionGroupLocalization = await updateResource(context, {
      path: resourcePath("/v2/subscriptionGroupLocalizations", id),
      type: "subscriptionGroupLocalizations",
      id,
      label: subscriptionGroupLocalizationLabel,
      attributes,
    });
    return { subscriptionGroupLocalization };
  },

  async delete_subscription_group_version_localization(input, context) {
    const id = readAppStoreConnectId(input.subscriptionGroupLocalizationId, "subscriptionGroupLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v2/subscriptionGroupLocalizations", id),
      "Deleting the App Store Connect subscription group version localization",
    );
    return { id, deleted: true };
  },
};

async function requestSubscription(
  context: AppStoreConnectContext,
  request: AppStoreConnectRequest,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, request);
  return readSubscription(readResource(payload, subscriptionLabel));
}

function readSubscription(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, subscriptionLabel),
    subscriptionGroupId: readRelationshipId(resource, "group"),
  };
}

function readSubscriptionPrice(
  resource: Record<string, unknown>,
  included: IncludedResources,
): Record<string, unknown> {
  const pricePoint = readIncludedResource(resource, "subscriptionPricePoint", included);
  const pricePointId = readRelationshipId(resource, "subscriptionPricePoint");
  return {
    ...normalizeResource(resource, subscriptionPriceLabel),
    territoryId: readRelationshipId(resource, "territory"),

    subscriptionPricePoint: pricePoint
      ? readPricePointSummary(normalizeResource(pricePoint, subscriptionPricePointLabel))
      : pricePointId === null
        ? null
        : readPricePointSummary({ id: pricePointId }),
  };
}

function readPricePointSummary(pricePoint: Record<string, unknown>): Record<string, unknown> {
  return {
    id: pricePoint.id,
    customerPrice: rawStringOrNull(pricePoint.customerPrice),
    proceeds: rawStringOrNull(pricePoint.proceeds),
    proceedsYear2: rawStringOrNull(pricePoint.proceedsYear2),
  };
}

function readSubscriptionPricePoint(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, subscriptionPricePointLabel),
    territoryId: readRelationshipId(resource, "territory"),
  };
}

async function listPricePoints(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: { path: string; query: Record<string, string | undefined> },
): Promise<Record<string, unknown>> {
  const page = await listResources(context, input, {
    path: request.path,
    label: `${subscriptionPricePointLabel} list`,
    query: request.query,
  });
  return {
    subscriptionPricePoints: page.resources.map(readSubscriptionPricePoint),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

function readEqualizationFilters(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "filter[territory]": pickOptionalString(input, "territory"),
    "filter[subscription]": readOptionalAppStoreConnectId(input.subscriptionId, "subscriptionId"),
    "filter[planType]": pickOptionalString(input, "planType"),
    "filter[upfrontPricePointId]": pickOptionalString(input, "upfrontPricePointId"),
  };
}
