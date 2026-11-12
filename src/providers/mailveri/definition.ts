import type { ProviderDefinition } from "../../core/types.ts";

import { mailveriActions } from "./actions.ts";

const service = "mailveri";

/**
 * MailVeri provider backed by the public MailVeri email verification API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "MailVeri",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MAILVERI_API_KEY",
      description:
        "MailVeri API key sent as a Bearer token in the Authorization header. Create or copy it from the MailVeri dashboard: https://app.mailveri.com/api-keys/",
    },
  ],
  homepageUrl: "https://mailveri.com/",
  actions: mailveriActions,
};
