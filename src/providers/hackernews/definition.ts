import type { ProviderDefinition } from "../../core/types.ts";

import { hackernewsActions } from "./actions.ts";

const service = "hackernews";

/**
 * Hacker News provider backed by the public Firebase and Algolia APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Hacker News",
  categories: ["Social"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  homepageUrl: "https://news.ycombinator.com",
  actions: hackernewsActions,
};
