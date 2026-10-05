import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fxmacrodata";

const currency = s.string("Three-letter currency code, such as usd, eur, gbp or jpy. Case-insensitive.", {
  pattern: "^[A-Za-z]{3}$",
});
const indicator = s.string(
  "Indicator slug, such as inflation, policy_rate, unemployment or gdp. get_data_catalogue lists every slug served for a currency.",
  { pattern: "^[a-z0-9_]+$" },
);
const startDate = s.date("Earliest date to return, as YYYY-MM-DD.");
const endDate = s.date("Latest date to return, as YYYY-MM-DD.");
const limit = s.positiveInteger("Maximum number of rows to return. Defaults to 20; at most 100.", {
  maximum: 100,
  default: 20,
});
const offset = s.nonNegativeInteger("Number of rows to skip. Use pagination.next_offset to read the next page.", {
  default: 0,
});
const pagination = s.looseObject("Page information. Continue with next_offset while has_more is true.", {
  limit: s.nullableInteger("The requested page size."),
  offset: s.nullableInteger("Number of rows skipped."),
  returned_count: s.nullableInteger("Number of rows in this page."),
  total_count: s.nullableInteger("Total rows in the requested date window."),
  has_more: s.nullableBoolean("Whether another page is available."),
  next_offset: s.nullableInteger("Offset for the next page, or null when there are no more rows."),
});

const announcementRow = s.looseObject("One official release.", {
  date: s.string("The reference period the value describes, as YYYY-MM-DD."),
  val: s.nullableNumber("The released value."),
  announcement_datetime: s.nullableInteger("When the publisher released the value, as Unix seconds."),
  source: s.string("The publisher of the value."),
  source_url: s.string("The publisher page the value was read from."),
});

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

export const fxmacrodataActions: ActionDefinition[] = [
  action(
    "get_announcements",
    "Get the official release history of one macroeconomic indicator for a currency, such as US CPI or the ECB deposit rate. Each row carries the reference period, the value and the time the publisher released it. USD works without an API key, with releases from the last 15 minutes held back until a key is connected.",
    s.actionInput(
      { currency, indicator, startDate, endDate, limit, offset },
      ["currency", "indicator"],
      "The currency, indicator, optional date window and pagination.",
    ),
    s.looseObject("The release history of the indicator.", {
      currency: s.string("The currency code."),
      indicator: s.string("The indicator slug."),
      name: s.string("The indicator name."),
      data: s.array("Releases, newest first.", announcementRow),
      pagination,
    }),
  ),
  action(
    "get_latest_announcements",
    "Get the most recent official release of every indicator for a currency in one call. USD works without an API key.",
    s.actionInput({ currency }, ["currency"], "The currency to read."),
    s.looseObject("The latest release per indicator.", {
      currency: s.string("The currency code."),
      count: s.integer("Number of indicators returned."),
      data: s.array("One latest release per indicator.", s.unknownObject("The latest release of one indicator.")),
    }),
  ),
  action(
    "get_release_calendar",
    "Get scheduled official release times for a currency, such as the next CPI, payrolls or central bank decision. The USD calendar works without an API key.",
    s.actionInput(
      { currency, indicator, startDate, endDate },
      ["currency"],
      "The currency and optional indicator and date window.",
    ),
    s.looseObject("Scheduled releases.", {
      currency: s.string("The currency code."),
      timezone: s.string("The publisher's local timezone."),
      data: s.array(
        "Scheduled releases in time order.",
        s.looseObject("One scheduled release.", {
          release: s.string("The indicator slug being released."),
          name: s.string("The release name."),
          announcement_datetime: s.integer("Scheduled release time as Unix seconds."),
          announcement_datetime_utc: s.string("Scheduled release time in UTC, ISO 8601."),
        }),
      ),
    }),
  ),
  action(
    "get_data_catalogue",
    "List the indicators served for a currency, keyed by indicator slug, with name, unit, frequency, publisher and coverage. Works without an API key.",
    s.actionInput({ currency }, ["currency"], "The currency to list."),
    s.unknownObject("Indicator metadata keyed by indicator slug."),
  ),
  action(
    "get_forex",
    "Get daily FX spot rates for a currency pair, such as EUR/USD. Requires an API key.",
    s.actionInput(
      {
        base: s.describe(currency, "Base currency code, such as eur."),
        quote: s.describe(currency, "Quote currency code, such as usd."),
        startDate,
        endDate,
        limit,
        offset,
      },
      ["base", "quote"],
      "The currency pair, optional date window and pagination.",
    ),
    s.looseObject("Daily rates for the pair.", {
      data: s.array("Daily rates.", s.unknownObject("One daily rate.")),
      pagination,
    }),
  ),
  action(
    "get_cot",
    "Get weekly CFTC Commitments of Traders positioning for a currency's futures. Requires an API key.",
    s.actionInput(
      { currency, startDate, endDate, limit, offset },
      ["currency"],
      "The currency, optional date window and pagination.",
    ),
    s.looseObject("Weekly positioning reports.", {
      data: s.array("Weekly reports.", s.unknownObject("One weekly report.")),
      pagination,
    }),
  ),
];
