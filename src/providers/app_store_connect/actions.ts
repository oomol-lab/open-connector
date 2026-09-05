import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "app_store_connect";

const contentPlatforms = ["IOS", "MAC_OS", "TV_OS", "VISION_OS"];
/** Tester devices are the only records where App Store Connect reports a watchOS platform. */
const devicePlatforms = ["IOS", "MAC_OS", "TV_OS", "WATCH_OS", "VISION_OS"];
const buildProcessingStates = ["PROCESSING", "FAILED", "INVALID", "VALID"];
const buildAudienceTypes = ["INTERNAL_ONLY", "APP_STORE_ELIGIBLE"];
const betaReviewStates = ["WAITING_FOR_REVIEW", "IN_REVIEW", "REJECTED", "APPROVED"];
const betaTesterStates = ["NOT_INVITED", "INVITED", "ACCEPTED", "INSTALLED", "REVOKED"];
const betaInviteTypes = ["EMAIL", "PUBLIC_LINK"];
const appStoreReviewTypes = ["APP_STORE", "NOTARIZATION"];
const appStoreReleaseTypes = ["MANUAL", "AFTER_APPROVAL", "SCHEDULED"];
const reviewResponseStates = ["PUBLISHED", "PENDING_PUBLISH"];
const contentRightsDeclarations = ["DOES_NOT_USE_THIRD_PARTY_CONTENT", "USES_THIRD_PARTY_CONTENT"];
const subscriptionStatusUrlVersions = ["V1", "V2"];
const appVersionStates = [
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
const teamRoles = [
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

// Apple's TestFlight capability for creating and editing beta groups and testers.
const manageTestFlightRoles = ["Account Holder", "Admin", "App Manager"];
// Apple's TestFlight capability for submitting builds to beta review and editing their test details.
const manageTestFlightBuildsRoles = [...manageTestFlightRoles, "Developer"];
// Apple's "View ratings and reviews" capability.
const viewReviewsRoles = [...manageTestFlightBuildsRoles, "Marketing", "Sales", "Customer Support"];
// Apple's "Reply to ratings and reviews" capability.
const respondToReviewsRoles = [...manageTestFlightRoles, "Marketing", "Customer Support"];
// Apple's Users and Access area, which only the account-wide roles can read.
const usersAndAccessRoles = ["Account Holder", "Admin"];

/** How this provider reports an attribute App Store Connect has no value for. */
const absentAttributeNote =
  "An attribute App Store Connect has no value for is returned as null, and older records may leave it out entirely.";

const limitInput = s.integer("Maximum number of records to return on this page. App Store Connect allows up to 200.", {
  minimum: 1,
  maximum: 200,
});
const cursorInput = s.nonEmptyString(
  "Opaque page cursor taken from the nextCursor value of a previous response for the same query.",
);
const nextCursorOutput = s.nullableString(
  "Cursor to pass back as cursor for the next page, or null when this was the last page.",
);
const totalOutput = s.nullableInteger(
  "Total number of records matching the query when App Store Connect reports one, otherwise null.",
);

const appResource = s.object(
  `An app registered in App Store Connect. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the app."),
    name: s.nullableString("App name shown on the App Store."),
    bundleId: s.nullableString("Bundle identifier registered for the app."),
    sku: s.nullableString("SKU chosen when the app record was created."),
    primaryLocale: s.nullableString("Primary App Store locale, such as en-US."),
    isOrEverWasMadeForKids: s.nullableBoolean("Whether the app is or has ever been part of the Kids category."),
    contentRightsDeclaration: s.nullable(
      s.stringEnum("Third-party content rights declared for the app.", contentRightsDeclarations),
    ),
    streamlinedPurchasingEnabled: s.nullableBoolean("Whether streamlined purchasing is enabled for the app."),
    accessibilityUrl: s.nullableString("Accessibility information URL published with the app."),
    subscriptionStatusUrl: s.nullableString("Production server-to-server subscription status URL."),
    subscriptionStatusUrlVersion: s.nullable(
      s.stringEnum("Version of the production subscription status URL.", subscriptionStatusUrlVersions),
    ),
    subscriptionStatusUrlForSandbox: s.nullableString("Sandbox server-to-server subscription status URL."),
    subscriptionStatusUrlVersionForSandbox: s.nullable(
      s.stringEnum("Version of the sandbox subscription status URL.", subscriptionStatusUrlVersions),
    ),
  },
  { required: ["id"], additionalProperties: true },
);

const appSummary = s.nullable(
  s.object(
    "The app a record belongs to, or null when App Store Connect did not return it.",
    {
      id: s.string("App Store Connect identifier for the app."),
      name: s.nullableString("App name shown on the App Store."),
      bundleId: s.nullableString("Bundle identifier registered for the app."),
    },
    { required: ["id"], additionalProperties: true },
  ),
);

const preReleaseVersionSummary = s.nullable(
  s.object(
    "The prerelease version a build belongs to, or null when it was not returned.",
    {
      id: s.string("App Store Connect identifier for the prerelease version."),
      version: s.nullableString("Marketing version string, such as 1.4.0."),
      platform: s.nullable(s.stringEnum("Content platform the version targets.", contentPlatforms)),
    },
    { required: ["id"], additionalProperties: true },
  ),
);

const betaReviewSubmissionFields = {
  id: s.string("App Store Connect identifier for the beta app review submission."),
  betaReviewState: s.nullable(s.stringEnum("State of the TestFlight beta review.", betaReviewStates)),
  submittedDate: s.nullableString("When the build was submitted for beta review, as an ISO 8601 timestamp."),
};

const betaReviewSubmissionSummary = s.nullable(
  s.object(
    "The TestFlight beta review submission for a build, or null when there is none.",
    betaReviewSubmissionFields,
    { required: ["id"], additionalProperties: true },
  ),
);

const buildCoreFields = {
  id: s.string("App Store Connect identifier for the build."),
  version: s.nullableString("Build number, such as 42."),
  uploadedDate: s.nullableString("When the build finished uploading, as an ISO 8601 timestamp."),
  expirationDate: s.nullableString("When the build stops being installable by testers."),
  expired: s.nullableBoolean("Whether the build has expired for TestFlight."),
  processingState: s.nullable(s.stringEnum("Processing state of the uploaded build.", buildProcessingStates)),
  buildAudienceType: s.nullable(s.stringEnum("Distribution audience the build was uploaded for.", buildAudienceTypes)),
  preReleaseVersion: preReleaseVersionSummary,
};

const buildResource = s.object(
  `A build uploaded to App Store Connect. ${absentAttributeNote}`,
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
  { required: ["id", "preReleaseVersion"], additionalProperties: true },
);

const buildWithReviewResource = s.object(
  `A build with the related records requested alongside it. ${absentAttributeNote}`,
  {
    ...buildCoreFields,
    betaAppReviewSubmission: betaReviewSubmissionSummary,
    app: appSummary,
  },
  { required: ["id", "preReleaseVersion", "betaAppReviewSubmission", "app"], additionalProperties: true },
);

const preReleaseVersionResource = s.object(
  `A prerelease version that groups TestFlight builds. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the prerelease version."),
    version: s.nullableString("Marketing version string, such as 1.4.0."),
    platform: s.nullable(s.stringEnum("Content platform the version targets.", contentPlatforms)),
  },
  { required: ["id"], additionalProperties: true },
);

const betaGroupResource = s.object(
  `A TestFlight beta group. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the beta group."),
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
  { required: ["id"], additionalProperties: true },
);

const betaTesterResource = s.object(
  `A TestFlight beta tester. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the beta tester."),
    email: s.nullableString("Email address the invitation was sent to."),
    firstName: s.nullableString("Tester first name."),
    lastName: s.nullableString("Tester last name."),
    inviteType: s.nullable(s.stringEnum("How the tester was invited.", betaInviteTypes)),
    state: s.nullable(s.stringEnum("Where the tester stands in the invitation flow.", betaTesterStates)),
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
  { required: ["id"], additionalProperties: true },
);

const testNotesOutput = {
  id: s.string("App Store Connect identifier for the beta build localization."),
  locale: s.nullableString("Locale the test notes belong to, such as en-US."),
  whatsNew: s.nullableString("Test notes shown to testers for this locale."),
};

const appStoreVersionResource = s.object(
  `An App Store version of an app. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the version."),
    platform: s.nullable(s.stringEnum("Content platform the version targets.", contentPlatforms)),
    versionString: s.nullableString("Version string shown on the App Store, such as 1.4.0."),
    appVersionState: s.nullable(s.stringEnum("Current review and release state.", appVersionStates)),
    copyright: s.nullableString("Copyright line published with the version."),
    reviewType: s.nullable(s.stringEnum("Review track the version goes through.", appStoreReviewTypes)),
    releaseType: s.nullable(s.stringEnum("Release behaviour after approval.", appStoreReleaseTypes)),
    earliestReleaseDate: s.nullableString("Earliest scheduled release time, as an ISO 8601 timestamp."),
    downloadable: s.nullableBoolean("Whether the version is downloadable."),
    createdDate: s.nullableString("When the version record was created, as an ISO 8601 timestamp."),
  },
  { required: ["id"], additionalProperties: true },
);

const reviewResponseFields = {
  id: s.string("App Store Connect identifier for the response."),
  responseBody: s.nullableString("Text of the developer response."),
  lastModifiedDate: s.nullableString("When the response was last changed, as an ISO 8601 timestamp."),
  state: s.nullable(s.stringEnum("Publication state of the response.", reviewResponseStates)),
};

const reviewResponseSummary = s.nullable(
  s.object("The developer response published for a review, or null when there is none.", reviewResponseFields, {
    required: ["id"],
    additionalProperties: true,
  }),
);

const customerReviewResource = s.object(
  `A customer review left on the App Store. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the review."),
    rating: s.nullableInteger("Star rating from 1 to 5."),
    title: s.nullableString("Review title."),
    body: s.nullableString("Review text."),
    reviewerNickname: s.nullableString("Nickname the reviewer publishes under."),
    createdDate: s.nullableString("When the review was written, as an ISO 8601 timestamp."),
    territory: s.nullableString("ISO 3166-1 alpha-3 storefront the review was written in, such as USA."),
    response: reviewResponseSummary,
  },
  { required: ["id", "response"], additionalProperties: true },
);

