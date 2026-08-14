import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBooleanOrNull,
  optionalIntegerOrNull,
  optionalObjectArray,
  optionalRecord as asOptionalObject,
  optionalScalarString,
  optionalString as optionalNonEmptyString,
  optionalStringOrNull,
  requiredRecord,
} from "../../core/cast.ts";
import { googleJsonRequest } from "../google-runtime.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";

const service = "google_analytics";

export const googleAnalyticsDataApiBaseUrl = "https://analyticsdata.googleapis.com/v1beta";
export const googleAnalyticsDataApiAlphaBaseUrl = "https://analyticsdata.googleapis.com/v1alpha";
export const googleAnalyticsAdminApiBaseUrl = "https://analyticsadmin.googleapis.com/v1beta";

type GoogleAnalyticsRuntimeDeps = OAuthProviderContext;

type GoogleAnalyticsActionHandler = (
  input: Record<string, unknown>,
  context: GoogleAnalyticsRuntimeDeps,
) => Promise<unknown>;

export const googleAnalyticsActionHandlers: Record<string, GoogleAnalyticsActionHandler> = {
  list_account_summaries: listAccountSummaries,
  list_properties: listProperties,
  get_metadata: getMetadata,
  get_property_overview: getPropertyOverview,
  run_report: runReport,
  run_acquisition_report: runAcquisitionReport,
  run_engagement_report: runEngagementReport,
  run_pages_report: runPagesReport,
  run_events_report: runEventsReport,
  run_key_events_report: runKeyEventsReport,
  run_geography_report: runGeographyReport,
  run_technology_report: runTechnologyReport,
  check_compatibility: checkCompatibility,
  run_pivot_report: runPivotReport,
  batch_run_reports: batchRunReports,
  batch_run_pivot_reports: batchRunPivotReports,
  run_realtime_report: runRealtimeReport,
  get_property_quotas_snapshot: getPropertyQuotasSnapshot,
  list_custom_dimensions: listCustomDimensions,
  create_custom_dimension: createCustomDimension,
  archive_custom_dimension: archiveCustomDimension,
  list_custom_metrics: listCustomMetrics,
  create_custom_metric: createCustomMetric,
  archive_custom_metric: archiveCustomMetric,
  list_properties_filtered: listPropertiesFiltered,
  update_property: updateProperty,
  update_data_retention_settings: updateDataRetentionSettings,
  list_data_streams: listDataStreams,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleAnalyticsActionHandlers);

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
        accountId: profile.email ?? profile.sub ?? "google_analytics:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Analytics User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

type BusinessReportOrderBy = {
  fieldType: "dimension" | "metric";
  fieldName: string;
};

type BusinessReportTemplate = {
  dimensions: string[];
  metrics: string[];
  defaultOrderBy: string;
  orderBy: Record<string, BusinessReportOrderBy>;
};

