import type { ProviderDefinition } from "../../core/types.ts";

import { boxheroActions } from "./actions.ts";

const service = "boxhero";

export const provider: ProviderDefinition = {
  service,
  displayName: "BoxHero",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "BOXHERO_API_TOKEN",
      description:
        "BoxHero API token sent with the Authorization Bearer header. Generate it from Settings > Integrations in the BoxHero web app.",
    },
  ],
  homepageUrl: "https://www.boxhero-app.com",
  actions: boxheroActions,
};
