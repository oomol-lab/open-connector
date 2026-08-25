import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wise";

const upstreamProfileSchema = s.looseObject("One Wise profile object returned by the Profiles API.");
const upstreamCurrencySchema = s.looseObject("One currency object returned by the Wise Currencies API.");
const upstreamRateSchema = s.looseObject("One rate object returned by the Wise Rates API.");
const optionalQueryStringSchema = (description: string) => s.string(description, { minLength: 1, pattern: "\\S" });

export const wiseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_profiles",
    description: "List Wise personal and business profiles available to the authenticated personal API token.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required.", {}),
    outputSchema: s.object("The list of Wise profiles available to the token.", {
      profiles: s.array("Wise profiles returned by the API.", upstreamProfileSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_currencies",
    description: "List currencies supported by Wise for transfers, including codes and names.",
    requiredScopes: [],
    inputSchema: s.object("No input parameters are required.", {}),
    outputSchema: s.object("The list of currencies supported by Wise.", {
      currencies: s.array("Currencies returned by the API.", upstreamCurrencySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_rates",
    description: "Retrieve current or historical Wise exchange rates.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Wise exchange rates.",
      {
        source: optionalQueryStringSchema("Source currency code."),
        target: optionalQueryStringSchema("Target currency code."),
        time: optionalQueryStringSchema("Timestamp for a specific historical exchange rate."),
        from: optionalQueryStringSchema("Period start date or timestamp for exchange rate history."),
        to: optionalQueryStringSchema("Period end date or timestamp for exchange rate history."),
        group: s.stringEnum("Interval for grouped exchange rate history.", ["day", "hour", "minute"]),
      },
      { optional: ["source", "target", "time", "from", "to", "group"] },
    ),
    outputSchema: s.object("The Wise exchange rates returned for the requested query.", {
      rates: s.array("Rate entries returned by the API.", upstreamRateSchema),
    }),
  }),
];
