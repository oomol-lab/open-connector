import type { ProviderDefinition } from "../../core/types.ts";

import { deckCoActions } from "./actions.ts";

const service = "deck_co";

export const provider: ProviderDefinition = {
  service,
  displayName: "Deck.co",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Key",
      placeholder: "sk_live_...",
      description:
        "Deck.co v2 secret key sent as a Bearer token. Create or view API keys from the Deck.co dashboard API keys page: https://app.deck.co/api-keys.",
    },
  ],
  homepageUrl: "https://www.deck.co",
  actions: deckCoActions,
};