const businessReportTemplates = {
  run_acquisition_report: {
    dimensions: ["sessionDefaultChannelGroup", "sessionSource", "sessionMedium", "sessionCampaignName"],
    metrics: ["activeUsers", "sessions", "engagedSessions", "keyEvents"],
    defaultOrderBy: "sessions",
    orderBy: {
      activeUsers: { fieldType: "metric", fieldName: "activeUsers" },
      sessions: { fieldType: "metric", fieldName: "sessions" },
      engagedSessions: { fieldType: "metric", fieldName: "engagedSessions" },
      keyEvents: { fieldType: "metric", fieldName: "keyEvents" },
    },
  },
  run_engagement_report: {
    dimensions: ["date"],
    metrics: ["activeUsers", "sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "eventCount"],
    defaultOrderBy: "activeUsers",
    orderBy: {
      date: { fieldType: "dimension", fieldName: "date" },
      activeUsers: { fieldType: "metric", fieldName: "activeUsers" },
      sessions: { fieldType: "metric", fieldName: "sessions" },
      engagedSessions: { fieldType: "metric", fieldName: "engagedSessions" },
      engagementRate: { fieldType: "metric", fieldName: "engagementRate" },
      averageSessionDuration: { fieldType: "metric", fieldName: "averageSessionDuration" },
      eventCount: { fieldType: "metric", fieldName: "eventCount" },
    },
  },
  run_pages_report: {
    dimensions: ["pagePath", "pageTitle"],
    metrics: ["screenPageViews", "activeUsers", "sessions", "averageSessionDuration", "eventCount"],
    defaultOrderBy: "screenPageViews",
    orderBy: {
      pagePath: { fieldType: "dimension", fieldName: "pagePath" },
      pageTitle: { fieldType: "dimension", fieldName: "pageTitle" },
      screenPageViews: { fieldType: "metric", fieldName: "screenPageViews" },
      activeUsers: { fieldType: "metric", fieldName: "activeUsers" },
      sessions: { fieldType: "metric", fieldName: "sessions" },
      averageSessionDuration: { fieldType: "metric", fieldName: "averageSessionDuration" },
      eventCount: { fieldType: "metric", fieldName: "eventCount" },
    },
  },
  run_events_report: {
    dimensions: ["eventName"],
    metrics: ["eventCount", "totalUsers", "activeUsers", "keyEvents", "eventValue"],
    defaultOrderBy: "eventCount",
    orderBy: {
      eventName: { fieldType: "dimension", fieldName: "eventName" },
      eventCount: { fieldType: "metric", fieldName: "eventCount" },
      totalUsers: { fieldType: "metric", fieldName: "totalUsers" },
      activeUsers: { fieldType: "metric", fieldName: "activeUsers" },
      keyEvents: { fieldType: "metric", fieldName: "keyEvents" },
      eventValue: { fieldType: "metric", fieldName: "eventValue" },
    },
  },
  run_key_events_report: {
    dimensions: ["eventName"],
    metrics: ["keyEvents", "sessionKeyEventRate", "userKeyEventRate"],
    defaultOrderBy: "keyEvents",
    orderBy: {
      eventName: { fieldType: "dimension", fieldName: "eventName" },
      keyEvents: { fieldType: "metric", fieldName: "keyEvents" },
      sessionKeyEventRate: { fieldType: "metric", fieldName: "sessionKeyEventRate" },
      userKeyEventRate: { fieldType: "metric", fieldName: "userKeyEventRate" },
    },
  },
  run_geography_report: {
    dimensions: ["country", "region", "city"],
    metrics: ["activeUsers", "newUsers", "sessions", "engagedSessions", "keyEvents"],
    defaultOrderBy: "activeUsers",
    orderBy: {
      country: { fieldType: "dimension", fieldName: "country" },
      region: { fieldType: "dimension", fieldName: "region" },
      city: { fieldType: "dimension", fieldName: "city" },
      activeUsers: { fieldType: "metric", fieldName: "activeUsers" },
      newUsers: { fieldType: "metric", fieldName: "newUsers" },
      sessions: { fieldType: "metric", fieldName: "sessions" },
      engagedSessions: { fieldType: "metric", fieldName: "engagedSessions" },
      keyEvents: { fieldType: "metric", fieldName: "keyEvents" },
    },
  },
  run_technology_report: {
    dimensions: ["deviceCategory", "browser", "operatingSystem"],
    metrics: ["activeUsers", "sessions", "engagedSessions", "engagementRate", "eventCount", "keyEvents"],
    defaultOrderBy: "activeUsers",
    orderBy: {
      deviceCategory: { fieldType: "dimension", fieldName: "deviceCategory" },
      browser: { fieldType: "dimension", fieldName: "browser" },
      operatingSystem: { fieldType: "dimension", fieldName: "operatingSystem" },
      activeUsers: { fieldType: "metric", fieldName: "activeUsers" },
      sessions: { fieldType: "metric", fieldName: "sessions" },
      engagedSessions: { fieldType: "metric", fieldName: "engagedSessions" },
      engagementRate: { fieldType: "metric", fieldName: "engagementRate" },
      eventCount: { fieldType: "metric", fieldName: "eventCount" },
      keyEvents: { fieldType: "metric", fieldName: "keyEvents" },
    },
  },
} satisfies Record<string, BusinessReportTemplate>;

async function listAccountSummaries(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/accountSummaries`, {
    context,
    query: compactObject({
      pageSize: optionalScalarString(input.pageSize),
      pageToken: optionalNonEmptyString(input.pageToken),
    }),
  });
  const record = asObject(payload);

  return {
    accountSummaries: asOptionalObjectArray(record.accountSummaries).map(normalizeAccountSummary),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
  };
}

async function listProperties(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/accountSummaries`, {
    context,
    query: buildPaginationQuery(input),
  });
  const record = asObject(payload);

  return {
    properties: flattenAccountSummaryProperties(record.accountSummaries),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
  };
}

