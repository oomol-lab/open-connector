export const datadogMonitorsReadScope = "monitors_read";
export const datadogTimeseriesQueryScope = "timeseries_query";
export const datadogMetricsReadScope = "metrics_read";

/** Datadog OAuth scopes required by every runnable action exposed by this provider. */
export const datadogOAuthScopes: string[] = [
  datadogMonitorsReadScope,
  datadogTimeseriesQueryScope,
  datadogMetricsReadScope,
];
