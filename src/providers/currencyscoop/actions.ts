import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "currencyscoop";

const currencyCode = (description: string) => s.string({ description, minLength: 1, pattern: "^[A-Z0-9_]+$" });

const isoDate = (description: string) => s.string({ description, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

const metaSchema = s.object(
  {
    code: s.integer("HTTP-like status code reported by CurrencyBeacon."),
    disclaimer: s.string("Optional disclaimer text returned by CurrencyBeacon."),
  },
  { required: ["code"], optional: ["disclaimer"], description: "Metadata returned by CurrencyBeacon." },
);

const currencySchema = s.object(
  {
    id: s.integer("Internal numeric identifier for the currency."),
    code: s.string("Numeric or upstream currency code field returned by CurrencyBeacon."),
    shortCode: s.string("Short currency code such as USD or BTC."),
    name: s.string("Display name of the currency."),
    precision: s.integer("Number of decimal places used by the currency."),
    subunit: s.integer("Number of subunits in one main unit."),
    symbol: s.string("Primary currency symbol."),
    symbolFirst: s.boolean("Whether the symbol is rendered before the amount."),
    decimalMark: s.string("Character used as the decimal separator."),
    thousandsSeparator: s.string("Character used as the thousands separator."),
    countries: s.array(s.string("One country associated with the currency."), {
      description: "Countries associated with the currency.",
    }),
  },
  {
    required: ["id", "code", "shortCode", "name"],
    optional: ["precision", "subunit", "symbol", "symbolFirst", "decimalMark", "thousandsSeparator", "countries"],
    description: "A supported currency returned by CurrencyBeacon.",
  },
);

const ratesSchema = s.record("Mapping of currency codes to exchange rates.", s.number("Exchange rate value."));
const ratesByDateSchema = s.record(
  "Mapping of YYYY-MM-DD dates to per-currency exchange rates.",
  s.record(s.number("Exchange rate value.")),
);

const symbolsSchema = s.array(currencyCode("A supported target currency code."), {
  minItems: 1,
  description: "List of target currency codes to include in the response.",
});

const ratesOutputSchema = s.object(
  {
    meta: metaSchema,
    base: s.nonEmptyString("Base currency used for the returned rates."),
    date: s.nonEmptyString("Upstream date or datetime string associated with the returned rates."),
    rates: ratesSchema,
  },
  { required: ["meta", "base", "date", "rates"], description: "Exchange rate snapshot returned by CurrencyBeacon." },
);

export const currencyscoopActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_currencies",
    description: "Retrieve the supported currencies exposed by CurrencyBeacon.",
    inputSchema: s.object({}, { description: "Input parameters for retrieving supported currencies." }),
    outputSchema: s.object(
      {
        meta: metaSchema,
        currencies: s.array(currencySchema, { description: "Supported currencies returned by CurrencyBeacon." }),
      },
      { required: ["meta", "currencies"], description: "Supported currencies from CurrencyBeacon." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_latest_rates",
    description: "Retrieve the latest exchange rates for a base currency from CurrencyBeacon.",
    inputSchema: s.object(
      {
        base: currencyCode("Base currency code for the requested exchange rates."),
        symbols: symbolsSchema,
      },
      { optional: ["base", "symbols"], description: "Input parameters for retrieving the latest exchange rates." },
    ),
    outputSchema: ratesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_historical_rates",
    description: "Retrieve historical exchange rates for a specific date from CurrencyBeacon.",
    inputSchema: s.object(
      {
        base: currencyCode("Base currency code for the historical exchange rates."),
        date: isoDate("Historical date in YYYY-MM-DD format."),
        symbols: symbolsSchema,
      },
      {
        required: ["date"],
        optional: ["base", "symbols"],
        description: "Input parameters for retrieving historical exchange rates.",
      },
    ),
    outputSchema: ratesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_timeseries_rates",
    description: "Retrieve exchange rates across a date range from CurrencyBeacon.",
    inputSchema: s.object(
      {
        base: currencyCode("Base currency code for the timeseries exchange rates."),
        startDate: isoDate("Start date of the timeseries range in YYYY-MM-DD format."),
        endDate: isoDate("End date of the timeseries range in YYYY-MM-DD format."),
        symbols: symbolsSchema,
      },
      {
        required: ["startDate", "endDate"],
        optional: ["base", "symbols"],
        description: "Input parameters for retrieving timeseries exchange rates.",
      },
    ),
    outputSchema: s.object(
      {
        meta: metaSchema,
        base: s.nonEmptyString("Base currency used for the returned timeseries rates."),
        startDate: s.nonEmptyString("Start date of the returned timeseries range."),
        endDate: s.nonEmptyString("End date of the returned timeseries range."),
        ratesByDate: ratesByDateSchema,
      },
      {
        required: ["meta", "base", "startDate", "endDate", "ratesByDate"],
        description: "Timeseries exchange rates returned by CurrencyBeacon.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "convert_currency",
    description: "Convert an amount between two currencies using CurrencyBeacon exchange rates.",
    inputSchema: s.object(
      {
        from: currencyCode("Source currency code for the conversion."),
        to: currencyCode("Target currency code for the conversion."),
        amount: s.number({ exclusiveMinimum: 0, description: "Positive amount to convert." }),
        date: isoDate("Optional historical date in YYYY-MM-DD format for historical conversion."),
      },
      {
        required: ["from", "to", "amount"],
        optional: ["date"],
        description: "Input parameters for converting an amount between two currencies.",
      },
    ),
    outputSchema: s.object(
      {
        meta: metaSchema,
        timestamp: s.integer("Unix timestamp reported by CurrencyBeacon for the conversion."),
        date: s.nonEmptyString("Date associated with the conversion result."),
        from: s.nonEmptyString("Source currency code used for the conversion."),
        to: s.nonEmptyString("Target currency code used for the conversion."),
        amount: s.number("Amount used for the conversion."),
        value: s.number("Converted value returned by CurrencyBeacon."),
      },
      {
        required: ["meta", "timestamp", "date", "from", "to", "amount", "value"],
        description: "Currency conversion result returned by CurrencyBeacon.",
      },
    ),
  }),
];
