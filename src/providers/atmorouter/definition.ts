import type { ProviderDefinition } from "../../core/types.ts";

import { atmorouterActions } from "./actions.ts";

/** AtmoRouter's OpenAI- and Anthropic-compatible model gateway. */
export const provider: ProviderDefinition = {
  service: "atmorouter",
  displayName: "AtmoRouter",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ar-...",
      description:
        "Create an API key in the dashboard at https://atmorouter.dev/dashboard. Requests use Bearer authentication; inference is billed per token, except for models AtmoRouter lists as free.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://atmorouter.dev",
  actions: atmorouterActions,
};
