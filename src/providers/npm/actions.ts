import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "npm";

const stringValueSchema = s.string("A string value.");
const optionalPerson = s.looseObject("An npm user identity with provider-defined fields.", {
  username: s.nonEmptyString("The npm username."),
  email: s.string("The npm user-provided email value."),
});

const searchPackageSchema = s.looseRequiredObject(
  "An npm package returned by registry search, with stable fields described explicitly.",
  {
    name: s.nonEmptyString("The package name, including its scope when present."),
    version: s.nonEmptyString("The latest package version returned by npm search."),
    description: s.string("The package description."),
    keywords: s.array("Keywords associated with the package.", s.string("A package keyword.")),
    sanitized_name: s.nonEmptyString("The package name normalized by npm search."),
    publisher: optionalPerson,
    maintainers: s.array("Maintainers returned by npm search.", optionalPerson),
    license: s.string("The package license expression."),
    date: s.string("The package update timestamp returned by npm search."),
    links: s.record("Links associated with the package, keyed by link type.", stringValueSchema),
  },
  {
    optional: ["description", "keywords", "sanitized_name", "publisher", "maintainers", "license", "date", "links"],
  },
);

const scoreSchema = s.looseObject("npm search ranking information.", {
  final: s.number("The final npm search score."),
  detail: s.looseObject("Individual npm search score components.", {
    quality: s.number("The quality score component."),
    popularity: s.number("The popularity score component."),
    maintenance: s.number("The maintenance score component."),
  }),
});

const searchResultSchema = s.looseRequiredObject(
  "One npm registry search result.",
  {
    package: searchPackageSchema,
    score: scoreSchema,
    downloads: s.looseObject("Recent download counts for the package.", {
      monthly: s.nonNegativeInteger("Monthly package downloads."),
      weekly: s.nonNegativeInteger("Weekly package downloads."),
    }),
    dependents: s.anyOf("The dependent count returned by npm, as a number or numeric string.", [
      s.nonNegativeInteger("The dependent count as an integer."),
      s.string("The dependent count as a string."),
    ]),
    updated: s.string("The timestamp when npm refreshed this search result."),
    searchScore: s.number("The top-level npm search score."),
    flags: s.looseObject("npm search flags for the package."),
  },
  { optional: ["downloads", "dependents", "updated", "searchScore", "flags"] },
);

const getCurrentUserInputSchema = s.object("Input for retrieving the current npm user.", {});
const getCurrentUserOutputSchema = s.requiredObject("The npm user associated with the access token.", {
  username: s.nonEmptyString("The npm username associated with the access token."),
});

const searchPackagesInputSchema = s.object(
  "Input for searching packages in the npm registry.",
  {
    text: s.string("The npm full-text package search query.", { minLength: 2, maxLength: 64 }),
    size: s.integer("The number of results to return, from 1 to 250.", {
      minimum: 1,
      maximum: 250,
    }),
    from: s.nonNegativeInteger("The zero-based result offset."),
  },
  { optional: ["size", "from"] },
);

const searchPackagesOutputSchema = s.requiredObject("npm registry package search results.", {
  objects: s.array("Packages matching the search query.", searchResultSchema),
  total: s.nonNegativeInteger("The total number of matching packages."),
  time: s.string("The npm search response timestamp or timing value."),
});

const packageNameSchema = s.nonEmptyString("The npm package name, including its scope when present.");

const downloadPeriodPresetSchema = s.stringEnum("A preset period supported by the npm downloads API.", [
  "last-day",
  "last-week",
  "last-month",
  "last-year",
]);

const downloadDateRangeSchema = s.requiredObject("An inclusive custom date range for npm download statistics.", {
  startDate: s.date("The inclusive start date in YYYY-MM-DD format."),
  endDate: s.date("The inclusive end date in YYYY-MM-DD format."),
});

const downloadPeriodSchema = s.oneOf([downloadPeriodPresetSchema, downloadDateRangeSchema], {
  description: "A preset npm download period or an inclusive custom date range.",
});

const downloadCountSchema = s.requiredObject("Download totals for one npm package.", {
  packageName: packageNameSchema,
  downloads: s.nonNegativeInteger("The number of package downloads in the period."),
});

const dailyDownloadSchema = s.requiredObject("Download count for one UTC calendar day.", {
  day: s.date("The UTC calendar day in YYYY-MM-DD format."),
  downloads: s.nonNegativeInteger("The number of package downloads on this day."),
});

