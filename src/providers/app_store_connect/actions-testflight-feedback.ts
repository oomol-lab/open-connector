import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  contentPlatforms,
  deletedOutput,
  manageTestFlightBuildsRoles,
  manageTestFlightRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
} from "./schemas.ts";

export const deviceFamilies: readonly string[] = ["IPHONE", "IPAD", "APPLE_TV", "APPLE_WATCH", "MAC", "VISION"];
const feedbackConnectionTypes: readonly string[] = ["WIFI", "MOBILE_DATA", "WIRE", "UNKNOWN", "NONE"];
const feedbackSortValues: readonly string[] = ["createdDate", "-createdDate"];
const buildBundleTypes: readonly string[] = ["APP", "APP_CLIP", "WATCH_APP"];
const appClipDomainErrorCodes: readonly string[] = [
  "BAD_HTTP_RESPONSE",
  "BAD_JSON_CONTENT",
  "BAD_PKCS7_SIGNATURE",
  "CANNOT_REACH_AASA_FILE",
  "CROSS_SITE_REDIRECTS_FORBIDDEN",
  "DNS_ERROR",
  "INSECURE_REDIRECTS_FORBIDDEN",
  "INVALID_ENTITLEMENT_MISSING_SECTION",
  "INVALID_ENTITLEMENT_SYNTAX_ERROR",
  "INVALID_ENTITLEMENT_UNHANDLED_SECTION",
  "INVALID_ENTITLEMENT_UNKNOWN_ID",
  "NETWORK_ERROR",
  "NETWORK_ERROR_TEMPORARY",
  "OTHER_ERROR",
  "TIMEOUT",
  "TLS_ERROR",
  "TOO_MANY_REDIRECTS",
  "UNEXPECTED_ERROR",
];
const metricPeriods: readonly string[] = ["P7D", "P30D", "P90D", "P365D"];

