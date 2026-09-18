import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appResource,
  betaReviewStates,
  buildProcessingStates,
  buildResource,
  buildWithReviewResource,
  contentPlatforms,
  nonEmptyString,
  pageOutput,
  paginationInputs,
  preReleaseVersionResource,
} from "./schemas.ts";

export const appStoreConnectAppsBuildsActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apps",
    operationType: "read",
    description: "List the apps the API key can see, optionally filtered by bundle identifier, name, or SKU.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing App Store Connect apps.",
      {
        bundleId: nonEmptyString("Return only the app with this exact bundle identifier."),
        name: nonEmptyString("Return only apps with this exact name."),
        sku: nonEmptyString("Return only the app with this exact SKU."),
        sort: s.stringEnum("Sort order for the returned apps.", [
          "name",
          "-name",
          "bundleId",
          "-bundleId",
          "sku",
          "-sku",
        ]),
        ...paginationInputs,
      },
      { optional: ["bundleId", "name", "sku", "sort", "limit", "cursor"] },
    ),
    outputSchema: pageOutput("apps", appResource, "Apps returned for this page.", "A page of App Store Connect apps."),
  }),
  defineProviderAction(service, {
    name: "get_app",
    operationType: "read",
    description: "Read one app record by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: nonEmptyString("App Store Connect identifier of the app.") },
      ["appId"],
      "Identifies the app to read.",
    ),
    outputSchema: s.actionOutput({ app: appResource }, "The requested app."),
  }),
  defineProviderAction(service, {
    name: "list_builds",
    operationType: "read",
    description:
      "List builds uploaded for one app, with the prerelease version each build belongs to. Filter by version, platform, processing state, or TestFlight review state.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the builds of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app whose builds to list."),
        version: nonEmptyString("Return only builds with this build number, such as 42."),
        preReleaseVersion: nonEmptyString("Return only builds under this marketing version, such as 1.4.0."),
        platform: s.stringEnum("Return only builds for this content platform.", contentPlatforms),
        processingState: s.stringEnum("Return only builds in this processing state.", buildProcessingStates),
        betaReviewState: s.stringEnum(
          "Return only builds whose beta review submission is in this state.",
          betaReviewStates,
        ),
        expired: s.boolean("Return only expired builds when true, or only unexpired builds when false."),
        sort: s.stringEnum("Sort order for the returned builds.", [
          "version",
          "-version",
          "uploadedDate",
          "-uploadedDate",
          "preReleaseVersion",
          "-preReleaseVersion",
        ]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "builds",
      buildResource,
      "Builds returned for this page.",
      "A page of builds for one app.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_build",
    operationType: "read",
    description:
      "Read one build together with its prerelease version, its TestFlight review submission, and the app it belongs to.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { buildId: nonEmptyString("App Store Connect identifier of the build.") },
      ["buildId"],
      "Identifies the build to read.",
    ),
    outputSchema: s.actionOutput({ build: buildWithReviewResource }, "The requested build and its related records."),
  }),
  defineProviderAction(service, {
    name: "list_pre_release_versions",
    operationType: "read",
    description: "List the prerelease versions of one app, which group its TestFlight builds by marketing version.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing prerelease versions.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Return only prerelease versions for this content platform.", contentPlatforms),
        version: nonEmptyString("Return only the prerelease version with this exact version string."),
        sort: s.stringEnum("Sort order for the returned prerelease versions.", ["version", "-version"]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "preReleaseVersions",
      preReleaseVersionResource,
      "Prerelease versions returned for this page.",
      "A page of prerelease versions.",
    ),
  }),
];
