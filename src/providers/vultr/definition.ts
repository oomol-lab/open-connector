import type { ProviderDefinition } from "../../core/types.ts";

import { vultrActions } from "./actions.ts";

const service = "vultr";

/**
 * Vultr provider backed by the public Vultr API v2.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Vultr",
  description: "Provision and inspect Vultr cloud instances, infrastructure options, firewalls, snapshots, and DNS.",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "VULTR_API_KEY",
      description:
        "Vultr API key sent as a Bearer token. Create a key in the Vultr customer portal under Account > API, and restrict it to the runtime's public IP when possible: https://my.vultr.com/settings/#settingsapi",
    },
  ],
  homepageUrl: "https://www.vultr.com/",
  actions: vultrActions,
};
