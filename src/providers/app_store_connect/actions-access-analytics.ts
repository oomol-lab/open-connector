import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appResource,
  deletedOutput,
  emailString,
  manageAnalyticsReportRequestsRoles,
  manageSandboxTestersRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
  teamRoles,
  userResource,
  usersAndAccessRoles,
  viewAnalyticsReportsRoles,
} from "./schemas.ts";

const actorTypes: readonly string[] = ["USER", "API_KEY", "XCODE_CLOUD", "APPLE"];
const sandboxSubscriptionRenewalRates: readonly string[] = [
  "MONTHLY_RENEWAL_EVERY_ONE_HOUR",
  "MONTHLY_RENEWAL_EVERY_THIRTY_MINUTES",
  "MONTHLY_RENEWAL_EVERY_FIFTEEN_MINUTES",
  "MONTHLY_RENEWAL_EVERY_FIVE_MINUTES",
  "MONTHLY_RENEWAL_EVERY_THREE_MINUTES",
];
const analyticsReportAccessTypes: readonly string[] = ["ONE_TIME_SNAPSHOT", "ONGOING"];
const analyticsReportCategories: readonly string[] = [
  "APP_USAGE",
  "APP_STORE_ENGAGEMENT",
  "COMMERCE",
  "FRAMEWORK_USAGE",
  "PERFORMANCE",
];
const analyticsReportGranularities: readonly string[] = ["DAILY", "WEEKLY", "MONTHLY"];
const diagnosticTypes: readonly string[] = ["DISK_WRITES", "HANGS", "LAUNCHES"];
const diagnosticInsightTypes: readonly string[] = ["TREND"];
const diagnosticInsightDirections: readonly string[] = ["UP", "DOWN", "UNDEFINED"];
const perfPowerMetricPlatforms: readonly string[] = ["IOS"];
const perfPowerMetricTypes: readonly string[] = [
  "DISK",
  "HANG",
  "BATTERY",
  "LAUNCH",
  "MEMORY",
  "ANIMATION",
  "TERMINATION",
  "STORAGE",
];

