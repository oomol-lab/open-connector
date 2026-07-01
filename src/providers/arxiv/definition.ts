import type { ProviderDefinition } from "../../core/types.ts";

import { arxivActions } from "./actions.ts";

const service = "arxiv";

export const provider: ProviderDefinition = {
  service,
  displayName: "arXiv",
  categories: ["Data"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  homepageUrl: "https://arxiv.org/",
  actions: arxivActions,
};
