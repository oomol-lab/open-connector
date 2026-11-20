import type { AppStoreConnectContext, AppStoreConnectHandlers } from "./runtime-helpers.ts";

import {
  looseArray,
  rawStringOrNull,
  recordOrEmpty,
  optionalRecord,
  optionalBoolean,
  booleanString,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString, requiredResponseRecord } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getResource,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCollection,
  readCommaSeparatedList,
  readIdentifierList,
  readOptionalAppStoreConnectId,
  readRelationshipId,
  readRelationshipIds,
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

const appInfoLabel = "App Store Connect app info";
const appInfoLocalizationLabel = "App Store Connect app info localization";
const appCategoryLabel = "App Store Connect app category";
const ageRatingDeclarationLabel = "App Store Connect age rating declaration";
const accessibilityDeclarationLabel = "App Store Connect accessibility declaration";
const appEncryptionDeclarationLabel = "App Store Connect app encryption declaration";
const endUserLicenseAgreementLabel = "App Store Connect end user license agreement";
const androidMappingLabel = "App Store Connect Android to iOS app mapping detail";

const categoryRelationships = [
  "primaryCategory",
  "primarySubcategoryOne",
  "primarySubcategoryTwo",
  "secondaryCategory",
  "secondarySubcategoryOne",
  "secondarySubcategoryTwo",
];

const appInfoInclude = categoryRelationships.join(",");

const deprecatedAppInfoAttributes = ["australiaAgeRating", "brazilAgeRatingV2", "franceAgeRating", "koreaAgeRating"];
const deprecatedAgeRatingAttributes = ["ageRatingOverride"];
const deprecatedEncryptionAttributes = [
  "usesEncryption",
  "uploadedDate",
  "documentUrl",
  "documentName",
  "documentType",
];

const ageRatingBooleanAttributes = [
  "advertising",
  "ageAssurance",
  "gambling",
  "healthOrWellnessTopics",
  "lootBox",
  "messagingAndChat",
  "parentalControls",
  "socialMedia",
  "socialMediaAgeRestricted",
  "unrestrictedWebAccess",
  "userGeneratedContent",
];
const ageRatingEnumAttributes = [
  "alcoholTobaccoOrDrugUseOrReferences",
  "contests",
  "gamblingSimulated",
  "gunsOrOtherWeapons",
  "horrorOrFearThemes",
  "matureOrSuggestiveThemes",
  "medicalOrTreatmentInformation",
  "profanityOrCrudeHumor",
  "sexualContentGraphicAndNudity",
  "sexualContentOrNudity",
  "violenceCartoonOrFantasy",
  "violenceRealistic",
  "violenceRealisticProlongedGraphicOrSadistic",
  "ageRatingOverrideV2",
  "koreaAgeRatingOverride",
];
const accessibilityFeatureAttributes = [
  "supportsAudioDescriptions",
  "supportsCaptions",
  "supportsDarkInterface",
  "supportsDifferentiateWithoutColorAlone",
  "supportsLargerText",
  "supportsReducedMotion",
  "supportsSufficientContrast",
  "supportsVoiceControl",
  "supportsVoiceover",
];

