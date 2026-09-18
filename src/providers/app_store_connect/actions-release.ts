import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appStoreReleaseTypes,
  appStoreReviewTypes,
  appStoreVersionResource,
  buildResource,
  contentPlatforms,
  deletedOutput,
  emailString,
  manageAppStoreRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
  urlString,
} from "./schemas.ts";

export const phasedReleaseStates: readonly string[] = ["INACTIVE", "ACTIVE", "PAUSED", "COMPLETE"];
export const reviewSubmissionStates: readonly string[] = [
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "UNRESOLVED_ISSUES",
  "CANCELING",
  "COMPLETING",
  "COMPLETE",
];
export const reviewSubmissionItemStates: readonly string[] = [
  "READY_FOR_REVIEW",
  "ACCEPTED",
  "APPROVED",
  "REJECTED",
  "REMOVED",
];

const descriptionMaxLength = 4000;
const keywordsMaxLength = 100;
const promotionalTextMaxLength = 170;
const whatsNewMaxLength = 4000;

const boundedString = (description: string, maxLength: number) => s.nonWhitespaceString(description, { maxLength });

const buildFields = buildResource.properties as Record<string, JsonSchema>;
const { id: _buildId, preReleaseVersion: _preReleaseVersion, ...attachedBuildFields } = buildFields;
export const attachedBuildResource: JsonSchema = s.nullable(
  resourceObject(
    "The build attached to an App Store version, or null when no build has been selected yet.",
    "App Store Connect identifier for the build.",
    attachedBuildFields,
  ),
);

export const appStoreVersionLocalizationResource: JsonSchema = resourceObject(
  "The App Store metadata of one version in one locale.",
  "App Store Connect identifier for the version localization.",
  {
    locale: s.nullableString("Locale the metadata is written in, such as en-US."),
    description: s.nullableString("App description shown on the product page."),
    keywords: s.nullableString("Comma-separated App Store search keywords."),
    marketingUrl: s.nullableString("Marketing website URL shown on the product page."),
    promotionalText: s.nullableString("Promotional text shown above the description, editable without a new version."),
    supportUrl: s.nullableString("Support website URL shown on the product page."),
    whatsNew: s.nullableString("Release notes shown for this version."),
  },
);

export const appStoreVersionPhasedReleaseResource: JsonSchema = resourceObject(
  "The phased release configuration of an App Store version.",
  "App Store Connect identifier for the phased release.",
  {
    phasedReleaseState: nullableEnum(
      "Whether the seven day phased rollout is inactive, active, paused, or complete.",
      phasedReleaseStates,
    ),
    startDate: s.nullableString("When the phased release started, as an ISO 8601 timestamp."),
    totalPauseDuration: s.nullableInteger("Total number of days the rollout has been paused."),
    currentDayNumber: s.nullableInteger("Current day of the seven day rollout, starting at 1."),
  },
);

export const appStoreReviewDetailResource: JsonSchema = resourceObject(
  "The App Review contact and demo account information of an App Store version.",
  "App Store Connect identifier for the review detail.",
  {
    contactFirstName: s.nullableString("First name of the person App Review may contact."),
    contactLastName: s.nullableString("Last name of the person App Review may contact."),
    contactPhone: s.nullableString("Phone number App Review may call."),
    contactEmail: s.nullableString("Email address App Review may write to."),
    demoAccountName: s.nullableString("Username of the demo account provided to App Review."),
    demoAccountPassword: s.nullableString("Password of the demo account provided to App Review."),
    demoAccountRequired: s.nullableBoolean("Whether App Review needs a demo account to sign in."),
    notes: s.nullableString("Additional notes for the App Review team."),
  },
);