async function getMetadata(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsDataApiBaseUrl}/${propertyName}/metadata`, {
    context,
  });

  return {
    metadata: normalizeMetadata(payload),
  };
}

async function getPropertyOverview(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const propertyPayload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/${propertyName}`, {
    context,
  });
  const dataStreamsPayload = await collectPaginatedAdminItems({
    context,
    url: `${googleAnalyticsAdminApiBaseUrl}/${propertyName}/dataStreams`,
    itemKey: "dataStreams",
  });
  const customDimensionsPayload = await collectPaginatedAdminItems({
    context,
    url: `${googleAnalyticsAdminApiBaseUrl}/${propertyName}/customDimensions`,
    itemKey: "customDimensions",
  });
  const customMetricsPayload = await collectPaginatedAdminItems({
    context,
    url: `${googleAnalyticsAdminApiBaseUrl}/${propertyName}/customMetrics`,
    itemKey: "customMetrics",
  });
  const metadataPayload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsDataApiBaseUrl}/${propertyName}/metadata`,
    {
      context,
    },
  );
  const quotaPayload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsDataApiAlphaBaseUrl}/${propertyName}/propertyQuotasSnapshot`,
    {
      context,
    },
  );

  return {
    overview: normalizePropertyOverview({
      propertyPayload,
      dataStreamsPayload,
      customDimensionsPayload,
      customMetricsPayload,
      metadataPayload,
      quotaPayload,
    }),
  };
}

async function runReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsDataApiBaseUrl}/${propertyName}:runReport`, {
    context,
    method: "POST",
    body: buildReportRequestBody(input),
  });

  return {
    report: normalizeReport(payload),
  };
}

async function runAcquisitionReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_acquisition_report);
}

async function runEngagementReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_engagement_report);
}

async function runPagesReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_pages_report);
}

async function runEventsReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_events_report);
}

async function runKeyEventsReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_key_events_report);
}

async function runGeographyReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_geography_report);
}

async function runTechnologyReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  return runBusinessReport(input, context, businessReportTemplates.run_technology_report);
}

async function checkCompatibility(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsDataApiBaseUrl}/${propertyName}:checkCompatibility`,
    {
      context,
      method: "POST",
      body: buildCompatibilityRequestBody(input),
    },
  );

  return {
    compatibility: normalizeCompatibility(payload),
  };
}

async function runPivotReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsDataApiBaseUrl}/${propertyName}:runPivotReport`, {
    context,
    method: "POST",
    body: buildPivotReportRequestBody(input),
  });

  return {
    pivotReport: normalizePivotReport(payload),
  };
}

async function batchRunReports(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsDataApiBaseUrl}/${propertyName}:batchRunReports`, {
    context,
    method: "POST",
    body: {
      requests: asObjectArray(input.requests).map(buildReportRequestBody),
    },
  });
  const record = asObject(payload);

  return {
    reports: asObjectArray(record.reports).map(normalizeReport),
    raw: record,
  };
}

async function batchRunPivotReports(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsDataApiBaseUrl}/${propertyName}:batchRunPivotReports`,
    {
      context,
      method: "POST",
      body: {
        requests: asObjectArray(input.requests).map(buildPivotReportRequestBody),
      },
    },
  );
  const record = asObject(payload);

  return {
    pivotReports: asObjectArray(record.pivotReports).map(normalizePivotReport),
    raw: record,
  };
}

async function runRealtimeReport(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsDataApiBaseUrl}/${propertyName}:runRealtimeReport`,
    {
      context,
      method: "POST",
      body: buildRealtimeReportRequestBody(input),
    },
  );

  return {
    report: normalizeReport(payload),
  };
}

async function getPropertyQuotasSnapshot(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsDataApiAlphaBaseUrl}/${propertyName}/propertyQuotasSnapshot`,
    {
      context,
    },
  );

  return {
    propertyQuotasSnapshot: normalizePropertyQuotasSnapshot(payload),
  };
}

async function listCustomDimensions(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsAdminApiBaseUrl}/${propertyName}/customDimensions`,
    {
      context,
      query: buildPaginationQuery(input),
    },
  );
  const record = asObject(payload);

  return {
    customDimensions: asOptionalObjectArray(record.customDimensions).map(normalizeCustomDimension),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
  };
}

async function createCustomDimension(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsAdminApiBaseUrl}/${propertyName}/customDimensions`,
    {
      context,
      method: "POST",
      body: buildCustomDimensionBody(input),
    },
  );

  return {
    customDimension: normalizeCustomDimension(payload),
  };
}

async function archiveCustomDimension(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsAdminApiBaseUrl}/${normalizeCustomDimensionName(input.customDimensionName)}:archive`,
    {
      context,
      method: "POST",
      body: {},
    },
  );

  return normalizeMutationSuccess(payload);
}

async function listCustomMetrics(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/${propertyName}/customMetrics`, {
    context,
    query: buildPaginationQuery(input),
  });
  const record = asObject(payload);

  return {
    customMetrics: asOptionalObjectArray(record.customMetrics).map(normalizeCustomMetric),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
  };
}

async function createCustomMetric(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/${propertyName}/customMetrics`, {
    context,
    method: "POST",
    body: buildCustomMetricBody(input),
  });

  return {
    customMetric: normalizeCustomMetric(payload),
  };
}

