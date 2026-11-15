import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { garminConnectActivityPageSize, garminConnectMaxRangeDays } from "./limits.ts";

const service = "garmin_connect";

const calendarDateInputSchema = s.object(
  "The calendar day to read.",
  {
    date: s.date("The calendar date in YYYY-MM-DD, on the user's local calendar."),
  },
  { required: ["date"] },
);

function dateRangeInputSchema(maxDays?: number): JsonSchema {
  const span = maxDays === undefined ? "" : ` The range may span at most ${maxDays} days, both ends included.`;
  return s.object(
    "The inclusive range of calendar days to read.",
    {
      startDate: s.date("The first calendar date to include, in YYYY-MM-DD, on the user's local calendar."),
      endDate: s.date(`The last calendar date to include, in YYYY-MM-DD. It must not be before startDate.${span}`),
    },
    { required: ["startDate", "endDate"] },
  );
}

const activityTypeSchema = s.looseObject("The activity type Garmin assigned to the activity.", {
  typeId: s.integer("The numeric activity type identifier."),
  typeKey: s.string("The activity type key, such as running or lap_swimming."),
  parentTypeId: s.integer("The numeric identifier of the parent activity type."),
});

const activitySummarySchema = s.looseObject(
  "One activity summary. Garmin returns many more measurements than the fields listed here, depending on the sport and device.",
  {
    activityId: s.integer("The Garmin activity identifier. Pass it to get_activity for the full detail."),
    activityName: s.nullableString("The activity name shown in Garmin Connect."),
    startTimeLocal: s.string("The start time on the user's local clock, as YYYY-MM-DD HH:mm:ss."),
    startTimeGMT: s.string("The start time in GMT, as YYYY-MM-DD HH:mm:ss."),
    activityType: activityTypeSchema,
    distance: s.nullableNumber("The distance in meters."),
    duration: s.nullableNumber("The timer duration in seconds."),
    elapsedDuration: s.nullableNumber("The elapsed duration in seconds, including pauses."),
    calories: s.nullableNumber("The active calories burned."),
    averageHR: s.nullableNumber("The average heart rate in beats per minute."),
    activityTrainingLoad: s.nullableNumber("The training load Garmin assigned to the activity."),
  },
);

const dailySummarySchema = s.looseObject(
  "One day of wellness data. The fields inside each section depend on what the device recorded that day.",
  {
    calendarDate: s.date("The calendar date of the summary."),
    includesWellnessData: s.boolean("Whether the day holds all-day wellness data."),
    includesActivityData: s.boolean("Whether the day holds recorded activities."),
    movement: s.unknown("Steps, wheelchair pushes, and floors climbed and descended."),
    calories: s.unknown("Active, resting and total calories."),
    heartRate: s.unknown("Resting, minimum and maximum heart rate."),
    intensityMinutes: s.unknown("Moderate and vigorous intensity minutes and the weekly goal."),
    stress: s.unknown("Stress averages and time spent at each stress level."),
    bodyBattery: s.unknown("Body Battery levels, charge and drain."),
    respiration: s.unknown("Respiration rate averages."),
    pulseOx: s.unknown("Pulse oximetry averages."),
  },
);

const sleepSchema = s.looseObject(
  "One night of sleep. The measurements are null when the device recorded no sleep that night.",
  {
    calendarDate: s.nullableString("The calendar date the sleep belongs to, in YYYY-MM-DD."),
    sleepTimeSeconds: s.nullableInteger("Total sleep in seconds."),
    deepSleepSeconds: s.nullableInteger("Deep sleep in seconds."),
    lightSleepSeconds: s.nullableInteger("Light sleep in seconds."),
    remSleepSeconds: s.nullableInteger("REM sleep in seconds."),
    awakeSleepSeconds: s.nullableInteger("Time awake during the sleep window, in seconds."),
    sleepStartTimestampGMT: s.nullableInteger("The sleep start, in epoch milliseconds."),
    sleepEndTimestampGMT: s.nullableInteger("The sleep end, in epoch milliseconds."),
    sleepScores: s.unknown("Sleep scores overall and per component, when the device computes them."),
    sleepNeed: s.unknown("Garmin's estimate of the sleep needed and what adjusted it."),
  },
);

const hrvSummarySchema = s.looseObject("One night of heart rate variability.", {
  calendarDate: s.date("The calendar date of the night."),
  lastNightAvg: s.nullableInteger("The average overnight HRV, in milliseconds."),
  lastNight5MinHigh: s.nullableInteger("The highest five-minute HRV average of the night, in milliseconds."),
  weeklyAvg: s.nullableInteger("The seven-day HRV average, in milliseconds."),
  baseline: s.unknown("The personal baseline range, once Garmin has enough nights to set it."),
  status: s.nullableString("The HRV status, such as BALANCED; NONE until Garmin has enough nights to set a baseline."),
});

