import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appResource,
  betaGroupResource,
  betaReviewStates,
  betaReviewSubmissionFields,
  betaTesterResource,
  buildCoreFields,
  buildResource,
  deletedOutput,
  emailString,
  manageTestFlightBuildsRoles,
  manageTestFlightRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  preReleaseVersionResource,
  resourceObject,
} from "./schemas.ts";

export const internalBetaStates: readonly string[] = [
  "PROCESSING",
  "PROCESSING_EXCEPTION",
  "MISSING_EXPORT_COMPLIANCE",
  "READY_FOR_BETA_TESTING",
  "IN_BETA_TESTING",
  "EXPIRED",
  "IN_EXPORT_COMPLIANCE_REVIEW",
];
export const externalBetaStates: readonly string[] = [
  ...internalBetaStates,
  "READY_FOR_BETA_SUBMISSION",
  "WAITING_FOR_BETA_REVIEW",
  "IN_BETA_REVIEW",
  "BETA_REJECTED",
  "BETA_APPROVED",
  "NOT_APPLICABLE",
];

const buildAttributesResource = resourceObject(
  "A build uploaded to App Store Connect, without its related records.",
  "App Store Connect identifier for the build.",
  {
    version: buildCoreFields.version,
    uploadedDate: buildCoreFields.uploadedDate,
    expirationDate: buildCoreFields.expirationDate,
    expired: buildCoreFields.expired,
    processingState: buildCoreFields.processingState,
    buildAudienceType: buildCoreFields.buildAudienceType,
    minOsVersion: s.nullableString("Minimum OS version the build supports."),
    lsMinimumSystemVersion: s.nullableString("Minimum macOS system version declared by the build."),
    computedMinMacOsVersion: s.nullableString("Minimum macOS version App Store Connect computed for the build."),
    computedMinVisionOsVersion: s.nullableString("Minimum visionOS version App Store Connect computed for the build."),
    usesNonExemptEncryption: s.nullableBoolean("Whether the build declares non-exempt encryption."),
  },
);

const buildBetaDetailResource = resourceObject(
  "TestFlight distribution details of one build.",
  "App Store Connect identifier for the build beta detail.",
  {
    autoNotifyEnabled: s.nullableBoolean(
      "Whether testers are notified automatically when the build becomes available.",
    ),
    internalBuildState: nullableEnum("Where the build stands for internal TestFlight testers.", internalBetaStates),
    externalBuildState: nullableEnum(
      "Where the build stands for external TestFlight testers, including beta review.",
      externalBetaStates,
    ),
  },
);

const betaBuildLocalizationResource = resourceObject(
  'The "What to Test" notes of one build in one locale.',
  "App Store Connect identifier for the beta build localization.",
  {
    locale: s.nullableString("Locale the test notes belong to, such as en-US."),
    whatsNew: s.nullableString("Test notes shown to testers for this locale."),
  },
);

const betaAppReviewDetailResource = resourceObject(
  "Contact and demo account information Apple uses when reviewing the app for TestFlight.",
  "App Store Connect identifier for the beta app review detail.",
  {
    contactFirstName: s.nullableString("First name of the person Apple contacts about the review."),
    contactLastName: s.nullableString("Last name of the review contact."),
    contactPhone: s.nullableString("Phone number of the review contact."),
    contactEmail: s.nullableString("Email address of the review contact."),
    demoAccountName: s.nullableString("Username of the demo account reviewers sign in with."),
    demoAccountPassword: s.nullableString("Password of the demo account reviewers sign in with."),
    demoAccountRequired: s.nullableBoolean("Whether reviewers need a demo account to test the app."),
    notes: s.nullableString("Additional notes for the beta review team."),
  },
);

const betaAppLocalizationResource = resourceObject(
  "TestFlight test information of an app in one locale.",
  "App Store Connect identifier for the beta app localization.",
  {
    locale: s.nullableString("Locale the test information is written in, such as en-US."),
    description: s.nullableString("Description of the app shown to testers in TestFlight."),
    feedbackEmail: s.nullableString("Email address testers send feedback to."),
    marketingUrl: s.nullableString("Marketing URL shown to testers."),
    privacyPolicyUrl: s.nullableString("Privacy policy URL shown to testers."),
    tvOsPrivacyPolicy: s.nullableString("Privacy policy text shown to tvOS testers."),
  },
);

