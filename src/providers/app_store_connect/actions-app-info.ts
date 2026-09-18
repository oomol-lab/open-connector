import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appResource,
  clearableString,
  clearableUrl,
  contentPlatforms,
  contentRightsDeclarations,
  deletedOutput,
  deviceFamilies,
  manageAppStoreRoles,
  nonEmptyString,
  nullableEnum,
  nullableStringArray,
  pageOutput,
  paginationInputs,
  resourceObject,
  subscriptionStatusUrlVersions,
  territoryResource,
} from "./schemas.ts";

export const appInfoStates: readonly string[] = [
  "ACCEPTED",
  "DEVELOPER_REJECTED",
  "IN_REVIEW",
  "PENDING_RELEASE",
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_DISTRIBUTION",
  "READY_FOR_REVIEW",
  "REJECTED",
  "REPLACED_WITH_NEW_INFO",
  "WAITING_FOR_REVIEW",
];

export const appInfoAppStoreStates: readonly string[] = [
  "ACCEPTED",
  "DEVELOPER_REMOVED_FROM_SALE",
  "DEVELOPER_REJECTED",
  "IN_REVIEW",
  "INVALID_BINARY",
  "METADATA_REJECTED",
  "PENDING_APPLE_RELEASE",
  "PENDING_CONTRACT",
  "PENDING_DEVELOPER_RELEASE",
  "PREPARE_FOR_SUBMISSION",
  "PREORDER_READY_FOR_SALE",
  "PROCESSING_FOR_APP_STORE",
  "READY_FOR_REVIEW",
  "READY_FOR_SALE",
  "REJECTED",
  "REMOVED_FROM_SALE",
  "WAITING_FOR_EXPORT_COMPLIANCE",
  "WAITING_FOR_REVIEW",
  "REPLACED_WITH_NEW_VERSION",
  "NOT_APPLICABLE",
];
export const appStoreAgeRatings: readonly string[] = [
  "L",
  "ALL",
  "ZERO_ZERO",
  "ONE_PLUS",
  "TWO_PLUS",
  "THREE_PLUS",
  "FOUR_PLUS",
  "FIVE_PLUS",
  "SIX_PLUS",
  "SEVEN_PLUS",
  "EIGHT_PLUS",
  "NINE_PLUS",
  "TEN_PLUS",
  "ELEVEN_PLUS",
  "TWELVE_PLUS",
  "THIRTEEN_PLUS",
  "FOURTEEN_PLUS",
  "FIFTEEN_PLUS",
  "SIXTEEN_PLUS",
  "SEVENTEEN_PLUS",
  "EIGHTEEN_PLUS",
  "NINETEEN_PLUS",
  "TWENTY_PLUS",
  "TWENTY_ONE_PLUS",
  "UNRATED",
];
export const brazilAgeRatings: readonly string[] = ["L", "TEN", "TWELVE", "FOURTEEN", "SIXTEEN", "EIGHTEEN"];
export const kidsAgeBands: readonly string[] = ["FIVE_AND_UNDER", "SIX_TO_EIGHT", "NINE_TO_ELEVEN"];

export const ageRatingFrequencies: readonly string[] = [
  "NONE",
  "INFREQUENT_OR_MILD",
  "FREQUENT_OR_INTENSE",
  "INFREQUENT",
  "FREQUENT",
];
export const ageRatingOverrides: readonly string[] = [
  "NONE",
  "NINE_PLUS",
  "THIRTEEN_PLUS",
  "SIXTEEN_PLUS",
  "EIGHTEEN_PLUS",
  "UNRATED",
];
export const koreaAgeRatingOverrides: readonly string[] = ["NONE", "FIFTEEN_PLUS", "NINETEEN_PLUS"];
export const accessibilityDeclarationStates: readonly string[] = ["DRAFT", "PUBLISHED", "REPLACED"];
export const appEncryptionDeclarationStates: readonly string[] = [
  "CREATED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "INVALID",
  "EXPIRED",
];

const platformArray = (description: string) =>
  s.array(description, s.stringEnum("A content platform.", contentPlatforms), { minItems: 1 });

const categoryIdOutputs = {
  primaryCategoryId: s.nullableString(
    "Identifier of the primary App Store category, such as GAMES, or null when none is set.",
  ),
  primarySubcategoryOneId: s.nullableString(
    "Identifier of the first primary subcategory, used when the primary category is Games or Stickers.",
  ),
  primarySubcategoryTwoId: s.nullableString("Identifier of the second primary subcategory, or null when none is set."),
  secondaryCategoryId: s.nullableString("Identifier of the secondary App Store category, or null when none is set."),
  secondarySubcategoryOneId: s.nullableString(
    "Identifier of the first secondary subcategory, or null when none is set.",
  ),
  secondarySubcategoryTwoId: s.nullableString(
    "Identifier of the second secondary subcategory, or null when none is set.",
  ),
};

