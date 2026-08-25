import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "currencyapi";

const currencyCodeSchema = s.stringPattern("^[A-Z0-9]{3,10}$", {
  description: "Currency code using uppercase ASCII letters or digits.",
});
const currencyListSchema = s.array("List of currency codes to include in the response.", currencyCodeSchema, {
  minItems: 1,
});
const isoDateSchema = s.stringPattern("^\\d{4}-\\d{2}-\\d{2}$", {
  description: "Date in YYYY-MM-DD format.",
});
const currencyTypeSchema = s.stringEnum("Currency type filter. Supported values are fiat, metal, or crypto.", [
  "fiat",
  "metal",
  "crypto",
]);
const quotaBucketSchema = s.object(
  {
    total: s.integer("Total quota available in the current bucket."),
    used: s.integer("Quota already consumed in the current bucket."),
    remaining: s.integer("Quota still available in the current bucket."),
  },
  { required: ["total", "used", "remaining"], description: "Usage quota bucket." },
);
const currencyMetadataSchema = s.object(
  {
    symbol: s.nonEmptyString("Currency symbol returned by currencyapi."),
    name: s.nonEmptyString("Currency display name."),
    symbol_native: s.nonEmptyString("Native currency symbol."),
    decimal_digits: s.integer("Number of decimal digits used by the currency."),
    rounding: s.number("Currency rounding precision value."),
    code: currencyCodeSchema,
    name_plural: s.nonEmptyString("Plural display name for the currency."),
    type: currencyTypeSchema,
    countries: s.array(
      "List of ISO country codes associated with the currency.",
      s.nonEmptyString("ISO country code that uses the currency."),
    ),
  },
  {
    required: [
      "symbol",
      "name",
      "symbol_native",
      "decimal_digits",
      "rounding",
      "code",
      "name_plural",
      "type",
      "countries",
    ],
    description: "Currency metadata returned by currencyapi.",
  },
);
const exchangeRateSchema = s.object(
  {
    code: currencyCodeSchema,
    value: s.number("Exchange rate or converted value returned by currencyapi."),
  },
  { required: ["code", "value"], description: "Exchange rate entry returned by currencyapi." },
);
const ratesOutputSchema = s.object(
  {
    meta: s.object(
      { last_updated_at: s.nonEmptyString("Timestamp indicating when the dataset was last updated.") },
      { required: ["last_updated_at"], description: "Response metadata returned by currencyapi." },
    ),
    data: s.record("Mapping of currency codes to exchange rate entries.", exchangeRateSchema),
  },
  { required: ["meta", "data"], description: "Exchange rate payload returned by currencyapi." },
);

export const currencyapiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_status",
    description: "Retrieve current currencyapi account quota usage.",
    inputSchema: s.object({}, { description: "Input parameters for retrieving current currencyapi quota usage." }),
    outputSchema: s.object(
      {
        account_id: s.integer("currencyapi account identifier."),
        quotas: s.object(
          {
            month: quotaBucketSchema,
            grace: quotaBucketSchema,
          },
          { required: ["month", "grace"], description: "Quota usage information returned by currencyapi." },
        ),
      },
      { required: ["account_id", "quotas"], description: "currencyapi account quota status." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_supported_currencies",
    description: "Retrieve supported currency metadata from currencyapi.",
    inputSchema: s.object(
      {
        currencies: currencyListSchema,
        type: currencyTypeSchema,
      },
      {
        optional: ["currencies", "type"],
        description: "Input parameters for retrieving supported currencies from currencyapi.",
      },
    ),
    outputSchema: s.object(
      { data: s.record("Mapping of currency codes to currency metadata.", currencyMetadataSchema) },
      { required: ["data"], description: "Supported currencies returned by currencyapi." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_latest_rates",
    description: "Retrieve the latest exchange rates from currencyapi.",
    inputSchema: s.object(
      {
        base_currency: currencyCodeSchema,
        currencies: currencyListSchema,
        type: currencyTypeSchema,
      },
      {
        optional: ["base_currency", "currencies", "type"],
        description: "Input parameters for retrieving latest exchange rates from currencyapi.",
      },
    ),
    outputSchema: ratesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_historical_rates",
    description: "Retrieve historical exchange rates for a specific date from currencyapi.",
    inputSchema: s.object(
      {
        date: isoDateSchema,
        base_currency: currencyCodeSchema,
        currencies: currencyListSchema,
        type: currencyTypeSchema,
      },
      {
        required: ["date"],
        optional: ["base_currency", "currencies", "type"],
        description: "Input parameters for retrieving historical exchange rates from currencyapi.",
      },
    ),
    outputSchema: ratesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "convert_currency",
    description: "Convert a monetary amount into one or more currencies with currencyapi.",
    inputSchema: s.object(
      {
        value: s.number({ exclusiveMinimum: 0, description: "Numeric amount to convert from the base currency." }),
        date: isoDateSchema,
        base_currency: currencyCodeSchema,
        currencies: currencyListSchema,
        type: currencyTypeSchema,
      },
      {
        required: ["value"],
        optional: ["date", "base_currency", "currencies", "type"],
        description: "Input parameters for converting a monetary amount with currencyapi.",
      },
    ),
    outputSchema: ratesOutputSchema,
  }),
];
