import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";

/**
 * InternetData IP data API, keyless and unmetered.
 */
export const provider: ProviderDefinition = {
  service: "internetdata",
  displayName: "InternetData",
  categories: ["Location", "Security", "Data"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  homepageUrl: "https://internetdata.io",
  actions,
};
