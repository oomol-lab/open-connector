import type { AppStoreConnectContext, AppStoreConnectHandlers, IncludedResources } from "./runtime-helpers.ts";

import {
  looseArray,
  rawStringOrNull,
  recordOrEmpty,
  optionalRecord,
  compactObject,
  optionalBoolean,
  booleanString,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  assertNoContent,
  createResource,
  deleteResource,
  getResource,
  hasAnyAttribute,
  indexIncludedResources,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIdentifierList,
  readIncludedResources,
  readOptionalAppStoreConnectId,
  readOptionalResource,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  requireInputBoolean,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const appEventLabel = "App Store Connect in-app event";
const appEventLocalizationLabel = "App Store Connect in-app event localization";
const appClipLabel = "App Store Connect App Clip";
const defaultExperienceLabel = "App Store Connect default App Clip experience";
const defaultExperienceLocalizationLabel = "App Store Connect default App Clip experience localization";
const reviewDetailLabel = "App Store Connect App Clip App Store review detail";
const advancedExperienceLabel = "App Store Connect advanced App Clip experience";
const nominationLabel = "App Store Connect nomination";

const advancedExperienceLocalizationType = "appClipAdvancedExperienceLocalizations";

export const appStoreConnectAppEventClipHandlers: AppStoreConnectHandlers = {
  async list_app_events(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appEvents"),
      label: appEventLabel,
      query: {
        "filter[eventState]": readCommaSeparatedList(input.eventStates),
        "filter[id]": readCommaSeparatedList(input.appEventIds),
      },
    });
    return { appEvents: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_app_event(input, context) {
    return {
      appEvent: await getResource(
        context,
        resourcePath("/v1/appEvents", readAppStoreConnectId(input.appEventId, "appEventId")),
        appEventLabel,
      ),
    };
  },

  async create_app_event(input, context) {
    const appEvent = await createResource(context, {
      path: "/v1/appEvents",
      type: "appEvents",
      label: appEventLabel,
      attributes: {
        referenceName: requiredInputString(input.referenceName, "referenceName"),
        deepLink: pickOptionalString(input, "deepLink"),
        purchaseRequirement: pickOptionalString(input, "purchaseRequirement"),
        ...readAppEventAttributes(input),
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { appEvent };
  },

  async update_app_event(input, context) {
    const appEventId = readAppStoreConnectId(input.appEventId, "appEventId");

    const attributes = {
      referenceName: pickOptionalString(input, "referenceName"),
      deepLink: rawStringOrNull(input.deepLink),
      purchaseRequirement: rawStringOrNull(input.purchaseRequirement),
      ...readAppEventAttributes(input),
    };
    requireAnyAttribute(attributes, "at least one in-app event field to update is required");
    const appEvent = await updateResource(context, {
      path: resourcePath("/v1/appEvents", appEventId),
      type: "appEvents",
      id: appEventId,
      label: appEventLabel,
      attributes,
    });
    return { appEvent };
  },

  async delete_app_event(input, context) {
    const appEventId = readAppStoreConnectId(input.appEventId, "appEventId");
    await deleteResource(context, resourcePath("/v1/appEvents", appEventId), `Deleting the ${appEventLabel}`);
    return { id: appEventId, deleted: true };
  },

  async list_app_event_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/appEvents", readAppStoreConnectId(input.appEventId, "appEventId"), "localizations"),
      label: appEventLocalizationLabel,
    });
    return { appEventLocalizations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_app_event_localization(input, context) {
    return {
      appEventLocalization: await getResource(
        context,
        resourcePath(
          "/v1/appEventLocalizations",
          readAppStoreConnectId(input.appEventLocalizationId, "appEventLocalizationId"),
        ),
        appEventLocalizationLabel,
      ),
    };
  },

  async create_app_event_localization(input, context) {
    const appEventLocalization = await createResource(context, {
      path: "/v1/appEventLocalizations",
      type: "appEventLocalizations",
      label: appEventLocalizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        name: pickOptionalString(input, "name"),
        shortDescription: pickOptionalString(input, "shortDescription"),
        longDescription: pickOptionalString(input, "longDescription"),
      },
      relationships: {
        appEvent: toOneLinkage("appEvents", readAppStoreConnectId(input.appEventId, "appEventId")),
      },
    });
    return { appEventLocalization };
  },

  async update_app_event_localization(input, context) {
    const appEventLocalizationId = readAppStoreConnectId(input.appEventLocalizationId, "appEventLocalizationId");
    const attributes = {
      name: rawStringOrNull(input.name),
      shortDescription: rawStringOrNull(input.shortDescription),
      longDescription: rawStringOrNull(input.longDescription),
    };
    requireAnyAttribute(attributes, "at least one localization field to update is required");
    const appEventLocalization = await updateResource(context, {
      path: resourcePath("/v1/appEventLocalizations", appEventLocalizationId),
      type: "appEventLocalizations",
      id: appEventLocalizationId,
      label: appEventLocalizationLabel,
      attributes,
    });
    return { appEventLocalization };
  },

  async delete_app_event_localization(input, context) {
    const appEventLocalizationId = readAppStoreConnectId(input.appEventLocalizationId, "appEventLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/appEventLocalizations", appEventLocalizationId),
      `Deleting the ${appEventLocalizationLabel}`,
    );
    return { id: appEventLocalizationId, deleted: true };
  },

  async list_app_clips(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appClips"),
      label: appClipLabel,
      query: { "filter[bundleId]": readCommaSeparatedList(input.bundleIds) },
    });
    return { appClips: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_app_clip(input, context) {
    return {
      appClip: await getResource(
        context,
        resourcePath("/v1/appClips", readAppStoreConnectId(input.appClipId, "appClipId")),
        appClipLabel,
      ),
    };
  },

  async list_app_clip_default_experiences(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/appClips",
        readAppStoreConnectId(input.appClipId, "appClipId"),
        "appClipDefaultExperiences",
      ),
      label: `${defaultExperienceLabel} list`,
      query: {
        "exists[releaseWithAppStoreVersion]": booleanString(input.hasReleaseVersion),
        ...defaultExperienceInclude,
      },
    });
    return {
      appClipDefaultExperiences: page.resources.map((resource) => readDefaultExperience(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_clip_default_experience(input, context) {
    return {
      appClipDefaultExperience: await fetchDefaultExperience(
        context,
        readAppStoreConnectId(input.appClipDefaultExperienceId, "appClipDefaultExperienceId"),
      ),
    };
  },

  async create_app_clip_default_experience(input, context) {
    const created = await createResource(context, {
      path: "/v1/appClipDefaultExperiences",
      type: "appClipDefaultExperiences",
      label: defaultExperienceLabel,
      attributes: { action: pickOptionalString(input, "action") },
      relationships: {
        appClip: toOneLinkage("appClips", readAppStoreConnectId(input.appClipId, "appClipId")),
        releaseWithAppStoreVersion: toOptionalOneLinkage(
          "appStoreVersions",
          readOptionalAppStoreConnectId(input.releaseWithAppStoreVersionId, "releaseWithAppStoreVersionId"),
        ),
        appClipDefaultExperienceTemplate: toOptionalOneLinkage(
          "appClipDefaultExperiences",
          readOptionalAppStoreConnectId(input.appClipDefaultExperienceTemplateId, "appClipDefaultExperienceTemplateId"),
        ),
      },
    });

    return {
      appClipDefaultExperience: await fetchDefaultExperience(context, String(created.id)),
    };
  },

  async update_app_clip_default_experience(input, context) {
    const appClipDefaultExperienceId = readAppStoreConnectId(
      input.appClipDefaultExperienceId,
      "appClipDefaultExperienceId",
    );
    const attributes = { action: pickOptionalString(input, "action") };
    const relationships = {
      releaseWithAppStoreVersion: toOptionalOneLinkage(
        "appStoreVersions",
        readOptionalAppStoreConnectId(input.releaseWithAppStoreVersionId, "releaseWithAppStoreVersionId"),
      ),
    };
    requireAnyAttribute(
      { ...attributes, ...relationships },
      "at least one default App Clip experience field to update is required",
    );
    await updateResource(context, {
      path: resourcePath("/v1/appClipDefaultExperiences", appClipDefaultExperienceId),
      type: "appClipDefaultExperiences",
      id: appClipDefaultExperienceId,
      label: defaultExperienceLabel,
      attributes: hasAnyAttribute(attributes) ? attributes : undefined,
      relationships: hasAnyAttribute(relationships) ? relationships : undefined,
    });
    return {
      appClipDefaultExperience: await fetchDefaultExperience(context, appClipDefaultExperienceId),
    };
  },

  async delete_app_clip_default_experience(input, context) {
    const appClipDefaultExperienceId = readAppStoreConnectId(
      input.appClipDefaultExperienceId,
      "appClipDefaultExperienceId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/appClipDefaultExperiences", appClipDefaultExperienceId),
      `Deleting the ${defaultExperienceLabel}`,
    );
    return { id: appClipDefaultExperienceId, deleted: true };
  },

  async set_app_clip_default_experience_release_version(input, context) {
    const appClipDefaultExperienceId = readAppStoreConnectId(
      input.appClipDefaultExperienceId,
      "appClipDefaultExperienceId",
    );
    const appStoreVersionId = readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId");

    const response = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath(
        "/v1/appClipDefaultExperiences",
        appClipDefaultExperienceId,
        "relationships/releaseWithAppStoreVersion",
      ),
      body: toOneLinkage("appStoreVersions", appStoreVersionId),
    });
    assertNoContent(response, [204], `Setting the release version of the ${defaultExperienceLabel}`);
    return { appClipDefaultExperienceId, appStoreVersionId, replaced: true };
  },

  async list_app_clip_default_experience_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/appClipDefaultExperiences",
        readAppStoreConnectId(input.appClipDefaultExperienceId, "appClipDefaultExperienceId"),
        "appClipDefaultExperienceLocalizations",
      ),
      label: defaultExperienceLocalizationLabel,
      query: { "filter[locale]": readCommaSeparatedList(input.locales) },
    });
    return {
      appClipDefaultExperienceLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_clip_default_experience_localization(input, context) {
    return {
      appClipDefaultExperienceLocalization: await getResource(
        context,
        resourcePath(
          "/v1/appClipDefaultExperienceLocalizations",
          readAppStoreConnectId(input.appClipDefaultExperienceLocalizationId, "appClipDefaultExperienceLocalizationId"),
        ),
        defaultExperienceLocalizationLabel,
      ),
    };
  },

  async create_app_clip_default_experience_localization(input, context) {
    const appClipDefaultExperienceLocalization = await createResource(context, {
      path: "/v1/appClipDefaultExperienceLocalizations",
      type: "appClipDefaultExperienceLocalizations",
      label: defaultExperienceLocalizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        subtitle: pickOptionalString(input, "subtitle"),
      },
      relationships: {
        appClipDefaultExperience: toOneLinkage(
          "appClipDefaultExperiences",
          readAppStoreConnectId(input.appClipDefaultExperienceId, "appClipDefaultExperienceId"),
        ),
      },
    });
    return { appClipDefaultExperienceLocalization };
  },

  async update_app_clip_default_experience_localization(input, context) {
    const appClipDefaultExperienceLocalizationId = readAppStoreConnectId(
      input.appClipDefaultExperienceLocalizationId,
      "appClipDefaultExperienceLocalizationId",
    );
    const attributes = { subtitle: rawStringOrNull(input.subtitle) };
    requireAnyAttribute(attributes, "subtitle is required");
    const appClipDefaultExperienceLocalization = await updateResource(context, {
      path: resourcePath("/v1/appClipDefaultExperienceLocalizations", appClipDefaultExperienceLocalizationId),
      type: "appClipDefaultExperienceLocalizations",
      id: appClipDefaultExperienceLocalizationId,
      label: defaultExperienceLocalizationLabel,
      attributes,
    });
    return { appClipDefaultExperienceLocalization };
  },

  async delete_app_clip_default_experience_localization(input, context) {
    const appClipDefaultExperienceLocalizationId = readAppStoreConnectId(
      input.appClipDefaultExperienceLocalizationId,
      "appClipDefaultExperienceLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/appClipDefaultExperienceLocalizations", appClipDefaultExperienceLocalizationId),
      `Deleting the ${defaultExperienceLocalizationLabel}`,
    );
    return { id: appClipDefaultExperienceLocalizationId, deleted: true };
  },

  async get_app_clip_default_experience_review_detail(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/appClipDefaultExperiences",
        readAppStoreConnectId(input.appClipDefaultExperienceId, "appClipDefaultExperienceId"),
        "appClipAppStoreReviewDetail",
      ),
    });
    return { appClipAppStoreReviewDetail: readOptionalResource(payload, reviewDetailLabel) };
  },

  async create_app_clip_app_store_review_detail(input, context) {
    const appClipAppStoreReviewDetail = await createResource(context, {
      path: "/v1/appClipAppStoreReviewDetails",
      type: "appClipAppStoreReviewDetails",
      label: reviewDetailLabel,
      attributes: { invocationUrls: readStringList(input.invocationUrls) },
      relationships: {
        appClipDefaultExperience: toOneLinkage(
          "appClipDefaultExperiences",
          readAppStoreConnectId(input.appClipDefaultExperienceId, "appClipDefaultExperienceId"),
        ),
      },
    });
    return { appClipAppStoreReviewDetail };
  },

  async update_app_clip_app_store_review_detail(input, context) {
    const appClipAppStoreReviewDetailId = readAppStoreConnectId(
      input.appClipAppStoreReviewDetailId,
      "appClipAppStoreReviewDetailId",
    );
    const invocationUrls = readStringList(input.invocationUrls);
    if (!invocationUrls) {
      throw new ProviderRequestError(400, "invocationUrls is required");
    }
    const appClipAppStoreReviewDetail = await updateResource(context, {
      path: resourcePath("/v1/appClipAppStoreReviewDetails", appClipAppStoreReviewDetailId),
      type: "appClipAppStoreReviewDetails",
      id: appClipAppStoreReviewDetailId,
      label: reviewDetailLabel,

      attributes: { invocationUrls },
    });
    return { appClipAppStoreReviewDetail };
  },

  async list_app_clip_advanced_experiences(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/appClips",
        readAppStoreConnectId(input.appClipId, "appClipId"),
        "appClipAdvancedExperiences",
      ),
      label: `${advancedExperienceLabel} list`,
      query: {
        "filter[status]": readCommaSeparatedList(input.statuses),
        "filter[placeStatus]": readCommaSeparatedList(input.placeStatuses),
        "filter[action]": readCommaSeparatedList(input.actions),
        ...advancedExperienceInclude,
      },
    });
    return {
      appClipAdvancedExperiences: page.resources.map((resource) => readAdvancedExperience(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_clip_advanced_experience(input, context) {
    return {
      appClipAdvancedExperience: await fetchAdvancedExperience(
        context,
        readAppStoreConnectId(input.appClipAdvancedExperienceId, "appClipAdvancedExperienceId"),
      ),
    };
  },

  async create_app_clip_advanced_experience(input, context) {
    const localizations = readInlineLocalizations(input.localizations);
    if (!localizations) {
      throw new ProviderRequestError(400, "localizations must contain at least one localization");
    }
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/appClipAdvancedExperiences",
      body: {
        data: {
          type: "appClipAdvancedExperiences",
          attributes: compactObject({
            link: requiredInputString(input.link, "link"),
            defaultLanguage: requiredInputString(input.defaultLanguage, "defaultLanguage"),
            isPoweredBy: requireInputBoolean(input.isPoweredBy, "isPoweredBy"),
            action: pickOptionalString(input, "action"),
            businessCategory: pickOptionalString(input, "businessCategory"),
            place: optionalRecord(input.place),
          }),
          relationships: {
            appClip: toOneLinkage("appClips", readAppStoreConnectId(input.appClipId, "appClipId")),
            headerImage: toOneLinkage(
              "appClipAdvancedExperienceImages",
              readAppStoreConnectId(input.headerImageId, "headerImageId"),
            ),
            localizations: localizations.linkage,
          },
        },
        included: localizations.included,
      },
    });
    const created = normalizeResource(readResource(payload, advancedExperienceLabel), advancedExperienceLabel);

    return {
      appClipAdvancedExperience: await fetchAdvancedExperience(context, String(created.id)),
    };
  },

  async update_app_clip_advanced_experience(input, context) {
    const appClipAdvancedExperienceId = readAppStoreConnectId(
      input.appClipAdvancedExperienceId,
      "appClipAdvancedExperienceId",
    );
    const attributes = compactObject({
      defaultLanguage: pickOptionalString(input, "defaultLanguage"),
      isPoweredBy: optionalBoolean(input.isPoweredBy),
      action: pickOptionalString(input, "action"),
      businessCategory: pickOptionalString(input, "businessCategory"),
      place: optionalRecord(input.place),
    });
    const localizations = readInlineLocalizations(input.localizations);
    const relationships = compactObject({
      headerImage: toOptionalOneLinkage(
        "appClipAdvancedExperienceImages",
        readOptionalAppStoreConnectId(input.headerImageId, "headerImageId"),
      ),
      localizations: localizations?.linkage,
    });
    requireAnyAttribute(
      { ...attributes, ...relationships },
      "at least one advanced App Clip experience field to update is required",
    );
    await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/appClipAdvancedExperiences", appClipAdvancedExperienceId),
      body: {
        data: compactObject({
          type: "appClipAdvancedExperiences",
          id: appClipAdvancedExperienceId,
          attributes: hasAnyAttribute(attributes) ? attributes : undefined,
          relationships: hasAnyAttribute(relationships) ? relationships : undefined,
        }),
        included: localizations?.included,
      },
    });
    return {
      appClipAdvancedExperience: await fetchAdvancedExperience(context, appClipAdvancedExperienceId),
    };
  },

  async delete_app_clip_advanced_experience(input, context) {
    const appClipAdvancedExperienceId = readAppStoreConnectId(
      input.appClipAdvancedExperienceId,
      "appClipAdvancedExperienceId",
    );

    await updateResource(context, {
      path: resourcePath("/v1/appClipAdvancedExperiences", appClipAdvancedExperienceId),
      type: "appClipAdvancedExperiences",
      id: appClipAdvancedExperienceId,
      label: advancedExperienceLabel,
      attributes: { removed: true },
    });
    return { id: appClipAdvancedExperienceId, deleted: true };
  },

  async list_nominations(input, context) {
    const states = readCommaSeparatedList(input.states);

    if (!states) {
      throw new ProviderRequestError(400, "states must contain at least one state");
    }
    const page = await listPage(context, input, {
      path: "/v1/nominations",
      label: nominationLabel,
      query: {
        "filter[state]": states,
        "filter[type]": readCommaSeparatedList(input.types),
        "filter[relatedApps]": readCommaSeparatedList(input.relatedAppIds),
        "filter[hasInAppEvents]": booleanString(input.hasInAppEvents),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { nominations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_nomination(input, context) {
    return {
      nomination: await getResource(
        context,
        resourcePath("/v1/nominations", readAppStoreConnectId(input.nominationId, "nominationId")),
        nominationLabel,
      ),
    };
  },

  async create_nomination(input, context) {
    const nomination = await createResource(context, {
      path: "/v1/nominations",
      type: "nominations",
      label: nominationLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        type: requiredInputString(input.type, "type"),
        description: requiredInputString(input.description, "description"),
        submitted: requireInputBoolean(input.submitted, "submitted"),
        publishStartDate: requiredInputString(input.publishStartDate, "publishStartDate"),
        publishEndDate: pickOptionalString(input, "publishEndDate"),
        notes: pickOptionalString(input, "notes"),
        ...readNominationAttributes(input),
      },
      relationships: {
        relatedApps: toManyLinkage("apps", readIdentifierList(input.relatedAppIds, "relatedAppIds")),
        ...readNominationOptionalRelationships(input),
      },
    });
    return { nomination };
  },

  async update_nomination(input, context) {
    const nominationId = readAppStoreConnectId(input.nominationId, "nominationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      type: pickOptionalString(input, "type"),
      description: pickOptionalString(input, "description"),
      submitted: optionalBoolean(input.submitted),
      archived: optionalBoolean(input.archived),
      publishStartDate: pickOptionalString(input, "publishStartDate"),

      publishEndDate: rawStringOrNull(input.publishEndDate),
      notes: rawStringOrNull(input.notes),
      ...readNominationAttributes(input),
    };
    const relatedAppIds = readStringList(input.relatedAppIds);
    const relationships = {
      relatedApps: relatedAppIds?.length
        ? toManyLinkage("apps", readIdentifierList(relatedAppIds, "relatedAppIds"))
        : undefined,
      ...readNominationOptionalRelationships(input),
    };
    requireAnyAttribute({ ...attributes, ...relationships }, "at least one nomination field to update is required");
    const nomination = await updateResource(context, {
      path: resourcePath("/v1/nominations", nominationId),
      type: "nominations",
      id: nominationId,
      label: nominationLabel,
      attributes: hasAnyAttribute(attributes) ? attributes : undefined,
      relationships: hasAnyAttribute(relationships) ? relationships : undefined,
    });
    return { nomination };
  },

  async delete_nomination(input, context) {
    const nominationId = readAppStoreConnectId(input.nominationId, "nominationId");
    await deleteResource(context, resourcePath("/v1/nominations", nominationId), `Deleting the ${nominationLabel}`);
    return { id: nominationId, deleted: true };
  },
};

const defaultExperienceInclude = { include: "releaseWithAppStoreVersion" };

const advancedExperienceInclude = { "include": "localizations", "limit[localizations]": "50" };

function readObjectList(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? looseArray(value).map((item) => recordOrEmpty(item)) : undefined;
}

function readAppEventAttributes(input: Record<string, unknown>): Record<string, unknown> {
  return {
    badge: pickOptionalString(input, "badge"),
    primaryLocale: pickOptionalString(input, "primaryLocale"),
    priority: pickOptionalString(input, "priority"),
    purpose: pickOptionalString(input, "purpose"),
    territorySchedules: readObjectList(input.territorySchedules),
  };
}

function readNominationAttributes(input: Record<string, unknown>): Record<string, unknown> {
  return {
    deviceFamilies: readStringList(input.deviceFamilies),
    locales: readStringList(input.locales),
    supplementalMaterialsUris: readStringList(input.supplementalMaterialsUris),
    hasInAppEvents: optionalBoolean(input.hasInAppEvents),
    launchInSelectMarketsFirst: optionalBoolean(input.launchInSelectMarketsFirst),
    preOrderEnabled: optionalBoolean(input.preOrderEnabled),
  };
}

function readNominationOptionalRelationships(input: Record<string, unknown>): Record<string, unknown> {
  const inAppEventIds = readStringList(input.inAppEventIds);
  const supportedTerritoryIds = readStringList(input.supportedTerritoryIds);
  return {
    inAppEvents: inAppEventIds?.length
      ? toManyLinkage("appEvents", readIdentifierList(inAppEventIds, "inAppEventIds"))
      : undefined,
    supportedTerritories: supportedTerritoryIds?.length
      ? toManyLinkage("territories", readIdentifierList(supportedTerritoryIds, "supportedTerritoryIds"))
      : undefined,
  };
}

function readDefaultExperience(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, defaultExperienceLabel),
    releaseWithAppStoreVersionId: readRelationshipId(resource, "releaseWithAppStoreVersion"),
  };
}

async function fetchDefaultExperience(
  context: AppStoreConnectContext,
  appClipDefaultExperienceId: string,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    path: resourcePath("/v1/appClipDefaultExperiences", appClipDefaultExperienceId),
    query: defaultExperienceInclude,
  });
  return readDefaultExperience(readResource(payload, defaultExperienceLabel));
}