export const reviewSubmissionResource: JsonSchema = resourceObject(
  "A review submission that bundles the items sent to App Review together.",
  "App Store Connect identifier for the review submission.",
  {
    platform: nullableEnum("Content platform the submission targets.", contentPlatforms),
    submittedDate: s.nullableString(
      "When the submission was sent to App Review, as an ISO 8601 timestamp, or null while it is still being prepared.",
    ),
    state: nullableEnum("Where the submission stands in App Review.", reviewSubmissionStates),
    appStoreVersionForReviewId: s.nullableString(
      "App Store Connect identifier of the App Store version under review, or null when the submission carries no version.",
    ),
  },
  ["appStoreVersionForReviewId"],
);

export const reviewSubmissionItemResource: JsonSchema = resourceObject(
  "One item inside a review submission. Exactly one of the identifier fields is set, naming the record being reviewed.",
  "App Store Connect identifier for the review submission item.",
  {
    state: nullableEnum("Review state of this item.", reviewSubmissionItemStates),
    appStoreVersionId: s.nullableString(
      "App Store Connect identifier of the App Store version this item reviews, or null.",
    ),
    appCustomProductPageVersionId: s.nullableString(
      "App Store Connect identifier of the custom product page version this item reviews, or null.",
    ),
    appStoreVersionExperimentId: s.nullableString(
      "App Store Connect identifier of the product page optimization experiment (v1) this item reviews, or null.",
    ),
    appStoreVersionExperimentV2Id: s.nullableString(
      "App Store Connect identifier of the product page optimization experiment (v2) this item reviews, or null.",
    ),
    appEventId: s.nullableString("App Store Connect identifier of the in-app event this item reviews, or null."),
  },
  [
    "appStoreVersionId",
    "appCustomProductPageVersionId",
    "appStoreVersionExperimentId",
    "appStoreVersionExperimentV2Id",
    "appEventId",
  ],
);

