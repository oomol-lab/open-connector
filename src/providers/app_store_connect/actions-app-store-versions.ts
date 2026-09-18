import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  appStoreVersionResource,
  appVersionStates,
  contentPlatforms,
  nonEmptyString,
  pageOutput,
  paginationInputs,
} from "./schemas.ts";

export const appStoreConnectAppStoreVersionActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_app_store_versions",
    operationType: "read",
    description: "List the App Store versions of one app, with the review and release state of each version.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the App Store versions of one app.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        platform: s.stringEnum("Return only versions for this content platform.", contentPlatforms),
        versionString: nonEmptyString("Return only the version with this exact version string."),
        appVersionState: s.stringEnum("Return only versions in this review and release state.", appVersionStates),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "appStoreVersions",
      appStoreVersionResource,
      "App Store versions returned for this page.",
      "A page of App Store versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version",
    operationType: "read",
    description: "Read one App Store version by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appStoreVersionId: nonEmptyString("App Store Connect identifier of the version.") },
      ["appStoreVersionId"],
      "Identifies the App Store version to read.",
    ),
    outputSchema: s.actionOutput({ appStoreVersion: appStoreVersionResource }, "The requested App Store version."),
  }),
];