export const appInfoResource: JsonSchema = resourceObject(
  "App-level App Store information shared by every version of the app.",
  "App Store Connect identifier for the app info record.",
  {
    state: nullableEnum("Review state of this app info record.", appInfoStates),
    appStoreState: nullableEnum("App Store state of the app the record belongs to.", appInfoAppStoreStates),
    appStoreAgeRating: nullableEnum(
      "Age rating App Store Connect derived from the age rating declaration.",
      appStoreAgeRatings,
    ),
    brazilAgeRating: nullableEnum("Age rating shown on the Brazil storefront.", brazilAgeRatings),
    kidsAgeBand: nullableEnum("Kids age band when the app is in the Kids category, otherwise null.", kidsAgeBands),
    ...categoryIdOutputs,
  },
  Object.keys(categoryIdOutputs),
);

export const appInfoLocalizationResource: JsonSchema = resourceObject(
  "Localized app-level App Store information for one locale.",
  "App Store Connect identifier for the app info localization.",
  {
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    name: s.nullableString("App name shown on the App Store in this locale."),
    subtitle: s.nullableString("Subtitle shown under the app name in this locale."),
    privacyPolicyUrl: s.nullableString("Privacy policy URL published for this locale."),
    privacyChoicesUrl: s.nullableString("URL where users can manage their privacy choices, published for this locale."),
    privacyPolicyText: s.nullableString("Privacy policy text shown on Apple TV, where a URL cannot be opened."),
  },
);

export const appCategoryResource: JsonSchema = resourceObject(
  "An App Store category or subcategory.",
  "Category identifier used in category relationships, such as GAMES or GAMES_ACTION.",
  {
    platforms: s.nullable(
      s.array("Content platforms the category is offered on.", s.stringEnum("A content platform.", contentPlatforms)),
    ),
    parentId: s.nullableString("Identifier of the parent category, or null for a top-level category."),
    subcategoryIds: nullableStringArray(
      "Identifiers of the subcategories under this category; empty for a subcategory.",
      "App Store category identifier.",
    ),
  },
  ["parentId", "subcategoryIds"],
);

const frequency = (description: string) => nullableEnum(description, ageRatingFrequencies);

export const ageRatingDeclarationResource: JsonSchema = resourceObject(
  "The age rating questionnaire answers for an app info record.",
  "App Store Connect identifier for the age rating declaration.",
  {
    advertising: s.nullableBoolean("Whether the app shows advertising."),
    ageAssurance: s.nullableBoolean("Whether the app performs age assurance."),
    alcoholTobaccoOrDrugUseOrReferences: frequency("How often alcohol, tobacco, or drug use or references appear."),
    contests: frequency("How often contests appear."),
    gambling: s.nullableBoolean("Whether the app offers real gambling."),
    gamblingSimulated: frequency("How often simulated gambling appears."),
    gunsOrOtherWeapons: frequency("How often guns or other weapons appear."),
    healthOrWellnessTopics: s.nullableBoolean("Whether the app covers health or wellness topics."),
    horrorOrFearThemes: frequency("How often horror or fear themes appear."),
    kidsAgeBand: nullableEnum("Kids age band the app is designed for, or null.", kidsAgeBands),
    lootBox: s.nullableBoolean("Whether the app sells loot boxes or similar random rewards."),
    matureOrSuggestiveThemes: frequency("How often mature or suggestive themes appear."),
    medicalOrTreatmentInformation: frequency("How often medical or treatment information appears."),
    messagingAndChat: s.nullableBoolean("Whether the app offers messaging or chat."),
    parentalControls: s.nullableBoolean("Whether the app offers parental controls."),
    profanityOrCrudeHumor: frequency("How often profanity or crude humor appears."),
    sexualContentGraphicAndNudity: frequency("How often graphic sexual content or nudity appears."),
    sexualContentOrNudity: frequency("How often sexual content or nudity appears."),
    socialMedia: s.nullableBoolean("Whether the app includes social media features."),
    socialMediaAgeRestricted: s.nullableBoolean("Whether the social media features are restricted by age."),
    unrestrictedWebAccess: s.nullableBoolean("Whether the app offers unrestricted web access."),
    userGeneratedContent: s.nullableBoolean("Whether the app shows user-generated content."),
    violenceCartoonOrFantasy: frequency("How often cartoon or fantasy violence appears."),
    violenceRealistic: frequency("How often realistic violence appears."),
    violenceRealisticProlongedGraphicOrSadistic: frequency(
      "How often prolonged graphic or sadistic realistic violence appears.",
    ),
    ageRatingOverrideV2: nullableEnum("Manual override raising the derived age rating, or NONE.", ageRatingOverrides),
    koreaAgeRatingOverride: nullableEnum("Manual override of the Korea age rating, or NONE.", koreaAgeRatingOverrides),
    developerAgeRatingInfoUrl: s.nullableString(
      "URL with more information about the age rating, published on the product page.",
    ),
  },
);

