import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  contentPlatforms,
  deletedOutput,
  manageAppStoreRoles,
  manageBackgroundAssetsRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
  urlString,
} from "./schemas.ts";

export const backgroundAssetVersionStates: readonly string[] = ["AWAITING_UPLOAD", "PROCESSING", "FAILED", "COMPLETE"];
export const backgroundAssetAppStoreReleaseStates: readonly string[] = [
  "PREPARE_FOR_SUBMISSION",
  "READY_FOR_REVIEW",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "PROCESSING_FOR_DISTRIBUTION",
  "READY_FOR_DISTRIBUTION",
  "SUPERSEDED",
];
export const backgroundAssetInternalBetaReleaseStates: readonly string[] = ["READY_FOR_TESTING", "SUPERSEDED"];
export const backgroundAssetExternalBetaReleaseStates: readonly string[] = [
  "READY_FOR_BETA_SUBMISSION",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "REJECTED",
  "PROCESSING_FOR_TESTING",
  "READY_FOR_TESTING",
  "SUPERSEDED",
];
export const alternativeDistributionPackageVersionStates: readonly string[] = ["COMPLETED", "REPLACED"];
const fileChecksumAlgorithms: readonly string[] = ["MD5", "SHA_256"];
const compositeChecksumAlgorithms: readonly string[] = ["MD5"];

const appIdDescription = "App Store Connect identifier of the app.";
const backgroundAssetIdDescription = "App Store Connect identifier of the background asset pack.";
const backgroundAssetVersionIdDescription = "App Store Connect identifier of the background asset version.";
const alternativeDistributionKeyIdDescription = "App Store Connect identifier of the alternative distribution key.";
const alternativeDistributionDomainIdDescription =
  "App Store Connect identifier of the alternative distribution domain.";
const alternativeDistributionPackageIdDescription =
  "App Store Connect identifier of the alternative distribution package.";
const alternativeDistributionPackageVersionIdDescription =
  "App Store Connect identifier of the alternative distribution package version.";
const marketplaceSearchDetailIdDescription = "App Store Connect identifier of the marketplace search detail.";

const singleOutput = (key: string, resource: JsonSchema, description: string) =>
  s.actionOutput({ [key]: resource }, description);