async function archiveCustomMetric(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsAdminApiBaseUrl}/${normalizeCustomMetricName(input.customMetricName)}:archive`,
    {
      context,
      method: "POST",
      body: {},
    },
  );

  return normalizeMutationSuccess(payload);
}

async function listPropertiesFiltered(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/properties`, {
    context,
    query: compactObject({
      filter: requireNonEmptyString(input.filter, "filter"),
      pageSize: optionalScalarString(input.pageSize),
      pageToken: optionalNonEmptyString(input.pageToken),
      showDeleted: optionalScalarString(input.showDeleted),
    }),
  });
  const record = asObject(payload);

  return {
    properties: asOptionalObjectArray(record.properties).map(normalizeProperty),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
  };
}

async function updateProperty(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const body = buildPropertyUpdateBody(input);
  const updateMask = buildUpdateMask(body);
  requireUpdateMask(updateMask, "update_property");
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/${propertyName}`, {
    context,
    method: "PATCH",
    query: compactObject({
      updateMask,
    }),
    body,
  });

  return {
    property: normalizeProperty(payload),
  };
}

async function updateDataRetentionSettings(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const body = buildDataRetentionSettingsBody(input, propertyName);
  const updateMask = buildUpdateMask(body, ["name"]);
  requireUpdateMask(updateMask, "update_data_retention_settings");
  const payload = await googleAnalyticsJsonRequest(
    `${googleAnalyticsAdminApiBaseUrl}/${propertyName}/dataRetentionSettings`,
    {
      context,
      method: "PATCH",
      query: compactObject({
        updateMask,
      }),
      body,
    },
  );

  return {
    dataRetentionSettings: normalizeDataRetentionSettings(payload),
  };
}

async function listDataStreams(input: Record<string, unknown>, context: GoogleAnalyticsRuntimeDeps) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsAdminApiBaseUrl}/${propertyName}/dataStreams`, {
    context,
    query: buildPaginationQuery(input),
  });
  const record = asObject(payload);

  return {
    dataStreams: asOptionalObjectArray(record.dataStreams).map(normalizeDataStream),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
  };
}

