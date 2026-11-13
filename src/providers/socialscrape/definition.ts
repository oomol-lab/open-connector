import type { ProviderDefinition } from "../../core/types.ts";

import { socialscrapeActions } from "./actions.ts";

const service = "socialscrape";

export const provider: ProviderDefinition = {
  service,
  displayName: "SocialScrape",
  description:
    "Read social media data in one shape: video transcripts, profiles and a profile's posts across TikTok, Instagram, YouTube, X, Threads, Bluesky and more.",
  categories: ["Social", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ss_live_...",
      description:
        "SocialScrape API key sent with the x-api-key header. Sign up at https://socialscrape.dev/sign-up and create a key in the dashboard under API keys.",
    },
  ],
  homepageUrl: "https://socialscrape.dev",
  actions: socialscrapeActions,
};