export const appStoreConnectReleaseActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_app_store_version",
    operationType: "write",
    description:
      "Create a new App Store version for an app on one platform. The version starts in PREPARE_FOR_SUBMISSION and can be deleted again until it is submitted for review.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The App Store version to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Content platform the version is for.", contentPlatforms),
        versionString: nonEmptyString("Version string shown on the App Store, such as 1.4.0."),
        copyright: nonEmptyString("Copyright line published with the version."),
        reviewType: s.stringEnum(
          "Review track for the version: APP_STORE for App Review, NOTARIZATION for Mac apps distributed outside the App Store.",
          appStoreReviewTypes,
        ),
        releaseType: s.stringEnum(
          "How the version is released after approval: MANUAL waits for release_app_store_version, AFTER_APPROVAL releases immediately, SCHEDULED releases at earliestReleaseDate.",
          appStoreReleaseTypes,
        ),
        earliestReleaseDate: s.dateTime("Earliest release time for a SCHEDULED release, as an ISO 8601 timestamp."),
        buildId: nonEmptyString("App Store Connect identifier of the build to attach to the version."),
      },
      { required: ["appId", "platform", "versionString"] },
    ),
    outputSchema: s.actionOutput({ appStoreVersion: appStoreVersionResource }, "The created App Store version."),
  }),
  defineProviderAction(service, {
    name: "update_app_store_version",
    operationType: "destructive",
    description:
      "Change the version string, copyright, review or release settings, or attached build of an App Store version. Each given field overwrites the current value; pass null for copyright or earliestReleaseDate to clear them.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The App Store version fields to change. At least one field besides appStoreVersionId is required.",
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the version."),
        versionString: nonEmptyString("New version string shown on the App Store, such as 1.4.1."),
        copyright: s.nullable(nonEmptyString("New copyright line, or null to clear the current copyright.")),
        reviewType: s.stringEnum("New review track for the version.", appStoreReviewTypes),
        releaseType: s.stringEnum("New release behavior after approval.", appStoreReleaseTypes),
        earliestReleaseDate: s.nullable(
          s.dateTime(
            "New earliest release time for a SCHEDULED release, as an ISO 8601 timestamp, or null to clear the scheduled date.",
          ),
        ),
        downloadable: s.boolean("Whether the version can be downloaded from the App Store."),
        buildId: nonEmptyString("App Store Connect identifier of the build to attach, replacing the current build."),
      },
      { required: ["appStoreVersionId"] },
    ),
    outputSchema: s.actionOutput({ appStoreVersion: appStoreVersionResource }, "The updated App Store version."),
  }),
  defineProviderAction(service, {
    name: "delete_app_store_version",
    operationType: "destructive",
    description:
      "Delete an App Store version that has not been submitted yet, together with its localizations and review information.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appStoreVersionId: nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted version."),
      "Confirmation that the App Store version was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_app_store_version_build",
    operationType: "destructive",
    description:
      "Select the build an App Store version submits for review, replacing any build selected before. Pass null as buildId to detach the current build.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The version and the build to attach to it.",
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the version."),
        buildId: s.nullable(
          nonEmptyString("App Store Connect identifier of the build to attach, or null to detach the current build."),
        ),
      },
      { required: ["appStoreVersionId", "buildId"] },
    ),
    outputSchema: s.actionOutput(
      {
        appStoreVersionId: s.string("The App Store version whose build was changed."),
        buildId: s.nullableString("The build now attached, or null when it was detached."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the build selection was changed.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_build",
    operationType: "read",
    description: "Read the build currently attached to an App Store version, or null when no build has been selected.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appStoreVersionId: nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version whose build to read.",
    ),
    outputSchema: s.actionOutput({ build: attachedBuildResource }, "The build attached to the version, or null."),
  }),
  defineProviderAction(service, {
    name: "list_app_store_version_localizations",
    operationType: "read",
    description:
      "List the localized App Store metadata (description, keywords, release notes, URLs) of one App Store version, optionally narrowed to specific locales.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the localizations of one App Store version.",
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the version."),
        locales: s.stringArray("Return only the localizations for these locales.", {
          minItems: 1,
          itemDescription: "An App Store locale, such as en-US or zh-Hans.",
        }),
        ...paginationInputs,
      },
      { required: ["appStoreVersionId"] },
    ),
    outputSchema: pageOutput(
      "appStoreVersionLocalizations",
      appStoreVersionLocalizationResource,
      "Version localizations returned for this page.",
      "A page of App Store version localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_localization",
    operationType: "read",
    description: "Read the localized App Store metadata of one version in one locale.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appStoreVersionLocalizationId: nonEmptyString("App Store Connect identifier of the version localization."),
      },
      ["appStoreVersionLocalizationId"],
      "Identifies the version localization to read.",
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionLocalization: appStoreVersionLocalizationResource },
      "The requested version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_version_localization",
    operationType: "write",
    description:
      "Add App Store metadata for one locale to an App Store version. The locale must be enabled for the app and must not already have a localization on this version.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localized metadata to create.",
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the version."),
        locale: nonEmptyString("App Store locale the metadata is written in, such as en-US."),
        description: boundedString(
          "App description shown on the product page, up to 4,000 characters.",
          descriptionMaxLength,
        ),
        keywords: boundedString(
          "Comma-separated App Store search keywords, up to 100 characters in total.",
          keywordsMaxLength,
        ),
        marketingUrl: urlString("Marketing website URL shown on the product page."),
        promotionalText: boundedString(
          "Promotional text shown above the description, up to 170 characters.",
          promotionalTextMaxLength,
        ),
        supportUrl: urlString("Support website URL shown on the product page."),
        whatsNew: boundedString("Release notes for this version, up to 4,000 characters.", whatsNewMaxLength),
      },
      { required: ["appStoreVersionId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionLocalization: appStoreVersionLocalizationResource },
      "The created version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_store_version_localization",
    operationType: "destructive",
    description:
      "Overwrite the localized App Store metadata of one version in one locale. Only the given fields change; pass null to clear a field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The localized metadata fields to change. At least one field besides appStoreVersionLocalizationId is required.",
      {
        appStoreVersionLocalizationId: nonEmptyString("App Store Connect identifier of the version localization."),
        description: s.nullable(
          boundedString("New app description, up to 4,000 characters, or null to clear it.", descriptionMaxLength),
        ),
        keywords: s.nullable(
          boundedString(
            "New comma-separated search keywords, up to 100 characters in total, or null to clear them.",
            keywordsMaxLength,
          ),
        ),
        marketingUrl: s.nullable(urlString("New marketing website URL, or null to clear it.")),
        promotionalText: s.nullable(
          boundedString("New promotional text, up to 170 characters, or null to clear it.", promotionalTextMaxLength),
        ),
        supportUrl: s.nullable(urlString("New support website URL, or null to clear it.")),
        whatsNew: s.nullable(
          boundedString("New release notes, up to 4,000 characters, or null to clear them.", whatsNewMaxLength),
        ),
      },
      { required: ["appStoreVersionLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionLocalization: appStoreVersionLocalizationResource },
      "The updated version localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_store_version_localization",
    operationType: "destructive",
    description:
      "Remove the App Store metadata of one locale from an App Store version, including its screenshots and previews.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionLocalizationId: nonEmptyString("App Store Connect identifier of the version localization."),
      },
      ["appStoreVersionLocalizationId"],
      "Identifies the version localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted version localization."),
      "Confirmation that the version localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_phased_release",
    operationType: "read",
    description:
      "Read the phased release configuration of an App Store version, or null when phased release is not configured for it.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appStoreVersionId: nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version whose phased release to read.",
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionPhasedRelease: s.nullable(appStoreVersionPhasedReleaseResource) },
      "The phased release of the version, or null.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_version_phased_release",
    operationType: "write",
    description:
      "Enable phased release for an App Store version so an approved update rolls out to automatic-update users over seven days. Can be removed again with delete_app_store_version_phased_release before the version is released.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The phased release to configure.",
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the version."),
        phasedReleaseState: s.stringEnum(
          "Initial rollout state. Defaults to INACTIVE, which starts the rollout automatically once the version is released.",
          phasedReleaseStates,
        ),
      },
      { required: ["appStoreVersionId"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionPhasedRelease: appStoreVersionPhasedReleaseResource },
      "The created phased release.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_app_store_version_phased_release",
    operationType: "destructive",
    description:
      "Pause, resume, or complete the phased rollout of a released version. COMPLETE releases the version to every user at once and cannot be undone.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The rollout state to apply.",
      {
        appStoreVersionPhasedReleaseId: nonEmptyString("App Store Connect identifier of the phased release."),
        phasedReleaseState: s.stringEnum(
          "New rollout state: ACTIVE resumes, PAUSED pauses, COMPLETE releases to all users.",
          phasedReleaseStates,
        ),
      },
      { required: ["appStoreVersionPhasedReleaseId", "phasedReleaseState"] },
    ),
    outputSchema: s.actionOutput(
      { appStoreVersionPhasedRelease: appStoreVersionPhasedReleaseResource },
      "The updated phased release.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_app_store_version_phased_release",
    operationType: "destructive",
    description: "Turn off phased release for an App Store version so the approved update reaches every user at once.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionPhasedReleaseId: nonEmptyString("App Store Connect identifier of the phased release."),
      },
      ["appStoreVersionPhasedReleaseId"],
      "Identifies the phased release to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted phased release."),
      "Confirmation that the phased release was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "release_app_store_version",
    operationType: "destructive",
    description:
      "Release an approved App Store version that is waiting in PENDING_DEVELOPER_RELEASE to the App Store. The release starts immediately and cannot be undone.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { appStoreVersionId: nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version to release.",
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("App Store Connect identifier of the release request."),
        appStoreVersionId: s.string("The App Store version whose release was requested."),
      },
      "The created release request.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_review_detail",
    operationType: "read",
    description:
      "Read the App Review contact details, demo account, and notes attached to an App Store version, or null when none were entered yet.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appStoreVersionId: nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version whose review detail to read.",
    ),
    outputSchema: s.actionOutput(
      { appStoreReviewDetail: s.nullable(appStoreReviewDetailResource) },
      "The review detail of the version, or null.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_app_store_review_detail",
    operationType: "write",
    description:
      "Enter the App Review contact details, demo account, and notes for an App Store version that has none yet.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The review information to attach to the version.",
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the version."),
        contactFirstName: nonEmptyString("First name of the person App Review may contact."),
        contactLastName: nonEmptyString("Last name of the person App Review may contact."),
        contactPhone: nonEmptyString("Phone number App Review may call, including country code."),
        contactEmail: emailString("Email address App Review may write to."),
        demoAccountName: nonEmptyString("Username of a demo account App Review can sign in with."),
        demoAccountPassword: nonEmptyString("Password of the demo account."),
        demoAccountRequired: s.boolean("Whether App Review needs a demo account to sign in."),
        notes: nonEmptyString("Additional notes for the App Review team."),
      },
      { required: ["appStoreVersionId"] },
    ),
    outputSchema: s.actionOutput({ appStoreReviewDetail: appStoreReviewDetailResource }, "The created review detail."),
  }),
  defineProviderAction(service, {
    name: "update_app_store_review_detail",
    operationType: "destructive",
    description:
      "Overwrite the App Review contact details, demo account, or notes of an App Store version. Only the given fields change; pass null to clear a text field.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The review information fields to change. At least one field besides appStoreReviewDetailId is required.",
      {
        appStoreReviewDetailId: nonEmptyString("App Store Connect identifier of the review detail."),
        contactFirstName: s.nullable(nonEmptyString("New contact first name, or null to clear it.")),
        contactLastName: s.nullable(nonEmptyString("New contact last name, or null to clear it.")),
        contactPhone: s.nullable(nonEmptyString("New contact phone number, or null to clear it.")),
        contactEmail: s.nullable(emailString("New contact email address, or null to clear it.")),
        demoAccountName: s.nullable(nonEmptyString("New demo account username, or null to clear it.")),
        demoAccountPassword: s.nullable(nonEmptyString("New demo account password, or null to clear it.")),
        demoAccountRequired: s.boolean("Whether App Review needs a demo account to sign in."),
        notes: s.nullable(nonEmptyString("New notes for the App Review team, or null to clear them.")),
      },
      { required: ["appStoreReviewDetailId"] },
    ),
    outputSchema: s.actionOutput({ appStoreReviewDetail: appStoreReviewDetailResource }, "The updated review detail."),
  }),
  defineProviderAction(service, {
    name: "list_review_submissions",
    operationType: "read",
    description:
      "List the review submissions of one app, with the App Store version each submission carries. Filter by platform or review state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the review submissions of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Return only submissions for this content platform.", contentPlatforms),
        states: s.array(
          "Return only submissions in these review states.",
          s.stringEnum("A review submission state.", reviewSubmissionStates),
          { minItems: 1 },
        ),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "reviewSubmissions",
      reviewSubmissionResource,
      "Review submissions returned for this page.",
      "A page of review submissions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_review_submission",
    operationType: "read",
    description: "Read one review submission with its state and the App Store version it carries.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        reviewSubmissionId: nonEmptyString("App Store Connect identifier of the review submission."),
      },
      ["reviewSubmissionId"],
      "Identifies the review submission to read.",
    ),
    outputSchema: s.actionOutput({ reviewSubmission: reviewSubmissionResource }, "The requested review submission."),
  }),
  defineProviderAction(service, {
    name: "create_review_submission",
    operationType: "write",
    description:
      "Start a new review submission for an app on one platform. Add items with add_review_submission_item, then send it with submit_review_submission. An app can have only one open submission per platform.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The review submission to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Content platform the submission is for.", contentPlatforms),
      },
      { required: ["appId", "platform"] },
    ),
    outputSchema: s.actionOutput({ reviewSubmission: reviewSubmissionResource }, "The created review submission."),
  }),
  defineProviderAction(service, {
    name: "submit_review_submission",
    operationType: "write",
    description:
      "Send a prepared review submission and all of its items to App Review. The submission moves to WAITING_FOR_REVIEW and can only be taken back with cancel_review_submission.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        reviewSubmissionId: nonEmptyString("App Store Connect identifier of the review submission."),
      },
      ["reviewSubmissionId"],
      "Identifies the review submission to send to App Review.",
    ),
    outputSchema: s.actionOutput({ reviewSubmission: reviewSubmissionResource }, "The submitted review submission."),
  }),
  defineProviderAction(service, {
    name: "cancel_review_submission",
    operationType: "destructive",
    description:
      "Cancel a review submission, removing it from the App Review queue. Its items return to their previous state and a new submission is needed to submit them again.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        reviewSubmissionId: nonEmptyString("App Store Connect identifier of the review submission."),
      },
      ["reviewSubmissionId"],
      "Identifies the review submission to cancel.",
    ),
    outputSchema: s.actionOutput({ reviewSubmission: reviewSubmissionResource }, "The canceled review submission."),
  }),
  defineProviderAction(service, {
    name: "list_review_submission_items",
    operationType: "read",
    description:
      "List the items in a review submission, each naming the App Store version, custom product page version, experiment, or in-app event it reviews.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the review submission whose items to list.",
      {
        reviewSubmissionId: nonEmptyString("App Store Connect identifier of the review submission."),
        ...paginationInputs,
      },
      { required: ["reviewSubmissionId"] },
    ),
    outputSchema: pageOutput(
      "reviewSubmissionItems",
      reviewSubmissionItemResource,
      "Review submission items returned for this page.",
      "A page of review submission items.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_review_submission_item",
    operationType: "write",
    description:
      "Add one record to an open review submission. Give exactly one of appStoreVersionId, appCustomProductPageVersionId, appStoreVersionExperimentId, appStoreVersionExperimentV2Id, or appEventId. The item can be removed again with delete_review_submission_item before the submission is sent.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The review submission and the single record to add to it.",
      {
        reviewSubmissionId: nonEmptyString("App Store Connect identifier of the review submission."),
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the App Store version to submit."),
        appCustomProductPageVersionId: nonEmptyString(
          "App Store Connect identifier of the custom product page version to submit.",
        ),
        appStoreVersionExperimentId: nonEmptyString(
          "App Store Connect identifier of the product page optimization experiment (v1) to submit.",
        ),
        appStoreVersionExperimentV2Id: nonEmptyString(
          "App Store Connect identifier of the product page optimization experiment (v2) to submit.",
        ),
        appEventId: nonEmptyString("App Store Connect identifier of the in-app event to submit."),
      },
      { required: ["reviewSubmissionId"] },
    ),
    outputSchema: s.actionOutput(
      { reviewSubmissionItem: reviewSubmissionItemResource },
      "The created review submission item.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_review_submission_item",
    operationType: "destructive",
    description:
      "Mark a review submission item as resolved after fixing the issues App Review raised, or mark it as removed so the submission continues without it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The item flags to change. At least one of resolved or removed is required.",
      {
        reviewSubmissionItemId: nonEmptyString("App Store Connect identifier of the review submission item."),
        resolved: s.boolean("Set to true once the issues App Review raised for the item are fixed."),
        removed: s.boolean("Set to true to remove the item from the submission."),
      },
      { required: ["reviewSubmissionItemId"] },
    ),
    outputSchema: s.actionOutput(
      { reviewSubmissionItem: reviewSubmissionItemResource },
      "The updated review submission item.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_review_submission_item",
    operationType: "destructive",
    description: "Delete an item from a review submission that has not been sent to App Review yet.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        reviewSubmissionItemId: nonEmptyString("App Store Connect identifier of the review submission item."),
      },
      ["reviewSubmissionItemId"],
      "Identifies the review submission item to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted review submission item."),
      "Confirmation that the review submission item was deleted.",
    ),
  }),
];
