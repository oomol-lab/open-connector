import type {
  AppStoreConnectContext,
  AppStoreConnectHandlers,
  IncludedResources,
  ListRequest,
} from "./runtime-helpers.ts";

import {
  looseArray,
  recordOrEmpty,
  rawStringOrNull,
  compactObject,
  optionalBoolean,
  pickOptionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getOptionalResource,
  getResource,
  indexIncludedResources,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCollection,
  readCommaSeparatedList,
  readIncludedResource,
  readIncludedResources,
  readOptionalAppStoreConnectId,
  readResource,
  readResponseInteger,
  requestAppStoreConnect,
  resourcePath,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const localizationType = "betaAppClipInvocationLocalizations";
const localizationInclude = { include: localizationType, [`limit[${localizationType}]`]: "50" };
const betaTesterUsageValueKeys = ["crashCount", "sessionCount", "feedbackCount"];
const betaBuildUsageValueKeys = ["crashCount", "installCount", "sessionCount", "feedbackCount", "inviteCount"];

export const appStoreConnectTestFlightFeedbackHandlers: AppStoreConnectHandlers = {
  async list_beta_feedback_screenshot_submissions(input, context) {
    const page = await listFeedback(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "betaFeedbackScreenshotSubmissions"),
      label: "App Store Connect screenshot feedback submission",
    });
    return {
      betaFeedbackScreenshotSubmissions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_beta_feedback_screenshot_submission(input, context) {
    return {
      betaFeedbackScreenshotSubmission: await getFeedback(
        context,
        resourcePath(
          "/v1/betaFeedbackScreenshotSubmissions",
          readAppStoreConnectId(input.betaFeedbackScreenshotSubmissionId, "betaFeedbackScreenshotSubmissionId"),
        ),
        "App Store Connect screenshot feedback submission",
      ),
    };
  },

  async delete_beta_feedback_screenshot_submission(input, context) {
    const id = readAppStoreConnectId(input.betaFeedbackScreenshotSubmissionId, "betaFeedbackScreenshotSubmissionId");
    await deleteResource(
      context,
      resourcePath("/v1/betaFeedbackScreenshotSubmissions", id),
      "Deleting the App Store Connect screenshot feedback submission",
    );
    return { id, deleted: true };
  },

  async list_beta_feedback_crash_submissions(input, context) {
    const page = await listFeedback(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "betaFeedbackCrashSubmissions"),
      label: "App Store Connect crash feedback submission",
    });
    return {
      betaFeedbackCrashSubmissions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_beta_feedback_crash_submission(input, context) {
    return {
      betaFeedbackCrashSubmission: await getFeedback(
        context,
        resourcePath(
          "/v1/betaFeedbackCrashSubmissions",
          readAppStoreConnectId(input.betaFeedbackCrashSubmissionId, "betaFeedbackCrashSubmissionId"),
        ),
        "App Store Connect crash feedback submission",
      ),
    };
  },

  async delete_beta_feedback_crash_submission(input, context) {
    const id = readAppStoreConnectId(input.betaFeedbackCrashSubmissionId, "betaFeedbackCrashSubmissionId");
    await deleteResource(
      context,
      resourcePath("/v1/betaFeedbackCrashSubmissions", id),
      "Deleting the App Store Connect crash feedback submission",
    );
    return { id, deleted: true };
  },

  async get_beta_feedback_crash_log(input, context) {
    return {
      crashLog: await getResource(
        context,
        resourcePath(
          "/v1/betaFeedbackCrashSubmissions",
          readAppStoreConnectId(input.betaFeedbackCrashSubmissionId, "betaFeedbackCrashSubmissionId"),
          "crashLog",
        ),
        "App Store Connect beta crash log",
      ),
    };
  },

  async get_beta_recruitment_criterion(input, context) {
    return {
      betaRecruitmentCriterion: await getOptionalResource(
        context,
        resourcePath(
          "/v1/betaGroups",
          readAppStoreConnectId(input.betaGroupId, "betaGroupId"),
          "betaRecruitmentCriteria",
        ),
        "App Store Connect beta recruitment criteria",
      ),
    };
  },

  async create_beta_recruitment_criterion(input, context) {
    const betaRecruitmentCriterion = await createResource(context, {
      path: "/v1/betaRecruitmentCriteria",
      type: "betaRecruitmentCriteria",
      label: "App Store Connect beta recruitment criteria",
      attributes: {
        deviceFamilyOsVersionFilters: readDeviceFamilyOsVersionFilters(input.deviceFamilyOsVersionFilters),
      },
      relationships: {
        betaGroup: toOneLinkage("betaGroups", readAppStoreConnectId(input.betaGroupId, "betaGroupId")),
      },
    });
    return { betaRecruitmentCriterion };
  },

  async update_beta_recruitment_criterion(input, context) {
    const id = readAppStoreConnectId(input.betaRecruitmentCriterionId, "betaRecruitmentCriterionId");
    const betaRecruitmentCriterion = await updateResource(context, {
      path: resourcePath("/v1/betaRecruitmentCriteria", id),
      type: "betaRecruitmentCriteria",
      id,
      label: "App Store Connect beta recruitment criteria",
      attributes: {
        deviceFamilyOsVersionFilters: readDeviceFamilyOsVersionFilters(input.deviceFamilyOsVersionFilters),
      },
    });
    return { betaRecruitmentCriterion };
  },

  async delete_beta_recruitment_criterion(input, context) {
    const id = readAppStoreConnectId(input.betaRecruitmentCriterionId, "betaRecruitmentCriterionId");
    await deleteResource(
      context,
      resourcePath("/v1/betaRecruitmentCriteria", id),
      "Deleting the App Store Connect beta recruitment criteria",
    );
    return { id, deleted: true };
  },

  async list_beta_recruitment_criterion_options(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaRecruitmentCriterionOptions",
      label: "App Store Connect beta recruitment criterion option",
    });
    return {
      betaRecruitmentCriterionOptions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_beta_recruitment_criterion_compatible_build_check(input, context) {
    return {
      compatibleBuildCheck: await getResource(
        context,
        resourcePath(
          "/v1/betaGroups",
          readAppStoreConnectId(input.betaGroupId, "betaGroupId"),
          "betaRecruitmentCriterionCompatibleBuildCheck",
        ),
        "App Store Connect beta recruitment criterion compatible build check",
      ),
    };
  },

  async list_beta_app_clip_invocations(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/buildBundles",
        readAppStoreConnectId(input.buildBundleId, "buildBundleId"),
        "betaAppClipInvocations",
      ),
      label: "App Store Connect beta App Clip invocation list",
      query: localizationInclude,
    });
    return {
      betaAppClipInvocations: page.resources.map((resource) => normalizeInvocation(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_beta_app_clip_invocation(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/betaAppClipInvocations",
        readAppStoreConnectId(input.betaAppClipInvocationId, "betaAppClipInvocationId"),
      ),
      query: localizationInclude,
    });
    return { betaAppClipInvocation: readInvocationResponse(payload) };
  },

  async create_beta_app_clip_invocation(input, context) {
    const localizations = readInlineLocalizations(input.betaAppClipInvocationLocalizations);

    const linkage = localizations.map((_, index) => ({
      type: localizationType,
      id: `\${localization-${index + 1}}`,
    }));
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/betaAppClipInvocations",
      body: {
        data: {
          type: "betaAppClipInvocations",
          attributes: { url: requiredInputString(input.url, "url") },
          relationships: {
            buildBundle: toOneLinkage("buildBundles", readAppStoreConnectId(input.buildBundleId, "buildBundleId")),
            betaAppClipInvocationLocalizations: { data: linkage },
          },
        },
        included: localizations.map((attributes, index) => ({
          ...linkage[index],
          attributes,
        })),
      },
    });
    return { betaAppClipInvocation: readInvocationResponse(payload) };
  },

  async update_beta_app_clip_invocation(input, context) {
    const id = readAppStoreConnectId(input.betaAppClipInvocationId, "betaAppClipInvocationId");
    const betaAppClipInvocation = await updateResource(context, {
      path: resourcePath("/v1/betaAppClipInvocations", id),
      type: "betaAppClipInvocations",
      id,
      label: "App Store Connect beta App Clip invocation",
      attributes: { url: requiredInputString(input.url, "url") },
    });
    return { betaAppClipInvocation };
  },

  async delete_beta_app_clip_invocation(input, context) {
    const id = readAppStoreConnectId(input.betaAppClipInvocationId, "betaAppClipInvocationId");
    await deleteResource(
      context,
      resourcePath("/v1/betaAppClipInvocations", id),
      "Deleting the App Store Connect beta App Clip invocation",
    );
    return { id, deleted: true };
  },

  async create_beta_app_clip_invocation_localization(input, context) {
    const betaAppClipInvocationLocalization = await createResource(context, {
      path: "/v1/betaAppClipInvocationLocalizations",
      type: localizationType,
      label: "App Store Connect beta App Clip invocation localization",
      attributes: {
        title: requiredInputString(input.title, "title"),
        locale: requiredInputString(input.locale, "locale"),
      },
      relationships: {
        betaAppClipInvocation: toOneLinkage(
          "betaAppClipInvocations",
          readAppStoreConnectId(input.betaAppClipInvocationId, "betaAppClipInvocationId"),
        ),
      },
    });
    return { betaAppClipInvocationLocalization };
  },

  async update_beta_app_clip_invocation_localization(input, context) {
    const id = readAppStoreConnectId(input.betaAppClipInvocationLocalizationId, "betaAppClipInvocationLocalizationId");
    const betaAppClipInvocationLocalization = await updateResource(context, {
      path: resourcePath("/v1/betaAppClipInvocationLocalizations", id),
      type: localizationType,
      id,
      label: "App Store Connect beta App Clip invocation localization",
      attributes: { title: requiredInputString(input.title, "title") },
    });
    return { betaAppClipInvocationLocalization };
  },

  async delete_beta_app_clip_invocation_localization(input, context) {
    const id = readAppStoreConnectId(input.betaAppClipInvocationLocalizationId, "betaAppClipInvocationLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/betaAppClipInvocationLocalizations", id),
      "Deleting the App Store Connect beta App Clip invocation localization",
    );
    return { id, deleted: true };
  },

  async list_build_bundles(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");

    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/builds", buildId),
      query: {
        "include": "buildBundles",
        "fields[builds]": "buildBundles",
        "limit[buildBundles]": "50",
      },
    });
    const build = readResource(payload, "App Store Connect build");
    const included = indexIncludedResources(payload);
    return {
      buildId,
      buildBundles: readIncludedResources(build, "buildBundles", included).map((bundle) =>
        normalizeResource(bundle, "App Store Connect build bundle"),
      ),
    };
  },

  async get_build_bundle_app_clip_domain_cache_status(input, context) {
    return {
      appClipDomainCacheStatus: await getOptionalResource(
        context,
        resourcePath(
          "/v1/buildBundles",
          readAppStoreConnectId(input.buildBundleId, "buildBundleId"),
          "appClipDomainCacheStatus",
        ),
        "App Store Connect App Clip domain cache status",
      ),
    };
  },

  async get_build_bundle_app_clip_domain_debug_status(input, context) {
    return {
      appClipDomainDebugStatus: await getOptionalResource(
        context,
        resourcePath(
          "/v1/buildBundles",
          readAppStoreConnectId(input.buildBundleId, "buildBundleId"),
          "appClipDomainDebugStatus",
        ),
        "App Store Connect App Clip domain debug status",
      ),
    };
  },

  async list_build_bundle_file_sizes(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/buildBundles",
        readAppStoreConnectId(input.buildBundleId, "buildBundleId"),
        "buildBundleFileSizes",
      ),
      label: "App Store Connect build bundle file size",
    });
    return { buildBundleFileSizes: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_app_beta_tester_usages(input, context) {
    return listBetaTesterUsages(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "metrics/betaTesterUsages"),
      label: "App Store Connect app beta tester usage",
    });
  },

  async get_beta_group_beta_tester_usages(input, context) {
    return listBetaTesterUsages(context, input, {
      path: resourcePath(
        "/v1/betaGroups",
        readAppStoreConnectId(input.betaGroupId, "betaGroupId"),
        "metrics/betaTesterUsages",
      ),
      label: "App Store Connect beta group beta tester usage",
    });
  },

  async get_beta_tester_usages(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/betaTesters",
        readAppStoreConnectId(input.betaTesterId, "betaTesterId"),
        "metrics/betaTesterUsages",
      ),
      label: "App Store Connect beta tester usage",
      query: {
        "period": pickOptionalString(input, "period"),
        "filter[apps]": readAppStoreConnectId(input.appId, "appId"),
      },
    });
    return {
      usages: page.resources.map((group) => ({
        appId: readDimensionId(group, "apps"),
        dataPoints: readDataPoints(group, betaTesterUsageValueKeys),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_build_beta_build_usages(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/builds", buildId, "metrics/betaBuildUsages"),
    });

    const dataPoints = readCollection(payload, "App Store Connect beta build usage").flatMap((group) =>
      readDataPoints(group, betaBuildUsageValueKeys),
    );
    return { buildId, dataPoints };
  },
};

async function listFeedback(context: AppStoreConnectContext, input: Record<string, unknown>, request: ListRequest) {
  const page = await listResources(context, input, {
    ...request,
    query: {
      "filter[build]": readCommaSeparatedList(input.buildIds),
      "filter[build.preReleaseVersion]": readCommaSeparatedList(input.preReleaseVersionIds),
      "filter[tester]": readCommaSeparatedList(input.betaTesterIds),
      "filter[deviceModel]": readCommaSeparatedList(input.deviceModels),
      "filter[osVersion]": readCommaSeparatedList(input.osVersions),
      "filter[appPlatform]": readCommaSeparatedList(input.appPlatforms),
      "filter[devicePlatform]": readCommaSeparatedList(input.devicePlatforms),
      "sort": pickOptionalString(input, "sort"),
      "include": "build,tester",
    },
  });
  return {
    items: page.resources.map((resource) => normalizeFeedback(resource, page.included, request.label)),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

async function getFeedback(
  context: AppStoreConnectContext,
  path: string,
  label: string,
): Promise<Record<string, unknown>> {
  const { payload } = await requestAppStoreConnect(context, {
    path,
    query: { include: "build,tester" },
  });
  return normalizeFeedback(readResource(payload, label), indexIncludedResources(payload), label);
}

function normalizeFeedback(
  resource: Record<string, unknown>,
  included: IncludedResources,
  label: string,
): Record<string, unknown> {
  return {
    ...normalizeResource(resource, label),
    build: readBuildSummary(readIncludedResource(resource, "build", included)),
    tester: readBetaTesterSummary(readIncludedResource(resource, "tester", included)),
  };
}

function readBuildSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }
  const build = normalizeResource(resource, "App Store Connect build");
  return { id: build.id, version: rawStringOrNull(build.version) };
}

function readBetaTesterSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }
  const tester = normalizeResource(resource, "App Store Connect beta tester");
  return {
    id: tester.id,
    email: rawStringOrNull(tester.email),
    firstName: rawStringOrNull(tester.firstName),
    lastName: rawStringOrNull(tester.lastName),
  };
}