const bodyBatteryDaySchema = s.looseObject("One day of Body Battery.", {
  date: s.date("The calendar date of the report."),
  charged: s.nullableInteger("Body Battery charged during the day."),
  drained: s.nullableInteger("Body Battery drained during the day."),
  bodyBatteryValuesArray: s.array(
    "Readings as [timestamp, level] pairs; with chunks, the lowest and highest level of each interval instead.",
    s.array("One reading.", s.unknown("A timestamp in epoch milliseconds, or a level.")),
  ),
  bodyBatteryValueDescriptorDTOList: s.nullable(
    s.array(
      "Describes the position of each value inside a reading. Null on days without readings.",
      s.unknownObject("One value descriptor."),
    ),
  ),
});

const heartRateDaySchema = s.looseObject("One day of heart rate.", {
  calendarDate: s.date("The calendar date of the day."),
  restingHeartRate: s.nullableInteger("The resting heart rate in beats per minute."),
  minHeartRate: s.nullableInteger("The lowest heart rate of the day in beats per minute."),
  maxHeartRate: s.nullableInteger("The highest heart rate of the day in beats per minute."),
  lastSevenDaysAvgRestingHeartRate: s.nullableInteger("The seven-day resting heart rate average."),
  heartRateValues: s.nullable(
    s.array(
      "Readings as [timestamp, beats per minute] pairs; the timestamp is in epoch milliseconds.",
      s.array("One reading.", s.nullableInteger("A timestamp or a heart rate.")),
    ),
  ),
});

const heartRateZoneSchema = s.looseObject("The heart rate zones for one sport.", {
  sport: s.string("The sport the zones apply to; DEFAULT applies to every sport without zones of its own."),
  trainingMethod: s.string("How the zones are set, such as HR_MAX for percentages of the maximum heart rate."),
  zone1Floor: s.integer("The lowest heart rate of zone 1."),
  zone2Floor: s.integer("The lowest heart rate of zone 2."),
  zone3Floor: s.integer("The lowest heart rate of zone 3."),
  zone4Floor: s.integer("The lowest heart rate of zone 4."),
  zone5Floor: s.integer("The lowest heart rate of zone 5."),
  maxHeartRateUsed: s.integer("The maximum heart rate the zones are built on."),
  restingHeartRateUsed: s.nullableInteger("The resting heart rate the zones are built on."),
  lactateThresholdHeartRateUsed: s.nullableInteger("The lactate threshold heart rate the zones are built on."),
});

/**
 * Public Garmin Connect action catalog. Every action reads the authenticated
 * user's own data; the Personal API has no write endpoints.
 */
