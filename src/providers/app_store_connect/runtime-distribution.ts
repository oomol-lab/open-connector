import type {
  AppStoreConnectContext,
  AppStoreConnectHandlers,
  AppStoreConnectRequest,
  IncludedResources,
} from "./runtime-helpers.ts";

import { rawStringOrNull, optionalBoolean, booleanString, pickOptionalString } from "../../core/cast.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getResource,
  indexIncludedResources,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readIncludedResource,
  readOptionalAppStoreConnectId,
  readOptionalResource,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const backgroundAssetLabel = "App Store Connect background asset";
const backgroundAssetVersionLabel = "App Store Connect background asset version";

const backgroundAssetInclude = "appStoreVersion,internalBetaVersion,externalBetaVersion";

const backgroundAssetVersionInclude = "backgroundAsset,internalBetaRelease,externalBetaRelease,appStoreRelease";

export const appStoreConnectDistributionHandlers: AppStoreConnectHandlers = {
  async list_background_assets(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "backgroundAssets"),
      label: `${backgroundAssetLabel} list`,
      query: {
        "filter[assetPackIdentifier]": pickOptionalString(input, "assetPackIdentifier"),
        "filter[archived]": booleanString(input.archived),
        "filter[versions.locale]": pickOptionalString(input, "versionLocale"),
        "filter[versions.platforms]": pickOptionalString(input, "versionPlatform"),
        "sort": pickOptionalString(input, "sort"),
        "include": backgroundAssetInclude,
      },
    });
    return {
      backgroundAssets: page.resources.map((resource) => normalizeBackgroundAsset(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_background_asset(input, context) {
    const { resource, included } = await requestSingle(
      context,
      {
        path: resourcePath("/v1/backgroundAssets", readAppStoreConnectId(input.backgroundAssetId, "backgroundAssetId")),
        query: { include: backgroundAssetInclude },
      },
      backgroundAssetLabel,
    );
    return { backgroundAsset: normalizeBackgroundAsset(resource, included) };
  },

  async create_background_asset(input, context) {
    const { resource, included } = await requestSingle(
      context,
      {
        method: "POST",
        path: "/v1/backgroundAssets",
        body: {
          data: {
            type: "backgroundAssets",
            attributes: {
              assetPackIdentifier: requiredInputString(input.assetPackIdentifier, "assetPackIdentifier"),
            },
            relationships: {
              app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
            },
          },
        },
      },
      backgroundAssetLabel,
    );
    return { backgroundAsset: normalizeBackgroundAsset(resource, included) };
  },

  async update_background_asset(input, context) {
    const backgroundAssetId = readAppStoreConnectId(input.backgroundAssetId, "backgroundAssetId");
    const archived = optionalBoolean(input.archived);

    requireAnyAttribute({ archived }, "archived must be provided");

    const { resource, included } = await requestSingle(
      context,
      {
        method: "PATCH",
        path: resourcePath("/v1/backgroundAssets", backgroundAssetId),
        body: {
          data: { type: "backgroundAssets", id: backgroundAssetId, attributes: { archived } },
        },
      },
      backgroundAssetLabel,
    );
    return { backgroundAsset: normalizeBackgroundAsset(resource, included) };
  },

  async list_background_asset_versions(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath(
        "/v1/backgroundAssets",
        readAppStoreConnectId(input.backgroundAssetId, "backgroundAssetId"),
        "versions",
      ),
      label: `${backgroundAssetVersionLabel} list`,
      query: {
        "filter[version]": pickOptionalString(input, "version"),
        "filter[state]": pickOptionalString(input, "state"),
        "filter[locale]": pickOptionalString(input, "locale"),

        "filter[platforms]": pickOptionalString(input, "platform"),
        "filter[internalBetaRelease.state]": pickOptionalString(input, "internalBetaReleaseState"),
        "filter[externalBetaRelease.state]": pickOptionalString(input, "externalBetaReleaseState"),
        "filter[appStoreRelease.state]": pickOptionalString(input, "appStoreReleaseState"),
        "sort": pickOptionalString(input, "sort"),
        "include": backgroundAssetVersionInclude,
      },
    });
    return {
      backgroundAssetVersions: page.resources.map((resource) =>
        normalizeBackgroundAssetVersion(resource, page.included),
      ),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_background_asset_version(input, context) {
    const { resource, included } = await requestSingle(
      context,
      {
        path: resourcePath(
          "/v1/backgroundAssetVersions",
          readAppStoreConnectId(input.backgroundAssetVersionId, "backgroundAssetVersionId"),
        ),
        query: { include: backgroundAssetVersionInclude },
      },
      backgroundAssetVersionLabel,
    );
    return { backgroundAssetVersion: normalizeBackgroundAssetVersion(resource, included) };
  },

  async create_background_asset_version(input, context) {
    const { resource, included } = await requestSingle(
      context,
      {
        method: "POST",
        path: "/v1/backgroundAssetVersions",
        body: {
          data: {
            type: "backgroundAssetVersions",
            relationships: {
              backgroundAsset: toOneLinkage(
                "backgroundAssets",
                readAppStoreConnectId(input.backgroundAssetId, "backgroundAssetId"),
              ),
            },
          },
        },
      },
      backgroundAssetVersionLabel,
    );
    return { backgroundAssetVersion: normalizeBackgroundAssetVersion(resource, included) };
  },

  async get_background_asset_version_app_store_release(input, context) {
    return readRelease(
      context,
      "/v1/backgroundAssetVersionAppStoreReleases",
      input.backgroundAssetVersionAppStoreReleaseId,
      "backgroundAssetVersionAppStoreReleaseId",
      "App Store Connect background asset version App Store release",
    );
  },

  async get_background_asset_version_internal_beta_release(input, context) {
    return readRelease(
      context,
      "/v1/backgroundAssetVersionInternalBetaReleases",
      input.backgroundAssetVersionInternalBetaReleaseId,
      "backgroundAssetVersionInternalBetaReleaseId",
      "App Store Connect background asset version internal beta release",
    );
  },

  async get_background_asset_version_external_beta_release(input, context) {
    return readRelease(
      context,
      "/v1/backgroundAssetVersionExternalBetaReleases",
      input.backgroundAssetVersionExternalBetaReleaseId,
      "backgroundAssetVersionExternalBetaReleaseId",
      "App Store Connect background asset version external beta release",
    );
  },

  async list_alternative_distribution_keys(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/alternativeDistributionKeys",
      label: "App Store Connect alternative distribution key",

      query: { "exists[app]": booleanString(input.hasApp) },
    });
    return {
      alternativeDistributionKeys: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_alternative_distribution_key(input, context) {
    return {
      alternativeDistributionKey: await getResource(
        context,
        resourcePath(
          "/v1/alternativeDistributionKeys",
          readAppStoreConnectId(input.alternativeDistributionKeyId, "alternativeDistributionKeyId"),
        ),
        "App Store Connect alternative distribution key",
      ),
    };
  },

  async get_app_alternative_distribution_key(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "alternativeDistributionKey"),
    });
    return {
      alternativeDistributionKey: readOptionalResource(payload, "App Store Connect alternative distribution key"),
    };
  },

  async create_alternative_distribution_key(input, context) {
    const appId = readOptionalAppStoreConnectId(input.appId, "appId");
    const alternativeDistributionKey = await createResource(context, {
      path: "/v1/alternativeDistributionKeys",
      type: "alternativeDistributionKeys",
      label: "App Store Connect alternative distribution key",
      attributes: { publicKey: requiredInputString(input.publicKey, "publicKey") },
      relationships: appId === undefined ? undefined : { app: toOneLinkage("apps", appId) },
    });
    return { alternativeDistributionKey };
  },

  async delete_alternative_distribution_key(input, context) {
    const alternativeDistributionKeyId = readAppStoreConnectId(
      input.alternativeDistributionKeyId,
      "alternativeDistributionKeyId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/alternativeDistributionKeys", alternativeDistributionKeyId),
      "Removing the App Store Connect alternative distribution key",
    );
    return { id: alternativeDistributionKeyId, deleted: true };
  },

  async list_alternative_distribution_domains(input, context) {
    const page = await listPage(context, input, {
      path: "/v1/alternativeDistributionDomains",
      label: "App Store Connect alternative distribution domain",
    });
    return {
      alternativeDistributionDomains: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_alternative_distribution_domain(input, context) {
    return {
      alternativeDistributionDomain: await getResource(
        context,
        resourcePath(
          "/v1/alternativeDistributionDomains",
          readAppStoreConnectId(input.alternativeDistributionDomainId, "alternativeDistributionDomainId"),
        ),
        "App Store Connect alternative distribution domain",
      ),
    };
  },

  async create_alternative_distribution_domain(input, context) {
    const alternativeDistributionDomain = await createResource(context, {
      path: "/v1/alternativeDistributionDomains",
      type: "alternativeDistributionDomains",
      label: "App Store Connect alternative distribution domain",
      attributes: {
        domain: requiredInputString(input.domain, "domain"),
        referenceName: requiredInputString(input.referenceName, "referenceName"),
      },
    });
    return { alternativeDistributionDomain };
  },

  async delete_alternative_distribution_domain(input, context) {
    const alternativeDistributionDomainId = readAppStoreConnectId(
      input.alternativeDistributionDomainId,
      "alternativeDistributionDomainId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/alternativeDistributionDomains", alternativeDistributionDomainId),
      "Deleting the App Store Connect alternative distribution domain",
    );
    return { id: alternativeDistributionDomainId, deleted: true };
  },

  async get_alternative_distribution_package(input, context) {
    return {
      alternativeDistributionPackage: await getResource(
        context,
        resourcePath(
          "/v1/alternativeDistributionPackages",
          readAppStoreConnectId(input.alternativeDistributionPackageId, "alternativeDistributionPackageId"),
        ),
        "App Store Connect alternative distribution package",
      ),
    };
  },

  async get_app_store_version_alternative_distribution_package(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath(
        "/v1/appStoreVersions",
        readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        "alternativeDistributionPackage",
      ),
    });
    return {
      alternativeDistributionPackage: readOptionalResource(
        payload,
        "App Store Connect alternative distribution package",
      ),
    };
  },

  async create_alternative_distribution_package(input, context) {
    const alternativeDistributionPackage = await createResource(context, {
      path: "/v1/alternativeDistributionPackages",
      type: "alternativeDistributionPackages",
      label: "App Store Connect alternative distribution package",
      relationships: {
        appStoreVersion: toOneLinkage(
          "appStoreVersions",
          readAppStoreConnectId(input.appStoreVersionId, "appStoreVersionId"),
        ),
      },
    });
    return { alternativeDistributionPackage };
  },

  async list_alternative_distribution_package_versions(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/alternativeDistributionPackages",
        readAppStoreConnectId(input.alternativeDistributionPackageId, "alternativeDistributionPackageId"),
        "versions",
      ),
      label: "App Store Connect alternative distribution package version",
      query: { "filter[state]": pickOptionalString(input, "state") },
    });
    return {
      alternativeDistributionPackageVersions: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async get_alternative_distribution_package_version(input, context) {
    return {
      alternativeDistributionPackageVersion: await getResource(
        context,
        resourcePath(
          "/v1/alternativeDistributionPackageVersions",
          readAppStoreConnectId(
            input.alternativeDistributionPackageVersionId,
            "alternativeDistributionPackageVersionId",
          ),
        ),
        "App Store Connect alternative distribution package version",
      ),
    };
  },

  async list_alternative_distribution_package_version_variants(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/alternativeDistributionPackageVersions",
        readAppStoreConnectId(input.alternativeDistributionPackageVersionId, "alternativeDistributionPackageVersionId"),
        "variants",
      ),
      label: "App Store Connect alternative distribution package variant",
    });
    return { variants: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_alternative_distribution_package_variant(input, context) {
    return {
      variant: await getResource(
        context,
        resourcePath(
          "/v1/alternativeDistributionPackageVariants",
          readAppStoreConnectId(
            input.alternativeDistributionPackageVariantId,
            "alternativeDistributionPackageVariantId",
          ),
        ),
        "App Store Connect alternative distribution package variant",
      ),
    };
  },

  async list_alternative_distribution_package_version_deltas(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath(
        "/v1/alternativeDistributionPackageVersions",
        readAppStoreConnectId(input.alternativeDistributionPackageVersionId, "alternativeDistributionPackageVersionId"),
        "deltas",
      ),
      label: "App Store Connect alternative distribution package delta",
    });
    return { deltas: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_alternative_distribution_package_delta(input, context) {
    return {
      delta: await getResource(
        context,
        resourcePath(
          "/v1/alternativeDistributionPackageDeltas",
          readAppStoreConnectId(input.alternativeDistributionPackageDeltaId, "alternativeDistributionPackageDeltaId"),
        ),
        "App Store Connect alternative distribution package delta",
      ),
    };
  },

  async get_marketplace_search_detail(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "marketplaceSearchDetail"),
    });
    return {
      marketplaceSearchDetail: readOptionalResource(payload, "App Store Connect marketplace search detail"),
    };
  },

  async create_marketplace_search_detail(input, context) {
    const marketplaceSearchDetail = await createResource(context, {
      path: "/v1/marketplaceSearchDetails",
      type: "marketplaceSearchDetails",
      label: "App Store Connect marketplace search detail",
      attributes: { catalogUrl: requiredInputString(input.catalogUrl, "catalogUrl") },
      relationships: { app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")) },
    });
    return { marketplaceSearchDetail };
  },

  async update_marketplace_search_detail(input, context) {
    const marketplaceSearchDetailId = readAppStoreConnectId(
      input.marketplaceSearchDetailId,
      "marketplaceSearchDetailId",
    );
    const catalogUrl = pickOptionalString(input, "catalogUrl");

    requireAnyAttribute({ catalogUrl }, "catalogUrl must be provided");

    const marketplaceSearchDetail = await updateResource(context, {
      path: resourcePath("/v1/marketplaceSearchDetails", marketplaceSearchDetailId),
      type: "marketplaceSearchDetails",
      id: marketplaceSearchDetailId,
      label: "App Store Connect marketplace search detail",
      attributes: { catalogUrl },
    });
    return { marketplaceSearchDetail };
  },

  async delete_marketplace_search_detail(input, context) {
    const marketplaceSearchDetailId = readAppStoreConnectId(
      input.marketplaceSearchDetailId,
      "marketplaceSearchDetailId",
    );
    await deleteResource(
      context,
      resourcePath("/v1/marketplaceSearchDetails", marketplaceSearchDetailId),
      "Deleting the App Store Connect marketplace search detail",
    );
    return { id: marketplaceSearchDetailId, deleted: true };
  },
};

