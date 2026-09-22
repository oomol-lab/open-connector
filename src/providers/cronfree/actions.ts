import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cronfree";

const scheduleInputSchema = s.requiredObject("The recurring Cronfree schedule to create.", {
  hookUrl: s.url("The HTTPS webhook URL Cronfree should call on the selected schedule."),
  weekdays: s.array(
    "The weekdays to run on, using -1 for every day or 0 through 6 for Sunday through Saturday.",
    s.stringEnum("One Cronfree weekday value.", ["-1", "0", "1", "2", "3", "4", "5", "6"]),
    { minItems: 1 },
  ),
  months: s.array(
    "The months to run in, using -1 for every month or 1 through 12 for January through December.",
    s.stringEnum("One Cronfree month value.", ["-1", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]),
    { minItems: 1 },
  ),
  monthDays: s.array(
    "The days of the month to run on, using -1 for every day or 1 through 31.",
    s.stringEnum("One Cronfree day-of-month value.", [
      "-1",
      ...Array.from({ length: 31 }, (_, index) => String(index + 1)),
    ]),
    { minItems: 1 },
  ),
  hours: s.array(
    "The hours to run at, using -1 for every hour or 0 through 23.",
    s.stringEnum("One Cronfree hour value.", ["-1", ...Array.from({ length: 24 }, (_, index) => String(index))]),
    { minItems: 1 },
  ),
  minutes: s.array(
    "The minutes to run at, using -1 for every minute or 0 through 59.",
    s.stringEnum("One Cronfree minute value.", ["-1", ...Array.from({ length: 60 }, (_, index) => String(index))]),
    { minItems: 1 },
  ),
  timezone: s.nonEmptyString("The IANA timezone used to interpret the schedule."),
});

const resultSchema = s.requiredObject("The Cronfree scheduling API response.", {
  result: s.unknown("The raw JSON payload returned by Cronfree."),
});

export const cronfreeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_schedule",
    operationType: "write",
    description: "Create a recurring Cronfree schedule that sends POST requests to a webhook URL.",
    inputSchema: scheduleInputSchema,
    outputSchema: resultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_schedule",
    operationType: "destructive",
    description: "Delete the Cronfree schedule associated with a webhook URL.",
    inputSchema: s.requiredObject("The Cronfree schedule to delete.", {
      hookUrl: s.url("The webhook URL whose Cronfree schedule should be deleted."),
    }),
    outputSchema: resultSchema,
  }),
];
