import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appStoreVersionResource,
  clearableString,
  configureGameCenterRoles,
  deletedOutput,
  gameCenterImageResource,
  gameCenterVersionFields,
  manageGameCenterPlayersRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
} from "./schemas.ts";

export const gameCenterLeaderboardFormatters: readonly string[] = [
  "INTEGER",
  "DECIMAL_POINT_1_PLACE",
  "DECIMAL_POINT_2_PLACE",
  "DECIMAL_POINT_3_PLACE",
  "ELAPSED_TIME_CENTISECOND",
  "ELAPSED_TIME_MINUTE",
  "ELAPSED_TIME_SECOND",
  "MONEY_POUND_DECIMAL",
  "MONEY_POUND",
  "MONEY_DOLLAR_DECIMAL",
  "MONEY_DOLLAR",
  "MONEY_EURO_DECIMAL",
  "MONEY_EURO",
  "MONEY_FRANC_DECIMAL",
  "MONEY_FRANC",
  "MONEY_KRONER_DECIMAL",
  "MONEY_KRONER",
  "MONEY_YEN",
];
export const gameCenterLeaderboardSubmissionTypes: readonly string[] = ["BEST_SCORE", "MOST_RECENT_SCORE"];
export const gameCenterLeaderboardScoreSortTypes: readonly string[] = ["ASC", "DESC"];
export const gameCenterLeaderboardVisibilities: readonly string[] = ["SHOW_FOR_ALL", "HIDE_FOR_ALL"];

const identifierListInput = (description: string) =>
  s.stringArray(description, { minItems: 1, itemDescription: "An App Store Connect identifier." });
const identifierListOutput = (description: string) =>
  s.stringArray(description, { itemDescription: "An App Store Connect identifier." });

const freeFormProperties = (description: string) => s.looseObject(description, {});
const clearableFreeFormProperties = (description: string) => s.nullable(s.looseObject(description, {}));

export const gameCenterDetailResource: JsonSchema = resourceObject(
  "The Game Center configuration of one app. It owns the app's achievements, leaderboards, leaderboard sets, activities and challenges, and links the app to a Game Center group when it shares them with other apps.",
  "App Store Connect identifier for the Game Center detail.",
  {
    arcadeEnabled: s.nullableBoolean("Whether the app is distributed through Apple Arcade."),
    gameCenterGroupId: s.nullableString(
      "Game Center group the app belongs to, or null when the app is not grouped or App Store Connect did not return the relationship.",
    ),
    defaultLeaderboardId: s.nullableString(
      "Leaderboard shown by default in the Game Center dashboard, or null when there is none.",
    ),
    defaultGroupLeaderboardId: s.nullableString(
      "Group leaderboard shown by default when the app belongs to a group, or null when there is none.",
    ),
  },
  ["gameCenterGroupId", "defaultLeaderboardId", "defaultGroupLeaderboardId"],
);

export const gameCenterGroupResource: JsonSchema = resourceObject(
  "A Game Center group. Apps in a group share achievements, leaderboards and leaderboard sets.",
  "App Store Connect identifier for the Game Center group.",
  {
    referenceName: s.nullableString("Internal group name shown in App Store Connect."),
  },
);

export const gameCenterAppVersionResource: JsonSchema = resourceObject(
  "The Game Center enablement of one App Store version, plus the earlier versions it stays multiplayer compatible with.",
  "App Store Connect identifier for the Game Center app version.",
  {
    enabled: s.nullableBoolean("Whether Game Center is enabled for this App Store version."),
  },
);

export const gameCenterAchievementResource: JsonSchema = resourceObject(
  "A Game Center achievement.",
  "App Store Connect identifier for the achievement.",
  {
    referenceName: s.nullableString("Internal achievement name shown in App Store Connect."),
    vendorIdentifier: s.nullableString(
      "Achievement identifier the game reports scores against, unique within the app or group.",
    ),
    points: s.nullableInteger("Points the achievement is worth, from 0 to 100."),
    showBeforeEarned: s.nullableBoolean("Whether players can see the achievement before they earn it."),
    repeatable: s.nullableBoolean("Whether players can earn the achievement more than once."),
    archived: s.nullableBoolean("Whether the achievement is archived and no longer offered to players."),
    activityProperties: s.nullable(
      s.looseObject("Key-value properties the achievement contributes to a game activity.", {}),
    ),
  },
);

export const gameCenterAchievementVersionResource: JsonSchema = resourceObject(
  "One version of a Game Center achievement. A new version carries the localizations through App Review.",
  "App Store Connect identifier for the achievement version.",
  { ...gameCenterVersionFields },
);

export const gameCenterAchievementLocalizationResource: JsonSchema = resourceObject(
  "The achievement text in one locale.",
  "App Store Connect identifier for the achievement localization.",
  {
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    name: s.nullableString("Achievement name shown to players in this locale."),
    beforeEarnedDescription: s.nullableString("Description shown before the player earns the achievement."),
    afterEarnedDescription: s.nullableString("Description shown after the player earns the achievement."),
  },
);

export const gameCenterLeaderboardResource: JsonSchema = resourceObject(
  "A Game Center leaderboard.",
  "App Store Connect identifier for the leaderboard.",
  {
    referenceName: s.nullableString("Internal leaderboard name shown in App Store Connect."),
    vendorIdentifier: s.nullableString(
      "Leaderboard identifier the game submits scores against, unique within the app or group.",
    ),
    defaultFormatter: nullableEnum(
      "How scores are formatted unless a localization overrides it.",
      gameCenterLeaderboardFormatters,
    ),
    submissionType: nullableEnum("Which submitted score is kept for a player.", gameCenterLeaderboardSubmissionTypes),
    scoreSortType: nullableEnum("Whether a higher or a lower score ranks first.", gameCenterLeaderboardScoreSortTypes),
    scoreRangeStart: s.nullableString("Lowest accepted score, as a decimal string."),
    scoreRangeEnd: s.nullableString("Highest accepted score, as a decimal string."),
    recurrenceStartDate: s.nullableString(
      "When the first recurring run of the leaderboard starts, as an ISO 8601 timestamp.",
    ),
    recurrenceDuration: s.nullableString("How long each recurring run lasts, as an ISO 8601 duration such as P1D."),
    recurrenceRule: s.nullableString("ICS recurrence rule that schedules the recurring runs."),
    archived: s.nullableBoolean("Whether the leaderboard is archived and no longer accepting scores."),
    activityProperties: s.nullable(
      s.looseObject("Key-value properties the leaderboard contributes to a game activity.", {}),
    ),
    visibility: nullableEnum("Whether the leaderboard is shown to players.", gameCenterLeaderboardVisibilities),
  },
);

export const gameCenterLeaderboardVersionResource: JsonSchema = resourceObject(
  "One version of a Game Center leaderboard.",
  "App Store Connect identifier for the leaderboard version.",
  { ...gameCenterVersionFields },
);

export const gameCenterLeaderboardLocalizationResource: JsonSchema = resourceObject(
  "The leaderboard text and score formatting in one locale.",
  "App Store Connect identifier for the leaderboard localization.",
  {
    locale: s.nullableString("Locale the text is written in, such as en-US."),
    name: s.nullableString("Leaderboard name shown to players in this locale."),
    formatterOverride: nullableEnum(
      "Score formatter used in this locale instead of the leaderboard default.",
      gameCenterLeaderboardFormatters,
    ),
    formatterSuffix: s.nullableString("Suffix appended to plural score values, such as points."),
    formatterSuffixSingular: s.nullableString("Suffix appended to a score value of one, such as point."),
    description: s.nullableString("Score description shown to players in this locale."),
  },
);

export const gameCenterLeaderboardSetResource: JsonSchema = resourceObject(
  "A Game Center leaderboard set that groups related leaderboards under one entry in the Game Center dashboard.",
  "App Store Connect identifier for the leaderboard set.",
  {
    referenceName: s.nullableString("Internal set name shown in App Store Connect."),
    vendorIdentifier: s.nullableString("Set identifier the game refers to, unique within the app or group."),
  },
);

export const gameCenterLeaderboardSetVersionResource: JsonSchema = resourceObject(
  "One version of a Game Center leaderboard set.",
  "App Store Connect identifier for the leaderboard set version.",
  { ...gameCenterVersionFields },
);