export const appStoreConnectAppInfoHandlers: AppStoreConnectHandlers = {
  async update_app(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");

    const attributes = {
      primaryLocale: pickOptionalString(input, "primaryLocale"),
      bundleId: pickOptionalString(input, "bundleId"),
      contentRightsDeclaration: pickOptionalString(input, "contentRightsDeclaration"),
      subscriptionStatusUrl: rawStringOrNull(input.subscriptionStatusUrl),
      subscriptionStatusUrlVersion: pickOptionalString(input, "subscriptionStatusUrlVersion"),
      subscriptionStatusUrlForSandbox: rawStringOrNull(input.subscriptionStatusUrlForSandbox),
      subscriptionStatusUrlVersionForSandbox: pickOptionalString(input, "subscriptionStatusUrlVersionForSandbox"),
      streamlinedPurchasingEnabled: optionalBoolean(input.streamlinedPurchasingEnabled),
      accessibilityUrl: rawStringOrNull(input.accessibilityUrl),
    };
    requireAnyAttribute(attributes, "at least one app attribute to update is required");
    const app = await updateResource(context, {
      path: resourcePath("/v1/apps", appId),
      type: "apps",
      id: appId,
      label: "App Store Connect app",
      attributes,
    });
    return { app };
  },

  async list_app_infos(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appInfos"),
      label: `${appInfoLabel} list`,
      query: { include: appInfoInclude },
    });
    return {
      appInfos: page.resources.map((resource) => readAppInfo(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_info(input, context) {
    return {
      appInfo: await fetchAppInfo(context, readAppStoreConnectId(input.appInfoId, "appInfoId")),
    };
  },

  async update_app_info(input, context) {
    const appInfoId = readAppStoreConnectId(input.appInfoId, "appInfoId");
    const relationships = Object.fromEntries(
      categoryRelationships.map((name) => [
        name,
        toOptionalOneLinkage("appCategories", readOptionalAppStoreConnectId(input[`${name}Id`], `${name}Id`)),
      ]),
    );
    requireAnyAttribute(relationships, "at least one category to assign is required");
    await updateResource(context, {
      path: resourcePath("/v1/appInfos", appInfoId),
      type: "appInfos",
      id: appInfoId,
      label: appInfoLabel,
      relationships,
    });

    return { appInfo: await fetchAppInfo(context, appInfoId) };
  },

  async list_app_info_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/appInfos", readAppStoreConnectId(input.appInfoId, "appInfoId"), "appInfoLocalizations"),
      label: appInfoLocalizationLabel,
      query: { "filter[locale]": readCommaSeparatedList(input.locales) },
    });
    return { appInfoLocalizations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_app_info_localization(input, context) {
    return {
      appInfoLocalization: await getResource(
        context,
        resourcePath(
          "/v1/appInfoLocalizations",
          readAppStoreConnectId(input.appInfoLocalizationId, "appInfoLocalizationId"),
        ),
        appInfoLocalizationLabel,
      ),
    };
  },

  async create_app_info_localization(input, context) {
    const appInfoLocalization = await createResource(context, {
      path: "/v1/appInfoLocalizations",
      type: "appInfoLocalizations",
      label: appInfoLocalizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        name: requiredInputString(input.name, "name"),
        subtitle: pickOptionalString(input, "subtitle"),
        privacyPolicyUrl: pickOptionalString(input, "privacyPolicyUrl"),
        privacyChoicesUrl: pickOptionalString(input, "privacyChoicesUrl"),
        privacyPolicyText: pickOptionalString(input, "privacyPolicyText"),
      },
      relationships: {
        appInfo: toOneLinkage("appInfos", readAppStoreConnectId(input.appInfoId, "appInfoId")),
      },
    });
    return { appInfoLocalization };
  },

  async update_app_info_localization(input, context) {
    const appInfoLocalizationId = readAppStoreConnectId(input.appInfoLocalizationId, "appInfoLocalizationId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      subtitle: rawStringOrNull(input.subtitle),
      privacyPolicyUrl: rawStringOrNull(input.privacyPolicyUrl),
      privacyChoicesUrl: rawStringOrNull(input.privacyChoicesUrl),
      privacyPolicyText: rawStringOrNull(input.privacyPolicyText),
    };
    requireAnyAttribute(attributes, "at least one localization field to update is required");
    const appInfoLocalization = await updateResource(context, {
      path: resourcePath("/v1/appInfoLocalizations", appInfoLocalizationId),
      type: "appInfoLocalizations",
      id: appInfoLocalizationId,
      label: appInfoLocalizationLabel,
      attributes,
    });
    return { appInfoLocalization };
  },

  async delete_app_info_localization(input, context) {
    const appInfoLocalizationId = readAppStoreConnectId(input.appInfoLocalizationId, "appInfoLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/appInfoLocalizations", appInfoLocalizationId),
      `Deleting the ${appInfoLocalizationLabel}`,
    );
    return { id: appInfoLocalizationId, deleted: true };
  },

  async list_app_categories(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/appCategories",
      label: `${appCategoryLabel} list`,
      query: {
        "filter[platforms]": readCommaSeparatedList(input.platforms),
        "exists[parent]": booleanString(input.hasParent),
        ...appCategoryInclude,
      },
    });
    return {
      appCategories: page.resources.map((resource) => readAppCategory(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_category(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/appCategories", readAppStoreConnectId(input.appCategoryId, "appCategoryId")),
      query: appCategoryInclude,
    });
    return { appCategory: readAppCategory(readResource(payload, appCategoryLabel)) };
  },

  async get_age_rating_declaration(input, context) {
    const declaration = await getResource(
      context,
      resourcePath("/v1/appInfos", readAppStoreConnectId(input.appInfoId, "appInfoId"), "ageRatingDeclaration"),
      ageRatingDeclarationLabel,
    );
    return { ageRatingDeclaration: dropAttributes(declaration, deprecatedAgeRatingAttributes) };
  },

  async update_age_rating_declaration(input, context) {
    const ageRatingDeclarationId = readAppStoreConnectId(input.ageRatingDeclarationId, "ageRatingDeclarationId");
    const attributes = {
      ...readBooleanFields(input, ageRatingBooleanAttributes),
      ...readStringFields(input, ageRatingEnumAttributes),

      kidsAgeBand: rawStringOrNull(input.kidsAgeBand),
      developerAgeRatingInfoUrl: rawStringOrNull(input.developerAgeRatingInfoUrl),
    };
    requireAnyAttribute(attributes, "at least one age rating answer to update is required");
    const declaration = await updateResource(context, {
      path: resourcePath("/v1/ageRatingDeclarations", ageRatingDeclarationId),
      type: "ageRatingDeclarations",
      id: ageRatingDeclarationId,
      label: ageRatingDeclarationLabel,
      attributes,
    });
    return { ageRatingDeclaration: dropAttributes(declaration, deprecatedAgeRatingAttributes) };
  },

  async list_accessibility_declarations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "accessibilityDeclarations"),
      label: accessibilityDeclarationLabel,
      query: {
        "filter[deviceFamily]": readCommaSeparatedList(input.deviceFamilies),
        "filter[state]": readCommaSeparatedList(input.states),
      },
    });
    return {
      accessibilityDeclarations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_accessibility_declaration(input, context) {
    return {
      accessibilityDeclaration: await getResource(
        context,
        resourcePath(
          "/v1/accessibilityDeclarations",
          readAppStoreConnectId(input.accessibilityDeclarationId, "accessibilityDeclarationId"),
        ),
        accessibilityDeclarationLabel,
      ),
    };
  },

  async create_accessibility_declaration(input, context) {
    const accessibilityDeclaration = await createResource(context, {
      path: "/v1/accessibilityDeclarations",
      type: "accessibilityDeclarations",
      label: accessibilityDeclarationLabel,
      attributes: {
        deviceFamily: requiredInputString(input.deviceFamily, "deviceFamily"),
        ...readBooleanFields(input, accessibilityFeatureAttributes),
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { accessibilityDeclaration };
  },

  async update_accessibility_declaration(input, context) {
    const accessibilityDeclarationId = readAppStoreConnectId(
      input.accessibilityDeclarationId,
      "accessibilityDeclarationId",
    );
    const attributes = {
      publish: optionalBoolean(input.publish),
      ...readBooleanFields(input, accessibilityFeatureAttributes),
    };
    requireAnyAttribute(attributes, "at least one accessibility declaration field to update is required");
    const accessibilityDeclaration = await updateResource(context, {
      path: resourcePath("/v1/accessibilityDeclarations", accessibilityDeclarationId),
      type: "accessibilityDeclarations",
      id: accessibilityDeclarationId,
      label: accessibilityDeclarationLabel,
      attributes,
    });
    return { accessibilityDeclaration };
  },

  async delete_accessibility_declaration(input, context) {
    const accessibilityDeclarationId = readAppStoreConnectId(
      input.accessibilityDeclarationId,
      "accessibilityDeclarationId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/accessibilityDeclarations", accessibilityDeclarationId),
      `Deleting the ${accessibilityDeclarationLabel}`,
    );
    return { id: accessibilityDeclarationId, deleted: true };
  },

  async list_app_encryption_declarations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appEncryptionDeclarations"),
      label: appEncryptionDeclarationLabel,
      query: {
        "filter[platform]": readCommaSeparatedList(input.platforms),
        "filter[builds]": readCommaSeparatedList(input.buildIds),
      },
    });
    return {
      appEncryptionDeclarations: page.items.map((item) => dropAttributes(item, deprecatedEncryptionAttributes)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_encryption_declaration(input, context) {
    const declaration = await getResource(
      context,
      resourcePath(
        "/v1/appEncryptionDeclarations",
        readAppStoreConnectId(input.appEncryptionDeclarationId, "appEncryptionDeclarationId"),
      ),
      appEncryptionDeclarationLabel,
    );
    return {
      appEncryptionDeclaration: dropAttributes(declaration, deprecatedEncryptionAttributes),
    };
  },

  async create_app_encryption_declaration(input, context) {
    const declaration = await createResource(context, {
      path: "/v1/appEncryptionDeclarations",
      type: "appEncryptionDeclarations",
      label: appEncryptionDeclarationLabel,
      attributes: {
        appDescription: requiredInputString(input.appDescription, "appDescription"),
        containsProprietaryCryptography: requireInputBoolean(
          input.containsProprietaryCryptography,
          "containsProprietaryCryptography",
        ),
        containsThirdPartyCryptography: requireInputBoolean(
          input.containsThirdPartyCryptography,
          "containsThirdPartyCryptography",
        ),
        availableOnFrenchStore: requireInputBoolean(input.availableOnFrenchStore, "availableOnFrenchStore"),
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return {
      appEncryptionDeclaration: dropAttributes(declaration, deprecatedEncryptionAttributes),
    };
  },

  async get_end_user_license_agreement(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");
    let payload: unknown;
    try {
      ({ payload } = await requestAppStoreConnect(context, {
        path: resourcePath("/v1/apps", appId, "endUserLicenseAgreement"),
      }));
    } catch (error) {
      if (isMissingRelatedResourceError(error, "endUserLicenseAgreement")) {
        return { endUserLicenseAgreement: null };
      }
      throw error;
    }
    const envelope = requiredResponseRecord(payload, endUserLicenseAgreementLabel);
    const resource = optionalRecord(envelope.data);
    if (!resource) {
      return { endUserLicenseAgreement: null };
    }
    return {
      endUserLicenseAgreement: await readEndUserLicenseAgreement(
        context,
        normalizeResource(resource, endUserLicenseAgreementLabel),
      ),
    };
  },

  async create_end_user_license_agreement(input, context) {
    const agreement = await createResource(context, {
      path: "/v1/endUserLicenseAgreements",
      type: "endUserLicenseAgreements",
      label: endUserLicenseAgreementLabel,
      attributes: { agreementText: requiredInputString(input.agreementText, "agreementText") },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
        territories: toManyLinkage("territories", readIdentifierList(input.territoryIds, "territoryIds")),
      },
    });
    return { endUserLicenseAgreement: await readEndUserLicenseAgreement(context, agreement) };
  },

  async update_end_user_license_agreement(input, context) {
    const endUserLicenseAgreementId = readAppStoreConnectId(
      input.endUserLicenseAgreementId,
      "endUserLicenseAgreementId",
    );
    const agreementText = pickOptionalString(input, "agreementText");
    const territoryIds = readStringList(input.territoryIds);
    if (agreementText === undefined && !territoryIds?.length) {
      throw new ProviderRequestError(400, "agreementText or territoryIds must be provided");
    }
    const agreement = await updateResource(context, {
      path: resourcePath("/v1/endUserLicenseAgreements", endUserLicenseAgreementId),
      type: "endUserLicenseAgreements",
      id: endUserLicenseAgreementId,
      label: endUserLicenseAgreementLabel,

      attributes: agreementText === undefined ? undefined : { agreementText },
      relationships: {
        territories: territoryIds?.length
          ? toManyLinkage("territories", readIdentifierList(territoryIds, "territoryIds"))
          : undefined,
      },
    });
    return { endUserLicenseAgreement: await readEndUserLicenseAgreement(context, agreement) };
  },

  async delete_end_user_license_agreement(input, context) {
    const endUserLicenseAgreementId = readAppStoreConnectId(
      input.endUserLicenseAgreementId,
      "endUserLicenseAgreementId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/endUserLicenseAgreements", endUserLicenseAgreementId),
      `Deleting the ${endUserLicenseAgreementLabel}`,
    );
    return { id: endUserLicenseAgreementId, deleted: true };
  },

  async list_territories(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/territories",
      label: "App Store Connect territory",
    });
    return { territories: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_app_tags(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "appTags"),
      label: "App Store Connect app tag",
      query: {
        "filter[visibleInAppStore]": booleanString(input.visibleInAppStore),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { appTags: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_android_to_ios_app_mapping_details(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "androidToIosAppMappingDetails"),
      label: androidMappingLabel,
    });
    return {
      androidToIosAppMappingDetails: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_android_to_ios_app_mapping_detail(input, context) {
    return {
      androidToIosAppMappingDetail: await getResource(
        context,
        resourcePath(
          "/v1/androidToIosAppMappingDetails",
          readAppStoreConnectId(input.androidToIosAppMappingDetailId, "androidToIosAppMappingDetailId"),
        ),
        androidMappingLabel,
      ),
    };
  },

  async create_android_to_ios_app_mapping_detail(input, context) {
    const fingerprints = readStringList(input.appSigningKeyPublicCertificateSha256Fingerprints);
    if (!fingerprints?.length) {
      throw new ProviderRequestError(
        400,
        "appSigningKeyPublicCertificateSha256Fingerprints must contain at least one fingerprint",
      );
    }
    const androidToIosAppMappingDetail = await createResource(context, {
      path: "/v1/androidToIosAppMappingDetails",
      type: "androidToIosAppMappingDetails",
      label: androidMappingLabel,
      attributes: {
        packageName: requiredInputString(input.packageName, "packageName"),
        appSigningKeyPublicCertificateSha256Fingerprints: fingerprints,
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { androidToIosAppMappingDetail };
  },

  async update_android_to_ios_app_mapping_detail(input, context) {
    const androidToIosAppMappingDetailId = readAppStoreConnectId(
      input.androidToIosAppMappingDetailId,
      "androidToIosAppMappingDetailId",
    );
    const fingerprints = readStringList(input.appSigningKeyPublicCertificateSha256Fingerprints);
    const attributes = {
      packageName: pickOptionalString(input, "packageName"),

      appSigningKeyPublicCertificateSha256Fingerprints: fingerprints?.length ? fingerprints : undefined,
    };
    requireAnyAttribute(attributes, "at least one Android app mapping field to update is required");
    const androidToIosAppMappingDetail = await updateResource(context, {
      path: resourcePath("/v1/androidToIosAppMappingDetails", androidToIosAppMappingDetailId),
      type: "androidToIosAppMappingDetails",
      id: androidToIosAppMappingDetailId,
      label: androidMappingLabel,
      attributes,
    });
    return { androidToIosAppMappingDetail };
  },

  async delete_android_to_ios_app_mapping_detail(input, context) {
    const androidToIosAppMappingDetailId = readAppStoreConnectId(
      input.androidToIosAppMappingDetailId,
      "androidToIosAppMappingDetailId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/androidToIosAppMappingDetails", androidToIosAppMappingDetailId),
      `Deleting the ${androidMappingLabel}`,
    );
    return { id: androidToIosAppMappingDetailId, deleted: true };
  },
};

const appCategoryInclude = { "include": "parent,subcategories", "limit[subcategories]": "50" };

function readBooleanFields(
  input: Record<string, unknown>,
  keys: readonly string[],
): Record<string, boolean | undefined> {
  return Object.fromEntries(keys.map((key) => [key, optionalBoolean(input[key])]));
}

function readStringFields(input: Record<string, unknown>, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, pickOptionalString(input, key)]));
}

function dropAttributes(resource: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(resource).filter(([key]) => !keys.includes(key)));
}

function readAppInfo(resource: Record<string, unknown>): Record<string, unknown> {
  const appInfo = dropAttributes(normalizeResource(resource, appInfoLabel), deprecatedAppInfoAttributes);
  for (const name of categoryRelationships) {
    appInfo[`${name}Id`] = readRelationshipId(resource, name);
  }
  return appInfo;
}

async function fetchAppInfo(context: AppStoreConnectContext, appInfoId: string): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    path: resourcePath("/v1/appInfos", appInfoId),
    query: { include: appInfoInclude },
  });
  return readAppInfo(readResource(payload, appInfoLabel));
}

function readAppCategory(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, appCategoryLabel),
    parentId: readRelationshipId(resource, "parent"),
    subcategoryIds: readRelationshipIds(resource, "subcategories"),
  };
}

async function readEndUserLicenseAgreement(
  context: AppStoreConnectContext,
  agreement: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    path: resourcePath("/v1/endUserLicenseAgreements", String(agreement.id), "territories"),
    query: { limit: "200" },
  });
  const territoryIds = readCollection(payload, "App Store Connect territory list").map((territory) =>
    String(normalizeResource(territory, "App Store Connect territory").id),
  );
  return { ...agreement, territoryIds };
}

function isMissingRelatedResourceError(error: unknown, relationship: string): boolean {
  if (!(error instanceof ProviderRequestError) || error.status !== 404) {
    return false;
  }
  const needle = relationship.toLowerCase();
  return looseArray(recordOrEmpty(error.details).errors).some((item) => {
    const entry = recordOrEmpty(item);
    return [pickOptionalString(entry, "detail"), pickOptionalString(entry, "title")].some(
      (text) => text?.toLowerCase().includes(needle) ?? false,
    );
  });
}
