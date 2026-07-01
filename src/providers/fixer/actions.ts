import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fixer";

const noInputSchema = s.object("Input parameters for retrieving all supported Fixer currency symbols.", {});
const currencyCodeSchema = (description: string) =>
  s.string(description, {
    minLength: 3,
    maxLength: 3,
    pattern: "^[A-Z]{3}$",
  });

const currencySymbolsOutputSchema = s.looseRequiredObject("Supported Fixer currency symbols.", {
  success: s.boolean("Whether the Fixer request completed successfully."),
  symbols: s.record(s.string("Currency name."), {
    description: "Mapping of ISO currency codes to full currency names.",
  }),
});

const requestedSymbolsSchema = s.array(
  "List of target currency codes to include in the Fixer response.",
  currencyCodeSchema("A three-letter ISO currency code used to limit the response."),
  { minItems: 1 },
);

const latestRatesInputSchema = s.object(
  "Input parameters for fetching the latest Fixer exchange rates.",
  {
    base: currencyCodeSchema("Three-letter base currency code for the returned rates."),
    symbols: requestedSymbolsSchema,
  },
  { optional: ["base", "symbols"] },
);

const ratesOutputSchema = s.looseRequiredObject("Fixer latest rates response.", {
  success: s.boolean("Whether the Fixer request completed successfully."),
  timestamp: s.integer("Unix timestamp when the rates snapshot was generated."),
  base: s.string("Base currency used for the returned rates.", { minLength: 1 }),
  date: s.string("Date of the returned exchange rates in YYYY-MM-DD format.", { minLength: 1 }),
  rates: s.record(s.number("Exchange rate value."), {
    description: "Mapping of currency codes to exchange rates for the selected base currency.",
  }),
});

const historicalRatesInputSchema = s.object(
  "Input parameters for fetching historical Fixer exchange rates.",
  {
    date: s.date("Historical date to request from Fixer in YYYY-MM-DD format."),
    base: currencyCodeSchema("Three-letter base currency code for the returned rates."),
    symbols: requestedSymbolsSchema,
  },
  { optional: ["base", "symbols"] },
);

const historicalRatesOutputSchema = s.looseRequiredObject("Fixer historical rates response.", {
  success: s.boolean("Whether the Fixer request completed successfully."),
  historical: s.boolean("Whether the returned rates represent a historical snapshot."),
  timestamp: s.integer("Unix timestamp when the rates snapshot was generated."),
  base: s.string("Base currency used for the returned rates.", { minLength: 1 }),
  date: s.string("Date of the returned exchange rates in YYYY-MM-DD format.", { minLength: 1 }),
  rates: s.record(s.number("Exchange rate value."), {
    description: "Mapping of currency codes to exchange rates for the selected base currency.",
  }),
});

export const fixerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_supported_symbols",
    description: "Retrieve all supported Fixer currency symbols and their full names.",
    inputSchema: noInputSchema,
    outputSchema: currencySymbolsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_latest_rates",
    description: "Retrieve the latest Fixer exchange rates for all or selected currencies.",
    inputSchema: latestRatesInputSchema,
    outputSchema: ratesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_historical_rates",
    description: "Retrieve historical Fixer exchange rates for a specific date.",
    inputSchema: historicalRatesInputSchema,
    outputSchema: historicalRatesOutputSchema,
  }),
];

export type FixerActionName = "get_supported_symbols" | "get_latest_rates" | "get_historical_rates";
