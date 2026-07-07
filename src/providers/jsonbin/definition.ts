import type { ProviderDefinition } from "../../core/types.ts";

import { jsonbinActions } from "./actions.ts";

const service = "jsonbin";

/**
 * JSONBin.io provider backed by the public JSONBin API v3.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "JSONBin.io",
  categories: ["Storage", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Master Key",
      placeholder: "JSONBIN_MASTER_KEY",
      description:
        "JSONBin.io master key sent with the X-Master-Key header. Open your JSONBin API Keys page to view or create keys: https://jsonbin.io/app/api-keys.",
    },
  ],
  homepageUrl: "https://jsonbin.io/",
  actions: jsonbinActions,
};
