import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
  pickOptionalInteger,
  pickOptionalString as pickNonEmptyString,
} from "../../core/cast.ts";
import { googleJsonRequest, googleRequest } from "../google-runtime.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

const service = "google_search_console";

export const searchConsoleApiBaseUrl = "https://www.googleapis.com/webmasters/v3";
export const urlInspectionApiBaseUrl = "https://searchconsole.googleapis.com/v1";

type RuntimeDeps = OAuthProviderContext;

type ActionHandler = (input: Record<string, unknown>, deps: RuntimeDeps) => Promise<unknown>;

type SitesPayload = {
  siteEntry?: unknown;
};

type SearchAnalyticsPayload = {
  rows?: unknown;
  responseAggregationType?: unknown;
  metadata?: unknown;
};

type SitemapsPayload = {
  sitemap?: unknown;
};

type UrlInspectionPayload = {
  inspectionResult?: unknown;
};

export const googleSearchConsoleActionHandlers: Record<string, ActionHandler> = {
  list_sites(input, deps) {
    return listSites(input, deps);
  },
  get_site(input, deps) {
    return getSite(input, deps);
  },
  add_site(input, deps) {
    return addSite(input, deps);
  },
  delete_site(input, deps) {
    return deleteSite(input, deps);
  },
  query_search_analytics(input, deps) {
    return querySearchAnalytics(input, deps);
  },
  list_sitemaps(input, deps) {
    return listSitemaps(input, deps);
  },
  get_sitemap(input, deps) {
    return getSitemap(input, deps);
  },
  submit_sitemap(input, deps) {
    return submitSitemap(input, deps);
  },
  delete_sitemap(input, deps) {
    return deleteSitemap(input, deps);
  },
  inspect_url(input, deps) {
    return inspectUrl(input, deps);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleSearchConsoleActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>("https://www.googleapis.com/oauth2/v3/userinfo", {
      accessToken: input.accessToken,
      fetcher,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "google_search_console:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Search Console User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function listSites(_input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const payload = await searchConsoleJsonRequest<SitesPayload>("/sites", {
    accessToken,
    fetcher,
  });

  return {
    sites: Array.isArray(payload.siteEntry) ? payload.siteEntry.map(normalizeSiteEntry) : [],
  };
}

async function getSite(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  const payload = await searchConsoleJsonRequest<unknown>(`/sites/${encodeURIComponent(siteUrl)}`, {
    accessToken,
    fetcher,
  });

  return {
    site: normalizeSiteEntry(payload),
  };
}

async function addSite(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  await searchConsoleRequest(`/sites/${encodeURIComponent(siteUrl)}`, {
    accessToken,
    fetcher,
    method: "PUT",
  });

  return { success: true };
}

async function deleteSite(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  await searchConsoleRequest(`/sites/${encodeURIComponent(siteUrl)}`, {
    accessToken,
    fetcher,
    method: "DELETE",
  });

  return { success: true };
}

async function querySearchAnalytics(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  const payload = await searchConsoleJsonRequest<SearchAnalyticsPayload>(
    `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      accessToken,
      fetcher,
      method: "POST",
      body: buildSearchAnalyticsBody(input),
    },
  );

  const metadata = asOptionalObject(payload.metadata);
  return {
    rows: Array.isArray(payload.rows) ? payload.rows.map(normalizeSearchAnalyticsRow) : [],
    responseAggregationType: asOptionalString(payload.responseAggregationType) ?? null,
    metadata: {
      firstIncompleteDate: metadata
        ? (asOptionalString(metadata.first_incomplete_date) ?? asOptionalString(metadata.firstIncompleteDate) ?? null)
        : null,
      firstIncompleteHour: metadata
        ? (asOptionalString(metadata.first_incomplete_hour) ?? asOptionalString(metadata.firstIncompleteHour) ?? null)
        : null,
    },
  };
}

async function listSitemaps(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  const payload = await searchConsoleJsonRequest<SitemapsPayload>(`/sites/${encodeURIComponent(siteUrl)}/sitemaps`, {
    accessToken,
    fetcher,
    query: compactObject({
      sitemapIndex: pickNonEmptyString(input, "sitemapIndex"),
    }),
  });

  return {
    sitemaps: Array.isArray(payload.sitemap) ? payload.sitemap.map(normalizeSitemap) : [],
  };
}

async function getSitemap(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  const feedpath = resolveFeedpath(input);
  const payload = await searchConsoleJsonRequest<unknown>(
    `/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
    {
      accessToken,
      fetcher,
    },
  );

  return {
    sitemap: normalizeSitemap(payload),
  };
}

async function submitSitemap(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  const feedpath = resolveFeedpath(input);
  await searchConsoleRequest(`/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`, {
    accessToken,
    fetcher,
    method: "PUT",
  });

  return { success: true };
}

async function deleteSitemap(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const siteUrl = resolveSiteUrl(input);
  const feedpath = resolveFeedpath(input);
  await searchConsoleRequest(`/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`, {
    accessToken,
    fetcher,
    method: "DELETE",
  });

  return { success: true };
}

async function inspectUrl(input: Record<string, unknown>, { accessToken, fetcher }: RuntimeDeps) {
  const payload = await urlInspectionJsonRequest<UrlInspectionPayload>("/urlInspection/index:inspect", {
    accessToken,
    fetcher,
    method: "POST",
    body: compactObject({
      inspectionUrl: requireString(pickNonEmptyString(input, "inspectionUrl"), "inspectionUrl is required"),
      siteUrl: resolveSiteUrl(input),
      languageCode: pickNonEmptyString(input, "languageCode"),
    }),
  });

  const inspectionResult = asOptionalObject(payload.inspectionResult);
  if (!inspectionResult) {
    throw new ProviderRequestError(502, "missing google search console inspectionResult");
  }

  return { inspectionResult };
}

function buildSearchAnalyticsBody(input: Record<string, unknown>) {
  return compactObject({
    startDate: requireString(asOptionalString(input.startDate), "startDate is required"),
    endDate: requireString(asOptionalString(input.endDate), "endDate is required"),
    dimensions: Array.isArray(input.dimensions) ? input.dimensions : undefined,
    type: pickNonEmptyString(input, "type"),
    dimensionFilterGroups: Array.isArray(input.dimensionFilterGroups) ? input.dimensionFilterGroups : undefined,
    aggregationType: pickNonEmptyString(input, "aggregationType"),
    rowLimit: pickOptionalInteger(input, "rowLimit"),
    startRow: pickOptionalInteger(input, "startRow"),
    dataState: pickNonEmptyString(input, "dataState"),
  });
}

function normalizeSiteEntry(value: unknown) {
  const payload = asOptionalObject(value);
  if (!payload) {
    throw new ProviderRequestError(502, "missing google search console site entry");
  }

  return {
    siteUrl: requireString(asOptionalString(payload.siteUrl), "missing google search console siteUrl"),
    permissionLevel: requireString(
      asOptionalString(payload.permissionLevel),
      "missing google search console permissionLevel",
    ),
  };
}

function normalizeSearchAnalyticsRow(value: unknown) {
  const payload = asOptionalObject(value);
  if (!payload) {
    throw new ProviderRequestError(502, "missing google search console analytics row");
  }

  return {
    keys: Array.isArray(payload.keys) ? payload.keys.map(String) : [],
    clicks: asOptionalNumber(payload.clicks) ?? 0,
    impressions: asOptionalNumber(payload.impressions) ?? 0,
    ctr: asOptionalNumber(payload.ctr) ?? 0,
    position: asOptionalNumber(payload.position) ?? 0,
  };
}

function normalizeSitemap(value: unknown) {
  const payload = asOptionalObject(value);
  if (!payload) {
    throw new ProviderRequestError(502, "missing google search console sitemap");
  }

  return {
    path: requireString(asOptionalString(payload.path), "missing google search console sitemap path"),
    lastSubmitted: asOptionalString(payload.lastSubmitted) ?? null,
    isPending: typeof payload.isPending === "boolean" ? payload.isPending : null,
    isSitemapsIndex: typeof payload.isSitemapsIndex === "boolean" ? payload.isSitemapsIndex : null,
    type: asOptionalString(payload.type) ?? null,
    lastDownloaded: asOptionalString(payload.lastDownloaded) ?? null,
    warnings: stringifyOptional(payload.warnings),
    errors: stringifyOptional(payload.errors),
    contents: Array.isArray(payload.contents) ? payload.contents.map(normalizeSitemapContent) : [],
  };
}

function normalizeSitemapContent(value: unknown) {
  const payload = asOptionalObject(value);
  if (!payload) {
    throw new ProviderRequestError(502, "missing google search console sitemap content");
  }

  return {
    type: asOptionalString(payload.type) ?? null,
    submitted: stringifyOptional(payload.submitted),
    indexed: stringifyOptional(payload.indexed),
  };
}

function stringifyOptional(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveSiteUrl(input: Record<string, unknown>) {
  return requireString(pickNonEmptyString(input, "siteUrl"), "siteUrl is required");
}

function resolveFeedpath(input: Record<string, unknown>) {
  return requireString(pickNonEmptyString(input, "feedpath"), "feedpath is required");
}

function requireString(value: string | undefined, message: string) {
  if (!value) {
    throw new ProviderRequestError(400, message);
  }
  return value;
}

async function searchConsoleJsonRequest<T>(
  path: string,
  input: {
    accessToken: string;
    fetcher: typeof fetch;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
) {
  return googleJsonRequest<T>(`${searchConsoleApiBaseUrl}${path}`, {
    accessToken: input.accessToken,
    fetcher: input.fetcher,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

async function searchConsoleRequest(
  path: string,
  input: {
    accessToken: string;
    fetcher: typeof fetch;
    method?: string;
  },
) {
  return googleRequest(`${searchConsoleApiBaseUrl}${path}`, {
    accessToken: input.accessToken,
    fetcher: input.fetcher,
    method: input.method,
  });
}

async function urlInspectionJsonRequest<T>(
  path: string,
  input: {
    accessToken: string;
    fetcher: typeof fetch;
    method?: string;
    body?: unknown;
  },
) {
  return googleJsonRequest<T>(`${urlInspectionApiBaseUrl}${path}`, {
    accessToken: input.accessToken,
    fetcher: input.fetcher,
    method: input.method,
    body: input.body,
  });
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://www.googleapis.com/webmasters/v3",
  auth: { type: "oauth_bearer" },
});
