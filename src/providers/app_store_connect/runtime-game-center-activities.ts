import type { AppStoreConnectContext, AppStoreConnectHandlers } from "./runtime-helpers.ts";

import {
  looseArray,
  rawStringOrNull,
  recordOrEmpty,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  compactObject,
  optionalBoolean,
  booleanString,
  pickOptionalString,
} from "../../core/cast.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { getGameCenterImage, readFreeFormProperties } from "./runtime-game-center.ts";
import {
  assertNoContent,
  createResource,
  deleteResource,
  getResource,
  listPage,
  listResources,
  modifyRelationship,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIdentifierList,
  readIntegerQuery,
  readNextCursor,
  readOptionalAppStoreConnectId,
  readOptionalIdentifierFilter,
  readRelationshipId,
  readResource,
  readStringList,
  readTotal,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const activityLabel = "App Store Connect Game Center activity";
const activityVersionLabel = "App Store Connect Game Center activity version";
const activityLocalizationLabel = "App Store Connect Game Center activity localization";
const activityImageLabel = "App Store Connect Game Center activity image";
const challengeLabel = "App Store Connect Game Center challenge";
const challengeVersionLabel = "App Store Connect Game Center challenge version";
const challengeLocalizationLabel = "App Store Connect Game Center challenge localization";
const challengeImageLabel = "App Store Connect Game Center challenge image";
const matchmakingQueueLabel = "App Store Connect Game Center matchmaking queue";
const matchmakingRuleSetLabel = "App Store Connect Game Center matchmaking rule set";
const matchmakingRuleLabel = "App Store Connect Game Center matchmaking rule";
const matchmakingTeamLabel = "App Store Connect Game Center matchmaking team";
const matchmakingRuleSetTestLabel = "App Store Connect Game Center matchmaking rule set test";

const queueInclude = "ruleSet,experimentRuleSet";

const inlineActivityVersionId = "${new-gameCenterActivityVersion-id}";
const inlineTestRequestId = (index: number) => `\${new-gameCenterMatchmakingTestRequest-${index}-id}`;
const inlineTestPlayerPropertyId = (requestIndex: number, index: number) =>
  `\${new-gameCenterMatchmakingTestPlayerProperty-${requestIndex}-${index}-id}`;

function normalizeMatchmakingQueue(resource: Record<string, unknown>): Record<string, unknown> {
  const queue = normalizeResource(resource, matchmakingQueueLabel);
  return {
    ...queue,
    ruleSetId: readRelationshipId(resource, "ruleSet"),
    experimentRuleSetId: readRelationshipId(resource, "experimentRuleSet"),
  };
}

async function readMatchmakingMetrics(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  path: string,
  query: Record<string, string | undefined>,
): Promise<{
  metrics: Array<Record<string, unknown>>;
  nextCursor: string | null;
  total: number | null;
}> {
  const { payload } = await requestAppStoreConnect(context, {
    path,
    query: {
      granularity: requiredInputString(input.granularity, "granularity"),
      ...query,
      limit: readIntegerQuery(input.limit),
      cursor: pickOptionalString(input, "cursor"),
    },
  });
  const series = looseArray(recordOrEmpty(payload).data).map((item) => {
    const record = recordOrEmpty(item);
    const dimensions = recordOrEmpty(record.dimensions);
    return {
      ...record,
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([name, value]) => [name, rawStringOrNull(recordOrEmpty(value).data)]),
      ),
    };
  });
  return { metrics: series, nextCursor: readNextCursor(payload), total: readTotal(payload) };
}

function readChallengeFilterQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
    "filter[archived]": booleanString(input.archived),
    "filter[id]": readOptionalIdentifierFilter(input.gameCenterChallengeIds, "gameCenterChallengeIds"),
  };
}

function readAppMatchmakingRequestQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "groupBy": readCommaSeparatedList(input.groupBy),
    "filter[result]": pickOptionalString(input, "result"),
  };
}

function readQueueMatchmakingRequestQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "groupBy": readCommaSeparatedList(input.groupBy),
    "filter[result]": pickOptionalString(input, "result"),
    "filter[gameCenterDetail]": readOptionalAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
  };
}

function readMatchmakingRuleQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "groupBy": readCommaSeparatedList(input.groupBy),
    "filter[gameCenterMatchmakingQueue]": readOptionalAppStoreConnectId(
      input.gameCenterMatchmakingQueueId,
      "gameCenterMatchmakingQueueId",
    ),
  };
}