const versionDownloadSchema = s.requiredObject("Recent download count for one package version.", {
  version: s.nonEmptyString("The published package version."),
  downloads: s.nonNegativeInteger("Downloads for this version during the last seven days."),
});

const advisoryCvssSchema = s.requiredObject("CVSS data reported by the npm advisory service.", {
  score: s.number("The advisory CVSS score."),
  vectorString: s.nullable(s.string("The advisory CVSS vector string, or null when npm has not assigned one.")),
});

const advisorySchema = s.requiredObject("One npm security advisory affecting a requested package.", {
  id: s.nonNegativeInteger("The numeric npm advisory identifier."),
  url: s.url("The canonical advisory URL."),
  title: s.nonEmptyString("The advisory title."),
  severity: s.nonEmptyString("The severity reported by npm."),
  vulnerableVersions: s.nonEmptyString("The affected version range reported by npm."),
  cwe: s.array("CWE identifiers associated with the advisory.", s.string("One CWE identifier.")),
  cvss: advisoryCvssSchema,
});

const exactPackageVersionSchema = s.nonEmptyString("An exact published package version.");

const auditPackagesSchema = s.record(
  "Package names mapped to exact published versions to audit.",
  s.array("Exact published versions to audit for this package.", exactPackageVersionSchema, {
    minItems: 1,
  }),
);

const getPackageInputSchema = s.requiredObject("Input for retrieving compact npm package metadata.", {
  packageName: packageNameSchema,
});

const getPackageOutputSchema = s.requiredObject("Compact npm package metadata.", {
  name: s.nonEmptyString("The package name returned by npm."),
  distTags: s.record("npm distribution tags mapped to package versions.", stringValueSchema),
  latestVersion: s.nonEmptyString("The version assigned to the latest distribution tag."),
  modified: s.dateTime("The package modification timestamp returned by npm."),
  versionNames: s.array("All version names published for the package.", s.string("A version name.")),
  versionCount: s.nonNegativeInteger("The number of published package versions."),
});

const getPackageVersionInputSchema = s.object(
  "Input for retrieving one npm package version.",
  {
    packageName: packageNameSchema,
    version: s.nonEmptyString("The package version or distribution tag. Defaults to latest."),
  },
  { optional: ["version"] },
);

const packageVersionOutputSchema = s.looseRequiredObject(
  "An npm package version manifest, with stable fields described explicitly.",
  {
    name: s.nonEmptyString("The package name."),
    version: s.nonEmptyString("The resolved package version."),
    description: s.string("The package version description."),
    license: s.unknown("The package license value."),
    keywords: s.array("Keywords for this package version.", s.string("A package keyword.")),
    homepage: s.string("The package homepage."),
    repository: s.unknown("The package repository string or object."),
    author: s.unknown("The package author string or object."),
    maintainers: s.array("Maintainers for this package version.", optionalPerson),
    main: s.string("The package main entry point."),
    types: s.string("The package TypeScript declaration entry point."),
    dependencies: s.record("Runtime dependencies keyed by package name.", s.string("A dependency version range.")),
    devDependencies: s.record(
      "Development dependencies keyed by package name.",
      s.string("A dependency version range."),
    ),
    peerDependencies: s.record("Peer dependencies keyed by package name.", s.string("A dependency version range.")),
    dist: s.looseRequiredObject(
      "Distribution metadata for this package version.",
      {
        integrity: s.string("The package tarball integrity value."),
        shasum: s.string("The package tarball SHA-1 checksum."),
        tarball: s.url("The package tarball URL."),
        fileCount: s.nonNegativeInteger("The number of files in the package tarball."),
        unpackedSize: s.nonNegativeInteger("The unpacked package size in bytes."),
      },
      { optional: ["integrity", "fileCount", "unpackedSize"] },
    ),
  },
  {
    optional: [
      "description",
      "license",
      "keywords",
      "homepage",
      "repository",
      "author",
      "maintainers",
      "main",
      "types",
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ],
  },
);

const getPackageDownloadCountsInputSchema = s.requiredObject(
  "Input for retrieving download totals for one or more npm packages.",
  {
    packageNames: {
      ...s.array("The npm package names to compare. Scoped packages are supported.", packageNameSchema, {
        minItems: 1,
        maxItems: 128,
      }),
      uniqueItems: true,
    },
    period: downloadPeriodSchema,
  },
);

