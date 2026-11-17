import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { intervalsIcuDefaultActivityLimit } from "./limits.ts";

const service = "intervals_icu";

const localDateTimePattern = "^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2})?$";

const eventCategories = [
  "WORKOUT",
  "RACE_A",
  "RACE_B",
  "RACE_C",
  "NOTE",
  "PLAN",
  "HOLIDAY",
  "SICK",
  "INJURED",
  "SET_EFTP",
  "FITNESS_DAYS",
  "SEASON_START",
  "TARGET",
  "SET_FITNESS",
];

function fieldsInputSchema(item: string): JsonSchema {
  return s.stringArray(
    `Only return these ${item} fields, to keep the response small. Intervals.icu then also leaves out fields whose value is null.`,
    { itemDescription: "A field name, such as id." },
  );
}

function activityLimitInputSchema(description: string): JsonSchema {
  return s.withDefault(s.positiveInteger(description), intervalsIcuDefaultActivityLimit);
}

const activitySummarySchema = s.looseObject(
  "One completed activity. Intervals.icu returns many more measurements than the fields listed here, depending on the sport and the recording device. All units are metric.",
  {
    id: s.string("The Intervals.icu activity identifier, such as i55751783. Pass it to get_activity."),
    name: s.nullableString("The activity name."),
    type: s.nullableString("The sport, such as Ride, Run or Swim."),
    start_date_local: s.nullableString("The start time on the athlete's local clock, as YYYY-MM-DDTHH:mm:ss."),
    start_date: s.nullableString("The start time in UTC, as an ISO-8601 timestamp."),
    distance: s.nullableNumber("The distance in meters."),
    moving_time: s.nullableInteger("The moving time in seconds."),
    elapsed_time: s.nullableInteger("The elapsed time in seconds, including pauses."),
    total_elevation_gain: s.nullableNumber("The elevation gained, in meters."),
    average_heartrate: s.nullableInteger("The average heart rate in beats per minute."),
    max_heartrate: s.nullableInteger("The highest heart rate in beats per minute."),
    icu_training_load: s.nullableInteger("The training load Intervals.icu calculated for the activity."),
    source: s.nullableString("Where the activity came from, such as UPLOAD, GARMIN_CONNECT or STRAVA."),
  },
);

const activitySearchResultSchema = s.looseObject("One activity that matches the search.", {
  id: s.string("The Intervals.icu activity identifier. Pass it to get_activity."),
  name: s.nullableString("The activity name."),
  type: s.nullableString("The sport, such as Ride, Run or Swim."),
  start_date_local: s.nullableString("The start time on the athlete's local clock, as YYYY-MM-DDTHH:mm:ss."),
  distance: s.nullableNumber("The distance in meters."),
  moving_time: s.nullableInteger("The moving time in seconds."),
  race: s.nullableBoolean("Whether the activity is marked as a race."),
  tags: s.nullable(s.array("The tags on the activity.", s.string("One tag."))),
});

const wellnessRecordSchema = s.looseObject(
  "One day of wellness data. Fields the athlete or a connected device did not record are null.",
  {
    id: s.string("The local date of the record, in YYYY-MM-DD."),
    ctl: s.nullableNumber("Fitness: the chronic training load at the end of the day."),
    atl: s.nullableNumber("Fatigue: the acute training load at the end of the day."),
    rampRate: s.nullableNumber("How fast fitness is changing."),
    weight: s.nullableNumber("The body weight in kilograms."),
    restingHR: s.nullableInteger("The resting heart rate in beats per minute."),
    hrv: s.nullableNumber("The heart rate variability (rMSSD) in milliseconds."),
    sleepSecs: s.nullableInteger("The time asleep in seconds."),
    sleepScore: s.nullableNumber("The sleep score from the device that recorded the night."),
    readiness: s.nullableNumber("The readiness score from the connected device."),
    steps: s.nullableInteger("The step count."),
    comments: s.nullableString("The athlete's notes for the day."),
  },
);

const eventSchema = s.looseObject("One calendar entry: a planned workout, a race, a note or another category.", {
  id: s.integer("The event identifier. Pass it to get_event."),
  category: s.string("The kind of entry, such as WORKOUT, RACE_A or NOTE."),
  start_date_local: s.nullableString("The local start date and time, as YYYY-MM-DDTHH:mm:ss."),
  end_date_local: s.nullableString("The local end date and time of entries that span several days."),
  name: s.nullableString("The entry name."),
  description: s.nullableString("The description; for a planned workout, its steps as text."),
  type: s.nullableString("The sport of a planned workout, such as Ride or Run."),
  moving_time: s.nullableInteger("The planned duration in seconds."),
  icu_training_load: s.nullableInteger("The planned training load."),
});