async function googleAnalyticsJsonRequest(
  url: string,
  input: {
    context: GoogleAnalyticsRuntimeDeps;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
) {
  return googleJsonRequest(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function buildPaginationQuery(input: Record<string, unknown>) {
  return compactObject({
    pageSize: optionalScalarString(input.pageSize),
    pageToken: optionalNonEmptyString(input.pageToken),
  });
}

async function collectPaginatedAdminItems(input: {
  context: GoogleAnalyticsRuntimeDeps;
  url: string;
  itemKey: string;
}) {
  const items: unknown[] = [];
  const pages: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const payload = await googleAnalyticsJsonRequest(input.url, {
      context: input.context,
      query: compactObject({
        pageToken,
      }),
    });
    const record = asObject(payload);
    pages.push(record);
    items.push(...asOptionalObjectArray(record[input.itemKey]));
    pageToken = optionalNonEmptyString(record.nextPageToken);
  } while (pageToken);

  return {
    [input.itemKey]: items,
    pages,
  };
}

function buildCompatibilityRequestBody(input: Record<string, unknown>) {
  return compactObject({
    dimensions: normalizeNamedRequests(input.dimensions),
    metrics: normalizeNamedRequests(input.metrics),
    dimensionFilter: input.dimensionFilter,
    metricFilter: input.metricFilter,
    compatibilityFilter: optionalNonEmptyString(input.compatibilityFilter),
  });
}

function buildReportRequestBody(input: Record<string, unknown>) {
  return compactObject({
    dateRanges: asObjectArray(input.dateRanges).map(normalizeDateRangeRequest),
    dimensions: normalizeNamedRequests(input.dimensions),
    metrics: normalizeNamedRequests(input.metrics),
    dimensionFilter: input.dimensionFilter,
    metricFilter: input.metricFilter,
    orderBys: input.orderBys,
    currencyCode: optionalNonEmptyString(input.currencyCode),
    cohortSpec: input.cohortSpec,
    keepEmptyRows: input.keepEmptyRows,
    metricAggregations: input.metricAggregations,
    comparisons: input.comparisons,
    limit: optionalScalarString(input.limit),
    offset: optionalScalarString(input.offset),
    returnPropertyQuota: input.returnPropertyQuota,
  });
}

function buildBusinessReportRequestBody(input: Record<string, unknown>, template: BusinessReportTemplate) {
  return compactObject({
    dateRanges: [
      {
        startDate: requireNonEmptyString(input.startDate, "startDate"),
        endDate: requireNonEmptyString(input.endDate, "endDate"),
      },
    ],
    dimensions: template.dimensions.map((name) => ({ name })),
    metrics: template.metrics.map((name) => ({ name })),
    dimensionFilter: input.dimensionFilter,
    metricFilter: input.metricFilter,
    orderBys: resolveBusinessOrderBys(input.orderBy, template),
    keepEmptyRows: input.keepEmptyRows,
    limit: optionalScalarString(input.limit),
    returnPropertyQuota: input.returnPropertyQuota,
  });
}

function buildPivotReportRequestBody(input: Record<string, unknown>) {
  return compactObject({
    dateRanges: Array.isArray(input.dateRanges)
      ? asObjectArray(input.dateRanges).map(normalizeDateRangeRequest)
      : undefined,
    dimensions: normalizeNamedRequests(input.dimensions),
    metrics: normalizeNamedRequests(input.metrics),
    pivots: input.pivots,
    dimensionFilter: input.dimensionFilter,
    metricFilter: input.metricFilter,
    orderBys: input.orderBys,
    currencyCode: optionalNonEmptyString(input.currencyCode),
    cohortSpec: input.cohortSpec,
    keepEmptyRows: input.keepEmptyRows,
    comparisons: input.comparisons,
    returnPropertyQuota: input.returnPropertyQuota,
  });
}

function buildRealtimeReportRequestBody(input: Record<string, unknown>) {
  return compactObject({
    dimensions: normalizeNamedRequests(input.dimensions),
    metrics: normalizeNamedRequests(input.metrics),
    dimensionFilter: input.dimensionFilter,
    metricFilter: input.metricFilter,
    orderBys: input.orderBys,
    limit: optionalScalarString(input.limit),
    metricAggregations: input.metricAggregations,
    minuteRanges: input.minuteRanges,
    returnPropertyQuota: input.returnPropertyQuota,
  });
}

function buildCustomDimensionBody(input: Record<string, unknown>) {
  return compactObject({
    parameterName: requireNonEmptyString(input.parameterName, "parameterName"),
    displayName: requireNonEmptyString(input.displayName, "displayName"),
    description: optionalNonEmptyString(input.description),
    scope: optionalNonEmptyString(input.scope),
    disallowAdsPersonalization: input.disallowAdsPersonalization,
  });
}

function buildCustomMetricBody(input: Record<string, unknown>) {
  return compactObject({
    parameterName: requireNonEmptyString(input.parameterName, "parameterName"),
    displayName: requireNonEmptyString(input.displayName, "displayName"),
    description: optionalNonEmptyString(input.description),
    measurementUnit: optionalNonEmptyString(input.measurementUnit),
    scope: optionalNonEmptyString(input.scope),
    restrictedMetricType: Array.isArray(input.restrictedMetricType) ? input.restrictedMetricType : undefined,
  });
}

function buildPropertyUpdateBody(input: Record<string, unknown>) {
  return compactObject({
    displayName: optionalNonEmptyString(input.displayName),
    industryCategory: optionalNonEmptyString(input.industryCategory),
    timeZone: optionalNonEmptyString(input.timeZone),
    currencyCode: optionalNonEmptyString(input.currencyCode),
    serviceLevel: optionalNonEmptyString(input.serviceLevel),
  });
}

function buildDataRetentionSettingsBody(input: Record<string, unknown>, propertyName: string) {
  return compactObject({
    name: `${propertyName}/dataRetentionSettings`,
    eventDataRetention: optionalNonEmptyString(input.eventDataRetention),
    userDataRetention: optionalNonEmptyString(input.userDataRetention),
    resetUserDataOnNewActivity: input.resetUserDataOnNewActivity,
  });
}

function buildUpdateMask(input: Record<string, unknown>, excludedFields: string[] = []) {
  const excluded = new Set(excludedFields);
  return Object.keys(input)
    .filter((key) => !excluded.has(key) && input[key] !== undefined)
    .join(",");
}

function requireUpdateMask(updateMask: string, actionName: string) {
  if (!updateMask) {
    throw new ProviderRequestError(400, `at least one updatable field is required for ${actionName}`);
  }
}

async function runBusinessReport(
  input: Record<string, unknown>,
  context: GoogleAnalyticsRuntimeDeps,
  template: BusinessReportTemplate,
) {
  const propertyName = normalizePropertyName(input.propertyId);
  const payload = await googleAnalyticsJsonRequest(`${googleAnalyticsDataApiBaseUrl}/${propertyName}:runReport`, {
    context,
    method: "POST",
    body: buildBusinessReportRequestBody(input, template),
  });

  return {
    report: normalizeReport(payload),
  };
}

function resolveBusinessOrderBys(value: unknown, template: BusinessReportTemplate): Array<Record<string, unknown>> {
  const orderByKey = optionalNonEmptyString(value) ?? template.defaultOrderBy;
  const orderBy = template.orderBy[orderByKey];
  if (!orderBy) {
    throw new ProviderRequestError(400, `unsupported orderBy: ${orderByKey}`);
  }

  if (orderBy.fieldType === "dimension") {
    return [{ dimension: { dimensionName: orderBy.fieldName }, desc: true }];
  }

  return [{ metric: { metricName: orderBy.fieldName }, desc: true }];
}

function normalizeNamedRequests(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    if (typeof item === "string") {
      const name = optionalNonEmptyString(item);
      if (!name) {
        throw new ProviderRequestError(400, "dimensions/metrics items must not be blank");
      }
      return { name };
    }
    const record = asObject(item);
    const name = optionalNonEmptyString(record.name) ?? optionalNonEmptyString(record.apiName);
    if (!name) {
      throw new ProviderRequestError(400, "dimensions/metrics items must include name or apiName");
    }
    return { name };
  });
}

