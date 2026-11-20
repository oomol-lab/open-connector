import type { AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { booleanString, pickOptionalString } from "../../core/cast.ts";
import {
  getResource,
  indexIncludedResources,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readAppSummary,
  readBetaReviewSubmissionSummary,
  readIncludedResource,
  readPreReleaseVersionSummary,
  readResource,
  requestAppStoreConnect,
  resourcePath,
} from "./runtime-helpers.ts";

export const appStoreConnectAppsBuildsHandlers: AppStoreConnectHandlers = {
  async list_apps(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/apps",
      label: "App Store Connect app",
      query: {
        "filter[bundleId]": pickOptionalString(input, "bundleId"),
        "filter[name]": pickOptionalString(input, "name"),
        "filter[sku]": pickOptionalString(input, "sku"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { apps: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_app(input, context) {
    return {
      app: await getResource(
        context,
        resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId")),
        "App Store Connect app",
      ),
    };
  },

  async list_builds(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/builds",
      label: "App Store Connect build list",
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[version]": pickOptionalString(input, "version"),
        "filter[preReleaseVersion.version]": pickOptionalString(input, "preReleaseVersion"),
        "filter[preReleaseVersion.platform]": pickOptionalString(input, "platform"),
        "filter[processingState]": pickOptionalString(input, "processingState"),
        "filter[betaAppReviewSubmission.betaReviewState]": pickOptionalString(input, "betaReviewState"),
        "filter[expired]": booleanString(input.expired),
        "sort": pickOptionalString(input, "sort"),
        "include": "preReleaseVersion",
      },
    });
    return {
      builds: page.resources.map((resource) => ({
        ...normalizeResource(resource, "App Store Connect build"),
        preReleaseVersion: readPreReleaseVersionSummary(
          readIncludedResource(resource, "preReleaseVersion", page.included),
        ),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_build(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/builds", readAppStoreConnectId(input.buildId, "buildId")),
      query: { include: "preReleaseVersion,betaAppReviewSubmission,app" },
    });
    const resource = readResource(payload, "App Store Connect build");
    const included = indexIncludedResources(payload);
    return {
      build: {
        ...normalizeResource(resource, "App Store Connect build"),
        preReleaseVersion: readPreReleaseVersionSummary(readIncludedResource(resource, "preReleaseVersion", included)),
        betaAppReviewSubmission: readBetaReviewSubmissionSummary(
          readIncludedResource(resource, "betaAppReviewSubmission", included),
        ),
        app: readAppSummary(readIncludedResource(resource, "app", included)),
      },
    };
  },

  async list_pre_release_versions(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/preReleaseVersions",
      label: "App Store Connect prerelease version",
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[platform]": pickOptionalString(input, "platform"),
        "filter[version]": pickOptionalString(input, "version"),
        "sort": pickOptionalString(input, "sort"),
      },
    });
    return { preReleaseVersions: page.items, nextCursor: page.nextCursor, total: page.total };
  },
};
