import type { AppStoreConnectHandlers } from "./runtime-helpers.ts";

import { optionalInteger, optionalString, optionalBoolean, pickOptionalString } from "../../core/cast.ts";
import { requiredInputString } from "../provider-runtime.ts";
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
  readIdentifierList,
  readIncludedResource,
  readPreReleaseVersionSummary,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toManyLinkage,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const buildLabel = "App Store Connect build";
const betaGroupLabel = "App Store Connect beta group";
const betaTesterLabel = "App Store Connect beta tester";
const buildBetaDetailLabel = "App Store Connect build beta detail";
const betaBuildLocalizationLabel = "App Store Connect beta build localization";
const betaAppReviewDetailLabel = "App Store Connect beta app review detail";
const betaAppLocalizationLabel = "App Store Connect beta app localization";
const betaLicenseAgreementLabel = "App Store Connect beta license agreement";
const betaAppReviewSubmissionLabel = "App Store Connect beta app review submission";

export const appStoreConnectTestFlightBuildHandlers: AppStoreConnectHandlers = {
  async update_build(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const attributes = {
      expired: optionalBoolean(input.expired),
      usesNonExemptEncryption: optionalBoolean(input.usesNonExemptEncryption),
    };
    requireAnyAttribute(attributes, "Provide at least one of expired or usesNonExemptEncryption");
    const build = await updateResource(context, {
      path: resourcePath("/v1/builds", buildId),
      type: "builds",
      id: buildId,
      label: buildLabel,
      attributes,
    });
    return { build };
  },

  async list_build_individual_testers(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/builds", readAppStoreConnectId(input.buildId, "buildId"), "individualTesters"),
      label: betaTesterLabel,
    });
    return { betaTesters: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async add_individual_testers_to_build(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const betaTesterIds = readIdentifierList(input.betaTesterIds, "betaTesterIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/builds", buildId, "relationships/individualTesters"),
      type: "betaTesters",
      ids: betaTesterIds,
      label: "Assigning individual testers to the App Store Connect build",
    });
    return { buildId, betaTesterIds, added: true };
  },

  async remove_individual_testers_from_build(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const betaTesterIds = readIdentifierList(input.betaTesterIds, "betaTesterIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/builds", buildId, "relationships/individualTesters"),
      type: "betaTesters",
      ids: betaTesterIds,
      label: "Unassigning individual testers from the App Store Connect build",
    });
    return { buildId, betaTesterIds, removed: true };
  },

  async remove_build_from_beta_groups(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const betaGroupIds = readIdentifierList(input.betaGroupIds, "betaGroupIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/builds", buildId, "relationships/betaGroups"),
      type: "betaGroups",
      ids: betaGroupIds,
      label: "Removing the build from App Store Connect beta groups",
    });
    return { buildId, betaGroupIds, removed: true };
  },

  async list_build_beta_groups(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaGroups",
      label: betaGroupLabel,
      query: { "filter[builds]": readAppStoreConnectId(input.buildId, "buildId") },
    });
    return { betaGroups: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_build_beta_detail(input, context) {
    return {
      buildBetaDetail: await getResource(
        context,
        resourcePath("/v1/builds", readAppStoreConnectId(input.buildId, "buildId"), "buildBetaDetail"),
        buildBetaDetailLabel,
      ),
    };
  },

  async update_build_beta_detail(input, context) {
    const buildBetaDetailId = readAppStoreConnectId(input.buildBetaDetailId, "buildBetaDetailId");
    const attributes = { autoNotifyEnabled: optionalBoolean(input.autoNotifyEnabled) };
    requireAnyAttribute(attributes, "Provide at least one of autoNotifyEnabled");
    const buildBetaDetail = await updateResource(context, {
      path: resourcePath("/v1/buildBetaDetails", buildBetaDetailId),
      type: "buildBetaDetails",
      id: buildBetaDetailId,
      label: buildBetaDetailLabel,
      attributes,
    });
    return { buildBetaDetail };
  },

  async notify_build_testers(input, context) {
    const buildId = readAppStoreConnectId(input.buildId, "buildId");
    const notification = await createResource(context, {
      path: "/v1/buildBetaNotifications",
      type: "buildBetaNotifications",
      label: "App Store Connect build beta notification",
      relationships: { build: toOneLinkage("builds", buildId) },
    });

    return { id: notification.id, buildId, notified: true };
  },

  async list_beta_build_localizations(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaBuildLocalizations",
      label: betaBuildLocalizationLabel,
      query: {
        "filter[build]": readAppStoreConnectId(input.buildId, "buildId"),
        "filter[locale]": pickOptionalString(input, "locale"),
      },
    });
    return { betaBuildLocalizations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_beta_build_localization(input, context) {
    return {
      betaBuildLocalization: await getResource(
        context,
        resourcePath(
          "/v1/betaBuildLocalizations",
          readAppStoreConnectId(input.betaBuildLocalizationId, "betaBuildLocalizationId"),
        ),
        betaBuildLocalizationLabel,
      ),
    };
  },

  async create_beta_build_localization(input, context) {
    const betaBuildLocalization = await createResource(context, {
      path: "/v1/betaBuildLocalizations",
      type: "betaBuildLocalizations",
      label: betaBuildLocalizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        whatsNew: pickOptionalString(input, "whatsNew"),
      },
      relationships: {
        build: toOneLinkage("builds", readAppStoreConnectId(input.buildId, "buildId")),
      },
    });
    return { betaBuildLocalization };
  },

  async update_beta_build_localization(input, context) {
    const betaBuildLocalizationId = readAppStoreConnectId(input.betaBuildLocalizationId, "betaBuildLocalizationId");
    const betaBuildLocalization = await updateResource(context, {
      path: resourcePath("/v1/betaBuildLocalizations", betaBuildLocalizationId),
      type: "betaBuildLocalizations",
      id: betaBuildLocalizationId,
      label: betaBuildLocalizationLabel,
      attributes: { whatsNew: requiredInputString(input.whatsNew, "whatsNew") },
    });
    return { betaBuildLocalization };
  },

  async delete_beta_build_localization(input, context) {
    const betaBuildLocalizationId = readAppStoreConnectId(input.betaBuildLocalizationId, "betaBuildLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/betaBuildLocalizations", betaBuildLocalizationId),
      "Deleting the App Store Connect beta build localization",
    );
    return { id: betaBuildLocalizationId, deleted: true };
  },

  async get_beta_app_review_detail(input, context) {
    return {
      betaAppReviewDetail: await getResource(
        context,
        resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "betaAppReviewDetail"),
        betaAppReviewDetailLabel,
      ),
    };
  },

  async update_beta_app_review_detail(input, context) {
    const betaAppReviewDetailId = readAppStoreConnectId(input.betaAppReviewDetailId, "betaAppReviewDetailId");
    const attributes = {
      contactFirstName: pickOptionalString(input, "contactFirstName"),
      contactLastName: pickOptionalString(input, "contactLastName"),
      contactPhone: pickOptionalString(input, "contactPhone"),
      contactEmail: pickOptionalString(input, "contactEmail"),
      demoAccountName: pickOptionalString(input, "demoAccountName"),

      demoAccountPassword: optionalString(input.demoAccountPassword),
      demoAccountRequired: optionalBoolean(input.demoAccountRequired),
      notes: pickOptionalString(input, "notes"),
    };
    requireAnyAttribute(
      attributes,
      "Provide at least one of contactFirstName, contactLastName, contactPhone, contactEmail, demoAccountName, demoAccountPassword, demoAccountRequired or notes",
    );
    const betaAppReviewDetail = await updateResource(context, {
      path: resourcePath("/v1/betaAppReviewDetails", betaAppReviewDetailId),
      type: "betaAppReviewDetails",
      id: betaAppReviewDetailId,
      label: betaAppReviewDetailLabel,
      attributes,
    });
    return { betaAppReviewDetail };
  },

  async list_beta_app_localizations(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaAppLocalizations",
      label: betaAppLocalizationLabel,
      query: {
        "filter[app]": readAppStoreConnectId(input.appId, "appId"),
        "filter[locale]": pickOptionalString(input, "locale"),
      },
    });
    return { betaAppLocalizations: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_beta_app_localization(input, context) {
    return {
      betaAppLocalization: await getResource(
        context,
        resourcePath(
          "/v1/betaAppLocalizations",
          readAppStoreConnectId(input.betaAppLocalizationId, "betaAppLocalizationId"),
        ),
        betaAppLocalizationLabel,
      ),
    };
  },

  async create_beta_app_localization(input, context) {
    const betaAppLocalization = await createResource(context, {
      path: "/v1/betaAppLocalizations",
      type: "betaAppLocalizations",
      label: betaAppLocalizationLabel,
      attributes: {
        locale: requiredInputString(input.locale, "locale"),
        ...readBetaAppLocalizationAttributes(input),
      },
      relationships: { app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")) },
    });
    return { betaAppLocalization };
  },

  async update_beta_app_localization(input, context) {
    const betaAppLocalizationId = readAppStoreConnectId(input.betaAppLocalizationId, "betaAppLocalizationId");
    const attributes = readBetaAppLocalizationAttributes(input);
    requireAnyAttribute(
      attributes,
      "Provide at least one of description, feedbackEmail, marketingUrl, privacyPolicyUrl or tvOsPrivacyPolicy",
    );
    const betaAppLocalization = await updateResource(context, {
      path: resourcePath("/v1/betaAppLocalizations", betaAppLocalizationId),
      type: "betaAppLocalizations",
      id: betaAppLocalizationId,
      label: betaAppLocalizationLabel,
      attributes,
    });
    return { betaAppLocalization };
  },

  async delete_beta_app_localization(input, context) {
    const betaAppLocalizationId = readAppStoreConnectId(input.betaAppLocalizationId, "betaAppLocalizationId");
    await deleteResource(
      context,
      resourcePath("/v1/betaAppLocalizations", betaAppLocalizationId),
      "Deleting the App Store Connect beta app localization",
    );
    return { id: betaAppLocalizationId, deleted: true };
  },

  async get_beta_license_agreement(input, context) {
    return {
      betaLicenseAgreement: await getResource(
        context,
        resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "betaLicenseAgreement"),
        betaLicenseAgreementLabel,
      ),
    };
  },

  async update_beta_license_agreement(input, context) {
    const betaLicenseAgreementId = readAppStoreConnectId(input.betaLicenseAgreementId, "betaLicenseAgreementId");
    const betaLicenseAgreement = await updateResource(context, {
      path: resourcePath("/v1/betaLicenseAgreements", betaLicenseAgreementId),
      type: "betaLicenseAgreements",
      id: betaLicenseAgreementId,
      label: betaLicenseAgreementLabel,
      attributes: { agreementText: requiredInputString(input.agreementText, "agreementText") },
    });
    return { betaLicenseAgreement };
  },

  async resend_beta_tester_invitation(input, context) {
    const appId = readAppStoreConnectId(input.appId, "appId");
    const betaTesterId = readAppStoreConnectId(input.betaTesterId, "betaTesterId");
    const invitation = await createResource(context, {
      path: "/v1/betaTesterInvitations",
      type: "betaTesterInvitations",
      label: "App Store Connect beta tester invitation",
      relationships: {
        app: toOneLinkage("apps", appId),
        betaTester: toOneLinkage("betaTesters", betaTesterId),
      },
    });

    return { id: invitation.id, appId, betaTesterId, resent: true };
  },

  async get_beta_group(input, context) {
    return {
      betaGroup: await getResource(
        context,
        resourcePath("/v1/betaGroups", readAppStoreConnectId(input.betaGroupId, "betaGroupId")),
        betaGroupLabel,
      ),
    };
  },

  async update_beta_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      publicLinkEnabled: optionalBoolean(input.publicLinkEnabled),
      publicLinkLimitEnabled: optionalBoolean(input.publicLinkLimitEnabled),
      publicLinkLimit: optionalInteger(input.publicLinkLimit),
      feedbackEnabled: optionalBoolean(input.feedbackEnabled),
      iosBuildsAvailableForAppleSiliconMac: optionalBoolean(input.iosBuildsAvailableForAppleSiliconMac),
      iosBuildsAvailableForAppleVision: optionalBoolean(input.iosBuildsAvailableForAppleVision),
    };
    requireAnyAttribute(
      attributes,
      "Provide at least one of name, publicLinkEnabled, publicLinkLimitEnabled, publicLinkLimit, feedbackEnabled, iosBuildsAvailableForAppleSiliconMac or iosBuildsAvailableForAppleVision",
    );
    const betaGroup = await updateResource(context, {
      path: resourcePath("/v1/betaGroups", betaGroupId),
      type: "betaGroups",
      id: betaGroupId,
      label: betaGroupLabel,
      attributes,
    });
    return { betaGroup };
  },

  async list_beta_group_builds(input, context) {
    const page = await listResources(context, input, {
      path: "/v1/builds",
      label: "App Store Connect build list",
      query: {
        "filter[betaGroups]": readAppStoreConnectId(input.betaGroupId, "betaGroupId"),
        "include": "preReleaseVersion",
      },
    });
    return {
      builds: page.resources.map((resource) => ({
        ...normalizeResource(resource, buildLabel),
        preReleaseVersion: readPreReleaseVersionSummary(
          readIncludedResource(resource, "preReleaseVersion", page.included),
        ),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async add_builds_to_beta_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const buildIds = readIdentifierList(input.buildIds, "buildIds");
    await modifyRelationship(context, {
      method: "POST",
      path: resourcePath("/v1/betaGroups", betaGroupId, "relationships/builds"),
      type: "builds",
      ids: buildIds,
      label: "Adding builds to the App Store Connect beta group",
    });
    return { betaGroupId, buildIds, added: true };
  },

  async remove_builds_from_beta_group(input, context) {
    const betaGroupId = readAppStoreConnectId(input.betaGroupId, "betaGroupId");
    const buildIds = readIdentifierList(input.buildIds, "buildIds");
    await modifyRelationship(context, {
      method: "DELETE",
      path: resourcePath("/v1/betaGroups", betaGroupId, "relationships/builds"),
      type: "builds",
      ids: buildIds,
      label: "Removing builds from the App Store Connect beta group",
    });
    return { betaGroupId, buildIds, removed: true };
  },

  async get_beta_tester(input, context) {
    return {
      betaTester: await getResource(
        context,
        resourcePath("/v1/betaTesters", readAppStoreConnectId(input.betaTesterId, "betaTesterId")),
        betaTesterLabel,
      ),
    };
  },

  async list_beta_tester_apps(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/betaTesters", readAppStoreConnectId(input.betaTesterId, "betaTesterId"), "apps"),
      label: "App Store Connect app",
    });
    return { apps: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async remove_beta_tester_from_apps(input, context) {
    const betaTesterId = readAppStoreConnectId(input.betaTesterId, "betaTesterId");
    const appIds = readIdentifierList(input.appIds, "appIds");

    const response = await requestAppStoreConnect(context, {
      method: "DELETE",
      path: resourcePath("/v1/betaTesters", betaTesterId, "relationships/apps"),
      body: toManyLinkage("apps", appIds),
    });
    assertNoContent(response, [202, 204], "Removing the App Store Connect beta tester from apps");
    return { betaTesterId, appIds, removed: true };
  },

  async list_beta_tester_beta_groups(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/betaTesters", readAppStoreConnectId(input.betaTesterId, "betaTesterId"), "betaGroups"),
      label: betaGroupLabel,
    });
    return { betaGroups: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_pre_release_version(input, context) {
    return {
      preReleaseVersion: await getResource(
        context,
        resourcePath("/v1/preReleaseVersions", readAppStoreConnectId(input.preReleaseVersionId, "preReleaseVersionId")),
        "App Store Connect prerelease version",
      ),
    };
  },

  async list_beta_app_review_submissions(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/betaAppReviewSubmissions",
      label: betaAppReviewSubmissionLabel,
      query: {
        "filter[build]": readAppStoreConnectId(input.buildId, "buildId"),
        "filter[betaReviewState]": pickOptionalString(input, "betaReviewState"),
      },
    });
    return {
      betaAppReviewSubmissions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_beta_app_review_submission(input, context) {
    return {
      betaAppReviewSubmission: await getResource(
        context,
        resourcePath(
          "/v1/betaAppReviewSubmissions",
          readAppStoreConnectId(input.betaAppReviewSubmissionId, "betaAppReviewSubmissionId"),
        ),
        betaAppReviewSubmissionLabel,
      ),
    };
  },
};

function readBetaAppLocalizationAttributes(input: Record<string, unknown>) {
  return {
    description: pickOptionalString(input, "description"),
    feedbackEmail: pickOptionalString(input, "feedbackEmail"),
    marketingUrl: pickOptionalString(input, "marketingUrl"),
    privacyPolicyUrl: pickOptionalString(input, "privacyPolicyUrl"),
    tvOsPrivacyPolicy: pickOptionalString(input, "tvOsPrivacyPolicy"),
  };
}
