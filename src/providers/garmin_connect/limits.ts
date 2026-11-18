interface GarminConnectMaxRangeDays {
  dailySummaries: number;
  sleepSummaries: number;
  bodyBattery: number;
  /**
   * Garmin documents no limit for daily VO2 max. It answers an empty HTTP 400
   * to a span of 368 days or more, so the provider keeps to a year, as it does
   * for daily summaries.
   */
  vo2Max: number;
}

interface GarminConnectActivityPageSize {
  default: number;
  max: number;
}

/**
 * Longest inclusive date span, in days, that Garmin documents for each range
 * endpoint with a limit. Garmin answers a longer span with an empty HTTP 400,
 * so the runtime checks the span first and the action descriptions quote it.
 */
export const garminConnectMaxRangeDays: GarminConnectMaxRangeDays = {
  dailySummaries: 366,
  sleepSummaries: 31,
  bodyBattery: 31,
  vo2Max: 366,
};

/** Page size for `list_activities`, shared by its schema and its handler. */
export const garminConnectActivityPageSize: GarminConnectActivityPageSize = {
  default: 20,
  max: 100,
};