export const gameCenterLeaderboardSetLocalizationResource: JsonSchema = resourceObject(
  "The leaderboard set name in one locale.",
  "App Store Connect identifier for the leaderboard set localization.",
  {
    locale: s.nullableString("Locale the name is written in, such as en-US."),
    name: s.nullableString("Set name shown to players in this locale."),
  },
);

export const gameCenterLeaderboardSetMemberLocalizationResource: JsonSchema = resourceObject(
  "The name one leaderboard is shown under inside one leaderboard set, in one locale.",
  "App Store Connect identifier for the leaderboard set member localization.",
  {
    locale: s.nullableString("Locale the name is written in, such as en-US."),
    name: s.nullableString("Name the leaderboard is shown under inside the set."),
  },
);

export const gameCenterAchievementImageResource: JsonSchema = gameCenterImageResource(
  "The image shown with a Game Center achievement localization.",
  "App Store Connect identifier for the achievement image.",
);

export const gameCenterLeaderboardImageResource: JsonSchema = gameCenterImageResource(
  "The image shown with a Game Center leaderboard localization.",
  "App Store Connect identifier for the leaderboard image.",
);

export const gameCenterLeaderboardSetImageResource: JsonSchema = gameCenterImageResource(
  "The image shown with a Game Center leaderboard set localization.",
  "App Store Connect identifier for the leaderboard set image.",
);

export const gameCenterLeaderboardEntrySubmissionResource: JsonSchema = resourceObject(
  "A score submitted to a Game Center leaderboard on behalf of a player.",
  "App Store Connect identifier for the leaderboard entry submission.",
  {
    bundleId: s.nullableString("Bundle identifier of the game the score was earned in."),
    vendorIdentifier: s.nullableString("Leaderboard identifier the score was submitted to."),
    scopedPlayerId: s.nullableString("Scoped player identifier the score belongs to."),
    score: s.nullableString("Submitted score, as a decimal string."),
    context: s.nullableString("Game-defined context value stored with the score."),
    challengeIds: s.nullable(
      s.stringArray("Challenges the score counts towards.", {
        itemDescription: "A Game Center challenge identifier.",
      }),
    ),
    submittedDate: s.nullableString("When the score was earned, as an ISO 8601 timestamp."),
    preReleased: s.nullableBoolean(
      "Whether the score was earned in a prerelease build and kept out of the live leaderboard.",
    ),
  },
);

export const gameCenterPlayerAchievementSubmissionResource: JsonSchema = resourceObject(
  "Achievement progress submitted for a player.",
  "App Store Connect identifier for the player achievement submission.",
  {
    bundleId: s.nullableString("Bundle identifier of the game the progress was earned in."),
    vendorIdentifier: s.nullableString("Achievement identifier the progress was submitted for."),
    scopedPlayerId: s.nullableString("Scoped player identifier the progress belongs to."),
    percentageAchieved: s.nullableInteger("Progress towards the achievement, from 0 to 100."),
    challengeIds: s.nullable(
      s.stringArray("Challenges the progress counts towards.", {
        itemDescription: "A Game Center challenge identifier.",
      }),
    ),
    submittedDate: s.nullableString("When the progress was earned, as an ISO 8601 timestamp."),
    preReleased: s.nullableBoolean(
      "Whether the progress was earned in a prerelease build and kept out of the live achievement.",
    ),
  },
);

const playerSubmissionInputs = {
  bundleId: nonEmptyString("Bundle identifier of the game the result was earned in."),
  scopedPlayerId: nonEmptyString(
    "Scoped player identifier of the player the submission is made for, as GameKit reports it.",
  ),
  challengeIds: s.stringArray("Game Center challenges this submission also counts towards.", {
    minItems: 1,
    itemDescription: "A Game Center challenge identifier.",
  }),
  submittedDate: s.dateTime(
    "When the player earned the result, as an ISO 8601 timestamp. Defaults to the time App Store Connect receives the submission.",
  ),
  preReleased: s.boolean(
    "Set to true when the result was earned in a prerelease build, so it stays out of the live Game Center data.",
  ),
};

export const appStoreConnectGameCenterActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_app_game_center_detail",
    operationType: "read",
    description:
      "Read the Game Center configuration of one app, including the group it belongs to and the leaderboards shown by default. Returns null when the app has never been enabled for Game Center.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: nonEmptyString("App Store Connect identifier of the app.") },
      ["appId"],
      "Identifies the app whose Game Center detail is read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterDetail: s.nullable(gameCenterDetailResource) },
      "The Game Center detail of the app, or null when the app is not enabled for Game Center.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_detail",
    operationType: "write",
    description:
      "Enable Game Center for an app by creating its Game Center detail. The detail owns the achievements, leaderboards and leaderboard sets of the app, and an app has at most one of them.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      { appId: nonEmptyString("App Store Connect identifier of the app to enable.") },
      ["appId"],
      "Identifies the app to enable for Game Center.",
    ),
    outputSchema: s.actionOutput({ gameCenterDetail: gameCenterDetailResource }, "The created Game Center detail."),
  }),
  defineProviderAction(service, {
    name: "get_game_center_detail",
    operationType: "read",
    description:
      "Read one Game Center detail by its App Store Connect identifier, together with the group and the default leaderboards it links to.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
      },
      ["gameCenterDetailId"],
      "Identifies the Game Center detail to read.",
    ),
    outputSchema: s.actionOutput({ gameCenterDetail: gameCenterDetailResource }, "The requested Game Center detail."),
  }),
  defineProviderAction(service, {
    name: "update_game_center_detail",
    operationType: "destructive",
    description:
      "Move a Game Center detail into a group, or change the leaderboards shown by default in the Game Center dashboard. Overwrites the relationships you pass; pass at least one. App Store Connect does not echo the linked identifiers on this call, so read them back with get_game_center_detail.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center detail relationships to change.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        gameCenterGroupId: nonEmptyString(
          "Game Center group the app joins, so that it shares achievements and leaderboards with the other apps of the group.",
        ),
        defaultLeaderboardId: nonEmptyString("Leaderboard shown by default in the Game Center dashboard of the app."),
        defaultGroupLeaderboardId: nonEmptyString(
          "Leaderboard shown by default when the app is played as part of its Game Center group.",
        ),
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: s.actionOutput({ gameCenterDetail: gameCenterDetailResource }, "The updated Game Center detail."),
  }),
  defineProviderAction(service, {
    name: "get_game_center_detail_group",
    operationType: "read",
    description:
      "Read the Game Center group a Game Center detail belongs to. Returns null when the app does not share its achievements and leaderboards with other apps.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
      },
      ["gameCenterDetailId"],
      "Identifies the Game Center detail whose group is read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterGroup: s.nullable(gameCenterGroupResource) },
      "The Game Center group the app belongs to, or null when the app is not grouped.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_detail_achievements",
    operationType: "read",
    description:
      "List the achievements of one Game Center detail, optionally narrowed by reference name, archived state or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the achievements of a Game Center detail.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        referenceNames: s.stringArray("Return only achievements with these internal reference names.", {
          minItems: 1,
          itemDescription: "An achievement reference name.",
        }),
        archived: s.boolean(
          "Return only archived achievements when true, or only achievements still offered to players when false.",
        ),
        gameCenterAchievementIds: identifierListInput("Return only the achievements with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterAchievements",
      gameCenterAchievementResource,
      "Game Center achievements returned for this page.",
      "A page of Game Center achievements.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_detail_leaderboards",
    operationType: "read",
    description:
      "List the leaderboards of one Game Center detail, optionally narrowed by reference name, archived state or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the leaderboards of a Game Center detail.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        referenceNames: s.stringArray("Return only leaderboards with these internal reference names.", {
          minItems: 1,
          itemDescription: "A leaderboard reference name.",
        }),
        archived: s.boolean(
          "Return only archived leaderboards when true, or only leaderboards still accepting scores when false.",
        ),
        gameCenterLeaderboardIds: identifierListInput("Return only the leaderboards with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboards",
      gameCenterLeaderboardResource,
      "Game Center leaderboards returned for this page.",
      "A page of Game Center leaderboards.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_detail_leaderboard_sets",
    operationType: "read",
    description:
      "List the leaderboard sets of one Game Center detail, optionally narrowed by reference name or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the leaderboard sets of a Game Center detail.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),

        referenceNames: s.stringArray("Return only leaderboard sets with these internal reference names.", {
          minItems: 1,
          itemDescription: "A leaderboard set reference name.",
        }),
        gameCenterLeaderboardSetIds: identifierListInput("Return only the leaderboard sets with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardSets",
      gameCenterLeaderboardSetResource,
      "Game Center leaderboard sets returned for this page.",
      "A page of Game Center leaderboard sets.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_detail_app_versions",
    operationType: "read",
    description:
      "List the App Store versions of the app together with their Game Center enablement, optionally narrowed to the enabled or the disabled ones.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the Game Center app versions of a Game Center detail.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        enabled: s.boolean(
          "Return only versions with Game Center enabled when true, or only versions with Game Center disabled when false.",
        ),
        ...paginationInputs,
      },
      { required: ["gameCenterDetailId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterAppVersions",
      gameCenterAppVersionResource,
      "Game Center app versions returned for this page.",
      "A page of Game Center app versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_detail_achievements",
    operationType: "destructive",
    description:
      "Replace the achievements attached to a Game Center detail. The identifiers you pass become the complete set, so an achievement left out is detached from the app.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The achievements the Game Center detail holds after the change.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        gameCenterAchievementIds: identifierListInput("Achievements that make up the complete set after the change."),
      },
      { required: ["gameCenterDetailId", "gameCenterAchievementIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterDetailId: s.string("The Game Center detail whose achievements were replaced."),
        gameCenterAchievementIds: identifierListOutput(
          "Identifiers of the achievements now attached to the Game Center detail.",
        ),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the achievements of the Game Center detail were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_detail_leaderboards",
    operationType: "destructive",
    description:
      "Replace the leaderboards attached to a Game Center detail. The identifiers you pass become the complete set, so a leaderboard left out is detached from the app.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboards the Game Center detail holds after the change.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        gameCenterLeaderboardIds: identifierListInput("Leaderboards that make up the complete set after the change."),
      },
      { required: ["gameCenterDetailId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterDetailId: s.string("The Game Center detail whose leaderboards were replaced."),
        gameCenterLeaderboardIds: identifierListOutput(
          "Identifiers of the leaderboards now attached to the Game Center detail.",
        ),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards of the Game Center detail were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_detail_leaderboard_sets",
    operationType: "destructive",
    description:
      "Replace the leaderboard sets attached to a Game Center detail. The identifiers you pass become the complete set, so a leaderboard set left out is detached from the app.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboard sets the Game Center detail holds after the change.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        gameCenterLeaderboardSetIds: identifierListInput(
          "Leaderboard sets that make up the complete set after the change.",
        ),
      },
      { required: ["gameCenterDetailId", "gameCenterLeaderboardSetIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterDetailId: s.string("The Game Center detail whose leaderboard sets were replaced."),
        gameCenterLeaderboardSetIds: identifierListOutput(
          "Identifiers of the leaderboard sets now attached to the Game Center detail.",
        ),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboard sets of the Game Center detail were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_detail_challenges_minimum_platform_versions",
    operationType: "destructive",
    description:
      "Replace the earliest App Store versions, one per platform, that may take part in Game Center challenges. The identifiers you pass become the complete set, so a platform left out no longer has a minimum version.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The minimum App Store versions for challenges after the change.",
      {
        gameCenterDetailId: nonEmptyString("App Store Connect identifier of the Game Center detail."),
        appStoreVersionIds: identifierListInput(
          "Earliest App Store version on each platform that may take part in challenges.",
        ),
      },
      { required: ["gameCenterDetailId", "appStoreVersionIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterDetailId: s.string("The Game Center detail whose challenge minimum platform versions were replaced."),
        appStoreVersionIds: identifierListOutput(
          "Identifiers of the App Store versions that now set the challenge minimum on their platform.",
        ),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the challenge minimum platform versions were replaced.",
    ),
  }),

  defineProviderAction(service, {
    name: "list_game_center_groups",
    operationType: "read",
    description:
      "List the Game Center groups of the team. Apps in a group share their achievements, leaderboards and leaderboard sets, so players keep one progress across the apps.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing Game Center groups.",
      {
        gameCenterDetailIds: identifierListInput("Return only the groups these Game Center details belong to."),
        ...paginationInputs,
      },
      { required: [] },
    ),
    outputSchema: pageOutput(
      "gameCenterGroups",
      gameCenterGroupResource,
      "Game Center groups returned for this page.",
      "A page of Game Center groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_group",
    operationType: "write",
    description:
      "Create a Game Center group. The group starts empty: an app joins it through its Game Center detail, and the achievements, leaderboards and leaderboard sets it shares are set with the replace actions.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center group to create.",
      {
        referenceName: nonEmptyString("Internal group name shown in App Store Connect."),
      },
      { required: [] },
    ),
    outputSchema: s.actionOutput({ gameCenterGroup: gameCenterGroupResource }, "The created Game Center group."),
  }),
  defineProviderAction(service, {
    name: "get_game_center_group",
    operationType: "read",
    description: "Read one Game Center group by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
      },
      ["gameCenterGroupId"],
      "Identifies the Game Center group to read.",
    ),
    outputSchema: s.actionOutput({ gameCenterGroup: gameCenterGroupResource }, "The requested Game Center group."),
  }),
  defineProviderAction(service, {
    name: "update_game_center_group",
    operationType: "write",
    description:
      "Rename a Game Center group. Overwrites the reference name; pass null to clear it. The apps and the shared records of the group are not touched.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center group fields to change.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        referenceName: clearableString("New internal group name, or null to clear it."),
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: s.actionOutput({ gameCenterGroup: gameCenterGroupResource }, "The updated Game Center group."),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_group",
    operationType: "destructive",
    description:
      "Delete a Game Center group. The apps that were in the group keep their own Game Center records and stop sharing progress with each other.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
      },
      ["gameCenterGroupId"],
      "Identifies the Game Center group to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted Game Center group."),
      "Confirmation that the Game Center group was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_group_details",
    operationType: "read",
    description:
      "List the Game Center details of the apps that belong to one group, that is the apps sharing the achievements, leaderboards and leaderboard sets of the group.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the Game Center details of a group.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        appVersionsEnabled: s.boolean(
          "Return only details that have App Store versions with Game Center enabled when true, or with Game Center disabled when false.",
        ),
        ...paginationInputs,
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterDetails",
      gameCenterDetailResource,
      "Game Center details returned for this page.",
      "A page of Game Center details.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_group_achievements",
    operationType: "read",
    description:
      "List the achievements shared by one Game Center group, optionally narrowed by reference name, archived state or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the achievements of a Game Center group.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        referenceNames: s.stringArray("Return only achievements with these reference names.", {
          minItems: 1,
          itemDescription: "An internal achievement name shown in App Store Connect.",
        }),
        archived: s.boolean(
          "Return only archived achievements when true, or only achievements still offered to players when false.",
        ),
        gameCenterAchievementIds: identifierListInput("Return only the achievements with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterAchievements",
      gameCenterAchievementResource,
      "Achievements returned for this page.",
      "A page of Game Center achievements.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_group_leaderboards",
    operationType: "read",
    description:
      "List the leaderboards shared by one Game Center group, optionally narrowed by reference name, archived state or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the leaderboards of a Game Center group.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        referenceNames: s.stringArray("Return only leaderboards with these reference names.", {
          minItems: 1,
          itemDescription: "An internal leaderboard name shown in App Store Connect.",
        }),
        archived: s.boolean(
          "Return only archived leaderboards when true, or only leaderboards still accepting scores when false.",
        ),
        gameCenterLeaderboardIds: identifierListInput("Return only the leaderboards with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboards",
      gameCenterLeaderboardResource,
      "Leaderboards returned for this page.",
      "A page of Game Center leaderboards.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_group_leaderboard_sets",
    operationType: "read",
    description:
      "List the leaderboard sets shared by one Game Center group, optionally narrowed by reference name or identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the leaderboard sets of a Game Center group.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        referenceNames: s.stringArray("Return only leaderboard sets with these reference names.", {
          minItems: 1,
          itemDescription: "An internal leaderboard set name shown in App Store Connect.",
        }),
        gameCenterLeaderboardSetIds: identifierListInput("Return only the leaderboard sets with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterGroupId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardSets",
      gameCenterLeaderboardSetResource,
      "Leaderboard sets returned for this page.",
      "A page of Game Center leaderboard sets.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_group_achievements",
    operationType: "destructive",
    description:
      "Set which achievements one Game Center group shares. Pass the complete list: an achievement left out is no longer shared through the group.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The achievements the Game Center group shares from now on.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        gameCenterAchievementIds: identifierListInput("Identifiers of the achievements the group shares."),
      },
      { required: ["gameCenterGroupId", "gameCenterAchievementIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterGroupId: s.string("The Game Center group whose achievements were replaced."),
        gameCenterAchievementIds: identifierListOutput("Identifiers of the achievements the group shares now."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the achievements of the group were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_group_leaderboards",
    operationType: "destructive",
    description:
      "Set which leaderboards one Game Center group shares. Pass the complete list: a leaderboard left out is no longer shared through the group.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboards the Game Center group shares from now on.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        gameCenterLeaderboardIds: identifierListInput("Identifiers of the leaderboards the group shares."),
      },
      { required: ["gameCenterGroupId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterGroupId: s.string("The Game Center group whose leaderboards were replaced."),
        gameCenterLeaderboardIds: identifierListOutput("Identifiers of the leaderboards the group shares now."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards of the group were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_group_leaderboard_sets",
    operationType: "destructive",
    description:
      "Set which leaderboard sets one Game Center group shares. Pass the complete list: a leaderboard set left out is no longer shared through the group.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboard sets the Game Center group shares from now on.",
      {
        gameCenterGroupId: nonEmptyString("App Store Connect identifier of the Game Center group."),
        gameCenterLeaderboardSetIds: identifierListInput("Identifiers of the leaderboard sets the group shares."),
      },
      { required: ["gameCenterGroupId", "gameCenterLeaderboardSetIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterGroupId: s.string("The Game Center group whose leaderboard sets were replaced."),
        gameCenterLeaderboardSetIds: identifierListOutput("Identifiers of the leaderboard sets the group shares now."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboard sets of the group were replaced.",
    ),
  }),

  defineProviderAction(service, {
    name: "create_game_center_app_version",
    operationType: "write",
    description:
      "Turn Game Center on for one App Store version by creating its Game Center app version record. Everything Game Center knows about that release hangs off this record: use update_game_center_app_version to toggle it again, and add_compatibility_versions_to_game_center_app_version to keep earlier releases multiplayer compatible with it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionId: nonEmptyString(
          "App Store Connect identifier of the App Store version to enable Game Center for.",
        ),
      },
      ["appStoreVersionId"],
      "Identifies the App Store version to enable Game Center for.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAppVersion: gameCenterAppVersionResource },
      "The created Game Center app version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_app_version",
    operationType: "read",
    description: "Read one Game Center app version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterAppVersionId: nonEmptyString("App Store Connect identifier of the Game Center app version."),
      },
      ["gameCenterAppVersionId"],
      "Identifies the Game Center app version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAppVersion: gameCenterAppVersionResource },
      "The requested Game Center app version.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_app_version",
    operationType: "destructive",
    description:
      "Enable or disable Game Center for the App Store version this record belongs to. Disabling it hides Game Center from players on that release without deleting its achievements or leaderboards.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center app version fields to change.",
      {
        gameCenterAppVersionId: nonEmptyString("App Store Connect identifier of the Game Center app version."),
        enabled: s.boolean("Enable Game Center for this App Store version when true, or disable it when false."),
      },
      { required: ["gameCenterAppVersionId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterAppVersion: gameCenterAppVersionResource },
      "The updated Game Center app version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_app_version_app_store_version",
    operationType: "read",
    description:
      "Read the App Store version a Game Center app version belongs to, for example to learn its version string and review state.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterAppVersionId: nonEmptyString("App Store Connect identifier of the Game Center app version."),
      },
      ["gameCenterAppVersionId"],
      "Identifies the Game Center app version whose App Store version to read.",
    ),
    outputSchema: s.actionOutput(
      { appStoreVersion: appStoreVersionResource },
      "The App Store version the Game Center app version belongs to.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_app_version_compatibility_versions",
    operationType: "read",
    description:
      "List the earlier app versions that stay multiplayer compatible with this one, so players who have not updated yet can still be matched with players who have. Optionally narrowed to the compatible versions that have Game Center enabled.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the compatible app versions of one Game Center app version.",
      {
        gameCenterAppVersionId: nonEmptyString("App Store Connect identifier of the Game Center app version."),
        enabled: s.boolean(
          "Return only compatible versions that have Game Center enabled when true, or only the disabled ones when false.",
        ),
        ...paginationInputs,
      },
      { required: ["gameCenterAppVersionId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterAppVersions",
      gameCenterAppVersionResource,
      "Compatible Game Center app versions returned for this page.",
      "A page of compatible Game Center app versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_compatibility_versions_to_game_center_app_version",
    operationType: "write",
    description:
      "Mark earlier Game Center app versions as multiplayer compatible with this one. Adds to the versions already listed instead of replacing them.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The compatible app versions to add.",
      {
        gameCenterAppVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center app version to add compatibility to.",
        ),
        compatibilityVersionIds: identifierListInput(
          "App Store Connect identifiers of the Game Center app versions that stay multiplayer compatible with it.",
        ),
      },
      { required: ["gameCenterAppVersionId", "compatibilityVersionIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterAppVersionId: s.string("The Game Center app version the compatible versions were added to."),
        compatibilityVersionIds: identifierListOutput("Identifiers of the Game Center app versions that were added."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the compatible versions were added to the Game Center app version.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_compatibility_versions_from_game_center_app_version",
    operationType: "destructive",
    description:
      "Stop treating earlier Game Center app versions as multiplayer compatible with this one. Players still on a removed version can no longer be matched with players on this one.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The compatible app versions to remove.",
      {
        gameCenterAppVersionId: nonEmptyString(
          "App Store Connect identifier of the Game Center app version to remove compatibility from.",
        ),
        compatibilityVersionIds: identifierListInput(
          "App Store Connect identifiers of the Game Center app versions to stop treating as compatible.",
        ),
      },
      { required: ["gameCenterAppVersionId", "compatibilityVersionIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterAppVersionId: s.string("The Game Center app version the compatible versions were removed from."),
        compatibilityVersionIds: identifierListOutput("Identifiers of the Game Center app versions that were removed."),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the compatible versions were removed from the Game Center app version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_game_center_app_version",
    operationType: "read",
    description:
      "Read the Game Center app version of one App Store version. Returns null when Game Center was never enabled for that version.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the App Store version."),
      },
      ["appStoreVersionId"],
      "Identifies the App Store version whose Game Center app version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAppVersion: s.nullable(gameCenterAppVersionResource) },
      "The Game Center app version of the App Store version, or null when Game Center was never enabled for it.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_game_center_leaderboard_entry",
    operationType: "write",
    description:
      "Post a score to a Game Center leaderboard on behalf of a player. This is how a server-authoritative game reports scores its own backend computed instead of letting the game client submit them.",
    requiredScopes: [],
    providerPermissions: [...manageGameCenterPlayersRoles],
    inputSchema: s.object(
      "The score to post for a player.",
      {
        ...playerSubmissionInputs,
        vendorIdentifier: nonEmptyString(
          "Leaderboard identifier the score belongs to, as configured on the leaderboard.",
        ),
        score: nonEmptyString(
          "Score to post, as a decimal string such as 12500 or 1234.56. App Store Connect formats it according to the leaderboard formatter.",
        ),
        context: nonEmptyString(
          "Game-defined context value to store with the entry, as a decimal string. Games use it to attach extra data to a score.",
        ),
      },
      { required: ["bundleId", "vendorIdentifier", "scopedPlayerId", "score"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardEntry: gameCenterLeaderboardEntrySubmissionResource },
      "The leaderboard entry App Store Connect recorded for the player.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_game_center_player_achievement",
    operationType: "write",
    description:
      "Report a player's progress towards a Game Center achievement from a server instead of from the game client. Submitting 100 marks the achievement earned.",
    requiredScopes: [],
    providerPermissions: [...manageGameCenterPlayersRoles],
    inputSchema: s.object(
      "The achievement progress to report for a player.",
      {
        ...playerSubmissionInputs,
        vendorIdentifier: nonEmptyString(
          "Achievement identifier the progress belongs to, as configured on the achievement.",
        ),
        percentageAchieved: s.integer("Progress towards the achievement, from 0 to 100. Use 100 to mark it earned.", {
          minimum: 0,
          maximum: 100,
        }),
      },
      { required: ["bundleId", "vendorIdentifier", "scopedPlayerId", "percentageAchieved"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterPlayerAchievement: gameCenterPlayerAchievementSubmissionResource },
      "The achievement progress App Store Connect recorded for the player.",
    ),
  }),

  defineProviderAction(service, {
    name: "create_game_center_achievement",
    operationType: "write",
    description:
      "Create a Game Center achievement together with its first version. Pass gameCenterDetailId when the achievement belongs to a single app, or gameCenterGroupId when it is shared by every app of a Game Center group. The achievement has no player-facing text yet; read the first version with list_game_center_achievement_versions and add locales with create_game_center_achievement_localization.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center achievement to create.",
      {
        referenceName: nonEmptyString("Internal achievement name shown in App Store Connect."),
        vendorIdentifier: nonEmptyString(
          "Achievement identifier the game reports progress against, unique within the app or group. It cannot be changed later.",
        ),
        points: s.integer("Points the achievement is worth, from 0 to 100."),
        showBeforeEarned: s.boolean("Whether players can see the achievement before they earn it."),
        repeatable: s.boolean("Whether players can earn the achievement more than once."),
        activityProperties: freeFormProperties("Key-value properties the achievement contributes to a game activity."),
        gameCenterDetailId: nonEmptyString(
          "App Store Connect identifier of the Game Center detail that owns the achievement. Pass this or gameCenterGroupId, not both.",
        ),
        gameCenterGroupId: nonEmptyString(
          "App Store Connect identifier of the Game Center group that shares the achievement. Pass this or gameCenterDetailId, not both.",
        ),
      },
      {
        required: ["referenceName", "vendorIdentifier", "points", "showBeforeEarned", "repeatable"],
      },
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievement: gameCenterAchievementResource },
      "The created Game Center achievement.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_achievement",
    operationType: "read",
    description: "Read one Game Center achievement by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementId: nonEmptyString("App Store Connect identifier of the achievement."),
      },
      ["gameCenterAchievementId"],
      "Identifies the Game Center achievement to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievement: gameCenterAchievementResource },
      "The requested Game Center achievement.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_achievement",
    operationType: "destructive",
    description:
      "Change the configuration of a Game Center achievement, or archive it so it is no longer offered to players. Overwrites the given fields; pass at least one. The vendor identifier cannot be changed after the achievement was created.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center achievement fields to change.",
      {
        gameCenterAchievementId: nonEmptyString("App Store Connect identifier of the achievement."),
        referenceName: clearableString("New internal achievement name, or null to clear it."),
        points: s.nullable(s.integer("New points value, from 0 to 100, or null to clear it.")),
        showBeforeEarned: s.boolean("Whether players can see the achievement before they earn it."),
        repeatable: s.boolean("Whether players can earn the achievement more than once."),
        archived: s.boolean(
          "Archive the achievement when true so it is no longer offered to players, or unarchive it when false.",
        ),
        activityProperties: clearableFreeFormProperties(
          "New key-value properties the achievement contributes to a game activity, or null to clear them.",
        ),
      },
      { required: ["gameCenterAchievementId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievement: gameCenterAchievementResource },
      "The updated Game Center achievement.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_achievement",
    operationType: "destructive",
    description:
      "Delete a Game Center achievement together with all of its versions and localizations. Players lose the achievement and the progress recorded for it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementId: nonEmptyString("App Store Connect identifier of the achievement."),
      },
      ["gameCenterAchievementId"],
      "Identifies the Game Center achievement to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted achievement."),
      "Confirmation that the Game Center achievement was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_achievement_versions",
    operationType: "read",
    description:
      "List the versions of one Game Center achievement, each with the review and release state of the localizations it carries.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the achievement whose versions to browse.",
      {
        gameCenterAchievementId: nonEmptyString("App Store Connect identifier of the achievement."),
        ...paginationInputs,
      },
      { required: ["gameCenterAchievementId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterAchievementVersions",
      gameCenterAchievementVersionResource,
      "Game Center achievement versions returned for this page.",
      "A page of Game Center achievement versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_game_center_achievement_activity",
    operationType: "destructive",
    description:
      "Attach a Game Center achievement to a game activity, replacing the activity it was attached to before.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The achievement and the activity to attach it to.",
      {
        gameCenterAchievementId: nonEmptyString("App Store Connect identifier of the achievement."),
        gameCenterActivityId: nonEmptyString(
          "App Store Connect identifier of the game activity the achievement contributes to.",
        ),
      },
      { required: ["gameCenterAchievementId", "gameCenterActivityId"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterAchievementId: s.string("The achievement whose activity was changed."),
        gameCenterActivityId: s.string("The activity the achievement is now attached to."),
        updated: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the achievement was attached to the activity.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_achievement_version",
    operationType: "write",
    description:
      "Create a new version of a Game Center achievement. Editing the player-facing text of an achievement that is already live goes through a new version: add or change its localizations, and the version carries them through App Review.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementId: nonEmptyString("App Store Connect identifier of the achievement to version."),
      },
      ["gameCenterAchievementId"],
      "Identifies the achievement to create a new version of.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievementVersion: gameCenterAchievementVersionResource },
      "The created Game Center achievement version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_achievement_version",
    operationType: "read",
    description: "Read one Game Center achievement version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementVersionId: nonEmptyString("App Store Connect identifier of the achievement version."),
      },
      ["gameCenterAchievementVersionId"],
      "Identifies the Game Center achievement version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievementVersion: gameCenterAchievementVersionResource },
      "The requested Game Center achievement version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_achievement_version_localizations",
    operationType: "read",
    description:
      "List the localizations of one Game Center achievement version, one per locale the achievement is shown in.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the achievement version whose localizations to browse.",
      {
        gameCenterAchievementVersionId: nonEmptyString("App Store Connect identifier of the achievement version."),
        ...paginationInputs,
      },
      { required: ["gameCenterAchievementVersionId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterAchievementLocalizations",
      gameCenterAchievementLocalizationResource,
      "Game Center achievement localizations returned for this page.",
      "A page of Game Center achievement localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_achievement_localization",
    operationType: "write",
    description:
      "Add a locale to a Game Center achievement version with the name and the two descriptions players see before and after they earn the achievement. The achievement image for the locale is uploaded separately. App Store Connect rejects a locale the version already has.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center achievement localization to create.",
      {
        gameCenterAchievementVersionId: nonEmptyString(
          "App Store Connect identifier of the achievement version the locale is added to.",
        ),
        locale: nonEmptyString("Locale of the text, such as en-US."),
        name: nonEmptyString("Achievement name shown to players in this locale."),
        beforeEarnedDescription: nonEmptyString("Description shown before the player earns the achievement."),
        afterEarnedDescription: nonEmptyString("Description shown after the player earns the achievement."),
      },
      {
        required: [
          "gameCenterAchievementVersionId",
          "locale",
          "name",
          "beforeEarnedDescription",
          "afterEarnedDescription",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievementLocalization: gameCenterAchievementLocalizationResource },
      "The created Game Center achievement localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_achievement_localization",
    operationType: "read",
    description: "Read one Game Center achievement localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementLocalizationId: nonEmptyString(
          "App Store Connect identifier of the achievement localization.",
        ),
      },
      ["gameCenterAchievementLocalizationId"],
      "Identifies the Game Center achievement localization to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievementLocalization: gameCenterAchievementLocalizationResource },
      "The requested Game Center achievement localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_achievement_localization",
    operationType: "destructive",
    description:
      "Change the name or the descriptions of a Game Center achievement localization, or clear one of them with null. Overwrites the given fields; pass at least one. The locale cannot be changed; delete the localization and create it again instead.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center achievement localization fields to change.",
      {
        gameCenterAchievementLocalizationId: nonEmptyString(
          "App Store Connect identifier of the achievement localization.",
        ),
        name: clearableString("New achievement name shown to players in this locale, or null to clear it."),
        beforeEarnedDescription: clearableString(
          "New description shown before the player earns the achievement, or null to clear it.",
        ),
        afterEarnedDescription: clearableString(
          "New description shown after the player earns the achievement, or null to clear it.",
        ),
      },
      { required: ["gameCenterAchievementLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievementLocalization: gameCenterAchievementLocalizationResource },
      "The updated Game Center achievement localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_achievement_localization",
    operationType: "destructive",
    description:
      "Remove a locale from a Game Center achievement version, including the achievement image uploaded for it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementLocalizationId: nonEmptyString(
          "App Store Connect identifier of the achievement localization.",
        ),
      },
      ["gameCenterAchievementLocalizationId"],
      "Identifies the Game Center achievement localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted achievement localization."),
      "Confirmation that the Game Center achievement localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_achievement_localization_image",
    operationType: "read",
    description:
      "Read the achievement image uploaded for one Game Center achievement localization, including its delivery state, or null when no image has been uploaded. Uploading an image is not covered by this connector; only the already uploaded image can be read.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterAchievementLocalizationId: nonEmptyString(
          "App Store Connect identifier of the achievement localization.",
        ),
      },
      ["gameCenterAchievementLocalizationId"],
      "Identifies the Game Center achievement localization whose image to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterAchievementImage: s.nullable(gameCenterAchievementImageResource) },
      "The achievement image of the localization, or null when no image has been uploaded.",
    ),
  }),

  defineProviderAction(service, {
    name: "create_game_center_leaderboard",
    operationType: "write",
    description:
      "Create a Game Center leaderboard owned by one app or shared by a group. App Store Connect always creates the first leaderboard version alongside it, so the player-facing text is added with create_game_center_leaderboard_localization against that version. Give recurrenceStartDate, recurrenceDuration and recurrenceRule together to make the leaderboard recurring.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard to create.",
      {
        referenceName: nonEmptyString("Internal leaderboard name shown in App Store Connect."),
        vendorIdentifier: nonEmptyString(
          "Leaderboard identifier the game submits scores against, unique within the app or group. It cannot be changed afterwards.",
        ),
        defaultFormatter: s.stringEnum(
          "How scores are formatted unless a localization overrides it.",
          gameCenterLeaderboardFormatters,
        ),
        submissionType: s.stringEnum(
          "Which submitted score is kept for a player.",
          gameCenterLeaderboardSubmissionTypes,
        ),
        scoreSortType: s.stringEnum(
          "Whether a higher or a lower score ranks first.",
          gameCenterLeaderboardScoreSortTypes,
        ),
        scoreRangeStart: nonEmptyString("Lowest accepted score, as a decimal string."),
        scoreRangeEnd: nonEmptyString("Highest accepted score, as a decimal string."),
        recurrenceStartDate: s.dateTime(
          "When the first recurring run of the leaderboard starts, as an ISO 8601 timestamp.",
        ),
        recurrenceDuration: nonEmptyString("How long each recurring run lasts, as an ISO 8601 duration such as P1D."),
        recurrenceRule: nonEmptyString("ICS recurrence rule that schedules the recurring runs."),
        activityProperties: freeFormProperties("Key-value properties the leaderboard contributes to a game activity."),
        visibility: s.stringEnum("Whether the leaderboard is shown to players.", gameCenterLeaderboardVisibilities),
        gameCenterDetailId: nonEmptyString("Game Center detail of the app that owns the leaderboard."),
        gameCenterGroupId: nonEmptyString("Game Center group that owns the leaderboard when several apps share it."),
        gameCenterLeaderboardSetIds: identifierListInput("Leaderboard sets the new leaderboard is added to."),
      },
      {
        required: ["referenceName", "vendorIdentifier", "defaultFormatter", "submissionType", "scoreSortType"],
      },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboard: gameCenterLeaderboardResource },
      "The created Game Center leaderboard.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard",
    operationType: "read",
    description: "Read one Game Center leaderboard by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard."),
      },
      ["gameCenterLeaderboardId"],
      "Identifies the Game Center leaderboard to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboard: gameCenterLeaderboardResource },
      "The requested Game Center leaderboard.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_leaderboard",
    operationType: "destructive",
    description:
      "Change the configuration of a Game Center leaderboard or archive it. Overwrites the given fields and clears the ones passed as null; pass at least one. The vendorIdentifier cannot be changed. Archiving retires the leaderboard so it stops accepting scores.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard fields to change.",
      {
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard."),
        referenceName: clearableString("New internal leaderboard name, or null to clear it."),
        defaultFormatter: nullableEnum(
          "New score formatter used unless a localization overrides it, or null to clear it.",
          gameCenterLeaderboardFormatters,
        ),
        submissionType: nullableEnum(
          "New rule for which submitted score is kept for a player, or null to clear it.",
          gameCenterLeaderboardSubmissionTypes,
        ),
        scoreSortType: nullableEnum(
          "New sort order deciding whether a higher or a lower score ranks first, or null to clear it.",
          gameCenterLeaderboardScoreSortTypes,
        ),
        scoreRangeStart: clearableString(
          "New lowest accepted score as a decimal string, or null to accept any low score.",
        ),
        scoreRangeEnd: clearableString(
          "New highest accepted score as a decimal string, or null to accept any high score.",
        ),
        recurrenceStartDate: s.nullable(
          s.dateTime("New start of the first recurring run as an ISO 8601 timestamp, or null to clear it."),
        ),
        recurrenceDuration: clearableString(
          "New length of each recurring run as an ISO 8601 duration such as P1D, or null to clear it.",
        ),
        recurrenceRule: clearableString("New ICS recurrence rule scheduling the recurring runs, or null to clear it."),
        archived: s.boolean("Pass true to archive the leaderboard so it no longer accepts scores."),
        activityProperties: clearableFreeFormProperties(
          "New key-value properties the leaderboard contributes to a game activity, or null to clear them.",
        ),
        visibility: nullableEnum(
          "New visibility of the leaderboard for players, or null to clear it.",
          gameCenterLeaderboardVisibilities,
        ),
      },
      { required: ["gameCenterLeaderboardId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboard: gameCenterLeaderboardResource },
      "The updated Game Center leaderboard.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_leaderboard",
    operationType: "destructive",
    description:
      "Delete a Game Center leaderboard together with its versions, localizations and the scores players submitted to it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard."),
      },
      ["gameCenterLeaderboardId"],
      "Identifies the Game Center leaderboard to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted leaderboard."),
      "Confirmation that the Game Center leaderboard was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_leaderboard_versions",
    operationType: "read",
    description:
      "List the versions of one Game Center leaderboard. Each version carries its own localizations through App Review.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the leaderboard whose versions to list.",
      {
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard."),
        ...paginationInputs,
      },
      { required: ["gameCenterLeaderboardId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardVersions",
      gameCenterLeaderboardVersionResource,
      "Leaderboard versions returned for this page.",
      "A page of Game Center leaderboard versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_game_center_leaderboard_activity",
    operationType: "destructive",
    description:
      "Link a Game Center leaderboard to the game activity it belongs to, replacing any activity linked before. App Store Connect confirms the change without returning the leaderboard.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboard and the activity to link it to.",
      {
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard."),
        gameCenterActivityId: nonEmptyString(
          "App Store Connect identifier of the game activity to link the leaderboard to.",
        ),
      },
      { required: ["gameCenterLeaderboardId", "gameCenterActivityId"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardId: s.string("The leaderboard that was changed."),
        gameCenterActivityId: s.string("The activity now linked to the leaderboard."),
        updated: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the activity of the leaderboard was set.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_game_center_leaderboard_challenge",
    operationType: "destructive",
    description:
      "Link a Game Center leaderboard to the challenge that ranks players against it, replacing any challenge linked before. App Store Connect confirms the change without returning the leaderboard.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboard and the challenge to link it to.",
      {
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard."),
        gameCenterChallengeId: nonEmptyString(
          "App Store Connect identifier of the challenge to link the leaderboard to.",
        ),
      },
      { required: ["gameCenterLeaderboardId", "gameCenterChallengeId"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardId: s.string("The leaderboard that was changed."),
        gameCenterChallengeId: s.string("The challenge now linked to the leaderboard."),
        updated: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the challenge of the leaderboard was set.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_leaderboard_version",
    operationType: "write",
    description:
      "Create a new version of a Game Center leaderboard so its localized text can be edited and taken through App Review again. Add the text with create_game_center_leaderboard_localization against the new version.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardId: nonEmptyString(
          "App Store Connect identifier of the leaderboard the version belongs to.",
        ),
      },
      ["gameCenterLeaderboardId"],
      "Identifies the leaderboard to create a new version of.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardVersion: gameCenterLeaderboardVersionResource },
      "The created Game Center leaderboard version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_version",
    operationType: "read",
    description: "Read one Game Center leaderboard version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardVersionId: nonEmptyString("App Store Connect identifier of the leaderboard version."),
      },
      ["gameCenterLeaderboardVersionId"],
      "Identifies the Game Center leaderboard version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardVersion: gameCenterLeaderboardVersionResource },
      "The requested Game Center leaderboard version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_leaderboard_version_localizations",
    operationType: "read",
    description:
      "List the locales of one Game Center leaderboard version, each with the name, score description and score formatting shown to players.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the leaderboard version whose localizations to list.",
      {
        gameCenterLeaderboardVersionId: nonEmptyString("App Store Connect identifier of the leaderboard version."),
        ...paginationInputs,
      },
      { required: ["gameCenterLeaderboardVersionId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardLocalizations",
      gameCenterLeaderboardLocalizationResource,
      "Leaderboard localizations returned for this page.",
      "A page of Game Center leaderboard localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_leaderboard_localization",
    operationType: "write",
    description:
      "Add a locale to a Game Center leaderboard version with the name and score text players see there. The image shown next to the leaderboard is uploaded separately and is not covered by this connector.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard localization to create.",
      {
        gameCenterLeaderboardVersionId: nonEmptyString(
          "App Store Connect identifier of the leaderboard version the locale is added to.",
        ),
        locale: nonEmptyString("Locale to add, such as en-US."),
        name: nonEmptyString("Leaderboard name shown to players in this locale."),
        formatterOverride: s.stringEnum(
          "Score formatter used in this locale instead of the leaderboard default.",
          gameCenterLeaderboardFormatters,
        ),
        formatterSuffix: nonEmptyString("Suffix appended to plural score values, such as points."),
        formatterSuffixSingular: nonEmptyString("Suffix appended to a score value of one, such as point."),
        description: nonEmptyString("Score description shown to players in this locale."),
      },
      { required: ["gameCenterLeaderboardVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardLocalization: gameCenterLeaderboardLocalizationResource },
      "The created Game Center leaderboard localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_localization",
    operationType: "read",
    description: "Read one Game Center leaderboard localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard localization.",
        ),
      },
      ["gameCenterLeaderboardLocalizationId"],
      "Identifies the Game Center leaderboard localization to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardLocalization: gameCenterLeaderboardLocalizationResource },
      "The requested Game Center leaderboard localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_leaderboard_localization",
    operationType: "destructive",
    description:
      "Change the text or score formatting of a Game Center leaderboard localization. Overwrites the given fields and clears the ones passed as null; pass at least one. The locale cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard localization fields to change.",
      {
        gameCenterLeaderboardLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard localization.",
        ),
        name: clearableString("New leaderboard name shown to players in this locale, or null to clear it."),
        formatterOverride: nullableEnum(
          "New score formatter for this locale, or null to fall back to the leaderboard default.",
          gameCenterLeaderboardFormatters,
        ),
        formatterSuffix: clearableString("New suffix appended to plural score values, or null to clear it."),
        formatterSuffixSingular: clearableString("New suffix appended to a score value of one, or null to clear it."),
        description: clearableString("New score description shown to players in this locale, or null to clear it."),
      },
      { required: ["gameCenterLeaderboardLocalizationId"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardLocalization: gameCenterLeaderboardLocalizationResource },
      "The updated Game Center leaderboard localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_leaderboard_localization",
    operationType: "destructive",
    description: "Remove a locale from a Game Center leaderboard version, including the image uploaded for it.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard localization.",
        ),
      },
      ["gameCenterLeaderboardLocalizationId"],
      "Identifies the Game Center leaderboard localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted leaderboard localization."),
      "Confirmation that the Game Center leaderboard localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_localization_image",
    operationType: "read",
    description:
      "Read the image shown with a Game Center leaderboard localization, including its delivery state. Returns null when no image has been uploaded for the locale. Uploading an image is not covered by this connector, only reading the one already uploaded.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard localization.",
        ),
      },
      ["gameCenterLeaderboardLocalizationId"],
      "Identifies the Game Center leaderboard localization whose image to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardImage: s.nullable(gameCenterLeaderboardImageResource) },
      "The image of the leaderboard localization, or null when none has been uploaded.",
    ),
  }),

  defineProviderAction(service, {
    name: "create_game_center_leaderboard_set",
    operationType: "write",
    description:
      "Create a Game Center leaderboard set that groups related leaderboards under one entry in the Game Center dashboard, and optionally put existing leaderboards into it. App Store Connect always creates the first set version together with the set; add the localized set names with create_game_center_leaderboard_set_localization.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard set to create.",
      {
        referenceName: nonEmptyString("Internal set name shown in App Store Connect."),
        vendorIdentifier: nonEmptyString("Set identifier the game refers to, unique within the app or group."),
        gameCenterDetailId: nonEmptyString(
          "Game Center detail of the app the set belongs to. Pass this or gameCenterGroupId.",
        ),
        gameCenterGroupId: nonEmptyString(
          "Game Center group the set belongs to when several apps share it. Pass this or gameCenterDetailId.",
        ),
        gameCenterLeaderboardIds: identifierListInput("Existing leaderboards to put into the new set."),
      },
      { required: ["referenceName", "vendorIdentifier"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSet: gameCenterLeaderboardSetResource },
      "The created Game Center leaderboard set.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_set",
    operationType: "read",
    description: "Read one Game Center leaderboard set by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
      },
      ["gameCenterLeaderboardSetId"],
      "Identifies the Game Center leaderboard set to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSet: gameCenterLeaderboardSetResource },
      "The requested Game Center leaderboard set.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_leaderboard_set",
    operationType: "write",
    description:
      "Rename a Game Center leaderboard set, or clear its reference name with null. The vendor identifier is fixed once the set exists and cannot be changed.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The reference name to store on the leaderboard set.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        referenceName: clearableString("New internal set name, or null to clear it."),
      },
      { required: ["gameCenterLeaderboardSetId", "referenceName"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSet: gameCenterLeaderboardSetResource },
      "The updated Game Center leaderboard set.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_leaderboard_set",
    operationType: "destructive",
    description:
      "Delete a Game Center leaderboard set together with its versions and localizations. The leaderboards that were in the set are kept and stay available on their own.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
      },
      ["gameCenterLeaderboardSetId"],
      "Identifies the Game Center leaderboard set to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted leaderboard set."),
      "Confirmation that the Game Center leaderboard set was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_leaderboard_set_leaderboards",
    operationType: "read",
    description:
      "List the leaderboards that belong to one Game Center leaderboard set, optionally narrowed by reference name, by archived state, or to specific leaderboards.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the leaderboards of a leaderboard set.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        referenceNames: s.stringArray("Return only leaderboards with these reference names.", {
          minItems: 1,
          itemDescription: "An internal leaderboard name shown in App Store Connect.",
        }),
        archived: s.boolean(
          "Return only archived leaderboards when true, or only leaderboards that still accept scores when false.",
        ),
        gameCenterLeaderboardIds: identifierListInput("Return only the leaderboards with these identifiers."),
        ...paginationInputs,
      },
      { required: ["gameCenterLeaderboardSetId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboards",
      gameCenterLeaderboardResource,
      "Leaderboards returned for this page.",
      "A page of leaderboards that belong to the leaderboard set.",
    ),
  }),
  defineProviderAction(service, {
    name: "add_leaderboards_to_game_center_leaderboard_set",
    operationType: "write",
    description:
      "Put more existing leaderboards into a Game Center leaderboard set. The leaderboards already in the set are kept.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboards to add to a leaderboard set.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        gameCenterLeaderboardIds: identifierListInput("Identifiers of the leaderboards to add."),
      },
      { required: ["gameCenterLeaderboardSetId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardSetId: s.string("The leaderboard set the leaderboards were added to."),
        gameCenterLeaderboardIds: identifierListOutput("Identifiers of the leaderboards that were added."),
        added: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards were added to the leaderboard set.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_game_center_leaderboard_set_leaderboards",
    operationType: "destructive",
    description:
      "Replace the whole list of leaderboards in a Game Center leaderboard set. Leaderboards missing from the new list leave the set but are not deleted.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The complete list of leaderboards the set should contain.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        gameCenterLeaderboardIds: identifierListInput("Identifiers of every leaderboard that should stay in the set."),
      },
      { required: ["gameCenterLeaderboardSetId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardSetId: s.string("The leaderboard set whose leaderboards were replaced."),
        gameCenterLeaderboardIds: identifierListOutput("Identifiers of the leaderboards that are in the set now."),
        replaced: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards of the leaderboard set were replaced.",
    ),
  }),
  defineProviderAction(service, {
    name: "remove_leaderboards_from_game_center_leaderboard_set",
    operationType: "destructive",
    description:
      "Take leaderboards out of a Game Center leaderboard set. The leaderboards themselves are kept and stay available on their own.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The leaderboards to take out of a leaderboard set.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        gameCenterLeaderboardIds: identifierListInput("Identifiers of the leaderboards to remove."),
      },
      { required: ["gameCenterLeaderboardSetId", "gameCenterLeaderboardIds"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardSetId: s.string("The leaderboard set the leaderboards were removed from."),
        gameCenterLeaderboardIds: identifierListOutput("Identifiers of the leaderboards that were removed."),
        removed: s.boolean("Always true once App Store Connect confirmed the change."),
      },
      "Confirmation that the leaderboards were removed from the leaderboard set.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_leaderboard_set_versions",
    operationType: "read",
    description:
      "List the versions of one Game Center leaderboard set. Each version carries its own localized names through App Review.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of a leaderboard set.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        ...paginationInputs,
      },
      { required: ["gameCenterLeaderboardSetId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardSetVersions",
      gameCenterLeaderboardSetVersionResource,
      "Leaderboard set versions returned for this page.",
      "A page of Game Center leaderboard set versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_leaderboard_set_version",
    operationType: "write",
    description:
      "Create a new editable version of a Game Center leaderboard set, for example to change its localized names after the current version went live.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
      },
      ["gameCenterLeaderboardSetId"],
      "Identifies the leaderboard set to create a version for.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSetVersion: gameCenterLeaderboardSetVersionResource },
      "The created Game Center leaderboard set version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_set_version",
    operationType: "read",
    description:
      "Read one Game Center leaderboard set version by its App Store Connect identifier, including its review state.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetVersionId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set version.",
        ),
      },
      ["gameCenterLeaderboardSetVersionId"],
      "Identifies the Game Center leaderboard set version to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSetVersion: gameCenterLeaderboardSetVersionResource },
      "The requested Game Center leaderboard set version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_leaderboard_set_version_localizations",
    operationType: "read",
    description: "List the locales one Game Center leaderboard set version is translated into.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the localizations of a leaderboard set version.",
      {
        gameCenterLeaderboardSetVersionId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set version.",
        ),
        ...paginationInputs,
      },
      { required: ["gameCenterLeaderboardSetVersionId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardSetLocalizations",
      gameCenterLeaderboardSetLocalizationResource,
      "Leaderboard set localizations returned for this page.",
      "A page of Game Center leaderboard set localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_leaderboard_set_localization",
    operationType: "write",
    description:
      "Add a locale to a Game Center leaderboard set version with the set name players see in that locale. App Store Connect rejects a locale the version already has.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard set localization to create.",
      {
        gameCenterLeaderboardSetVersionId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set version.",
        ),
        locale: nonEmptyString("Locale the name is written in, such as en-US."),
        name: nonEmptyString("Set name shown to players in this locale."),
      },
      { required: ["gameCenterLeaderboardSetVersionId", "locale", "name"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSetLocalization: gameCenterLeaderboardSetLocalizationResource },
      "The created Game Center leaderboard set localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_set_localization",
    operationType: "read",
    description: "Read one Game Center leaderboard set localization by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set localization.",
        ),
      },
      ["gameCenterLeaderboardSetLocalizationId"],
      "Identifies the Game Center leaderboard set localization to read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSetLocalization: gameCenterLeaderboardSetLocalizationResource },
      "The requested Game Center leaderboard set localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_leaderboard_set_localization",
    operationType: "destructive",
    description:
      "Replace the set name of a Game Center leaderboard set localization, or clear it with null. The locale is fixed once the localization exists; delete and recreate it to change the locale.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The name to store for the leaderboard set localization.",
      {
        gameCenterLeaderboardSetLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set localization.",
        ),
        name: clearableString("New set name shown in this locale, or null to clear it."),
      },
      { required: ["gameCenterLeaderboardSetLocalizationId", "name"] },
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSetLocalization: gameCenterLeaderboardSetLocalizationResource },
      "The updated Game Center leaderboard set localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_leaderboard_set_localization",
    operationType: "destructive",
    description:
      "Remove a locale from a Game Center leaderboard set version, including the image uploaded for that locale.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set localization.",
        ),
      },
      ["gameCenterLeaderboardSetLocalizationId"],
      "Identifies the Game Center leaderboard set localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted leaderboard set localization."),
      "Confirmation that the Game Center leaderboard set localization was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_game_center_leaderboard_set_localization_image",
    operationType: "read",
    description:
      "Read the image attached to one Game Center leaderboard set localization, with its delivery URL and upload state. Uploading an image is not covered by this connector; only an image that was already uploaded can be read.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set localization.",
        ),
      },
      ["gameCenterLeaderboardSetLocalizationId"],
      "Identifies the Game Center leaderboard set localization whose image is read.",
    ),
    outputSchema: s.actionOutput(
      { gameCenterLeaderboardSetImage: s.nullable(gameCenterLeaderboardSetImageResource) },
      "The image of the leaderboard set localization, or null when no image was uploaded for it.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_game_center_leaderboard_set_member_localizations",
    operationType: "read",
    description:
      "List the member localizations of one leaderboard inside one leaderboard set. A member localization is the name a leaderboard is shown under while a player browses the set, which can differ from the name of the leaderboard on its own. App Store Connect requires both the set and the leaderboard.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the leaderboard inside the leaderboard set whose names are listed.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard inside that set."),
        ...paginationInputs,
      },
      { required: ["gameCenterLeaderboardSetId", "gameCenterLeaderboardId"] },
    ),
    outputSchema: pageOutput(
      "gameCenterLeaderboardSetMemberLocalizations",
      gameCenterLeaderboardSetMemberLocalizationResource,
      "Member localizations returned for this page.",
      "A page of Game Center leaderboard set member localizations.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_game_center_leaderboard_set_member_localization",
    operationType: "write",
    description:
      "Give one leaderboard a name of its own inside one leaderboard set, for one locale. Without a member localization the leaderboard keeps its usual localized name inside the set.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The Game Center leaderboard set member localization to create.",
      {
        gameCenterLeaderboardSetId: nonEmptyString("App Store Connect identifier of the leaderboard set."),
        gameCenterLeaderboardId: nonEmptyString("App Store Connect identifier of the leaderboard inside that set."),
        locale: nonEmptyString("Locale the name is written in, such as en-US."),
        name: nonEmptyString("Name the leaderboard is shown under inside the set."),
      },
      { required: ["gameCenterLeaderboardSetId", "gameCenterLeaderboardId"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardSetMemberLocalization: gameCenterLeaderboardSetMemberLocalizationResource,
      },
      "The created Game Center leaderboard set member localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_game_center_leaderboard_set_member_localization",
    operationType: "destructive",
    description:
      "Replace the name a leaderboard is shown under inside a leaderboard set, or clear it with null so the leaderboard falls back to its usual localized name.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.object(
      "The name to store for the leaderboard set member localization.",
      {
        gameCenterLeaderboardSetMemberLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set member localization.",
        ),
        name: clearableString("New name the leaderboard is shown under inside the set, or null to clear it."),
      },
      { required: ["gameCenterLeaderboardSetMemberLocalizationId", "name"] },
    ),
    outputSchema: s.actionOutput(
      {
        gameCenterLeaderboardSetMemberLocalization: gameCenterLeaderboardSetMemberLocalizationResource,
      },
      "The updated Game Center leaderboard set member localization.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_game_center_leaderboard_set_member_localization",
    operationType: "destructive",
    description:
      "Delete the name a leaderboard is shown under inside a leaderboard set for one locale. The leaderboard stays in the set and falls back to its usual localized name.",
    requiredScopes: [],
    providerPermissions: [...configureGameCenterRoles],
    inputSchema: s.actionInput(
      {
        gameCenterLeaderboardSetMemberLocalizationId: nonEmptyString(
          "App Store Connect identifier of the leaderboard set member localization.",
        ),
      },
      ["gameCenterLeaderboardSetMemberLocalizationId"],
      "Identifies the Game Center leaderboard set member localization to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted member localization."),
      "Confirmation that the Game Center leaderboard set member localization was deleted.",
    ),
  }),
];
