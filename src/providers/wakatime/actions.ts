import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wakatime";

export type WakatimeActionName =
  | "get_current_user"
  | "get_all_time_since_today"
  | "list_projects"
  | "get_stats"
  | "get_summaries"
  | "get_status_bar_today";

const summariesRanges = [
  "Today",
  "Yesterday",
  "Last 7 Days",
  "Last 7 Days from Yesterday",
  "Last 14 Days",
  "Last 30 Days",
  "This Week",
  "Last Week",
  "This Month",
  "Last Month",
];

const userSchema = s.looseObject("A WakaTime user object.", {
  id: s.string("The WakaTime user ID."),
  email: s.string("The user's email address, when returned."),
  plan: s.string("The WakaTime plan name."),
  photo: s.string("The user's profile photo URL."),
  timezone: s.string("The user's configured timezone."),
  username: s.string("The user's public username."),
  display_name: s.string("The display name returned by WakaTime."),
});

const projectSchema = s.looseObject("A WakaTime project object.", {
  id: s.string("The WakaTime project ID."),
  url: s.string("The relative WakaTime URL for the project."),
  name: s.string("The project name."),
  badge: s.string("The project badge URL, when enabled."),
  color: s.nullable(s.string("The project color returned by WakaTime.")),
});

const timeRangeSchema = s.looseObject("A WakaTime date range object.", {
  date: s.date("The calendar date returned by WakaTime."),
  text: s.string("The human-readable date range text."),
  start: s.dateTime("The start timestamp of the range."),
  end: s.dateTime("The end timestamp of the range."),
  timezone: s.string("The timezone used for the range."),
});

const totalSchema = s.looseObject("A WakaTime duration summary object.", {
  text: s.string("The human-readable duration returned by WakaTime."),
  decimal: s.string("The decimal duration string returned by WakaTime, when present."),
  digital: s.string("The digital duration string returned by WakaTime."),
  hours: s.integer("The hours component of the duration."),
  minutes: s.integer("The minutes component of the duration."),
  seconds: s.integer("The seconds component of the duration."),
  total_seconds: s.number("The total number of seconds represented by the duration."),
});

const breakdownItemSchema = s.looseObject("A WakaTime breakdown item.", {
  name: s.string("The item name returned by WakaTime."),
  text: s.string("The human-readable duration for this item."),
  percent: s.number("The percentage of total time for this item."),
  total_seconds: s.number("The total number of seconds tracked for this item."),
});

const summarySchema = s.looseObject("A WakaTime daily summary object.", {
  range: timeRangeSchema,
  grand_total: totalSchema,
  categories: s.array("The categories breakdown returned by WakaTime.", breakdownItemSchema),
  dependencies: s.array("The dependencies breakdown returned by WakaTime.", breakdownItemSchema),
  editors: s.array("The editors breakdown returned by WakaTime.", breakdownItemSchema),
  languages: s.array("The languages breakdown returned by WakaTime.", breakdownItemSchema),
  machines: s.array("The machines breakdown returned by WakaTime.", breakdownItemSchema),
  operating_systems: s.array("The operating systems breakdown returned by WakaTime.", breakdownItemSchema),
  projects: s.array("The projects breakdown returned by WakaTime.", breakdownItemSchema),
});

const getSummariesInputSchema: JsonSchema = {
  ...s.actionInput({
    range: s.stringEnum("A predefined WakaTime summaries date range.", summariesRanges),
    start: s.date("The summaries start date in YYYY-MM-DD format."),
    end: s.date("The summaries end date in YYYY-MM-DD format."),
    project: s.nonEmptyString("The WakaTime project name."),
    branches: s.nonEmptyString("A comma-separated list of branch names used to filter activity."),
    timeout: s.nonNegativeInteger("The keystroke timeout override in minutes."),
    writes_only: s.boolean("Whether to count only file write activity instead of all coding activity."),
    timezone: s.nonEmptyString("An Olson timezone string such as America/Los_Angeles."),
  }),
  anyOf: [{ required: ["range"] }, { required: ["start", "end"] }],
};

