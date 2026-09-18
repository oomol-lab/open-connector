import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  clearableString,
  clearableUrl,
  configureGameCenterRoles,
  contentPlatforms,
  deletedOutput,
  gameCenterImageResource,
  gameCenterVersionFields,
  nonEmptyString,
  nullableEnum,
  nullableStringArray,
  pageOutput,
  paginationInputs,
  resourceObject,
  urlString,
} from "./schemas.ts";

export const gameCenterActivityPlayStyles: readonly string[] = ["ASYNCHRONOUS", "SYNCHRONOUS"];

export const gameCenterChallengeTypes: readonly string[] = ["LEADERBOARD"];
export const gameCenterMatchmakingRuleTypes: readonly string[] = ["COMPATIBLE", "DISTANCE", "MATCH", "TEAM"];

export const gameCenterMetricGranularities: readonly string[] = ["P1D", "PT1H", "PT15M"];
export const gameCenterMatchmakingRequestResults: readonly string[] = ["MATCHED", "CANCELED", "EXPIRED"];

export const gameCenterMatchmakingTestLocales: readonly string[] = [
  "AR-SA",
  "CA-ES",
  "CS-CZ",
  "DA-DK",
  "DE-DE",
  "EL-GR",
  "EN-AU",
  "EN-GB",
  "EN-US",
  "EN-KY",
  "ES-ES",
  "ES-MX",
  "FI-FI",
  "FR-CA",
  "FR-FR",
  "HI-IN",
  "HR-HR",
  "HU-HU",
  "ID-ID",
  "IT-IT",
  "IW-IL",
  "JA-JP",
  "KO-KR",
  "MS-MY",
  "NL-NL",
  "NO-NO",
  "PL-PL",
  "PT-BR",
  "PT-PT",
  "RO-RO",
  "RU-RU",
  "SK-SK",
  "SV-SE",
  "TH-TH",
  "TR-TR",
  "UK-UA",
  "ZH-CN",
  "ZH-TW",
  "ZH-HK",
];

const identifierListInput = (description: string) =>
  s.stringArray(description, { minItems: 1, itemDescription: "An App Store Connect identifier." });
const identifierListOutput = (description: string) =>
  s.stringArray(description, { itemDescription: "An App Store Connect identifier." });

export const gameCenterActivityResource: JsonSchema = resourceObject(
  "A Game Center activity: a play session other players can be invited into, with its own achievements and leaderboards.",
  "App Store Connect identifier for the activity.",
  {
    referenceName: s.nullableString("Internal activity name shown in App Store Connect."),
    vendorIdentifier: s.nullableString(
      "Activity identifier the game starts sessions with, unique within the app or group.",
    ),
    playStyle: nullableEnum("Whether players take turns or play at the same time.", gameCenterActivityPlayStyles),
    minimumPlayersCount: s.nullableInteger("Fewest players an activity session needs."),
    maximumPlayersCount: s.nullableInteger("Most players an activity session accepts."),
    supportsPartyCode: s.nullableBoolean("Whether players can join the activity with a party code."),
    archived: s.nullableBoolean("Whether the activity is archived and no longer offered."),
    properties: s.nullable(s.looseObject("Key-value properties the game reads when it starts the activity.", {})),
  },
);

export const gameCenterActivityVersionResource: JsonSchema = resourceObject(
  "One version of a Game Center activity. A new version carries the localizations and the default image through App Review.",
  "App Store Connect identifier for the activity version.",
  {
    ...gameCenterVersionFields,
    fallbackUrl: s.nullableString("Web page opened when a player without the game follows an activity invitation."),
  },
);

export const gameCenterActivityLocalizationResource: JsonSchema = resourceObject(
  "The activity text in one locale.",
  "App Store Connect identifier for the activity localization.",
  {
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    name: s.nullableString("Activity name shown to players in this locale."),
    description: s.nullableString("Activity description shown to players in this locale."),
  },
);

export const gameCenterActivityImageResource: JsonSchema = gameCenterImageResource(
  "The image shown with a Game Center activity.",
  "App Store Connect identifier for the activity image.",
);

export const gameCenterChallengeResource: JsonSchema = resourceObject(
  "A Game Center challenge: an invitation to beat a score on one leaderboard.",
  "App Store Connect identifier for the challenge.",
  {
    referenceName: s.nullableString("Internal challenge name shown in App Store Connect."),
    vendorIdentifier: s.nullableString("Challenge identifier the game refers to, unique within the app or group."),
    challengeType: nullableEnum("What the challenge is based on.", gameCenterChallengeTypes),
    repeatable: s.nullableBoolean("Whether a player can take the challenge more than once."),
    archived: s.nullableBoolean("Whether the challenge is archived and no longer offered."),
  },
);

export const gameCenterChallengeVersionResource: JsonSchema = resourceObject(
  "One version of a Game Center challenge.",
  "App Store Connect identifier for the challenge version.",
  { ...gameCenterVersionFields },
);

export const gameCenterChallengeLocalizationResource: JsonSchema = resourceObject(
  "The challenge text in one locale.",
  "App Store Connect identifier for the challenge localization.",
  {
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    name: s.nullableString("Challenge name shown to players in this locale."),
    description: s.nullableString("Challenge description shown to players in this locale."),
  },
);

export const gameCenterChallengeImageResource: JsonSchema = gameCenterImageResource(
  "The image shown with a Game Center challenge.",
  "App Store Connect identifier for the challenge image.",
);

export const gameCenterMatchmakingQueueResource: JsonSchema = resourceObject(
  "A Game Center matchmaking queue. Requests that reach the queue are matched with the rule set attached to it.",
  "App Store Connect identifier for the matchmaking queue.",
  {
    referenceName: s.nullableString("Internal queue name shown in App Store Connect."),
    classicMatchmakingBundleIds: s.nullable(
      s.stringArray("Bundle identifiers whose classic matchmaking requests use this queue.", {
        itemDescription: "A bundle identifier.",
      }),
    ),
    ruleSetId: s.nullableString("Rule set the queue matches requests with."),
    experimentRuleSetId: s.nullableString(
      "Rule set a share of the queue traffic is matched with while an experiment runs, or null when no experiment is running.",
    ),
  },
  ["ruleSetId", "experimentRuleSetId"],
);

export const gameCenterMatchmakingRuleSetResource: JsonSchema = resourceObject(
  "A Game Center matchmaking rule set: the team layout, player limits and rules a queue matches requests with.",
  "App Store Connect identifier for the rule set.",
  {
    referenceName: s.nullableString("Internal rule set name shown in App Store Connect."),
    ruleLanguageVersion: s.nullableInteger("Version of the rule expression language the rules use."),
    minPlayers: s.nullableInteger("Fewest players a match created from this rule set may have."),
    maxPlayers: s.nullableInteger("Most players a match created from this rule set may have."),
  },
);