function readAdvancedExperience(
  resource: Record<string, unknown>,
  included: IncludedResources,
): Record<string, unknown> {
  return {
    ...normalizeResource(resource, advancedExperienceLabel),
    localizations: readIncludedResources(resource, "localizations", included).map((item) => {
      const localization = normalizeResource(item, `${advancedExperienceLabel} localization`);
      return {
        id: localization.id,
        language: rawStringOrNull(localization.language),
        title: rawStringOrNull(localization.title),
        subtitle: rawStringOrNull(localization.subtitle),
      };
    }),
  };
}

async function fetchAdvancedExperience(
  context: AppStoreConnectContext,
  appClipAdvancedExperienceId: string,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    path: resourcePath("/v1/appClipAdvancedExperiences", appClipAdvancedExperienceId),
    query: advancedExperienceInclude,
  });
  return readAdvancedExperience(readResource(payload, advancedExperienceLabel), indexIncludedResources(payload));
}

function readInlineLocalizations(
  value: unknown,
): { linkage: { data: Array<{ type: string; id: string }> }; included: unknown[] } | undefined {
  const items = readObjectList(value);
  if (!items?.length) {
    return undefined;
  }
  const givenIds = items.map((item) => readOptionalAppStoreConnectId(item.id, "localizations.id"));

  const usedIds = new Set(givenIds.filter((id): id is string => id !== undefined));
  let placeholderIndex = 0;
  const nextPlaceholderId = (): string => {
    let id: string;
    do {
      placeholderIndex += 1;
      id = `localization-${placeholderIndex}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  const included = items.map((item, index) => ({
    type: advancedExperienceLocalizationType,
    id: givenIds[index] ?? nextPlaceholderId(),
    attributes: compactObject({
      language: pickOptionalString(item, "language"),
      title: pickOptionalString(item, "title"),
      subtitle: pickOptionalString(item, "subtitle"),
    }),
  }));
  return {
    linkage: toManyLinkage(
      advancedExperienceLocalizationType,
      included.map((item) => item.id),
    ),
    included,
  };
}