const accessibilityFeatureDescriptions: Record<string, string> = {
  supportsAudioDescriptions: "Whether the app supports audio descriptions.",
  supportsCaptions: "Whether the app supports captions.",
  supportsDarkInterface: "Whether the app supports a dark interface.",
  supportsDifferentiateWithoutColorAlone: "Whether the app conveys information without relying on color alone.",
  supportsLargerText: "Whether the app supports larger text.",
  supportsReducedMotion: "Whether the app supports reduced motion.",
  supportsSufficientContrast: "Whether the app supports sufficient contrast.",
  supportsVoiceControl: "Whether the app supports Voice Control.",
  supportsVoiceover: "Whether the app supports VoiceOver.",
};
const accessibilityFeatureFields: Record<string, JsonSchema> = Object.fromEntries(
  Object.entries(accessibilityFeatureDescriptions).map(([key, description]) => [key, s.nullableBoolean(description)]),
);
const accessibilityFeatureInputs: Record<string, JsonSchema> = Object.fromEntries(
  Object.entries(accessibilityFeatureDescriptions).map(([key, description]) => [key, s.boolean(description)]),
);

export const accessibilityDeclarationResource: JsonSchema = resourceObject(
  "An accessibility declaration (Accessibility Nutrition Label) for one device family.",
  "App Store Connect identifier for the accessibility declaration.",
  {
    deviceFamily: nullableEnum("Device family the declaration describes.", deviceFamilies),
    state: nullableEnum(
      "Whether the declaration is a draft, published, or replaced by a newer one.",
      accessibilityDeclarationStates,
    ),
    ...accessibilityFeatureFields,
  },
);

export const appEncryptionDeclarationResource: JsonSchema = resourceObject(
  "An export compliance declaration describing the encryption an app uses.",
  "App Store Connect identifier for the app encryption declaration.",
  {
    appDescription: s.nullableString("Description of how the app uses encryption."),
    createdDate: s.nullableString("When the declaration was created, as an ISO 8601 timestamp."),
    exempt: s.nullableBoolean("Whether the encryption qualifies for an export exemption."),
    containsProprietaryCryptography: s.nullableBoolean(
      "Whether the app contains proprietary or non-standard cryptography.",
    ),
    containsThirdPartyCryptography: s.nullableBoolean("Whether the app contains third-party cryptography."),
    availableOnFrenchStore: s.nullableBoolean("Whether the app may be distributed on the France storefront."),
    platform: nullableEnum("Content platform the declaration applies to.", contentPlatforms),
    appEncryptionDeclarationState: nullableEnum("Review state of the declaration.", appEncryptionDeclarationStates),
    codeValue: s.nullableString(
      "Export compliance code App Store Connect assigned, to reuse in Info.plist or on upload.",
    ),
  },
);

export const endUserLicenseAgreementResource: JsonSchema = resourceObject(
  "A custom end user license agreement that replaces Apple's standard EULA in some territories.",
  "App Store Connect identifier for the end user license agreement.",
  {
    agreementText: s.nullableString("Full text of the custom license agreement."),
    territoryIds: nullableStringArray(
      "ISO 3166-1 alpha-3 territories the custom agreement applies in.",
      "Territory identifier, such as USA.",
    ),
  },
  ["territoryIds"],
);

export const appTagResource: JsonSchema = resourceObject(
  "A tag App Store Connect assigned to the app for App Store discovery.",
  "App Store Connect identifier for the app tag.",
  {
    name: s.nullableString("Tag name."),
    visibleInAppStore: s.nullableBoolean("Whether the tag is shown on the App Store."),
  },
);

export const androidToIosAppMappingDetailResource: JsonSchema = resourceObject(
  "A mapping from an Android app to this iOS app, used for Android to iPhone migration.",
  "App Store Connect identifier for the mapping detail.",
  {
    packageName: s.nullableString("Android package name of the mapped app."),
    appSigningKeyPublicCertificateSha256Fingerprints: nullableStringArray(
      "SHA-256 fingerprints of the Android app signing key certificates.",
      "A SHA-256 fingerprint.",
    ),
  },
);

const appIdInput = nonEmptyString("App Store Connect identifier of the app.");
const appInfoIdInput = nonEmptyString("App Store Connect identifier of the app info record.");

export const appStoreConnectAppInfoActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "update_app",
    operationType: "destructive",
    description:
      "Update app-level settings such as the primary locale, third-party content rights declaration, server notification URLs, or accessibility URL. Overwrites the given attributes; pass null for a URL to clear it. Pass at least one attribute.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The app attributes to change.",
      {
        appId: appIdInput,
        primaryLocale: nonEmptyString("New primary App Store locale, such as en-US."),
        bundleId: nonEmptyString(
          "New bundle identifier. App Store Connect only accepts a change before the first build is uploaded.",
        ),
        contentRightsDeclaration: s.stringEnum(
          "Whether the app contains, shows, or accesses third-party content.",
          contentRightsDeclarations,
        ),
        subscriptionStatusUrl: clearableUrl(
          "Production server URL that receives App Store Server Notifications, or null to clear it.",
        ),
        subscriptionStatusUrlVersion: s.stringEnum(
          "Notification version for the production URL.",
          subscriptionStatusUrlVersions,
        ),
        subscriptionStatusUrlForSandbox: clearableUrl(
          "Sandbox server URL that receives App Store Server Notifications, or null to clear it.",
        ),
        subscriptionStatusUrlVersionForSandbox: s.stringEnum(
          "Notification version for the sandbox URL.",
          subscriptionStatusUrlVersions,
        ),
        streamlinedPurchasingEnabled: s.boolean("Enable or disable streamlined purchasing."),
        accessibilityUrl: clearableUrl("URL with accessibility information for the app, or null to clear it."),
      },
      { required: ["appId"] },
    ),
    outputSchema: s.actionOutput({ app: appResource }, "The updated app."),
  }),
  defineProviderAction(service, {
    name: "list_app_infos",
    operationType: "read",
    description:
      "List the app info records of an app, each with its review state, derived age ratings, and the identifiers of its App Store categories. An app usually has one editable record plus the record of the version on the App Store.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the app whose app info records to list.",
      { appId: appIdInput, ...paginationInputs },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appInfos",
      appInfoResource,
      "App info records returned for this page.",
      "A page of app info records.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_info",
    operationType: "read",
    description:
      "Read one app info record with its review state, derived age ratings, and App Store category identifiers.",
    requiredScopes: [],
    inputSchema: s.actionInput({ appInfoId: appInfoIdInput }, ["appInfoId"], "Identifies the app info record to read."),
    outputSchema: s.actionOutput({ appInfo: appInfoResource }, "The requested app info record."),
  }),
  defineProviderAction(service, {
    name: "update_app_info",
    operationType: "destructive",
    description:
      "Set the App Store categories of an app info record. Each given category replaces the current one; subcategories only apply when the matching category is Games or Stickers. Pass at least one category. Use list_app_categories to find identifiers.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The categories to assign.",
      {
        appInfoId: appInfoIdInput,
        primaryCategoryId: nonEmptyString("Identifier of the new primary category, such as GAMES."),
        primarySubcategoryOneId: nonEmptyString("Identifier of the first primary subcategory, such as GAMES_ACTION."),
        primarySubcategoryTwoId: nonEmptyString("Identifier of the second primary subcategory."),
        secondaryCategoryId: nonEmptyString("Identifier of the new secondary category."),
        secondarySubcategoryOneId: nonEmptyString("Identifier of the first secondary subcategory."),
        secondarySubcategoryTwoId: nonEmptyString("Identifier of the second secondary subcategory."),
      },
      { required: ["appInfoId"] },
    ),
    outputSchema: s.actionOutput(
      { appInfo: appInfoResource },
      "The app info record after the categories were changed.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_info_localizations",
    operationType: "read",
    description:
      "List the localized names, subtitles, and privacy URLs of an app info record, optionally narrowed to some locales.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing app info localizations.",
      {
        appInfoId: appInfoIdInput,
        locales: s.stringArray("Return only the localizations for these locales.", {
          minItems: 1,
          itemDescription: "An App Store locale, such as en-US.",
        }),
        ...paginationInputs,
      },
      { required: ["appInfoId"] },
    ),
    outputSchema: pageOutput(
      "appInfoLocalizations",
      appInfoLocalizationResource,
      "App info localizations returned for this page.",
      "A page of app info localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_info_localization",
    operationType: "read",
    description: "Read one app info localization by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appInfoLocalizationId: nonEmptyString("App Store Connect identifier of the app info localization."),
      },
      ["appInfoLocalizationId"],
      "Identifies the app info localization to read.",
    ),
    outputSchema: s.actionOutput(
      { appInfoLocalization: appInfoLocalizationResource },
      "The requested app info localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_info_localization",
    operationType: "write",
    description:
      "Add a locale to an app info record with the app name and optional subtitle and privacy URLs shown in that locale. App Store Connect rejects a locale the record already has.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localization to create.",
      {
        appInfoId: appInfoIdInput,
        locale: nonEmptyString("App Store locale to add, such as de-DE."),
        name: nonEmptyString("App name shown on the App Store in this locale."),
        subtitle: nonEmptyString("Subtitle shown under the app name."),
        privacyPolicyUrl: s.url("Privacy policy URL for this locale."),
        privacyChoicesUrl: s.url("URL where users can manage their privacy choices."),
        privacyPolicyText: nonEmptyString("Privacy policy text shown on Apple TV."),
      },
      { required: ["appInfoId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { appInfoLocalization: appInfoLocalizationResource },
      "The created app info localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_info_localization",
    operationType: "destructive",
    description:
      "Change the name, subtitle, or privacy URLs of an app info localization. Overwrites the given fields; pass null to clear a subtitle, URL, or privacy text. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localization fields to change.",
      {
        appInfoLocalizationId: nonEmptyString("App Store Connect identifier of the app info localization."),
        name: nonEmptyString("New app name for this locale."),
        subtitle: clearableString("New subtitle, or null to remove it."),
        privacyPolicyUrl: clearableUrl("New privacy policy URL, or null to remove it."),
        privacyChoicesUrl: clearableUrl("New privacy choices URL, or null to remove it."),
        privacyPolicyText: clearableString("New privacy policy text for Apple TV, or null to remove it."),
      },
      { required: ["appInfoLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { appInfoLocalization: appInfoLocalizationResource },
      "The updated app info localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_info_localization",
    operationType: "destructive",
    description:
      "Remove a locale from an app info record. The app stops being listed in that language once the change is submitted.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appInfoLocalizationId: nonEmptyString("App Store Connect identifier of the app info localization."),
      },
      ["appInfoLocalizationId"],
      "Identifies the app info localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted app info localization."),
      "Confirmation that the app info localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_categories",
    operationType: "read",
    description:
      "List App Store categories with their platforms, parent, and subcategory identifiers. Filter by platform or list only top-level categories or only subcategories.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing App Store categories.",
      {
        platforms: platformArray("Return only categories offered on any of these platforms."),
        hasParent: s.boolean("Return only subcategories when true, or only top-level categories when false."),
        ...paginationInputs,
      },
      { optional: ["platforms", "hasParent", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "appCategories",
      appCategoryResource,
      "Categories returned for this page.",
      "A page of App Store categories.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_category",
    operationType: "read",
    description: "Read one App Store category with its platforms, parent category, and subcategory identifiers.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appCategoryId: nonEmptyString("Category identifier, such as GAMES or GAMES_ACTION.") },
      ["appCategoryId"],
      "Identifies the category to read.",
    ),
    outputSchema: s.actionOutput({ appCategory: appCategoryResource }, "The requested App Store category."),
  }),
  defineProviderAction(service, {
    name: "get_age_rating_declaration",
    operationType: "read",
    description:
      "Read the age rating questionnaire answers attached to an app info record, including any manual rating overrides.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appInfoId: appInfoIdInput },
      ["appInfoId"],
      "Identifies the app info record whose age rating declaration to read.",
    ),
    outputSchema: s.actionOutput(
      { ageRatingDeclaration: ageRatingDeclarationResource },
      "The age rating declaration of the app info record.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_age_rating_declaration",
    operationType: "destructive",
    description:
      "Answer or change questions of the age rating questionnaire. Only the given answers are overwritten; App Store Connect recalculates the derived age ratings. Pass at least one answer.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The questionnaire answers to change.",
      {
        ageRatingDeclarationId: nonEmptyString(
          "App Store Connect identifier of the age rating declaration, from get_age_rating_declaration.",
        ),
        advertising: s.boolean("Whether the app shows advertising."),
        ageAssurance: s.boolean("Whether the app performs age assurance."),
        alcoholTobaccoOrDrugUseOrReferences: s.stringEnum(
          "How often alcohol, tobacco, or drug use or references appear.",
          ageRatingFrequencies,
        ),
        contests: s.stringEnum("How often contests appear.", ageRatingFrequencies),
        gambling: s.boolean("Whether the app offers real gambling."),
        gamblingSimulated: s.stringEnum("How often simulated gambling appears.", ageRatingFrequencies),
        gunsOrOtherWeapons: s.stringEnum("How often guns or other weapons appear.", ageRatingFrequencies),
        healthOrWellnessTopics: s.boolean("Whether the app covers health or wellness topics."),
        horrorOrFearThemes: s.stringEnum("How often horror or fear themes appear.", ageRatingFrequencies),
        kidsAgeBand: s.nullable(
          s.stringEnum("Kids age band the app is designed for, or null to leave the Kids category.", kidsAgeBands),
        ),
        lootBox: s.boolean("Whether the app sells loot boxes or similar random rewards."),
        matureOrSuggestiveThemes: s.stringEnum("How often mature or suggestive themes appear.", ageRatingFrequencies),
        medicalOrTreatmentInformation: s.stringEnum(
          "How often medical or treatment information appears.",
          ageRatingFrequencies,
        ),
        messagingAndChat: s.boolean("Whether the app offers messaging or chat."),
        parentalControls: s.boolean("Whether the app offers parental controls."),
        profanityOrCrudeHumor: s.stringEnum("How often profanity or crude humor appears.", ageRatingFrequencies),
        sexualContentGraphicAndNudity: s.stringEnum(
          "How often graphic sexual content or nudity appears.",
          ageRatingFrequencies,
        ),
        sexualContentOrNudity: s.stringEnum("How often sexual content or nudity appears.", ageRatingFrequencies),
        socialMedia: s.boolean("Whether the app includes social media features."),
        socialMediaAgeRestricted: s.boolean("Whether the social media features are restricted by age."),
        unrestrictedWebAccess: s.boolean("Whether the app offers unrestricted web access."),
        userGeneratedContent: s.boolean("Whether the app shows user-generated content."),
        violenceCartoonOrFantasy: s.stringEnum("How often cartoon or fantasy violence appears.", ageRatingFrequencies),
        violenceRealistic: s.stringEnum("How often realistic violence appears.", ageRatingFrequencies),
        violenceRealisticProlongedGraphicOrSadistic: s.stringEnum(
          "How often prolonged graphic or sadistic realistic violence appears.",
          ageRatingFrequencies,
        ),
        ageRatingOverrideV2: s.stringEnum(
          "Manual override raising the derived age rating, or NONE to remove the override.",
          ageRatingOverrides,
        ),
        koreaAgeRatingOverride: s.stringEnum(
          "Manual override of the Korea age rating, or NONE to remove the override.",
          koreaAgeRatingOverrides,
        ),
        developerAgeRatingInfoUrl: clearableUrl(
          "URL with more information about the age rating, or null to remove it.",
        ),
      },
      { required: ["ageRatingDeclarationId"] },
    ),
    outputSchema: s.actionOutput(
      { ageRatingDeclaration: ageRatingDeclarationResource },
      "The updated age rating declaration.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_accessibility_declarations",
    operationType: "read",
    description:
      "List the accessibility declarations (Accessibility Nutrition Labels) of an app, optionally filtered by device family or publication state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing accessibility declarations.",
      {
        appId: appIdInput,
        deviceFamilies: s.array(
          "Return only declarations for these device families.",
          s.stringEnum("A device family.", deviceFamilies),
          { minItems: 1 },
        ),
        states: s.array(
          "Return only declarations in these states.",
          s.stringEnum("A declaration state.", accessibilityDeclarationStates),
          { minItems: 1 },
        ),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "accessibilityDeclarations",
      accessibilityDeclarationResource,
      "Accessibility declarations returned for this page.",
      "A page of accessibility declarations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_accessibility_declaration",
    operationType: "read",
    description: "Read one accessibility declaration by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        accessibilityDeclarationId: nonEmptyString("App Store Connect identifier of the accessibility declaration."),
      },
      ["accessibilityDeclarationId"],
      "Identifies the accessibility declaration to read.",
    ),
    outputSchema: s.actionOutput(
      { accessibilityDeclaration: accessibilityDeclarationResource },
      "The requested accessibility declaration.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_accessibility_declaration",
    operationType: "write",
    description:
      "Create a draft accessibility declaration for one device family of an app. The draft is not shown on the App Store until update_accessibility_declaration publishes it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The accessibility declaration to create.",
      {
        appId: appIdInput,
        deviceFamily: s.stringEnum("Device family the declaration describes.", deviceFamilies),
        ...accessibilityFeatureInputs,
      },
      { required: ["appId", "deviceFamily"] },
    ),
    outputSchema: s.actionOutput(
      { accessibilityDeclaration: accessibilityDeclarationResource },
      "The created accessibility declaration.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_accessibility_declaration",
    operationType: "destructive",
    description:
      "Change the supported accessibility features of a declaration, or publish it by passing publish: true, which replaces the currently published declaration for that device family. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The accessibility declaration fields to change.",
      {
        accessibilityDeclarationId: nonEmptyString("App Store Connect identifier of the accessibility declaration."),
        publish: s.boolean("Publish the declaration to the App Store when true."),
        ...accessibilityFeatureInputs,
      },
      { required: ["accessibilityDeclarationId"] },
    ),
    outputSchema: s.actionOutput(
      { accessibilityDeclaration: accessibilityDeclarationResource },
      "The updated accessibility declaration.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_accessibility_declaration",
    operationType: "destructive",
    description: "Delete an accessibility declaration.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        accessibilityDeclarationId: nonEmptyString("App Store Connect identifier of the accessibility declaration."),
      },
      ["accessibilityDeclarationId"],
      "Identifies the accessibility declaration to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted accessibility declaration."),
      "Confirmation that the accessibility declaration was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_encryption_declarations",
    operationType: "read",
    description:
      "List the export compliance (encryption) declarations of an app with their review state and compliance code, optionally filtered by platform or by the builds they cover.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing app encryption declarations.",
      {
        appId: appIdInput,
        platforms: platformArray("Return only declarations for these platforms."),
        buildIds: s.stringArray("Return only declarations attached to these builds.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a build.",
        }),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appEncryptionDeclarations",
      appEncryptionDeclarationResource,
      "App encryption declarations returned for this page.",
      "A page of app encryption declarations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_encryption_declaration",
    operationType: "read",
    description: "Read one export compliance (encryption) declaration by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appEncryptionDeclarationId: nonEmptyString("App Store Connect identifier of the app encryption declaration."),
      },
      ["appEncryptionDeclarationId"],
      "Identifies the app encryption declaration to read.",
    ),
    outputSchema: s.actionOutput(
      { appEncryptionDeclaration: appEncryptionDeclarationResource },
      "The requested app encryption declaration.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_encryption_declaration",
    operationType: "write",
    description:
      "Create an export compliance declaration for an app that uses non-exempt encryption. App Store Connect reviews it and assigns a compliance code; the declaration cannot be edited afterwards, only replaced by a new one. Supporting documents must be uploaded separately.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The export compliance answers to declare.",
      {
        appId: appIdInput,
        appDescription: nonEmptyString("Description of how the app uses encryption."),
        containsProprietaryCryptography: s.boolean(
          "Whether the app contains proprietary or non-standard cryptography.",
        ),
        containsThirdPartyCryptography: s.boolean("Whether the app contains third-party cryptography."),
        availableOnFrenchStore: s.boolean("Whether the app will be distributed on the France storefront."),
      },
      {
        required: [
          "appId",
          "appDescription",
          "containsProprietaryCryptography",
          "containsThirdPartyCryptography",
          "availableOnFrenchStore",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      { appEncryptionDeclaration: appEncryptionDeclarationResource },
      "The created app encryption declaration.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_end_user_license_agreement",
    operationType: "read",
    description:
      "Read the custom end user license agreement of an app together with the territories it applies in. Returns null when the app uses Apple's standard EULA everywhere.",
    requiredScopes: [],
    inputSchema: s.actionInput({ appId: appIdInput }, ["appId"], "Identifies the app whose license agreement to read."),
    outputSchema: s.actionOutput(
      {
        endUserLicenseAgreement: s.nullable(endUserLicenseAgreementResource),
      },
      "The custom license agreement, or null when the app has none.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_end_user_license_agreement",
    operationType: "write",
    description:
      "Attach a custom end user license agreement to an app for the given territories. Apple's standard EULA keeps applying elsewhere. App Store Connect rejects a second agreement for the same app.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The license agreement to create.",
      {
        appId: appIdInput,
        agreementText: nonEmptyString("Full text of the custom license agreement."),
        territoryIds: s.stringArray("Territories the custom agreement applies in.", {
          minItems: 1,
          itemDescription: "ISO 3166-1 alpha-3 territory identifier, such as USA.",
        }),
      },
      { required: ["appId", "agreementText", "territoryIds"] },
    ),
    outputSchema: s.actionOutput(
      { endUserLicenseAgreement: endUserLicenseAgreementResource },
      "The created license agreement.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_end_user_license_agreement",
    operationType: "destructive",
    description:
      "Replace the text of a custom end user license agreement or the full set of territories it applies in. Pass at least one of agreementText or territoryIds.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The license agreement fields to change.",
      {
        endUserLicenseAgreementId: nonEmptyString(
          "App Store Connect identifier of the license agreement, from get_end_user_license_agreement.",
        ),
        agreementText: nonEmptyString("New full text of the license agreement."),
        territoryIds: s.stringArray(
          "Complete new set of territories the agreement applies in; territories left out are removed.",
          { minItems: 1, itemDescription: "ISO 3166-1 alpha-3 territory identifier, such as USA." },
        ),
      },
      { required: ["endUserLicenseAgreementId"] },
    ),
    outputSchema: s.actionOutput(
      { endUserLicenseAgreement: endUserLicenseAgreementResource },
      "The updated license agreement.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_end_user_license_agreement",
    operationType: "destructive",
    description:
      "Remove the custom end user license agreement of an app so Apple's standard EULA applies in every territory.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        endUserLicenseAgreementId: nonEmptyString("App Store Connect identifier of the license agreement."),
      },
      ["endUserLicenseAgreementId"],
      "Identifies the license agreement to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted license agreement."),
      "Confirmation that the license agreement was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_territories",
    operationType: "read",
    description:
      "List every App Store territory with its currency. Territory identifiers are used for license agreements, availability, and pricing.",
    requiredScopes: [],
    inputSchema: s.object("Pagination for the territory list.", paginationInputs, {
      optional: ["limit", "cursor"],
    }),
    outputSchema: pageOutput(
      "territories",
      territoryResource,
      "Territories returned for this page.",
      "A page of App Store territories.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_app_tags",
    operationType: "read",
    description:
      "List the tags App Store Connect assigned to an app for App Store discovery, optionally only those shown or hidden on the App Store.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing app tags.",
      {
        appId: appIdInput,
        visibleInAppStore: s.boolean(
          "Return only tags shown on the App Store when true, or only hidden tags when false.",
        ),
        sort: s.stringEnum("Sort order for the returned tags.", ["name", "-name"]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput("appTags", appTagResource, "App tags returned for this page.", "A page of app tags."),
  }),
  defineProviderAction(service, {
    name: "list_android_to_ios_app_mapping_details",
    operationType: "read",
    description:
      "List the Android app mappings of an app, which link an Android package to this app for Android to iPhone migration.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the app whose Android mappings to list.",
      { appId: appIdInput, ...paginationInputs },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "androidToIosAppMappingDetails",
      androidToIosAppMappingDetailResource,
      "Android app mappings returned for this page.",
      "A page of Android app mappings.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_android_to_ios_app_mapping_detail",
    operationType: "read",
    description: "Read one Android app mapping by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        androidToIosAppMappingDetailId: nonEmptyString("App Store Connect identifier of the Android app mapping."),
      },
      ["androidToIosAppMappingDetailId"],
      "Identifies the Android app mapping to read.",
    ),
    outputSchema: s.actionOutput(
      { androidToIosAppMappingDetail: androidToIosAppMappingDetailResource },
      "The requested Android app mapping.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_android_to_ios_app_mapping_detail",
    operationType: "write",
    description:
      "Map an Android app to this app by its package name and signing certificate fingerprints, so Android users migrating to iPhone are offered this app.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The Android app mapping to create.",
      {
        appId: appIdInput,
        packageName: nonEmptyString("Android package name, such as com.example.app."),
        appSigningKeyPublicCertificateSha256Fingerprints: s.stringArray(
          "SHA-256 fingerprints of the Android app signing key certificates.",
          { minItems: 1, itemDescription: "A SHA-256 certificate fingerprint." },
        ),
      },
      { required: ["appId", "packageName", "appSigningKeyPublicCertificateSha256Fingerprints"] },
    ),
    outputSchema: s.actionOutput(
      { androidToIosAppMappingDetail: androidToIosAppMappingDetailResource },
      "The created Android app mapping.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_android_to_ios_app_mapping_detail",
    operationType: "destructive",
    description:
      "Change the package name or replace the full list of signing certificate fingerprints of an Android app mapping. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The Android app mapping fields to change.",
      {
        androidToIosAppMappingDetailId: nonEmptyString("App Store Connect identifier of the Android app mapping."),
        packageName: nonEmptyString("New Android package name."),
        appSigningKeyPublicCertificateSha256Fingerprints: s.stringArray(
          "Complete new list of SHA-256 certificate fingerprints; fingerprints left out are removed.",
          { minItems: 1, itemDescription: "A SHA-256 certificate fingerprint." },
        ),
      },
      { required: ["androidToIosAppMappingDetailId"] },
    ),
    outputSchema: s.actionOutput(
      { androidToIosAppMappingDetail: androidToIosAppMappingDetailResource },
      "The updated Android app mapping.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_android_to_ios_app_mapping_detail",
    operationType: "destructive",
    description: "Delete an Android app mapping.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        androidToIosAppMappingDetailId: nonEmptyString("App Store Connect identifier of the Android app mapping."),
      },
      ["androidToIosAppMappingDetailId"],
      "Identifies the Android app mapping to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted Android app mapping."),
      "Confirmation that the Android app mapping was deleted.",
    ),
  }),
];