export const gameCenterMatchmakingRuleResource: JsonSchema = resourceObject(
  "One rule of a Game Center matchmaking rule set.",
  "App Store Connect identifier for the rule.",
  {
    referenceName: s.nullableString("Internal rule name shown in App Store Connect."),
    description: s.nullableString("What the rule checks, for the team reading the rule set."),
    type: nullableEnum("How the rule result is used.", gameCenterMatchmakingRuleTypes),
    expression: s.nullableString("Rule expression evaluated for every candidate match."),
    weight: s.nullableNumber(
      "How much the rule counts against the other rules of the same type when Game Center scores a candidate match.",
    ),
  },
);

export const gameCenterMatchmakingTeamResource: JsonSchema = resourceObject(
  "One team of a Game Center matchmaking rule set.",
  "App Store Connect identifier for the team.",
  {
    referenceName: s.nullableString("Internal team name the rule expressions refer to."),
    minPlayers: s.nullableInteger("Fewest players the team needs."),
    maxPlayers: s.nullableInteger("Most players the team accepts."),
  },
);

export const gameCenterMatchmakingRuleSetTestResource: JsonSchema = resourceObject(
  "The result of matching a set of simulated requests against a rule set.",
  "App Store Connect identifier for the rule set test.",
  {
    matchmakingResults: s.nullable(
      s.array(
        "One entry per match Game Center formed from the simulated requests.",
        s.array(
          "The simulated requests that ended up in the same match.",
          s.looseObject("One matched request.", {
            requestName: s.nullableString("Name given to the simulated request."),
            teamAssignments: s.nullable(
              s.array(
                "Which team each player of the request was assigned to.",
                s.looseObject("One player team assignment.", {
                  playerId: s.nullableString("Simulated player identifier."),
                  team: s.nullableString("Team the player was assigned to."),
                }),
              ),
            ),
          }),
        ),
      ),
    ),
  },
);

const metricSeries = (description: string, values: Record<string, JsonSchema>) =>
  s.looseObject(description, {
    granularity: nullableEnum("Time span each data point covers.", gameCenterMetricGranularities),
    dimensions: s.nullable(
      s.record(
        "Dimension values this series is grouped by, keyed by dimension name.",
        s.nullableString("Value of one dimension."),
      ),
    ),
    dataPoints: s.nullable(
      s.array(
        "Measured periods of this series, oldest first.",
        s.looseObject("One measured period.", {
          start: s.nullableString("Start of the period, as an ISO 8601 timestamp."),
          end: s.nullableString("End of the period, as an ISO 8601 timestamp."),
          values: s.nullable(s.looseObject("Values measured in the period.", values)),
        }),
      ),
    ),
  });

const requestMetricValues = {
  count: s.nullableInteger("Number of matchmaking requests in the period."),
  averageSecondsInQueue: s.nullableNumber("Average time a request waited in the queue, in seconds."),
  p50SecondsInQueue: s.nullableNumber("Median time a request waited in the queue, in seconds."),
  p95SecondsInQueue: s.nullableNumber("Time the slowest 5 percent of requests waited in the queue, in seconds."),
};

const queueSizeMetricValues = {
  count: s.nullableInteger("Number of queue size samples in the period."),
  averageNumberOfRequests: s.nullableNumber("Average number of requests waiting in the queue."),
  p50NumberOfRequests: s.nullableNumber("Median number of requests waiting in the queue."),
  p95NumberOfRequests: s.nullableNumber("Number of requests waiting in the queue at the 95th percentile."),
};

const sessionMetricValues = {
  count: s.nullableInteger("Number of matchmaking sessions in the period."),
  averagePlayerCount: s.nullableNumber("Average number of players in a session."),
  p50PlayerCount: s.nullableNumber("Median number of players in a session."),
  p95PlayerCount: s.nullableNumber("Number of players in a session at the 95th percentile."),
};

const countMetricValues = {
  count: s.nullableInteger("Number of rule evaluations in the period."),
};

const numberRuleResultMetricValues = {
  count: s.nullableInteger("Number of rule evaluations in the period."),
  averageResult: s.nullableNumber("Average value the rule expression returned."),
  p50Result: s.nullableNumber("Median value the rule expression returned."),
  p95Result: s.nullableNumber("Value the rule expression returned at the 95th percentile."),
};

export const gameCenterMatchmakingRequestMetricSeries: JsonSchema = metricSeries(
  "One matchmaking request series.",
  requestMetricValues,
);
export const gameCenterMatchmakingQueueSizeMetricSeries: JsonSchema = metricSeries(
  "One queue size series.",
  queueSizeMetricValues,
);
export const gameCenterMatchmakingSessionMetricSeries: JsonSchema = metricSeries(
  "One matchmaking session series.",
  sessionMetricValues,
);
export const gameCenterMatchmakingCountMetricSeries: JsonSchema = metricSeries(
  "One rule evaluation series.",
  countMetricValues,
);
export const gameCenterMatchmakingNumberRuleResultMetricSeries: JsonSchema = metricSeries(
  "One numeric rule result series.",
  numberRuleResultMetricValues,
);

export const metricInputs: Record<string, JsonSchema> = {
  granularity: s.stringEnum("Time span each returned data point covers.", gameCenterMetricGranularities),
  ...paginationInputs,
};

const challengeFilterInputs = {
  referenceNames: s.stringArray("Return only challenges with these internal reference names.", {
    minItems: 1,
    itemDescription: "An internal challenge reference name.",
  }),
  archived: s.boolean(
    "Return only archived challenges when true, or only challenges still offered to players when false.",
  ),
  gameCenterChallengeIds: identifierListInput("Return only the challenges with these App Store Connect identifiers."),
};

const matchmakingRequestGroupBys: readonly string[] = ["result"];
const matchmakingQueueRequestGroupBys: readonly string[] = ["result", "gameCenterDetail"];
const matchmakingBooleanRuleResultGroupBys: readonly string[] = ["result", "gameCenterMatchmakingQueue"];
const matchmakingRuleGroupBys: readonly string[] = ["gameCenterMatchmakingQueue"];

const metricGroupByInput = (description: string, values: readonly string[]) =>
  s.array(description, s.stringEnum("A dimension.", values), { minItems: 1 });

export const appStoreConnectGameCenterActivityActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_game_center_detail_activities",
    operationType: "read",
    description:
      "List the Game Center activities of one app, reached through its Game Center detail record. App Store Connect offers no filters here, so page through the results with limit and cursor.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the Game Center detail whose activities to list.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        ...paginationInputs,
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterActivities",
      gameCenterActivityResource,
      "Game Center activities returned for this page.",
      "A page of Game Center activities.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_group_activities",
    operationType: "read",
    description:
      "List the Game Center activities shared by the apps of one Game Center group. App Store Connect offers no filters here, so page through the results with limit and cursor.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the Game Center group whose activities to list.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        ...paginationInputs,
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterActivities",
      gameCenterActivityResource,
      "Game Center activities returned for this page.",
      "A page of Game Center activities.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_activity",
    operationType: "write",
    description:
      "Create a Game Center activity for one app (gameCenterDetailId) or for a group of apps (gameCenterGroupId). Pass fallbackUrl to create the first activity version together with the activity; leave it out and no version is created, so add one afterwards with create_game_center_activity_version before the activity can be localized.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center activity to create.",
      {
        referenceName: nonEmptyString("Internal activity name shown in App Store Connect."),
        vendorIdentifier: nonEmptyString(
          "Activity identifier the game starts sessions with, unique within the app or group.",
        ),
        playStyle: s.stringEnum("Whether players take turns or play at the same time.", gameCenterActivityPlayStyles),
        minimumPlayersCount: s.integer("Fewest players an activity session needs."),
        maximumPlayersCount: s.integer("Most players an activity session accepts."),
        supportsPartyCode: s.boolean("Whether players can join the activity with a party code."),
        properties: s.looseObject("Key-value properties the game reads when it starts the activity.", {}),
        gameCenterDetailId: nonEmptyString(
          "App Store Connect identifier of the Game Center detail the activity belongs to.",
        ),
        gameCenterGroupId: nonEmptyString(
          "App Store Connect identifier of the Game Center group the activity belongs to.",
        ),
        fallbackUrl: urlString(
          "Web page opened when a player without the game follows an activity invitation. When set, the first activity version is created together with the activity and carries this URL.",
        ),
      },
      { required: ["referenceName", "vendorIdentifier"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivity: gameCenterActivityResource },
      "The created Game Center activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_activity",
    operationType: "read",
    description: "Read one Game Center activity by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
      },
      ["gameCenterActivityId"],
      "Identifies the Game Center activity to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivity: gameCenterActivityResource },
      "The requested Game Center activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_activity",
    operationType: "destructive",
    description:
      "Change the configuration of a Game Center activity or archive it. Overwrites the given fields and passing null clears one; vendorIdentifier cannot change once the activity exists. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center activity fields to change.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        referenceName: clearableString("New internal activity name, or null to clear it."),
        playStyle: nullableEnum("New play style, or null to clear it.", gameCenterActivityPlayStyles),
        minimumPlayersCount: s.nullable(
          s.integer("Fewest players an activity session needs, or null to clear the limit."),
        ),
        maximumPlayersCount: s.nullable(
          s.integer("Most players an activity session accepts, or null to clear the limit."),
        ),
        supportsPartyCode: s.boolean("Whether players can join the activity with a party code."),
        archived: s.boolean("Archive the activity when true so it is no longer offered, or bring it back when false."),
        properties: s.nullable(
          s.looseObject(
            "New key-value properties the game reads when it starts the activity, or null to clear them.",
            {},
          ),
        ),
      },
      { required: ["gameCenterActivityId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivity: gameCenterActivityResource },
      "The updated Game Center activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_activity",
    operationType: "destructive",
    description:
      "Delete a Game Center activity together with its versions, localizations and images. Archive it with update_game_center_activity instead when players may still hold invitations to it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
      },
      ["gameCenterActivityId"],
      "Identifies the Game Center activity to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted Game Center activity."),
      "Confirmation that the Game Center activity was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_activity_versions",
    operationType: "read",
    description: "List the versions of one Game Center activity, each with its review and release state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the Game Center activity whose versions to list.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        ...paginationInputs,
      },
      { required: ["gameCenterActivityId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterActivityVersions",
      gameCenterActivityVersionResource,
      "Game Center activity versions returned for this page.",
      "A page of Game Center activity versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_achievements_to_game_center_activity",
    operationType: "write",
    description:
      "Attach achievements to a Game Center activity so players can earn them while the activity is played. Achievements already attached are left as they are.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The activity and the achievements to attach to it.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        gameCenterAchievementIds: identifierListInput("App Store Connect identifiers of the achievements to attach."),
      },
      { required: ["gameCenterActivityId", "gameCenterAchievementIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterActivityId: s.string("The activity the achievements were added to."),
        gameCenterAchievementIds: identifierListOutput("Identifiers of the achievements that were added."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the achievements were added to the activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_achievements_from_game_center_activity",
    operationType: "destructive",
    description:
      "Detach achievements from a Game Center activity. The achievements themselves are kept and stay available outside the activity.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The activity and the achievements to detach from it.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        gameCenterAchievementIds: identifierListInput("App Store Connect identifiers of the achievements to detach."),
      },
      { required: ["gameCenterActivityId", "gameCenterAchievementIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterActivityId: s.string("The activity the achievements were removed from."),
        gameCenterAchievementIds: identifierListOutput("Identifiers of the achievements that were removed."),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the achievements were removed from the activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_leaderboards_to_game_center_activity",
    operationType: "write",
    description:
      "Attach leaderboards to a Game Center activity so scores made while it is played are posted to them. Leaderboards already attached are left as they are.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The activity and the leaderboards to attach to it.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        gameCenterLeaderboardIds: identifierListInput("App Store Connect identifiers of the leaderboards to attach."),
      },
      { required: ["gameCenterActivityId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterActivityId: s.string("The activity the leaderboards were added to."),
        gameCenterLeaderboardIds: identifierListOutput("Identifiers of the leaderboards that were added."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards were added to the activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_leaderboards_from_game_center_activity",
    operationType: "destructive",
    description:
      "Detach leaderboards from a Game Center activity. The leaderboards themselves are kept together with the scores already posted to them.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The activity and the leaderboards to detach from it.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        gameCenterLeaderboardIds: identifierListInput("App Store Connect identifiers of the leaderboards to detach."),
      },
      { required: ["gameCenterActivityId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterActivityId: s.string("The activity the leaderboards were removed from."),
        gameCenterLeaderboardIds: identifierListOutput("Identifiers of the leaderboards that were removed."),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards were removed from the activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_activity_version",
    operationType: "write",
    description:
      "Create a new version of a Game Center activity, for example to change its localizations or its default image after the current version was released. The new version starts in PREPARE_FOR_SUBMISSION.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center activity version to create.",
      {
        gameCenterActivityId: nonEmptyString("App Store Connect identifier of the Game Center activity."),
        fallbackUrl: urlString("Web page opened when a player without the game follows an activity invitation."),
      },
      { required: ["gameCenterActivityId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityVersion: gameCenterActivityVersionResource },
      "The created Game Center activity version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_activity_version",
    operationType: "read",
    description: "Read one Game Center activity version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterActivityVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity version.",
        ),
      },
      ["gameCenterActivityVersionId"],
      "Identifies the Game Center activity version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityVersion: gameCenterActivityVersionResource },
      "The requested Game Center activity version.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_activity_version",
    operationType: "destructive",
    description:
      "Set or clear the fallback URL of a Game Center activity version. Overwrites the existing URL; pass null to remove it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The fallback URL to store on the activity version.",
      {
        gameCenterActivityVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity version.",
        ),
        fallbackUrl: clearableUrl(
          "New web page opened when a player without the game follows an activity invitation, or null to remove it.",
        ),
      },
      { required: ["gameCenterActivityVersionId", "fallbackUrl"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityVersion: gameCenterActivityVersionResource },
      "The updated Game Center activity version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_activity_version_default_image",
    operationType: "read",
    description:
      "Read the default image of a Game Center activity version, shown wherever a locale has no image of its own. Returns null when no default image has been uploaded yet; uploading one is not covered by this connector.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterActivityVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity version.",
        ),
      },
      ["gameCenterActivityVersionId"],
      "Identifies the Game Center activity version whose default image to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityImage: s.nullable(gameCenterActivityImageResource) },
      "The default image of the activity version, or null when the version has no default image.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_activity_version_localizations",
    operationType: "read",
    description: "List the locales one Game Center activity version has text for.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the Game Center activity version whose localizations to list.",
      {
        gameCenterActivityVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity version.",
        ),
        ...paginationInputs,
      },
      { required: ["gameCenterActivityVersionId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterActivityLocalizations",
      gameCenterActivityLocalizationResource,
      "Game Center activity localizations returned for this page.",
      "A page of Game Center activity localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_activity_localization",
    operationType: "write",
    description:
      "Add a locale to a Game Center activity version with the name and description players see in it. App Store Connect rejects a locale the version already has.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center activity localization to create.",
      {
        gameCenterActivityVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity version.",
        ),
        locale: nonEmptyString("Locale to add, such as en-US."),
        name: nonEmptyString("Activity name shown to players in this locale."),
        description: nonEmptyString("Activity description shown to players in this locale."),
      },
      { required: ["gameCenterActivityVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityLocalization: gameCenterActivityLocalizationResource },
      "The created Game Center activity localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_activity_localization",
    operationType: "read",
    description: "Read one Game Center activity localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterActivityLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity localization.",
        ),
      },
      ["gameCenterActivityLocalizationId"],
      "Identifies the Game Center activity localization to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityLocalization: gameCenterActivityLocalizationResource },
      "The requested Game Center activity localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_activity_localization",
    operationType: "destructive",
    description:
      "Replace the name or the description of a Game Center activity localization, or clear one with null. The locale cannot change; delete the localization and create it again instead. Pass at least one field.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center activity localization fields to change.",
      {
        gameCenterActivityLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity localization.",
        ),
        name: clearableString("New activity name shown to players in this locale, or null to clear it."),
        description: clearableString("New activity description shown to players in this locale, or null to clear it."),
      },
      { required: ["gameCenterActivityLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityLocalization: gameCenterActivityLocalizationResource },
      "The updated Game Center activity localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_activity_localization",
    operationType: "destructive",
    description: "Remove a locale from a Game Center activity version, including the image attached to it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterActivityLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity localization.",
        ),
      },
      ["gameCenterActivityLocalizationId"],
      "Identifies the Game Center activity localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted activity localization."),
      "Confirmation that the Game Center activity localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_activity_localization_image",
    operationType: "read",
    description:
      "Read the image of one Game Center activity localization. Returns null when the locale has no image of its own and falls back to the default image of the version; uploading an image is not covered by this connector.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterActivityLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center activity localization.",
        ),
      },
      ["gameCenterActivityLocalizationId"],
      "Identifies the Game Center activity localization whose image to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterActivityImage: s.nullable(gameCenterActivityImageResource) },
      "The image of the activity localization, or null when the locale has no image of its own.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_game_center_detail_challenges",
    operationType: "read",
    description:
      "List the challenges configured on the Game Center detail of one app, optionally narrowed by reference name, archived state or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the challenges of a Game Center detail.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        ...challengeFilterInputs,
        ...paginationInputs,
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterChallenges",
      gameCenterChallengeResource,
      "Game Center challenges returned for this page.",
      "A page of Game Center challenges.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_group_challenges",
    operationType: "read",
    description:
      "List the challenges shared by the games of one Game Center group, optionally narrowed by reference name, archived state or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the challenges of a Game Center group.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        ...challengeFilterInputs,
        ...paginationInputs,
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterChallenges",
      gameCenterChallengeResource,
      "Game Center challenges returned for this page.",
      "A page of Game Center challenges.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_challenge",
    operationType: "write",
    description:
      "Create a Game Center challenge on the Game Center detail of one app or on a group, scored on one leaderboard. The challenge starts without a version; create its first version with create_game_center_challenge_version and add the localized text to that version.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center challenge to create.",
      {
        referenceName: nonEmptyString("Internal challenge name shown in App Store Connect."),
        vendorIdentifier: nonEmptyString("Challenge identifier the game refers to, unique within the app or group."),
        challengeType: s.stringEnum("What the challenge is based on.", gameCenterChallengeTypes),
        repeatable: s.boolean("Whether a player can take the challenge more than once."),
        gameCenterDetailId: nonEmptyString(
          "Game Center detail the challenge belongs to, for a challenge of a single app.",
        ),
        gameCenterGroupId: nonEmptyString(
          "Game Center group the challenge belongs to, for a challenge shared by the games of the group.",
        ),
        gameCenterLeaderboardId: nonEmptyString(
          "App Store Connect identifier of the leaderboard the challenge is scored on.",
        ),
      },
      { required: ["referenceName", "vendorIdentifier", "challengeType"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallenge: gameCenterChallengeResource },
      "The created Game Center challenge.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_challenge",
    operationType: "read",
    description: "Read one Game Center challenge by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeId: nonEmptyString("App Store Connect identifier of the Game Center challenge."),
      },
      ["gameCenterChallengeId"],
      "Identifies the Game Center challenge to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallenge: gameCenterChallengeResource },
      "The requested Game Center challenge.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_challenge",
    operationType: "destructive",
    description:
      "Rename a Game Center challenge, archive it, change whether players may repeat it, or score it on another leaderboard. Overwrites the given fields; pass at least one. The vendor identifier and the challenge type cannot be changed after creation.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center challenge fields to change.",
      {
        gameCenterChallengeId: nonEmptyString("App Store Connect identifier of the Game Center challenge."),
        referenceName: nonEmptyString("New internal challenge name shown in App Store Connect."),
        archived: s.boolean(
          "Archive the challenge when true so it is no longer offered to players, or bring it back when false.",
        ),
        repeatable: s.boolean("Whether a player can take the challenge more than once."),
        gameCenterLeaderboardId: nonEmptyString(
          "App Store Connect identifier of the leaderboard the challenge is scored on, replacing the current one.",
        ),
      },
      { required: ["gameCenterChallengeId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallenge: gameCenterChallengeResource },
      "The updated Game Center challenge.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_challenge",
    operationType: "destructive",
    description: "Delete a Game Center challenge together with all of its versions, localizations and images.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeId: nonEmptyString("App Store Connect identifier of the Game Center challenge."),
      },
      ["gameCenterChallengeId"],
      "Identifies the Game Center challenge to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted Game Center challenge."),
      "Confirmation that the Game Center challenge was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_challenge_versions",
    operationType: "read",
    description: "List the versions of one Game Center challenge, each with the review and release state it is in.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of a Game Center challenge.",
      {
        gameCenterChallengeId: nonEmptyString("App Store Connect identifier of the Game Center challenge."),
        ...paginationInputs,
      },
      { required: ["gameCenterChallengeId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterChallengeVersions",
      gameCenterChallengeVersionResource,
      "Game Center challenge versions returned for this page.",
      "A page of Game Center challenge versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_game_center_challenge_leaderboard",
    operationType: "destructive",
    description:
      "Score a Game Center challenge on another leaderboard, replacing the leaderboard it used before. App Store Connect does not accept detaching the leaderboard, so a leaderboard identifier is always required.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The challenge and the leaderboard it is scored on.",
      {
        gameCenterChallengeId: nonEmptyString("App Store Connect identifier of the Game Center challenge."),
        gameCenterLeaderboardId: nonEmptyString(
          "App Store Connect identifier of the leaderboard the challenge is scored on.",
        ),
      },
      { required: ["gameCenterChallengeId", "gameCenterLeaderboardId"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterChallengeId: s.string("The challenge whose leaderboard was changed."),
        gameCenterLeaderboardId: s.string("The leaderboard the challenge is now scored on."),
        updated: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboard of the challenge was changed.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_challenge_version",
    operationType: "write",
    description:
      "Create a new version of a Game Center challenge, for example to change its localized text after the current version went live. The version starts empty; add its locales with create_game_center_challenge_localization.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeId: nonEmptyString("App Store Connect identifier of the Game Center challenge."),
      },
      ["gameCenterChallengeId"],
      "Identifies the Game Center challenge to create a version of.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeVersion: gameCenterChallengeVersionResource },
      "The created Game Center challenge version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_challenge_version",
    operationType: "read",
    description: "Read one Game Center challenge version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge version.",
        ),
      },
      ["gameCenterChallengeVersionId"],
      "Identifies the Game Center challenge version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeVersion: gameCenterChallengeVersionResource },
      "The requested Game Center challenge version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_challenge_version_default_image",
    operationType: "read",
    description:
      "Read the default image of a Game Center challenge version, the one shown for locales without their own image. Returns null when the version has no default image. Uploading an image is not covered by this connector.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge version.",
        ),
      },
      ["gameCenterChallengeVersionId"],
      "Identifies the Game Center challenge version whose default image to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeImage: s.nullable(gameCenterChallengeImageResource) },
      "The default image of the challenge version, or null when the version has no default image.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_challenge_version_localizations",
    operationType: "read",
    description: "List the locales one Game Center challenge version carries text for.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the localizations of a Game Center challenge version.",
      {
        gameCenterChallengeVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge version.",
        ),
        ...paginationInputs,
      },
      { required: ["gameCenterChallengeVersionId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterChallengeLocalizations",
      gameCenterChallengeLocalizationResource,
      "Game Center challenge localizations returned for this page.",
      "A page of Game Center challenge localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_challenge_localization",
    operationType: "write",
    description:
      "Add a locale with the name and description players see to a Game Center challenge version. App Store Connect rejects a locale the version already has.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center challenge localization to create.",
      {
        gameCenterChallengeVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge version.",
        ),
        locale: nonEmptyString("Locale the text is written in, such as en-US."),
        name: nonEmptyString("Challenge name shown to players in this locale."),
        description: nonEmptyString("Challenge description shown to players in this locale."),
      },
      { required: ["gameCenterChallengeVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeLocalization: gameCenterChallengeLocalizationResource },
      "The created Game Center challenge localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_challenge_localization",
    operationType: "read",
    description: "Read one Game Center challenge localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge localization.",
        ),
      },
      ["gameCenterChallengeLocalizationId"],
      "Identifies the Game Center challenge localization to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeLocalization: gameCenterChallengeLocalizationResource },
      "The requested Game Center challenge localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_challenge_localization",
    operationType: "destructive",
    description:
      "Replace the name or the description of a Game Center challenge localization, or clear one of them with null. Overwrites the given fields; pass at least one. The locale cannot be changed, so replace the localization to move the text to another locale.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center challenge localization fields to change.",
      {
        gameCenterChallengeLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge localization.",
        ),
        name: clearableString("New challenge name shown to players in this locale, or null to clear it."),
        description: clearableString("New challenge description shown to players in this locale, or null to clear it."),
      },
      { required: ["gameCenterChallengeLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeLocalization: gameCenterChallengeLocalizationResource },
      "The updated Game Center challenge localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_challenge_localization",
    operationType: "destructive",
    description: "Remove one locale from a Game Center challenge version, including the image attached to it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge localization.",
        ),
      },
      ["gameCenterChallengeLocalizationId"],
      "Identifies the Game Center challenge localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted localization."),
      "Confirmation that the Game Center challenge localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_challenge_localization_image",
    operationType: "read",
    description:
      "Read the image of one Game Center challenge localization, or null when the locale has no image of its own and falls back to the default image of the version. Uploading an image is not covered by this connector.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterChallengeLocalizationId: nonEmptyString(
          "App Store Connect identifier of the Game Center challenge localization.",
        ),
      },
      ["gameCenterChallengeLocalizationId"],
      "Identifies the Game Center challenge localization whose image to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterChallengeImage: s.nullable(gameCenterChallengeImageResource) },
      "The image of the challenge localization, or null when the locale has no image of its own.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_game_center_matchmaking_queues",
    operationType: "read",
    description:
      "List every Game Center matchmaking queue of the team, each with the rule set it matches requests with and the rule set of a running experiment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for browsing Game Center matchmaking queues.",
      { ...paginationInputs },
      { required: [] },
    ),
    outputSchema: pageOutput(
      "gameCenterMatchmakingQueues",
      gameCenterMatchmakingQueueResource,
      "Matchmaking queues returned for this page.",
      "A page of Game Center matchmaking queues.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_matchmaking_queue",
    operationType: "write",
    description:
      "Create a Game Center matchmaking queue and attach the rule set its requests are matched with. Optionally attach a second rule set to experiment with, and list the bundle identifiers whose classic matchmaking requests should reach this queue.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking queue to create.",
      {
        referenceName: nonEmptyString("Internal queue name shown in App Store Connect."),
        classicMatchmakingBundleIds: s.stringArray(
          "Bundle identifiers whose classic matchmaking requests use this queue.",
          { minItems: 1, itemDescription: "A bundle identifier." },
        ),
        gameCenterMatchmakingRuleSetId: nonEmptyString(
          "App Store Connect identifier of the rule set the queue matches requests with.",
        ),
        experimentRuleSetId: nonEmptyString(
          "App Store Connect identifier of a second rule set matched against a share of the queue traffic while an experiment runs.",
        ),
      },
      { required: ["referenceName", "gameCenterMatchmakingRuleSetId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingQueue: gameCenterMatchmakingQueueResource },
      "The created matchmaking queue. Its ruleSetId and experimentRuleSetId are null unless App Store Connect returned the linkage; read the queue back with get_game_center_matchmaking_queue to see them.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_queue",
    operationType: "read",
    description:
      "Read one Game Center matchmaking queue by its App Store Connect identifier, including the rule set it matches requests with and the rule set of a running experiment.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
      },
      ["gameCenterMatchmakingQueueId"],
      "Identifies the matchmaking queue to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingQueue: gameCenterMatchmakingQueueResource },
      "The requested matchmaking queue.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_matchmaking_queue",
    operationType: "destructive",
    description:
      "Point a Game Center matchmaking queue at another rule set, change the rule set its experiment runs with, or replace the classic matchmaking bundle identifiers. Overwrites the given fields; pass at least one. The queue name cannot be changed after creation.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking queue fields to change.",
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
        classicMatchmakingBundleIds: nullableStringArray(
          "New bundle identifiers whose classic matchmaking requests use this queue, or null to clear them.",
          "A bundle identifier.",
        ),
        gameCenterMatchmakingRuleSetId: nonEmptyString(
          "App Store Connect identifier of the rule set the queue matches requests with from now on.",
        ),
        experimentRuleSetId: nonEmptyString(
          "App Store Connect identifier of the rule set the experiment runs with from now on.",
        ),
      },
      { required: ["gameCenterMatchmakingQueueId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingQueue: gameCenterMatchmakingQueueResource },
      "The updated matchmaking queue. Its ruleSetId and experimentRuleSetId are null unless App Store Connect returned the linkage; read the queue back with get_game_center_matchmaking_queue to see them.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_matchmaking_queue",
    operationType: "destructive",
    description:
      "Delete a Game Center matchmaking queue. Requests the game sends to the deleted queue are no longer matched.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
      },
      ["gameCenterMatchmakingQueueId"],
      "Identifies the matchmaking queue to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted matchmaking queue."),
      "Confirmation that the matchmaking queue was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_matchmaking_rule_sets",
    operationType: "read",
    description:
      "List every Game Center matchmaking rule set of the team, with the player limits and the rule language version each one uses.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for browsing Game Center matchmaking rule sets.",
      { ...paginationInputs },
      { required: [] },
    ),
    outputSchema: pageOutput(
      "gameCenterMatchmakingRuleSets",
      gameCenterMatchmakingRuleSetResource,
      "Matchmaking rule sets returned for this page.",
      "A page of Game Center matchmaking rule sets.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_matchmaking_rule_set",
    operationType: "write",
    description:
      "Create a Game Center matchmaking rule set with the player limits a match must stay within. Add its teams and rules afterwards with create_game_center_matchmaking_team and create_game_center_matchmaking_rule, then attach the rule set to a queue.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking rule set to create.",
      {
        referenceName: nonEmptyString("Internal rule set name shown in App Store Connect."),
        ruleLanguageVersion: s.integer(
          "Version of the rule expression language the rules of this rule set are written in.",
        ),
        minPlayers: s.integer("Fewest players a match created from this rule set may have."),
        maxPlayers: s.integer("Most players a match created from this rule set may have."),
      },
      { required: ["referenceName", "ruleLanguageVersion", "minPlayers", "maxPlayers"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingRuleSet: gameCenterMatchmakingRuleSetResource },
      "The created matchmaking rule set.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_rule_set",
    operationType: "read",
    description: "Read one Game Center matchmaking rule set by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString("App Store Connect identifier of the matchmaking rule set."),
      },
      ["gameCenterMatchmakingRuleSetId"],
      "Identifies the matchmaking rule set to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingRuleSet: gameCenterMatchmakingRuleSetResource },
      "The requested matchmaking rule set.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_matchmaking_rule_set",
    operationType: "destructive",
    description:
      "Change the player limits of a Game Center matchmaking rule set, or clear a limit with null. Overwrites the given fields; pass at least one. The rule set name and its rule language version cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking rule set fields to change.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString("App Store Connect identifier of the matchmaking rule set."),
        minPlayers: s.nullable(
          s.integer("Fewest players a match created from this rule set may have, or null to clear the limit."),
        ),
        maxPlayers: s.nullable(
          s.integer("Most players a match created from this rule set may have, or null to clear the limit."),
        ),
      },
      { required: ["gameCenterMatchmakingRuleSetId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingRuleSet: gameCenterMatchmakingRuleSetResource },
      "The updated matchmaking rule set.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_matchmaking_rule_set",
    operationType: "destructive",
    description:
      "Delete a Game Center matchmaking rule set together with its teams and rules. A queue that still points at the rule set stops matching requests.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString("App Store Connect identifier of the matchmaking rule set."),
      },
      ["gameCenterMatchmakingRuleSetId"],
      "Identifies the matchmaking rule set to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted matchmaking rule set."),
      "Confirmation that the matchmaking rule set was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_matchmaking_rule_set_queues",
    operationType: "read",
    description:
      "List the matchmaking queues that match their requests with one rule set, either as their rule set or as their experiment rule set.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the rule set whose matchmaking queues to list.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString("App Store Connect identifier of the matchmaking rule set."),
        ...paginationInputs,
      },
      { required: ["gameCenterMatchmakingRuleSetId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterMatchmakingQueues",
      gameCenterMatchmakingQueueResource,
      "Matchmaking queues returned for this page.",
      "A page of Game Center matchmaking queues.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_matchmaking_rule_set_rules",
    operationType: "read",
    description:
      "List the rules of one Game Center matchmaking rule set, with the expression each rule evaluates for a candidate match.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the rule set whose rules to list.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString("App Store Connect identifier of the matchmaking rule set."),
        ...paginationInputs,
      },
      { required: ["gameCenterMatchmakingRuleSetId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterMatchmakingRules",
      gameCenterMatchmakingRuleResource,
      "Matchmaking rules returned for this page.",
      "A page of Game Center matchmaking rules.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_matchmaking_rule_set_teams",
    operationType: "read",
    description: "List the teams of one Game Center matchmaking rule set, with the player limits of each team.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the rule set whose teams to list.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString("App Store Connect identifier of the matchmaking rule set."),
        ...paginationInputs,
      },
      { required: ["gameCenterMatchmakingRuleSetId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterMatchmakingTeams",
      gameCenterMatchmakingTeamResource,
      "Matchmaking teams returned for this page.",
      "A page of Game Center matchmaking teams.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_matchmaking_rule",
    operationType: "write",
    description:
      "Add a rule to a Game Center matchmaking rule set. The expression is evaluated for every candidate match: a COMPATIBLE, DISTANCE or TEAM rule decides whether the candidate is acceptable, and a MATCH rule scores it. Try the rule set with test_game_center_matchmaking_rule_set before attaching it to a queue.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking rule to create.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString(
          "App Store Connect identifier of the matchmaking rule set the rule belongs to.",
        ),
        referenceName: nonEmptyString("Internal rule name shown in App Store Connect."),
        description: nonEmptyString("What the rule checks, for the team reading the rule set."),
        type: s.stringEnum("How the rule result is used.", gameCenterMatchmakingRuleTypes),
        expression: nonEmptyString("Rule expression evaluated for every candidate match."),
        weight: s.number(
          "How much the rule counts against the other rules of the same type when Game Center scores a candidate match.",
        ),
      },
      {
        required: ["gameCenterMatchmakingRuleSetId", "referenceName", "description", "type", "expression"],
      },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingRule: gameCenterMatchmakingRuleResource },
      "The created matchmaking rule.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_matchmaking_rule",
    operationType: "destructive",
    description:
      "Change the expression, the description or the weight of a Game Center matchmaking rule, or clear one of them with null. Overwrites the given fields; pass at least one. The rule name and its type cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking rule fields to change.",
      {
        gameCenterMatchmakingRuleId: nonEmptyString("App Store Connect identifier of the matchmaking rule."),
        description: clearableString("New description of what the rule checks, or null to clear it."),
        expression: clearableString("New rule expression evaluated for every candidate match, or null to clear it."),
        weight: s.nullable(
          s.number("New weight of the rule against the other rules of the same type, or null to clear it."),
        ),
      },
      { required: ["gameCenterMatchmakingRuleId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingRule: gameCenterMatchmakingRuleResource },
      "The updated matchmaking rule.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_matchmaking_rule",
    operationType: "destructive",
    description:
      "Delete a rule from its Game Center matchmaking rule set. Candidate matches are no longer checked against it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterMatchmakingRuleId: nonEmptyString("App Store Connect identifier of the matchmaking rule."),
      },
      ["gameCenterMatchmakingRuleId"],
      "Identifies the matchmaking rule to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted matchmaking rule."),
      "Confirmation that the matchmaking rule was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_matchmaking_team",
    operationType: "write",
    description:
      "Add a team to a Game Center matchmaking rule set. Rule expressions refer to the team by its name, and Game Center fills the team with between minPlayers and maxPlayers players.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking team to create.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString(
          "App Store Connect identifier of the matchmaking rule set the team belongs to.",
        ),
        referenceName: nonEmptyString("Internal team name the rule expressions refer to."),
        minPlayers: s.integer("Fewest players the team needs."),
        maxPlayers: s.integer("Most players the team accepts."),
      },
      { required: ["gameCenterMatchmakingRuleSetId", "referenceName", "minPlayers", "maxPlayers"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingTeam: gameCenterMatchmakingTeamResource },
      "The created matchmaking team.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_matchmaking_team",
    operationType: "destructive",
    description:
      "Change the player limits of a Game Center matchmaking team, or clear a limit with null. Overwrites the given fields; pass at least one. The team name cannot be changed, because rule expressions refer to it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The matchmaking team fields to change.",
      {
        gameCenterMatchmakingTeamId: nonEmptyString("App Store Connect identifier of the matchmaking team."),
        minPlayers: s.nullable(s.integer("Fewest players the team needs, or null to clear the limit.")),
        maxPlayers: s.nullable(s.integer("Most players the team accepts, or null to clear the limit.")),
      },
      { required: ["gameCenterMatchmakingTeamId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingTeam: gameCenterMatchmakingTeamResource },
      "The updated matchmaking team.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_matchmaking_team",
    operationType: "destructive",
    description:
      "Delete a team from its Game Center matchmaking rule set. Rule expressions that still refer to the team by name stop working.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterMatchmakingTeamId: nonEmptyString("App Store Connect identifier of the matchmaking team."),
      },
      ["gameCenterMatchmakingTeamId"],
      "Identifies the matchmaking team to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted matchmaking team."),
      "Confirmation that the matchmaking team was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "test_game_center_matchmaking_rule_set",
    operationType: "write",
    description:
      "Run a Game Center matchmaking rule set against a set of simulated requests and return the matches it would have formed, with the team each simulated player was assigned to. Nothing is stored and no real player is matched, so this is safe to run against a rule set that is already attached to a queue.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The rule set to try and the simulated matchmaking requests to run against it.",
      {
        gameCenterMatchmakingRuleSetId: nonEmptyString(
          "App Store Connect identifier of the matchmaking rule set to test.",
        ),
        requests: s.array(
          "Simulated matchmaking requests matched against the rule set.",
          s.object(
            "One simulated matchmaking request.",
            {
              requestName: nonEmptyString("Name this request is referred to by in the returned matches."),
              secondsInQueue: s.integer("How long the request has already waited in the queue, in seconds."),
              locale: s.stringEnum("Locale of the player who sent the request.", gameCenterMatchmakingTestLocales),
              location: s.object(
                "Where the player who sent the request is located, for a DISTANCE rule.",
                {
                  latitude: s.number("Latitude of the player, in degrees."),
                  longitude: s.number("Longitude of the player, in degrees."),
                },
                { required: ["latitude", "longitude"] },
              ),
              minPlayers: s.integer("Fewest players the request accepts in its match."),
              maxPlayers: s.integer("Most players the request accepts in its match."),
              playerCount: s.integer("Number of players the request brings into the match."),
              bundleId: nonEmptyString("Bundle identifier of the app that sent the request."),
              platform: s.stringEnum("Platform the request was sent from.", contentPlatforms),
              appVersion: nonEmptyString("App version the request was sent from."),
              playerProperties: s.array(
                "Properties the rule expressions read for the players of this request.",
                s.object(
                  "The properties of one simulated player.",
                  {
                    playerId: nonEmptyString("Identifier used for the simulated player."),
                    properties: s.array(
                      "Key-value properties a rule expression reads for this player.",
                      s.object(
                        "One player property.",
                        {
                          key: nonEmptyString("Property name a rule expression refers to."),
                          value: nonEmptyString("Property value for this player."),
                        },
                        { required: ["key", "value"] },
                      ),
                      { minItems: 1 },
                    ),
                  },
                  { required: ["playerId", "properties"] },
                ),
                { minItems: 1 },
              ),
            },
            { required: [] },
          ),
          { minItems: 1 },
        ),
      },
      { required: ["gameCenterMatchmakingRuleSetId", "requests"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterMatchmakingRuleSetTest: gameCenterMatchmakingRuleSetTestResource },
      "The matches the rule set would have formed from the simulated requests.",
    ),
  }),

  defineProviderAction(service, {
    name: "get_game_center_classic_matchmaking_request_metrics",
    operationType: "read",
    description:
      "Read the matchmaking requests an app made through classic (non rule based) matchmaking, as time series of request counts and queue wait times. Each data point covers the granularity you pass.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading classic matchmaking request metrics.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail of the app."),
        groupBy: metricGroupByInput(
          "Split the returned series by these dimensions, such as the request result.",
          matchmakingRequestGroupBys,
        ),
        result: s.stringEnum(
          "Return only series for matchmaking requests that ended with this result.",
          gameCenterMatchmakingRequestResults,
        ),
        ...metricInputs,
      },
      { required: ["gameCenterDetailId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingRequestMetricSeries,
      "Metric series returned for this page.",
      "A page of classic matchmaking request metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_rule_based_matchmaking_request_metrics",
    operationType: "read",
    description:
      "Read the matchmaking requests an app made through rule based matchmaking, as time series of request counts and queue wait times.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading rule based matchmaking request metrics.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail of the app."),
        groupBy: metricGroupByInput(
          "Split the returned series by these dimensions, such as the request result.",
          matchmakingRequestGroupBys,
        ),
        result: s.stringEnum(
          "Return only series for matchmaking requests that ended with this result.",
          gameCenterMatchmakingRequestResults,
        ),
        ...metricInputs,
      },
      { required: ["gameCenterDetailId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingRequestMetricSeries,
      "Metric series returned for this page.",
      "A page of rule based matchmaking request metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_queue_request_metrics",
    operationType: "read",
    description:
      "Read the matchmaking requests one queue handled, as time series of request counts and queue wait times, optionally split by result or by the app that sent the requests.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the request metrics of one matchmaking queue.",
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
        groupBy: metricGroupByInput(
          "Split the returned series by these dimensions, such as the request result or the app that sent the request.",
          matchmakingQueueRequestGroupBys,
        ),
        result: s.stringEnum(
          "Return only series for matchmaking requests that ended with this result.",
          gameCenterMatchmakingRequestResults,
        ),
        gameCenterDetailId: nonEmptyString("Return only series for the app with this Game Center detail identifier."),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingQueueId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingRequestMetricSeries,
      "Metric series returned for this page.",
      "A page of matchmaking queue request metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_queue_size_metrics",
    operationType: "read",
    description:
      "Read how many requests were waiting in one matchmaking queue, as time series of average and percentile queue sizes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the queue size metrics of one matchmaking queue.",
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingQueueId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingQueueSizeMetricSeries,
      "Metric series returned for this page.",
      "A page of matchmaking queue size metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_queue_session_metrics",
    operationType: "read",
    description:
      "Read the matchmaking sessions one queue produced, as time series of session counts and of how many players each session held.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the session metrics of one matchmaking queue.",
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingQueueId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingSessionMetricSeries,
      "Metric series returned for this page.",
      "A page of matchmaking session metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_queue_experiment_request_metrics",
    operationType: "read",
    description:
      "Read the share of a queue's traffic that was matched with the experiment rule set, as time series of request counts and queue wait times. Compare it with get_game_center_matchmaking_queue_request_metrics to judge whether the experiment rule set is an improvement.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the experiment request metrics of one matchmaking queue.",
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
        groupBy: metricGroupByInput(
          "Split the returned series by these dimensions, such as the request result or the app that sent the request.",
          matchmakingQueueRequestGroupBys,
        ),
        result: s.stringEnum(
          "Return only series for matchmaking requests that ended with this result.",
          gameCenterMatchmakingRequestResults,
        ),
        gameCenterDetailId: nonEmptyString("Return only series for the app with this Game Center detail identifier."),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingQueueId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingRequestMetricSeries,
      "Metric series returned for this page.",
      "A page of experiment matchmaking request metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_queue_experiment_size_metrics",
    operationType: "read",
    description:
      "Read how many requests were waiting in the part of a matchmaking queue served by the experiment rule set, as time series of average and percentile queue sizes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the experiment queue size metrics of one matchmaking queue.",
      {
        gameCenterMatchmakingQueueId: nonEmptyString("App Store Connect identifier of the matchmaking queue."),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingQueueId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingQueueSizeMetricSeries,
      "Metric series returned for this page.",
      "A page of experiment matchmaking queue size metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_rule_boolean_result_metrics",
    operationType: "read",
    description:
      "Read how often one matchmaking rule returned each boolean result, as time series of evaluation counts.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the boolean result metrics of one matchmaking rule.",
      {
        gameCenterMatchmakingRuleId: nonEmptyString("App Store Connect identifier of the matchmaking rule."),
        groupBy: metricGroupByInput(
          "Split the returned series by these dimensions, such as the rule result or the queue that evaluated the rule.",
          matchmakingBooleanRuleResultGroupBys,
        ),
        result: nonEmptyString("Return only series for this rule result value, as App Store Connect reports it."),
        gameCenterMatchmakingQueueId: nonEmptyString(
          "Return only series for the matchmaking queue with this identifier.",
        ),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingRuleId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingCountMetricSeries,
      "Metric series returned for this page.",
      "A page of boolean matchmaking rule result metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_rule_number_result_metrics",
    operationType: "read",
    description:
      "Read the values one matchmaking rule expression returned, as time series of evaluation counts with average and percentile results.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the numeric result metrics of one matchmaking rule.",
      {
        gameCenterMatchmakingRuleId: nonEmptyString("App Store Connect identifier of the matchmaking rule."),
        groupBy: metricGroupByInput(
          "Split the returned series by the queue that evaluated the rule.",
          matchmakingRuleGroupBys,
        ),
        gameCenterMatchmakingQueueId: nonEmptyString(
          "Return only series for the matchmaking queue with this identifier.",
        ),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingRuleId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingNumberRuleResultMetricSeries,
      "Metric series returned for this page.",
      "A page of numeric matchmaking rule result metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_matchmaking_rule_error_metrics",
    operationType: "read",
    description: "Read how often one matchmaking rule failed to evaluate, as time series of error counts.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for reading the error metrics of one matchmaking rule.",
      {
        gameCenterMatchmakingRuleId: nonEmptyString("App Store Connect identifier of the matchmaking rule."),
        groupBy: metricGroupByInput(
          "Split the returned series by the queue that evaluated the rule.",
          matchmakingRuleGroupBys,
        ),
        gameCenterMatchmakingQueueId: nonEmptyString(
          "Return only series for the matchmaking queue with this identifier.",
        ),
        ...metricInputs,
      },
      { required: ["gameCenterMatchmakingRuleId", "granularity"] },
    ),
    outputSchema: pageOutput(
      "metrics",
      gameCenterMatchmakingCountMetricSeries,
      "Metric series returned for this page.",
      "A page of matchmaking rule error metrics.",
    ),
  }),
];