const territoryCodes: readonly string[] = [
  "ABW",
  "AFG",
  "AGO",
  "AIA",
  "ALB",
  "AND",
  "ANT",
  "ARE",
  "ARG",
  "ARM",
  "ASM",
  "ATG",
  "AUS",
  "AUT",
  "AZE",
  "BDI",
  "BEL",
  "BEN",
  "BES",
  "BFA",
  "BGD",
  "BGR",
  "BHR",
  "BHS",
  "BIH",
  "BLR",
  "BLZ",
  "BMU",
  "BOL",
  "BRA",
  "BRB",
  "BRN",
  "BTN",
  "BWA",
  "CAF",
  "CAN",
  "CHE",
  "CHL",
  "CHN",
  "CIV",
  "CMR",
  "COD",
  "COG",
  "COK",
  "COL",
  "COM",
  "CPV",
  "CRI",
  "CUB",
  "CUW",
  "CXR",
  "CYM",
  "CYP",
  "CZE",
  "DEU",
  "DJI",
  "DMA",
  "DNK",
  "DOM",
  "DZA",
  "ECU",
  "EGY",
  "ERI",
  "ESP",
  "EST",
  "ETH",
  "FIN",
  "FJI",
  "FLK",
  "FRA",
  "FRO",
  "FSM",
  "GAB",
  "GBR",
  "GEO",
  "GGY",
  "GHA",
  "GIB",
  "GIN",
  "GLP",
  "GMB",
  "GNB",
  "GNQ",
  "GRC",
  "GRD",
  "GRL",
  "GTM",
  "GUF",
  "GUM",
  "GUY",
  "HKG",
  "HND",
  "HRV",
  "HTI",
  "HUN",
  "IDN",
  "IMN",
  "IND",
  "IRL",
  "IRQ",
  "ISL",
  "ISR",
  "ITA",
  "JAM",
  "JEY",
  "JOR",
  "JPN",
  "KAZ",
  "KEN",
  "KGZ",
  "KHM",
  "KIR",
  "KNA",
  "KOR",
  "KWT",
  "LAO",
  "LBN",
  "LBR",
  "LBY",
  "LCA",
  "LIE",
  "LKA",
  "LSO",
  "LTU",
  "LUX",
  "LVA",
  "MAC",
  "MAR",
  "MCO",
  "MDA",
  "MDG",
  "MDV",
  "MEX",
  "MHL",
  "MKD",
  "MLI",
  "MLT",
  "MMR",
  "MNE",
  "MNG",
  "MNP",
  "MOZ",
  "MRT",
  "MSR",
  "MTQ",
  "MUS",
  "MWI",
  "MYS",
  "MYT",
  "NAM",
  "NCL",
  "NER",
  "NFK",
  "NGA",
  "NIC",
  "NIU",
  "NLD",
  "NOR",
  "NPL",
  "NRU",
  "NZL",
  "OMN",
  "PAK",
  "PAN",
  "PER",
  "PHL",
  "PLW",
  "PNG",
  "POL",
  "PRI",
  "PRT",
  "PRY",
  "PSE",
  "PYF",
  "QAT",
  "REU",
  "ROU",
  "RUS",
  "RWA",
  "SAU",
  "SEN",
  "SGP",
  "SHN",
  "SLB",
  "SLE",
  "SLV",
  "SMR",
  "SOM",
  "SPM",
  "SRB",
  "SSD",
  "STP",
  "SUR",
  "SVK",
  "SVN",
  "SWE",
  "SWZ",
  "SXM",
  "SYC",
  "TCA",
  "TCD",
  "TGO",
  "THA",
  "TJK",
  "TKM",
  "TLS",
  "TON",
  "TTO",
  "TUN",
  "TUR",
  "TUV",
  "TWN",
  "TZA",
  "UGA",
  "UKR",
  "UMI",
  "URY",
  "USA",
  "UZB",
  "VAT",
  "VCT",
  "VEN",
  "VGB",
  "VIR",
  "VNM",
  "VUT",
  "WLF",
  "WSM",
  "XKS",
  "YEM",
  "ZAF",
  "ZMB",
  "ZWE",
];

const rolesInput = (description: string) =>
  s.array(description, s.stringEnum("An App Store Connect team role.", teamRoles), {
    minItems: 1,
  });

const visibleAppIdsInput = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "App Store Connect identifier of an app.",
  });

const visibleAppIdsOutput = (description: string) =>
  s.stringArray(description, { itemDescription: "App Store Connect identifier of an app." });

const userInvitationResource = resourceObject(
  "A pending invitation to join the App Store Connect team.",
  "App Store Connect identifier for the invitation.",
  {
    email: s.nullableString("Email address the invitation was sent to."),
    firstName: s.nullableString("First name of the invited user."),
    lastName: s.nullableString("Last name of the invited user."),
    expirationDate: s.nullableString(
      "When the invitation expires, as an ISO 8601 timestamp. Invitations last three days.",
    ),
    roles: s.nullable(
      s.array("Roles the user receives on accepting.", s.stringEnum("An App Store Connect team role.", teamRoles)),
    ),
    allAppsVisible: s.nullableBoolean("Whether the user will see every app on the team."),
    provisioningAllowed: s.nullableBoolean("Whether the user may manage certificates, identifiers, and profiles."),
  },
);

const actorResource = resourceObject(
  "An actor from the App Store Connect audit log: the person, API key, or system that performed an action.",
  "App Store Connect identifier for the actor.",
  {
    actorType: nullableEnum("Kind of actor.", actorTypes),
    userFirstName: s.nullableString("First name when the actor is a team member."),
    userLastName: s.nullableString("Last name when the actor is a team member."),
    userEmail: s.nullableString("Email address when the actor is a team member."),
    apiKeyId: s.nullableString("Key ID when the actor is an App Store Connect API key."),
  },
);