function normalizeDateRangeRequest(value: unknown) {
  const record = asObject(value);
  return compactObject({
    startDate: optionalNonEmptyString(record.startDate),
    endDate: optionalNonEmptyString(record.endDate),
    name: optionalNonEmptyString(record.name),
  });
}

function normalizeAccountSummary(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    account: optionalStringOrNull(record.account),
    displayName: optionalStringOrNull(record.displayName),
    propertySummaries: asOptionalObjectArray(record.propertySummaries).map(normalizePropertySummary),
    raw: record,
  };
}

function normalizePropertySummary(value: unknown) {
  const record = asObject(value);
  const property = optionalNonEmptyString(record.property);
  return {
    property: property ?? null,
    propertyId: property ? extractTrailingResourceId(property) : null,
    displayName: optionalStringOrNull(record.displayName),
    propertyType: optionalStringOrNull(record.propertyType),
    parent: optionalStringOrNull(record.parent),
    raw: record,
  };
}

function flattenAccountSummaryProperties(value: unknown) {
  return asOptionalObjectArray(value).flatMap((accountSummary) => {
    const account = optionalStringOrNull(accountSummary.account);
    const accountDisplayName = optionalStringOrNull(accountSummary.displayName);

    return asOptionalObjectArray(accountSummary.propertySummaries).map((propertySummary) => {
      const property = optionalNonEmptyString(propertySummary.property);
      return {
        propertyId: property ? extractTrailingResourceId(property) : null,
        property: property ?? null,
        displayName: optionalStringOrNull(propertySummary.displayName),
        propertyType: optionalStringOrNull(propertySummary.propertyType),
        parent: optionalStringOrNull(propertySummary.parent),
        account,
        accountDisplayName,
        raw: propertySummary,
      };
    });
  });
}

function normalizeMetadata(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    dimensions: asObjectArray(record.dimensions).map(normalizeMetadataField),
    metrics: asObjectArray(record.metrics).map(normalizeMetadataField),
    comparisons: asOptionalObjectArray(record.comparisons).map(normalizeMetadataField),
    raw: record,
  };
}

function normalizeMetadataField(value: unknown) {
  const record = asObject(value);
  return {
    apiName: optionalStringOrNull(record.apiName),
    uiName: optionalStringOrNull(record.uiName),
    description: optionalStringOrNull(record.description),
    category: optionalStringOrNull(record.category),
    type: optionalStringOrNull(record.type),
    expression: optionalStringOrNull(record.expression),
    deprecatedApiNames: normalizeStringArray(record.deprecatedApiNames),
    customDefinition: optionalBooleanOrNull(record.customDefinition),
    raw: record,
  };
}

function normalizeCompatibility(value: unknown) {
  const record = asObject(value);
  return {
    dimensionCompatibilities: asOptionalObjectArray(record.dimensionCompatibilities).map(
      normalizeDimensionCompatibility,
    ),
    metricCompatibilities: asOptionalObjectArray(record.metricCompatibilities).map(normalizeMetricCompatibility),
    raw: record,
  };
}

function normalizeDimensionCompatibility(value: unknown) {
  const record = asObject(value);
  return {
    compatibility: optionalStringOrNull(record.compatibility),
    metadata: normalizeMetadataField(record.dimensionMetadata),
    raw: record,
  };
}

function normalizeMetricCompatibility(value: unknown) {
  const record = asObject(value);
  return {
    compatibility: optionalStringOrNull(record.compatibility),
    metadata: normalizeMetadataField(record.metricMetadata),
    raw: record,
  };
}

function normalizeReport(value: unknown) {
  const record = asObject(value);
  const dimensionHeaders = asOptionalObjectArray(record.dimensionHeaders).map(normalizeHeader);
  const metricHeaders = asOptionalObjectArray(record.metricHeaders).map(normalizeHeader);
  const normalizeRows = (rows: unknown) =>
    asOptionalObjectArray(rows).map((row) => normalizeReportRow(row, dimensionHeaders, metricHeaders));

  return {
    dimensionHeaders,
    metricHeaders,
    rows: normalizeRows(record.rows),
    rowCount: optionalIntegerOrNull(record.rowCount),
    metadata: normalizeReportMetadata(record.metadata),
    propertyQuota: asOptionalObject(record.propertyQuota) ?? null,
    totals: normalizeRows(record.totals),
    minimums: normalizeRows(record.minimums),
    maximums: normalizeRows(record.maximums),
    raw: record,
  };
}

