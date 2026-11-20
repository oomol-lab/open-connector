import type { AppStoreConnectContext, AppStoreConnectHandlers } from "./runtime-helpers.ts";

import {
  rawStringOrNull,
  optionalInteger,
  optionalRecord,
  compactObject,
  optionalBoolean,
  booleanString,
  pickOptionalString,
} from "../../core/cast.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { normalizeAppStoreVersion } from "./runtime-app-store-versions.ts";
import {
  assertNoContent,
  createResource,
  deleteResource,
  getOptionalResource,
  getResource,
  listPage,
  listResources,
  modifyRelationship,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIdentifierList,
  readOptionalAppStoreConnectId,
  readOptionalIdentifierFilter,
  readOptionalRawResource,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  requireInputBoolean,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const detailLabel = "App Store Connect Game Center detail";
const groupLabel = "App Store Connect Game Center group";
const appVersionLabel = "App Store Connect Game Center app version";
const achievementLabel = "App Store Connect Game Center achievement";
const achievementVersionLabel = "App Store Connect Game Center achievement version";
const achievementLocalizationLabel = "App Store Connect Game Center achievement localization";
const achievementImageLabel = "App Store Connect Game Center achievement image";
const leaderboardLabel = "App Store Connect Game Center leaderboard";
const leaderboardVersionLabel = "App Store Connect Game Center leaderboard version";
const leaderboardLocalizationLabel = "App Store Connect Game Center leaderboard localization";
const leaderboardImageLabel = "App Store Connect Game Center leaderboard image";
const leaderboardSetLabel = "App Store Connect Game Center leaderboard set";
const leaderboardSetVersionLabel = "App Store Connect Game Center leaderboard set version";
const leaderboardSetLocalizationLabel = "App Store Connect Game Center leaderboard set localization";
const leaderboardSetImageLabel = "App Store Connect Game Center leaderboard set image";
const memberLocalizationLabel = "App Store Connect Game Center leaderboard set member localization";
const entrySubmissionLabel = "App Store Connect Game Center leaderboard entry submission";
const playerAchievementSubmissionLabel = "App Store Connect Game Center player achievement submission";

const detailInclude = "gameCenterGroup,defaultLeaderboardV2,defaultGroupLeaderboardV2";

const inlineAchievementVersionId = "${new-gameCenterAchievementVersion-id}";
const inlineLeaderboardVersionId = "${new-gameCenterLeaderboardVersion-id}";
const inlineLeaderboardSetVersionId = "${new-gameCenterLeaderboardSetVersion-id}";

export function normalizeGameCenterDetail(resource: Record<string, unknown>): Record<string, unknown> {
  const detail = normalizeResource(resource, detailLabel);
  delete detail.challengeEnabled;
  return {
    ...detail,
    gameCenterGroupId: readRelationshipId(resource, "gameCenterGroup"),
    defaultLeaderboardId: readRelationshipId(resource, "defaultLeaderboardV2"),
    defaultGroupLeaderboardId: readRelationshipId(resource, "defaultGroupLeaderboardV2"),
  };
}

export function normalizeGameCenterImage(resource: Record<string, unknown>, label: string): Record<string, unknown> {
  const image = normalizeResource(resource, label);
  delete image.uploadOperations;
  return image;
}

export async function getGameCenterImage(
  context: AppStoreConnectContext,
  path: string,
  label: string,
): Promise<Record<string, unknown> | null> {
  const { payload } = await requestAppStoreConnect(context, { path });
  const resource = readOptionalRawResource(payload, label);
  return resource === null ? null : normalizeGameCenterImage(resource, label);
}

export function readFreeFormProperties(value: unknown): Record<string, unknown> | null | undefined {
  return value === null ? null : optionalRecord(value);
}

async function readGameCenterDetail(
  context: AppStoreConnectContext,
  path: string,
): Promise<Record<string, unknown> | null> {
  const { payload } = await requestAppStoreConnect(context, {
    path,
    query: { include: detailInclude },
  });
  const resource = readOptionalRawResource(payload, detailLabel);
  return resource === null ? null : normalizeGameCenterDetail(resource);
}

function readPlayerSubmissionAttributes(input: Record<string, unknown>): Record<string, unknown> {
  return {
    bundleId: requiredInputString(input.bundleId, "bundleId"),
    vendorIdentifier: requiredInputString(input.vendorIdentifier, "vendorIdentifier"),
    scopedPlayerId: requiredInputString(input.scopedPlayerId, "scopedPlayerId"),
    challengeIds: readStringList(input.challengeIds),
    submittedDate: pickOptionalString(input, "submittedDate"),
    preReleased: optionalBoolean(input.preReleased),
  };
}

export const appStoreConnectGameCenterHandlers: AppStoreConnectHandlers = {
  async get_app_game_center_detail(input, context) {
    return {
      gameCenterDetail: await readGameCenterDetail(
        context,
        resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "gameCenterDetail"),
      ),
    };
  },

  async create_game_center_detail(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");

    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/gameCenterDetails",
      body: {
        data: {
          type: "gameCenterDetails",
          relationships: { app: toOneLinkage("apps", appId) },
        },
      },
    });
    return { gameCenterDetail: normalizeGameCenterDetail(readResource(payload, detailLabel)) };
  },

  async get_game_center_detail(input, context) {
    return {
      gameCenterDetail: await readGameCenterDetail(
        context,
        resourcePath("/v1/gameCenterDetails", readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId")),
      ),
    };
  },

  async update_game_center_detail(input, context) {
    const gameCenterDetailId = readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterGroupId = readOptionalAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const defaultLeaderboardId = readOptionalAppStoreConnectId(input.defaultLeaderboardId, "defaultLeaderboardId");
    const defaultGroupLeaderboardId = readOptionalAppStoreConnectId(
      input.defaultGroupLeaderboardId,
      "defaultGroupLeaderboardId",
    );
    requireAnyAttribute(
      { gameCenterGroupId, defaultLeaderboardId, defaultGroupLeaderboardId },
      "at least one Game Center detail field to update is required",
    );

    const { payload } = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterDetails", gameCenterDetailId),
      body: {
        data: {
          type: "gameCenterDetails",
          id: gameCenterDetailId,
          relationships: compactObject({
            gameCenterGroup: toOptionalOneLinkage("gameCenterGroups", gameCenterGroupId),
            defaultLeaderboardV2: toOptionalOneLinkage("gameCenterLeaderboards", defaultLeaderboardId),
            defaultGroupLeaderboardV2: toOptionalOneLinkage("gameCenterLeaderboards", defaultGroupLeaderboardId),
          }),
        },
      },
    });
    return { gameCenterDetail: normalizeGameCenterDetail(readResource(payload, detailLabel)) };
  },

  async get_game_center_detail_group(input, context) {
    return {
      gameCenterGroup: await getOptionalResource(
        context,
        resourcePath(
          "/v1/gameCenterDetails",
          readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
          "gameCenterGroup",
        ),
        groupLabel,
      ),
    };
  },

  async list_game_center_detail_achievements(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "gameCenterAchievementsV2",
      ),
      label: achievementLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[archived]": booleanString(input.archived),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterAchievementIds, "gameCenterAchievementIds"),
      },
    });
    return { gameCenterAchievements: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_game_center_detail_leaderboards(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "gameCenterLeaderboardsV2",
      ),
      label: leaderboardLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[archived]": booleanString(input.archived),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds"),
      },
    });
    return { gameCenterLeaderboards: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_game_center_detail_leaderboard_sets(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "gameCenterLeaderboardSetsV2",
      ),
      label: leaderboardSetLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterLeaderboardSetIds, "gameCenterLeaderboardSetIds"),
      },
    });
    return {
      gameCenterLeaderboardSets: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_game_center_detail_app_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterDetails",
        readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId"),
        "gameCenterAppVersions",
      ),
      label: appVersionLabel,
      query: { "filter[enabled]": booleanString(input.enabled) },
    });
    return { gameCenterAppVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async replace_game_center_detail_achievements(input, context) {
    const gameCenterDetailId = readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterAchievementIds = readIdentifierList(input.gameCenterAchievementIds, "gameCenterAchievementIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterDetails", gameCenterDetailId, "relationships/gameCenterAchievementsV2"),
      type: "gameCenterAchievements",
      ids: gameCenterAchievementIds,
      label: `Replacing the achievements of the ${detailLabel}`,
    });
    return { gameCenterDetailId, gameCenterAchievementIds, replaced: true };
  },

  async replace_game_center_detail_leaderboards(input, context) {
    const gameCenterDetailId = readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterDetails", gameCenterDetailId, "relationships/gameCenterLeaderboardsV2"),
      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Replacing the leaderboards of the ${detailLabel}`,
    });
    return { gameCenterDetailId, gameCenterLeaderboardIds, replaced: true };
  },

  async replace_game_center_detail_leaderboard_sets(input, context) {
    const gameCenterDetailId = readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterLeaderboardSetIds = readIdentifierList(
      input.gameCenterLeaderboardSetIds,
      "gameCenterLeaderboardSetIds",
    );
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterDetails", gameCenterDetailId, "relationships/gameCenterLeaderboardSetsV2"),
      type: "gameCenterLeaderboardSets",
      ids: gameCenterLeaderboardSetIds,
      label: `Replacing the leaderboard sets of the ${detailLabel}`,
    });
    return { gameCenterDetailId, gameCenterLeaderboardSetIds, replaced: true };
  },

  async replace_game_center_detail_challenges_minimum_platform_versions(input, context) {
    const gameCenterDetailId = readAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const appStoreVersionIds = readIdentifierList(input.appStoreVersionIds, "appStoreVersionIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath(
        "/v1/gameCenterDetails",
        gameCenterDetailId,
        "relationships/challengesMinimumPlatformVersions",
      ),
      type: "appStoreVersions",
      ids: appStoreVersionIds,
      label: `Replacing the challenge minimum platform versions of the ${detailLabel}`,
    });
    return { gameCenterDetailId, appStoreVersionIds, replaced: true };
  },

  async list_game_center_groups(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/gameCenterGroups",
      label: groupLabel,
      query: {
        "filter[gameCenterDetails]": readOptionalIdentifierFilter(input.gameCenterDetailIds, "gameCenterDetailIds"),
      },
    });
    return { gameCenterGroups: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async create_game_center_group(input, context) {
    return {
      gameCenterGroup: await createResource(context, {
        path: "/v1/gameCenterGroups",
        type: "gameCenterGroups",
        label: groupLabel,
        attributes: { referenceName: pickOptionalString(input, "referenceName") },
      }),
    };
  },

  async get_game_center_group(input, context) {
    return {
      gameCenterGroup: await getResource(
        context,
        resourcePath("/v1/gameCenterGroups", readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId")),
        groupLabel,
      ),
    };
  },

  async update_game_center_group(input, context) {
    const gameCenterGroupId = readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const attributes = { referenceName: rawStringOrNull(input.referenceName) };
    requireAnyAttribute(attributes, "at least one Game Center group field to update is required");
    return {
      gameCenterGroup: await updateResource(context, {
        path: resourcePath("/v1/gameCenterGroups", gameCenterGroupId),
        type: "gameCenterGroups",
        id: gameCenterGroupId,
        label: groupLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_group(input, context) {
    const gameCenterGroupId = readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterGroups", gameCenterGroupId),
      `Deleting the ${groupLabel}`,
    );
    return { id: gameCenterGroupId, deleted: true };
  },

  async list_game_center_group_details(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/gameCenterGroups",
        readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
        "gameCenterDetails",
      ),
      label: `${detailLabel} list`,
      query: {
        "filter[gameCenterAppVersions.enabled]": booleanString(input.appVersionsEnabled),
        "include": detailInclude,
      },
    });
    return {
      gameCenterDetails: page.resources.map((resource) => normalizeGameCenterDetail(resource)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async list_game_center_group_achievements(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterGroups",
        readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
        "gameCenterAchievementsV2",
      ),
      label: achievementLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[archived]": booleanString(input.archived),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterAchievementIds, "gameCenterAchievementIds"),
      },
    });
    return { gameCenterAchievements: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_game_center_group_leaderboards(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterGroups",
        readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
        "gameCenterLeaderboardsV2",
      ),
      label: leaderboardLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[archived]": booleanString(input.archived),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds"),
      },
    });
    return { gameCenterLeaderboards: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async list_game_center_group_leaderboard_sets(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterGroups",
        readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId"),
        "gameCenterLeaderboardSetsV2",
      ),
      label: leaderboardSetLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterLeaderboardSetIds, "gameCenterLeaderboardSetIds"),
      },
    });
    return {
      gameCenterLeaderboardSets: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async replace_game_center_group_achievements(input, context) {
    const gameCenterGroupId = readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const gameCenterAchievementIds = readIdentifierList(input.gameCenterAchievementIds, "gameCenterAchievementIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterGroups", gameCenterGroupId, "relationships/gameCenterAchievementsV2"),

      type: "gameCenterAchievements",
      ids: gameCenterAchievementIds,
      label: `Replacing the achievements of the ${groupLabel}`,
    });
    return { gameCenterGroupId, gameCenterAchievementIds, replaced: true };
  },

  async replace_game_center_group_leaderboards(input, context) {
    const gameCenterGroupId = readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterGroups", gameCenterGroupId, "relationships/gameCenterLeaderboardsV2"),

      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Replacing the leaderboards of the ${groupLabel}`,
    });
    return { gameCenterGroupId, gameCenterLeaderboardIds, replaced: true };
  },

  async replace_game_center_group_leaderboard_sets(input, context) {
    const gameCenterGroupId = readAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const gameCenterLeaderboardSetIds = readIdentifierList(
      input.gameCenterLeaderboardSetIds,
      "gameCenterLeaderboardSetIds",
    );
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath("/v1/gameCenterGroups", gameCenterGroupId, "relationships/gameCenterLeaderboardSetsV2"),

      type: "gameCenterLeaderboardSets",
      ids: gameCenterLeaderboardSetIds,
      label: `Replacing the leaderboard sets of the ${groupLabel}`,
    });
    return { gameCenterGroupId, gameCenterLeaderboardSetIds, replaced: true };
  },

  async create_game_center_app_version(input, context) {
    return {
      gameCenterAppVersion: await createResource(context, {
        path: "/v1/gameCenterAppVersions",
        type: "gameCenterAppVersions",
        label: appVersionLabel,
        relationships: {
          appStoreVersion: toOneLinkage(
            "appStoreVersions",
            readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
          ),
        },
      }),
    };
  },

  async get_game_center_app_version(input, context) {
    return {
      gameCenterAppVersion: await getResource(
        context,
        resourcePath(
          "/v1/gameCenterAppVersions",
          readAppStoreConnectId(input.gameCenterAppVersionId, "gameCenterAppVersionId"),
        ),
        appVersionLabel,
      ),
    };
  },

  async update_game_center_app_version(input, context) {
    const gameCenterAppVersionId = readAppStoreConnectId(input.gameCenterAppVersionId, "gameCenterAppVersionId");
    const attributes = { enabled: optionalBoolean(input.enabled) };
    requireAnyAttribute(attributes, "at least one Game Center app version field to update is required");
    return {
      gameCenterAppVersion: await updateResource(context, {
        path: resourcePath("/v1/gameCenterAppVersions", gameCenterAppVersionId),
        type: "gameCenterAppVersions",
        id: gameCenterAppVersionId,
        label: appVersionLabel,
        attributes,
      }),
    };
  },

  async get_game_center_app_version_app_store_version(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/gameCenterAppVersions",
        readAppStoreConnectId(input.gameCenterAppVersionId, "gameCenterAppVersionId"),
        "appStoreVersion",
      ),
    });

    return {
      appStoreVersion: normalizeAppStoreVersion(readResource(payload, "App Store Connect version")),
    };
  },

  async list_game_center_app_version_compatibility_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/gameCenterAppVersions",
        readAppStoreConnectId(input.gameCenterAppVersionId, "gameCenterAppVersionId"),
        "compatibilityVersions",
      ),
      label: appVersionLabel,
      query: { "filter[enabled]": booleanString(input.enabled) },
    });
    return { gameCenterAppVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async add_compatibility_versions_to_game_center_app_version(input, context) {
    const gameCenterAppVersionId = readAppStoreConnectId(input.gameCenterAppVersionId, "gameCenterAppVersionId");
    const compatibilityVersionIds = readIdentifierList(input.compatibilityVersionIds, "compatibilityVersionIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/gameCenterAppVersions", gameCenterAppVersionId, "relationships/compatibilityVersions"),
      type: "gameCenterAppVersions",
      ids: compatibilityVersionIds,
      label: `Adding compatible versions to the ${appVersionLabel}`,
    });
    return { gameCenterAppVersionId, compatibilityVersionIds, added: true };
  },

  async remove_compatibility_versions_from_game_center_app_version(input, context) {
    const gameCenterAppVersionId = readAppStoreConnectId(input.gameCenterAppVersionId, "gameCenterAppVersionId");
    const compatibilityVersionIds = readIdentifierList(input.compatibilityVersionIds, "compatibilityVersionIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/gameCenterAppVersions", gameCenterAppVersionId, "relationships/compatibilityVersions"),
      type: "gameCenterAppVersions",
      ids: compatibilityVersionIds,
      label: `Removing compatible versions from the ${appVersionLabel}`,
    });
    return { gameCenterAppVersionId, compatibilityVersionIds, removed: true };
  },

  async get_app_store_version_game_center_app_version(input, context) {
    return {
      gameCenterAppVersion: await getOptionalResource(
        context,
        resourcePath(
          "/v1/appStoreVersions",
          readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
          "gameCenterAppVersion",
        ),
        appVersionLabel,
      ),
    };
  },

  async submit_game_center_leaderboard_entry(input, context) {
    return {
      gameCenterLeaderboardEntry: await createResource(context, {
        path: "/v1/gameCenterLeaderboardEntrySubmissions",
        type: "gameCenterLeaderboardEntrySubmissions",
        label: entrySubmissionLabel,
        attributes: {
          ...readPlayerSubmissionAttributes(input),

          score: requiredInputString(input.score, "score"),
          context: pickOptionalString(input, "context"),
        },
      }),
    };
  },

  async submit_game_center_player_achievement(input, context) {
    return {
      gameCenterPlayerAchievement: await createResource(context, {
        path: "/v1/gameCenterPlayerAchievementSubmissions",
        type: "gameCenterPlayerAchievementSubmissions",
        label: playerAchievementSubmissionLabel,
        attributes: {
          ...readPlayerSubmissionAttributes(input),
          percentageAchieved: optionalInteger(input.percentageAchieved),
        },
      }),
    };
  },

  async create_game_center_achievement(input, context) {
    const gameCenterDetailId = readOptionalAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterGroupId = readOptionalAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v2/gameCenterAchievements",
      body: {
        data: {
          type: "gameCenterAchievements",
          attributes: compactObject({
            referenceName: requiredInputString(input.referenceName, "referenceName"),
            vendorIdentifier: requiredInputString(input.vendorIdentifier, "vendorIdentifier"),
            points: optionalInteger(input.points),
            showBeforeEarned: requireInputBoolean(input.showBeforeEarned, "showBeforeEarned"),
            repeatable: requireInputBoolean(input.repeatable, "repeatable"),
            activityProperties: optionalRecord(input.activityProperties),
          }),
          relationships: compactObject({
            gameCenterDetail: toOptionalOneLinkage("gameCenterDetails", gameCenterDetailId),
            gameCenterGroup: toOptionalOneLinkage("gameCenterGroups", gameCenterGroupId),

            versions: toManyLinkage("gameCenterAchievementVersions", [inlineAchievementVersionId]),
          }),
        },
        included: [{ type: "gameCenterAchievementVersions", id: inlineAchievementVersionId }],
      },
    });
    return {
      gameCenterAchievement: normalizeResource(readResource(payload, achievementLabel), achievementLabel),
    };
  },

  async get_game_center_achievement(input, context) {
    return {
      gameCenterAchievement: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterAchievements",
          readAppStoreConnectId(input.gameCenterAchievementId, "gameCenterAchievementId"),
        ),
        achievementLabel,
      ),
    };
  },

  async update_game_center_achievement(input, context) {
    const gameCenterAchievementId = readAppStoreConnectId(input.gameCenterAchievementId, "gameCenterAchievementId");
    const attributes = {
      referenceName: rawStringOrNull(input.referenceName),
      points: input.points === null ? null : optionalInteger(input.points),
      showBeforeEarned: optionalBoolean(input.showBeforeEarned),
      repeatable: optionalBoolean(input.repeatable),
      archived: optionalBoolean(input.archived),
      activityProperties: readFreeFormProperties(input.activityProperties),
    };
    requireAnyAttribute(attributes, "at least one Game Center achievement field to update is required");
    return {
      gameCenterAchievement: await updateResource(context, {
        path: resourcePath("/v2/gameCenterAchievements", gameCenterAchievementId),
        type: "gameCenterAchievements",
        id: gameCenterAchievementId,
        label: achievementLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_achievement(input, context) {
    const gameCenterAchievementId = readAppStoreConnectId(input.gameCenterAchievementId, "gameCenterAchievementId");
    await deleteResource(
      context,
      resourcePath("/v2/gameCenterAchievements", gameCenterAchievementId),
      `Deleting the ${achievementLabel}`,
    );
    return { id: gameCenterAchievementId, deleted: true };
  },

  async list_game_center_achievement_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterAchievements",
        readAppStoreConnectId(input.gameCenterAchievementId, "gameCenterAchievementId"),
        "versions",
      ),
      label: achievementVersionLabel,
    });
    return {
      gameCenterAchievementVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async set_game_center_achievement_activity(input, context) {
    const gameCenterAchievementId = readAppStoreConnectId(input.gameCenterAchievementId, "gameCenterAchievementId");
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");

    const response = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v2/gameCenterAchievements", gameCenterAchievementId, "relationships/activity"),
      body: toOneLinkage("gameCenterActivities", gameCenterActivityId),
    });
    assertNoContent(response, [204], `Setting the activity of the ${achievementLabel}`);
    return { gameCenterAchievementId, gameCenterActivityId, updated: true };
  },

  async create_game_center_achievement_version(input, context) {
    return {
      gameCenterAchievementVersion: await createResource(context, {
        path: "/v2/gameCenterAchievementVersions",
        type: "gameCenterAchievementVersions",
        label: achievementVersionLabel,
        relationships: {
          achievement: toOneLinkage(
            "gameCenterAchievements",
            readAppStoreConnectId(input.gameCenterAchievementId, "gameCenterAchievementId"),
          ),
        },
      }),
    };
  },

  async get_game_center_achievement_version(input, context) {
    return {
      gameCenterAchievementVersion: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterAchievementVersions",
          readAppStoreConnectId(input.gameCenterAchievementVersionId, "gameCenterAchievementVersionId"),
        ),
        achievementVersionLabel,
      ),
    };
  },

  async list_game_center_achievement_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterAchievementVersions",
        readAppStoreConnectId(input.gameCenterAchievementVersionId, "gameCenterAchievementVersionId"),
        "localizations",
      ),
      label: achievementLocalizationLabel,
    });
    return {
      gameCenterAchievementLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_achievement_localization(input, context) {
    return {
      gameCenterAchievementLocalization: await createResource(context, {
        path: "/v2/gameCenterAchievementLocalizations",
        type: "gameCenterAchievementLocalizations",
        label: achievementLocalizationLabel,
        attributes: {
          locale: requiredInputString(input.locale, "locale"),
          name: requiredInputString(input.name, "name"),
          beforeEarnedDescription: requiredInputString(input.beforeEarnedDescription, "beforeEarnedDescription"),
          afterEarnedDescription: requiredInputString(input.afterEarnedDescription, "afterEarnedDescription"),
        },
        relationships: {
          version: toOneLinkage(
            "gameCenterAchievementVersions",
            readAppStoreConnectId(input.gameCenterAchievementVersionId, "gameCenterAchievementVersionId"),
          ),
        },
      }),
    };
  },

  async get_game_center_achievement_localization(input, context) {
    return {
      gameCenterAchievementLocalization: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterAchievementLocalizations",
          readAppStoreConnectId(input.gameCenterAchievementLocalizationId, "gameCenterAchievementLocalizationId"),
        ),
        achievementLocalizationLabel,
      ),
    };
  },

  async update_game_center_achievement_localization(input, context) {
    const gameCenterAchievementLocalizationId = readAppStoreConnectId(
      input.gameCenterAchievementLocalizationId,
      "gameCenterAchievementLocalizationId",
    );
    const attributes = {
      name: rawStringOrNull(input.name),
      beforeEarnedDescription: rawStringOrNull(input.beforeEarnedDescription),
      afterEarnedDescription: rawStringOrNull(input.afterEarnedDescription),
    };
    requireAnyAttribute(attributes, "at least one Game Center achievement localization field to update is required");
    return {
      gameCenterAchievementLocalization: await updateResource(context, {
        path: resourcePath("/v2/gameCenterAchievementLocalizations", gameCenterAchievementLocalizationId),
        type: "gameCenterAchievementLocalizations",
        id: gameCenterAchievementLocalizationId,
        label: achievementLocalizationLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_achievement_localization(input, context) {
    const gameCenterAchievementLocalizationId = readAppStoreConnectId(
      input.gameCenterAchievementLocalizationId,
      "gameCenterAchievementLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v2/gameCenterAchievementLocalizations", gameCenterAchievementLocalizationId),
      `Deleting the ${achievementLocalizationLabel}`,
    );
    return { id: gameCenterAchievementLocalizationId, deleted: true };
  },

  async get_game_center_achievement_localization_image(input, context) {
    return {
      gameCenterAchievementImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v2/gameCenterAchievementLocalizations",
          readAppStoreConnectId(input.gameCenterAchievementLocalizationId, "gameCenterAchievementLocalizationId"),
          "image",
        ),
        achievementImageLabel,
      ),
    };
  },

  async create_game_center_leaderboard(input, context) {
    const gameCenterDetailId = readOptionalAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterGroupId = readOptionalAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");
    const gameCenterLeaderboardSetIds =
      input.gameCenterLeaderboardSetIds === undefined
        ? undefined
        : readIdentifierList(input.gameCenterLeaderboardSetIds, "gameCenterLeaderboardSetIds");
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v2/gameCenterLeaderboards",
      body: {
        data: {
          type: "gameCenterLeaderboards",
          attributes: compactObject({
            referenceName: requiredInputString(input.referenceName, "referenceName"),
            vendorIdentifier: requiredInputString(input.vendorIdentifier, "vendorIdentifier"),
            defaultFormatter: requiredInputString(input.defaultFormatter, "defaultFormatter"),
            submissionType: requiredInputString(input.submissionType, "submissionType"),
            scoreSortType: requiredInputString(input.scoreSortType, "scoreSortType"),
            scoreRangeStart: pickOptionalString(input, "scoreRangeStart"),
            scoreRangeEnd: pickOptionalString(input, "scoreRangeEnd"),
            recurrenceStartDate: pickOptionalString(input, "recurrenceStartDate"),
            recurrenceDuration: pickOptionalString(input, "recurrenceDuration"),
            recurrenceRule: pickOptionalString(input, "recurrenceRule"),
            activityProperties: optionalRecord(input.activityProperties),
            visibility: pickOptionalString(input, "visibility"),
          }),
          relationships: compactObject({
            gameCenterDetail: toOptionalOneLinkage("gameCenterDetails", gameCenterDetailId),
            gameCenterGroup: toOptionalOneLinkage("gameCenterGroups", gameCenterGroupId),
            gameCenterLeaderboardSets:
              gameCenterLeaderboardSetIds === undefined
                ? undefined
                : toManyLinkage("gameCenterLeaderboardSets", gameCenterLeaderboardSetIds),

            versions: toManyLinkage("gameCenterLeaderboardVersions", [inlineLeaderboardVersionId]),
          }),
        },
        included: [{ type: "gameCenterLeaderboardVersions", id: inlineLeaderboardVersionId }],
      },
    });
    return {
      gameCenterLeaderboard: normalizeResource(readResource(payload, leaderboardLabel), leaderboardLabel),
    };
  },

  async get_game_center_leaderboard(input, context) {
    return {
      gameCenterLeaderboard: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboards",
          readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId"),
        ),
        leaderboardLabel,
      ),
    };
  },

  async update_game_center_leaderboard(input, context) {
    const gameCenterLeaderboardId = readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId");

    const attributes = {
      referenceName: rawStringOrNull(input.referenceName),
      defaultFormatter: rawStringOrNull(input.defaultFormatter),
      submissionType: rawStringOrNull(input.submissionType),
      scoreSortType: rawStringOrNull(input.scoreSortType),
      scoreRangeStart: rawStringOrNull(input.scoreRangeStart),
      scoreRangeEnd: rawStringOrNull(input.scoreRangeEnd),
      recurrenceStartDate: rawStringOrNull(input.recurrenceStartDate),
      recurrenceDuration: rawStringOrNull(input.recurrenceDuration),
      recurrenceRule: rawStringOrNull(input.recurrenceRule),
      archived: optionalBoolean(input.archived),
      activityProperties: readFreeFormProperties(input.activityProperties),
      visibility: rawStringOrNull(input.visibility),
    };
    requireAnyAttribute(attributes, "at least one Game Center leaderboard field to update is required");
    return {
      gameCenterLeaderboard: await updateResource(context, {
        path: resourcePath("/v2/gameCenterLeaderboards", gameCenterLeaderboardId),
        type: "gameCenterLeaderboards",
        id: gameCenterLeaderboardId,
        label: leaderboardLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_leaderboard(input, context) {
    const gameCenterLeaderboardId = readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId");
    await deleteResource(
      context,
      resourcePath("/v2/gameCenterLeaderboards", gameCenterLeaderboardId),
      `Deleting the ${leaderboardLabel}`,
    );
    return { id: gameCenterLeaderboardId, deleted: true };
  },

  async list_game_center_leaderboard_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterLeaderboards",
        readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId"),
        "versions",
      ),
      label: leaderboardVersionLabel,
    });
    return {
      gameCenterLeaderboardVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async set_game_center_leaderboard_activity(input, context) {
    const gameCenterLeaderboardId = readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId");
    const gameCenterActivityId = readAppStoreConnectId(input.gameCenterActivityId, "gameCenterActivityId");

    const response = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v2/gameCenterLeaderboards", gameCenterLeaderboardId, "relationships/activity"),
      body: toOneLinkage("gameCenterActivities", gameCenterActivityId),
    });
    assertNoContent(response, [204], `Setting the activity of the ${leaderboardLabel}`);
    return { gameCenterLeaderboardId, gameCenterActivityId, updated: true };
  },

  async set_game_center_leaderboard_challenge(input, context) {
    const gameCenterLeaderboardId = readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId");
    const gameCenterChallengeId = readAppStoreConnectId(input.gameCenterChallengeId, "gameCenterChallengeId");
    const response = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v2/gameCenterLeaderboards", gameCenterLeaderboardId, "relationships/challenge"),
      body: toOneLinkage("gameCenterChallenges", gameCenterChallengeId),
    });
    assertNoContent(response, [204], `Setting the challenge of the ${leaderboardLabel}`);
    return { gameCenterLeaderboardId, gameCenterChallengeId, updated: true };
  },

  async create_game_center_leaderboard_version(input, context) {
    return {
      gameCenterLeaderboardVersion: await createResource(context, {
        path: "/v2/gameCenterLeaderboardVersions",
        type: "gameCenterLeaderboardVersions",
        label: leaderboardVersionLabel,
        relationships: {
          leaderboard: toOneLinkage(
            "gameCenterLeaderboards",
            readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId"),
          ),
        },
      }),
    };
  },

  async get_game_center_leaderboard_version(input, context) {
    return {
      gameCenterLeaderboardVersion: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardVersions",
          readAppStoreConnectId(input.gameCenterLeaderboardVersionId, "gameCenterLeaderboardVersionId"),
        ),
        leaderboardVersionLabel,
      ),
    };
  },

  async list_game_center_leaderboard_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterLeaderboardVersions",
        readAppStoreConnectId(input.gameCenterLeaderboardVersionId, "gameCenterLeaderboardVersionId"),
        "localizations",
      ),
      label: leaderboardLocalizationLabel,
    });
    return {
      gameCenterLeaderboardLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_leaderboard_localization(input, context) {
    return {
      gameCenterLeaderboardLocalization: await createResource(context, {
        path: "/v2/gameCenterLeaderboardLocalizations",
        type: "gameCenterLeaderboardLocalizations",
        label: leaderboardLocalizationLabel,
        attributes: {
          locale: requiredInputString(input.locale, "locale"),
          name: requiredInputString(input.name, "name"),
          formatterOverride: pickOptionalString(input, "formatterOverride"),
          formatterSuffix: pickOptionalString(input, "formatterSuffix"),
          formatterSuffixSingular: pickOptionalString(input, "formatterSuffixSingular"),
          description: pickOptionalString(input, "description"),
        },
        relationships: {
          version: toOneLinkage(
            "gameCenterLeaderboardVersions",
            readAppStoreConnectId(input.gameCenterLeaderboardVersionId, "gameCenterLeaderboardVersionId"),
          ),
        },
      }),
    };
  },

  async get_game_center_leaderboard_localization(input, context) {
    return {
      gameCenterLeaderboardLocalization: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardLocalizations",
          readAppStoreConnectId(input.gameCenterLeaderboardLocalizationId, "gameCenterLeaderboardLocalizationId"),
        ),
        leaderboardLocalizationLabel,
      ),
    };
  },

  async update_game_center_leaderboard_localization(input, context) {
    const gameCenterLeaderboardLocalizationId = readAppStoreConnectId(
      input.gameCenterLeaderboardLocalizationId,
      "gameCenterLeaderboardLocalizationId",
    );

    const attributes = {
      name: rawStringOrNull(input.name),
      formatterOverride: rawStringOrNull(input.formatterOverride),
      formatterSuffix: rawStringOrNull(input.formatterSuffix),
      formatterSuffixSingular: rawStringOrNull(input.formatterSuffixSingular),
      description: rawStringOrNull(input.description),
    };
    requireAnyAttribute(attributes, "at least one Game Center leaderboard localization field to update is required");
    return {
      gameCenterLeaderboardLocalization: await updateResource(context, {
        path: resourcePath("/v2/gameCenterLeaderboardLocalizations", gameCenterLeaderboardLocalizationId),
        type: "gameCenterLeaderboardLocalizations",
        id: gameCenterLeaderboardLocalizationId,
        label: leaderboardLocalizationLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_leaderboard_localization(input, context) {
    const gameCenterLeaderboardLocalizationId = readAppStoreConnectId(
      input.gameCenterLeaderboardLocalizationId,
      "gameCenterLeaderboardLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v2/gameCenterLeaderboardLocalizations", gameCenterLeaderboardLocalizationId),
      `Deleting the ${leaderboardLocalizationLabel}`,
    );
    return { id: gameCenterLeaderboardLocalizationId, deleted: true };
  },

  async get_game_center_leaderboard_localization_image(input, context) {
    return {
      gameCenterLeaderboardImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardLocalizations",
          readAppStoreConnectId(input.gameCenterLeaderboardLocalizationId, "gameCenterLeaderboardLocalizationId"),
          "image",
        ),
        leaderboardImageLabel,
      ),
    };
  },

  async create_game_center_leaderboard_set(input, context) {
    const gameCenterDetailId = readOptionalAppStoreConnectId(input.gameCenterDetailId, "gameCenterDetailId");
    const gameCenterGroupId = readOptionalAppStoreConnectId(input.gameCenterGroupId, "gameCenterGroupId");

    const gameCenterLeaderboardIds =
      input.gameCenterLeaderboardIds === undefined
        ? undefined
        : readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v2/gameCenterLeaderboardSets",
      body: {
        data: {
          type: "gameCenterLeaderboardSets",
          attributes: {
            referenceName: requiredInputString(input.referenceName, "referenceName"),
            vendorIdentifier: requiredInputString(input.vendorIdentifier, "vendorIdentifier"),
          },
          relationships: compactObject({
            gameCenterDetail: toOptionalOneLinkage("gameCenterDetails", gameCenterDetailId),
            gameCenterGroup: toOptionalOneLinkage("gameCenterGroups", gameCenterGroupId),
            gameCenterLeaderboards:
              gameCenterLeaderboardIds === undefined
                ? undefined
                : toManyLinkage("gameCenterLeaderboards", gameCenterLeaderboardIds),

            versions: toManyLinkage("gameCenterLeaderboardSetVersions", [inlineLeaderboardSetVersionId]),
          }),
        },
        included: [{ type: "gameCenterLeaderboardSetVersions", id: inlineLeaderboardSetVersionId }],
      },
    });
    return {
      gameCenterLeaderboardSet: normalizeResource(readResource(payload, leaderboardSetLabel), leaderboardSetLabel),
    };
  },

  async get_game_center_leaderboard_set(input, context) {
    return {
      gameCenterLeaderboardSet: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardSets",
          readAppStoreConnectId(input.gameCenterLeaderboardSetId, "gameCenterLeaderboardSetId"),
        ),
        leaderboardSetLabel,
      ),
    };
  },

  async update_game_center_leaderboard_set(input, context) {
    const gameCenterLeaderboardSetId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetId,
      "gameCenterLeaderboardSetId",
    );

    const attributes = { referenceName: rawStringOrNull(input.referenceName) };
    requireAnyAttribute(attributes, "referenceName is required");
    return {
      gameCenterLeaderboardSet: await updateResource(context, {
        path: resourcePath("/v2/gameCenterLeaderboardSets", gameCenterLeaderboardSetId),
        type: "gameCenterLeaderboardSets",
        id: gameCenterLeaderboardSetId,
        label: leaderboardSetLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_leaderboard_set(input, context) {
    const gameCenterLeaderboardSetId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetId,
      "gameCenterLeaderboardSetId",
    );
    await deleteResource(
      context,
      resourcePath("/v2/gameCenterLeaderboardSets", gameCenterLeaderboardSetId),
      `Deleting the ${leaderboardSetLabel}`,
    );
    return { id: gameCenterLeaderboardSetId, deleted: true };
  },

  async list_game_center_leaderboard_set_leaderboards(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterLeaderboardSets",
        readAppStoreConnectId(input.gameCenterLeaderboardSetId, "gameCenterLeaderboardSetId"),
        "gameCenterLeaderboards",
      ),
      label: leaderboardLabel,
      query: {
        "filter[referenceName]": readCommaSeparatedList(input.referenceNames),
        "filter[archived]": booleanString(input.archived),
        "filter[id]": readOptionalIdentifierFilter(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds"),
      },
    });
    return { gameCenterLeaderboards: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async add_leaderboards_to_game_center_leaderboard_set(input, context) {
    const gameCenterLeaderboardSetId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetId,
      "gameCenterLeaderboardSetId",
    );
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath(
        "/v2/gameCenterLeaderboardSets",
        gameCenterLeaderboardSetId,
        "relationships/gameCenterLeaderboards",
      ),
      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Adding leaderboards to the ${leaderboardSetLabel}`,
    });
    return { gameCenterLeaderboardSetId, gameCenterLeaderboardIds, added: true };
  },

  async replace_game_center_leaderboard_set_leaderboards(input, context) {
    const gameCenterLeaderboardSetId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetId,
      "gameCenterLeaderboardSetId",
    );
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    await modifyRelationship(context, {
      method: "PATCH",
      path: resourcePath(
        "/v2/gameCenterLeaderboardSets",
        gameCenterLeaderboardSetId,
        "relationships/gameCenterLeaderboards",
      ),
      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Replacing the leaderboards of the ${leaderboardSetLabel}`,
    });
    return { gameCenterLeaderboardSetId, gameCenterLeaderboardIds, replaced: true };
  },

  async remove_leaderboards_from_game_center_leaderboard_set(input, context) {
    const gameCenterLeaderboardSetId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetId,
      "gameCenterLeaderboardSetId",
    );
    const gameCenterLeaderboardIds = readIdentifierList(input.gameCenterLeaderboardIds, "gameCenterLeaderboardIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath(
        "/v2/gameCenterLeaderboardSets",
        gameCenterLeaderboardSetId,
        "relationships/gameCenterLeaderboards",
      ),
      type: "gameCenterLeaderboards",
      ids: gameCenterLeaderboardIds,
      label: `Removing leaderboards from the ${leaderboardSetLabel}`,
    });
    return { gameCenterLeaderboardSetId, gameCenterLeaderboardIds, removed: true };
  },

  async list_game_center_leaderboard_set_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterLeaderboardSets",
        readAppStoreConnectId(input.gameCenterLeaderboardSetId, "gameCenterLeaderboardSetId"),
        "versions",
      ),
      label: leaderboardSetVersionLabel,
    });
    return {
      gameCenterLeaderboardSetVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_leaderboard_set_version(input, context) {
    return {
      gameCenterLeaderboardSetVersion: await createResource(context, {
        path: "/v2/gameCenterLeaderboardSetVersions",
        type: "gameCenterLeaderboardSetVersions",
        label: leaderboardSetVersionLabel,
        relationships: {
          leaderboardSet: toOneLinkage(
            "gameCenterLeaderboardSets",
            readAppStoreConnectId(input.gameCenterLeaderboardSetId, "gameCenterLeaderboardSetId"),
          ),
        },
      }),
    };
  },

  async get_game_center_leaderboard_set_version(input, context) {
    return {
      gameCenterLeaderboardSetVersion: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardSetVersions",
          readAppStoreConnectId(input.gameCenterLeaderboardSetVersionId, "gameCenterLeaderboardSetVersionId"),
        ),
        leaderboardSetVersionLabel,
      ),
    };
  },

  async list_game_center_leaderboard_set_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v2/gameCenterLeaderboardSetVersions",
        readAppStoreConnectId(input.gameCenterLeaderboardSetVersionId, "gameCenterLeaderboardSetVersionId"),
        "localizations",
      ),
      label: leaderboardSetLocalizationLabel,
    });
    return {
      gameCenterLeaderboardSetLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_leaderboard_set_localization(input, context) {
    return {
      gameCenterLeaderboardSetLocalization: await createResource(context, {
        path: "/v2/gameCenterLeaderboardSetLocalizations",
        type: "gameCenterLeaderboardSetLocalizations",
        label: leaderboardSetLocalizationLabel,
        attributes: {
          locale: requiredInputString(input.locale, "locale"),
          name: requiredInputString(input.name, "name"),
        },
        relationships: {
          version: toOneLinkage(
            "gameCenterLeaderboardSetVersions",
            readAppStoreConnectId(input.gameCenterLeaderboardSetVersionId, "gameCenterLeaderboardSetVersionId"),
          ),
        },
      }),
    };
  },

  async get_game_center_leaderboard_set_localization(input, context) {
    return {
      gameCenterLeaderboardSetLocalization: await getResource(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardSetLocalizations",
          readAppStoreConnectId(input.gameCenterLeaderboardSetLocalizationId, "gameCenterLeaderboardSetLocalizationId"),
        ),
        leaderboardSetLocalizationLabel,
      ),
    };
  },

  async update_game_center_leaderboard_set_localization(input, context) {
    const gameCenterLeaderboardSetLocalizationId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetLocalizationId,
      "gameCenterLeaderboardSetLocalizationId",
    );

    const attributes = { name: rawStringOrNull(input.name) };
    requireAnyAttribute(attributes, "name is required");
    return {
      gameCenterLeaderboardSetLocalization: await updateResource(context, {
        path: resourcePath("/v2/gameCenterLeaderboardSetLocalizations", gameCenterLeaderboardSetLocalizationId),
        type: "gameCenterLeaderboardSetLocalizations",
        id: gameCenterLeaderboardSetLocalizationId,
        label: leaderboardSetLocalizationLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_leaderboard_set_localization(input, context) {
    const gameCenterLeaderboardSetLocalizationId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetLocalizationId,
      "gameCenterLeaderboardSetLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v2/gameCenterLeaderboardSetLocalizations", gameCenterLeaderboardSetLocalizationId),
      `Deleting the ${leaderboardSetLocalizationLabel}`,
    );
    return { id: gameCenterLeaderboardSetLocalizationId, deleted: true };
  },

  async get_game_center_leaderboard_set_localization_image(input, context) {
    return {
      gameCenterLeaderboardSetImage: await getGameCenterImage(
        context,
        resourcePath(
          "/v2/gameCenterLeaderboardSetLocalizations",
          readAppStoreConnectId(input.gameCenterLeaderboardSetLocalizationId, "gameCenterLeaderboardSetLocalizationId"),
          "image",
        ),
        leaderboardSetImageLabel,
      ),
    };
  },

  async list_game_center_leaderboard_set_member_localizations(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/gameCenterLeaderboardSetMemberLocalizations",
      label: memberLocalizationLabel,

      query: {
        "filter[gameCenterLeaderboardSet]": readAppStoreConnectId(
          input.gameCenterLeaderboardSetId,
          "gameCenterLeaderboardSetId",
        ),
        "filter[gameCenterLeaderboard]": readAppStoreConnectId(
          input.gameCenterLeaderboardId,
          "gameCenterLeaderboardId",
        ),
      },
    });
    return {
      gameCenterLeaderboardSetMemberLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async create_game_center_leaderboard_set_member_localization(input, context) {
    return {
      gameCenterLeaderboardSetMemberLocalization: await createResource(context, {
        path: "/v1/gameCenterLeaderboardSetMemberLocalizations",
        type: "gameCenterLeaderboardSetMemberLocalizations",
        label: memberLocalizationLabel,
        attributes: {
          locale: pickOptionalString(input, "locale"),
          name: pickOptionalString(input, "name"),
        },
        relationships: {
          gameCenterLeaderboardSet: toOneLinkage(
            "gameCenterLeaderboardSets",
            readAppStoreConnectId(input.gameCenterLeaderboardSetId, "gameCenterLeaderboardSetId"),
          ),
          gameCenterLeaderboard: toOneLinkage(
            "gameCenterLeaderboards",
            readAppStoreConnectId(input.gameCenterLeaderboardId, "gameCenterLeaderboardId"),
          ),
        },
      }),
    };
  },

  async update_game_center_leaderboard_set_member_localization(input, context) {
    const gameCenterLeaderboardSetMemberLocalizationId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetMemberLocalizationId,
      "gameCenterLeaderboardSetMemberLocalizationId",
    );

    const attributes = { name: rawStringOrNull(input.name) };
    requireAnyAttribute(attributes, "name is required");
    return {
      gameCenterLeaderboardSetMemberLocalization: await updateResource(context, {
        path: resourcePath(
          "/v1/gameCenterLeaderboardSetMemberLocalizations",
          gameCenterLeaderboardSetMemberLocalizationId,
        ),
        type: "gameCenterLeaderboardSetMemberLocalizations",
        id: gameCenterLeaderboardSetMemberLocalizationId,
        label: memberLocalizationLabel,
        attributes,
      }),
    };
  },

  async delete_game_center_leaderboard_set_member_localization(input, context) {
    const gameCenterLeaderboardSetMemberLocalizationId = readAppStoreConnectId(
      input.gameCenterLeaderboardSetMemberLocalizationId,
      "gameCenterLeaderboardSetMemberLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/gameCenterLeaderboardSetMemberLocalizations", gameCenterLeaderboardSetMemberLocalizationId),
      `Deleting the ${memberLocalizationLabel}`,
    );
    return { id: gameCenterLeaderboardSetMemberLocalizationId, deleted: true };
  },
};
