import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const service = "app_store_connect";

export const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
export const emailString = (description: string): JsonSchema => s.email(description);

export const urlString = (description: string): JsonSchema => s.url(description);

export const clearableString = (description: string): JsonSchema => s.nullable(nonEmptyString(description));

export const clearableUrl = (description: string): JsonSchema => s.nullable(urlString(description));
export const nullableStringArray = (description: string, itemDescription: string): JsonSchema =>
  s.nullable(s.stringArray(description, { itemDescription }));

export const nullableEnum = (description: string, values: readonly string[]): JsonSchema =>
  s.nullable(s.stringEnum(description, values));

export const contentPlatforms: readonly string[] = ["IOS", "MAC_OS", "TV_OS", "VISION_OS"];

export const devicePlatforms: readonly string[] = ["IOS", "MAC_OS", "TV_OS", "WATCH_OS", "VISION_OS"];

export const deviceFamilies: readonly string[] = ["IPHONE", "IPAD", "APPLE_TV", "APPLE_WATCH", "MAC", "VISION"];
export const buildProcessingStates: readonly string[] = ["PROCESSING", "FAILED", "INVALID", "VALID"];
export const buildAudienceTypes: readonly string[] = ["INTERNAL_ONLY", "APP_STORE_ELIGIBLE"];
export const betaReviewStates: readonly string[] = ["WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED", "APPROVED"];
export const betaTesterStates: readonly string[] = ["NOT_INVITED", "INVITED", "ACCEPTED", "INSTALLED", "REVOKED"];
export const betaInviteTypes: readonly string[] = ["EMAIL", "PUBLIC_LINK"];
export const appStoreReviewTypes: readonly string[] = ["APP_STORE", "NOTARIZATION"];
export const appStoreReleaseTypes: readonly string[] = ["MANUAL", "AFTER_APPROVAL", "SCHEDULED"];
export const reviewResponseStates: readonly string[] = ["PUBLISHED", "PENDING_PUBLISH"];
export const contentRightsDeclarations: readonly string[] = [
  "DOES_NOT_USE_THIRD_PARTY_CONTENT",
  "USES_THIRD_PARTY_CONTENT",
];
export const subscriptionStatusUrlVersions: readonly string[] = ["V1", "V2"];
export const appVersionStates: readonly string[] = [
  "ACCEPTED",
  "DEVELOPER_REJECTED",
  "IN_REVIEW",
  "INVALID_BINARY",
  "METADATA_REJECTED",
  "PENDING_APPLE_RELEASE",
  "PENDING_DEVELOPER_RELEASE",
  "PREPARE_FOR_SUBMISSION",
  "PROCESSING_FOR_DISTRIBUTION",
  "READY_FOR_DISTRIBUTION",
  "READY_FOR_REVIEW",
  "REJECTED",
  "REPLACED_WITH_NEW_VERSION",
  "WAITING_FOR_EXPORT_COMPLIANCE",
  "WAITING_FOR_REVIEW",
];
export const teamRoles: readonly string[] = [
  "ADMIN",
  "FINANCE",
  "ACCOUNT_HOLDER",
  "SALES",
  "MARKETING",
  "APP_MANAGER",
  "DEVELOPER",
  "ACCESS_TO_REPORTS",
  "CUSTOMER_SUPPORT",
  "CREATE_APPS",
  "CLOUD_MANAGED_DEVELOPER_ID",
  "CLOUD_MANAGED_APP_DISTRIBUTION",
  "GENERATE_INDIVIDUAL_KEYS",
];

export const manageTestFlightRoles: readonly string[] = ["Account Holder", "Admin", "App Manager"];

export const manageTestFlightBuildsRoles: readonly string[] = [...manageTestFlightRoles, "Developer"];

export const viewReviewsRoles: readonly string[] = [
  ...manageTestFlightBuildsRoles,
  "Marketing",
  "Sales",
  "Customer Support",
];