export const garminConnectActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_settings",
    operationType: "read",
    description:
      "Get the Garmin Connect display name, time zone, locale and measurement units of the user. Use the time zone to read the local times that other actions return.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The user settings returned by Garmin Connect.", {
      settings: s.looseObject("The Garmin Connect user settings.", {
        displayName: s.string("The Garmin Connect display name."),
        timeZone: s.string("The IANA time zone of the user, such as Europe/London."),
        measurementSystem: s.string("The preferred unit system, such as metric."),
        preferredLocale: s.string("The preferred locale, such as en."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_activity_types",
    operationType: "read",
    description:
      "List the activity type keys Garmin Connect uses. Keys without a parent can filter list_activities by activityType; keys with a parent filter it by activitySubType.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The activity types returned by Garmin Connect.", {
      activityTypes: s.array(
        "The activity types.",
        s.looseObject("One activity type.", {
          key: s.string("The activity type key, such as running or trail_running."),
          parent: s.string("The parent activity type key. Absent for top-level types."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_activities",
    operationType: "read",
    description:
      "List the user's recorded activities, newest first by default, with optional date, type and text filters. Each item is a summary; use get_activity for the full detail of one activity.",
    inputSchema: s.object("Filters and paging for the activity list.", {
      startDate: s.date("Only activities that started on or after this local date, in YYYY-MM-DD."),
      endDate: s.date("Only activities that started on or before this local date, in YYYY-MM-DD."),
      activityType: s.string("A top-level activity type key, such as running or cycling. See list_activity_types."),
      activitySubType: s.string(
        "An activity type key with a parent, such as trail_running. When activityType is also set, it must be that key's parent.",
      ),
      eventType: s.string("An event type key, such as race, training, recreation or uncategorized."),
      search: s.string("Text to look for in activity names and descriptions."),
      sortOrder: s.withDefault(s.stringEnum("The sort direction by start time.", ["desc", "asc"]), "desc"),
      start: s.withDefault(s.nonNegativeInteger("The zero-based offset of the first activity to return."), 0),
      limit: s.withDefault(
        s.positiveInteger("The maximum number of activities to return.", {
          maximum: garminConnectActivityPageSize.max,
        }),
        garminConnectActivityPageSize.default,
      ),
    }),
    outputSchema: s.object("One page of activities returned by Garmin Connect.", {
      activities: s.array("The activities on this page.", activitySummarySchema),
      nextStart: s.nullableInteger(
        "The start offset of the next page, or null when this page held fewer activities than the limit.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_activity",
    operationType: "read",
    description:
      "Get one activity in full: summary measurements such as heart rate, pace, power, swim strokes and training effect, plus device metadata and split summaries.",
    inputSchema: s.object(
      "The activity to read.",
      {
        activityId: s.positiveInteger("The Garmin activity identifier, from list_activities."),
      },
      { required: ["activityId"] },
    ),
    outputSchema: s.object("The activity returned by Garmin Connect.", {
      activity: s.looseObject("The activity detail. The summaryDTO fields depend on the sport and device.", {
        activityId: s.integer("The Garmin activity identifier."),
        activityName: s.nullableString("The activity name shown in Garmin Connect."),
        activityTypeDTO: s.unknown("The activity type."),
        summaryDTO: s.unknown("The activity measurements."),
        metadataDTO: s.unknown("Device, file and upload metadata."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_daily_summaries",
    operationType: "read",
    description: `List all-day wellness summaries for a range of days: steps, calories, heart rate, intensity minutes, stress, Body Battery, respiration and pulse oximetry. The range may span at most ${garminConnectMaxRangeDays.dailySummaries} days.`,
    inputSchema: dateRangeInputSchema(garminConnectMaxRangeDays.dailySummaries),
    outputSchema: s.object("The daily summaries returned by Garmin Connect.", {
      summaries: s.array("One summary per day that holds data.", dailySummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sleep",
    operationType: "read",
    description:
      "Get one night of sleep in detail: duration, sleep stages, sleep scores, overnight SpO2, respiration and stress, and Garmin's sleep need estimate.",
    inputSchema: calendarDateInputSchema,
    outputSchema: s.object("The sleep record returned by Garmin Connect.", {
      sleep: s.nullable(sleepSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sleep_summaries",
    operationType: "read",
    description: `List sleep summaries for a range of nights: duration, sleep stages and sleep need. The range may span at most ${garminConnectMaxRangeDays.sleepSummaries} days; use get_sleep for the sleep scores of one night.`,
    inputSchema: dateRangeInputSchema(garminConnectMaxRangeDays.sleepSummaries),
    outputSchema: s.object("The sleep summaries returned by Garmin Connect.", {
      summaries: s.array("One summary per night.", sleepSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_hrv_summaries",
    operationType: "read",
    description:
      "List overnight heart rate variability for a range of nights: the nightly average, the seven-day average, the personal baseline and the HRV status. Garmin lists only nights it holds an HRV record for, and the averages can still be null on such a night.",
    inputSchema: dateRangeInputSchema(),
    outputSchema: s.object("The HRV summaries returned by Garmin Connect.", {
      summaries: s.array("One summary per night with HRV data.", hrvSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_body_battery",
    operationType: "read",
    description: `List Body Battery for a range of days: the energy charged and drained and the readings through each day. The range may span at most ${garminConnectMaxRangeDays.bodyBattery} days.`,
    inputSchema: s.object(
      "The inclusive range of days to read.",
      {
        startDate: s.date("The first calendar date to include, in YYYY-MM-DD, on the user's local calendar."),
        endDate: s.date(
          `The last calendar date to include, in YYYY-MM-DD. It must not be before startDate. The range may span at most ${garminConnectMaxRangeDays.bodyBattery} days, both ends included.`,
        ),
        chunks: s.positiveInteger(
          "Split each day into this many intervals and return the lowest and highest level of each, instead of every reading.",
        ),
      },
      { required: ["startDate", "endDate"] },
    ),
    outputSchema: s.object("The Body Battery reports returned by Garmin Connect.", {
      days: s.array("One report per day.", bodyBatteryDaySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_heart_rate",
    operationType: "read",
    description: "Get one day of heart rate: resting, minimum and maximum heart rate and the readings through the day.",
    inputSchema: calendarDateInputSchema,
    outputSchema: s.object("The heart rate day returned by Garmin Connect.", {
      heartRate: s.nullable(heartRateDaySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_weight",
    operationType: "read",
    description:
      "List weigh-ins for a range of days with body composition from a smart scale, the range average, and the nearest weigh-ins before and after the range. Weights are in grams.",
    inputSchema: dateRangeInputSchema(),
    outputSchema: s.object("The weight range returned by Garmin Connect.", {
      weight: s.looseObject("The weight data for the range.", {
        dailyWeightSummaries: s.array(
          "One entry per day with a weigh-in, newest first. allWeightMetrics lists every weigh-in of the day.",
          s.unknownObject("One day of weigh-ins."),
        ),
        totalAverage: s.unknown("Averages over the range; weight in grams."),
        previousDateWeight: s.unknown("The latest weigh-in before the range, or null."),
        nextDateWeight: s.unknown("The earliest weigh-in after the range, or null."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_heart_rate_zones",
    operationType: "read",
    description:
      "Get the user's heart rate zones: the default zones and any sport-specific zones, with the method and the resting, maximum and threshold heart rates they are built on.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The heart rate zones returned by Garmin Connect.", {
      zones: s.array("One zone set per sport.", heartRateZoneSchema),
    }),
  }),
];