async function requestSingle(
  context: AppStoreConnectContext,
  request: AppStoreConnectRequest,
  label: string,
): Promise<{ resource: Record<string, unknown>; included: IncludedResources }> {
  const { payload } = await requestAppStoreConnect(context, request);
  return { resource: readResource(payload, label), included: indexIncludedResources(payload) };
}

function normalizeBackgroundAsset(
  resource: Record<string, unknown>,
  included: IncludedResources,
): Record<string, unknown> {
  return {
    ...normalizeResource(resource, backgroundAssetLabel),
    appStoreVersion: readBackgroundAssetVersionSummary(readIncludedResource(resource, "appStoreVersion", included)),
    internalBetaVersion: readBackgroundAssetVersionSummary(
      readIncludedResource(resource, "internalBetaVersion", included),
    ),
    externalBetaVersion: readBackgroundAssetVersionSummary(
      readIncludedResource(resource, "externalBetaVersion", included),
    ),
  };
}

function normalizeBackgroundAssetVersion(
  resource: Record<string, unknown>,
  included: IncludedResources,
): Record<string, unknown> {
  return {
    ...normalizeResource(resource, backgroundAssetVersionLabel),
    backgroundAsset: readBackgroundAssetSummary(readIncludedResource(resource, "backgroundAsset", included)),
    internalBetaRelease: readReleaseSummary(readIncludedResource(resource, "internalBetaRelease", included)),
    externalBetaRelease: readReleaseSummary(readIncludedResource(resource, "externalBetaRelease", included)),
    appStoreRelease: readReleaseSummary(readIncludedResource(resource, "appStoreRelease", included)),
  };
}