function normalizePivotReport(value: unknown) {
  const record = asObject(value);
  const dimensionHeaders = asOptionalObjectArray(record.dimensionHeaders).map(normalizeHeader);
  const metricHeaders = asOptionalObjectArray(record.metricHeaders).map(normalizeHeader);

  return {
    pivotHeaders: asOptionalObjectArray(record.pivotHeaders).map(normalizePivotHeader),
    dimensionHeaders,
    metricHeaders,
    rows: asOptionalObjectArray(record.rows).map((row) => normalizeReportRow(row, dimensionHeaders, metricHeaders)),
    metadata: normalizeReportMetadata(record.metadata),
    propertyQuota: asOptionalObject(record.propertyQuota) ?? null,
    raw: record,
  };
}

function normalizePivotHeader(value: unknown) {
  const record = asObject(value);
  return {
    pivotDimensionHeaders: asOptionalObjectArray(record.pivotDimensionHeaders),
    rowCount: optionalIntegerOrNull(record.rowCount),
    raw: record,
  };
}

function normalizeHeader(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    type: optionalStringOrNull(record.type),
  };
}

function normalizeReportRow(
  value: unknown,
  dimensionHeaders: Array<{ name: string | null }>,
  metricHeaders: Array<{ name: string | null }>,
) {
  const record = asObject(value);
  const dimensionValues = asOptionalObjectArray(record.dimensionValues).map((item) => optionalScalarString(item.value));
  const metricValues = asOptionalObjectArray(record.metricValues).map((item) => optionalScalarString(item.value));
  const normalizedDimensionValues = dimensionValues.map((item) => item ?? "");
  const normalizedMetricValues = metricValues.map((item) => item ?? "");

  return {
    dimensions: valuesByHeader(dimensionHeaders, normalizedDimensionValues),
    metrics: valuesByHeader(metricHeaders, normalizedMetricValues),
    dimensionValues: normalizedDimensionValues,
    metricValues: normalizedMetricValues,
    raw: record,
  };
}

function normalizeReportMetadata(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return null;
  }

  return {
    currencyCode: optionalStringOrNull(record.currencyCode),
    timeZone: optionalStringOrNull(record.timeZone),
    raw: record,
  };
}

function normalizePropertyQuotasSnapshot(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    corePropertyQuota: asOptionalObject(record.corePropertyQuota) ?? null,
    realtimePropertyQuota: asOptionalObject(record.realtimePropertyQuota) ?? null,
    funnelPropertyQuota: asOptionalObject(record.funnelPropertyQuota) ?? null,
    raw: record,
  };
}

function normalizeCustomDimension(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    parameterName: optionalStringOrNull(record.parameterName),
    displayName: optionalStringOrNull(record.displayName),
    description: optionalStringOrNull(record.description),
    scope: optionalStringOrNull(record.scope),
    disallowAdsPersonalization: optionalBooleanOrNull(record.disallowAdsPersonalization),
    raw: record,
  };
}

function normalizeCustomMetric(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    parameterName: optionalStringOrNull(record.parameterName),
    displayName: optionalStringOrNull(record.displayName),
    description: optionalStringOrNull(record.description),
    measurementUnit: optionalStringOrNull(record.measurementUnit),
    scope: optionalStringOrNull(record.scope),
    restrictedMetricType: normalizeStringArray(record.restrictedMetricType),
    raw: record,
  };
}

function normalizeDataRetentionSettings(value: unknown) {
  const record = asObject(value);
  return {
    name: optionalStringOrNull(record.name),
    eventDataRetention: optionalStringOrNull(record.eventDataRetention),
    userDataRetention: optionalStringOrNull(record.userDataRetention),
    resetUserDataOnNewActivity: optionalBooleanOrNull(record.resetUserDataOnNewActivity),
    raw: record,
  };
}

function normalizeMutationSuccess(value: unknown) {
  const record = asObject(value);
  return {
    success: true,
    raw: record,
  };
}

function normalizeProperty(value: unknown) {
  const record = asObject(value);
  const name = optionalNonEmptyString(record.name);
  return {
    name: name ?? null,
    propertyId: name ? extractTrailingResourceId(name) : null,
    parent: optionalStringOrNull(record.parent),
    displayName: optionalStringOrNull(record.displayName),
    propertyType: optionalStringOrNull(record.propertyType),
    industryCategory: optionalStringOrNull(record.industryCategory),
    timeZone: optionalStringOrNull(record.timeZone),
    currencyCode: optionalStringOrNull(record.currencyCode),
    raw: record,
  };
}