const getPackageDownloadCountsOutputSchema = s.requiredObject(
  "Normalized npm package download totals for an inclusive period.",
  {
    start: s.date("The inclusive first day represented by the counts."),
    end: s.date("The inclusive last day represented by the counts."),
    packages: s.array("Download totals in the requested package order.", downloadCountSchema),
  },
);

const getPackageDownloadTrendInputSchema = s.requiredObject(
  "Input for retrieving daily npm downloads for one package.",
  {
    packageName: packageNameSchema,
    period: downloadPeriodSchema,
  },
);

const getPackageDownloadTrendOutputSchema = s.requiredObject(
  "Daily npm package download counts for an inclusive period.",
  {
    packageName: packageNameSchema,
    start: s.date("The inclusive first day represented by the trend."),
    end: s.date("The inclusive last day represented by the trend."),
    totalDownloads: s.nonNegativeInteger("The sum of all daily downloads in the response."),
    dailyDownloads: s.array("Daily download counts in upstream order.", dailyDownloadSchema),
  },
);

const getVersionDownloadCountsInputSchema = s.requiredObject(
  "Input for retrieving npm downloads by package version for the last seven days.",
  {
    packageName: packageNameSchema,
  },
);

const getVersionDownloadCountsOutputSchema = s.requiredObject(
  "npm package downloads grouped by version for the last seven days.",
  {
    packageName: packageNameSchema,
    period: s.literal("last-week", {
      description: "The fixed period supported by npm for version download counts.",
    }),
    totalDownloads: s.nonNegativeInteger("The sum of downloads across returned versions."),
    versions: s.array("Version download counts sorted from most to least downloaded.", versionDownloadSchema),
  },
);

const auditPackageVersionsInputSchema = s.requiredObject(
  "Input for checking exact package versions against npm security advisories.",
  {
    packages: auditPackagesSchema,
  },
);

const auditPackageVersionsOutputSchema = s.requiredObject(
  "Normalized npm security advisories grouped by requested package.",
  {
    summary: s.requiredObject("Aggregate advisory counts for the audit request.", {
      packageCount: s.nonNegativeInteger("The number of packages checked."),
      affectedPackageCount: s.nonNegativeInteger("The number of packages with advisories."),
      advisoryCount: s.nonNegativeInteger("The total number of returned advisories."),
    }),
    packages: s.array(
      "Audit results in the requested package order.",
      s.requiredObject("Advisories for one requested package.", {
        packageName: packageNameSchema,
        requestedVersions: s.array(
          "The exact published versions supplied for this package.",
          s.nonEmptyString("One requested exact version."),
        ),
        advisories: s.array("Security advisories returned for this package.", advisorySchema),
      }),
    ),
  },
);

export const npmActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the npm username associated with the connected access token.",
    requiredScopes: [],
    inputSchema: getCurrentUserInputSchema,
    outputSchema: getCurrentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_packages",
    operationType: "read",
    description: "Search the npm registry for packages with offset pagination.",
    requiredScopes: [],
    inputSchema: searchPackagesInputSchema,
    outputSchema: searchPackagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_package",
    operationType: "read",
    description: "Get a compact summary and version list for an npm package.",
    requiredScopes: [],
    inputSchema: getPackageInputSchema,
    outputSchema: getPackageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_package_version",
    operationType: "read",
    description: "Get the manifest for a specific npm package version or distribution tag.",
    requiredScopes: [],
    inputSchema: getPackageVersionInputSchema,
    outputSchema: packageVersionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_package_download_counts",
    operationType: "read",
    description: "Get download totals for up to 128 npm packages over an inclusive period.",
    requiredScopes: [],
    inputSchema: getPackageDownloadCountsInputSchema,
    outputSchema: getPackageDownloadCountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_package_download_trend",
    operationType: "read",
    description: "Get daily download counts for one npm package over an inclusive period.",
    requiredScopes: [],
    inputSchema: getPackageDownloadTrendInputSchema,
    outputSchema: getPackageDownloadTrendOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_version_download_counts",
    operationType: "read",
    description: "Get npm downloads grouped by package version for the last seven days.",
    requiredScopes: [],
    inputSchema: getVersionDownloadCountsInputSchema,
    outputSchema: getVersionDownloadCountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "audit_package_versions",
    operationType: "read",
    description: "Get npm security advisories for requested exact package versions.",
    requiredScopes: [],
    inputSchema: auditPackageVersionsInputSchema,
    outputSchema: auditPackageVersionsOutputSchema,
  }),
];