const betaLicenseAgreementResource = resourceObject(
  "The license agreement TestFlight testers accept before installing the app.",
  "App Store Connect identifier for the beta license agreement.",
  { agreementText: s.nullableString("Full text of the beta license agreement.") },
);

const betaAppReviewSubmissionResource = resourceObject(
  "A TestFlight beta review submission of one build.",
  "App Store Connect identifier for the beta app review submission.",
  {
    betaReviewState: betaReviewSubmissionFields.betaReviewState,
    submittedDate: betaReviewSubmissionFields.submittedDate,
  },
);

const betaTesterIdList = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "App Store Connect identifier of a TestFlight tester.",
  });
const buildIdList = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "App Store Connect identifier of a build.",
  });
const betaGroupIdList = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "App Store Connect identifier of a TestFlight group.",
  });

const buildIdInput = nonEmptyString("App Store Connect identifier of the build.");
const appIdInput = nonEmptyString("App Store Connect identifier of the app.");
const betaGroupIdInput = nonEmptyString("App Store Connect identifier of the TestFlight group.");
const betaTesterIdInput = nonEmptyString("App Store Connect identifier of the TestFlight tester.");
const confirmed = (description: string) =>
  s.boolean(`${description} Always true once App Store Connect confirmed the change.`);

export const appStoreConnectTestFlightBuildActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "update_build",
    operationType: "destructive",
    description:
      "Change the TestFlight flags of one build: expire it so testers can no longer install it, or record whether it uses non-exempt encryption. Expiring a build cannot be undone. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The build flags to change.",
      {
        buildId: buildIdInput,
        expired: s.boolean("Set to true to expire the build for TestFlight."),
        usesNonExemptEncryption: s.boolean(
          "Whether the build uses encryption that is not exempt from export compliance.",
        ),
      },
      { required: ["buildId"] },
    ),
    outputSchema: s.actionOutput({ build: buildAttributesResource }, "The updated build."),
  }),
  defineProviderAction(service, {
    name: "list_build_individual_testers",
    operationType: "read",
    description: "List the TestFlight testers who were assigned one build individually, outside of any group.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the build whose individual testers to list.",
      { buildId: buildIdInput, ...paginationInputs },
      { required: ["buildId"] },
    ),
    outputSchema: pageOutput(
      "betaTesters",
      betaTesterResource,
      "Individual testers returned for this page.",
      "A page of testers assigned to the build individually.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_individual_testers_to_build",
    operationType: "write",
    description:
      "Assign existing TestFlight testers to one build individually so they can install it without belonging to a group.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The testers to assign to a build.",
      {
        buildId: buildIdInput,
        betaTesterIds: betaTesterIdList("Identifiers of the testers to assign."),
      },
      { required: ["buildId", "betaTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build the testers were assigned to."),
        betaTesterIds: s.stringArray("Identifiers of the testers that were assigned.", {
          itemDescription: "App Store Connect identifier of a TestFlight tester.",
        }),
        added: confirmed("Whether the testers were assigned."),
      },
      "Confirmation that the testers were assigned to the build.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_individual_testers_from_build",
    operationType: "destructive",
    description:
      "Remove the individual assignment of TestFlight testers from one build. Testers keep access through any group that has the build.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The testers to unassign from a build.",
      {
        buildId: buildIdInput,
        betaTesterIds: betaTesterIdList("Identifiers of the testers to unassign."),
      },
      { required: ["buildId", "betaTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build the testers were unassigned from."),
        betaTesterIds: s.stringArray("Identifiers of the testers that were unassigned.", {
          itemDescription: "App Store Connect identifier of a TestFlight tester.",
        }),
        removed: confirmed("Whether the testers were unassigned."),
      },
      "Confirmation that the testers were unassigned from the build.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_build_from_beta_groups",
    operationType: "destructive",
    description: "Withdraw one build from TestFlight groups so their testers can no longer install it.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The build to withdraw and the groups to withdraw it from.",
      {
        buildId: buildIdInput,
        betaGroupIds: betaGroupIdList("Identifiers of the TestFlight groups to remove the build from."),
      },
      { required: ["buildId", "betaGroupIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build that was withdrawn."),
        betaGroupIds: s.stringArray("Identifiers of the groups the build was removed from.", {
          itemDescription: "App Store Connect identifier of a TestFlight group.",
        }),
        removed: confirmed("Whether the build was withdrawn."),
      },
      "Confirmation that the build was removed from the groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_build_beta_groups",
    operationType: "read",
    description: "List the TestFlight groups that can install one build.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the build whose groups to list.",
      { buildId: buildIdInput, ...paginationInputs },
      { required: ["buildId"] },
    ),
    outputSchema: pageOutput(
      "betaGroups",
      betaGroupResource,
      "TestFlight groups returned for this page.",
      "A page of TestFlight groups that have the build.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_build_beta_detail",
    operationType: "read",
    description:
      "Read the TestFlight distribution details of one build: its internal and external testing states and whether testers are notified automatically.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { buildId: buildIdInput },
      ["buildId"],
      "Identifies the build whose beta detail to read.",
    ),
    outputSchema: s.actionOutput(
      { buildBetaDetail: buildBetaDetailResource },
      "The TestFlight distribution details of the build.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_build_beta_detail",
    operationType: "destructive",
    description:
      "Turn automatic tester notifications on or off for one build. The build beta detail identifier comes from get_build_beta_detail.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The notification setting to store for a build.",
      {
        buildBetaDetailId: nonEmptyString("App Store Connect identifier of the build beta detail."),
        autoNotifyEnabled: s.boolean("Notify testers automatically when the build becomes available to them."),
      },
      { required: ["buildBetaDetailId", "autoNotifyEnabled"] },
    ),
    outputSchema: s.actionOutput(
      { buildBetaDetail: buildBetaDetailResource },
      "The updated TestFlight distribution details.",
    ),
  }),
  defineProviderAction(service, {
    name: "notify_build_testers",
    operationType: "write",
    description:
      "Send the TestFlight availability notification for one build to every tester who can install it. The notification cannot be recalled, so use it only when automatic notifications were off.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.actionInput({ buildId: buildIdInput }, ["buildId"], "Identifies the build to notify testers about."),
    outputSchema: s.actionOutput(
      {
        id: s.string("App Store Connect identifier of the notification record."),
        buildId: s.string("The build the testers were notified about."),
        notified: confirmed("Whether the notification was sent."),
      },
      "Confirmation that the notification was sent.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_build_localizations",
    operationType: "read",
    description:
      'List the "What to Test" notes of one build, one record per locale, optionally narrowed to a single locale.',
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the test notes of a build.",
      {
        buildId: buildIdInput,
        locale: nonEmptyString("Return only the notes written in this locale, such as en-US."),
        ...paginationInputs,
      },
      { required: ["buildId"] },
    ),
    outputSchema: pageOutput(
      "betaBuildLocalizations",
      betaBuildLocalizationResource,
      "Test notes returned for this page.",
      "A page of test notes for one build.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_build_localization",
    operationType: "read",
    description: 'Read the "What to Test" notes record of one build and locale by its identifier.',
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        betaBuildLocalizationId: nonEmptyString("App Store Connect identifier of the beta build localization."),
      },
      ["betaBuildLocalizationId"],
      "Identifies the test notes record to read.",
    ),
    outputSchema: s.actionOutput(
      { betaBuildLocalization: betaBuildLocalizationResource },
      "The requested test notes record.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_build_localization",
    operationType: "write",
    description:
      'Create the "What to Test" notes of one build for a locale that has none yet. App Store Connect rejects a second record for the same locale; use update_build_test_notes to change existing notes.',
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The test notes to create.",
      {
        buildId: buildIdInput,
        locale: nonEmptyString("TestFlight locale the notes are written in, such as en-US."),
        whatsNew: nonEmptyString("Test notes shown to testers in that locale."),
      },
      { required: ["buildId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { betaBuildLocalization: betaBuildLocalizationResource },
      "The created test notes record.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_build_localization",
    operationType: "destructive",
    description:
      'Replace the "What to Test" notes of one existing build localization. The previous text is overwritten.',
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The test notes to store.",
      {
        betaBuildLocalizationId: nonEmptyString("App Store Connect identifier of the beta build localization."),
        whatsNew: nonEmptyString("Test notes shown to testers in that locale."),
      },
      { required: ["betaBuildLocalizationId", "whatsNew"] },
    ),
    outputSchema: s.actionOutput(
      { betaBuildLocalization: betaBuildLocalizationResource },
      "The updated test notes record.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_build_localization",
    operationType: "destructive",
    description:
      'Delete the "What to Test" notes of one build in one locale. Testers in that locale fall back to the notes of the primary locale.',
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.actionInput(
      {
        betaBuildLocalizationId: nonEmptyString("App Store Connect identifier of the beta build localization."),
      },
      ["betaBuildLocalizationId"],
      "Identifies the test notes record to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted beta build localization."),
      "Confirmation that the test notes record was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_app_review_detail",
    operationType: "read",
    description:
      "Read the contact person, demo account, and notes Apple uses when reviewing an app for TestFlight external testing.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: appIdInput },
      ["appId"],
      "Identifies the app whose beta review detail to read.",
    ),
    outputSchema: s.actionOutput(
      { betaAppReviewDetail: betaAppReviewDetailResource },
      "The beta review detail of the app.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_app_review_detail",
    operationType: "destructive",
    description:
      "Change the contact person, demo account, or notes Apple uses when reviewing an app for TestFlight. Each field given replaces the stored value; pass at least one. The identifier comes from get_beta_app_review_detail.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The beta review detail fields to change.",
      {
        betaAppReviewDetailId: nonEmptyString("App Store Connect identifier of the beta app review detail."),
        contactFirstName: nonEmptyString("First name of the person Apple contacts about the review."),
        contactLastName: nonEmptyString("Last name of the review contact."),
        contactPhone: nonEmptyString("Phone number of the review contact."),
        contactEmail: emailString("Email address of the review contact."),
        demoAccountName: nonEmptyString("Username of the demo account reviewers sign in with."),
        demoAccountPassword: s.nonEmptyString("Password of the demo account reviewers sign in with."),
        demoAccountRequired: s.boolean("Whether reviewers need a demo account to test the app."),
        notes: nonEmptyString("Additional notes for the beta review team."),
      },
      { required: ["betaAppReviewDetailId"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppReviewDetail: betaAppReviewDetailResource },
      "The updated beta review detail.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_app_localizations",
    operationType: "read",
    description:
      "List the TestFlight test information of one app, one record per locale, optionally narrowed to a single locale.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the test information of an app.",
      {
        appId: appIdInput,
        locale: nonEmptyString("Return only the test information written in this locale, such as en-US."),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "betaAppLocalizations",
      betaAppLocalizationResource,
      "Test information records returned for this page.",
      "A page of TestFlight test information for one app.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_app_localization",
    operationType: "read",
    description: "Read the TestFlight test information of one app and locale by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        betaAppLocalizationId: nonEmptyString("App Store Connect identifier of the beta app localization."),
      },
      ["betaAppLocalizationId"],
      "Identifies the test information record to read.",
    ),
    outputSchema: s.actionOutput(
      { betaAppLocalization: betaAppLocalizationResource },
      "The requested test information record.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_app_localization",
    operationType: "write",
    description:
      "Create the TestFlight test information of an app for a locale that has none yet: the description, feedback email, and URLs testers see in TestFlight.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The test information to create.",
      {
        appId: appIdInput,
        locale: nonEmptyString("TestFlight locale the test information is written in, such as en-US."),
        description: nonEmptyString("Description of the app shown to testers in TestFlight."),
        feedbackEmail: emailString("Email address testers send feedback to."),
        marketingUrl: s.url("Marketing URL shown to testers."),
        privacyPolicyUrl: s.url("Privacy policy URL shown to testers."),
        tvOsPrivacyPolicy: nonEmptyString("Privacy policy text shown to tvOS testers."),
      },
      { required: ["appId", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppLocalization: betaAppLocalizationResource },
      "The created test information record.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_app_localization",
    operationType: "destructive",
    description:
      "Change the TestFlight test information of one app localization. Each field given replaces the stored value; pass at least one.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The test information fields to change.",
      {
        betaAppLocalizationId: nonEmptyString("App Store Connect identifier of the beta app localization."),
        description: nonEmptyString("Description of the app shown to testers in TestFlight."),
        feedbackEmail: emailString("Email address testers send feedback to."),
        marketingUrl: s.url("Marketing URL shown to testers."),
        privacyPolicyUrl: s.url("Privacy policy URL shown to testers."),
        tvOsPrivacyPolicy: nonEmptyString("Privacy policy text shown to tvOS testers."),
      },
      { required: ["betaAppLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppLocalization: betaAppLocalizationResource },
      "The updated test information record.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_app_localization",
    operationType: "destructive",
    description:
      "Delete the TestFlight test information of an app in one locale. Testers in that locale fall back to the primary locale.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.actionInput(
      {
        betaAppLocalizationId: nonEmptyString("App Store Connect identifier of the beta app localization."),
      },
      ["betaAppLocalizationId"],
      "Identifies the test information record to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted beta app localization."),
      "Confirmation that the test information record was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_license_agreement",
    operationType: "read",
    description: "Read the license agreement TestFlight testers of an app must accept.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: appIdInput },
      ["appId"],
      "Identifies the app whose beta license agreement to read.",
    ),
    outputSchema: s.actionOutput(
      { betaLicenseAgreement: betaLicenseAgreementResource },
      "The beta license agreement of the app.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_license_agreement",
    operationType: "destructive",
    description:
      "Replace the license agreement text TestFlight testers of an app must accept. The identifier comes from get_beta_license_agreement.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object(
      "The agreement text to store.",
      {
        betaLicenseAgreementId: nonEmptyString("App Store Connect identifier of the beta license agreement."),
        agreementText: nonEmptyString("Full text of the beta license agreement."),
      },
      { required: ["betaLicenseAgreementId", "agreementText"] },
    ),
    outputSchema: s.actionOutput(
      { betaLicenseAgreement: betaLicenseAgreementResource },
      "The updated beta license agreement.",
    ),
  }),
  defineProviderAction(service, {
    name: "resend_beta_tester_invitation",
    operationType: "write",
    description:
      "Send the TestFlight invitation email again to a tester who has not accepted the invitation for one app.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The tester and app the invitation is for.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the tester was invited to."),
        betaTesterId: betaTesterIdInput,
      },
      { required: ["appId", "betaTesterId"] },
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("App Store Connect identifier of the invitation record."),
        appId: s.string("The app the invitation is for."),
        betaTesterId: s.string("The tester the invitation was sent to."),
        resent: confirmed("Whether the invitation was sent again."),
      },
      "Confirmation that the invitation was sent again.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_group",
    operationType: "read",
    description: "Read one TestFlight group by its identifier, including its public link settings.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { betaGroupId: betaGroupIdInput },
      ["betaGroupId"],
      "Identifies the TestFlight group to read.",
    ),
    outputSchema: s.actionOutput({ betaGroup: betaGroupResource }, "The requested TestFlight group."),
  }),
  defineProviderAction(service, {
    name: "update_beta_group",
    operationType: "destructive",
    description:
      "Change the name, public link, feedback, or Apple silicon and Apple Vision availability settings of one TestFlight group. Each field given replaces the stored value; pass at least one.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The TestFlight group settings to change.",
      {
        betaGroupId: betaGroupIdInput,
        name: nonEmptyString("Group name shown in TestFlight."),
        publicLinkEnabled: s.boolean("Enable or disable the public TestFlight invitation link."),
        publicLinkLimitEnabled: s.boolean("Enforce a maximum number of testers joining through the public link."),
        publicLinkLimit: s.integer(
          "Maximum number of testers allowed to join through the public link, from 1 to 10,000.",
          { minimum: 1, maximum: 10000 },
        ),
        feedbackEnabled: s.boolean("Let testers send feedback from TestFlight."),
        iosBuildsAvailableForAppleSiliconMac: s.boolean("Offer the group's iOS builds to Apple silicon Macs."),
        iosBuildsAvailableForAppleVision: s.boolean("Offer the group's iOS builds to Apple Vision Pro."),
      },
      { required: ["betaGroupId"] },
    ),
    outputSchema: s.actionOutput({ betaGroup: betaGroupResource }, "The updated TestFlight group."),
  }),
  defineProviderAction(service, {
    name: "list_beta_group_builds",
    operationType: "read",
    description: "List the builds one TestFlight group can install, with the prerelease version each build belongs to.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the TestFlight group whose builds to list.",
      { betaGroupId: betaGroupIdInput, ...paginationInputs },
      { required: ["betaGroupId"] },
    ),
    outputSchema: pageOutput(
      "builds",
      buildResource,
      "Builds returned for this page.",
      "A page of builds available to the group.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_builds_to_beta_group",
    operationType: "write",
    description: "Make several builds available to one TestFlight group so its testers can install them.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The group and the builds it should receive.",
      {
        betaGroupId: betaGroupIdInput,
        buildIds: buildIdList("Identifiers of the builds to add to the group."),
      },
      { required: ["betaGroupId", "buildIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroupId: s.string("The group the builds were added to."),
        buildIds: s.stringArray("Identifiers of the builds that were added.", {
          itemDescription: "App Store Connect identifier of a build.",
        }),
        added: confirmed("Whether the builds were added."),
      },
      "Confirmation that the builds were added to the group.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_builds_from_beta_group",
    operationType: "destructive",
    description: "Withdraw several builds from one TestFlight group so its testers can no longer install them.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The group and the builds to withdraw from it.",
      {
        betaGroupId: betaGroupIdInput,
        buildIds: buildIdList("Identifiers of the builds to remove from the group."),
      },
      { required: ["betaGroupId", "buildIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaGroupId: s.string("The group the builds were removed from."),
        buildIds: s.stringArray("Identifiers of the builds that were removed.", {
          itemDescription: "App Store Connect identifier of a build.",
        }),
        removed: confirmed("Whether the builds were withdrawn."),
      },
      "Confirmation that the builds were removed from the group.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_tester",
    operationType: "read",
    description:
      "Read one TestFlight tester by its identifier, including the invitation state and the devices the app is installed on.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { betaTesterId: betaTesterIdInput },
      ["betaTesterId"],
      "Identifies the TestFlight tester to read.",
    ),
    outputSchema: s.actionOutput({ betaTester: betaTesterResource }, "The requested TestFlight tester."),
  }),
  defineProviderAction(service, {
    name: "list_beta_tester_apps",
    operationType: "read",
    description: "List the apps one TestFlight tester has access to.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the tester whose apps to list.",
      { betaTesterId: betaTesterIdInput, ...paginationInputs },
      { required: ["betaTesterId"] },
    ),
    outputSchema: pageOutput(
      "apps",
      appResource,
      "Apps returned for this page.",
      "A page of apps the tester has access to.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_beta_tester_from_apps",
    operationType: "destructive",
    description:
      "Revoke a TestFlight tester's access to specific apps, removing them from every group and build of those apps while keeping them on the team.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The tester and the apps to revoke access to.",
      {
        betaTesterId: betaTesterIdInput,
        appIds: s.stringArray("Identifiers of the apps to revoke access to.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an app.",
        }),
      },
      { required: ["betaTesterId", "appIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        betaTesterId: s.string("The tester whose access was revoked."),
        appIds: s.stringArray("Identifiers of the apps access was revoked for.", {
          itemDescription: "App Store Connect identifier of an app.",
        }),
        removed: confirmed("Whether access was revoked."),
      },
      "Confirmation that the tester was removed from the apps.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_tester_beta_groups",
    operationType: "read",
    description: "List the TestFlight groups one tester belongs to.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the tester whose groups to list.",
      { betaTesterId: betaTesterIdInput, ...paginationInputs },
      { required: ["betaTesterId"] },
    ),
    outputSchema: pageOutput(
      "betaGroups",
      betaGroupResource,
      "TestFlight groups returned for this page.",
      "A page of TestFlight groups the tester belongs to.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_pre_release_version",
    operationType: "read",
    description: "Read one prerelease version by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        preReleaseVersionId: nonEmptyString("App Store Connect identifier of the prerelease version."),
      },
      ["preReleaseVersionId"],
      "Identifies the prerelease version to read.",
    ),
    outputSchema: s.actionOutput({ preReleaseVersion: preReleaseVersionResource }, "The requested prerelease version."),
  }),
  defineProviderAction(service, {
    name: "list_beta_app_review_submissions",
    operationType: "read",
    description: "List the TestFlight beta review submissions of one build, optionally narrowed to one review state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing beta review submissions.",
      {
        buildId: nonEmptyString("App Store Connect identifier of the build whose submissions to list."),
        betaReviewState: s.stringEnum("Return only submissions in this review state.", betaReviewStates),
        ...paginationInputs,
      },
      { required: ["buildId"] },
    ),
    outputSchema: pageOutput(
      "betaAppReviewSubmissions",
      betaAppReviewSubmissionResource,
      "Beta review submissions returned for this page.",
      "A page of beta review submissions for one build.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_app_review_submission",
    operationType: "read",
    description: "Read one TestFlight beta review submission by its identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        betaAppReviewSubmissionId: nonEmptyString("App Store Connect identifier of the beta app review submission."),
      },
      ["betaAppReviewSubmissionId"],
      "Identifies the beta review submission to read.",
    ),
    outputSchema: s.actionOutput(
      { betaAppReviewSubmission: betaAppReviewSubmissionResource },
      "The requested beta review submission.",
    ),
  }),
];