function readDeviceFamilyOsVersionFilters(value: unknown): Array<Record<string, unknown>> {
  const filters = looseArray(value).map((item) => {
    const filter = recordOrEmpty(item);
    return compactObject({
      deviceFamily: requiredInputString(filter.deviceFamily, "deviceFamily"),
      minimumOsInclusive: pickOptionalString(filter, "minimumOsInclusive"),
      maximumOsInclusive: pickOptionalString(filter, "maximumOsInclusive"),
    });
  });
  if (filters.length === 0) {
    throw new ProviderRequestError(400, "deviceFamilyOsVersionFilters must contain at least one filter");
  }
  return filters;
}

function readInlineLocalizations(value: unknown): Array<{ title: string; locale: string }> {
  const localizations = looseArray(value).map((item) => {
    const localization = recordOrEmpty(item);
    return {
      title: requiredInputString(localization.title, "title"),
      locale: requiredInputString(localization.locale, "locale"),
    };
  });
  if (localizations.length === 0) {
    throw new ProviderRequestError(400, "betaAppClipInvocationLocalizations must contain at least one localization");
  }
  return localizations;
}

function readInvocationResponse(payload: unknown): Record<string, unknown> {
  return normalizeInvocation(
    readResource(payload, "App Store Connect beta App Clip invocation"),
    indexIncludedResources(payload),
  );
}

