import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nasdaq";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const datatableCodeSchema = nonEmptyString("The datatable code in VENDOR/TABLE format, such as SHARADAR/SF1.");
const datatableScalarSchema = s.union(
  [s.string("A string value."), s.number("A numeric value."), s.boolean("A boolean value."), { type: "null" }],
  { description: "A scalar value returned by the datatable." },
);
const datatableRowSchema = s.record("A datatable row mapped into a key-value object.", datatableScalarSchema);

const datatableColumnSchema = s.requiredObject("A datatable column definition.", {
  name: nonEmptyString("The name of the datatable column."),
  type: nonEmptyString("The data type of the datatable column."),
});

const datatableQueryResultSchema = s.requiredObject("A normalized Nasdaq datatable query result.", {
  columns: s.array("The column definitions returned by Nasdaq.", datatableColumnSchema),
  rows: s.array("The row objects returned for the datatable query.", datatableRowSchema),
  nextCursorId: s.nullableString("The cursor ID to request the next page of datatable rows."),
});

const metadataStatusSchema = s.requiredObject("Refresh status information for the datatable.", {
  status: s.nullableString("The current refresh status for the datatable when Nasdaq provides it."),
  expectedAt: s.nullableString("The expected time of the next refresh when Nasdaq provides it."),
  refreshedAt: s.nullableString("The timestamp when the datatable was last refreshed."),
  updateFrequency: s.nullableString("The update cadence reported by Nasdaq for the datatable."),
});

const metadataDataVersionSchema = s.requiredObject("The Nasdaq data-version metadata.", {
  code: nonEmptyString("The Nasdaq data-version code for the datatable."),
  default: s.boolean("Whether this data version is the default version."),
  description: s.nullableString("The description of the data version when Nasdaq provides it."),
});

const datatableMetadataOutputSchema = s.requiredObject("Normalized metadata for a Nasdaq datatable.", {
  vendorCode: nonEmptyString("The vendor code portion of the datatable identifier."),
  datatableCode: nonEmptyString("The Nasdaq table code portion of the datatable identifier."),
  name: nonEmptyString("The human-readable datatable name."),
  description: s.nullableString("The datatable description when Nasdaq provides it."),
  columns: s.array("The available datatable columns.", datatableColumnSchema),
  filters: s.stringArray("The filterable column names for the datatable."),
  primaryKey: s.stringArray("The primary-key columns for the datatable."),
  premium: s.boolean("Whether the datatable requires premium access."),
  status: metadataStatusSchema,
  dataVersion: s.nullable(metadataDataVersionSchema),
});

const bulkDownloadOutputSchema = s.requiredObject("The Nasdaq bulk export request result.", {
  file: s.requiredObject("The bulk export file information.", {
    link: s.nullableString("The temporary download URL for the zipped bulk export file."),
    status: nonEmptyString("The current generation status of the bulk export file."),
    dataSnapshotTime: s.nullableString("The snapshot timestamp associated with the generated export."),
  }),
  datatable: s.nullable(
    s.requiredObject("The datatable refresh metadata for the export.", {
      lastRefreshedTime: s.nullableString("The last refresh timestamp reported for the datatable."),
    }),
  ),
});

const quoteRecordSchema = s.requiredObject("A normalized QuoteMedia end-of-day price record.", {
  ticker: nonEmptyString("The ticker symbol."),
  date: nonEmptyString("The trading date in YYYY-MM-DD format."),
  open: s.nullableNumber("The opening price for the trading day."),
  high: s.nullableNumber("The highest price for the trading day."),
  low: s.nullableNumber("The lowest price for the trading day."),
  close: s.nullableNumber("The closing price for the trading day."),
  volume: s.nullableNumber("The total trading volume for the day."),
  dividend: s.nullableNumber("The dividend amount for the day, if any."),
  split: s.nullableNumber("The split ratio for the day, if any."),
});

const quoteOutputSchema = s.requiredObject("The end-of-day quote response.", {
  quotes: s.array("The returned quote rows.", quoteRecordSchema),
  nextCursorId: s.nullableString("The cursor ID to request the next page of quote rows."),
});

const datatableCodeInputSchema = s.requiredObject("The input payload for this action.", {
  datatableCode: datatableCodeSchema,
});