/**
 * Public Intervals.icu action catalog. Every action reads the data of the
 * athlete who owns the API key.
 */
export const intervalsIcuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_athlete",
    operationType: "read",
    description:
      "Get the Intervals.icu athlete profile of the API key: id, name, time zone and location. Use the time zone to read the local dates and times that other actions return.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The athlete profile returned by Intervals.icu.", {
      athlete: s.looseObject("The athlete.", {
        id: s.string("The athlete identifier, such as i12345."),
        name: s.nullableString("The athlete's name."),
        timezone: s.nullableString("The IANA time zone of the athlete, such as Europe/London."),
        city: s.nullableString("The athlete's city."),
        country: s.nullableString("The athlete's country."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_sport_settings",
    operationType: "read",
    description:
      "List the athlete's settings for each group of sports: the FTP, threshold and maximum heart rate, and the power and heart rate zones Intervals.icu uses for training load.",
    inputSchema: s.object("No input parameters are required for this action.", {}),
    outputSchema: s.object("The sport settings returned by Intervals.icu.", {
      sportSettings: s.array(
        "One entry per group of sports.",
        s.looseObject("The settings for one group of sports.", {
          id: s.integer("The settings identifier."),
          types: s.array("The sports these settings apply to, such as Ride and VirtualRide.", s.string("One sport.")),
          ftp: s.nullableInteger("The functional threshold power in watts."),
          indoor_ftp: s.nullableInteger("The indoor functional threshold power in watts, when it differs."),
          lthr: s.nullableInteger("The lactate threshold heart rate in beats per minute."),
          max_hr: s.nullableInteger("The maximum heart rate in beats per minute."),
          hr_zones: s.nullable(
            s.array(
              "The top of each heart rate zone in beats per minute; the last one is the maximum heart rate.",
              s.integer("The top of one zone."),
            ),
          ),
          power_zones: s.nullable(
            s.array(
              "The top of each power zone as a percentage of FTP; the last zone is open-ended.",
              s.integer("The top of one zone."),
            ),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_activities",
    operationType: "read",
    description: `List the athlete's completed activities between two local dates, newest first, with distance, time, heart rate and training load. It returns at most limit activities (${intervalsIcuDefaultActivityLimit} by default); when the list is full, call again with newest set to the start_date_local of the oldest activity returned and skip the activities already seen. Intervals.icu does not share data synced from Strava through its API.`,
    inputSchema: s.object(
      "The date range and paging for the activity list.",
      {
        oldest: s.string(
          "The earliest local date to include, as YYYY-MM-DD, or a local date and time as YYYY-MM-DDTHH:mm:ss.",
          { pattern: localDateTimePattern },
        ),
        newest: s.string(
          "The latest local date to include, as YYYY-MM-DD, or a local date and time as YYYY-MM-DDTHH:mm:ss. Defaults to now.",
          { pattern: localDateTimePattern },
        ),
        limit: activityLimitInputSchema("The maximum number of activities to return, newest first."),
        fields: fieldsInputSchema("activity"),
      },
      { required: ["oldest"] },
    ),
    outputSchema: s.object("The activities returned by Intervals.icu.", {
      activities: s.array("The activities, newest first.", activitySummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_activities",
    operationType: "read",
    description:
      "Find the athlete's activities by name, or by tag when the query starts with #. Returns short summaries; use get_activity for the detail of one activity.",
    inputSchema: s.object(
      "The search.",
      {
        query: s.nonEmptyString(
          "Text to look for in activity names, ignoring case, or an exact tag such as #race when it starts with #.",
        ),
        limit: activityLimitInputSchema("The maximum number of activities to return."),
      },
      { required: ["query"] },
    ),
    outputSchema: s.object("The matching activities returned by Intervals.icu.", {
      activities: s.array("The matching activities.", activitySearchResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_activity",
    operationType: "read",
    description:
      "Get one activity in full: every summary measurement Intervals.icu holds for it, the list of recorded streams, and optionally its intervals (laps and efforts).",
    inputSchema: s.object(
      "The activity to read.",
      {
        activityId: s.nonEmptyString("The activity identifier, such as i55751783, from list_activities."),
        includeIntervals: s.withDefault(s.boolean("Also return the activity's intervals and interval groups."), false),
      },
      { required: ["activityId"] },
    ),
    outputSchema: s.object("The activity returned by Intervals.icu.", {
      activity: s.looseObject("The activity detail. The measurements depend on the sport and the recording device.", {
        id: s.string("The activity identifier."),
        name: s.nullableString("The activity name."),
        type: s.nullableString("The sport, such as Ride, Run or Swim."),
        start_date_local: s.nullableString("The start time on the athlete's local clock, as YYYY-MM-DDTHH:mm:ss."),
        stream_types: s.nullable(
          s.array(
            "The streams recorded for this activity. Pass any of them to get_activity_streams.",
            s.string("One stream type."),
          ),
        ),
        icu_intervals: s.unknown("The intervals of the activity, present when includeIntervals is true."),
        _note: s.string(
          "Present instead of the activity data when Intervals.icu cannot share the activity through its API, such as an activity synced from Strava.",
        ),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_activity_streams",
    operationType: "read",
    description:
      "Get the recorded data series of one activity, such as heart rate or power, sample by sample. Ask only for the streams you need: a long activity holds thousands of samples per stream.",
    inputSchema: s.object(
      "The activity and the streams to read.",
      {
        activityId: s.nonEmptyString("The activity identifier, such as i55751783, from list_activities."),
        types: s.stringArray("The streams to return, named as in the stream_types list of get_activity.", {
          itemDescription: "One stream type.",
          minItems: 1,
        }),
      },
      { required: ["activityId", "types"] },
    ),
    outputSchema: s.object("The streams returned by Intervals.icu.", {
      streams: s.array(
        "One entry per stream.",
        s.looseObject("One data series.", {
          type: s.string("The stream type."),
          name: s.nullableString("A readable name for the stream."),
          data: s.unknown("The values, one per sample."),
          data2: s.unknown("A second value per sample, for streams that carry two."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_wellness",
    operationType: "read",
    description:
      "List daily wellness records between two local dates: fitness (ctl), fatigue (atl) and ramp rate, plus weight, resting heart rate, HRV, sleep, readiness and the athlete's notes where recorded.",
    inputSchema: s.object(
      "The inclusive range of local dates to read.",
      {
        oldest: s.date("The first local date to include, in YYYY-MM-DD."),
        newest: s.date("The last local date to include, in YYYY-MM-DD. It must not be before oldest."),
        fields: fieldsInputSchema("wellness"),
      },
      { required: ["oldest", "newest"] },
    ),
    outputSchema: s.object("The wellness records returned by Intervals.icu.", {
      records: s.array("One record per day.", wellnessRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description:
      "List the athlete's calendar between two local dates: planned workouts, races, notes and other entries. Without dates it lists today and the next six days in the athlete's time zone.",
    inputSchema: s.object("The date range and filters for the calendar.", {
      oldest: s.date("The first local date to include, in YYYY-MM-DD. Defaults to today."),
      newest: s.date(
        "The last local date to include, in YYYY-MM-DD. Defaults to six days after oldest. When both dates are set, it must not be before oldest.",
      ),
      categories: s.array(
        "Only return entries of these kinds.",
        s.stringEnum("One kind of calendar entry.", eventCategories),
      ),
      limit: s.positiveInteger("The maximum number of entries to return."),
    }),
    outputSchema: s.object("The calendar entries returned by Intervals.icu.", {
      events: s.array("The calendar entries.", eventSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_event",
    operationType: "read",
    description:
      "Get one calendar entry in full. For a planned workout this includes its structured steps with their durations and targets.",
    inputSchema: s.object(
      "The calendar entry to read.",
      {
        eventId: s.positiveInteger("The event identifier, from list_events."),
      },
      { required: ["eventId"] },
    ),
    outputSchema: s.object("The calendar entry returned by Intervals.icu.", {
      event: s.looseObject("The calendar entry.", {
        id: s.integer("The event identifier."),
        category: s.string("The kind of entry, such as WORKOUT, RACE_A or NOTE."),
        name: s.nullableString("The entry name."),
        start_date_local: s.nullableString("The local start date and time, as YYYY-MM-DDTHH:mm:ss."),
        workout_doc: s.unknown("The structured steps of a planned workout, with durations and targets."),
      }),
    }),
  }),
];
