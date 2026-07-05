import type { ProviderDefinition } from "../../core/types.ts";

import { flyActions } from "./actions.ts";

const service = "fly";

export const provider: ProviderDefinition = {
  service,
  displayName: "Fly.io",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Fly API Token",
      placeholder: "Fly API token",
      description:
        "Fly.io API token sent as a Bearer token to the Machines API. Generate a token with flyctl as described in the official Machines API guide: https://fly.io/docs/machines/api/working-with-machines-api/",
      extraFields: [],
    },
  ],
  homepageUrl: "https://fly.io/",
  actions: flyActions,
};