const backgroundAssetVersionSummary = s.nullable(
  s.object(
    "A background asset version summary, or null when no version holds this slot or App Store Connect did not return it.",
    {
      id: s.string(backgroundAssetVersionIdDescription),
      version: s.nullableString("Version number App Store Connect assigned to the asset pack version."),
      state: nullableEnum("Upload and processing state of the version.", backgroundAssetVersionStates),
      locale: s.nullableString("Locale declared in the asset pack manifest, when the pack is localized."),
      platforms: s.nullable(
        s.array("Platforms the asset pack version targets.", s.stringEnum("A content platform.", contentPlatforms)),
      ),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

const backgroundAssetResource = resourceObject(
  "An Apple-hosted background asset pack of an app.",
  backgroundAssetIdDescription,
  {
    assetPackIdentifier: s.nullableString(
      "Asset pack identifier the app uses to request the pack, chosen when the pack was created.",
    ),
    archived: s.nullableBoolean("Whether the asset pack has been archived."),
    createdDate: s.nullableString("When the asset pack record was created, as an ISO 8601 timestamp."),
    usedBytes: s.nullableInteger("Storage in bytes the asset pack occupies."),
    appStoreVersion: backgroundAssetVersionSummary,
    internalBetaVersion: backgroundAssetVersionSummary,
    externalBetaVersion: backgroundAssetVersionSummary,
  },
  ["appStoreVersion", "internalBetaVersion", "externalBetaVersion"],
);

const releaseSummary = (description: string, states: readonly string[]) =>
  s.nullable(
    s.object(
      `${description} Null when the version has no such release yet or App Store Connect did not return it.`,
      {
        id: s.string("App Store Connect identifier of the release record."),
        state: nullableEnum("State of the release.", states),
      },
      { additionalProperties: true, required: ["id"] },
    ),
  );

const backgroundAssetSummary = s.nullable(
  s.object(
    "The asset pack the version belongs to, or null when App Store Connect did not return it.",
    {
      id: s.string(backgroundAssetIdDescription),
      assetPackIdentifier: s.nullableString("Asset pack identifier the app uses to request the pack."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

const stateDetailList = (description: string) =>
  s.array(
    description,
    s.looseObject("One validation message from asset pack processing.", {
      code: s.nullableString("Machine-readable code of the message."),
      description: s.nullableString("Human-readable text of the message."),
    }),
  );

const backgroundAssetVersionResource = resourceObject(
  "One version of an Apple-hosted background asset pack.",
  backgroundAssetVersionIdDescription,
  {
    version: s.nullableString(
      "Version number App Store Connect assigned when the version was created; it increases automatically.",
    ),
    state: nullableEnum(
      "Upload and processing state of the version. AWAITING_UPLOAD until the asset pack archive is uploaded and committed.",
      backgroundAssetVersionStates,
    ),
    stateDetails: s.nullable(
      s.looseObject("Validation errors, warnings, and informational messages from processing.", {
        errors: stateDetailList("Errors that stopped processing."),
        warnings: stateDetailList("Warnings raised during processing."),
        infos: stateDetailList("Informational messages from processing."),
      }),
    ),
    locale: s.nullableString("Locale declared in the asset pack manifest, when the pack is localized."),
    platforms: s.nullable(
      s.array(
        "Platforms the asset pack version targets, taken from the uploaded manifest.",
        s.stringEnum("A content platform.", contentPlatforms),
      ),
    ),
    createdDate: s.nullableString("When the version was created, as an ISO 8601 timestamp."),
    backgroundAsset: backgroundAssetSummary,
    internalBetaRelease: releaseSummary(
      "The internal TestFlight release of this version.",
      backgroundAssetInternalBetaReleaseStates,
    ),
    externalBetaRelease: releaseSummary(
      "The external TestFlight release of this version.",
      backgroundAssetExternalBetaReleaseStates,
    ),
    appStoreRelease: releaseSummary("The App Store release of this version.", backgroundAssetAppStoreReleaseStates),
  },
  ["backgroundAsset", "internalBetaRelease", "externalBetaRelease", "appStoreRelease"],
);

const releaseOutput = (description: string, states: readonly string[]) =>
  s.actionOutput(
    {
      id: s.string("App Store Connect identifier of the release record."),
      state: nullableEnum("State of the release.", states),
      backgroundAssetVersionId: s.nullableString(
        "Identifier of the background asset version the release belongs to, or null when App Store Connect did not return it.",
      ),
    },
    description,
  );

const alternativeDistributionKeyResource = resourceObject(
  "A public key registered for an alternative marketplace or web distribution app.",
  alternativeDistributionKeyIdDescription,
  { publicKey: s.nullableString("PEM-encoded public key that was uploaded.") },
);

const alternativeDistributionDomainResource = resourceObject(
  "A base web domain registered for alternative distribution.",
  alternativeDistributionDomainIdDescription,
  {
    domain: s.nullableString("Base domain that serves the marketplace or web distribution app."),
    referenceName: s.nullableString("Display name chosen for the domain in App Store Connect."),
    createdDate: s.nullableString("When the domain was added, as an ISO 8601 timestamp."),
  },
);

const checksumObject = (description: string, algorithms: readonly string[]) =>
  s.nullable(
    s.looseObject(description, {
      hash: s.nullableString("Hex-encoded checksum value."),
      algorithm: nullableEnum("Algorithm the checksum was computed with.", algorithms),
    }),
  );

const alternativeDistributionPackageResource = resourceObject(
  "An alternative distribution package generated for an App Store version.",
  alternativeDistributionPackageIdDescription,
  {
    sourceFileChecksum: s.nullable(
      s.looseObject("Checksums of the source file the package was built from.", {
        file: checksumObject("Checksum of the source file.", fileChecksumAlgorithms),
        composite: checksumObject("Composite checksum of the source file.", compositeChecksumAlgorithms),
      }),
    ),
  },
);

const alternativeDistributionPackageVersionResource = resourceObject(
  "One version of an alternative distribution package.",
  alternativeDistributionPackageVersionIdDescription,
  {
    version: s.nullableString("Version string of the packaged app."),
    state: nullableEnum(
      "Whether this is the current package version or has been replaced by a newer one.",
      alternativeDistributionPackageVersionStates,
    ),
    url: s.nullableString("Time-limited download URL of the package version manifest."),
    urlExpirationDate: s.nullableString("When the download URL stops working, as an ISO 8601 timestamp."),
    fileChecksum: s.nullableString("Checksum of the package version file."),
  },
);

const packageFileResource = (description: string, idDescription: string) =>
  resourceObject(description, idDescription, {
    url: s.nullableString("Time-limited download URL of the file."),
    urlExpirationDate: s.nullableString("When the download URL stops working, as an ISO 8601 timestamp."),
    alternativeDistributionKeyBlob: s.nullableString(
      "Encrypted key blob the marketplace or web server needs to process the file. Treat it as a secret.",
    ),
    fileChecksum: s.nullableString("SHA-256 checksum of the file."),
  });

const alternativeDistributionPackageVariantResource = packageFileResource(
  "A device-specific variant of an alternative distribution package version.",
  "App Store Connect identifier of the package variant.",
);

const alternativeDistributionPackageDeltaResource = packageFileResource(
  "An incremental update between two alternative distribution package versions.",
  "App Store Connect identifier of the package delta.",
);

const marketplaceSearchDetailResource = resourceObject(
  "The search catalog configuration of an alternative marketplace app.",
  marketplaceSearchDetailIdDescription,
  {
    catalogUrl: s.nullableString(
      "URL of the marketplace sitemap Apple crawls to include its apps in Spotlight search.",
    ),
  },
);

export const appStoreConnectDistributionActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_background_assets",
    operationType: "read",
    description:
      "List the Apple-hosted background asset packs of one app, with the version currently in each of the App Store, internal TestFlight, and external TestFlight slots.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the background asset packs of one app.",
      {
        appId: nonEmptyString(appIdDescription),
        assetPackIdentifier: nonEmptyString("Return only the asset pack with this exact asset pack identifier."),
        archived: s.boolean("Return only archived asset packs when true, or only active ones when false."),
        versionLocale: nonEmptyString("Return only asset packs that have a version declared for this locale."),
        versionPlatform: s.stringEnum(
          "Return only asset packs that have a version targeting this platform.",
          contentPlatforms,
        ),
        sort: s.stringEnum("Sort order for the returned asset packs.", [
          "assetPackIdentifier",
          "-assetPackIdentifier",
          "createdDate",
          "-createdDate",
        ]),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "backgroundAssets",
      backgroundAssetResource,
      "Background asset packs returned for this page.",
      "A page of background asset packs.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_background_asset",
    operationType: "read",
    description:
      "Read one background asset pack, with the version currently in each of the App Store, internal TestFlight, and external TestFlight slots.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { backgroundAssetId: nonEmptyString(backgroundAssetIdDescription) },
      ["backgroundAssetId"],
      "Identifies the background asset pack to read.",
    ),
    outputSchema: singleOutput("backgroundAsset", backgroundAssetResource, "The requested background asset pack."),
  }),
  defineProviderAction(service, {
    name: "create_background_asset",
    operationType: "write",
    description:
      "Create an Apple-hosted background asset pack record for an app. The record starts without versions; create a version next, then upload and commit the asset pack archive through the generic proxy or Xcode.",
    requiredScopes: [],
    providerPermissions: [...manageBackgroundAssetsRoles],
    inputSchema: s.object(
      "The background asset pack to create.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the asset pack belongs to."),
        assetPackIdentifier: nonEmptyString(
          "Identifier the app uses to request this asset pack. It must match the identifier in the asset pack manifest.",
        ),
      },
      { required: ["appId", "assetPackIdentifier"] },
    ),
    outputSchema: singleOutput("backgroundAsset", backgroundAssetResource, "The created background asset pack."),
  }),
  defineProviderAction(service, {
    name: "update_background_asset",
    operationType: "destructive",
    description:
      "Archive or unarchive a background asset pack. Archiving is the only change App Store Connect accepts on an asset pack; the identifier and versions stay as they are.",
    requiredScopes: [],
    providerPermissions: [...manageBackgroundAssetsRoles],
    inputSchema: s.object(
      "The asset pack to update and its new archived state.",
      {
        backgroundAssetId: nonEmptyString(backgroundAssetIdDescription),
        archived: s.boolean("True to archive the asset pack, false to make it active again."),
      },
      { required: ["backgroundAssetId", "archived"] },
    ),
    outputSchema: singleOutput("backgroundAsset", backgroundAssetResource, "The updated background asset pack."),
  }),
  defineProviderAction(service, {
    name: "list_background_asset_versions",
    operationType: "read",
    description:
      "List the versions of one background asset pack with their processing state and their internal TestFlight, external TestFlight, and App Store release records.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of one background asset pack.",
      {
        backgroundAssetId: nonEmptyString(backgroundAssetIdDescription),
        version: nonEmptyString("Return only the version with this exact version number."),
        state: s.stringEnum("Return only versions in this processing state.", backgroundAssetVersionStates),
        locale: nonEmptyString("Return only versions declared for this locale."),
        platform: s.stringEnum("Return only versions that target this platform.", contentPlatforms),
        internalBetaReleaseState: s.stringEnum(
          "Return only versions whose internal TestFlight release is in this state.",
          backgroundAssetInternalBetaReleaseStates,
        ),
        externalBetaReleaseState: s.stringEnum(
          "Return only versions whose external TestFlight release is in this state.",
          backgroundAssetExternalBetaReleaseStates,
        ),
        appStoreReleaseState: s.stringEnum(
          "Return only versions whose App Store release is in this state.",
          backgroundAssetAppStoreReleaseStates,
        ),
        sort: s.stringEnum("Sort order for the returned versions.", ["version", "-version"]),
        ...paginationInputs,
      },
      { required: ["backgroundAssetId"] },
    ),
    outputSchema: pageOutput(
      "backgroundAssetVersions",
      backgroundAssetVersionResource,
      "Background asset versions returned for this page.",
      "A page of background asset versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_background_asset_version",
    operationType: "read",
    description:
      "Read one background asset version with its processing state, validation messages, parent asset pack, and release records.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { backgroundAssetVersionId: nonEmptyString(backgroundAssetVersionIdDescription) },
      ["backgroundAssetVersionId"],
      "Identifies the background asset version to read.",
    ),
    outputSchema: singleOutput(
      "backgroundAssetVersion",
      backgroundAssetVersionResource,
      "The requested background asset version.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_background_asset_version",
    operationType: "write",
    description:
      "Create a new version record for a background asset pack. App Store Connect assigns the next version number automatically; the version stays in AWAITING_UPLOAD until the asset pack archive is uploaded and committed, which needs the binary upload endpoints outside these actions.",
    requiredScopes: [],
    providerPermissions: [...manageBackgroundAssetsRoles],
    inputSchema: s.actionInput(
      { backgroundAssetId: nonEmptyString(backgroundAssetIdDescription) },
      ["backgroundAssetId"],
      "Identifies the asset pack to create a version for.",
    ),
    outputSchema: singleOutput(
      "backgroundAssetVersion",
      backgroundAssetVersionResource,
      "The created background asset version.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_background_asset_version_app_store_release",
    operationType: "read",
    description:
      "Read the App Store release record of a background asset version, which tracks its App Review and distribution state.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        backgroundAssetVersionAppStoreReleaseId: nonEmptyString(
          "App Store Connect identifier of the App Store release record, as returned in appStoreRelease of a background asset version.",
        ),
      },
      ["backgroundAssetVersionAppStoreReleaseId"],
      "Identifies the App Store release record to read.",
    ),
    outputSchema: releaseOutput(
      "The App Store release record of a background asset version.",
      backgroundAssetAppStoreReleaseStates,
    ),
  }),
  defineProviderAction(service, {
    name: "get_background_asset_version_internal_beta_release",
    operationType: "read",
    description:
      "Read the internal TestFlight release record of a background asset version. App Store Connect creates it once the version finishes processing.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        backgroundAssetVersionInternalBetaReleaseId: nonEmptyString(
          "App Store Connect identifier of the internal beta release record, as returned in internalBetaRelease of a background asset version.",
        ),
      },
      ["backgroundAssetVersionInternalBetaReleaseId"],
      "Identifies the internal beta release record to read.",
    ),
    outputSchema: releaseOutput(
      "The internal TestFlight release record of a background asset version.",
      backgroundAssetInternalBetaReleaseStates,
    ),
  }),
  defineProviderAction(service, {
    name: "get_background_asset_version_external_beta_release",
    operationType: "read",
    description:
      "Read the external TestFlight release record of a background asset version, which tracks its beta review state.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        backgroundAssetVersionExternalBetaReleaseId: nonEmptyString(
          "App Store Connect identifier of the external beta release record, as returned in externalBetaRelease of a background asset version.",
        ),
      },
      ["backgroundAssetVersionExternalBetaReleaseId"],
      "Identifies the external beta release record to read.",
    ),
    outputSchema: releaseOutput(
      "The external TestFlight release record of a background asset version.",
      backgroundAssetExternalBetaReleaseStates,
    ),
  }),
  defineProviderAction(service, {
    name: "list_alternative_distribution_keys",
    operationType: "read",
    description:
      "List the alternative distribution public keys of the team. A key without an app applies to every alternative distribution app on the account.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        hasApp: s.boolean("Return only keys tied to a single app when true, or only account-wide keys when false."),
        ...paginationInputs,
      },
      [],
      "Filters for browsing alternative distribution keys.",
    ),
    outputSchema: pageOutput(
      "alternativeDistributionKeys",
      alternativeDistributionKeyResource,
      "Alternative distribution keys returned for this page.",
      "A page of alternative distribution keys.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_alternative_distribution_key",
    operationType: "read",
    description: "Read one alternative distribution key and its public key.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { alternativeDistributionKeyId: nonEmptyString(alternativeDistributionKeyIdDescription) },
      ["alternativeDistributionKeyId"],
      "Identifies the alternative distribution key to read.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionKey",
      alternativeDistributionKeyResource,
      "The requested alternative distribution key.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_alternative_distribution_key",
    operationType: "read",
    description: "Read the alternative distribution key tied to one app, or null when the app has no key of its own.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: nonEmptyString(appIdDescription) },
      ["appId"],
      "Identifies the app whose key to read.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionKey",
      s.nullable(alternativeDistributionKeyResource),
      "The key tied to the app, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_alternative_distribution_key",
    operationType: "write",
    description:
      "Upload the public half of an alternative distribution key pair. Without appId the key applies to every alternative distribution app on the account; with appId it is tied to that marketplace or web distribution app. The private half never goes to Apple and signs the marketplace JWTs or install verification.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The public key to register.",
      {
        publicKey: nonEmptyString("PEM-encoded public key, including the BEGIN and END PUBLIC KEY lines."),
        appId: nonEmptyString(
          "App Store Connect identifier of the app to tie the key to. Leave empty for an account-wide key.",
        ),
      },
      { required: ["publicKey"] },
    ),
    outputSchema: singleOutput(
      "alternativeDistributionKey",
      alternativeDistributionKeyResource,
      "The registered alternative distribution key.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_alternative_distribution_key",
    operationType: "destructive",
    description:
      "Remove an alternative distribution key from the account. Tokens signed with the matching private key stop being accepted.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { alternativeDistributionKeyId: nonEmptyString(alternativeDistributionKeyIdDescription) },
      ["alternativeDistributionKeyId"],
      "Identifies the alternative distribution key to remove.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the removed alternative distribution key."),
      "Confirmation that the key was removed.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_alternative_distribution_domains",
    operationType: "read",
    description: "List the base web domains registered for alternative distribution on the account.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { ...paginationInputs },
      [],
      "Pagination for browsing alternative distribution domains.",
    ),
    outputSchema: pageOutput(
      "alternativeDistributionDomains",
      alternativeDistributionDomainResource,
      "Alternative distribution domains returned for this page.",
      "A page of alternative distribution domains.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_alternative_distribution_domain",
    operationType: "read",
    description: "Read one alternative distribution domain.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionDomainId: nonEmptyString(alternativeDistributionDomainIdDescription),
      },
      ["alternativeDistributionDomainId"],
      "Identifies the alternative distribution domain to read.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionDomain",
      alternativeDistributionDomainResource,
      "The requested alternative distribution domain.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_alternative_distribution_domain",
    operationType: "write",
    description:
      "Register the base web domain that serves a marketplace app or web distribution app. All app pages and the marketplace sitemap must live on this domain, and it is enabled for every alternative distribution app on the account.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The domain to register.",
      {
        domain: nonEmptyString("Base domain, such as marketplace.example.com."),
        referenceName: nonEmptyString("Display name for the domain in App Store Connect."),
      },
      { required: ["domain", "referenceName"] },
    ),
    outputSchema: singleOutput(
      "alternativeDistributionDomain",
      alternativeDistributionDomainResource,
      "The registered alternative distribution domain.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_alternative_distribution_domain",
    operationType: "destructive",
    description:
      "Delete an alternative distribution domain. Apps served from that domain can no longer be installed through it.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        alternativeDistributionDomainId: nonEmptyString(alternativeDistributionDomainIdDescription),
      },
      ["alternativeDistributionDomainId"],
      "Identifies the alternative distribution domain to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted alternative distribution domain."),
      "Confirmation that the domain was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_alternative_distribution_package",
    operationType: "read",
    description:
      "Read one alternative distribution package and the checksums of the source build it was generated from. Use list_alternative_distribution_package_versions for its downloadable versions.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionPackageId: nonEmptyString(alternativeDistributionPackageIdDescription),
      },
      ["alternativeDistributionPackageId"],
      "Identifies the alternative distribution package to read.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionPackage",
      alternativeDistributionPackageResource,
      "The requested alternative distribution package.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_app_store_version_alternative_distribution_package",
    operationType: "read",
    description:
      "Read the alternative distribution package generated for one App Store version, or null when none exists yet.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the App Store version."),
      },
      ["appStoreVersionId"],
      "Identifies the App Store version whose package to read.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionPackage",
      s.nullable(alternativeDistributionPackageResource),
      "The package of the App Store version, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_alternative_distribution_package",
    operationType: "write",
    description:
      "Generate the alternative distribution package for an already approved App Store version. Versions approved after alternative distribution was enabled get their package automatically; use this for versions that were approved before.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        appStoreVersionId: nonEmptyString("App Store Connect identifier of the approved App Store version to package."),
      },
      ["appStoreVersionId"],
      "Identifies the App Store version to package.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionPackage",
      alternativeDistributionPackageResource,
      "The created alternative distribution package.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_alternative_distribution_package_versions",
    operationType: "read",
    description: "List the versions of an alternative distribution package with their time-limited download URLs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the versions of one alternative distribution package.",
      {
        alternativeDistributionPackageId: nonEmptyString(alternativeDistributionPackageIdDescription),
        state: s.stringEnum("Return only versions in this state.", alternativeDistributionPackageVersionStates),
        ...paginationInputs,
      },
      { required: ["alternativeDistributionPackageId"] },
    ),
    outputSchema: pageOutput(
      "alternativeDistributionPackageVersions",
      alternativeDistributionPackageVersionResource,
      "Package versions returned for this page.",
      "A page of alternative distribution package versions.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_alternative_distribution_package_version",
    operationType: "read",
    description: "Read one alternative distribution package version and its time-limited download URL.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionPackageVersionId: nonEmptyString(alternativeDistributionPackageVersionIdDescription),
      },
      ["alternativeDistributionPackageVersionId"],
      "Identifies the package version to read.",
    ),
    outputSchema: singleOutput(
      "alternativeDistributionPackageVersion",
      alternativeDistributionPackageVersionResource,
      "The requested alternative distribution package version.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_alternative_distribution_package_version_variants",
    operationType: "read",
    description:
      "List the device-specific variants of an alternative distribution package version, each with its download URL and encrypted key blob.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionPackageVersionId: nonEmptyString(alternativeDistributionPackageVersionIdDescription),
        ...paginationInputs,
      },
      ["alternativeDistributionPackageVersionId"],
      "Identifies the package version whose variants to list.",
    ),
    outputSchema: pageOutput(
      "variants",
      alternativeDistributionPackageVariantResource,
      "Package variants returned for this page.",
      "A page of alternative distribution package variants.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_alternative_distribution_package_variant",
    operationType: "read",
    description:
      "Read one variant of an alternative distribution package version, with its download URL and encrypted key blob.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionPackageVariantId: nonEmptyString("App Store Connect identifier of the package variant."),
      },
      ["alternativeDistributionPackageVariantId"],
      "Identifies the package variant to read.",
    ),
    outputSchema: singleOutput(
      "variant",
      alternativeDistributionPackageVariantResource,
      "The requested package variant.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_alternative_distribution_package_version_deltas",
    operationType: "read",
    description:
      "List the delta updates of an alternative distribution package version, each with its download URL and encrypted key blob.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionPackageVersionId: nonEmptyString(alternativeDistributionPackageVersionIdDescription),
        ...paginationInputs,
      },
      ["alternativeDistributionPackageVersionId"],
      "Identifies the package version whose deltas to list.",
    ),
    outputSchema: pageOutput(
      "deltas",
      alternativeDistributionPackageDeltaResource,
      "Package deltas returned for this page.",
      "A page of alternative distribution package deltas.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_alternative_distribution_package_delta",
    operationType: "read",
    description:
      "Read one delta update of an alternative distribution package version, with its download URL and encrypted key blob.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        alternativeDistributionPackageDeltaId: nonEmptyString("App Store Connect identifier of the package delta."),
      },
      ["alternativeDistributionPackageDeltaId"],
      "Identifies the package delta to read.",
    ),
    outputSchema: singleOutput("delta", alternativeDistributionPackageDeltaResource, "The requested package delta."),
  }),
  defineProviderAction(service, {
    name: "get_marketplace_search_detail",
    operationType: "read",
    description:
      "Read the marketplace search detail of an alternative marketplace app, or null when no catalog URL has been configured.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { appId: nonEmptyString("App Store Connect identifier of the marketplace app.") },
      ["appId"],
      "Identifies the marketplace app whose search detail to read.",
    ),
    outputSchema: singleOutput(
      "marketplaceSearchDetail",
      s.nullable(marketplaceSearchDetailResource),
      "The search detail of the marketplace app, or null when there is none.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_marketplace_search_detail",
    operationType: "write",
    description:
      "Set the sitemap catalog URL of an alternative marketplace app so Apple can crawl it and include the marketplace apps in Spotlight search. Each marketplace app holds one search detail.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The catalog URL to register.",
      {
        appId: nonEmptyString("App Store Connect identifier of the marketplace app."),
        catalogUrl: urlString("HTTPS URL of the marketplace sitemap, hosted on the registered domain."),
      },
      { required: ["appId", "catalogUrl"] },
    ),
    outputSchema: singleOutput(
      "marketplaceSearchDetail",
      marketplaceSearchDetailResource,
      "The created marketplace search detail.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_marketplace_search_detail",
    operationType: "destructive",
    description: "Replace the sitemap catalog URL of an existing marketplace search detail.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The search detail to update and its new catalog URL.",
      {
        marketplaceSearchDetailId: nonEmptyString(marketplaceSearchDetailIdDescription),
        catalogUrl: urlString("New HTTPS URL of the marketplace sitemap."),
      },
      { required: ["marketplaceSearchDetailId", "catalogUrl"] },
    ),
    outputSchema: singleOutput(
      "marketplaceSearchDetail",
      marketplaceSearchDetailResource,
      "The updated marketplace search detail.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_marketplace_search_detail",
    operationType: "destructive",
    description:
      "Delete the marketplace search detail of an alternative marketplace app. Apple stops crawling the catalog URL.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      { marketplaceSearchDetailId: nonEmptyString(marketplaceSearchDetailIdDescription) },
      ["marketplaceSearchDetailId"],
      "Identifies the marketplace search detail to delete.",
    ),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted marketplace search detail."),
      "Confirmation that the search detail was deleted.",
    ),
  }),
];
