import type { AppStoreConnectContext, AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { rawStringOrNull, compactObject, optionalBoolean, pickOptionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import { normalizeAppStoreVersion } from "./runtime-app-store-versions.ts";
import {
  assertNoContent,
  createResource,
  deleteResource,
  getResource,
  hasAnyAttribute,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readOptionalAppStoreConnectId,
  readOptionalResource,
  readRelationshipId,
  readResource,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toOneLinkage,
  toOptionalOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const versionLabel = "App Store Connect version";
const localizationLabel = "App Store Connect version localization";
const phasedReleaseLabel = "App Store Connect phased release";
const reviewDetailLabel = "App Store Connect review detail";
const reviewSubmissionLabel = "App Store Connect review submission";
const reviewSubmissionItemLabel = "App Store Connect review submission item";

const reviewSubmissionItemTargets = [
  { field: "appStoreVersionId", relationship: "appStoreVersion", type: "appStoreVersions" },
  {
    field: "appCustomProductPageVersionId",
    relationship: "appCustomProductPageVersion",
    type: "appCustomProductPageVersions",
  },
  {
    field: "appStoreVersionExperimentId",
    relationship: "appStoreVersionExperiment",
    type: "appStoreVersionExperiments",
  },
  {
    field: "appStoreVersionExperimentV2Id",
    relationship: "appStoreVersionExperimentV2",
    type: "appStoreVersionExperiments",
  },
  { field: "appEventId", relationship: "appEvent", type: "appEvents" },
] as const;

const reviewSubmissionItemInclude = reviewSubmissionItemTargets.map((target) => target.relationship).join(",");

export const appStoreConnectReleaseHandlers: AppStoreConnectHandlers = {
  async create_app_store_version(input, context) {
    const appStoreVersion = await createResource(context, {
      path: "/v1/appStoreVersions",
      type: "appStoreVersions",
      label: versionLabel,
      attributes: {
        platform: requiredInputString(input.platform, "platform"),
        versionString: requiredInputString(input.versionString, "versionString"),
        copyright: pickOptionalString(input, "copyright"),
        reviewType: pickOptionalString(input, "reviewType"),
        releaseType: pickOptionalString(input, "releaseType"),
        earliestReleaseDate: pickOptionalString(input, "earliestReleaseDate"),
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
        build: toOptionalOneLinkage("builds", readOptionalAppStoreConnectId(input.buildId, "buildId")),
      },
    });
    return { appStoreVersion: normalizeWrittenAppStoreVersion(appStoreVersion) };
  },

  async update_app_store_version(input, context) {
    const appStoreVersionId = readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId");
    const attributes = {
      versionString: pickOptionalString(input, "versionString"),
      copyright: rawStringOrNull(input.copyright),
      reviewType: pickOptionalString(input, "reviewType"),
      releaseType: pickOptionalString(input, "releaseType"),
      earliestReleaseDate: rawStringOrNull(input.earliestReleaseDate),
      downloadable: optionalBoolean(input.downloadable),
    };
    const relationships = {
      build: toOptionalOneLinkage("builds", readOptionalAppStoreConnectId(input.buildId, "buildId")),
    };
    requireAnyAttribute(
      { ...attributes, ...relationships },
      "At least one of versionString, copyright, reviewType, releaseType, earliestReleaseDate, downloadable, or buildId is required",
    );

    const appStoreVersion = await updateResource(context, {
      path: resourcePath("/v1/appStoreVersions", appStoreVersionId),
      type: "appStoreVersions",
      id: appStoreVersionId,
      label: versionLabel,
      attributes: hasAnyAttribute(attributes) ? attributes : undefined,
      relationships: hasAnyAttribute(relationships) ? relationships : undefined,
    });
    return { appStoreVersion: normalizeWrittenAppStoreVersion(appStoreVersion) };
  },

  async delete_app_store_version(input, context) {
    const appStoreVersionId = readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId");
    await deleteResource(
      context,
      resourcePath("/v1/appStoreVersions", appStoreVersionId),
      "Deleting the App Store Connect version",
    );
    return { id: appStoreVersionId, deleted: true };
  },

  async set_app_store_version_build(input, context) {
    const appStoreVersionId = readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId");

    const buildId = input.buildId === null ? null : readAppStoreConnectId(input.buildId, "buildId");
    const response = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/appStoreVersions", appStoreVersionId, "relationships/build"),
      body: buildId === null ? { data: null } : toOneLinkage("builds", buildId),
    });
    assertNoContent(response, [204], "Setting the build of the App Store Connect version");
    return { appStoreVersionId, buildId, replaced: true };
  },

  async get_app_store_version_build(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/appStoreVersions",
        readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        "build",
      ),
    });
    return { build: readOptionalResource(payload, "App Store Connect build") };
  },

  async list_app_store_version_localizations(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/appStoreVersions",
        readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        "appStoreVersionLocalizations",
      ),
      label: localizationLabel,
      query: { "filter[locale]": readCommaSeparatedList(input.locales) },
    });
    return {
      appStoreVersionLocalizations: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_app_store_version_localization(input, context) {
    return {
      appStoreVersionLocalization: await getResource(
        context,
        resourcePath(
          "/v1/appStoreVersionLocalizations",
          readAppStoreConnectId(input.appStoreVersionLocalizationId, "appStoreVersionLocalizationId"),
        ),
        localizationLabel,
      ),
    };
  },

  async create_app_store_version_localization(input, context) {
    const appStoreVersionLocalization = await createResource(context, {
      path: "/v1/appStoreVersionLocalizations",
      type: "appStoreVersionLocalizations",
      label: localizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        description: pickOptionalString(input, "description"),
        keywords: pickOptionalString(input, "keywords"),
        marketingUrl: pickOptionalString(input, "marketingUrl"),
        promotionalText: pickOptionalString(input, "promotionalText"),
        supportUrl: pickOptionalString(input, "supportUrl"),
        whatsNew: pickOptionalString(input, "whatsNew"),
      },
      relationships: {
        appStoreVersion: toOneLinkage(
          "appStoreVersions",
          readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        ),
      },
    });
    return { appStoreVersionLocalization };
  },

  async update_app_store_version_localization(input, context) {
    const appStoreVersionLocalizationId = readAppStoreConnectId(
      input.appStoreVersionLocalizationId,
      "appStoreVersionLocalizationId",
    );
    const attributes = {
      description: rawStringOrNull(input.description),
      keywords: rawStringOrNull(input.keywords),
      marketingUrl: rawStringOrNull(input.marketingUrl),
      promotionalText: rawStringOrNull(input.promotionalText),
      supportUrl: rawStringOrNull(input.supportUrl),
      whatsNew: rawStringOrNull(input.whatsNew),
    };
    requireAnyAttribute(
      attributes,
      "At least one of description, keywords, marketingUrl, promotionalText, supportUrl, or whatsNew is required",
    );
    const appStoreVersionLocalization = await updateResource(context, {
      path: resourcePath("/v1/appStoreVersionLocalizations", appStoreVersionLocalizationId),
      type: "appStoreVersionLocalizations",
      id: appStoreVersionLocalizationId,
      label: localizationLabel,
      attributes,
    });
    return { appStoreVersionLocalization };
  },

  async delete_app_store_version_localization(input, context) {
    const appStoreVersionLocalizationId = readAppStoreConnectId(
      input.appStoreVersionLocalizationId,
      "appStoreVersionLocalizationId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/appStoreVersionLocalizations", appStoreVersionLocalizationId),
      "Deleting the App Store Connect version localization",
    );
    return { id: appStoreVersionLocalizationId, deleted: true };
  },

  async get_app_store_version_phased_release(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/appStoreVersions",
        readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        "appStoreVersionPhasedRelease",
      ),
    });
    return { appStoreVersionPhasedRelease: readOptionalResource(payload, phasedReleaseLabel) };
  },

  async create_app_store_version_phased_release(input, context) {
    const appStoreVersionPhasedRelease = await createResource(context, {
      path: "/v1/appStoreVersionPhasedReleases",
      type: "appStoreVersionPhasedReleases",
      label: phasedReleaseLabel,
      attributes: { phasedReleaseState: pickOptionalString(input, "phasedReleaseState") },
      relationships: {
        appStoreVersion: toOneLinkage(
          "appStoreVersions",
          readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        ),
      },
    });
    return { appStoreVersionPhasedRelease };
  },

  async update_app_store_version_phased_release(input, context) {
    const appStoreVersionPhasedReleaseId = readAppStoreConnectId(
      input.appStoreVersionPhasedReleaseId,
      "appStoreVersionPhasedReleaseId",
    );
    const appStoreVersionPhasedRelease = await updateResource(context, {
      path: resourcePath("/v1/appStoreVersionPhasedReleases", appStoreVersionPhasedReleaseId),
      type: "appStoreVersionPhasedReleases",
      id: appStoreVersionPhasedReleaseId,
      label: phasedReleaseLabel,
      attributes: {
        phasedReleaseState: requiredInputString(input.phasedReleaseState, "phasedReleaseState"),
      },
    });
    return { appStoreVersionPhasedRelease };
  },

  async delete_app_store_version_phased_release(input, context) {
    const appStoreVersionPhasedReleaseId = readAppStoreConnectId(
      input.appStoreVersionPhasedReleaseId,
      "appStoreVersionPhasedReleaseId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/appStoreVersionPhasedReleases", appStoreVersionPhasedReleaseId),
      "Deleting the App Store Connect phased release",
    );
    return { id: appStoreVersionPhasedReleaseId, deleted: true };
  },

  async release_app_store_version(input, context) {
    const appStoreVersionId = readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId");
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/appStoreVersionReleaseRequests",
      body: {
        data: {
          type: "appStoreVersionReleaseRequests",
          relationships: { appStoreVersion: toOneLinkage("appStoreVersions", appStoreVersionId) },
        },
      },
    });

    const releaseRequest = normalizeResource(
      readResource(payload, "App Store Connect release request"),
      "App Store Connect release request",
    );
    return { id: releaseRequest.id, appStoreVersionId };
  },

  async get_app_store_review_detail(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/appStoreVersions",
        readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        "appStoreReviewDetail",
      ),
    });
    return { appStoreReviewDetail: readOptionalResource(payload, reviewDetailLabel) };
  },

  async create_app_store_review_detail(input, context) {
    const appStoreReviewDetail = await createResource(context, {
      path: "/v1/appStoreReviewDetails",
      type: "appStoreReviewDetails",
      label: reviewDetailLabel,
      attributes: {
        contactFirstName: pickOptionalString(input, "contactFirstName"),
        contactLastName: pickOptionalString(input, "contactLastName"),
        contactPhone: pickOptionalString(input, "contactPhone"),
        contactEmail: pickOptionalString(input, "contactEmail"),
        demoAccountName: pickOptionalString(input, "demoAccountName"),
        demoAccountPassword: pickOptionalString(input, "demoAccountPassword"),
        demoAccountRequired: optionalBoolean(input.demoAccountRequired),
        notes: pickOptionalString(input, "notes"),
      },
      relationships: {
        appStoreVersion: toOneLinkage(
          "appStoreVersions",
          readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        ),
      },
    });
    return { appStoreReviewDetail };
  },

  async update_app_store_review_detail(input, context) {
    const appStoreReviewDetailId = readAppStoreConnectId(input.appStoreReviewDetailId, "appStoreReviewDetailId");
    const attributes = {
      contactFirstName: rawStringOrNull(input.contactFirstName),
      contactLastName: rawStringOrNull(input.contactLastName),
      contactPhone: rawStringOrNull(input.contactPhone),
      contactEmail: rawStringOrNull(input.contactEmail),
      demoAccountName: rawStringOrNull(input.demoAccountName),
      demoAccountPassword: rawStringOrNull(input.demoAccountPassword),
      demoAccountRequired: optionalBoolean(input.demoAccountRequired),
      notes: rawStringOrNull(input.notes),
    };
    requireAnyAttribute(
      attributes,
      "At least one of contactFirstName, contactLastName, contactPhone, contactEmail, demoAccountName, demoAccountPassword, demoAccountRequired, or notes is required",
    );
    const appStoreReviewDetail = await updateResource(context, {
      path: resourcePath("/v1/appStoreReviewDetails", appStoreReviewDetailId),
      type: "appStoreReviewDetails",
      id: appStoreReviewDetailId,
      label: reviewDetailLabel,
      attributes,
    });
    return { appStoreReviewDetail };
  },

  async list_review_submissions(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/reviewSubmissions",
      label: `${reviewSubmissionLabel} list`,
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[platform]": pickOptionalString(input, "platform"),
        "filter[state]": readCommaSeparatedList(input.states),
        "include": "appStoreVersionForReview",
      },
    });
    return {
      reviewSubmissions: page.resources.map(normalizeReviewSubmission),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_review_submission(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/reviewSubmissions",
        readAppStoreConnectId(input.reviewSubmissionId, "reviewSubmissionId"),
      ),
      query: { include: "appStoreVersionForReview" },
    });
    return {
      reviewSubmission: normalizeReviewSubmission(readResource(payload, reviewSubmissionLabel)),
    };
  },

  async create_review_submission(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/reviewSubmissions",
      body: {
        data: {
          type: "reviewSubmissions",
          attributes: { platform: requiredInputString(input.platform, "platform") },
          relationships: {
            app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
          },
        },
      },
    });
    return {
      reviewSubmission: normalizeReviewSubmission(readResource(payload, reviewSubmissionLabel)),
    };
  },

  async submit_review_submission(input, context) {
    return {
      reviewSubmission: await patchReviewSubmission(context, input.reviewSubmissionId, {
        submitted: true,
      }),
    };
  },

  async cancel_review_submission(input, context) {
    return {
      reviewSubmission: await patchReviewSubmission(context, input.reviewSubmissionId, {
        canceled: true,
      }),
    };
  },

  async list_review_submission_items(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/reviewSubmissions",
        readAppStoreConnectId(input.reviewSubmissionId, "reviewSubmissionId"),
        "items",
      ),
      label: `${reviewSubmissionItemLabel} list`,
      query: { include: reviewSubmissionItemInclude },
    });
    return {
      reviewSubmissionItems: page.resources.map(normalizeReviewSubmissionItem),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async add_review_submission_item(input, context) {
    const reviewSubmissionId = readAppStoreConnectId(input.reviewSubmissionId, "reviewSubmissionId");

    const targets = reviewSubmissionItemTargets.flatMap((target) => {
      const id = readOptionalAppStoreConnectId(input[target.field], target.field);
      return id === undefined ? [] : [{ ...target, id }];
    });
    const [target] = targets;
    if (!target || targets.length !== 1) {
      throw new ProviderRequestError(
        400,
        `Exactly one of ${reviewSubmissionItemTargets.map((item) => item.field).join(", ")} is required`,
      );
    }
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/reviewSubmissionItems",
      body: {
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: toOneLinkage("reviewSubmissions", reviewSubmissionId),
            [target.relationship]: toOneLinkage(target.type, target.id),
          },
        },
      },
    });
    return {
      reviewSubmissionItem: normalizeReviewSubmissionItem(readResource(payload, reviewSubmissionItemLabel)),
    };
  },

  async update_review_submission_item(input, context) {
    const reviewSubmissionItemId = readAppStoreConnectId(input.reviewSubmissionItemId, "reviewSubmissionItemId");
    const attributes = {
      resolved: optionalBoolean(input.resolved),
      removed: optionalBoolean(input.removed),
    };
    requireAnyAttribute(attributes, "At least one of resolved or removed is required");
    const { payload } = await requestAppStoreConnect(context, {
      method: "PATCH",
      path: resourcePath("/v1/reviewSubmissionItems", reviewSubmissionItemId),
      body: {
        data: {
          type: "reviewSubmissionItems",
          id: reviewSubmissionItemId,
          attributes: compactObject(attributes),
        },
      },
    });
    return {
      reviewSubmissionItem: normalizeReviewSubmissionItem(readResource(payload, reviewSubmissionItemLabel)),
    };
  },

  async delete_review_submission_item(input, context) {
    const reviewSubmissionItemId = readAppStoreConnectId(input.reviewSubmissionItemId, "reviewSubmissionItemId");
    await deleteResource(
      context,
      resourcePath("/v1/reviewSubmissionItems", reviewSubmissionItemId),
      "Deleting the App Store Connect review submission item",
    );
    return { id: reviewSubmissionItemId, deleted: true };
  },
};

