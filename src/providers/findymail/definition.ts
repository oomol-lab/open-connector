import type { ProviderDefinition } from "../../core/types.ts";

import { findymailActions } from "./actions.ts";

const service = "findymail";

/**
 * Findymail provider backed by the Findymail REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Findymail",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "findymail_api_key",
      description:
        "Findymail API key used as a Bearer token. Create or copy it from the Findymail API dashboard: https://app.findymail.com/docs/.",
    },
  ],
  homepageUrl: "https://www.findymail.com/",
  actions: findymailActions,
};
