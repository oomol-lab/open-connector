import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const npmRegistryBaseUrl = "https://registry.npmjs.org";
export const npmDownloadsBaseUrl = "https://api.npmjs.org";
export const npmValidationPath = "/-/whoami";

type NpmRequestPhase = "validate" | "execute";
export interface NpmContext {
  apiKey?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type NpmActionHandler = (input: Record<string, unknown>, context: NpmContext) => Promise<unknown>;

interface DownloadPeriod {
  path: string;
  startDate?: string;
  endDate?: string;
}

interface DownloadPoint {
  packageName: string;
  downloads: number;
  start: string;
  end: string;
}

const downloadPeriodPresets = new Set(["last-day", "last-week", "last-month", "last-year"]);
const npmMaxResponseBytes = 10 * 1024 * 1024;
const npmRequestTimeoutMs = 30_000;

export const npmActionHandlers: ProviderActionHandlers<"npm", NpmActionHandler> = {
  async get_current_user(_input, context) {
    return normalizeCurrentUser(
      await requestNpmJson({
        path: npmValidationPath,
        apiKey: requireActionApiKey(context.apiKey),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
  },
  async search_packages(input, context) {
    const url = new URL("/-/v1/search", npmRegistryBaseUrl);
    url.searchParams.set("text", requireInputString(input.text, "text"));
    setOptionalInteger(url, "size", input.size);
    setOptionalInteger(url, "from", input.from);

    return requireObject(
      await requestNpmJson({
        path: `${url.pathname}${url.search}`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
      "npm returned an invalid search response",
    );
  },
  async get_package(input, context) {
    const packageName = requireInputString(input.packageName, "packageName");
    const packument = requireObject(
      await requestNpmJson({
        path: `/${encodePackageName(packageName)}`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        accept: "application/vnd.npm.install-v1+json",
      }),
      "npm returned an invalid package response",
    );
    const distTags = readStringRecord(packument["dist-tags"], "dist-tags");
    const versions = requireObject(packument.versions, "npm returned invalid package versions");
    const versionNames = Object.keys(versions);

    return {
      name: requireString(packument.name, "name"),
      distTags,
      latestVersion: requireString(distTags.latest, "latest dist-tag"),
      modified: requireString(packument.modified, "modified timestamp"),
      versionNames,
      versionCount: versionNames.length,
    };
  },
  async get_package_version(input, context) {
    const packageName = requireInputString(input.packageName, "packageName");
    const version = optionalString(input.version) ?? "latest";

    return requireObject(
      await requestNpmJson({
        path: `/${encodePackageName(packageName)}/${encodeURIComponent(version)}`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
      "npm returned an invalid package version response",
    );
  },
  async get_package_download_counts(input, context) {
    const packageNames = readPackageNames(input.packageNames);
    const period = readDownloadPeriod(input.period);
    enforceBulkDownloadPeriodLimit(period, packageNames.length);

    const unscopedPackageNames = packageNames.filter((packageName) => !packageName.startsWith("@"));
    const scopedPackageNames = packageNames.filter((packageName) => packageName.startsWith("@"));
    const points = await Promise.all([
      readUnscopedDownloadPoints(unscopedPackageNames, period, context),
      mapWithConcurrency(scopedPackageNames, 8, (packageName) => readDownloadPoint(packageName, period, context)),
    ]).then(([unscoped, scoped]) => unscoped.concat(scoped));
    const pointByPackageName = new Map(points.map((point) => [point.packageName, point]));
    const orderedPoints = packageNames.map((packageName) => {
      const point = pointByPackageName.get(packageName);
      if (!point) {
        throw new ProviderRequestError(502, `npm returned no download count for ${packageName}`);
      }
      return point;
    });
    const firstPoint = orderedPoints[0];
    if (!firstPoint) {
      throw new ProviderRequestError(400, "packageNames must not be empty");
    }
    for (const point of orderedPoints) {
      if (point.start !== firstPoint.start || point.end !== firstPoint.end) {
        throw new ProviderRequestError(502, "npm returned inconsistent download count periods");
      }
    }

    return {
      start: firstPoint.start,
      end: firstPoint.end,
      packages: orderedPoints.map((point) => ({
        packageName: point.packageName,
        downloads: point.downloads,
      })),
    };
  },
  async get_package_download_trend(input, context) {
    const packageName = requireInputString(input.packageName, "packageName");
    const period = readDownloadPeriod(input.period);
    const payload = requireObject(
      await requestNpmJson({
        baseUrl: npmDownloadsBaseUrl,
        path: `/downloads/range/${period.path}/${encodePackageName(packageName)}`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
      "npm returned an invalid download trend response",
    );
    const dailyDownloads = requireArray(payload.downloads, "npm returned invalid daily download counts").map((item) => {
      const daily = requireObject(item, "npm returned an invalid daily download count");
      return {
        day: requireString(daily.day, "download day"),
        downloads: requireNonNegativeInteger(daily.downloads, "daily download count"),
      };
    });

    return {
      packageName: normalizeReturnedPackageName(payload.package, packageName),
      start: requireString(payload.start, "download start date"),
      end: requireString(payload.end, "download end date"),
      totalDownloads: dailyDownloads.reduce((total, item) => total + item.downloads, 0),
      dailyDownloads,
    };
  },
  async get_version_download_counts(input, context) {
    const packageName = requireInputString(input.packageName, "packageName");
    const payload = requireObject(
      await requestNpmJson({
        baseUrl: npmDownloadsBaseUrl,
        path: `/versions/${encodePackageName(packageName)}/last-week`,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
      "npm returned an invalid version download response",
    );
    const downloads = requireObject(payload.downloads, "npm returned invalid version download counts");
    const versions = Object.entries(downloads)
      .map(([version, count]) => ({
        version,
        downloads: requireNonNegativeInteger(count, `download count for version ${version}`),
      }))
      .sort((left, right) => right.downloads - left.downloads || left.version.localeCompare(right.version));

    return {
      packageName: normalizeReturnedPackageName(payload.package, packageName),
      period: "last-week",
      totalDownloads: versions.reduce((total, item) => total + item.downloads, 0),
      versions,
    };
  },
  async audit_package_versions(input, context) {
    const packages = readAuditPackages(input.packages);
    const payload = requireObject(
      await requestNpmJson({
        path: "/-/npm/v1/security/advisories/bulk",
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        method: "POST",
        body: Object.fromEntries(packages),
      }),
      "npm returned an invalid advisory response",
    );
    const results = packages.map(([packageName, requestedVersions]) => {
      const packagePayload = payload[packageName];
      const advisories = packagePayload === undefined ? [] : normalizeAdvisories(packagePayload, packageName);
      return {
        packageName,
        requestedVersions,
        advisories,
      };
    });

    return {
      summary: {
        packageCount: results.length,
        affectedPackageCount: results.filter((result) => result.advisories.length > 0).length,
        advisoryCount: results.reduce((total, result) => total + result.advisories.length, 0),
      },
      packages: results,
    };
  },
};

export async function validateNpmCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = normalizeCurrentUser(
    await requestNpmJson({
      path: npmValidationPath,
      apiKey,
      fetcher,
      signal,
      phase: "validate",
    }),
  );

  return {
    profile: {
      accountId: `npm:${user.username}`,
      displayName: user.username,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: npmRegistryBaseUrl,
      validationEndpoint: npmValidationPath,
      username: user.username,
    },
  };
}

async function requestNpmJson(input: {
  path: string;
  fetcher: typeof fetch;
  phase: NpmRequestPhase;
  baseUrl?: string;
  apiKey?: string;
  accept?: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}) {
  const headers = new Headers({
    accept: input.accept ?? "application/json",
    "user-agent": providerUserAgent,
  });
  if (input.apiKey) {
    headers.set("authorization", `Bearer ${input.apiKey}`);
  }
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const timeout = createProviderTimeout(input.signal, npmRequestTimeoutMs);
  try {
    const response = await input.fetcher(new URL(input.path, input.baseUrl ?? npmRegistryBaseUrl), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readNpmPayload(response, !response.ok);
    if (!response.ok) {
      throw createNpmError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "npm request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `npm request failed: ${error.message}` : "npm request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readNpmPayload(response: Response, tolerateInvalidJson: boolean) {
  const text = await readProviderTextBody(response, "npm response", npmMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (tolerateInvalidJson) {
      return text;
    }
    throw new ProviderRequestError(502, "npm returned invalid JSON");
  }
}

function createNpmError(response: Response, payload: unknown, phase: NpmRequestPhase) {
  const message =
    extractNpmErrorMessage(payload) || response.statusText || `npm request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message);
}

function extractNpmErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  for (const field of ["message", "error", "reason"]) {
    const value = optionalString(object[field]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeCurrentUser(payload: unknown) {
  const body = requireObject(payload, "npm returned an invalid user response");
  return {
    username: requireString(body.username, "username"),
  };
}

async function readUnscopedDownloadPoints(packageNames: string[], period: DownloadPeriod, context: NpmContext) {
  if (packageNames.length === 0) {
    return [];
  }
  if (packageNames.length === 1) {
    return [await readDownloadPoint(packageNames[0]!, period, context)];
  }

  const payload = requireObject(
    await requestNpmJson({
      baseUrl: npmDownloadsBaseUrl,
      path: `/downloads/point/${period.path}/${packageNames.map(encodePackageName).join(",")}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
    "npm returned an invalid bulk download count response",
  );
  return packageNames.map((packageName) => normalizeBulkDownloadPoint(payload[packageName], packageName));
}

function normalizeBulkDownloadPoint(payload: unknown, packageName: string) {
  if (payload === null) {
    throw new ProviderRequestError(404, `npm package not found: ${packageName}`);
  }
  return normalizeDownloadPoint(payload, packageName, `npm returned no download count for ${packageName}`);
}

async function readDownloadPoint(packageName: string, period: DownloadPeriod, context: NpmContext) {
  return normalizeDownloadPoint(
    await requestNpmJson({
      baseUrl: npmDownloadsBaseUrl,
      path: `/downloads/point/${period.path}/${encodePackageName(packageName)}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
    packageName,
    `npm returned an invalid download count for ${packageName}`,
  );
}

function normalizeDownloadPoint(payload: unknown, packageName: string, message: string): DownloadPoint {
  const point = requireObject(payload, message);
  return {
    packageName: normalizeReturnedPackageName(point.package, packageName),
    downloads: requireNonNegativeInteger(point.downloads, `download count for ${packageName}`),
    start: requireString(point.start, "download start date"),
    end: requireString(point.end, "download end date"),
  };
}

function readDownloadPeriod(value: unknown): DownloadPeriod {
  if (typeof value === "string" && downloadPeriodPresets.has(value)) {
    return { path: value };
  }
  const range = optionalRecord(value);
  if (!range) {
    throw new ProviderRequestError(400, "period must be a supported preset or date range");
  }

  const startDate = requireInputString(range.startDate, "period.startDate");
  const endDate = requireInputString(range.endDate, "period.endDate");
  if (startDate > endDate) {
    throw new ProviderRequestError(400, "endDate must be on or after startDate");
  }
  return {
    path: `${startDate}:${endDate}`,
    startDate,
    endDate,
  };
}

function enforceBulkDownloadPeriodLimit(period: DownloadPeriod, packageCount: number) {
  if (packageCount <= 1 || !period.startDate || !period.endDate) {
    return;
  }

  const start = Date.parse(`${period.startDate}T00:00:00Z`);
  const end = Date.parse(`${period.endDate}T00:00:00Z`);
  const inclusiveDays = Math.floor((end - start) / 86_400_000) + 1;
  if (inclusiveDays > 365) {
    throw new ProviderRequestError(400, "custom periods for multiple packages cannot exceed 365 days");
  }
}

function readPackageNames(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "packageNames must contain at least one package");
  }

  const packageNames = value.map((item, index) => requireInputString(item, `packageNames[${index}]`));
  return Array.from(new Set(packageNames));
}

function readAuditPackages(value: unknown): Array<[string, string[]]> {
  const record = optionalRecord(value);
  if (!record || Object.keys(record).length === 0) {
    throw new ProviderRequestError(400, "packages must contain at least one package");
  }

  const packages = new Map<string, string[]>();
  for (const [rawPackageName, rawVersions] of Object.entries(record)) {
    const packageName = rawPackageName.trim();
    if (!packageName || !Array.isArray(rawVersions) || rawVersions.length === 0) {
      throw new ProviderRequestError(
        400,
        `packages.${rawPackageName || "<empty>"} must contain at least one exact version`,
      );
    }
    const versions = rawVersions.map((version, index) =>
      requireInputString(version, `packages.${packageName}[${index}]`),
    );
    for (const version of versions) {
      if (!isExactNpmVersion(version)) {
        throw new ProviderRequestError(
          400,
          `packages.${packageName} must contain exact semantic versions, not tags or ranges`,
        );
      }
    }
    const existingVersions = packages.get(packageName) ?? [];
    packages.set(packageName, Array.from(new Set(existingVersions.concat(versions))));
  }
  return Array.from(packages.entries());
}

function normalizeAdvisories(value: unknown, packageName: string) {
  return requireArray(value, `npm returned invalid advisories for ${packageName}`).map((item) => {
    const advisory = requireObject(item, `npm returned an invalid advisory for ${packageName}`);
    return {
      id: requireNonNegativeInteger(advisory.id, "advisory id"),
      url: requireString(advisory.url, "advisory URL"),
      title: requireString(advisory.title, "advisory title"),
      severity: requireString(advisory.severity, "advisory severity"),
      vulnerableVersions: requireString(advisory.vulnerable_versions, "vulnerable version range"),
      cwe: readOptionalStringArray(advisory.cwe, "advisory CWE"),
      cvss: normalizeCvss(advisory.cvss),
    };
  });
}

function normalizeCvss(value: unknown) {
  const cvss = requireObject(value, "npm returned invalid advisory CVSS data");
  if (typeof cvss.score !== "number" || !Number.isFinite(cvss.score)) {
    throw new ProviderRequestError(502, "npm returned an invalid advisory CVSS score");
  }
  return {
    score: cvss.score,
    vectorString: cvss.vectorString === null ? null : requireString(cvss.vectorString, "advisory CVSS vector"),
  };
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return [];
  }
  return requireArray(value, `npm returned an invalid ${fieldName}`).map((item) => requireString(item, fieldName));
}

function normalizeReturnedPackageName(value: unknown, expectedPackageName: string) {
  const returnedPackageName = requireString(value, "package name");
  if (returnedPackageName !== expectedPackageName) {
    throw new ProviderRequestError(
      502,
      `npm returned download data for ${returnedPackageName} instead of ${expectedPackageName}`,
    );
  }
  return returnedPackageName;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function requireString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `npm returned an invalid ${fieldName}`);
  }
  return stringValue;
}

function requireInputString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return stringValue;
}

function requireNonNegativeInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, `npm returned an invalid ${fieldName}`);
  }
  return value;
}

function readStringRecord(value: unknown, fieldName: string) {
  const record = requireObject(value, `npm returned an invalid ${fieldName}`);
  const entries = Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
}

function setOptionalInteger(url: URL, name: string, value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    url.searchParams.set(name, String(value));
  }
}

function requireActionApiKey(apiKey: string | undefined) {
  if (!apiKey) {
    throw new ProviderRequestError(400, "get_current_user requires an npm access token connection");
  }
  return apiKey;
}

function encodePackageName(packageName: string) {
  return encodeURIComponent(packageName);
}

function isExactNpmVersion(input: string): boolean {
  const version = input.startsWith("v") ? input.slice(1) : input;
  const buildSeparator = version.indexOf("+");
  if (buildSeparator !== version.lastIndexOf("+")) {
    return false;
  }

  const versionWithoutBuild = buildSeparator === -1 ? version : version.slice(0, buildSeparator);
  if (buildSeparator !== -1 && !areValidSemverIdentifiers(version.slice(buildSeparator + 1), false)) {
    return false;
  }

  const prereleaseSeparator = versionWithoutBuild.indexOf("-");
  const core = prereleaseSeparator === -1 ? versionWithoutBuild : versionWithoutBuild.slice(0, prereleaseSeparator);
  if (
    prereleaseSeparator !== -1 &&
    !areValidSemverIdentifiers(versionWithoutBuild.slice(prereleaseSeparator + 1), true)
  ) {
    return false;
  }

  const coreIdentifiers = core.split(".");
  return (
    coreIdentifiers.length === 3 &&
    coreIdentifiers.every(
      (identifier) => isNumericIdentifier(identifier) && (identifier === "0" || !identifier.startsWith("0")),
    )
  );
}

function areValidSemverIdentifiers(value: string, rejectNumericLeadingZero: boolean): boolean {
  const identifiers = value.split(".");
  return (
    identifiers.length > 0 &&
    identifiers.every(
      (identifier) =>
        identifier.length > 0 &&
        isSemverIdentifier(identifier) &&
        (!rejectNumericLeadingZero ||
          !isNumericIdentifier(identifier) ||
          identifier === "0" ||
          !identifier.startsWith("0")),
    )
  );
}

function isSemverIdentifier(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercaseLetter = code >= 65 && code <= 90;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isUppercaseLetter && !isLowercaseLetter && character !== "-") {
      return false;
    }
  }
  return true;
}

function isNumericIdentifier(value: string): boolean {
  if (!value) {
    return false;
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}