export const appStoreConnectGameCenterActivityHandlers: AppStoreConnectHandlers = {
  async list_game_center_detail_activities(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "gameCenterActivities",
      ),
      label: activityLabel,
    });
    return { gameCenterActivities: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_game_center_group_activities(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterGroups",
        readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
        "gameCenterActivities",
      ),
      label: activityLabel,
    });
    return { gameCenterActivities: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_game_center_activity(input, context) {
    const gameCenterDetailId = readOptionalAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterGroupId = readOptionalAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const fallbackUrl = pickOptionalString(input, "fallbackUrl");
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/gameCenterActivities",
      body: compactObject({
        data: {
          type: "gameCenterActivities",
          attributes: compactObject({
            referenceName: requiredInputString(input.referenceName, "referenceName"),
            vendorIdentifier: requiredInputString(input.vendorIdentifier, "vendorIdentifier"),
            playStyle: pickOptionalString(input, "playStyle"),
            minimumPlayersCount: optionalInteger(input.minimumPlayersCount),
            maximumPlayersCount: optionalInteger(input.maximumPlayersCount),
            supportsPartyCode: optionalBoolean(input.supportsPartyCode),
            properties: optionalRecord(input.properties),
          }),
          relationships: compactObject({
            gameCenterDetail: toOptionalOneLinkage("gameCenterDetails", gameCenterDetailId),
            gameCenterGroup: toOptionalOneLinkage("gameCenterGroups", gameCenterGroupId),

            versions:
              fallbackUrl === undefined
                ? undefined
                : toManyLinkage("gameCenterActivityVersions", [inlineActivityVersionId]),
          }),
        },
        included:
          fallbackUrl === undefined
            ? undefined
            : [
                {
                  type: "gameCenterActivityVersions",
                  id: inlineActivityVersionId,
                  attributes: { fallbackUrl },
                },
              ],
      }),
    });
    return {
      gameCenterActivity: normalizeResource(readResource(payload, activityLabel), activityLabel),
    };
  },

  async get_game_center_activity(input, context) {
    return {
      gameCenterActivity: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterActivities",
          readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId"),
        ),
        activityLabel,
      ),
    };
  },

  async update_game_center_activity(input, context) {
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");
    const attributes = {
      referenceName: rawStringOrNull(input.referenceName),
      playStyle: rawStringOrNull(input.playStyle),
      minimumPlayersCount: input.minimumPlayersCount === null ? null : optionalInteger(input.minimumPlayersCount),
      maximumPlayersCount: input.maximumPlayersCount === null ? null : optionalInteger(input.maximumPlayersCount),
      supportsPartyCode: optionalBoolean(input.supportsPartyCode),
      archived: optionalBoolean(input.archived),
      properties: readFreeFormProperties(input.properties),
    };
    requireAnyAttribute(attributes, "at least one Game Center activity field to update is required");
    const gameCenterActivity = await updateResource(context, {
      path: resourcePath("/v1/gameCenterActivities", gameCenterActivityId),
      type: "gameCenterActivities",
      id: gameCenterActivityId,
      label: activityLabel,
      attributes,
    });
    return { gameCenterActivity };
  },

  async delete_game_center_activity(input, context) {
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterActivities", gameCenterActivityId),
      `Deleting the ${activityLabel}`,
    );
    return { id: gameCenterActivityId, deleted: true };
  },

  async list_game_center_activity_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterActivities",
        readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId"),
        "versions",
      ),
      label: activityVersionLabel,
    });
    return {
      gameCenterActivityVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async add_achievements_to_game_center_activity(input, context) {
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");
    const gameCenterAchievementIds = readIdentifierList(input.gameCenterAchievementIds, "gameCenterAchievementIds");

    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/gameCenterActivities", gameCenterActivityId, "relationships/achievementsV2"),
      type: "gameCenterAchievements",
      ids: gameCenterAchievementIds,
      label: `Adding achievements to the ${activityLabel}`,
    });
    return { gameCenterActivityId, gameCenterAchievementIds, added: true };
  },

  async remove_achievements_from_game_center_activity(input, context) {
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");
    const gameCenterAchievementIds = readIdentifierList(input.gameCenterAchievementIds, "gameCenterAchievementIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/gameCenterActivities", gameCenterActivityId, "relationships/achievementsV2"),
      type: "gameCenterAchievements",
      ids: gameCenterAchievementIds,
      label: `Removing achievements from the ${activityLabel}`,
    });
    return { gameCenterActivityId, gameCenterAchievementIds, removed: true };
  },

  async add_leaderboards_to_game_center_activity(input, context) {
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");

    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/gameCenterActivities", gameCenterActivityId, "relationships/leaderboardsV2"),
      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Adding leaderboards to the ${activityLabel}`,
    });
    return { gameCenterActivityId, gameCenterLeaderboardIds, added: true };
  },

  async remove_leaderboards_from_game_center_activity(input, context) {
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/gameCenterActivities", gameCenterActivityId, "relationships/leaderboardsV2"),
      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Removing leaderboards from the ${activityLabel}`,
    });
    return { gameCenterActivityId, gameCenterLeaderboardIds, removed: true };
  },

  async create_game_center_activity_version(input, context) {
    const gameCenterActivityVersion = await createResource(context, {
      path: "/v1/gameCenterActivityVersions",
      type: "gameCenterActivityVersions",
      label: activityVersionLabel,
      attributes: { fallbackUrl: pickOptionalString(input, "fallbackUrl") },
      relationships: {
        activity: toOneLinkage(
          "gameCenterActivities",
          readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId"),
        ),
      },
    });
    return { gameCenterActivityVersion };
  },

  async get_game_center_activity_version(input, context) {
    return {
      gameCenterActivityVersion: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterActivityVersions",
          readAppStoreConnectId(input.gameCenterActivityVersionId, "gameCenterActivityVersionId"),
        ),
        activityVersionLabel,
      ),
    };
  },

  async update_game_center_activity_version(input, context) {
    const gameCenterActivityVersionId = readAppStoreConnectId(
      input.gameCenterActivityVersionId,
      "gameCenterActivityVersionId",
    );

    const attributes = { fallbackUrl: rawStringOrNull(input.fallbackUrl) };
    requireAnyAttribute(attributes, "fallbackUrl is required");
    const gameCenterActivityVersion = await updateResource(context, {
      path: resourcePath("/v1/gameCenterActivityVersions", gameCenterActivityVersionId),
      type: "gameCenterActivityVersions",
      id: gameCenterActivityVersionId,
      label: activityVersionLabel,
      attributes,
    });
    return { gameCenterActivityVersion };
  },

  async get_game_center_activity_version_default_image(input, context) {
    return {
      gameCenterActivityImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v1/gameCenterActivityVersions",
          readAppStoreConnectId(input.gameCenterActivityVersionId, "gameCenterActivityVersionId"),
          "defaultImage",
        ),
        activityImageLabel,
      ),
    };
  },

  async list_game_center_activity_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterActivityVersions",
        readAppStoreConnectId(input.gameCenterActivityVersionId, "gameCenterActivityVersionId"),
        "localizations",
      ),
      label: activityLocalizationLabel,
    });
    return {
      gameCenterActivityLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_activity_localization(input, context) {
    const gameCenterActivityLocalization = await createResource(context, {
      path: "/v1/gameCenterActivityLocalizations",
      type: "gameCenterActivityLocalizations",
      label: activityLocalizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        name: requiredInputString(input.name, "name"),
        description: pickOptionalString(input, "description"),
      },
      relationships: {
        version: toOneLinkage(
          "gameCenterActivityVersions",
          readAppStoreConnectId(input.gameCenterActivityVersionId, "gameCenterActivityVersionId"),
        ),
      },
    });
    return { gameCenterActivityLocalization };
  },

  async get_game_center_activity_localization(input, context) {
    return {
      gameCenterActivityLocalization: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterActivityLocalizations",
          readAppStoreConnectId(input.gameCenterActivityLocalizationId, "gameCenterActivityLocalizationId"),
        ),
        activityLocalizationLabel,
      ),
    };
  },

  async update_game_center_activity_localization(input, context) {
    const gameCenterActivityLocalizationId = readAppStoreConnectId(
      input.gameCenterActivityLocalizationId,
      "gameCenterActivityLocalizationId",
    );

    const attributes = {
      name: rawStringOrNull(input.name),
      description: rawStringOrNull(input.description),
    };
    requireAnyAttribute(attributes, "at least one Game Center activity localization field to update is required");
    const gameCenterActivityLocalization = await updateResource(context, {
      path: resourcePath("/v1/gameCenterActivityLocalizations", gameCenterActivityLocalizationId),
      type: "gameCenterActivityLocalizations",
      id: gameCenterActivityLocalizationId,
      label: activityLocalizationLabel,
      attributes,
    });
    return { gameCenterActivityLocalization };
  },

  async delete_game_center_activity_localization(input, context) {
    const gameCenterActivityLocalizationId = readAppStoreConnectId(
      input.gameCenterActivityLocalizationId,
      "gameCenterActivityLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterActivityLocalizations", gameCenterActivityLocalizationId),
      `Deleting the ${activityLocalizationLabel}`,
    );
    return { id: gameCenterActivityLocalizationId, deleted: true };
  },

  async get_game_center_activity_localization_image(input, context) {
    return {
      gameCenterActivityImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v1/gameCenterActivityLocalizations",
          readAppStoreConnectId(input.gameCenterActivityLocalizationId, "gameCenterActivityLocalizationId"),
          "image",
        ),
        activityImageLabel,
      ),
    };
  },

  async list_game_center_detail_challenges(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "gameCenterChallenges",
      ),
      label: challengeLabel,
      query: readChallengeFilterQuery(input),
    });
    return { gameCenterChallenges: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_game_center_group_challenges(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterGroups",
        readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
        "gameCenterChallenges",
      ),
      label: challengeLabel,
      query: readChallengeFilterQuery(input),
    });
    return { gameCenterChallenges: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_game_center_challenge(input, context) {
    return {
      gameCenterChallenge: await createResource(context, {
        path: "/v1/gameCenterChallenges",
        type: "gameCenterChallenges",
        label: challengeLabel,
        attributes: {
          referenceName: requiredInputString(input.referenceName, "referenceName"),
          vendorIdentifier: requiredInputString(input.vendorIdentifier, "vendorIdentifier"),
          challengeType: requiredInputString(input.challengeType, "challengeType"),
          repeatable: optionalBoolean(input.repeatable),
        },
        relationships: {
          gameCenterDetail: toOptionalOneLinkage(
            "gameCenterDetails",
            readOptionalAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
          ),
          gameCenterGroup: toOptionalOneLinkage(
            "gameCenterGroups",
            readOptionalAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
          ),

          leaderboardV2: toOptionalOneLinkage(
            "gameCenterLeaderboards",
            readOptionalAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId"),
          ),
        },
      }),
    };
  },

  async get_game_center_challenge(input, context) {
    return {
      gameCenterChallenge: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterChallenges",
          readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId"),
        ),
        challengeLabel,
      ),
    };
  },

  async update_game_center_challenge(input, context) {
    const gameCenterChallengeId = readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId");
    const gameCenterLeaderboardId = readOptionalAppStoreConnectId(
      input.gameCenterLeaderboardId,
      "gameCenterLeaderboardId",
    );
    const attributes = {
      referenceName: pickOptionalString(input, "referenceName"),
      archived: optionalBoolean(input.archived),
      repeatable: optionalBoolean(input.repeatable),
    };

    requireAnyAttribute(
      { ...attributes, gameCenterLeaderboardId },
      "at least one Game Center challenge field to update is required",
    );
    return {
      gameCenterChallenge: await updateResource(context, {
        path: resourcePath("/v1/gameCenterChallenges", gameCenterChallengeId),
        type: "gameCenterChallenges",
        id: gameCenterChallengeId,
        label: challengeLabel,
        attributes,
        relationships: {
          leaderboardV2: toOptionalOneLinkage("gameCenterLeaderboards", gameCenterLeaderboardId),
        },
      }),
    };
  },

  async delete_game_center_challenge(input, context) {
    const gameCenterChallengeId = readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId");
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterChallenges", gameCenterChallengeId),
      `Deleting the ${challengeLabel}`,
    );
    return { id: gameCenterChallengeId, deleted: true };
  },

  async list_game_center_challenge_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterChallenges",
        readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId"),
        "versions",
      ),
      label: challengeVersionLabel,
    });
    return {
      gameCenterChallengeVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async set_game_center_challenge_leaderboard(input, context) {
    const gameCenterChallengeId = readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId");
    const gameCenterLeaderboardId = readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId");

    const response = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterChallenges", gameCenterChallengeId, "relationships/leaderboardV2"),
      body: toOneLinkage("gameCenterLeaderboards", gameCenterLeaderboardId),
    });
    assertNoContent(response, [204], `Setting the leaderboard of the ${challengeLabel}`);
    return { gameCenterChallengeId, gameCenterLeaderboardId, updated: true };
  },

  async create_game_center_challenge_version(input, context) {
    return {
      gameCenterChallengeVersion: await createResource(context, {
        path: "/v1/gameCenterChallengeVersions",
        type: "gameCenterChallengeVersions",
        label: challengeVersionLabel,
        relationships: {
          challenge: toOneLinkage(
            "gameCenterChallenges",
            readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId"),
          ),
        },
      }),
    };
  },

  async get_game_center_challenge_version(input, context) {
    return {
      gameCenterChallengeVersion: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterChallengeVersions",
          readAppStoreConnectId(input.gameCenterChallengeVersionId, "gameCenterChallengeVersionId"),
        ),
        challengeVersionLabel,
      ),
    };
  },

  async get_game_center_challenge_version_default_image(input, context) {
    return {
      gameCenterChallengeImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v1/gameCenterChallengeVersions",
          readAppStoreConnectId(input.gameCenterChallengeVersionId, "gameCenterChallengeVersionId"),
          "defaultImage",
        ),
        challengeImageLabel,
      ),
    };
  },

  async list_game_center_challenge_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterChallengeVersions",
        readAppStoreConnectId(input.gameCenterChallengeVersionId, "gameCenterChallengeVersionId"),
        "localizations",
      ),
      label: challengeLocalizationLabel,
    });
    return {
      gameCenterChallengeLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_challenge_localization(input, context) {
    return {
      gameCenterChallengeLocalization: await createResource(context, {
        path: "/v1/gameCenterChallengeLocalizations",
        type: "gameCenterChallengeLocalizations",
        label: challengeLocalizationLabel,
        attributes: {
          locale: requiredInputString(input.locale, "locale"),
          name: requiredInputString(input.name, "name"),
          description: pickOptionalString(input, "description"),
        },
        relationships: {
          version: toOneLinkage(
            "gameCenterChallengeVersions",
            readAppStoreConnectId(input.gameCenterChallengeVersionId, "gameCenterChallengeVersionId"),
          ),
        },
      }),
    };
  },

  async get_game_center_challenge_localization(input, context) {
    return {
      gameCenterChallengeLocalization: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterChallengeLocalizations",
          readAppStoreConnectId(input.gameCenterChallengeLocalizationId, "gameCenterChallengeLocalizationId"),
        ),
        challengeLocalizationLabel,
      ),
    };
  },

  async update_game_center_challenge_localization(input, context) {
    const gameCenterChallengeLocalizationId = readAppStoreConnectId(
      input.gameCenterChallengeLocalizationId,
      "gameCenterChallengeLocalizationId",
    );

    const attributes = {
      name: rawStringOrNull(input.name),
      description: rawStringOrNull(input.description),
    };
    requireAnyAttribute(attributes, "at least one Game Center challenge localization field to update is required");
    return {
      gameCenterChallengeLocalization: await updateResource(context, {
        path: resourcePath("/v1/gameCenterChallengeLocalizations", gameCenterChallengeLocalizationId),
        type: "gameCenterChallengeLocalizations",
        id: gameCenterChallengeLocalizationId,
        label: challengeLocalizationLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_challenge_localization(input, context) {
    const gameCenterChallengeLocalizationId = readAppStoreConnectId(
      input.gameCenterChallengeLocalizationId,
      "gameCenterChallengeLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterChallengeLocalizations", gameCenterChallengeLocalizationId),
      `Deleting the ${challengeLocalizationLabel}`,
    );
    return { id: gameCenterChallengeLocalizationId, deleted: true };
  },

  async get_game_center_challenge_localization_image(input, context) {
    return {
      gameCenterChallengeImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v1/gameCenterChallengeLocalizations",
          readAppStoreConnectId(input.gameCenterChallengeLocalizationId, "gameCenterChallengeLocalizationId"),
          "image",
        ),
        challengeImageLabel,
      ),
    };
  },

  async list_game_center_matchmaking_queues(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/gameCenterMatchmakingQueues",
      label: matchmakingQueueLabel,
      query: { include: queueInclude },
    });
    return {
      gameCenterMatchmakingQueues: page.resources.map((resource) => normalizeMatchmakingQueue(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_matchmaking_queue(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/gameCenterMatchmakingQueues",
      body: {
        data: {
          type: "gameCenterMatchmakingQueues",
          attributes: compactObject({
            referenceName: requiredInputString(input.referenceName, "referenceName"),
            classicMatchmakingBundleIds: readStringList(input.classicMatchmakingBundleIds),
          }),
          relationships: compactObject({
            ruleSet: toOneLinkage(
              "gameCenterMatchmakingRuleSets",
              readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
            ),
            experimentRuleSet: toOptionalOneLinkage(
              "gameCenterMatchmakingRuleSets",
              readOptionalAppStoreConnectId(input.experimentRuleSetId, "experimentRuleSetId"),
            ),
          }),
        },
      },
    });
    return {
      gameCenterMatchmakingQueue: normalizeMatchmakingQueue(readResource(payload, matchmakingQueueLabel)),
    };
  },

  async get_game_center_matchmaking_queue(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/gameCenterMatchmakingQueues",
        readAppStoreConnectId(input.gameCenterMatchmakingQueueId, "gameCenterMatchmakingQueueId"),
      ),
      query: { include: queueInclude },
    });
    return {
      gameCenterMatchmakingQueue: normalizeMatchmakingQueue(readResource(payload, matchmakingQueueLabel)),
    };
  },

  async update_game_center_matchmaking_queue(input, context) {
    const gameCenterMatchmakingQueueId = readAppStoreConnectId(
      input.gameCenterMatchmakingQueueId,
      "gameCenterMatchmakingQueueId",
    );
    const attributes = compactObject({
      classicMatchmakingBundleIds:
        input.classicMatchmakingBundleIds === null ? null : readStringList(input.classicMatchmakingBundleIds),
    });
    const relationships = compactObject({
      ruleSet: toOptionalOneLinkage(
        "gameCenterMatchmakingRuleSets",
        readOptionalAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
      ),
      experimentRuleSet: toOptionalOneLinkage(
        "gameCenterMatchmakingRuleSets",
        readOptionalAppStoreConnectId(input.experimentRuleSetId, "experimentRuleSetId"),
      ),
    });
    requireAnyAttribute(
      { ...attributes, ...relationships },
      "at least one matchmaking queue field to update is required",
    );

    const { payload } = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterMatchmakingQueues", gameCenterMatchmakingQueueId),
      body: {
        data: compactObject({
          type: "gameCenterMatchmakingQueues",
          id: gameCenterMatchmakingQueueId,
          attributes: Object.keys(attributes).length === 0 ? undefined : attributes,
          relationships: Object.keys(relationships).length === 0 ? undefined : relationships,
        }),
      },
    });
    return {
      gameCenterMatchmakingQueue: normalizeMatchmakingQueue(readResource(payload, matchmakingQueueLabel)),
    };
  },

  async delete_game_center_matchmaking_queue(input, context) {
    const gameCenterMatchmakingQueueId = readAppStoreConnectId(
      input.gameCenterMatchmakingQueueId,
      "gameCenterMatchmakingQueueId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterMatchmakingQueues", gameCenterMatchmakingQueueId),
      `Deleting the ${matchmakingQueueLabel}`,
    );
    return { id: gameCenterMatchmakingQueueId, deleted: true };
  },

  async list_game_center_matchmaking_rule_sets(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/gameCenterMatchmakingRuleSets",
      label: matchmakingRuleSetLabel,
    });
    return {
      gameCenterMatchmakingRuleSets: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_matchmaking_rule_set(input, context) {
    return {
      gameCenterMatchmakingRuleSet: await createResource(context, {
        path: "/v1/gameCenterMatchmakingRuleSets",
        type: "gameCenterMatchmakingRuleSets",
        label: matchmakingRuleSetLabel,
        attributes: {
          referenceName: requiredInputString(input.referenceName, "referenceName"),
          ruleLanguageVersion: optionalInteger(input.ruleLanguageVersion),
          minPlayers: optionalInteger(input.minPlayers),
          maxPlayers: optionalInteger(input.maxPlayers),
        },
      }),
    };
  },

  async get_game_center_matchmaking_rule_set(input, context) {
    return {
      gameCenterMatchmakingRuleSet: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterMatchmakingRuleSets",
          readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
        ),
        matchmakingRuleSetLabel,
      ),
    };
  },

  async update_game_center_matchmaking_rule_set(input, context) {
    const gameCenterMatchmakingRuleSetId = readAppStoreConnectId(
      input.gameCenterMatchmakingRuleSetId,
      "gameCenterMatchmakingRuleSetId",
    );

    const attributes = {
      minPlayers: input.minPlayers === null ? null : optionalInteger(input.minPlayers),
      maxPlayers: input.maxPlayers === null ? null : optionalInteger(input.maxPlayers),
    };
    requireAnyAttribute(attributes, "at least one matchmaking rule set field to update is required");
    return {
      gameCenterMatchmakingRuleSet: await updateResource(context, {
        path: resourcePath("/v1/gameCenterMatchmakingRuleSets", gameCenterMatchmakingRuleSetId),
        type: "gameCenterMatchmakingRuleSets",
        id: gameCenterMatchmakingRuleSetId,
        label: matchmakingRuleSetLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_matchmaking_rule_set(input, context) {
    const gameCenterMatchmakingRuleSetId = readAppStoreConnectId(
      input.gameCenterMatchmakingRuleSetId,
      "gameCenterMatchmakingRuleSetId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterMatchmakingRuleSets", gameCenterMatchmakingRuleSetId),
      `Deleting the ${matchmakingRuleSetLabel}`,
    );
    return { id: gameCenterMatchmakingRuleSetId, deleted: true };
  },

  async list_game_center_matchmaking_rule_set_queues(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/gameCenterMatchmakingRuleSets",
        readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
        "matchmakingQueues",
      ),
      label: matchmakingQueueLabel,
      query: { include: queueInclude },
    });
    return {
      gameCenterMatchmakingQueues: page.resources.map((resource) => normalizeMatchmakingQueue(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_game_center_matchmaking_rule_set_rules(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterMatchmakingRuleSets",
        readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
        "rules",
      ),
      label: matchmakingRuleLabel,
    });
    return {
      gameCenterMatchmakingRules: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_game_center_matchmaking_rule_set_teams(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterMatchmakingRuleSets",
        readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
        "teams",
      ),
      label: matchmakingTeamLabel,
    });
    return {
      gameCenterMatchmakingTeams: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_matchmaking_rule(input, context) {
    return {
      gameCenterMatchmakingRule: await createResource(context, {
        path: "/v1/gameCenterMatchmakingRules",
        type: "gameCenterMatchmakingRules",
        label: matchmakingRuleLabel,
        attributes: {
          referenceName: requiredInputString(input.referenceName, "referenceName"),
          description: requiredInputString(input.description, "description"),
          type: requiredInputString(input.type, "type"),
          expression: requiredInputString(input.expression, "expression"),
          weight: optionalNumber(input.weight),
        },
        relationships: {
          ruleSet: toOneLinkage(
            "gameCenterMatchmakingRuleSets",
            readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
          ),
        },
      }),
    };
  },

  async update_game_center_matchmaking_rule(input, context) {
    const gameCenterMatchmakingRuleId = readAppStoreConnectId(
      input.gameCenterMatchmakingRuleId,
      "gameCenterMatchmakingRuleId",
    );

    const attributes = {
      description: rawStringOrNull(input.description),
      expression: rawStringOrNull(input.expression),
      weight: input.weight === null ? null : optionalNumber(input.weight),
    };
    requireAnyAttribute(attributes, "at least one matchmaking rule field to update is required");
    return {
      gameCenterMatchmakingRule: await updateResource(context, {
        path: resourcePath("/v1/gameCenterMatchmakingRules", gameCenterMatchmakingRuleId),
        type: "gameCenterMatchmakingRules",
        id: gameCenterMatchmakingRuleId,
        label: matchmakingRuleLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_matchmaking_rule(input, context) {
    const gameCenterMatchmakingRuleId = readAppStoreConnectId(
      input.gameCenterMatchmakingRuleId,
      "gameCenterMatchmakingRuleId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterMatchmakingRules", gameCenterMatchmakingRuleId),
      `Deleting the ${matchmakingRuleLabel}`,
    );
    return { id: gameCenterMatchmakingRuleId, deleted: true };
  },

  async create_game_center_matchmaking_team(input, context) {
    return {
      gameCenterMatchmakingTeam: await createResource(context, {
        path: "/v1/gameCenterMatchmakingTeams",
        type: "gameCenterMatchmakingTeams",
        label: matchmakingTeamLabel,
        attributes: {
          referenceName: requiredInputString(input.referenceName, "referenceName"),
          minPlayers: optionalInteger(input.minPlayers),
          maxPlayers: optionalInteger(input.maxPlayers),
        },
        relationships: {
          ruleSet: toOneLinkage(
            "gameCenterMatchmakingRuleSets",
            readAppStoreConnectId(input.gameCenterMatchmakingRuleSetId, "gameCenterMatchmakingRuleSetId"),
          ),
        },
      }),
    };
  },

  async update_game_center_matchmaking_team(input, context) {
    const gameCenterMatchmakingTeamId = readAppStoreConnectId(
      input.gameCenterMatchmakingTeamId,
      "gameCenterMatchmakingTeamId",
    );

    const attributes = {
      minPlayers: input.minPlayers === null ? null : optionalInteger(input.minPlayers),
      maxPlayers: input.maxPlayers === null ? null : optionalInteger(input.maxPlayers),
    };
    requireAnyAttribute(attributes, "at least one matchmaking team field to update is required");
    return {
      gameCenterMatchmakingTeam: await updateResource(context, {
        path: resourcePath("/v1/gameCenterMatchmakingTeams", gameCenterMatchmakingTeamId),
        type: "gameCenterMatchmakingTeams",
        id: gameCenterMatchmakingTeamId,
        label: matchmakingTeamLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_matchmaking_team(input, context) {
    const gameCenterMatchmakingTeamId = readAppStoreConnectId(
      input.gameCenterMatchmakingTeamId,
      "gameCenterMatchmakingTeamId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterMatchmakingTeams", gameCenterMatchmakingTeamId),
      `Deleting the ${matchmakingTeamLabel}`,
    );
    return { id: gameCenterMatchmakingTeamId, deleted: true };
  },

  async test_game_center_matchmaking_rule_set(input, context) {
    const gameCenterMatchmakingRuleSetId = readAppStoreConnectId(
      input.gameCenterMatchmakingRuleSetId,
      "gameCenterMatchmakingRuleSetId",
    );

    const included: Array<Record<string, unknown>> = [];
    const requestIds = looseArray(input.requests).map((item, requestIndex) => {
      const request = recordOrEmpty(item);
      const playerPropertyIds = looseArray(request.playerProperties).map((entry, index) => {
        const playerProperty = recordOrEmpty(entry);
        const playerPropertyId = inlineTestPlayerPropertyId(requestIndex, index);
        const playerField = `requests[${requestIndex}].playerProperties[${index}]`;
        included.push({
          type: "gameCenterMatchmakingTestPlayerProperties",
          id: playerPropertyId,
          attributes: {
            playerId: requiredInputString(playerProperty.playerId, `${playerField}.playerId`),
            properties: looseArray(playerProperty.properties).map((value, propertyIndex) => {
              const property = recordOrEmpty(value);
              const field = `${playerField}.properties[${propertyIndex}]`;
              return {
                key: requiredInputString(property.key, `${field}.key`),
                value: requiredInputString(property.value, `${field}.value`),
              };
            }),
          },
        });
        return playerPropertyId;
      });
      const location = optionalRecord(request.location);
      const requestId = inlineTestRequestId(requestIndex);
      included.push(
        compactObject({
          type: "gameCenterMatchmakingTestRequests",
          id: requestId,
          attributes: compactObject({
            requestName: pickOptionalString(request, "requestName"),
            secondsInQueue: optionalInteger(request.secondsInQueue),
            locale: pickOptionalString(request, "locale"),
            location:
              location === undefined
                ? undefined
                : {
                    latitude: optionalNumber(location.latitude),
                    longitude: optionalNumber(location.longitude),
                  },
            minPlayers: optionalInteger(request.minPlayers),
            maxPlayers: optionalInteger(request.maxPlayers),
            playerCount: optionalInteger(request.playerCount),
            bundleId: pickOptionalString(request, "bundleId"),
            platform: pickOptionalString(request, "platform"),
            appVersion: pickOptionalString(request, "appVersion"),
          }),
          relationships:
            playerPropertyIds.length === 0
              ? undefined
              : {
                  matchmakingPlayerProperties: toManyLinkage(
                    "gameCenterMatchmakingTestPlayerProperties",
                    playerPropertyIds,
                  ),
                },
        }),
      );
      return requestId;
    });
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/gameCenterMatchmakingRuleSetTests",
      body: {
        data: {
          type: "gameCenterMatchmakingRuleSetTests",
          relationships: {
            matchmakingRuleSet: toOneLinkage("gameCenterMatchmakingRuleSets", gameCenterMatchmakingRuleSetId),
            matchmakingRequests: toManyLinkage("gameCenterMatchmakingTestRequests", requestIds),
          },
        },
        included,
      },
    });
    return {
      gameCenterMatchmakingRuleSetTest: normalizeResource(
        readResource(payload, matchmakingRuleSetTestLabel),
        matchmakingRuleSetTestLabel,
      ),
    };
  },

  async get_game_center_classic_matchmaking_request_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "metrics/classicMatchmakingRequests",
      ),
      readAppMatchmakingRequestQuery(input),
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_rule_based_matchmaking_request_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "metrics/ruleBasedMatchmakingRequests",
      ),
      readAppMatchmakingRequestQuery(input),
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_queue_request_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingQueues",
        readAppStoreConnectId(input.gameCenterMatchmakingQueueId, "gameCenterMatchmakingQueueId"),
        "metrics/matchmakingRequests",
      ),
      readQueueMatchmakingRequestQuery(input),
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_queue_size_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingQueues",
        readAppStoreConnectId(input.gameCenterMatchmakingQueueId, "gameCenterMatchmakingQueueId"),
        "metrics/matchmakingQueueSizes",
      ),
      {},
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_queue_session_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingQueues",
        readAppStoreConnectId(input.gameCenterMatchmakingQueueId, "gameCenterMatchmakingQueueId"),
        "metrics/matchmakingSessions",
      ),
      {},
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_queue_experiment_request_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingQueues",
        readAppStoreConnectId(input.gameCenterMatchmakingQueueId, "gameCenterMatchmakingQueueId"),
        "metrics/experimentMatchmakingRequests",
      ),
      readQueueMatchmakingRequestQuery(input),
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_queue_experiment_size_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingQueues",
        readAppStoreConnectId(input.gameCenterMatchmakingQueueId, "gameCenterMatchmakingQueueId"),
        "metrics/experimentMatchmakingQueueSizes",
      ),
      {},
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_rule_boolean_result_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingRules",
        readAppStoreConnectId(input.gameCenterMatchmakingRuleId, "gameCenterMatchmakingRuleId"),
        "metrics/matchmakingBooleanRuleResults",
      ),
      {
        ...readMatchmakingRuleQuery(input),

        "filter[result]": pickOptionalString(input, "result"),
      },
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_rule_number_result_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingRules",
        readAppStoreConnectId(input.gameCenterMatchmakingRuleId, "gameCenterMatchmakingRuleId"),
        "metrics/matchmakingNumberRuleResults",
      ),
      readMatchmakingRuleQuery(input),
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },

  async get_game_center_matchmaking_rule_error_metrics(input, context) {
    const page = await readMatchmakingMetrics(
      context,
      input,
      resourcePath(
        "/v1/gameCenterMatchmakingRules",
        readAppStoreConnectId(input.gameCenterMatchmakingRuleId, "gameCenterMatchmakingRuleId"),
        "metrics/matchmakingRuleErrors",
      ),
      readMatchmakingRuleQuery(input),
    );
    return { metrics: page.metrics, nextCursor: page.nextCursor, total: page.total };
  },
};
