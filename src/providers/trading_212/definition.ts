import type { ProviderDefinition } from "../../core/types.ts";

import { trading212Actions } from "./actions.ts";

const service = "trading_212";

/**
 * Trading 212 provider backed by the read-only part of the Trading 212 Public
 * API. One connection holds the key pair of one Invest or Stocks ISA account
 * in one environment, demo or live.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Trading 212",
  description:
    "Read your own Trading 212 Invest or Stocks ISA account: balances, open positions, pending and past orders, dividends, transactions, instruments and exchange hours. Read-only: it cannot place or cancel orders.",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Secret",
      placeholder: "TRADING212_API_SECRET",
      description:
        "The API Secret of a Trading 212 API key, shown once when the key is generated in Settings > API (Beta) of the Trading 212 app (https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key). The actions need only read permissions (account, portfolio, orders:read, history and metadata); leave orders:execute and pies:write off.",
      extraFields: [
        {
          key: "apiKeyId",
          label: "API Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "TRADING212_API_KEY",
          description: "The API Key generated together with the secret. Trading 212 uses it as the user name.",
        },
        {
          key: "environment",
          label: "Environment",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "demo",
          description:
            "demo for a key generated on a paper trading (practice) account, or live for a real-money account. A key only works in the environment it was generated in; try a demo key first.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.trading212.com",
  actions: trading212Actions,
};