const columnsSchema = s.stringArray("The selected columns to include in the datatable response.", {
  itemDescription: "A column name to include in the response.",
});

const tableRowInputSchema = {
  ...s.object(
    "The input payload for this action.",
    {
      datatableCode: nonEmptyString(
        "The full datatable code in VENDOR/TABLE format. Use this or vendorCode + tableCode.",
      ),
      vendorCode: nonEmptyString("The vendor code when the datatable is provided as separate vendor and table codes."),
      tableCode: nonEmptyString("The table code when the datatable is provided as separate vendor and table codes."),
      filterColumnName: nonEmptyString("The column name used as the datatable filter."),
      filterColumnValue: nonEmptyString("The value used for the datatable filter."),
      columns: columnsSchema,
      perPage: s.positiveInteger("The number of rows to request per page."),
      cursorId: nonEmptyString("The cursor ID used to fetch the next page."),
    },
    { optional: ["datatableCode", "vendorCode", "tableCode", "columns", "perPage", "cursorId"] },
  ),
  anyOf: [{ required: ["datatableCode"] }, { required: ["vendorCode", "tableCode"] }],
} satisfies JsonSchema;

const dividendHistoryInputSchema = s.object(
  "The input payload for this action.",
  {
    ticker: nonEmptyString("The stock ticker symbol, such as AAPL."),
    date: nonEmptyString("An optional datekey filter in YYYY-MM-DD format applied to the SF1 table."),
    columns: columnsSchema,
    perPage: s.positiveInteger("The number of rows to request per page."),
    cursorId: nonEmptyString("The cursor ID used to fetch the next page."),
  },
  { optional: ["date", "columns", "perPage", "cursorId"] },
);

const analystRatingsInputSchema = s.requiredObject("The input payload for this action.", {
  symbol: nonEmptyString("The stock ticker symbol, such as AAPL."),
});

const quoteInputSchema = s.object(
  "The input payload for this action.",
  {
    ticker: nonEmptyString("The stock ticker symbol, such as AAPL."),
    dateGte: nonEmptyString("The inclusive lower-bound date filter in YYYY-MM-DD format."),
    dateLte: nonEmptyString("The inclusive upper-bound date filter in YYYY-MM-DD format."),
    perPage: s.positiveInteger("The number of rows to request per page."),
    cursorId: nonEmptyString("The cursor ID used to fetch the next page."),
  },
  { optional: ["dateGte", "dateLte", "perPage", "cursorId"] },
);

export const nasdaqActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_datatable_metadata",
    description: "Retrieve schema, filter, refresh, and premium metadata for a Nasdaq Data Link datatable.",
    inputSchema: datatableCodeInputSchema,
    outputSchema: datatableMetadataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_datatable",
    description:
      "Request a bulk export for a Nasdaq Data Link datatable and return the current file status plus download link when available.",
    inputSchema: datatableCodeInputSchema,
    outputSchema: bulkDownloadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_table_row",
    description:
      "Query a Nasdaq Data Link datatable with a single filter column and normalize the returned rows into key-value objects.",
    inputSchema: tableRowInputSchema,
    outputSchema: datatableQueryResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_dividend_history",
    description: "Retrieve quarterly dividend fundamentals for a ticker from SHARADAR/SF1 using the ARQ dimension.",
    inputSchema: dividendHistoryInputSchema,
    outputSchema: datatableQueryResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_analyst_ratings",
    description:
      "Retrieve analyst recommendation and target-price history for a stock symbol from the ZACKS analyst datatables.",
    inputSchema: analystRatingsInputSchema,
    outputSchema: s.requiredObject("The analyst ratings and target-price result.", {
      analystRatings: datatableQueryResultSchema,
      targetPrices: datatableQueryResultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_end_of_day_quote",
    description: "Retrieve QuoteMedia end-of-day price rows for a ticker, optionally filtered by a date range.",
    inputSchema: quoteInputSchema,
    outputSchema: quoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_real_time_quote",
    description:
      "Compatibility alias of get_end_of_day_quote. Returns QuoteMedia end-of-day price rows rather than live real-time quotes.",
    inputSchema: quoteInputSchema,
    outputSchema: quoteOutputSchema,
  }),
];