function normalizeInvocation(resource: Record<string, unknown>, included: IncludedResources): Record<string, unknown> {
  return {
    ...normalizeResource(resource, "App Store Connect beta App Clip invocation"),
    betaAppClipInvocationLocalizations: readIncludedResources(resource, localizationType, included).map(
      (localization) => {
        const record = normalizeResource(localization, "App Store Connect beta App Clip invocation localization");
        return {
          id: record.id,
          title: rawStringOrNull(record.title),
          locale: rawStringOrNull(record.locale),
        };
      },
    ),
  };
}

async function listBetaTesterUsages(
  context: AppStoreConnectContext,
  input: Record<string, unknown>,
  request: ListRequest,
) {
  const page = await listResources(context, input, {
    ...request,
    query: {
      "period": pickOptionalString(input, "period"),
      "groupBy": optionalBoolean(input.groupByBetaTester) ? "betaTesters" : undefined,
      "filter[betaTesters]": readOptionalAppStoreConnectId(input.betaTesterId, "betaTesterId"),
    },
  });
  return {
    usages: page.resources.map((group) => {
      const betaTesterId = readDimensionId(group, "betaTesters");
      return {
        betaTesterId,
        betaTester: readBetaTesterSummary(
          betaTesterId === null ? undefined : page.included.get(`betaTesters:${betaTesterId}`),
        ),
        dataPoints: readDataPoints(group, betaTesterUsageValueKeys),
      };
    }),
    nextCursor: page.nextCursor,
    total: page.total,
  };
}

function readDimensionId(group: Record<string, unknown>, dimension: string): string | null {
  return rawStringOrNull(recordOrEmpty(recordOrEmpty(group.dimensions)[dimension]).data);
}

function readDataPoints(group: Record<string, unknown>, valueKeys: readonly string[]): Array<Record<string, unknown>> {
  return looseArray(group.dataPoints).map((point) => {
    const record = recordOrEmpty(point);
    const values = recordOrEmpty(record.values);
    const counts = Object.fromEntries(valueKeys.map((key) => [key, readResponseInteger(values[key])]));
    return { start: rawStringOrNull(record.start), end: rawStringOrNull(record.end), ...counts };
  });
}