const feedbackBuildSummary = s.nullable(
  s.object(
    "The build the feedback was sent from, or null when App Store Connect did not return it.",
    {
      id: s.string("App Store Connect identifier for the build."),
      version: s.nullableString("Build number, such as 42."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

const betaTesterSummary = s.nullable(
  s.object(
    "The TestFlight tester the record belongs to, or null when App Store Connect did not return it.",
    {
      id: s.string("App Store Connect identifier for the beta tester."),
      email: s.nullableString("Email address the tester was invited with."),
      firstName: s.nullableString("Tester first name."),
      lastName: s.nullableString("Tester last name."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

const betaFeedbackFields = {
  createdDate: s.nullableString("When the tester sent the feedback, as an ISO 8601 timestamp."),
  comment: s.nullableString("Free-text comment the tester wrote."),
  email: s.nullableString("Email address of the tester who sent the feedback."),
  deviceModel: s.nullableString("Device model identifier, such as iPhone16,2."),
  osVersion: s.nullableString("Operating system version on the device."),
  locale: s.nullableString("Locale the device was set to."),
  timeZone: s.nullableString("Time zone the device was set to."),
  architecture: s.nullableString("CPU architecture of the device."),
  connectionType: nullableEnum("Network connection the device was using.", feedbackConnectionTypes),
  pairedAppleWatch: s.nullableString("Model of the Apple Watch paired with the device, if any."),
  appUptimeInMilliseconds: s.nullableInteger(
    "How long the app had been running when the feedback was sent, in milliseconds.",
  ),
  diskBytesAvailable: s.nullableInteger("Free disk space on the device, in bytes."),
  diskBytesTotal: s.nullableInteger("Total disk space on the device, in bytes."),
  batteryPercentage: s.nullableInteger("Battery level of the device, as a percentage."),
  screenWidthInPoints: s.nullableInteger("Screen width of the device, in points."),
  screenHeightInPoints: s.nullableInteger("Screen height of the device, in points."),
  appPlatform: nullableEnum("Platform the app was built for.", contentPlatforms),
  devicePlatform: nullableEnum("Platform of the device the app ran on.", contentPlatforms),
  deviceFamily: nullableEnum("Device family the feedback came from.", deviceFamilies),
  buildBundleId: s.nullableString("App Store Connect identifier of the build bundle the feedback was sent from."),
  build: feedbackBuildSummary,
  tester: betaTesterSummary,
};

const betaFeedbackScreenshotSubmissionResource = resourceObject(
  "A screenshot feedback submission a tester sent from TestFlight.",
  "App Store Connect identifier for the screenshot feedback submission.",
  {
    ...betaFeedbackFields,
    screenshots: s.nullable(
      s.array(
        "Screenshots attached to the feedback, each with a time-limited download URL.",
        s.looseObject("One attached screenshot.", {
          url: s.string("Download URL for the screenshot; it expires at expirationDate."),
          width: s.integer("Screenshot width in pixels."),
          height: s.integer("Screenshot height in pixels."),
          expirationDate: s.string("When the download URL stops working, as an ISO 8601 timestamp."),
        }),
      ),
    ),
  },
  ["build", "tester"],
);

const betaFeedbackCrashSubmissionResource = resourceObject(
  "A crash feedback submission a tester sent from TestFlight.",
  "App Store Connect identifier for the crash feedback submission.",
  betaFeedbackFields,
  ["build", "tester"],
);

const betaCrashLogResource = resourceObject(
  "The crash log attached to a TestFlight crash feedback submission.",
  "App Store Connect identifier for the crash log.",
  { logText: s.nullableString("Full text of the crash log.") },
);

const betaFeedbackListInputs = {
  appId: nonEmptyString("App Store Connect identifier of the app whose feedback to list."),
  buildIds: s.stringArray("Return only feedback sent from these builds.", {
    minItems: 1,
    itemDescription: "App Store Connect identifier of a build.",
  }),
  preReleaseVersionIds: s.stringArray("Return only feedback sent from builds under these prerelease versions.", {
    minItems: 1,
    itemDescription: "App Store Connect identifier of a prerelease version.",
  }),
  betaTesterIds: s.stringArray("Return only feedback sent by these testers.", {
    minItems: 1,
    itemDescription: "App Store Connect identifier of a TestFlight tester.",
  }),
  deviceModels: s.stringArray("Return only feedback sent from these device models.", {
    minItems: 1,
    itemDescription: "Device model identifier, such as iPhone16,2.",
  }),
  osVersions: s.stringArray("Return only feedback sent from these OS versions.", {
    minItems: 1,
    itemDescription: "Operating system version, such as 17.4.",
  }),
  appPlatforms: s.array(
    "Return only feedback for apps built for these platforms.",
    s.stringEnum("A content platform.", contentPlatforms),
    { minItems: 1 },
  ),
  devicePlatforms: s.array(
    "Return only feedback sent from devices running these platforms.",
    s.stringEnum("A device platform.", contentPlatforms),
    { minItems: 1 },
  ),
  sort: s.stringEnum("Sort order for the returned feedback.", feedbackSortValues),
  ...paginationInputs,
};

const deviceFamilyOsVersionFilterInput = s.object(
  "One device family testers must use, with an optional inclusive OS version range.",
  {
    deviceFamily: s.stringEnum("Device family the tester must use.", deviceFamilies),
    minimumOsInclusive: nonEmptyString("Lowest OS version the device may run, inclusive, such as 17.0."),
    maximumOsInclusive: nonEmptyString("Highest OS version the device may run, inclusive, such as 18.4."),
  },
  { required: ["deviceFamily"] },
);

const deviceFamilyOsVersionFiltersInput = s.array(
  "Device families and OS version ranges a tester must match to join through the public link.",
  deviceFamilyOsVersionFilterInput,
  { minItems: 1 },
);

const betaRecruitmentCriterionResource = resourceObject(
  "Recruitment criteria that limit who can join a TestFlight group through its public link.",
  "App Store Connect identifier for the recruitment criteria.",
  {
    lastModifiedDate: s.nullableString("When the criteria were last changed, as an ISO 8601 timestamp."),
    deviceFamilyOsVersionFilters: s.nullable(
      s.array(
        "Device families and OS version ranges a tester must match.",
        s.looseObject("One device family with its inclusive OS version range.", {
          deviceFamily: s.stringEnum("Device family the tester must use.", deviceFamilies),
          minimumOsInclusive: s.nullableString("Lowest OS version allowed, inclusive."),
          maximumOsInclusive: s.nullableString("Highest OS version allowed, inclusive."),
        }),
      ),
    ),
  },
);

const betaRecruitmentCriterionOptionResource = resourceObject(
  "The device families and OS versions App Store Connect accepts in recruitment criteria.",
  "App Store Connect identifier for the option set.",
  {
    deviceFamilyOsVersions: s.nullable(
      s.array(
        "Selectable OS versions per device family.",
        s.looseObject("OS versions selectable for one device family.", {
          deviceFamily: s.stringEnum("Device family.", deviceFamilies),
          osVersions: s.array(
            "OS versions that can be used as a minimum or maximum for this family.",
            s.string("An OS version, such as 17.0."),
          ),
        }),
      ),
    ),
  },
);

const betaRecruitmentCriterionCompatibleBuildCheckResource = resourceObject(
  "Whether a TestFlight group has a build that satisfies its recruitment criteria.",
  "App Store Connect identifier for the check.",
  {
    hasCompatibleBuild: s.nullableBoolean(
      "True when at least one build available to the group can run on the devices the criteria allow.",
    ),
  },
);

const betaAppClipInvocationLocalizationResource = resourceObject(
  "A localized title for a TestFlight App Clip invocation.",
  "App Store Connect identifier for the localization.",
  {
    title: s.nullableString("Title testers see for the App Clip invocation in this locale."),
    locale: s.nullableString("Locale the title is written in, such as en-US."),
  },
);

const betaAppClipInvocationFields = {
  url: s.nullableString("Invocation URL the App Clip is launched with from TestFlight."),
};

const betaAppClipInvocationResource = resourceObject(
  "An App Clip experience testers can launch from the TestFlight app.",
  "App Store Connect identifier for the App Clip invocation.",
  betaAppClipInvocationFields,
);

const betaAppClipInvocationWithLocalizationsResource = resourceObject(
  "An App Clip experience testers can launch from the TestFlight app, with its localized titles.",
  "App Store Connect identifier for the App Clip invocation.",
  {
    ...betaAppClipInvocationFields,
    betaAppClipInvocationLocalizations: s.array(
      "Localized titles App Store Connect returned alongside the invocation.",
      betaAppClipInvocationLocalizationResource,
    ),
  },
  ["betaAppClipInvocationLocalizations"],
);

const nullableStringList = (description: string, itemDescription: string) =>
  s.nullable(s.array(description, s.string(itemDescription)));

const buildBundleResource = resourceObject(
  "One bundle (app, App Clip, or watch app) contained in an uploaded build.",
  "App Store Connect identifier for the build bundle.",
  {
    bundleId: s.nullableString("Bundle identifier of the bundle."),
    bundleType: nullableEnum("What kind of bundle this is.", buildBundleTypes),
    sdkBuild: s.nullableString("SDK build the bundle was compiled with."),
    platformBuild: s.nullableString("Platform build the bundle was compiled against."),
    fileName: s.nullableString("File name of the bundle inside the build."),
    hasSirikit: s.nullableBoolean("Whether the bundle uses SiriKit."),
    hasOnDemandResources: s.nullableBoolean("Whether the bundle uses on-demand resources."),
    hasPrerenderedIcon: s.nullableBoolean("Whether the bundle ships a prerendered icon."),
    usesLocationServices: s.nullableBoolean("Whether the bundle uses location services."),
    isIosBuildMacAppStoreCompatible: s.nullableBoolean("Whether the iOS bundle can be offered on the Mac App Store."),
    includesSymbols: s.nullableBoolean("Whether symbols were uploaded with the bundle."),
    dSYMUrl: s.nullableString("Download URL for the dSYM archive, when symbols were uploaded."),
    supportedArchitectures: nullableStringList(
      "CPU architectures the bundle supports.",
      "An architecture, such as arm64.",
    ),
    requiredCapabilities: nullableStringList(
      "Device capabilities the bundle requires.",
      "A UIRequiredDeviceCapabilities value.",
    ),
    deviceProtocols: nullableStringList("External accessory protocols the bundle declares.", "A protocol name."),
    locales: nullableStringList("Locales the bundle is localized for.", "A locale, such as en-US."),
    entitlements: s.nullable(s.looseObject("Entitlements declared by the bundle, keyed by entitlement name.")),
    baDownloadAllowance: s.nullableInteger("Background asset download allowance declared by the bundle, in bytes."),
    baMaxInstallSize: s.nullableInteger("Maximum background asset install size declared by the bundle, in bytes."),
    minimumOsVersion: s.nullableString("Minimum OS version the bundle supports."),
  },
);

const appClipDomainStatusResource = resourceObject(
  "Validation status of the associated domains an App Clip bundle declares.",
  "App Store Connect identifier for the domain status record.",
  {
    domains: s.nullable(
      s.array(
        "Validation result for each associated domain.",
        s.looseObject("One associated domain.", {
          domain: s.string("Domain name that was checked."),
          isValid: s.boolean("Whether the apple-app-site-association file validated."),
          lastUpdatedDate: s.nullableString("When this domain was last checked, as an ISO 8601 timestamp."),
          errorCode: nullableEnum("Why validation failed, or null when the domain is valid.", appClipDomainErrorCodes),
        }),
      ),
    ),
    lastUpdatedDate: s.nullableString("When the status was last refreshed, as an ISO 8601 timestamp."),
  },
);

const buildBundleFileSizeResource = resourceObject(
  "Download and install size of a build bundle on one device model and OS version.",
  "App Store Connect identifier for the file size record.",
  {
    deviceModel: s.nullableString("Device model the sizes were computed for."),
    osVersion: s.nullableString("OS version the sizes were computed for."),
    downloadBytes: s.nullableInteger("Download size in bytes."),
    installBytes: s.nullableInteger("Installed size in bytes."),
  },
);

const usageIntervalFields = {
  start: s.nullableString("Start of the reporting interval, as an ISO 8601 timestamp."),
  end: s.nullableString("End of the reporting interval, as an ISO 8601 timestamp."),
};

const betaTesterUsageDataPoint = s.object(
  "Tester activity counters for one reporting interval.",
  {
    ...usageIntervalFields,
    crashCount: s.nullableInteger("Crashes reported during the interval."),
    sessionCount: s.nullableInteger("App sessions during the interval."),
    feedbackCount: s.nullableInteger("Feedback submissions sent during the interval."),
  },
  { additionalProperties: true, required: ["start", "end", "crashCount", "sessionCount", "feedbackCount"] },
);

const betaBuildUsageDataPoint = s.object(
  "Build activity counters for one reporting interval.",
  {
    ...usageIntervalFields,
    crashCount: s.nullableInteger("Crashes reported during the interval."),
    installCount: s.nullableInteger("Installs of the build during the interval."),
    sessionCount: s.nullableInteger("App sessions during the interval."),
    feedbackCount: s.nullableInteger("Feedback submissions sent during the interval."),
    inviteCount: s.nullableInteger("Invitations sent for the build during the interval."),
  },
  {
    additionalProperties: true,
    required: ["start", "end", "crashCount", "installCount", "sessionCount", "feedbackCount", "inviteCount"],
  },
);

const betaTesterUsageGroup = s.object(
  "Usage for the whole app or group, or for one tester when grouped by tester.",
  {
    betaTesterId: s.nullableString(
      "App Store Connect identifier of the tester this row covers, or null for the aggregate row.",
    ),
    betaTester: betaTesterSummary,
    dataPoints: s.array("Usage counters per reporting interval.", betaTesterUsageDataPoint),
  },
  { additionalProperties: true, required: ["betaTesterId", "betaTester", "dataPoints"] },
);

const periodInput = s.stringEnum("Length of the reporting window ending now: 7, 30, 90, or 365 days.", metricPeriods);

const betaTesterUsageInputs = {
  period: periodInput,
  groupByBetaTester: s.boolean("Return one row per tester instead of a single aggregate row."),
  betaTesterId: nonEmptyString("Return only the usage of this tester."),
  ...paginationInputs,
};

const betaTesterUsagePageOutput = (description: string) =>
  pageOutput("usages", betaTesterUsageGroup, "Usage rows returned for this page.", description);

const feedbackIdInput = (resource: string, description: string) =>
  s.actionInput(
    { [`${resource}Id`]: nonEmptyString(`App Store Connect identifier of the ${description}.`) },
    [`${resource}Id`],
    `Identifies the ${description}.`,
  );

export const appStoreConnectTestFlightFeedbackActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_beta_feedback_screenshot_submissions",
    operationType: "read",
    description:
      "List the screenshot feedback testers sent from TestFlight for one app, with the build and tester each submission came from. Screenshot download URLs expire, so fetch them soon after listing.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object("Filters for browsing screenshot feedback of one app.", betaFeedbackListInputs, {
      required: ["appId"],
    }),
    outputSchema: pageOutput(
      "betaFeedbackScreenshotSubmissions",
      betaFeedbackScreenshotSubmissionResource,
      "Screenshot feedback submissions returned for this page.",
      "A page of screenshot feedback submissions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_feedback_screenshot_submission",
    operationType: "read",
    description:
      "Read one screenshot feedback submission with its device details, attached screenshots, and the build and tester it came from.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: feedbackIdInput("betaFeedbackScreenshotSubmission", "screenshot feedback submission"),
    outputSchema: s.actionOutput(
      { betaFeedbackScreenshotSubmission: betaFeedbackScreenshotSubmissionResource },
      "The requested screenshot feedback submission.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_feedback_screenshot_submission",
    operationType: "destructive",
    description:
      "Delete a screenshot feedback submission from App Store Connect. The screenshots and comment are removed permanently.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: feedbackIdInput("betaFeedbackScreenshotSubmission", "screenshot feedback submission to delete"),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted screenshot feedback submission."),
      "Confirmation that the screenshot feedback submission was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_feedback_crash_submissions",
    operationType: "read",
    description:
      "List the crash feedback testers sent from TestFlight for one app, with the build and tester each submission came from. Use get_beta_feedback_crash_log to read the crash log text of one submission.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: s.object("Filters for browsing crash feedback of one app.", betaFeedbackListInputs, {
      required: ["appId"],
    }),
    outputSchema: pageOutput(
      "betaFeedbackCrashSubmissions",
      betaFeedbackCrashSubmissionResource,
      "Crash feedback submissions returned for this page.",
      "A page of crash feedback submissions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_feedback_crash_submission",
    operationType: "read",
    description: "Read one crash feedback submission with its device details and the build and tester it came from.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: feedbackIdInput("betaFeedbackCrashSubmission", "crash feedback submission"),
    outputSchema: s.actionOutput(
      { betaFeedbackCrashSubmission: betaFeedbackCrashSubmissionResource },
      "The requested crash feedback submission.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_feedback_crash_submission",
    operationType: "destructive",
    description:
      "Delete a crash feedback submission from App Store Connect. The crash log and comment are removed permanently.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: feedbackIdInput("betaFeedbackCrashSubmission", "crash feedback submission to delete"),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted crash feedback submission."),
      "Confirmation that the crash feedback submission was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_feedback_crash_log",
    operationType: "read",
    description: "Read the full crash log text attached to one crash feedback submission.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightBuildsRoles],
    inputSchema: feedbackIdInput("betaFeedbackCrashSubmission", "crash feedback submission whose crash log to read"),
    outputSchema: s.actionOutput({ crashLog: betaCrashLogResource }, "The crash log of the submission."),
  }),
  defineProviderAction(service, {
    name: "get_beta_recruitment_criterion",
    operationType: "read",
    description:
      "Read the recruitment criteria of a TestFlight group, which restrict who can join through its public link by device family and OS version. Returns null when the group has no criteria.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group.") },
      ["betaGroupId"],
      "Identifies the TestFlight group whose recruitment criteria to read.",
    ),
    outputSchema: s.actionOutput(
      { betaRecruitmentCriterion: s.nullable(betaRecruitmentCriterionResource) },
      "The recruitment criteria of the group, or null when none are set.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_recruitment_criterion",
    operationType: "write",
    description:
      "Set recruitment criteria on a TestFlight group so only testers on the listed device families and OS versions can join through its public link. A group can hold one set of criteria; update or delete it afterwards.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The recruitment criteria to create.",
      {
        betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group."),
        deviceFamilyOsVersionFilters: deviceFamilyOsVersionFiltersInput,
      },
      { required: ["betaGroupId", "deviceFamilyOsVersionFilters"] },
    ),
    outputSchema: s.actionOutput(
      { betaRecruitmentCriterion: betaRecruitmentCriterionResource },
      "The created recruitment criteria.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_recruitment_criterion",
    operationType: "destructive",
    description:
      "Replace the device family and OS version filters of existing recruitment criteria. The previous filters are overwritten.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The recruitment criteria to update.",
      {
        betaRecruitmentCriterionId: nonEmptyString("App Store Connect identifier of the recruitment criteria."),
        deviceFamilyOsVersionFilters: deviceFamilyOsVersionFiltersInput,
      },
      { required: ["betaRecruitmentCriterionId", "deviceFamilyOsVersionFilters"] },
    ),
    outputSchema: s.actionOutput(
      { betaRecruitmentCriterion: betaRecruitmentCriterionResource },
      "The updated recruitment criteria.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_recruitment_criterion",
    operationType: "destructive",
    description:
      "Delete the recruitment criteria of a TestFlight group, so anyone with the public link can join again.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.actionInput(
      {
        betaRecruitmentCriterionId: nonEmptyString("App Store Connect identifier of the recruitment criteria."),
      },
      ["betaRecruitmentCriterionId"],
      "Identifies the recruitment criteria to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted recruitment criteria."),
      "Confirmation that the recruitment criteria were deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_recruitment_criterion_options",
    operationType: "read",
    description:
      "List the device families and OS versions App Store Connect accepts in recruitment criteria, to pick valid minimumOsInclusive and maximumOsInclusive values.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for browsing recruitment criteria options.",
      { ...paginationInputs },
      { required: [] },
    ),
    outputSchema: pageOutput(
      "betaRecruitmentCriterionOptions",
      betaRecruitmentCriterionOptionResource,
      "Option sets returned for this page.",
      "A page of recruitment criteria options.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_recruitment_criterion_compatible_build_check",
    operationType: "read",
    description:
      "Check whether a TestFlight group has a build that testers matching its recruitment criteria could install.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group.") },
      ["betaGroupId"],
      "Identifies the TestFlight group to check.",
    ),
    outputSchema: s.actionOutput(
      { compatibleBuildCheck: betaRecruitmentCriterionCompatibleBuildCheckResource },
      "The compatible build check result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_beta_app_clip_invocations",
    operationType: "read",
    description:
      "List the App Clip invocations testers can launch from TestFlight for one App Clip build bundle, with the localized titles of each. Find build bundle identifiers with list_build_bundles.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing App Clip invocations of one build bundle.",
      {
        buildBundleId: nonEmptyString("App Store Connect identifier of the App Clip build bundle."),
        ...paginationInputs,
      },
      { required: ["buildBundleId"] },
    ),
    outputSchema: pageOutput(
      "betaAppClipInvocations",
      betaAppClipInvocationWithLocalizationsResource,
      "App Clip invocations returned for this page.",
      "A page of App Clip invocations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_beta_app_clip_invocation",
    operationType: "read",
    description: "Read one TestFlight App Clip invocation together with its localized titles.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        betaAppClipInvocationId: nonEmptyString("App Store Connect identifier of the App Clip invocation."),
      },
      ["betaAppClipInvocationId"],
      "Identifies the App Clip invocation to read.",
    ),
    outputSchema: s.actionOutput(
      { betaAppClipInvocation: betaAppClipInvocationWithLocalizationsResource },
      "The requested App Clip invocation.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_app_clip_invocation",
    operationType: "write",
    description:
      "Add an App Clip experience that testers launch from the TestFlight app, creating its localized titles in the same request. At least one localization is required.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The App Clip invocation to create.",
      {
        buildBundleId: nonEmptyString(
          "App Store Connect identifier of the App Clip build bundle the invocation belongs to.",
        ),
        url: s.url("Invocation URL the App Clip is launched with, such as https://example.com/clip."),
        betaAppClipInvocationLocalizations: s.array(
          "Localized titles to create with the invocation, one per locale.",
          s.object(
            "One localized title.",
            {
              title: nonEmptyString("Title testers see for the invocation in this locale."),
              locale: nonEmptyString("Locale the title is written in, such as en-US."),
            },
            { required: ["title", "locale"] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["buildBundleId", "url", "betaAppClipInvocationLocalizations"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppClipInvocation: betaAppClipInvocationWithLocalizationsResource },
      "The created App Clip invocation.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_app_clip_invocation",
    operationType: "destructive",
    description: "Change the invocation URL of a TestFlight App Clip invocation. The previous URL is overwritten.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The App Clip invocation to update.",
      {
        betaAppClipInvocationId: nonEmptyString("App Store Connect identifier of the App Clip invocation."),
        url: s.url("New invocation URL the App Clip is launched with."),
      },
      { required: ["betaAppClipInvocationId", "url"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppClipInvocation: betaAppClipInvocationResource },
      "The updated App Clip invocation.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_app_clip_invocation",
    operationType: "destructive",
    description:
      "Delete a TestFlight App Clip invocation and its localized titles. Testers can no longer launch that experience from TestFlight.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.actionInput(
      {
        betaAppClipInvocationId: nonEmptyString("App Store Connect identifier of the App Clip invocation."),
      },
      ["betaAppClipInvocationId"],
      "Identifies the App Clip invocation to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted App Clip invocation."),
      "Confirmation that the App Clip invocation was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_beta_app_clip_invocation_localization",
    operationType: "write",
    description: "Add a localized title in one more locale to an existing TestFlight App Clip invocation.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The localized title to create.",
      {
        betaAppClipInvocationId: nonEmptyString("App Store Connect identifier of the App Clip invocation."),
        title: nonEmptyString("Title testers see for the invocation in this locale."),
        locale: nonEmptyString("Locale the title is written in, such as en-US."),
      },
      { required: ["betaAppClipInvocationId", "title", "locale"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppClipInvocationLocalization: betaAppClipInvocationLocalizationResource },
      "The created localized title.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_beta_app_clip_invocation_localization",
    operationType: "write",
    description:
      "Change the title of one localized App Clip invocation title. The locale itself cannot be changed; the previous title is overwritten.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.object(
      "The localized title to update.",
      {
        betaAppClipInvocationLocalizationId: nonEmptyString("App Store Connect identifier of the localized title."),
        title: nonEmptyString("New title testers see for the invocation in this locale."),
      },
      { required: ["betaAppClipInvocationLocalizationId", "title"] },
    ),
    outputSchema: s.actionOutput(
      { betaAppClipInvocationLocalization: betaAppClipInvocationLocalizationResource },
      "The updated localized title.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_beta_app_clip_invocation_localization",
    operationType: "destructive",
    description: "Delete one localized title of a TestFlight App Clip invocation.",
    requiredScopes: [],
    providerPermissions: [...manageTestFlightRoles],
    inputSchema: s.actionInput(
      {
        betaAppClipInvocationLocalizationId: nonEmptyString("App Store Connect identifier of the localized title."),
      },
      ["betaAppClipInvocationLocalizationId"],
      "Identifies the localized title to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted localized title."),
      "Confirmation that the localized title was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_build_bundles",
    operationType: "read",
    description:
      "List the bundles (app, App Clip, and watch app) contained in one uploaded build, with their bundle identifiers, architectures, entitlements, and dSYM download URL. Every bundle of the build is returned in one call: App Store Connect only exposes bundles as an include of the build, capped at 50, and offers no cursor. Build bundle identifiers are needed for the App Clip and file size actions.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the build whose bundles to list.",
      { buildId: nonEmptyString("App Store Connect identifier of the build.") },
      { required: ["buildId"] },
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build the bundles belong to."),
        buildBundles: s.array("Bundles contained in the build.", buildBundleResource),
      },
      "The bundles of one build.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_build_bundle_app_clip_domain_cache_status",
    operationType: "read",
    description:
      "Read the cached validation status of the associated domains an App Clip build bundle declares, as Apple's CDN last recorded it. Returns null when App Store Connect has no status for the bundle.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { buildBundleId: nonEmptyString("App Store Connect identifier of the build bundle.") },
      ["buildBundleId"],
      "Identifies the build bundle to inspect.",
    ),
    outputSchema: s.actionOutput(
      { appClipDomainCacheStatus: s.nullable(appClipDomainStatusResource) },
      "The cached associated domain status, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_build_bundle_app_clip_domain_debug_status",
    operationType: "read",
    description:
      "Read the debug-mode validation status of the associated domains an App Clip build bundle declares, which checks the domains directly instead of Apple's CDN cache. Returns null when App Store Connect has no status for the bundle.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { buildBundleId: nonEmptyString("App Store Connect identifier of the build bundle.") },
      ["buildBundleId"],
      "Identifies the build bundle to inspect.",
    ),
    outputSchema: s.actionOutput(
      { appClipDomainDebugStatus: s.nullable(appClipDomainStatusResource) },
      "The debug associated domain status, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_build_bundle_file_sizes",
    operationType: "read",
    description:
      "List the download and install sizes of one build bundle per device model and OS version, as App Store Connect computed them after processing.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the build bundle whose file sizes to list.",
      {
        buildBundleId: nonEmptyString("App Store Connect identifier of the build bundle."),
        ...paginationInputs,
      },
      { required: ["buildBundleId"] },
    ),
    outputSchema: pageOutput(
      "buildBundleFileSizes",
      buildBundleFileSizeResource,
      "File size records returned for this page.",
      "A page of build bundle file sizes.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_beta_tester_usages",
    operationType: "read",
    description:
      "Read TestFlight usage metrics for one app: sessions, crashes, and feedback over the chosen period, either as one aggregate row or as one row per tester.",
    requiredScopes: [],
    inputSchema: s.object(
      "Selects the app and reporting window.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        ...betaTesterUsageInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: betaTesterUsagePageOutput("TestFlight usage of one app."),
  }),
  defineProviderAction(service, {
    name: "get_beta_group_beta_tester_usages",
    operationType: "read",
    description:
      "Read TestFlight usage metrics for one group: sessions, crashes, and feedback over the chosen period, either as one aggregate row or as one row per tester.",
    requiredScopes: [],
    inputSchema: s.object(
      "Selects the TestFlight group and reporting window.",
      {
        betaGroupId: nonEmptyString("App Store Connect identifier of the TestFlight group."),
        ...betaTesterUsageInputs,
      },
      { required: ["betaGroupId"] },
    ),
    outputSchema: betaTesterUsagePageOutput("TestFlight usage of one group."),
  }),
  defineProviderAction(service, {
    name: "get_beta_tester_usages",
    operationType: "read",
    description:
      "Read TestFlight usage metrics of one tester in one app: sessions, crashes, and feedback over the chosen period.",
    requiredScopes: [],
    inputSchema: s.object(
      "Selects the tester, app, and reporting window.",
      {
        betaTesterId: nonEmptyString("App Store Connect identifier of the TestFlight tester."),
        appId: nonEmptyString("App Store Connect identifier of the app to report usage for."),
        period: periodInput,
        ...paginationInputs,
      },
      { required: ["betaTesterId", "appId"] },
    ),
    outputSchema: pageOutput(
      "usages",
      s.object(
        "Usage of the tester in one app.",
        {
          appId: s.nullableString(
            "App Store Connect identifier of the app this row covers, or null when App Store Connect did not report it.",
          ),
          dataPoints: s.array("Usage counters per reporting interval.", betaTesterUsageDataPoint),
        },
        { additionalProperties: true, required: ["appId", "dataPoints"] },
      ),
      "Usage rows returned for this page.",
      "TestFlight usage of one tester.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_build_beta_build_usages",
    operationType: "read",
    description:
      "Read TestFlight usage metrics of one build: invitations, installs, sessions, crashes, and feedback since the build became available.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { buildId: nonEmptyString("App Store Connect identifier of the build.") },
      ["buildId"],
      "Identifies the build to report usage for.",
    ),
    outputSchema: s.actionOutput(
      {
        buildId: s.string("The build the usage belongs to."),
        dataPoints: s.array("Usage counters per reporting interval.", betaBuildUsageDataPoint),
      },
      "TestFlight usage of one build.",
    ),
  }),
];