export const wakatimeActions: ProviderActionDefinition<WakatimeActionName>[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the currently authenticated WakaTime user.",
    followUpActions: ["wakatime.get_all_time_since_today", "wakatime.list_projects", "wakatime.get_stats"],
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_all_time_since_today",
    description: "Get the total WakaTime coding time logged since the account was created.",
    inputSchema: s.actionInput({
      project: s.nonEmptyString("The WakaTime project name."),
    }),
    outputSchema: s.actionOutput({
      total: s.looseObject("The WakaTime all-time coding total object.", {
        text: s.string("The human-readable total coding time."),
        range: timeRangeSchema,
        decimal: s.string("The decimal representation of the total coding time."),
        digital: s.string("The digital clock representation of the total coding time."),
        timeout: s.integer("The keystroke timeout used for this result."),
        daily_average: s.number("The average daily coding time in seconds."),
        is_up_to_date: s.boolean("Whether today's coding time has been fully calculated."),
        total_seconds: s.number("The total coding time in seconds."),
        percent_calculated: s.integer("The percentage of today's coding time currently included."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List WakaTime projects for the authenticated user.",
    inputSchema: s.actionInput({
      q: s.nonEmptyString("A search term used to filter project names."),
      page: s.positiveInteger("The 1-based page number to request."),
    }),
    outputSchema: s.actionOutput({
      projects: s.array("The projects returned by WakaTime.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_stats",
    description: "Get WakaTime coding stats for the authenticated user.",
    inputSchema: s.actionInput({
      range: s.nonEmptyString(
        "The WakaTime stats range, such as last_7_days, last_30_days, all_time, YYYY, or YYYY-MM.",
      ),
      timeout: s.nonNegativeInteger("The keystroke timeout override in minutes."),
      writes_only: s.boolean("Whether to count only file write activity instead of all coding activity."),
    }),
    outputSchema: s.actionOutput({
      stats: s.looseObject("The WakaTime stats returned for the requested range.", {
        range: s.string("The stats range returned by WakaTime."),
        status: s.string("The stats calculation status."),
        total_seconds: s.number("The total coding time in seconds."),
        daily_average: s.number("The average daily coding time in seconds."),
        categories: s.array("The categories breakdown returned by WakaTime.", breakdownItemSchema),
        languages: s.array("The languages breakdown returned by WakaTime.", breakdownItemSchema),
        projects: s.array("The projects breakdown returned by WakaTime.", breakdownItemSchema),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_summaries",
    description: "Get WakaTime daily summaries for the authenticated user.",
    inputSchema: getSummariesInputSchema,
    outputSchema: s.object(
      "The WakaTime daily summaries result.",
      {
        summaries: s.array("The daily summaries returned by WakaTime.", summarySchema),
        cumulative_total: s.looseObject("The cumulative total returned for the summaries range.", {
          text: s.string("The human-readable cumulative duration."),
          decimal: s.string("The decimal cumulative duration string."),
          digital: s.string("The digital cumulative duration string."),
          seconds: s.number("The cumulative duration in seconds."),
        }),
        daily_average: s.looseObject("The daily average returned for the summaries range.", {
          seconds: s.number("The daily average coding time in seconds."),
          text: s.string("The human-readable daily average."),
        }),
        start: s.dateTime("The start timestamp returned for the summaries range."),
        end: s.dateTime("The end timestamp returned for the summaries range."),
      },
      { optional: ["cumulative_total", "daily_average", "start", "end"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_status_bar_today",
    description: "Get today's cached WakaTime status bar summary for the authenticated user.",
    inputSchema: s.actionInput({
      project: s.nonEmptyString("The WakaTime project name."),
      branches: s.nonEmptyString("A comma-separated list of branch names used to filter activity."),
      timeout: s.nonNegativeInteger("The keystroke timeout override in minutes."),
      writes_only: s.boolean("Whether to count only file write activity instead of all coding activity."),
      timezone: s.nonEmptyString("An Olson timezone string such as America/Los_Angeles."),
    }),
    outputSchema: s.object(
      "The WakaTime status bar today result.",
      {
        status_bar: summarySchema,
        cached_at: s.dateTime("When WakaTime calculated and cached this status bar response."),
        has_team_features: s.boolean("Whether the user has access to WakaTime team features."),
      },
      { required: ["status_bar"], optional: ["cached_at", "has_team_features"] },
    ),
  }),
];