const sandboxTesterResource = resourceObject(
  "A Sandbox Apple Account used to test in-app purchases and subscriptions.",
  "App Store Connect identifier for the sandbox tester.",
  {
    firstName: s.nullableString("Tester first name."),
    lastName: s.nullableString("Tester last name."),
    acAccountName: s.nullableString("Sandbox Apple Account email the tester signs in with."),
    territory: nullableEnum(
      "App Store territory the tester purchases in, as an ISO 3166-1 alpha-3 code.",
      territoryCodes,
    ),
    applePayCompatible: s.nullableBoolean("Whether the account can test Apple Pay."),
    interruptPurchases: s.nullableBoolean(
      "Whether purchases are interrupted so the tester must resolve a billing issue first.",
    ),
    subscriptionRenewalRate: nullableEnum(
      "How fast a one-month subscription renews in the sandbox.",
      sandboxSubscriptionRenewalRates,
    ),
  },
);

const analyticsReportRequestResource = resourceObject(
  "A request that makes App Store Connect generate analytics reports for one app.",
  "App Store Connect identifier for the report request.",
  {
    accessType: nullableEnum(
      "ONGOING keeps producing daily, weekly, and monthly reports; ONE_TIME_SNAPSHOT delivers historical data once.",
      analyticsReportAccessTypes,
    ),
    stoppedDueToInactivity: s.nullableBoolean(
      "True once App Store Connect stopped the request because its reports were not read for a long time; create a new request to resume.",
    ),
  },
);

const analyticsReportResource = resourceObject(
  "One analytics report type produced by a report request.",
  "App Store Connect identifier for the report.",
  {
    name: s.nullableString("Report name, such as App Store Downloads Standard."),
    category: nullableEnum("Report category.", analyticsReportCategories),
  },
);

const analyticsReportInstanceResource = resourceObject(
  "One time-bounded instance of an analytics report.",
  "App Store Connect identifier for the report instance.",
  {
    granularity: nullableEnum("Reporting period covered by the instance.", analyticsReportGranularities),
    processingDate: s.nullableString("Date the instance was processed, as YYYY-MM-DD."),
  },
);

const analyticsReportSegmentResource = resourceObject(
  "One downloadable segment of an analytics report instance.",
  "App Store Connect identifier for the segment.",
  {
    url: s.nullableString(
      "Download URL of the gzip-compressed report segment. It expires five minutes after this response, so download it right away.",
    ),
    checksum: s.nullableString("MD5 checksum of the compressed segment file."),
    sizeInBytes: s.nullableInteger("Size of the compressed segment file in bytes."),
  },
);

const diagnosticSignatureResource = resourceObject(
  "A recurring pattern of calls in a build that App Store Connect linked to a metric.",
  "App Store Connect identifier for the diagnostic signature.",
  {
    diagnosticType: nullableEnum("Diagnostic category the signature belongs to.", diagnosticTypes),
    signature: s.nullableString("Name of the signature, generated by the system."),
    weight: s.nullableNumber("How critical the issue is, between 0 and 1; higher values matter more."),
    insight: s.nullable(
      s.looseObject("Trend App Store Connect derived for the signature across app versions.", {
        insightType: nullableEnum("Kind of insight.", diagnosticInsightTypes),
        direction: nullableEnum("Whether the signature is trending up or down.", diagnosticInsightDirections),
        referenceVersions: s.nullable(
          s.array(
            "Earlier app versions the trend was computed against.",
            s.looseObject("One reference version.", {
              version: s.nullableString("App version string."),
              value: s.nullableNumber("Signature weight measured for that version."),
            }),
          ),
        ),
      }),
    ),
  },
);

const perfPowerMetricsOutput = s.actionOutput(
  {
    metrics: s.looseObject("The xcodeMetrics document exactly as App Store Connect returned it.", {
      version: s.nullableString("Version of the xcodeMetrics document format."),
      insights: s.nullable(
        s.looseObject("Automatically generated trends comparing the latest version with earlier ones.", {
          trendingUp: s.nullable(
            s.array("Metrics that got worse in the latest version.", s.looseObject("One metrics insight.")),
          ),
          regressions: s.nullable(
            s.array("Metrics that regressed against reference versions.", s.looseObject("One metrics insight.")),
          ),
        }),
      ),
      productData: s.nullable(
        s.array(
          "Metric categories and datasets, one entry per platform.",
          s.looseObject("Metrics for one platform.", {
            platform: s.nullableString("Platform the metrics were collected on."),
            metricCategories: s.nullable(
              s.array(
                "Metric categories with their metrics, units, goals, and datasets.",
                s.looseObject("One metric category."),
              ),
            ),
          }),
        ),
      ),
    }),
  },
  "Performance and power metrics in the xcodeMetrics document format.",
);