export const respondToReviewsRoles: readonly string[] = [...manageTestFlightRoles, "Marketing", "Customer Support"];

export const usersAndAccessRoles: readonly string[] = ["Account Holder", "Admin"];

export const manageAppStoreRoles: readonly string[] = ["Account Holder", "Admin", "App Manager"];

export const manageProvisioningRoles: readonly string[] = ["Account Holder", "Admin", "Developer"];

export const deleteProvisioningRoles: readonly string[] = ["Account Holder", "Admin"];

export const manageInAppPurchaseRoles: readonly string[] = ["Account Holder", "Admin", "App Manager", "Developer"];

export const manageXcodeCloudRoles: readonly string[] = ["Account Holder", "Admin", "App Manager", "Developer"];

export const manageSandboxTestersRoles: readonly string[] = ["Account Holder", "Admin", "App Manager", "Developer"];

export const manageAnalyticsReportRequestsRoles: readonly string[] = ["Account Holder", "Admin"];

export const viewAnalyticsReportsRoles: readonly string[] = ["Account Holder", "Admin", "Finance", "Sales"];

export const manageBackgroundAssetsRoles: readonly string[] = ["Account Holder", "Admin", "App Manager", "Developer"];

export const absentAttributeNote: string =
  "An attribute App Store Connect has no value for is returned as null, and older records may leave it out entirely.";

export const limitInput: JsonSchema = s.integer(
  "Maximum number of records to return on this page. App Store Connect allows up to 200.",
  { minimum: 1, maximum: 200 },
);
export const cursorInput: JsonSchema = nonEmptyString(
  "Opaque page cursor taken from the nextCursor value of a previous response for the same query.",
);

export const paginationInputs: Record<string, JsonSchema> = { limit: limitInput, cursor: cursorInput };
export const nextCursorOutput: JsonSchema = s.nullableString(
  "Cursor to pass back as cursor for the next page, or null when this was the last page.",
);
export const totalOutput: JsonSchema = s.nullableInteger(
  "Total number of records matching the query when App Store Connect reports one, otherwise null.",
);

export const pageOutput = (key: string, items: JsonSchema, itemsDescription: string, description: string): JsonSchema =>
  s.actionOutput(
    { [key]: s.array(itemsDescription, items), nextCursor: nextCursorOutput, total: totalOutput },
    description,
  );

export const resourceObject = (
  description: string,
  idDescription: string,
  fields: Record<string, JsonSchema>,
  required: readonly string[] = [],
): JsonSchema =>
  s.object(
    `${description} ${absentAttributeNote}`,
    { id: s.string(idDescription), ...fields },
    { required: ["id", ...required], additionalProperties: true },
  );

export const deletedOutput = (description: string): Record<string, JsonSchema> => ({
  id: s.string(description),
  deleted: s.boolean("Always true once App Store Connect confirmed the deletion."),
});

export const appResource: JsonSchema = resourceObject(
  "An app registered in App Store Connect.",
  "App Store Connect identifier for the app.",
  {
    name: s.nullableString("App name shown on the App Store."),
    bundleId: s.nullableString("Bundle identifier registered for the app."),
    sku: s.nullableString("SKU chosen when the app record was created."),
    primaryLocale: s.nullableString("Primary App Store locale, such as en-US."),
    isOrEverWasMadeForKids: s.nullableBoolean("Whether the app is or has ever been part of the Kids category."),
    contentRightsDeclaration: nullableEnum(
      "Third-party content rights declared for the app.",
      contentRightsDeclarations,
    ),
    streamlinedPurchasingEnabled: s.nullableBoolean("Whether streamlined purchasing is enabled for the app."),
    accessibilityUrl: s.nullableString("Accessibility information URL published with the app."),
    subscriptionStatusUrl: s.nullableString("Production server-to-server subscription status URL."),
    subscriptionStatusUrlVersion: nullableEnum(
      "Version of the production subscription status URL.",
      subscriptionStatusUrlVersions,
    ),
    subscriptionStatusUrlForSandbox: s.nullableString("Sandbox server-to-server subscription status URL."),
    subscriptionStatusUrlVersionForSandbox: nullableEnum(
      "Version of the sandbox subscription status URL.",
      subscriptionStatusUrlVersions,
    ),
  },
);