function readBackgroundAssetVersionSummary(
  resource: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const version = normalizeResource(resource, backgroundAssetVersionLabel);
  return {
    id: version.id,
    version: rawStringOrNull(version.version),
    state: rawStringOrNull(version.state),
    locale: rawStringOrNull(version.locale),
    platforms: readStringList(version.platforms) ?? null,
  };
}

function readBackgroundAssetSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const asset = normalizeResource(resource, backgroundAssetLabel);
  return { id: asset.id, assetPackIdentifier: rawStringOrNull(asset.assetPackIdentifier) };
}

function readReleaseSummary(resource: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!resource) {
    return null;
  }

  const release = normalizeResource(resource, "App Store Connect background asset version release");
  return { id: release.id, state: rawStringOrNull(release.state) };
}

async function readRelease(
  context: AppStoreConnectContext,
  base: string,
  rawId: unknown,
  fieldName: string,
  label: string,
): Promise<Record<string, unknown>> {
  const { resource } = await requestSingle(
    context,
    {
      path: resourcePath(base, readAppStoreConnectId(rawId, fieldName)),
      query: { include: "backgroundAssetVersion" },
    },
    label,
  );
  const release = normalizeResource(resource, label);
  return {
    id: release.id,
    state: rawStringOrNull(release.state),
    backgroundAssetVersionId: readRelationshipId(resource, "backgroundAssetVersion"),
  };
}
