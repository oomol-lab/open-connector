import type { ProviderDefinition } from "../../core/types.ts";

import { appledbActions } from "./actions.ts";

const service = "appledb";

/**
 * AppleDB provider backed by its community-maintained public data API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "AppleDB",
  description: "Community-maintained Apple device, operating system, firmware, and signing data.",
  categories: ["Developer Tools", "Data"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  homepageUrl: "https://appledb.dev",
  actions: appledbActions,
};