export const appSummary: JsonSchema = s.nullable(
  s.object(
    "The app a record belongs to, or null when App Store Connect did not return it.",
    {
      id: s.string("App Store Connect identifier for the app."),
      name: s.nullableString("App name shown on the App Store."),
      bundleId: s.nullableString("Bundle identifier registered for the app."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

export const preReleaseVersionSummary: JsonSchema = s.nullable(
  s.object(
    "The prerelease version a build belongs to, or null when it was not returned.",
    {
      id: s.string("App Store Connect identifier for the prerelease version."),
      version: s.nullableString("Marketing version string, such as 1.4.0."),
      platform: nullableEnum("Content platform the version targets.", contentPlatforms),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

export const betaReviewSubmissionFields: Record<string, JsonSchema> = {
  id: s.string("App Store Connect identifier for the beta app review submission."),
  betaReviewState: nullableEnum("State of the TestFlight beta review.", betaReviewStates),
  submittedDate: s.nullableString("When the build was submitted for beta review, as an ISO 8601 timestamp."),
};

export const betaReviewSubmissionSummary: JsonSchema = s.nullable(
  s.object(
    "The TestFlight beta review submission for a build, or null when there is none.",
    betaReviewSubmissionFields,
    { additionalProperties: true, required: ["id"] },
  ),
);

export const buildCoreFields: Record<string, JsonSchema> = {
  version: s.nullableString("Build number, such as 42."),
  uploadedDate: s.nullableString("When the build finished uploading, as an ISO 8601 timestamp."),
  expirationDate: s.nullableString("When the build stops being installable by testers."),
  expired: s.nullableBoolean("Whether the build has expired for TestFlight."),
  processingState: nullableEnum("Processing state of the uploaded build.", buildProcessingStates),
  buildAudienceType: nullableEnum("Distribution audience the build was uploaded for.", buildAudienceTypes),
  preReleaseVersion: preReleaseVersionSummary,
};

export const buildResource: JsonSchema = resourceObject(
  "A build uploaded to App Store Connect.",
  "App Store Connect identifier for the build.",
  {
    ...buildCoreFields,
    minOsVersion: s.nullableString("Minimum OS version the build supports."),
    lsMinimumSystemVersion: s.nullableString("Minimum macOS system version declared by the build."),
    computedMinMacOsVersion: s.nullableString("Minimum macOS version App Store Connect computed for the build."),
    computedMinVisionOsVersion: s.nullableString("Minimum visionOS version App Store Connect computed for the build."),
    usesNonExemptEncryption: s.nullableBoolean("Whether the build declares non-exempt encryption."),
    iconAssetToken: s.nullable(
      s.looseObject("Template URL and pixel size of the build icon asset.", {
        templateUrl: s.string("Template URL with width, height, and format placeholders."),
        width: s.integer("Icon width in pixels."),
        height: s.integer("Icon height in pixels."),
      }),
    ),
  },
  ["preReleaseVersion"],
);

export const buildWithReviewResource: JsonSchema = resourceObject(
  "A build with the related records requested alongside it.",
  "App Store Connect identifier for the build.",
  {
    ...buildCoreFields,
    betaAppReviewSubmission: betaReviewSubmissionSummary,
    app: appSummary,
  },
  ["preReleaseVersion", "betaAppReviewSubmission", "app"],
);

export const preReleaseVersionResource: JsonSchema = resourceObject(
  "A prerelease version that groups TestFlight builds.",
  "App Store Connect identifier for the prerelease version.",
  {
    version: s.nullableString("Marketing version string, such as 1.4.0."),
    platform: nullableEnum("Content platform the version targets.", contentPlatforms),
  },
);

export const betaGroupResource: JsonSchema = resourceObject(
  "A TestFlight beta group.",
  "App Store Connect identifier for the beta group.",
  {
    name: s.nullableString("Group name shown in TestFlight."),
    createdDate: s.nullableString("When the group was created, as an ISO 8601 timestamp."),
    isInternalGroup: s.nullableBoolean("Whether the group is an internal group of team members."),
    hasAccessToAllBuilds: s.nullableBoolean("Whether the group automatically receives every new build."),
    publicLinkEnabled: s.nullableBoolean("Whether a public TestFlight link is enabled for the group."),
    publicLinkId: s.nullableString("Identifier segment of the public TestFlight link."),
    publicLink: s.nullableString("Full public TestFlight invitation link."),
    publicLinkLimitEnabled: s.nullableBoolean("Whether the public link enforces a tester limit."),
    publicLinkLimit: s.nullableInteger("Maximum number of testers who may join through the public link."),
    feedbackEnabled: s.nullableBoolean("Whether testers can send feedback from TestFlight."),
    iosBuildsAvailableForAppleSiliconMac: s.nullableBoolean("Whether iOS builds are offered to Apple silicon Macs."),
    iosBuildsAvailableForAppleVision: s.nullableBoolean("Whether iOS builds are offered to Apple Vision Pro."),
  },
);

export const betaTesterResource: JsonSchema = resourceObject(
  "A TestFlight beta tester.",
  "App Store Connect identifier for the beta tester.",
  {
    email: s.nullableString("Email address the invitation was sent to."),
    firstName: s.nullableString("Tester first name."),
    lastName: s.nullableString("Tester last name."),
    inviteType: nullableEnum("How the tester was invited.", betaInviteTypes),
    state: nullableEnum("Where the tester stands in the invitation flow.", betaTesterStates),
    appDevices: s.nullable(
      s.array(
        "Devices the tester has installed the app on.",
        s.looseObject("One tester device.", {
          model: s.string("Device model name."),
          platform: s.stringEnum("Platform of the device.", devicePlatforms),
          osVersion: s.string("Operating system version on the device."),
          appBuildVersion: s.string("Build number installed on the device."),
        }),
      ),
    ),
  },
);

export const testNotesOutput: Record<string, JsonSchema> = {
  id: s.string("App Store Connect identifier for the beta build localization."),
  locale: s.nullableString("Locale the test notes belong to, such as en-US."),
  whatsNew: s.nullableString("Test notes shown to testers for this locale."),
};

export const appStoreVersionResource: JsonSchema = resourceObject(
  "An App Store version of an app.",
  "App Store Connect identifier for the version.",
  {
    platform: nullableEnum("Content platform the version targets.", contentPlatforms),
    versionString: s.nullableString("Version string shown on the App Store, such as 1.4.0."),
    appVersionState: nullableEnum("Current review and release state.", appVersionStates),
    copyright: s.nullableString("Copyright line published with the version."),
    reviewType: nullableEnum("Review track the version goes through.", appStoreReviewTypes),
    releaseType: nullableEnum("Release behavior after approval.", appStoreReleaseTypes),
    earliestReleaseDate: s.nullableString("Earliest scheduled release time, as an ISO 8601 timestamp."),
    downloadable: s.nullableBoolean("Whether the version is downloadable."),
    createdDate: s.nullableString("When the version record was created, as an ISO 8601 timestamp."),
  },
);

export const reviewResponseFields: Record<string, JsonSchema> = {
  id: s.string("App Store Connect identifier for the response."),
  responseBody: s.nullableString("Text of the developer response."),
  lastModifiedDate: s.nullableString("When the response was last changed, as an ISO 8601 timestamp."),
  state: nullableEnum("Publication state of the response.", reviewResponseStates),
};

export const reviewResponseSummary: JsonSchema = s.nullable(
  s.object("The developer response published for a review, or null when there is none.", reviewResponseFields, {
    additionalProperties: true,
    required: ["id"],
  }),
);

export const customerReviewResource: JsonSchema = resourceObject(
  "A customer review left on the App Store.",
  "App Store Connect identifier for the review.",
  {
    rating: s.nullableInteger("Star rating from 1 to 5."),
    title: s.nullableString("Review title."),
    body: s.nullableString("Review text."),
    reviewerNickname: s.nullableString("Nickname the reviewer publishes under."),
    createdDate: s.nullableString("When the review was written, as an ISO 8601 timestamp."),
    territory: s.nullableString("ISO 3166-1 alpha-3 storefront the review was written in, such as USA."),
    response: reviewResponseSummary,
  },
  ["response"],
);

export const territoryResource: JsonSchema = resourceObject(
  "An App Store territory.",
  "ISO 3166-1 alpha-3 territory code that App Store Connect uses as the territory identifier, such as USA.",
  {
    currency: s.nullableString("ISO 4217 code of the currency prices in the territory are expressed in, such as USD."),
  },
);

export const userResource: JsonSchema = resourceObject(
  "A member of the App Store Connect team.",
  "App Store Connect identifier for the user.",
  {
    username: s.nullableString("Apple Account email the user signs in with."),
    firstName: s.nullableString("User first name."),
    lastName: s.nullableString("User last name."),
    roles: s.nullable(
      s.array("Roles granted to the user.", s.stringEnum("An App Store Connect team role.", teamRoles)),
    ),
    allAppsVisible: s.nullableBoolean("Whether the user can see every app on the team."),
    provisioningAllowed: s.nullableBoolean("Whether the user may manage certificates, identifiers, and profiles."),
  },
);

export const gameCenterVersionStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "ACCEPTED",
  "PENDING_RELEASE",
  "LIVE",
  "REPLACED_WITH_NEW_VERSION",
];

export const gameCenterAssetDeliveryStates: readonly string[] = [
  "AWAITING_UPLOAD",
  "UPLOAD_COMPLETE",
  "COMPLETE",
  "FAILED",
];

export const configureGameCenterRoles: readonly string[] = [
  "Account Holder",
  "Admin",
  "App Manager",
  "Developer",
  "Marketing",
];

export const manageGameCenterPlayersRoles: readonly string[] = ["Account Holder", "Admin", "App Manager"];

export const gameCenterVersionFields: Record<string, JsonSchema> = {
  version: s.nullableInteger("Version number App Store Connect assigned to this version."),
  state: nullableEnum("Review and release state of the version.", gameCenterVersionStates),
};

export const gameCenterImageResource = (description: string, idDescription: string): JsonSchema =>
  resourceObject(description, idDescription, {
    fileSize: s.nullableInteger("Size of the uploaded image file in bytes."),
    fileName: s.nullableString("File name the image was uploaded under."),
    imageAsset: s.nullable(
      s.looseObject("Template URL and pixel size of the delivered image.", {
        templateUrl: s.string("Template URL with width, height, and format placeholders."),
        width: s.integer("Image width in pixels."),
        height: s.integer("Image height in pixels."),
      }),
    ),
    assetDeliveryState: s.nullable(
      s.looseObject("Upload and delivery state of the image.", {
        state: nullableEnum("Delivery state of the image asset.", gameCenterAssetDeliveryStates),
        errors: s.nullable(
          s.array(
            "Delivery errors App Store Connect reported for the image.",
            s.looseObject("One delivery error.", {
              code: s.nullableString("Error code."),
              description: s.nullableString("Human readable error description."),
            }),
          ),
        ),
        warnings: s.nullable(
          s.array(
            "Delivery warnings App Store Connect reported for the image.",
            s.looseObject("One delivery warning.", {
              code: s.nullableString("Warning code."),
              description: s.nullableString("Human readable warning description."),
            }),
          ),
        ),
      }),
    ),
  });