const userResource = s.object(
  `A member of the App Store Connect team. ${absentAttributeNote}`,
  {
    id: s.string("App Store Connect identifier for the user."),
    username: s.nullableString("Apple Account email the user signs in with."),
    firstName: s.nullableString("User first name."),
    lastName: s.nullableString("User last name."),
    roles: s.nullable(
      s.array("Roles granted to the user.", s.stringEnum("An App Store Connect team role.", teamRoles)),
    ),
    allAppsVisible: s.nullableBoolean("Whether the user can see every app on the team."),
    provisioningAllowed: s.nullableBoolean("Whether the user may manage certificates, identifiers, and profiles."),
  },
  { required: ["id"], additionalProperties: true },
);

function deletedOutput(description: string): Record<string, JsonSchema> {
  return {
    id: s.string(description),
    deleted: s.boolean("Always true once App Store Connect confirmed the deletion."),
  };
}

export const appStoreConnectActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apps",
    description: "List the apps the API key can see, optionally filtered by bundle identifier, name, or SKU.",
    inputSchema: s.object(
      "Filters for browsing App Store Connect apps.",
      {
        bundleId: s.nonEmptyString("Return only the app with this exact bundle identifier."),
        name: s.nonEmptyString("Return only apps with this exact name."),
        sku: s.nonEmptyString("Return only the app with this exact SKU."),
        sort: s.stringEnum("Sort order for the returned apps.", [
          "name",
          "-name",
          "bundleId",
          "-bundleId",
          "sku",
          "-sku",
        ]),
        limit: limitInput,
        cursor: cursorInput,
      },
      { optional: ["bundleId", "name", "sku", "sort", "limit", "cursor"] },
    ),
    outputSchema: s.actionOutput(
      {
        apps: s.array("Apps returned for this page.", appResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of App Store Connect apps.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_app",
    description: "Read one app record by its App Store Connect identifier.",
    inputSchema: s.actionInput(
      { appId: s.nonEmptyString("App Store Connect identifier of the app.") },
      ["appId"],
      "Identifies the app to read.",
    ),
    outputSchema: s.actionOutput({ app: appResource }, "The requested app."),
  }),

  defineProviderAction(service, {
    name: "list_builds",
    description:
      "List builds uploaded for one app, with the prerelease version each build belongs to. Filter by version, platform, processing state, or TestFlight review state.",
    inputSchema: s.object(
      "Filters for browsing the builds of one app.",
      {
        appId: s.nonEmptyString("App Store Connect identifier of the app whose builds to list."),
        version: s.nonEmptyString("Return only builds with this build number, such as 42."),
        preReleaseVersion: s.nonEmptyString("Return only builds under this marketing version, such as 1.4.0."),
        platform: s.stringEnum("Return only builds for this content platform.", contentPlatforms),
        processingState: s.stringEnum("Return only builds in this processing state.", buildProcessingStates),
        betaReviewState: s.stringEnum(
          "Return only builds whose beta review submission is in this state.",
          betaReviewStates,
        ),
        expired: s.boolean("Return only expired builds when true, or only unexpired builds when false."),
        sort: s.stringEnum("Sort order for the returned builds.", [
          "version",
          "-version",
          "uploadedDate",
          "-uploadedDate",
          "preReleaseVersion",
          "-preReleaseVersion",
        ]),
        limit: limitInput,
        cursor: cursorInput,
      },
      { required: ["appId"] },
    ),
    outputSchema: s.actionOutput(
      {
        builds: s.array("Builds returned for this page.", buildResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of builds for one app.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_build",
    description:
      "Read one build together with its prerelease version, its TestFlight review submission, and the app it belongs to.",
    inputSchema: s.actionInput(
      { buildId: s.nonEmptyString("App Store Connect identifier of the build.") },
      ["buildId"],
      "Identifies the build to read.",
    ),
    outputSchema: s.actionOutput({ build: buildWithReviewResource }, "The requested build and its related records."),
  }),

  defineProviderAction(service, {
    name: "list_pre_release_versions",
    description: "List the prerelease versions of one app, which group its TestFlight builds by marketing version.",
    inputSchema: s.object(
      "Filters for browsing prerelease versions.",
      {
        appId: s.nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Return only prerelease versions for this content platform.", contentPlatforms),
        version: s.nonEmptyString("Return only the prerelease version with this exact version string."),
        sort: s.stringEnum("Sort order for the returned prerelease versions.", ["version", "-version"]),
        limit: limitInput,
        cursor: cursorInput,
      },
      { required: ["appId"] },
    ),
    outputSchema: s.actionOutput(
      {
        preReleaseVersions: s.array("Prerelease versions returned for this page.", preReleaseVersionResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of prerelease versions.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_beta_groups",
    description: "List the TestFlight groups of one app, including the public invitation link of each group.",
    inputSchema: s.object(
      "Filters for browsing TestFlight groups.",
      {
        appId: s.nonEmptyString("App Store Connect identifier of the app."),
        name: s.nonEmptyString("Return only the group with this exact name."),
        isInternalGroup: s.boolean("Return only internal groups when true, or only external groups when false."),
        publicLinkEnabled: s.boolean("Return only groups whose public link is enabled or disabled."),
        limit: limitInput,
        cursor: cursorInput,
      },
      { required: ["appId"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroups: s.array("TestFlight groups returned for this page.", betaGroupResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of TestFlight groups.",
    ),
  }),

  defineProviderAction(service, {
    name: "create_beta_group",
    description: "Create a TestFlight group for an app, optionally enabling its public invitation link.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.object(
      "The TestFlight group to create.",
      {
        appId: s.nonEmptyString("App Store Connect identifier of the app the group belongs to."),
        name: s.nonEmptyString("Group name shown in TestFlight."),
        publicLinkEnabled: s.boolean("Enable a public TestFlight invitation link for the group."),
        publicLinkLimitEnabled: s.boolean("Enforce a maximum number of testers joining through the public link."),
        publicLinkLimit: s.positiveInteger("Maximum number of testers allowed to join through the public link."),
        feedbackEnabled: s.boolean("Let testers send feedback from TestFlight."),
        hasAccessToAllBuilds: s.boolean("Automatically give the group every new build of the app."),
      },
      { required: ["appId", "name"] },
    ),
    outputSchema: s.actionOutput({ betaGroup: betaGroupResource }, "The created TestFlight group."),
  }),

  defineProviderAction(service, {
    name: "delete_beta_group",
    description: "Delete a TestFlight group. Testers who only belonged to that group lose access to its builds.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.actionInput(
      { betaGroupId: s.nonEmptyString("App Store Connect identifier of the TestFlight group.") },
      ["betaGroupId"],
      "Identifies the TestFlight group to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted TestFlight group."),
      "Confirmation that the TestFlight group was deleted.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_beta_testers",
    description: "List TestFlight testers, optionally narrowed to one app, group, or build.",
    inputSchema: s.object(
      "Filters for browsing TestFlight testers.",
      {
        email: s.email("Return only the tester with this exact email address."),
        firstName: s.nonEmptyString("Return only testers with this exact first name."),
        lastName: s.nonEmptyString("Return only testers with this exact last name."),
        inviteType: s.stringEnum("Return only testers invited this way.", betaInviteTypes),
        appId: s.nonEmptyString("Return only testers who have access to this app."),
        betaGroupId: s.nonEmptyString("Return only testers who belong to this TestFlight group."),
        buildId: s.nonEmptyString("Return only testers who were assigned this build individually."),
        sort: s.stringEnum("Sort order for the returned testers.", [
          "firstName",
          "-firstName",
          "lastName",
          "-lastName",
          "email",
          "-email",
          "inviteType",
          "-inviteType",
          "state",
          "-state",
        ]),
        limit: limitInput,
        cursor: cursorInput,
      },
      {
        optional: [
          "email",
          "firstName",
          "lastName",
          "inviteType",
          "appId",
          "betaGroupId",
          "buildId",
          "sort",
          "limit",
          "cursor",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        betaTesters: s.array("TestFlight testers returned for this page.", betaTesterResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of TestFlight testers.",
    ),
  }),

  defineProviderAction(service, {
    name: "create_beta_tester",
    description:
      "Invite a TestFlight tester by email. App Store Connect only creates a tester that is assigned to something, so pass at least one of betaGroupIds or buildIds.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.object(
      "The TestFlight tester to invite.",
      {
        email: s.email("Email address the TestFlight invitation is sent to."),
        firstName: s.nonEmptyString("Tester first name."),
        lastName: s.nonEmptyString("Tester last name."),
        betaGroupIds: s.stringArray("TestFlight groups to add the tester to. Required unless buildIds is given.", {
          minItems: 1,
        }),
        buildIds: s.stringArray("Builds to assign to the tester individually. Required unless betaGroupIds is given.", {
          minItems: 1,
        }),
      },
      { required: ["email"] },
    ),
    outputSchema: s.actionOutput({ betaTester: betaTesterResource }, "The invited TestFlight tester."),
  }),

  defineProviderAction(service, {
    name: "delete_beta_tester",
    description: "Remove a TestFlight tester from the team, revoking their access to every build and group.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.actionInput(
      { betaTesterId: s.nonEmptyString("App Store Connect identifier of the TestFlight tester.") },
      ["betaTesterId"],
      "Identifies the TestFlight tester to remove.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed TestFlight tester."),
      "Confirmation that the TestFlight tester was removed.",
    ),
  }),

  defineProviderAction(service, {
    name: "add_beta_testers_to_group",
    description: "Add existing TestFlight testers to one group so they receive the builds that group can install.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.object(
      "The testers to add to a TestFlight group.",
      {
        betaGroupId: s.nonEmptyString("App Store Connect identifier of the TestFlight group."),
        betaTesterIds: s.stringArray("Identifiers of the testers to add.", { minItems: 1 }),
      },
      { required: ["betaGroupId", "betaTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroupId: s.string("The TestFlight group the testers were added to."),
        betaTesterIds: s.stringArray("Identifiers of the testers that were added."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the testers were added to the group.",
    ),
  }),

  defineProviderAction(service, {
    name: "remove_beta_testers_from_group",
    description:
      "Remove testers from one TestFlight group. The testers stay on the team and keep access through their other groups.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.object(
      "The testers to remove from a TestFlight group.",
      {
        betaGroupId: s.nonEmptyString("App Store Connect identifier of the TestFlight group."),
        betaTesterIds: s.stringArray("Identifiers of the testers to remove.", { minItems: 1 }),
      },
      { required: ["betaGroupId", "betaTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroupId: s.string("The TestFlight group the testers were removed from."),
        betaTesterIds: s.stringArray("Identifiers of the testers that were removed."),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the testers were removed from the group.",
    ),
  }),

  defineProviderAction(service, {
    name: "add_build_to_beta_groups",
    description: "Make one build available to TestFlight groups so their testers can install it.",
    providerPermissions: manageTestFlightRoles,
    inputSchema: s.object(
      "The build to distribute and the groups that should receive it.",
      {
        buildId: s.nonEmptyString("App Store Connect identifier of the build."),
        betaGroupIds: s.stringArray("Identifiers of the TestFlight groups to add the build to.", { minItems: 1 }),
      },
      { required: ["buildId", "betaGroupIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build that was distributed."),
        betaGroupIds: s.stringArray("Identifiers of the groups the build was added to."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the build was added to the groups.",
    ),
  }),

  defineProviderAction(service, {
    name: "submit_build_for_beta_review",
    description: "Submit a build for TestFlight beta review, which external groups require before they can install it.",
    providerPermissions: manageTestFlightBuildsRoles,
    inputSchema: s.actionInput(
      { buildId: s.nonEmptyString("App Store Connect identifier of the build to submit.") },
      ["buildId"],
      "Identifies the build to submit for beta review.",
    ),
    outputSchema: s.actionOutput({ ...betaReviewSubmissionFields }, "The created beta app review submission."),
  }),

  defineProviderAction(service, {
    name: "update_build_test_notes",
    description:
      'Set the "What to Test" notes a build shows testers in one locale. Updates the existing notes for that locale, or creates them when the locale has none yet.',
    providerPermissions: manageTestFlightBuildsRoles,
    inputSchema: s.object(
      "The test notes to publish for one build and locale.",
      {
        buildId: s.nonEmptyString("App Store Connect identifier of the build."),
        locale: s.nonEmptyString("TestFlight locale the notes are written in, such as en-US."),
        whatsNew: s.nonEmptyString("Test notes shown to testers in that locale."),
      },
      { required: ["buildId", "locale", "whatsNew"] },
    ),
    outputSchema: s.actionOutput(
      {
        ...testNotesOutput,
        created: s.boolean("True when the locale had no notes yet and they were created."),
      },
      "The stored test notes for one build and locale.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_app_store_versions",
    description: "List the App Store versions of one app, with the review and release state of each version.",
    inputSchema: s.object(
      "Filters for browsing the App Store versions of one app.",
      {
        appId: s.nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Return only versions for this content platform.", contentPlatforms),
        versionString: s.nonEmptyString("Return only the version with this exact version string."),
        appVersionState: s.stringEnum("Return only versions in this review and release state.", appVersionStates),
        limit: limitInput,
        cursor: cursorInput,
      },
      { required: ["appId"] },
    ),
    outputSchema: s.actionOutput(
      {
        appStoreVersions: s.array("App Store versions returned for this page.", appStoreVersionResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of App Store versions.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_app_store_version",
    description: "Read one App Store version by its App Store Connect identifier.",
    inputSchema: s.actionInput(
      { appStoreVersionId: s.nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version to read.",
    ),
    outputSchema: s.actionOutput({ appStoreVersion: appStoreVersionResource }, "The requested App Store version."),
  }),

  defineProviderAction(service, {
    name: "list_customer_reviews",
    description:
      "List the App Store reviews of one app together with the developer response published for each review.",
    providerPermissions: viewReviewsRoles,
    inputSchema: s.object(
      "Filters for browsing the reviews of one app.",
      {
        appId: s.nonEmptyString("App Store Connect identifier of the app."),
        rating: s.integer("Return only reviews with this star rating.", { minimum: 1, maximum: 5 }),
        territory: s.nonEmptyString(
          "Return only reviews written in this storefront, as an ISO 3166-1 alpha-3 code such as USA or DEU.",
          { pattern: "^[A-Z]{3}$" },
        ),
        hasResponse: s.boolean("Return only reviews that already have a developer response, or only those without."),
        sort: s.stringEnum("Sort order for the returned reviews.", [
          "rating",
          "-rating",
          "createdDate",
          "-createdDate",
        ]),
        limit: limitInput,
        cursor: cursorInput,
      },
      { required: ["appId"] },
    ),
    outputSchema: s.actionOutput(
      {
        customerReviews: s.array("Reviews returned for this page.", customerReviewResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of App Store reviews.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_customer_review",
    description: "Read one App Store review together with the developer response published for it.",
    providerPermissions: viewReviewsRoles,
    inputSchema: s.actionInput(
      { customerReviewId: s.nonEmptyString("App Store Connect identifier of the review.") },
      ["customerReviewId"],
      "Identifies the review to read.",
    ),
    outputSchema: s.actionOutput({ customerReview: customerReviewResource }, "The requested App Store review."),
  }),

  defineProviderAction(service, {
    name: "respond_to_customer_review",
    description:
      "Publish a developer response to an App Store review. App Store Connect treats this as an upsert: an existing response for the same review is replaced, and publication is asynchronous.",
    providerPermissions: respondToReviewsRoles,
    inputSchema: s.object(
      "The response to publish for one review.",
      {
        customerReviewId: s.nonEmptyString("App Store Connect identifier of the review to respond to."),
        responseBody: s.nonEmptyString("Text of the developer response."),
      },
      { required: ["customerReviewId", "responseBody"] },
    ),
    outputSchema: s.actionOutput(
      {
        customerReviewResponse: s.object("The stored developer response.", reviewResponseFields, {
          required: ["id"],
          additionalProperties: true,
        }),
      },
      "The published or updated developer response.",
    ),
  }),

  defineProviderAction(service, {
    name: "delete_customer_review_response",
    description: "Remove a published developer response from an App Store review.",
    providerPermissions: respondToReviewsRoles,
    inputSchema: s.actionInput(
      { customerReviewResponseId: s.nonEmptyString("App Store Connect identifier of the developer response.") },
      ["customerReviewResponseId"],
      "Identifies the developer response to remove.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed developer response."),
      "Confirmation that the developer response was removed.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_users",
    description: "List the members of the App Store Connect team, with the roles granted to each of them.",
    providerPermissions: usersAndAccessRoles,
    inputSchema: s.object(
      "Filters for browsing team members.",
      {
        roles: s.array(
          "Return only users holding at least one of these roles.",
          s.stringEnum("An App Store Connect team role.", teamRoles),
          { minItems: 1 },
        ),
        username: s.nonEmptyString("Return only the user with this exact Apple Account email."),
        visibleAppId: s.nonEmptyString("Return only users who can see this app."),
        sort: s.stringEnum("Sort order for the returned users.", ["username", "-username", "lastName", "-lastName"]),
        limit: limitInput,
        cursor: cursorInput,
      },
      { optional: ["roles", "username", "visibleAppId", "sort", "limit", "cursor"] },
    ),
    outputSchema: s.actionOutput(
      {
        users: s.array("Team members returned for this page.", userResource),
        nextCursor: nextCursorOutput,
        total: totalOutput,
      },
      "A page of App Store Connect team members.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_user",
    description: "Read one App Store Connect team member by identifier.",
    providerPermissions: usersAndAccessRoles,
    inputSchema: s.actionInput(
      { userId: s.nonEmptyString("App Store Connect identifier of the team member.") },
      ["userId"],
      "Identifies the team member to read.",
    ),
    outputSchema: s.actionOutput({ user: userResource }, "The requested team member."),
  }),
];
