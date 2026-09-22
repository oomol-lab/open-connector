import type { ProviderDefinition } from "../../core/types.ts";

import { osvActions } from "./actions.ts";

const service = "osv";

/** OSV provider backed by the public OSV.dev API. */
export const provider: ProviderDefinition = {
  service,
  displayName: "OSV",
  description: "Query known vulnerabilities in open source packages and retrieve OSV advisory records.",
  categories: ["Security", "Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  homepageUrl: "https://osv.dev",
  actions: osvActions,
};