const perfPowerMetricsFilters = {
  platform: s.stringEnum("Return only metrics for this platform.", perfPowerMetricPlatforms),
  metricTypes: s.array(
    "Return only these metric categories.",
    s.stringEnum("A metric category.", perfPowerMetricTypes),
    { minItems: 1 },
  ),
  deviceTypes: s.stringArray(
    "Return only metrics for these device types, such as iPhone14,2. Use all_iphones for every iPhone model and all_ipads for every iPad model.",
    {
      minItems: 1,
      itemDescription: "A device type identifier or one of the all_iphones / all_ipads groups.",
    },
  ),
};

export const appStoreConnectAccessAnalyticsActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "update_user",
    operationType: "destructive",
    description:
      "Change the roles, app visibility, or provisioning access of a team member. Roles and visible apps replace the current values rather than adding to them. Pass at least one field to change.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The team member and the settings to change.",
      {
        userId: nonEmptyString("App Store Connect identifier of the team member."),
        roles: rolesInput("Full set of roles the user should hold afterwards."),
        allAppsVisible: s.boolean(
          "Give the user access to every app on the team, or restrict them to the visible apps when false.",
        ),
        provisioningAllowed: s.boolean("Let the user manage certificates, identifiers, and profiles."),
        visibleAppIds: visibleAppIdsInput("Full set of apps the user may see when allAppsVisible is false."),
      },
      { required: ["userId"] },
    ),
    outputSchema: s.actionOutput({ user: userResource }, "The updated team member."),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description:
      "Remove a member from the App Store Connect team. They lose access to every app and to any API keys tied to their account.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.actionInput(
      { userId: nonEmptyString("App Store Connect identifier of the team member.") },
      ["userId"],
      "Identifies the team member to remove.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed team member."),
      "Confirmation that the team member was removed.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_user_visible_apps",
    operationType: "read",
    description:
      "List the apps a team member can see. For a user with allAppsVisible the list reflects every app on the team.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The team member whose visible apps to list.",
      {
        userId: nonEmptyString("App Store Connect identifier of the team member."),
        ...paginationInputs,
      },
      { required: ["userId"] },
    ),
    outputSchema: pageOutput(
      "apps",
      appResource,
      "Apps returned for this page.",
      "A page of apps visible to the team member.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_visible_apps_to_user",
    operationType: "write",
    description: "Make additional apps visible to a team member who does not have access to all apps.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The apps to make visible to a team member.",
      {
        userId: nonEmptyString("App Store Connect identifier of the team member."),
        appIds: visibleAppIdsInput("Identifiers of the apps to add."),
      },
      { required: ["userId", "appIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        userId: s.string("The team member the apps were made visible to."),
        appIds: visibleAppIdsOutput("Identifiers of the apps that were added."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the apps were made visible to the team member.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_visible_apps_from_user",
    operationType: "destructive",
    description: "Hide apps from a team member so they can no longer open them in App Store Connect.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The apps to hide from a team member.",
      {
        userId: nonEmptyString("App Store Connect identifier of the team member."),
        appIds: visibleAppIdsInput("Identifiers of the apps to remove."),
      },
      { required: ["userId", "appIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        userId: s.string("The team member the apps were hidden from."),
        appIds: visibleAppIdsOutput("Identifiers of the apps that were removed."),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the apps were hidden from the team member.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_user_visible_apps",
    operationType: "destructive",
    description:
      "Replace the whole set of apps a team member can see. Apps missing from the new list are hidden from the user.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The complete list of apps the team member should see.",
      {
        userId: nonEmptyString("App Store Connect identifier of the team member."),
        appIds: visibleAppIdsInput("Identifiers of every app that should stay visible."),
      },
      { required: ["userId", "appIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        userId: s.string("The team member whose visible apps were replaced."),
        appIds: visibleAppIdsOutput("Identifiers of the apps that are visible now."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the visible apps were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_user_invitations",
    operationType: "read",
    description:
      "List pending invitations to join the App Store Connect team, optionally narrowed by email, role, or visible app.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "Filters for browsing pending invitations.",
      {
        email: emailString("Return only the invitation sent to this exact email address."),
        roles: rolesInput("Return only invitations granting at least one of these roles."),
        visibleAppId: nonEmptyString("Return only invitations that make this app visible."),
        sort: s.stringEnum("Sort order for the returned invitations.", ["email", "-email", "lastName", "-lastName"]),
        ...paginationInputs,
      },
      { optional: ["email", "roles", "visibleAppId", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput(
      "userInvitations",
      userInvitationResource,
      "Invitations returned for this page.",
      "A page of pending team invitations.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user_invitation",
    operationType: "read",
    description: "Read one pending team invitation by identifier.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.actionInput(
      { userInvitationId: nonEmptyString("App Store Connect identifier of the invitation.") },
      ["userInvitationId"],
      "Identifies the invitation to read.",
    ),
    outputSchema: s.actionOutput({ userInvitation: userInvitationResource }, "The requested invitation."),
  }),
  defineProviderAction(service, {
    name: "invite_user",
    operationType: "write",
    description:
      "Invite someone to join the App Store Connect team with the given roles. Apple emails them an activation link that expires after three days; the invitation can be cancelled until it is accepted.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The person to invite and the access they receive.",
      {
        email: emailString("Email address the invitation is sent to."),
        firstName: nonEmptyString("First name of the invited user."),
        lastName: nonEmptyString("Last name of the invited user."),
        roles: rolesInput("Roles the user holds after accepting."),
        allAppsVisible: s.boolean(
          "Give the user access to every app on the team; when false, only visibleAppIds are shown.",
        ),
        provisioningAllowed: s.boolean("Let the user manage certificates, identifiers, and profiles."),
        visibleAppIds: visibleAppIdsInput("Apps the user may see when allAppsVisible is false."),
      },
      { required: ["email", "firstName", "lastName", "roles"] },
    ),
    outputSchema: s.actionOutput({ userInvitation: userInvitationResource }, "The created invitation."),
  }),
  defineProviderAction(service, {
    name: "cancel_user_invitation",
    operationType: "destructive",
    description:
      "Cancel a pending team invitation. The activation link stops working; invite the person again if needed.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.actionInput(
      { userInvitationId: nonEmptyString("App Store Connect identifier of the invitation.") },
      ["userInvitationId"],
      "Identifies the invitation to cancel.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the cancelled invitation."),
      "Confirmation that the invitation was cancelled.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_user_invitation_visible_apps",
    operationType: "read",
    description: "List the apps a pending invitation will make visible to the invited user.",
    requiredScopes: [],
    providerPermissions: [...usersAndAccessRoles],
    inputSchema: s.object(
      "The invitation whose visible apps to list.",
      {
        userInvitationId: nonEmptyString("App Store Connect identifier of the invitation."),
        ...paginationInputs,
      },
      { required: ["userInvitationId"] },
    ),
    outputSchema: pageOutput(
      "apps",
      appResource,
      "Apps returned for this page.",
      "A page of apps the invitation makes visible.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_actors",
    operationType: "read",
    description:
      "Resolve audit-log actor identifiers, such as the submitter of a review submission, to the team member, API key, or system that performed the action. App Store Connect requires at least one identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "The actors to resolve.",
      {
        actorIds: s.stringArray("Identifiers of the actors to return.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of an actor.",
        }),
        ...paginationInputs,
      },
      { required: ["actorIds"] },
    ),
    outputSchema: pageOutput("actors", actorResource, "Actors returned for this page.", "A page of audit-log actors."),
  }),
  defineProviderAction(service, {
    name: "get_actor",
    operationType: "read",
    description: "Read one audit-log actor by identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { actorId: nonEmptyString("App Store Connect identifier of the actor.") },
      ["actorId"],
      "Identifies the actor to read.",
    ),
    outputSchema: s.actionOutput({ actor: actorResource }, "The requested actor."),
  }),
  defineProviderAction(service, {
    name: "list_sandbox_testers",
    operationType: "read",
    description:
      "List the Sandbox Apple Accounts of the team used to test in-app purchases. Sandbox accounts are created and deleted in App Store Connect, not through the API.",
    requiredScopes: [],
    providerPermissions: [...manageSandboxTestersRoles],
    inputSchema: s.object("Paging options for browsing sandbox testers.", paginationInputs, {
      optional: ["limit", "cursor"],
    }),
    outputSchema: pageOutput(
      "sandboxTesters",
      sandboxTesterResource,
      "Sandbox testers returned for this page.",
      "A page of sandbox testers.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_sandbox_tester",
    operationType: "destructive",
    description:
      "Change the territory, interrupted-purchase setting, or subscription renewal rate of a sandbox tester. Changes can take up to an hour to reach the sandbox environment. Pass at least one field to change.",
    requiredScopes: [],
    providerPermissions: [...manageSandboxTestersRoles],
    inputSchema: s.object(
      "The sandbox tester and the settings to change.",
      {
        sandboxTesterId: nonEmptyString("App Store Connect identifier of the sandbox tester."),
        territory: s.stringEnum(
          "App Store territory the tester purchases in, as an ISO 3166-1 alpha-3 code such as USA.",
          territoryCodes,
        ),
        interruptPurchases: s.boolean("Interrupt purchases so the tester must resolve a billing issue before buying."),
        subscriptionRenewalRate: s.stringEnum(
          "How fast a one-month subscription renews in the sandbox.",
          sandboxSubscriptionRenewalRates,
        ),
      },
      { required: ["sandboxTesterId"] },
    ),
    outputSchema: s.actionOutput({ sandboxTester: sandboxTesterResource }, "The updated sandbox tester."),
  }),
  defineProviderAction(service, {
    name: "clear_sandbox_tester_purchase_history",
    operationType: "destructive",
    description:
      "Erase the purchase history of sandbox testers so they can test first-time purchases again. The history cannot be restored.",
    requiredScopes: [],
    providerPermissions: [...manageSandboxTestersRoles],
    inputSchema: s.object(
      "The sandbox testers whose purchase history to clear.",
      {
        sandboxTesterIds: s.stringArray("Identifiers of the sandbox testers to reset.", {
          minItems: 1,
          itemDescription: "App Store Connect identifier of a sandbox tester.",
        }),
      },
      { required: ["sandboxTesterIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        id: s.string("App Store Connect identifier of the clear-history request."),
        sandboxTesterIds: s.stringArray("Identifiers of the sandbox testers that were reset.", {
          itemDescription: "App Store Connect identifier of a sandbox tester.",
        }),
        cleared: s.boolean("Always true once App Store Connect accepted the request."),
      },
      "Confirmation that the purchase history was cleared.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_analytics_report_requests",
    operationType: "read",
    description: "List the analytics report requests of one app, which are the entry point to its analytics reports.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.object(
      "Filters for browsing report requests.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        accessType: s.stringEnum("Return only requests with this access type.", analyticsReportAccessTypes),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "analyticsReportRequests",
      analyticsReportRequestResource,
      "Report requests returned for this page.",
      "A page of analytics report requests.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_report_request",
    operationType: "read",
    description: "Read one analytics report request by identifier.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.actionInput(
      {
        analyticsReportRequestId: nonEmptyString("App Store Connect identifier of the report request."),
      },
      ["analyticsReportRequestId"],
      "Identifies the report request to read.",
    ),
    outputSchema: s.actionOutput(
      { analyticsReportRequest: analyticsReportRequestResource },
      "The requested report request.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_analytics_report_request",
    operationType: "write",
    description:
      "Ask App Store Connect to generate analytics reports for an app. ONGOING produces new daily, weekly, and monthly reports until the request is deleted or stops for inactivity; ONE_TIME_SNAPSHOT delivers historical data once. Reports appear asynchronously, so list them later.",
    requiredScopes: [],
    providerPermissions: [...manageAnalyticsReportRequestsRoles],
    inputSchema: s.object(
      "The report request to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        accessType: s.stringEnum("How often reports are produced.", analyticsReportAccessTypes),
      },
      { required: ["appId", "accessType"] },
    ),
    outputSchema: s.actionOutput(
      { analyticsReportRequest: analyticsReportRequestResource },
      "The created report request.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_analytics_report_request",
    operationType: "destructive",
    description:
      "Delete an analytics report request. App Store Connect stops producing its reports and the existing report instances are no longer listed.",
    requiredScopes: [],
    providerPermissions: [...manageAnalyticsReportRequestsRoles],
    inputSchema: s.actionInput(
      {
        analyticsReportRequestId: nonEmptyString("App Store Connect identifier of the report request."),
      },
      ["analyticsReportRequestId"],
      "Identifies the report request to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted report request."),
      "Confirmation that the report request was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_analytics_reports",
    operationType: "read",
    description:
      "List the report types available under one analytics report request, optionally narrowed by category or exact name.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.object(
      "Filters for browsing the reports of one request.",
      {
        analyticsReportRequestId: nonEmptyString("App Store Connect identifier of the report request."),
        category: s.stringEnum("Return only reports in this category.", analyticsReportCategories),
        name: nonEmptyString("Return only the report with this exact name."),
        ...paginationInputs,
      },
      { required: ["analyticsReportRequestId"] },
    ),
    outputSchema: pageOutput(
      "analyticsReports",
      analyticsReportResource,
      "Reports returned for this page.",
      "A page of analytics reports.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_report",
    operationType: "read",
    description: "Read one analytics report type by identifier.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.actionInput(
      { analyticsReportId: nonEmptyString("App Store Connect identifier of the report.") },
      ["analyticsReportId"],
      "Identifies the report to read.",
    ),
    outputSchema: s.actionOutput({ analyticsReport: analyticsReportResource }, "The requested report."),
  }),
  defineProviderAction(service, {
    name: "list_analytics_report_instances",
    operationType: "read",
    description:
      "List the processed instances of one analytics report, each covering a daily, weekly, or monthly period.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.object(
      "Filters for browsing report instances.",
      {
        analyticsReportId: nonEmptyString("App Store Connect identifier of the report."),
        granularity: s.stringEnum("Return only instances with this granularity.", analyticsReportGranularities),
        processingDate: s.date("Return only instances processed on this date, as YYYY-MM-DD."),
        ...paginationInputs,
      },
      { required: ["analyticsReportId"] },
    ),
    outputSchema: pageOutput(
      "analyticsReportInstances",
      analyticsReportInstanceResource,
      "Report instances returned for this page.",
      "A page of analytics report instances.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_analytics_report_instance",
    operationType: "read",
    description: "Read one analytics report instance by identifier.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.actionInput(
      {
        analyticsReportInstanceId: nonEmptyString("App Store Connect identifier of the report instance."),
      },
      ["analyticsReportInstanceId"],
      "Identifies the report instance to read.",
    ),
    outputSchema: s.actionOutput(
      { analyticsReportInstance: analyticsReportInstanceResource },
      "The requested report instance.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_analytics_report_segments",
    operationType: "read",
    description:
      "List the downloadable segments of one analytics report instance. Each url points at a gzip-compressed file that the caller downloads itself; the links expire five minutes after they are issued, so call this action right before downloading.",
    requiredScopes: [],
    providerPermissions: [...viewAnalyticsReportsRoles],
    inputSchema: s.object(
      "The report instance whose segments to list.",
      {
        analyticsReportInstanceId: nonEmptyString("App Store Connect identifier of the report instance."),
        ...paginationInputs,
      },
      { required: ["analyticsReportInstanceId"] },
    ),
    outputSchema: pageOutput(
      "analyticsReportSegments",
      analyticsReportSegmentResource,
      "Segments returned for this page.",
      "A page of analytics report segments.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_diagnostic_signatures",
    operationType: "read",
    description:
      "List the diagnostic signatures App Store Connect collected for one build: recurring call patterns behind disk writes, hangs, or slow launches, weighted by how critical they are.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the diagnostic signatures of one build.",
      {
        buildId: nonEmptyString("App Store Connect identifier of the build."),
        diagnosticType: s.stringEnum("Return only signatures of this diagnostic type.", diagnosticTypes),
        ...paginationInputs,
      },
      { required: ["buildId"] },
    ),
    outputSchema: pageOutput(
      "diagnosticSignatures",
      diagnosticSignatureResource,
      "Diagnostic signatures returned for this page.",
      "A page of diagnostic signatures.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_diagnostic_signature_logs",
    operationType: "read",
    description:
      "Fetch the anonymized backtrace logs App Store Connect recorded for one diagnostic signature, including call stack trees and device metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "The diagnostic signature whose logs to fetch.",
      {
        diagnosticSignatureId: nonEmptyString("App Store Connect identifier of the diagnostic signature."),
        limit: s.integer("Maximum number of diagnostic logs to return.", {
          minimum: 1,
          maximum: 200,
        }),
      },
      { required: ["diagnosticSignatureId"] },
    ),
    outputSchema: s.actionOutput(
      {
        version: s.nullableString("Version of the diagnostic logs document format."),
        productData: s.array(
          "Diagnostic insights and logs, one entry per signature.",
          s.looseObject("Diagnostic data for one signature.", {
            signatureId: s.nullableString("Identifier of the diagnostic signature."),
            diagnosticInsights: s.nullable(
              s.array(
                "Insights App Store Connect derived from the logs.",
                s.looseObject("One diagnostic insight.", {
                  insightsCategory: s.nullableString("Insight category."),
                  insightsString: s.nullableString("Human readable insight text."),
                  insightsURL: s.nullableString("Documentation link for the insight."),
                }),
              ),
            ),
            diagnosticLogs: s.nullable(
              s.array(
                "Anonymized logs with their call stack trees and metadata.",
                s.looseObject("One diagnostic log.", {
                  diagnosticMetaData: s.nullable(
                    s.looseObject("Device and app details of the log.", {
                      appVersion: s.nullableString("App version the log was recorded on."),
                      buildVersion: s.nullableString("Build number the log was recorded on."),
                      bundleId: s.nullableString("Bundle identifier of the app."),
                      deviceType: s.nullableString("Device model the log came from."),
                      osVersion: s.nullableString("Operating system version on the device."),
                      platformArchitecture: s.nullableString("CPU architecture of the device."),
                      event: s.nullableString("Event that produced the log."),
                      eventDetail: s.nullableString("Additional detail about the event."),
                      writesCaused: s.nullableString("Amount of disk writes for disk write logs."),
                    }),
                  ),
                  callStackTree: s.nullable(
                    s.array("Call stack trees captured in the log.", s.looseObject("One call stack tree.")),
                  ),
                }),
              ),
            ),
          }),
        ),
      },
      "Diagnostic logs in the diagnosticLogs document format.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_perf_power_metrics",
    operationType: "read",
    description:
      "Fetch the performance and power metrics of the most recent versions of an app, such as launch time, hang rate, memory, and battery use, in the xcodeMetrics document format. Use get_build_perf_power_metrics for one specific build.",
    requiredScopes: [],
    inputSchema: s.object(
      "The app and the metrics to fetch.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        ...perfPowerMetricsFilters,
      },
      { required: ["appId"] },
    ),
    outputSchema: perfPowerMetricsOutput,
  }),
  defineProviderAction(service, {
    name: "get_build_perf_power_metrics",
    operationType: "read",
    description: "Fetch the performance and power metrics collected for one build in the xcodeMetrics document format.",
    requiredScopes: [],
    inputSchema: s.object(
      "The build and the metrics to fetch.",
      {
        buildId: nonEmptyString("App Store Connect identifier of the build."),
        ...perfPowerMetricsFilters,
      },
      { required: ["buildId"] },
    ),
    outputSchema: perfPowerMetricsOutput,
  }),
];
