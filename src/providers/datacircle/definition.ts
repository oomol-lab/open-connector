import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "datacircle",
  displayName: "Datacircle",
  description: "Find the best GTM APIs. We benchmark all the GTM APIs and we put the results on our website.",
  categories: ["Data"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  homepageUrl: "https://datacircle.dev",
  actions,
};