function normalizeWrittenAppStoreVersion(version: Record<string, unknown>): Record<string, unknown> {
  return normalizeAppStoreVersion({ id: version.id, attributes: version });
}

async function patchReviewSubmission(
  context: AppStoreConnectContext,
  rawId: unknown,
  attributes: Record<string, boolean>,
): Promise<Record<string, unknown>> {
  const reviewSubmissionId = readAppStoreConnectId(rawId, "reviewSubmissionId");
  const { payload } = await requestAppStoreConnect(context, {
    method: "PATCH",
    path: resourcePath("/v1/reviewSubmissions", reviewSubmissionId),
    body: { data: { type: "reviewSubmissions", id: reviewSubmissionId, attributes } },
  });
  return normalizeReviewSubmission(readResource(payload, reviewSubmissionLabel));
}

function normalizeReviewSubmission(resource: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeResource(resource, reviewSubmissionLabel),
    appStoreVersionForReviewId: readRelationshipId(resource, "appStoreVersionForReview"),
  };
}

function normalizeReviewSubmissionItem(resource: Record<string, unknown>): Record<string, unknown> {
  const ids = Object.fromEntries(
    reviewSubmissionItemTargets.map((target) => [target.field, readRelationshipId(resource, target.relationship)]),
  );
  return { ...normalizeResource(resource, reviewSubmissionItemLabel), ...ids };
}