function normalizeDataStream(value: unknown) {
  const record = asObject(value);
  const name = optionalNonEmptyString(record.name);
  return {
    name: name ?? null,
    dataStreamId: name ? extractTrailingResourceId(name) : null,
    displayName: optionalStringOrNull(record.displayName),
    type: optionalStringOrNull(record.type),
    webStreamData: asOptionalObject(record.webStreamData) ?? null,
    androidAppStreamData: asOptionalObject(record.androidAppStreamData) ?? null,
    iosAppStreamData: asOptionalObject(record.iosAppStreamData) ?? null,
    raw: record,
  };
}

function normalizePropertyOverview(input: {
  propertyPayload: unknown;
  dataStreamsPayload: unknown;
  customDimensionsPayload: unknown;
  customMetricsPayload: unknown;
  metadataPayload: unknown;
  quotaPayload: unknown;
}) {
  const propertyRecord = asObject(input.propertyPayload);
  const dataStreamsRecord = asObject(input.dataStreamsPayload);
  const customDimensionsRecord = asObject(input.customDimensionsPayload);
  const customMetricsRecord = asObject(input.customMetricsPayload);
  const metadataRecord = asObject(input.metadataPayload);
  const quotaRecord = asObject(input.quotaPayload);
  const property = normalizeProperty(propertyRecord);
  const dataStreams = asObjectArray(dataStreamsRecord.dataStreams).map(normalizeDataStream);

  return {
    propertyId: property.propertyId,
    property: property.name,
    parent: property.parent,
    displayName: property.displayName,
    propertyType: property.propertyType,
    industryCategory: property.industryCategory,
    timeZone: property.timeZone,
    currencyCode: property.currencyCode,
    dataStreams,
    webMeasurementIds: dataStreams
      .map((dataStream) => optionalNonEmptyString(dataStream.webStreamData?.measurementId))
      .filter((measurementId): measurementId is string => measurementId !== undefined),
    customDimensions: asObjectArray(customDimensionsRecord.customDimensions).map(normalizeCustomDimension),
    customMetrics: asObjectArray(customMetricsRecord.customMetrics).map(normalizeCustomMetric),
    metadata: normalizeMetadata(metadataRecord),
    quota: normalizePropertyQuotasSnapshot(quotaRecord),
    raw: {
      property: propertyRecord,
      dataStreams: dataStreamsRecord,
      customDimensions: customDimensionsRecord,
      customMetrics: customMetricsRecord,
      metadata: metadataRecord,
      quota: quotaRecord,
    },
  };
}

function valuesByHeader(headers: Array<{ name: string | null }>, values: string[]) {
  const output: Record<string, string> = {};
  for (const [index, header] of headers.entries()) {
    if (header.name) {
      output[header.name] = values[index] ?? "";
    }
  }
  return output;
}

function normalizePropertyName(value: unknown) {
  const raw = requireNonEmptyString(value, "propertyId");
  if (raw.startsWith("properties/")) {
    return raw;
  }
  return `properties/${raw}`;
}

function normalizeCustomDimensionName(value: unknown) {
  const raw = requireNonEmptyString(value, "customDimensionName");
  const parts = raw.split("/");
  if (parts.length === 4 && parts[0] === "properties" && parts[1] && parts[2] === "customDimensions" && parts[3]) {
    return raw;
  }
  throw new ProviderRequestError(400, "customDimensionName must be a properties/*/customDimensions/* resource name");
}

function normalizeCustomMetricName(value: unknown) {
  const raw = requireNonEmptyString(value, "customMetricName");
  const parts = raw.split("/");
  if (parts.length === 4 && parts[0] === "properties" && parts[1] && parts[2] === "customMetrics" && parts[3]) {
    return raw;
  }
  throw new ProviderRequestError(400, "customMetricName must be a properties/*/customMetrics/* resource name");
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const normalized = optionalNonEmptyString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalScalarString).filter((item): item is string => item !== undefined)
    : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "array input", (message) => new ProviderRequestError(400, message));
}

function asOptionalObjectArray(value: unknown): Array<Record<string, unknown>> {
  return optionalObjectArray(value, "array item", (message) => new ProviderRequestError(400, message));
}

function extractTrailingResourceId(value: string) {
  const separatorIndex = value.lastIndexOf("/");
  if (separatorIndex < 0 || separatorIndex === value.length - 1) {
    return value;
  }
  return value.slice(separatorIndex + 1);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://analyticsdata.googleapis.com/v1beta",
  auth: { type: "oauth_bearer" },
});
