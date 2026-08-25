import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "open_exchange_rates";

const currencyCodeSchema = (description: string): JsonSchema =>
  s.string({
    description,
    minLength: 3,
    maxLength: 3,
    pattern: "^[A-Z]{3}$",
  });

const symbolsInputSchema = s.array(
  "List of target currency codes to include in the response.",
  currencyCodeSchema("Three-letter ISO currency code."),
  { minItems: 1 },
);

const currenciesInputSchema = s.object("Input parameters for retrieving supported Open Exchange Rates currencies.", {});

const currenciesOutputSchema = s.record(
  "Mapping of ISO currency codes to full currency names.",
  s.string("Currency name."),
);

const latestRatesInputSchema = s.object(
  "Input parameters for fetching the latest Open Exchange Rates exchange rates.",
  {
    base: currencyCodeSchema("Three-letter base currency code for the returned rates."),
    symbols: symbolsInputSchema,
    showAlternative: s.boolean("Whether to include alternative, black-market, and digital currency rates."),
  },
  { optional: ["base", "symbols", "showAlternative"] },
);

const ratesOutputSchema = s.looseRequiredObject("Open Exchange Rates exchange rate snapshot.", {
  disclaimer: s.nonEmptyString("Disclaimer text returned by Open Exchange Rates."),
  license: s.nonEmptyString("License URL returned by Open Exchange Rates."),
  timestamp: s.integer("Unix timestamp when the rates snapshot was generated."),
  base: s.nonEmptyString("Base currency used for the returned rates."),
  rates: s.record(
    "Mapping of currency codes to exchange rates for the selected base currency.",
    s.number("Exchange rate value."),
  ),
});

const historicalRatesInputSchema = s.object(
  "Input parameters for fetching historical Open Exchange Rates exchange rates.",
  {
    date: s.date("Historical date to request from Open Exchange Rates in YYYY-MM-DD format."),
    base: currencyCodeSchema("Three-letter base currency code for the returned rates."),
    symbols: symbolsInputSchema,
    showAlternative: s.boolean("Whether to include alternative, black-market, and digital currency rates."),
  },
  { optional: ["base", "symbols", "showAlternative"] },
);

const historicalRatesOutputSchema = s.looseRequiredObject("Open Exchange Rates historical exchange rate snapshot.", {
  disclaimer: s.nonEmptyString("Disclaimer text returned by Open Exchange Rates."),
  license: s.nonEmptyString("License URL returned by Open Exchange Rates."),
  timestamp: s.integer("Unix timestamp when the rates snapshot was generated."),
  historical: s.boolean("Whether the returned rates represent a historical snapshot."),
  base: s.nonEmptyString("Base currency used for the returned rates."),
  rates: s.record(
    "Mapping of currency codes to exchange rates for the selected base currency.",
    s.number("Exchange rate value."),
  ),
});

const timeseriesRatesInputSchema = s.object(
  "Input parameters for fetching Open Exchange Rates time-series exchange rates.",
  {
    startDate: s.date("Start date of the time-series range in YYYY-MM-DD format."),
    endDate: s.date("End date of the time-series range in YYYY-MM-DD format."),
    base: currencyCodeSchema("Three-letter base currency code for the returned rates."),
    symbols: symbolsInputSchema,
    showAlternative: s.boolean("Whether to include alternative, black-market, and digital currency rates."),
  },
  { optional: ["base", "symbols", "showAlternative"] },
);

const timeseriesRatesOutputSchema = s.looseRequiredObject("Open Exchange Rates time-series exchange rates.", {
  disclaimer: s.nonEmptyString("Disclaimer text returned by Open Exchange Rates."),
  license: s.nonEmptyString("License URL returned by Open Exchange Rates."),
  start_date: s.nonEmptyString("Start date of the returned time-series range."),
  end_date: s.nonEmptyString("End date of the returned time-series range."),
  base: s.nonEmptyString("Base currency used for the returned rates."),
  rates: s.record(
    "Mapping of YYYY-MM-DD dates to per-currency exchange rates.",
    s.record("Mapping of currency codes to exchange rates for one date.", s.number("Exchange rate value.")),
  ),
});

const convertCurrencyInputSchema = s.object(
  "Input parameters for converting an amount between currencies with Open Exchange Rates.",
  {
    amount: s.number("Amount to convert.", { exclusiveMinimum: 0 }),
    from: currencyCodeSchema("Source currency code for the conversion."),
    to: currencyCodeSchema("Target currency code for the conversion."),
  },
  { required: ["amount", "from", "to"] },
);

const convertCurrencyOutputSchema = s.looseRequiredObject(
  "Currency conversion result returned by Open Exchange Rates.",
  {
    disclaimer: s.nonEmptyString("Disclaimer text returned by Open Exchange Rates."),
    license: s.nonEmptyString("License URL returned by Open Exchange Rates."),
    request: s.looseRequiredObject("Conversion request echoed by Open Exchange Rates.", {
      query: s.nonEmptyString("Original conversion query."),
      amount: s.number("Amount used for the conversion."),
      from: s.nonEmptyString("Source currency code used for the conversion."),
      to: s.nonEmptyString("Target currency code used for the conversion."),
    }),
    meta: s.looseRequiredObject("Conversion metadata returned by Open Exchange Rates.", {
      timestamp: s.integer("Unix timestamp used for the conversion rate."),
      rate: s.number("Exchange rate used for the conversion."),
    }),
    response: s.number("Converted amount returned by Open Exchange Rates."),
  },
);

export const openExchangeRatesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_currencies",
    description: "Retrieve all currencies supported by Open Exchange Rates.",
    requiredScopes: [],
    inputSchema: currenciesInputSchema,
    outputSchema: currenciesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_latest_rates",
    description: "Retrieve the latest Open Exchange Rates exchange rates.",
    requiredScopes: [],
    inputSchema: latestRatesInputSchema,
    outputSchema: ratesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_historical_rates",
    description: "Retrieve historical Open Exchange Rates exchange rates for a specific date.",
    requiredScopes: [],
    inputSchema: historicalRatesInputSchema,
    outputSchema: historicalRatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_timeseries_rates",
    description: "Retrieve Open Exchange Rates exchange rates across a date range.",
    requiredScopes: [],
    inputSchema: timeseriesRatesInputSchema,
    outputSchema: timeseriesRatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "convert_currency",
    description: "Convert an amount between two currencies using Open Exchange Rates.",
    requiredScopes: [],
    inputSchema: convertCurrencyInputSchema,
    outputSchema: convertCurrencyOutputSchema,
  }),
];
